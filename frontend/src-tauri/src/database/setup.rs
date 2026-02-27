use log::{info, warn};
use tauri::{AppHandle, Manager};

use super::manager::DatabaseManager;
use crate::state::AppState;

/// Initialize database on app startup and always register AppState.
pub async fn initialize_database_on_startup(app: &AppHandle) -> Result<(), String> {
    match DatabaseManager::is_first_launch(app).await {
        Ok(true) => info!("First launch detected - initializing fresh database state"),
        Ok(false) => info!("Existing database detected - initializing app state"),
        Err(e) => warn!("Failed to check first launch status, continuing with DB init: {}", e),
    }

    let db_manager = DatabaseManager::new_from_app_handle(app)
        .await
        .map_err(|e| format!("Failed to initialize database manager: {}", e))?;

    app.manage(AppState { db_manager });
    info!("Database initialized successfully and AppState registered");

    Ok(())
}
