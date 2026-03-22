use std::{
    fs,
    path::{Path, PathBuf},
};

use directories::ProjectDirs;
use serde_json::{json, Map, Value};

use crate::models::CommandError;

pub struct SettingsStore {
    file_path: PathBuf,
}

impl SettingsStore {
    pub fn new() -> Self {
        let file_path = resolve_settings_path();
        Self { file_path }
    }

    pub fn get_settings(&mut self) -> Result<Value, CommandError> {
        Ok(merge_settings(default_settings(), self.read_file()?))
    }

    pub fn set_settings(&mut self, partial_settings: Value) -> Result<Value, CommandError> {
        if !partial_settings.is_object() {
            return Err(CommandError::new("INVALID_SETTINGS", "Invalid settings payload"));
        }

        let next = merge_settings(self.get_settings()?, partial_settings);
        self.write_file(&next)?;
        Ok(next)
    }

    fn read_file(&self) -> Result<Value, CommandError> {
        if !self.file_path.is_file() {
            return Ok(json!({}));
        }

        let data = fs::read_to_string(&self.file_path).map_err(|error| {
            CommandError::new(
                "READ_SETTINGS_FAILED",
                format!("Failed reading settings file: {error}"),
            )
        })?;

        serde_json::from_str::<Value>(&data).map_err(|error| {
            CommandError::new(
                "PARSE_SETTINGS_FAILED",
                format!("Failed parsing settings file: {error}"),
            )
        })
    }

    fn write_file(&self, settings: &Value) -> Result<(), CommandError> {
        if let Some(parent) = self.file_path.parent() {
            fs::create_dir_all(parent).map_err(|error| {
                CommandError::new(
                    "CREATE_SETTINGS_DIR_FAILED",
                    format!("Failed creating settings directory: {error}"),
                )
            })?;
        }

        let json = serde_json::to_string_pretty(settings).map_err(|error| {
            CommandError::new(
                "SERIALIZE_SETTINGS_FAILED",
                format!("Failed serializing settings: {error}"),
            )
        })?;

        fs::write(&self.file_path, json).map_err(|error| {
            CommandError::new(
                "WRITE_SETTINGS_FAILED",
                format!("Failed writing settings file: {error}"),
            )
        })
    }
}

fn resolve_settings_path() -> PathBuf {
    if let Some(project_dirs) = ProjectDirs::from("is", "bios", "zoom-explorer") {
        return project_dirs.config_dir().join("settings.json");
    }

    Path::new(".").join("zoom-explorer-settings.json")
}

fn default_settings() -> Value {
    json!({
        "selectedMidiInPortId": "",
        "selectedMidiOutPortId": "",
        "sysexEnabled": true,
        "theme": "system",
        "ui": {},
        "deviceProfiles": {}
    })
}

fn merge_settings(base: Value, override_value: Value) -> Value {
    let mut base_obj = to_object(base);
    let override_obj = to_object(override_value);

    for (key, value) in override_obj {
        base_obj.insert(key, value);
    }

    Value::Object(base_obj)
}

fn to_object(value: Value) -> Map<String, Value> {
    match value {
        Value::Object(obj) => obj,
        _ => Map::new(),
    }
}
