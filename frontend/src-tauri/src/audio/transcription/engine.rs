// audio/transcription/engine.rs
//
// Remote-only transcription engine (OpenAI-compatible endpoint).

use super::openai_compatible_provider::OpenAICompatibleProvider;
use super::provider::TranscriptionProvider;
use log::info;
use std::sync::Arc;
use tauri::{AppHandle, Manager, Runtime};

pub enum TranscriptionEngine {
    Provider(Arc<dyn TranscriptionProvider>),
}

impl TranscriptionEngine {
    pub async fn is_model_loaded(&self) -> bool {
        match self {
            Self::Provider(provider) => provider.is_model_loaded().await,
        }
    }

    pub async fn get_current_model(&self) -> Option<String> {
        match self {
            Self::Provider(provider) => provider.get_current_model().await,
        }
    }

    pub fn provider_name(&self) -> &str {
        match self {
            Self::Provider(provider) => provider.provider_name(),
        }
    }
}

pub async fn validate_transcription_model_ready<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
    let config = crate::api::api::api_get_transcript_config(
        app.clone(),
        app.clone().state(),
        None,
    )
    .await?
    .ok_or_else(|| "Transcript config is missing".to_string())?;

    if config.provider != "openaiCompatible" {
        return Err("This build supports only openaiCompatible transcription provider".to_string());
    }

    let endpoint = config
        .openai_endpoint
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .ok_or_else(|| "OpenAI-compatible endpoint is not configured".to_string())?;

    if !endpoint.starts_with("http://") && !endpoint.starts_with("https://") {
        return Err("OpenAI-compatible endpoint must start with http:// or https://".to_string());
    }

    if config.model.trim().is_empty() {
        return Err("OpenAI-compatible model is not configured".to_string());
    }

    Ok(())
}

pub async fn get_or_init_transcription_engine<R: Runtime>(
    app: &AppHandle<R>,
) -> Result<TranscriptionEngine, String> {
    let config = crate::api::api::api_get_transcript_config(
        app.clone(),
        app.clone().state(),
        None,
    )
    .await?
    .ok_or_else(|| "Transcript config is missing".to_string())?;

    if config.provider != "openaiCompatible" {
        return Err("This build supports only openaiCompatible transcription provider".to_string());
    }

    let endpoint = config
        .openai_endpoint
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .ok_or_else(|| "OpenAI-compatible endpoint is not configured".to_string())?;

    let model = config.model.trim();
    if model.is_empty() {
        return Err("OpenAI-compatible model is not configured".to_string());
    }

    info!(
        "Initializing OpenAI-compatible transcription provider: endpoint={}, model={}",
        endpoint, model
    );

    let provider = OpenAICompatibleProvider::new(
        endpoint.to_string(),
        model.to_string(),
        config.api_key,
    );

    Ok(TranscriptionEngine::Provider(Arc::new(provider)))
}
