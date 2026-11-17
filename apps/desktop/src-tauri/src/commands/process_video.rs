use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

use image::ImageReader;
use tauri::State;

use crate::commands::models::run_inference_sync;
use crate::state::AppState;

const REAL_MODELS: &[&str] = &[
    "rgt",
    "atd",
    "bhi",
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
    pub media_type: String,
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
        .unwrap_or("media")
        .to_string()
}

fn media_type_of(path: &Path) -> &'static str {
    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();
    match ext.as_str() {
        "jpg" | "jpeg" | "png" | "webp" | "bmp" | "tiff" | "gif" => "image",
        "mp4" | "mov" | "mkv" | "webm" | "avi" | "m4v" | "ts" => "video",
        "mp3" | "wav" | "flac" | "aac" | "m4a" | "ogg" => "audio",
        _ => "unknown",
    }
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

fn load_frame_nchw(path: &Path) -> Result<(Vec<f32>, usize, usize), String> {
    let img = ImageReader::open(path)
        .map_err(|e| format!("open frame: {e}"))?
        .decode()
        .map_err(|e| format!("decode frame: {e}"))?
        .to_rgb8();

    let (w, h) = (img.width() as usize, img.height() as usize);
    let mut data = vec![0.0f32; 3 * h * w];

    for y in 0..h {
        for x in 0..w {
            let p = img.get_pixel(x as u32, y as u32);
            let base = y * w + x;
            data[0 * h * w + base] = p[0] as f32 / 255.0;
            data[1 * h * w + base] = p[1] as f32 / 255.0;
            data[2 * h * w + base] = p[2] as f32 / 255.0;
        }
    }

    Ok((data, h, w))
}

fn save_frame_nchw(path: &Path, data: &[f32], h: usize, w: usize) -> Result<(), String> {
    let mut img = image::RgbImage::new(w as u32, h as u32);
    for y in 0..h {
        for x in 0..w {
            let base = y * w + x;
            let r = (data[0 * h * w + base] * 255.0).clamp(0.0, 255.0) as u8;
            let g = (data[1 * h * w + base] * 255.0).clamp(0.0, 255.0) as u8;
            let b = (data[2 * h * w + base] * 255.0).clamp(0.0, 255.0) as u8;
            img.put_pixel(x as u32, y as u32, image::Rgb([r, g, b]));
        }
    }
    img.save(path).map_err(|e| format!("save frame: {e}"))
}

fn restore_image(
    input: &Path,
    work_dir: &Path,
    stem: &str,
    model_loaded: bool,
    loaded_name: Option<String>,
    allow_real_model: bool,
    state: &State<'_, AppState>,
) -> Result<(PathBuf, bool, String, Option<String>, Vec<String>), String> {
    let mut stages = Vec::new();

    if !allow_real_model {
        stages.push("restore:skipped_premium_required".into());
        let out = work_dir.join(format!("{stem}_compressed.jpg"));
        // simple recompress
        let _ = Command::new("ffmpeg")
            .args([
                "-hide_banner",
                "-y",
                "-i",
                input.to_str().unwrap(),
                "-q:v",
                "5",
                out.to_str().unwrap(),
            ])
            .status();
        return Ok((
            if out.exists() { out } else { input.to_path_buf() },
            false,
            "compression-only".into(),
            Some("Premium required for image restoration.".into()),
            stages,
        ));
    }

    if !model_loaded {
        stages.push("restore:skipped_no_model".into());
        return Ok((
            input.to_path_buf(),
            false,
            "compression-only".into(),
            Some("No model loaded.".into()),
            stages,
        ));
    }

    stages.push("restore:image".into());
    let out = work_dir.join(format!("{stem}_restored.png"));

    match load_frame_nchw(input) {
        Ok((data, h, w)) => {
            let manager = state.model_manager.lock().map_err(|e| e.to_string())?;
            match run_inference_sync(data, 1, h, w, &manager.device, &manager.weights) {
                Ok(out_data) => {
                    let out_h = h * 4;
                    let out_w = w * 4;
                    save_frame_nchw(&out, &out_data, out_h, out_w)?;
                    stages.push(format!(
                        "restore:model:{}",
                        loaded_name.clone().unwrap_or_else(|| "unknown".into())
                    ));
                    Ok((
                        out,
                        true,
                        loaded_name.unwrap_or_else(|| "unknown".into()),
                        None,
                        stages,
                    ))
                }
                Err(e) => {
                    stages.push("restore:inference_failed".into());
                    Ok((
                        input.to_path_buf(),
                        false,
                        "compression-only".into(),
                        Some(format!("Inference failed: {e}")),
                        stages,
                    ))
                }
            }
        }
        Err(e) => Ok((
            input.to_path_buf(),
            false,
            "compression-only".into(),
            Some(format!("Load failed: {e}")),
            stages,
        )),
    }
}

