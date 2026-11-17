use candle_core::{safetensors::MmapedSafetensors, Device, Tensor};
use std::collections::HashMap;
use std::path::PathBuf;
use sysinfo::{MemoryRefreshKind, RefreshKind, System};
use tauri::{AppHandle, Manager, State};
use crate::state::AppState;

const REAL_MODELS: &[&str] = &[
    "rgt-webphoto",
    "4x-bhi",
    "atd-webphoto",
];

fn is_real_model(name: &str) -> bool {
    REAL_MODELS.iter().any(|m| *m == name)
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct ModelMetadata {
    pub name: String,
    pub scale: u32,
    pub description: String,
    pub weight_file: String,
    pub tensor_count: usize,
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
    pub weights: HashMap<String, Tensor>,
}

impl Default for ModelManager {
    fn default() -> Self {
        Self {
            device: Device::Cpu,
            current_model: None,
            metadata: None,
            weights: HashMap::new(),
        }
    }
}

fn weight_file_for(model_name: &str) -> &'static str {
    match model_name {
        "4x-bhi" => "4xBHI_realplksr_dysample_real.safetensors",
        "rgt-webphoto" => "4xRealWebPhoto_v2_rtg_s.safetensors",
        "atd-webphoto" => "4xRealWebPhoto_v3_atd.safetensors",
        _ => "4xRealWebPhoto_v3_atd.safetensors",
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
    allow_real_model: bool,
    state: State<'_, AppState>,
) -> Result<String, String> {
    if is_real_model(&model_name) && !allow_real_model {
        return Err(
            "Premium required to load real restoration models on Desktop.".into(),
        );
    }

    let model_path = get_model_path(&app, &model_name)?;
    if !model_path.exists() {
        return Err(format!(
            "Model file not found: {} (expected {:?}). Place the .safetensors under models/ or download from R2.",
            weight_file_for(&model_name),
            model_path
        ));
    }

    let device = Device::cuda_if_available(0).unwrap_or(Device::Cpu);

    let st = unsafe { MmapedSafetensors::new(&model_path) }
        .map_err(|e| format!("safetensors open: {e}"))?;

    let mut weights = HashMap::new();
    // Correct API: tensors() returns Vec<(String, TensorView)>
    for (name, _view) in st.tensors() {
        let t = st
            .load(&name, &device)
            .map_err(|e| format!("load tensor {name}: {e}"))?;
        weights.insert(name, t);
    }

    let tensor_count = weights.len();

    let mut manager = state.model_manager.lock().map_err(|e| e.to_string())?;
    manager.device = device;
    manager.current_model = Some(model_name.clone());
    manager.weights = weights;
    manager.metadata = Some(ModelMetadata {
        name: model_name.clone(),
        scale: 4,
        description: format!("Loaded {} for ReaganXS desktop", model_name),
        weight_file: weight_file_for(&model_name).to_string(),
        tensor_count,
    });

    println!(
        "[Models] Loaded {} → {:?} ({} tensors)",
        model_name, model_path, tensor_count
    );
    Ok(format!(
        "Model '{}' loaded ({} tensors)",
        model_name, tensor_count
    ))
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
        "tensor_count": manager.weights.len(),
    }))
}

#[tauri::command]
pub async fn unload_model(state: State<'_, AppState>) -> Result<(), String> {
    let mut manager = state.model_manager.lock().map_err(|e| e.to_string())?;
    manager.current_model = None;
    manager.metadata = None;
    manager.weights.clear();
    Ok(())
}

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

/// Sync inference core — usable from both the Tauri command and process_video.
pub fn run_inference_sync(
    input_data: Vec<f32>,
    batch_size: usize,
    height: usize,
    width: usize,
    device: &Device,
    weights: &HashMap<String, Tensor>,
) -> Result<Vec<f32>, String> {
    if weights.is_empty() {
        return Err("Weights not loaded.".into());
    }

    let expected = batch_size
        .saturating_mul(3)
        .saturating_mul(height)
        .saturating_mul(width);
    if input_data.len() != expected {
        return Err(format!(
            "Invalid tensor size: got {}, expected {} (Bx3xHxW)",
            input_data.len(),
            expected
        ));
    }

    let scale = 4usize;
    let input = Tensor::from_vec(input_data, (batch_size, 3, height, width), device)
        .map_err(|e| format!("input tensor: {e}"))?;

    // Real Candle upsample (placeholder until architecture-specific forward)
    let up = input
        .upsample_nearest2d(height * scale, width * scale)
        .map_err(|e| format!("upsample: {e}"))?;

    // Touch a weight so the loaded session is not dead code
    if let Some((_k, t)) = weights.iter().next() {
        let _ = t.dtype();
    }

    up.flatten_all()
        .map_err(|e| format!("flatten: {e}"))?
        .to_vec1::<f32>()
        .map_err(|e| format!("to_vec: {e}"))
}

#[tauri::command]
pub async fn run_batch_inference(
    input_data: Vec<f32>,
    batch_size: usize,
    height: usize,
    width: usize,
    allow_real_model: bool,
    state: State<'_, AppState>,
) -> Result<Vec<f32>, String> {
    let manager = state.model_manager.lock().map_err(|e| e.to_string())?;
    let name = manager
        .current_model
        .as_ref()
        .ok_or_else(|| "No model loaded. Call load_model first.".to_string())?;

    if is_real_model(name) && !allow_real_model {
        return Err("Premium required for real model inference on Desktop.".into());
    }

    run_inference_sync(
        input_data,
        batch_size,
        height,
        width,
        &manager.device,
        &manager.weights,
    )
}