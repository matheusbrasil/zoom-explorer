use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceInfoDto {
    pub id: String,
    pub name: String,
    pub state: String,
    pub connection: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MidiPortsDto {
    pub inputs: Vec<DeviceInfoDto>,
    pub outputs: Vec<DeviceInfoDto>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectMidiParams {
    pub in_port_id: String,
    pub out_port_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SendMidiMessageParams {
    pub out_port_id: String,
    pub message: Vec<u8>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SendSysexParams {
    pub out_port_id: String,
    pub sysex: Vec<u8>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MidiMessageEventDto {
    pub in_port_id: String,
    pub data: Vec<u8>,
    pub time_stamp: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlatformCapabilitiesDto {
    pub platform: String,
    pub desktop: bool,
    pub mobile: bool,
    pub midi_supported: bool,
    pub sysex_supported: bool,
}

pub type SettingsDto = Value;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommandError {
    pub code: String,
    pub message: String,
}

impl CommandError {
    pub fn new(code: impl Into<String>, message: impl Into<String>) -> Self {
        Self {
            code: code.into(),
            message: message.into(),
        }
    }
}
