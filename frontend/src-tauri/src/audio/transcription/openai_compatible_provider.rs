// audio/transcription/openai_compatible_provider.rs
//
// OpenAI-compatible HTTP transcription provider implementation.

use super::provider::{TranscriptionError, TranscriptionProvider, TranscriptResult};
use async_trait::async_trait;
use reqwest::multipart::{Form, Part};
use serde_json::Value;
use std::collections::HashSet;
use std::time::Duration;

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

    fn extract_text_and_speaker(payload: &Value) -> (String, Option<String>) {
        let top_level_text = payload
            .get("text")
            .and_then(Value::as_str)
            .map(str::trim)
            .unwrap_or_default()
            .to_string();

        let top_level_speaker = payload
            .get("speaker")
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .map(ToOwned::to_owned);

        let segments = payload
            .get("segments")
            .and_then(Value::as_array)
            .cloned()
            .unwrap_or_default();

        let mut segment_text_parts: Vec<String> = Vec::new();
        let mut speakers: HashSet<String> = HashSet::new();
        let speaker_fields = ["speaker", "speaker_id", "speaker_label", "speaker_name"];

        for segment in segments {
            if let Some(seg_text) = segment.get("text").and_then(Value::as_str) {
                let trimmed = seg_text.trim();
                if !trimmed.is_empty() {
                    segment_text_parts.push(trimmed.to_string());
                }
            }

            for field in speaker_fields {
                if let Some(value) = segment.get(field).and_then(Value::as_str) {
                    let trimmed = value.trim();
                    if !trimmed.is_empty() {
                        speakers.insert(trimmed.to_string());
                        break;
                    }
                }
            }
        }

        let final_text = if !top_level_text.is_empty() {
            top_level_text
        } else if !segment_text_parts.is_empty() {
            segment_text_parts.join(" ")
        } else {
            String::new()
        };

        let final_speaker = if let Some(speaker) = top_level_speaker {
            Some(speaker)
        } else if speakers.len() == 1 {
            speakers.into_iter().next()
        } else {
            None
        };

        (final_text, final_speaker)
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
        let normalized_language = language.and_then(|lang| {
            let normalized = lang.trim().to_string();
            if normalized.is_empty() || normalized == "auto" || normalized == "auto-translate" {
                None
            } else {
                Some(normalized)
            }
        });

        let send_request = |include_verbose_json: bool| {
            let wav_bytes = wav_bytes.clone();
            let normalized_language = normalized_language.clone();
            async move {
                let audio_part = Part::bytes(wav_bytes)
                    .file_name("chunk.wav")
                    .mime_str("audio/wav")
                    .map_err(|e| TranscriptionError::EngineFailed(e.to_string()))?;

                let mut form = Form::new()
                    .part("file", audio_part)
                    .text("model", self.model.clone());

                if let Some(lang) = normalized_language {
                    form = form.text("language", lang);
                }
                if include_verbose_json {
                    form = form.text("response_format", "verbose_json");
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

                request
                    .send()
                    .await
                    .map_err(|e| TranscriptionError::EngineFailed(e.to_string()))
            }
        };

        let mut response = send_request(true).await?;
        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();

            if status.as_u16() == 400 || status.as_u16() == 422 {
                response = send_request(false).await?;
            } else {
                return Err(TranscriptionError::EngineFailed(format!(
                    "HTTP {}: {}",
                    status, body
                )));
            }
        }

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(TranscriptionError::EngineFailed(format!(
                "HTTP {}: {}",
                status, body
            )));
        }

        let payload = response
            .json::<Value>()
            .await
            .map_err(|e| TranscriptionError::EngineFailed(e.to_string()))?;
        let (text, speaker) = Self::extract_text_and_speaker(&payload);

        Ok(TranscriptResult {
            text,
            confidence: None,
            is_partial: false,
            speaker,
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
