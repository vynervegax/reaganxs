// apps/desktop/src-tauri/src/commands/contribution.rs

use serde_json::Value;
use tauri::State;
use crate::state::AppState;

/// Optional anonymized dataset contribution.
/// Currently logs only – wire to backend when user consents.
#[tauri::command]
pub async fn send_contribution(
    data: Value,
    _state: State<'_, AppState>,
) -> Result<(), String> {
    println!("[Contribution] Received anonymized payload: {}", data);
    // Future: POST to backend /api/contribution with consent flag
    Ok(())
}