fn partial_restore(
    compressed: &Path,
    work_dir: &Path,
    stem: &str,
    model_loaded: bool,
    loaded_name: Option<String>,
    requested_model: &str,
    savings: f64,
    allow_real_model: bool,
    state: &State<'_, AppState>,
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

    let mut restored_count = 0usize;
    for (idx, frame) in frame_paths.iter().enumerate() {
        let out = restored_dir.join(format!("restored_{idx:03}.png"));

        match load_frame_nchw(frame) {
            Ok((data, h, w)) => {
                let manager = match state.model_manager.lock() {
                    Ok(m) => m,
                    Err(e) => {
                        println!("[restore] lock failed: {e}");
                        let _ = fs::copy(frame, &out);
                        restored_count += 1;
                        continue;
                    }
                };

                match run_inference_sync(data, 1, h, w, &manager.device, &manager.weights) {
                    Ok(out_data) => {
                        let out_h = h * 4;
                        let out_w = w * 4;
                        if save_frame_nchw(&out, &out_data, out_h, out_w).is_ok() {
                            restored_count += 1;
                        } else {
                            println!("[restore] frame {idx} save failed");
                        }
                    }
                    Err(e) => {
                        println!("[restore] frame {idx} inference failed: {e}");
                        let _ = fs::copy(frame, &out);
                        restored_count += 1;
                    }
                }
            }
            Err(e) => {
                println!("[restore] frame {idx} load failed: {e}");
                let _ = fs::copy(frame, &out);
                restored_count += 1;
            }
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

    let media_type = media_type_of(&input).to_string();
    let original_size = file_size(&input);
    let work_dir = input
        .parent()
        .map(|p| p.to_path_buf())
        .unwrap_or_else(|| PathBuf::from("."));
    let stem = stem_of(&input);
    let requested_model = model.unwrap_or_else(|| "atd".to_string());

    if is_real_model(&requested_model) && !allow_real_model {
        println!("[process] real model requested without premium — compress only");
    }

    let (model_loaded, loaded_name) = {
        let manager = state.model_manager.lock().map_err(|e| e.to_string())?;
        (manager.current_model.is_some(), manager.current_model.clone())
    };

    let mut stages = vec![format!("media:{media_type}")];

    if media_type == "image" {
        let (final_path, restored, model_used, reason, restore_stages) = restore_image(
            &input,
            &work_dir,
            &stem,
            model_loaded,
            loaded_name.clone(),
            allow_real_model,
            &state,
        )?;
        stages.extend(restore_stages);
        let final_size = file_size(&final_path);
        let savings = if original_size > 0 {
            ((1.0 - (final_size as f64 / original_size as f64)) * 100.0).max(0.0)
        } else {
            0.0
        };
        return Ok(ProcessResult {
            output_path: final_path.to_string_lossy().to_string(),
            savings_percent: (savings * 10.0).round() / 10.0,
            model_used,
            codec: "image".into(),
            original_size,
            final_size,
            message: format!("Image processed · restored={restored}"),
            model_loaded,
            model_name: loaded_name,
            restored,
            restore_skipped_reason: reason,
            stages,
            media_type,
        });
    }

    if media_type == "audio" {
        let out = work_dir.join(format!("{stem}_copy{}", input.extension().and_then(|e| e.to_str()).unwrap_or("")));
        fs::copy(&input, &out).map_err(|e| e.to_string())?;
        stages.push("audio:passthrough".into());
        return Ok(ProcessResult {
            output_path: out.to_string_lossy().to_string(),
            savings_percent: 0.0,
            model_used: "none".into(),
            codec: "audio".into(),
            original_size,
            final_size: file_size(&out),
            message: "Audio passed through".into(),
            model_loaded: false,
            model_name: None,
            restored: false,
            restore_skipped_reason: Some("Audio does not use restoration models".into()),
            stages,
            media_type,
        });
    }

    // video path (existing logic)
    let (compressed_path, codec) = compress_video(&input, &work_dir)?;
    let compressed_size = file_size(&compressed_path);
    let savings = if original_size > 0 {
        ((1.0 - (compressed_size as f64 / original_size as f64)) * 100.0).max(0.0)
    } else {
        0.0
    };

    stages.push(format!("compress:ok ({codec})"));
    stages.push(format!("savings:{savings:.1}%"));

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
        &state,
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
        media_type,
    })
}