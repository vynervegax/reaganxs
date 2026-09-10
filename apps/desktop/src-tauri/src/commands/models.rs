use candle_core::Device;
use std::path::PathBuf;
use sysinfo::{MemoryRefreshKind, RefreshKind, System};
use tauri::{AppHandle, Manager, State};
use crate::state::AppState;

#[derive(Debug, Clone, serde::Serialize)]
pub struct ModelMetadata {
    pub name: String,
    pub scale: u32,
    pub description: String,
    pub weight_file: String,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct GpuMemoryInfo {
    pub total_vram_mb: u64,
    pub used_vram_mb: u64,
    pub available_vram_mb: u64,
    pub device_type: String,
    pub is_low_memory: bool,
}

pub struct ModelManager {
    pub device: Device,
    pub current_model: Option<String>,
    pub metadata: Option<ModelMetadata>,
}

impl Default for ModelManager {
    fn default() -> Self {
        Self {
            device: Device::Cpu,
            current_model: None,
            metadata: None,
        }
    }
}

fn weight_file_for(model_name: &str) -> &'static str {
    match model_name {
        "4x-bhi" => "4xBHI_realplksr_dysample_real.safetensors",
        "4x-purephoto" => "4xPurePhoto-RealPLSKR.pth",
        "rgt-s" => "RGT_S_x4.pth",
        "atd-srx4" => "003_ATD_SRx4_finetune.pth",
        _ => "003_ATD_SRx4_finetune.pth",
    }
}

fn get_model_path(app: &AppHandle, model_name: &str) -> Result<PathBuf, String> {
    let mut path = app
        .path()
        .resource_dir()
        .map_err(|e| format!("resource dir: {}", e))?;
    path.push("models");
    path.push(weight_file_for(model_name));
    Ok(path)
}

#[tauri::command]
pub async fn load_model(
    app: AppHandle,
    model_name: String,
    state: State<'_, AppState>,
) -> Result<String, String> {
    let model_path = get_model_path(&app, &model_name)?;
    if !model_path.exists() {
        return Err(format!(
            "Model file not found: {} (expected {:?})",
            weight_file_for(&model_name),
            model_path
        ));
    }

    let device = Device::cuda_if_available(0).unwrap_or(Device::Cpu);

    let mut manager = state.model_manager.lock().map_err(|e| e.to_string())?;
    manager.device = device;
    manager.current_model = Some(model_name.clone());
    manager.metadata = Some(ModelMetadata {
        name: model_name.clone(),
        scale: 4,
        description: format!("Loaded {} for ReaganXS desktop", model_name),
        weight_file: weight_file_for(&model_name).to_string(),
    });

    println!("[Models] Loaded {} → {:?}", model_name, model_path);
    Ok(format!("Model '{}' loaded", model_name))
}

#[tauri::command]
pub async fn get_model_status(
    state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    let manager = state.model_manager.lock().map_err(|e| e.to_string())?;
    Ok(serde_json::json!({
        "loaded": manager.current_model.is_some(),
        "name": manager.current_model,
        "metadata": manager.metadata,
        "device": format!("{:?}", manager.device),
    }))
}

#[tauri::command]
pub async fn unload_model(state: State<'_, AppState>) -> Result<(), String> {
    let mut manager = state.model_manager.lock().map_err(|e| e.to_string())?;
    manager.current_model = None;
    manager.metadata = None;
    Ok(())
}

/// System-memory estimate (true VRAM needs Metal/CUDA APIs later).
#[tauri::command]
pub async fn get_gpu_memory_info() -> Result<GpuMemoryInfo, String> {
    let mut sys = System::new_with_specifics(
        RefreshKind::new().with_memory(MemoryRefreshKind::everything()),
    );
    sys.refresh_memory();

    let total = sys.total_memory() / (1024 * 1024);
    let used = sys.used_memory() / (1024 * 1024);
    let available = total.saturating_sub(used);

    Ok(GpuMemoryInfo {
        total_vram_mb: total,
        used_vram_mb: used,
        available_vram_mb: available,
        device_type: "system-memory-estimate".into(),
        is_low_memory: available < 2048,
    })
}

/// Placeholder batch path until real Candle/ONNX forward is wired.
/// Expects flat RGB `batch * 3 * H * W`, returns 4× spatial upsample.
#[tauri::command]
pub async fn run_batch_inference(
    input_data: Vec<f32>,
    batch_size: usize,
    height: usize,
    width: usize,
    state: State<'_, AppState>,
) -> Result<Vec<f32>, String> {
    let manager = state.model_manager.lock().map_err(|e| e.to_string())?;
    if manager.current_model.is_none() {
        return Err("No model loaded. Call load_model first.".into());
    }

    let expected = batch_size.saturating_mul(3).saturating_mul(height).saturating_mul(width);
    if input_data.len() != expected {
        return Err(format!(
            "Invalid tensor size: got {}, expected {} (Bx3xHxW)",
            input_data.len(),
            expected
        ));
    }

    let out_h = height * 4;
    let out_w = width * 4;
    let mut output = vec![0.0f32; batch_size * 3 * out_h * out_w];

    for b in 0..batch_size {
        for c in 0..3 {
            for y in 0..out_h {
                for x in 0..out_w {
                    let sy = y / 4;
                    let sx = x / 4;
                    let src = b * 3 * height * width + c * height * width + sy * width + sx;
                    let dst = b * 3 * out_h * out_w + c * out_h * out_w + y * out_w + x;
                    output[dst] = input_data[src];
                }
            }
        }
    }

    Ok(output)
}