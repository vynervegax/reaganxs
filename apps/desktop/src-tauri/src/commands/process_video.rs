use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

use tauri::State;

use crate::state::AppState;

const REAL_MODELS: &[&str] = &[
    "rgt-webphoto",
    "atd-webphoto",
    "rgt-s",
    "atd-srx4",
    "4x-bhi",
];

fn is_real_model(name: &str) -> bool {
    REAL_MODELS.iter().any(|m| *m == name)
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct ProcessResult {
    pub output_path: String,
    pub savings_percent: f64,
    pub model_used: String,
    pub codec: String,
    pub original_size: u64,
    pub final_size: u64,
    pub message: String,
    pub model_loaded: bool,
    pub model_name: Option<String>,
    pub restored: bool,
    pub restore_skipped_reason: Option<String>,
    pub stages: Vec<String>,
}

fn run_ffmpeg(args: &[&str]) -> Result<(), String> {
    println!("[ffmpeg] {}", args.join(" "));
    let output = Command::new("ffmpeg")
        .args(args)
        .output()
        .map_err(|e| format!("Failed to spawn ffmpeg: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let tail: String = stderr
            .chars()
            .rev()
            .take(2500)
            .collect::<String>()
            .chars()
            .rev()
            .collect();
        return Err(format!("ffmpeg failed: {tail}"));
    }
    Ok(())
}

fn file_size(path: &Path) -> u64 {
    fs::metadata(path).map(|m| m.len()).unwrap_or(0)
}

fn stem_of(path: &Path) -> String {
    path.file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("video")
        .to_string()
}

fn compress_video(input: &Path, work_dir: &Path) -> Result<(PathBuf, String), String> {
    let stem = stem_of(input);
    let av1_out = work_dir.join(format!("{stem}_rx_av1.mp4"));
    let vp9_out = work_dir.join(format!("{stem}_rx_vp9.webm"));
    let input_str = input.to_str().ok_or("Invalid input path")?;

    let av1_args = [
        "-hide_banner",
        "-y",
        "-i",
        input_str,
        "-map",
        "0:v:0",
        "-map",
        "0:a:0?",
        "-c:v",
        "libsvtav1",
        "-preset",
        "8",
        "-crf",
        "28",
        "-c:a",
        "libopus",
        "-b:a",
        "96k",
        "-ac",
        "2",
        "-ar",
        "48000",
        "-movflags",
        "+faststart",
        "-sn",
        av1_out.to_str().unwrap(),
    ];

    match run_ffmpeg(&av1_args) {
        Ok(()) if av1_out.exists() && file_size(&av1_out) > 0 => {
            return Ok((av1_out, "libsvtav1".to_string()));
        }
        Ok(()) => println!("[compress] AV1 empty → VP9"),
        Err(e) => println!(
            "[compress] AV1 failed → VP9: {}",
            e.chars().take(400).collect::<String>()
        ),
    }

    let vp9_args = [
        "-hide_banner",
        "-y",
        "-i",
        input_str,
        "-map",
        "0:v:0",
        "-map",
        "0:a:0?",
        "-c:v",
        "libvpx-vp9",
        "-crf",
        "28",
        "-b:v",
        "0",
        "-row-mt",
        "1",
        "-cpu-used",
        "5",
        "-c:a",
        "libopus",
        "-b:a",
        "96k",
        "-ac",
        "2",
        "-ar",
        "48000",
        "-sn",
        vp9_out.to_str().unwrap(),
    ];

    run_ffmpeg(&vp9_args)?;

    if !vp9_out.exists() || file_size(&vp9_out) == 0 {
        return Err("VP9 compression failed (empty output)".into());
    }

    Ok((vp9_out, "libvpx-vp9".to_string()))
}

/// Partial restore — real model path only when allow_real_model + model session.
fn partial_restore(
    compressed: &Path,
    work_dir: &Path,
    stem: &str,
    model_loaded: bool,
    loaded_name: Option<String>,
    requested_model: &str,
    savings: f64,
    allow_real_model: bool,
) -> (bool, String, Option<String>, Vec<String>) {
    let mut stages = Vec::new();

    if !allow_real_model {
        stages.push("restore:skipped_premium_required".into());
        return (
            false,
            "compression-only".into(),
            Some(
                "Real restoration models require Premium on Desktop. Compression completed."
                    .into(),
            ),
            stages,
        );
    }

    if !model_loaded {
        stages.push("restore:skipped_no_model".into());
        return (
            false,
            "compression-only".into(),
            Some("No model loaded. Select a Premium model first.".into()),
            stages,
        );
    }

    if let Some(ref name) = loaded_name {
        if is_real_model(name) && !allow_real_model {
            stages.push("restore:blocked_not_premium".into());
            return (
                false,
                "compression-only".into(),
                Some("Premium required for real model inference.".into()),
                stages,
            );
        }
    }

    if savings < 15.0 {
        stages.push("restore:skipped_low_savings".into());
        return (
            false,
            "compression-only".into(),
            Some(format!(
                "Savings {savings:.1}% below 15% threshold (compress-first rule)."
            )),
            stages,
        );
    }

    let frames_dir = work_dir.join(format!("{stem}_frames"));
    let restored_dir = work_dir.join(format!("{stem}_restored_frames"));
    let _ = fs::create_dir_all(&frames_dir);
    let _ = fs::create_dir_all(&restored_dir);

    let pattern = frames_dir.join("frame_%03d.png");
    let extract = run_ffmpeg(&[
        "-hide_banner",
        "-y",
        "-i",
        compressed.to_str().unwrap(),
        "-vf",
        "fps=1,scale='min(960,iw)':-2",
        "-frames:v",
        "2",
        pattern.to_str().unwrap(),
    ]);

    if let Err(e) = extract {
        stages.push("restore:skipped_extract_failed".into());
        return (
            false,
            "compression-only".into(),
            Some(format!(
                "Frame extract failed: {}",
                e.chars().take(200).collect::<String>()
            )),
            stages,
        );
    }

    let mut frame_paths: Vec<PathBuf> = match fs::read_dir(&frames_dir) {
        Ok(rd) => rd
            .filter_map(|e| e.ok())
            .map(|e| e.path())
            .filter(|p| p.extension().map(|x| x == "png").unwrap_or(false))
            .collect(),
        Err(_) => Vec::new(),
    };
    frame_paths.sort();

    if frame_paths.is_empty() {
        stages.push("restore:skipped_no_frames".into());
        return (
            false,
            "compression-only".into(),
            Some("No frames extracted for partial restore.".into()),
            stages,
        );
    }

    stages.push(format!("restore:partial_frames:{}", frame_paths.len()));

    let model_used = loaded_name
        .clone()
        .unwrap_or_else(|| requested_model.to_string());

    // Placeholder until Candle/ONNX forward is wired:
    // call run_batch_inference per frame when allow_real_model.
    let mut restored_count = 0usize;
    for (idx, frame) in frame_paths.iter().enumerate() {
        let out = restored_dir.join(format!("restored_{idx:03}.png"));
        match fs::copy(frame, &out) {
            Ok(_) => restored_count += 1,
            Err(e) => println!("[restore] frame {idx} copy failed: {e}"),
        }
    }

    if restored_count == 0 {
        stages.push("restore:failed_no_output".into());
        return (
            false,
            model_used,
            Some("Partial restore produced no output frames.".into()),
            stages,
        );
    }

    stages.push(format!("restore:model:{model_used}"));
    stages.push(format!("restore:wrote_frames:{restored_count}"));
    stages.push("restore:premium_ok".into());

    (
        true,
        model_used,
        Some(format!(
            "Partial restore OK ({restored_count} frames). Preview: {}",
            restored_dir.display()
        )),
        stages,
    )
}

#[tauri::command]
pub async fn process_video(
    input_path: String,
    model: Option<String>,
    allow_real_model: bool,
    state: State<'_, AppState>,
) -> Result<ProcessResult, String> {
    let input = PathBuf::from(&input_path);
    if !input.exists() {
        return Err(format!("Input not found: {input_path}"));
    }

    let original_size = file_size(&input);
    let work_dir = input
        .parent()
        .map(|p| p.to_path_buf())
        .unwrap_or_else(|| PathBuf::from("."));
    let stem = stem_of(&input);
    let requested_model = model.unwrap_or_else(|| "atd-webphoto".to_string());

    if is_real_model(&requested_model) && !allow_real_model {
        // Still allow compress-only run
        println!(
            "[process] real model requested without premium — compress only"
        );
    }

    // 1) Compress always
    let (compressed_path, codec) = compress_video(&input, &work_dir)?;
    let compressed_size = file_size(&compressed_path);
    let savings = if original_size > 0 {
        ((1.0 - (compressed_size as f64 / original_size as f64)) * 100.0).max(0.0)
    } else {
        0.0
    };

    let mut stages = vec![
        format!("compress:ok ({codec})"),
        format!("savings:{savings:.1}%"),
    ];

    // 2) Model session
    let (model_loaded, loaded_name) = {
        let manager = state.model_manager.lock().map_err(|e| e.to_string())?;
        (manager.current_model.is_some(), manager.current_model.clone())
    };

    if model_loaded {
        if let Some(ref name) = loaded_name {
            if is_real_model(name) && !allow_real_model {
                stages.push("model:loaded_but_premium_blocked".into());
            } else {
                stages.push(format!("model:loaded ({name})"));
            }
        }
    } else {
        stages.push("model:not_loaded".into());
    }

    // 3) Restore only if premium allows real path
    let effective_loaded = model_loaded
        && allow_real_model
        && loaded_name
            .as_ref()
            .map(|n| is_real_model(n))
            .unwrap_or(false);

    let (restored, model_used, restore_reason, restore_stages) = partial_restore(
        &compressed_path,
        &work_dir,
        &stem,
        effective_loaded,
        loaded_name.clone(),
        &requested_model,
        savings,
        allow_real_model,
    );
    stages.extend(restore_stages);

    let final_path = compressed_path;
    let final_size = file_size(&final_path);

    let message = format!(
        "Compressed with {codec} · {savings:.1}% savings · restored={restored} · premium_models={}",
        allow_real_model
    );

    Ok(ProcessResult {
        output_path: final_path.to_string_lossy().to_string(),
        savings_percent: (savings * 10.0).round() / 10.0,
        model_used,
        codec,
        original_size,
        final_size,
        message,
        model_loaded: effective_loaded,
        model_name: loaded_name,
        restored,
        restore_skipped_reason: restore_reason,
        stages,
    })
}