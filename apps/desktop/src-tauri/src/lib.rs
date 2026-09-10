// apps/desktop/src-tauri/src/lib.rs

mod commands;
mod state;

use state::AppState;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![
            commands::hardware::get_hardware_info,
            commands::models::load_model,
            commands::models::unload_model,
            commands::models::get_gpu_memory_info,
            commands::models::run_batch_inference,
            commands::process_video::process_video,
            commands::quality_metrics::run_vmaf,
            commands::contribution::send_contribution,
        ])
        .run(tauri::generate_context!())
        .expect("error while running ReaganXS Desktop");
}