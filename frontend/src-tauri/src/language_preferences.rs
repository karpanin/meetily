use log::{info, warn, error};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Runtime};
use tauri_plugin_store::StoreExt;
use anyhow::Result;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct LanguagePreference {
    pub language_code: String,
}

impl Default for LanguagePreference {
    fn default() -> Self {
        Self {
            language_code: "ru".to_string(), // Russian as default
        }
    }
}

/// Load language preference from Tauri store
pub async fn load_language_preference<R: Runtime>(
    app: &AppHandle<R>,
) -> Result<String> {
    // Try to load from Tauri store
    let store = match app.store("language_preference.json") {
        Ok(store) => store,
        Err(e) => {
            warn!("Failed to access language preference store: {}, using default", e);
            return Ok("ru".to_string());
        }
    };

    // Try to get the preference from store
    if let Some(value) = store.get("language_code") {
        match value.as_str() {
            Some(lang) => {
                info!("Loaded language preference from store: {}", lang);
                return Ok(lang.to_string());
            }
            None => {
                warn!("Invalid language_code value in store");
            }
        }
    }

    // Return default if not found
    info!("Language preference not found in store, using default: ru");
    Ok("ru".to_string())
}

/// Save language preference to Tauri store
pub async fn save_language_preference<R: Runtime>(
    app: &AppHandle<R>,
    language_code: &str,
) -> Result<()> {
    let store = app.store("language_preference.json")?;

    store.set("language_code", language_code)?;

    // Explicitly save to ensure persistence
    store.save()?;

    info!("Saved language preference to store: {}", language_code);
    Ok(())
}

/// Fetch language preference from backend API
pub async fn fetch_language_preference_from_backend() -> Result<String> {
    let url = "http://localhost:5167/api/language-preference";

    match reqwest::Client::new()
        .get(url)
        .send()
        .await
    {
        Ok(response) => {
            if response.status().is_success() {
                match response.json::<serde_json::Value>().await {
                    Ok(data) => {
                        if let Some(language_code) = data.get("language_code").and_then(|v| v.as_str()) {
                            info!("Fetched language preference from backend: {}", language_code);
                            return Ok(language_code.to_string());
                        }
                    }
                    Err(e) => {
                        warn!("Failed to parse language preference response: {}", e);
                    }
                }
            }
        }
        Err(e) => {
            warn!("Failed to fetch language preference from backend: {}", e);
        }
    }

    // Return default if fetch fails
    Ok("ru".to_string())
}

/// Save language preference to backend API
pub async fn save_language_preference_to_backend(language_code: &str) -> Result<()> {
    let url = "http://localhost:5167/api/language-preference";

    let payload = serde_json::json!({
        "language_code": language_code
    });

    match reqwest::Client::new()
        .post(url)
        .json(&payload)
        .send()
        .await
    {
        Ok(response) => {
            if response.status().is_success() {
                info!("Saved language preference to backend: {}", language_code);
                return Ok(());
            } else {
                warn!("Failed to save language preference to backend: status {}", response.status());
            }
        }
        Err(e) => {
            warn!("Failed to save language preference to backend: {}", e);
        }
    }

    Ok(())
}
