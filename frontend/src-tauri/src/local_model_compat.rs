use serde_json::json;
use tauri::{AppHandle, Emitter, Runtime};

const REMOTE_ONLY_MESSAGE: &str =
    "Local transcription models are disabled in this build. Configure an OpenAI-compatible transcription endpoint in Settings.";

#[tauri::command]
pub async fn parakeet_init() -> Result<(), String> {
    Ok(())
}

#[tauri::command]
pub async fn parakeet_get_available_models() -> Result<Vec<serde_json::Value>, String> {
    Ok(vec![json!({
        "name": "parakeet-tdt-0.6b-v3-int8",
        "path": "",
        "size_mb": 0,
        "accuracy": "High",
        "speed": "Ultra Fast",
        "status": "Available",
        "description": "Remote API mode",
        "quantization": "Int8"
    })])
}

#[tauri::command]
pub async fn parakeet_load_model(_model_name: String) -> Result<(), String> {
    Ok(())
}

#[tauri::command]
pub async fn parakeet_get_current_model() -> Result<Option<String>, String> {
    Ok(Some("remote-api".to_string()))
}

#[tauri::command]
pub async fn parakeet_is_model_loaded() -> Result<bool, String> {
    Ok(true)
}

#[tauri::command]
pub async fn parakeet_transcribe_audio(_audio_data: Vec<f32>) -> Result<String, String> {
    Err(REMOTE_ONLY_MESSAGE.to_string())
}

#[tauri::command]
pub async fn parakeet_get_models_directory() -> Result<String, String> {
    Ok("Remote API mode (no local model directory)".to_string())
}

#[tauri::command]
pub async fn parakeet_download_model<R: Runtime>(
    app_handle: AppHandle<R>,
    model_name: String,
) -> Result<(), String> {
    let _ = app_handle.emit(
        "parakeet-model-download-progress",
        json!({
            "modelName": model_name,
            "progress": 100,
            "downloaded_mb": 0.0,
            "total_mb": 0.0,
            "speed_mbps": 0.0,
            "status": "completed"
        }),
    );
    let _ = app_handle.emit(
        "parakeet-model-download-complete",
        json!({ "modelName": model_name }),
    );
    Ok(())
}

#[tauri::command]
pub async fn parakeet_cancel_download<R: Runtime>(
    app_handle: AppHandle<R>,
    model_name: String,
) -> Result<(), String> {
    let _ = app_handle.emit(
        "parakeet-model-download-progress",
        json!({
            "modelName": model_name,
            "progress": 0,
            "status": "cancelled"
        }),
    );
    Ok(())
}

#[tauri::command]
pub async fn parakeet_retry_download<R: Runtime>(
    app_handle: AppHandle<R>,
    model_name: String,
) -> Result<(), String> {
    parakeet_download_model(app_handle, model_name).await
}

#[tauri::command]
pub async fn parakeet_delete_corrupted_model(_model_name: String) -> Result<String, String> {
    Ok("No local model files in remote API mode".to_string())
}

#[tauri::command]
pub async fn parakeet_has_available_models() -> Result<bool, String> {
    Ok(true)
}

#[tauri::command]
pub async fn parakeet_validate_model_ready() -> Result<String, String> {
    Ok("Remote API mode ready".to_string())
}

#[tauri::command]
pub async fn open_parakeet_models_folder() -> Result<(), String> {
    Err(REMOTE_ONLY_MESSAGE.to_string())
}

#[tauri::command]
pub async fn whisper_init() -> Result<(), String> {
    Err(REMOTE_ONLY_MESSAGE.to_string())
}

#[tauri::command]
pub async fn whisper_get_available_models() -> Result<Vec<serde_json::Value>, String> {
    Ok(vec![])
}

#[tauri::command]
pub async fn whisper_load_model(_model_name: String) -> Result<(), String> {
    Err(REMOTE_ONLY_MESSAGE.to_string())
}

#[tauri::command]
pub async fn whisper_get_current_model() -> Result<Option<String>, String> {
    Ok(None)
}

#[tauri::command]
pub async fn whisper_is_model_loaded() -> Result<bool, String> {
    Ok(false)
}

#[tauri::command]
pub async fn whisper_transcribe_audio(_audio_data: Vec<f32>) -> Result<String, String> {
    Err(REMOTE_ONLY_MESSAGE.to_string())
}

#[tauri::command]
pub async fn whisper_get_models_directory() -> Result<String, String> {
    Ok("Remote API mode (no local model directory)".to_string())
}

#[tauri::command]
pub async fn whisper_download_model<R: Runtime>(
    app_handle: AppHandle<R>,
    model_name: String,
) -> Result<(), String> {
    let _ = app_handle.emit(
        "model-download-complete",
        json!({ "modelName": model_name }),
    );
    Err(REMOTE_ONLY_MESSAGE.to_string())
}

#[tauri::command]
pub async fn whisper_cancel_download(_model_name: String) -> Result<(), String> {
    Ok(())
}

#[tauri::command]
pub async fn whisper_delete_corrupted_model(_model_name: String) -> Result<String, String> {
    Ok("No local model files in remote API mode".to_string())
}

#[tauri::command]
pub async fn whisper_has_available_models() -> Result<bool, String> {
    Ok(false)
}

#[tauri::command]
pub async fn whisper_validate_model_ready() -> Result<String, String> {
    Err(REMOTE_ONLY_MESSAGE.to_string())
}

#[tauri::command]
pub async fn open_models_folder() -> Result<(), String> {
    Err(REMOTE_ONLY_MESSAGE.to_string())
}
