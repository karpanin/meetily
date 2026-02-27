// audio/transcription/openai_compatible_provider.rs
//
// OpenAI-compatible HTTP transcription provider implementation.

use super::provider::{TranscriptionError, TranscriptionProvider, TranscriptResult};
use async_trait::async_trait;
use reqwest::multipart::{Form, Part};
use serde::Deserialize;
use std::time::Duration;

#[derive(Debug, Deserialize)]
struct OpenAITranscriptionResponse {
    text: String,
}

pub struct OpenAICompatibleProvider {
    endpoint: String,
    model: String,
    api_key: Option<String>,
    client: reqwest::Client,
}

impl OpenAICompatibleProvider {
    pub fn new(endpoint: String, model: String, api_key: Option<String>) -> Self {
        Self {
            endpoint: endpoint.trim_end_matches('/').to_string(),
            model,
            api_key: api_key.and_then(|k| {
                let trimmed = k.trim().to_string();
                if trimmed.is_empty() {
                    None
                } else {
                    Some(trimmed)
                }
            }),
            client: reqwest::Client::new(),
        }
    }

    fn build_wav_bytes(audio: &[f32], sample_rate: u32) -> Vec<u8> {
        let channels: u16 = 1;
        let bits_per_sample: u16 = 16;
        let block_align: u16 = channels * (bits_per_sample / 8);
        let byte_rate: u32 = sample_rate * block_align as u32;

        let pcm_data: Vec<i16> = audio
            .iter()
            .map(|&sample| {
                let clamped = sample.clamp(-1.0, 1.0);
                (clamped * i16::MAX as f32) as i16
            })
            .collect();

        let data_size = (pcm_data.len() * std::mem::size_of::<i16>()) as u32;
        let file_size = 36u32 + data_size;

        let mut wav = Vec::with_capacity((44 + data_size) as usize);
        wav.extend_from_slice(b"RIFF");
        wav.extend_from_slice(&file_size.to_le_bytes());
        wav.extend_from_slice(b"WAVE");
        wav.extend_from_slice(b"fmt ");
        wav.extend_from_slice(&16u32.to_le_bytes());
        wav.extend_from_slice(&1u16.to_le_bytes());
        wav.extend_from_slice(&channels.to_le_bytes());
        wav.extend_from_slice(&sample_rate.to_le_bytes());
        wav.extend_from_slice(&byte_rate.to_le_bytes());
        wav.extend_from_slice(&block_align.to_le_bytes());
        wav.extend_from_slice(&bits_per_sample.to_le_bytes());
        wav.extend_from_slice(b"data");
        wav.extend_from_slice(&data_size.to_le_bytes());

        for sample in pcm_data {
            wav.extend_from_slice(&sample.to_le_bytes());
        }

        wav
    }
}

#[async_trait]
impl TranscriptionProvider for OpenAICompatibleProvider {
    async fn transcribe(
        &self,
        audio: Vec<f32>,
        language: Option<String>,
    ) -> std::result::Result<TranscriptResult, TranscriptionError> {
        if audio.len() < 1600 {
            return Err(TranscriptionError::AudioTooShort {
                samples: audio.len(),
                minimum: 1600,
            });
        }

        let wav_bytes = Self::build_wav_bytes(&audio, 16000);
        let audio_part = Part::bytes(wav_bytes)
            .file_name("chunk.wav")
            .mime_str("audio/wav")
            .map_err(|e| TranscriptionError::EngineFailed(e.to_string()))?;

        let mut form = Form::new()
            .part("file", audio_part)
            .text("model", self.model.clone());

        if let Some(lang) = language {
            let normalized = lang.trim();
            if !normalized.is_empty() && normalized != "auto" && normalized != "auto-translate" {
                form = form.text("language", normalized.to_string());
            }
        }

        let url = format!("{}/audio/transcriptions", self.endpoint);
        let mut request = self
            .client
            .post(url)
            .timeout(Duration::from_secs(45))
            .multipart(form);

        if let Some(api_key) = &self.api_key {
            request = request.bearer_auth(api_key);
        }

        let response = request
            .send()
            .await
            .map_err(|e| TranscriptionError::EngineFailed(e.to_string()))?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(TranscriptionError::EngineFailed(format!(
                "HTTP {}: {}",
                status, body
            )));
        }

        let payload = response
            .json::<OpenAITranscriptionResponse>()
            .await
            .map_err(|e| TranscriptionError::EngineFailed(e.to_string()))?;

        Ok(TranscriptResult {
            text: payload.text.trim().to_string(),
            confidence: None,
            is_partial: false,
        })
    }

    async fn is_model_loaded(&self) -> bool {
        true
    }

    async fn get_current_model(&self) -> Option<String> {
        Some(self.model.clone())
    }

    fn provider_name(&self) -> &'static str {
        "OpenAI Compatible"
    }
}
