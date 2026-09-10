// apps/desktop/src-tauri/src/state.rs

use crate::commands::models::ModelManager;
use std::sync::Mutex;

pub struct AppState {
    pub model_manager: Mutex<ModelManager>,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            model_manager: Mutex::new(ModelManager::default()),
        }
    }
}