use anyhow::Result;
use log::{debug, info};
use std::collections::VecDeque;
use super::audio_processing::resample_audio;

/// Represents a complete speech segment detected by VAD
#[derive(Debug, Clone)]
pub struct SpeechSegment {
    pub samples: Vec<f32>,
    pub start_timestamp_ms: f64,
    pub end_timestamp_ms: f64,
    pub confidence: f32,
}

/// Processes audio in 30ms chunks but returns complete speech segments
pub struct ContinuousVadProcessor {
    chunk_size: usize,
    input_sample_rate: u32,
    vad_sample_rate: u32,
    buffer: Vec<f32>,
    speech_segments: VecDeque<SpeechSegment>,
    current_speech: Vec<f32>,
    in_speech: bool,
    silence_samples: usize,
    redemption_samples: usize,
    min_speech_samples: usize,
    start_threshold: f32,
    stop_threshold: f32,
    processed_samples: usize,
    speech_start_sample: usize,
    last_logged_state: bool,
}

impl ContinuousVadProcessor {
    pub fn new(input_sample_rate: u32, redemption_time_ms: u32) -> Result<Self> {
        const VAD_SAMPLE_RATE: u32 = 16000;
        let vad_chunk_size = (VAD_SAMPLE_RATE as f32 * 0.03) as usize;
        let redemption_samples = (redemption_time_ms as usize * VAD_SAMPLE_RATE as usize) / 1000;
        let min_speech_samples = (250usize * VAD_SAMPLE_RATE as usize) / 1000;

        info!("VAD processor created: input={}Hz, vad={}Hz, chunk_size={} samples",
              input_sample_rate, VAD_SAMPLE_RATE, vad_chunk_size);

        Ok(Self {
            chunk_size: vad_chunk_size,
            input_sample_rate,
            vad_sample_rate: VAD_SAMPLE_RATE,
            buffer: Vec::with_capacity(vad_chunk_size * 2),
            speech_segments: VecDeque::new(),
            current_speech: Vec::new(),
            in_speech: false,
            silence_samples: 0,
            redemption_samples,
            min_speech_samples,
            start_threshold: 0.010,
            stop_threshold: 0.006,
            processed_samples: 0,
            speech_start_sample: 0,
            last_logged_state: false,
        })
    }

    /// Process incoming audio samples and return any complete speech segments
    /// Handles resampling from input sample rate to 16kHz for VAD processing
    pub fn process_audio(&mut self, samples: &[f32]) -> Result<Vec<SpeechSegment>> {
        let resampled_audio = if self.input_sample_rate == self.vad_sample_rate {
            samples.to_vec()
        } else {
            self.resample_to_16k(samples)?
        };

        self.buffer.extend_from_slice(&resampled_audio);
        let mut completed_segments = Vec::new();

        // Process complete 30ms chunks (480 samples at 16kHz)
        while self.buffer.len() >= self.chunk_size {
            let chunk: Vec<f32> = self.buffer.drain(..self.chunk_size).collect();
            self.process_chunk(&chunk)?;

            // Extract any completed speech segments
            while let Some(segment) = self.speech_segments.pop_front() {
                completed_segments.push(segment);
            }
        }

        Ok(completed_segments)
    }

    fn resample_to_16k(&self, samples: &[f32]) -> Result<Vec<f32>> {
        if self.input_sample_rate == self.vad_sample_rate {
            return Ok(samples.to_vec());
        }

        let resampled = resample_audio(samples, self.input_sample_rate, self.vad_sample_rate);
        debug!(
            "Resampled from {} samples ({}Hz) to {} samples (16kHz)",
            samples.len(),
            self.input_sample_rate,
            resampled.len()
        );
        Ok(resampled)
    }

    /// Flush any remaining audio and return final speech segments
    pub fn flush(&mut self) -> Result<Vec<SpeechSegment>> {
        let mut completed_segments = Vec::new();

        // Process any remaining buffered audio
        if !self.buffer.is_empty() {
            let remaining = self.buffer.clone();
            self.buffer.clear();

            // Pad to chunk size if needed
            let mut padded_chunk = remaining;
            if padded_chunk.len() < self.chunk_size {
                padded_chunk.resize(self.chunk_size, 0.0);
            }

            self.process_chunk(&padded_chunk)?;
        }

        // Force end any ongoing speech
        if self.in_speech && !self.current_speech.is_empty() {
            self.finish_current_speech();
        }

        // Extract all remaining segments
        while let Some(segment) = self.speech_segments.pop_front() {
            completed_segments.push(segment);
        }

        Ok(completed_segments)
    }

