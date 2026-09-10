// apps/desktop/src-tauri/src/commands/hardware.rs

use serde::Serialize;
use sysinfo::{System, RefreshKind, CpuRefreshKind, MemoryRefreshKind};

#[derive(Debug, Serialize)]
pub struct HardwareInfo {
    pub gpu_name: String,
    pub vram_gb: f32,
    pub cpu_name: String,
    pub total_memory_gb: f32,
    pub battery_level: u8,
    pub is_low_power: bool,
}

#[tauri::command]
pub async fn get_hardware_info() -> Result<HardwareInfo, String> {
    let mut sys = System::new_with_specifics(
        RefreshKind::new()
            .with_cpu(CpuRefreshKind::everything())
            .with_memory(MemoryRefreshKind::everything()),
    );
    sys.refresh_all();

    let cpu_name = sys
        .cpus()
        .first()
        .map(|c| c.brand().to_string())
        .unwrap_or_else(|| "Unknown CPU".into());

    let total_memory_gb = sys.total_memory() as f32 / (1024.0 * 1024.0 * 1024.0);

    // GPU detection is best-effort (platform specific)
    // For now we report a sensible default; real GPU name can be improved later
    let gpu_name = std::env::var("REAGANXS_GPU_NAME")
        .unwrap_or_else(|_| "Integrated / Discrete GPU".into());

    // Estimate VRAM from system memory as fallback (real query is in get_gpu_memory_info)
    let vram_gb = (total_memory_gb * 0.4).min(24.0).max(2.0);

    Ok(HardwareInfo {
        gpu_name,
        vram_gb,
        cpu_name,
        total_memory_gb,
        battery_level: 100,
        is_low_power: false,
    })
}