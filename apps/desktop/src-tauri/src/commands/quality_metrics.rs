// apps/desktop/src-tauri/src/commands/quality_metrics.rs

use serde::Serialize;
use std::process::Command;
use std::fs;

#[derive(Debug, Serialize)]
pub struct VmafResult {
    pub vmaf_score: f32,
}

#[tauri::command]
pub async fn run_vmaf(
    original_path: String,
    processed_path: String,
) -> Result<VmafResult, String> {
    if !std::path::Path::new(&original_path).exists()
        || !std::path::Path::new(&processed_path).exists()
    {
        return Ok(VmafResult { vmaf_score: 0.0 });
    }

    let log_file = format!("/tmp/vmaf_{}.json", std::process::id());

    // Requires ffmpeg built with --enable-libvmaf
    let status = Command::new("ffmpeg")
        .args([
            "-i",
            &processed_path,
            "-i",
            &original_path,
            "-lavfi",
            &format!("libvmaf=log_path={}:log_fmt=json", log_file),
            "-f",
            "null",
            "-",
        ])
        .status()
        .map_err(|e| format!("ffmpeg VMAF failed to start: {}", e))?;

    if !status.success() {
        return Ok(VmafResult { vmaf_score: 0.0 });
    }

    if let Ok(content) = fs::read_to_string(&log_file) {
        let _ = fs::remove_file(&log_file);
        // Very light parse – real parser can be improved
        if let Some(idx) = content.find("\"vmaf\"") {
            let slice = &content[idx..];
            if let Some(num_start) = slice.find(':') {
                let num_part: String = slice[num_start + 1..]
                    .chars()
                    .skip_while(|c| c.is_whitespace() || *c == ':')
                    .take_while(|c| c.is_ascii_digit() || *c == '.')
                    .collect();
                if let Ok(score) = num_part.parse::<f32>() {
                    return Ok(VmafResult { vmaf_score: score });
                }
            }
        }
    }

    Ok(VmafResult { vmaf_score: 0.0 })
}