    fn process_chunk(&mut self, chunk: &[f32]) -> Result<()> {
        let energy = chunk.iter().map(|x| x * x).sum::<f32>() / chunk.len().max(1) as f32;
        let rms = energy.sqrt();

        if self.in_speech {
            self.current_speech.extend_from_slice(chunk);
            if rms < self.stop_threshold {
                self.silence_samples += chunk.len();
                if self.silence_samples >= self.redemption_samples {
                    if self.last_logged_state {
                        info!("VAD: Speech ended");
                        self.last_logged_state = false;
                    }
                    self.finish_current_speech();
                }
            } else {
                self.silence_samples = 0;
            }
        } else if rms >= self.start_threshold {
            if !self.last_logged_state {
                info!("VAD: Speech started");
                self.last_logged_state = true;
            }
            self.in_speech = true;
            self.silence_samples = 0;
            self.speech_start_sample = self.processed_samples;
            self.current_speech.clear();
            self.current_speech.extend_from_slice(chunk);
        }

        self.processed_samples += chunk.len();
        Ok(())
    }

    fn finish_current_speech(&mut self) {
        if self.current_speech.len() < self.min_speech_samples {
            self.current_speech.clear();
            self.in_speech = false;
            self.silence_samples = 0;
            return;
        }

        let start_ms = (self.speech_start_sample as f64 / self.vad_sample_rate as f64) * 1000.0;
        let end_ms = (self.processed_samples as f64 / self.vad_sample_rate as f64) * 1000.0;
        let rms = (self.current_speech.iter().map(|x| x * x).sum::<f32>()
            / self.current_speech.len().max(1) as f32)
            .sqrt();
        let confidence = (rms * 8.0).clamp(0.0, 1.0);

        self.speech_segments.push_back(SpeechSegment {
            samples: self.current_speech.clone(),
            start_timestamp_ms: start_ms,
            end_timestamp_ms: end_ms,
            confidence,
        });

        self.current_speech.clear();
        self.in_speech = false;
        self.silence_samples = 0;
    }
}

/// Legacy function for backward compatibility - now uses the optimized approach
pub fn extract_speech_16k(samples_mono_16k: &[f32]) -> Result<Vec<f32>> {
    let mut processor = ContinuousVadProcessor::new(16000, 400)?;

    // Process all audio
    let mut all_segments = processor.process_audio(samples_mono_16k)?;
    let final_segments = processor.flush()?;
    all_segments.extend(final_segments);

    // Concatenate all speech segments
    let mut result = Vec::new();
    let num_segments = all_segments.len();
    for segment in &all_segments {
        result.extend_from_slice(&segment.samples);
    }

    // Apply balanced energy filtering for very short segments
    if result.len() < 1600 { // Less than 100ms at 16kHz
        let input_energy: f32 = samples_mono_16k.iter().map(|&x| x * x).sum::<f32>() / samples_mono_16k.len() as f32;
        let rms = input_energy.sqrt();
        let peak = samples_mono_16k.iter().map(|&x| x.abs()).fold(0.0f32, f32::max);

        // BALANCED FIX: Lowered thresholds to preserve quiet speech while still filtering silence
        // Previous aggressive values (0.08/0.15) were discarding valid quiet speech
        // New values (0.03/0.08) are more balanced - catch quiet speech, reject pure silence
        if rms < 0.2 || peak < 0.20 {
            info!("-----VAD detected silence/noise (RMS: {:.6}, Peak: {:.6}), skipping to prevent hallucinations-----", rms, peak);
            return Ok(Vec::new());
        } else {
            info!("VAD detected speech with sufficient energy (RMS: {:.6}, Peak: {:.6})", rms, peak);
            return Ok(samples_mono_16k.to_vec());
        }
    }

    debug!("VAD: Processed {} samples, extracted {} speech samples from {} segments",
           samples_mono_16k.len(), result.len(), num_segments);

    Ok(result)
}

/// Simple convenience function to get speech chunks from audio
/// Uses the optimized ContinuousVadProcessor with configurable redemption time
pub fn get_speech_chunks(samples_mono_16k: &[f32], redemption_time_ms: u32) -> Result<Vec<SpeechSegment>> {
    let mut processor = ContinuousVadProcessor::new(16000, redemption_time_ms)?;

    // Process all audio
    let mut segments = processor.process_audio(samples_mono_16k)?;
    let final_segments = processor.flush()?;
    segments.extend(final_segments);

    Ok(segments)
}

 
