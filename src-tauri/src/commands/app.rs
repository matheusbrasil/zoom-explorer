use std::{
    fs,
    path::{Path, PathBuf},
};

use base64::{engine::general_purpose::STANDARD, Engine};
use tauri::{AppHandle, Manager, State};

use crate::{
    models::{CommandError, PlatformCapabilitiesDto, SettingsDto},
    AppState,
};

#[tauri::command]
pub fn get_settings(state: State<'_, AppState>) -> Result<SettingsDto, CommandError> {
    let mut store = state
        .settings
        .lock()
        .map_err(|_| CommandError::new("MUTEX_POISONED", "Settings state lock poisoned"))?;
    store.get_settings()
}

#[tauri::command]
pub fn set_settings(state: State<'_, AppState>, settings: SettingsDto) -> Result<SettingsDto, CommandError> {
    let mut store = state
        .settings
        .lock()
        .map_err(|_| CommandError::new("MUTEX_POISONED", "Settings state lock poisoned"))?;
    store.set_settings(settings)
}

#[tauri::command]
pub fn get_app_version(app_handle: AppHandle) -> Result<String, CommandError> {
    Ok(app_handle.package_info().version.to_string())
}

#[tauri::command]
pub fn relaunch_app() -> Result<bool, CommandError> {
    Ok(false)
}

#[tauri::command]
pub fn get_platform_capabilities() -> Result<PlatformCapabilitiesDto, CommandError> {
    let platform = std::env::consts::OS.to_string();
    let mobile = cfg!(any(target_os = "android", target_os = "ios"));
    let desktop = cfg!(any(target_os = "windows", target_os = "macos", target_os = "linux"));
    let midi_supported = desktop;

    Ok(PlatformCapabilitiesDto {
        platform,
        desktop,
        mobile,
        midi_supported,
        sysex_supported: midi_supported,
    })
}

#[tauri::command]
pub fn read_app_file(app_handle: AppHandle, relative_path: String) -> Result<String, CommandError> {
    let safe_relative = sanitize_relative_path(&relative_path)?;
    let candidates = build_app_file_candidates(&app_handle, &safe_relative);

    for candidate in candidates {
        if candidate.is_file() {
            return fs::read_to_string(&candidate).map_err(|error| {
                CommandError::new(
                    "READ_FAILED",
                    format!("Failed reading file {}: {error}", candidate.display()),
                )
            });
        }
    }

    Err(CommandError::new(
        "NOT_FOUND",
        format!("App file not found: {}", safe_relative.display()),
    ))
}

#[tauri::command]
pub fn read_app_binary(app_handle: AppHandle, relative_path: String) -> Result<String, CommandError> {
    let safe_relative = sanitize_relative_path(&relative_path)?;
    let candidates = build_app_file_candidates(&app_handle, &safe_relative);

    for candidate in candidates {
        if candidate.is_file() {
            let bytes = fs::read(&candidate).map_err(|error| {
                CommandError::new(
                    "READ_FAILED",
                    format!("Failed reading file {}: {error}", candidate.display()),
                )
            })?;
            return Ok(STANDARD.encode(bytes));
        }
    }

    Err(CommandError::new(
        "NOT_FOUND",
        format!("App file not found: {}", safe_relative.display()),
    ))
}

fn build_app_file_candidates(app_handle: &AppHandle, safe_relative: &Path) -> Vec<PathBuf> {
    let mut candidates = Vec::<PathBuf>::new();

    if let Ok(cwd) = std::env::current_dir() {
        candidates.push(cwd.join("dist").join(safe_relative));
        candidates.push(cwd.join("..").join("dist").join(safe_relative));
    }
    if let Ok(resource_dir) = app_handle.path().resource_dir() {
        candidates.push(resource_dir.join("dist").join(safe_relative));
        candidates.push(resource_dir.join(safe_relative));
    }
    if let Ok(exe_path) = std::env::current_exe() {
        if let Some(exe_dir) = exe_path.parent() {
            candidates.push(exe_dir.join("dist").join(safe_relative));
            candidates.push(exe_dir.join("..").join("dist").join(safe_relative));
        }
    }
    candidates
}

fn sanitize_relative_path(input: &str) -> Result<PathBuf, CommandError> {
    if input.is_empty() || input.len() > 260 {
        return Err(CommandError::new("INVALID_PATH", "Invalid app file path"));
    }

    let normalized = input.replace('\\', "/").trim_start_matches('/').to_string();
    if normalized.is_empty() {
        return Err(CommandError::new("INVALID_PATH", "Invalid app file path"));
    }

    let path = Path::new(&normalized);
    if path.is_absolute() || normalized.starts_with("..") || normalized.contains("/../") {
        return Err(CommandError::new("INVALID_PATH", "Invalid app file path"));
    }

    Ok(PathBuf::from(normalized))
}
