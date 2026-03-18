use std::collections::HashSet;

#[cfg(any(target_os = "windows", target_os = "macos", target_os = "linux"))]
use std::collections::HashMap;

#[cfg(any(target_os = "windows", target_os = "macos", target_os = "linux"))]
use midir::{Ignore, MidiInput, MidiInputConnection, MidiOutput, MidiOutputConnection};

use tauri::{AppHandle, Emitter};

use crate::models::{CommandError, DeviceInfoDto, MidiMessageEventDto, MidiPortsDto};

pub struct MidiService {
    open_inputs: HashSet<String>,
    open_outputs: HashSet<String>,
    #[cfg(any(target_os = "windows", target_os = "macos", target_os = "linux"))]
    input_connections: HashMap<String, MidiInputConnection<()>>,
    #[cfg(any(target_os = "windows", target_os = "macos", target_os = "linux"))]
    output_connections: HashMap<String, MidiOutputConnection>,
}

impl MidiService {
    pub fn new() -> Self {
        Self {
            open_inputs: HashSet::new(),
            open_outputs: HashSet::new(),
            #[cfg(any(target_os = "windows", target_os = "macos", target_os = "linux"))]
            input_connections: HashMap::new(),
            #[cfg(any(target_os = "windows", target_os = "macos", target_os = "linux"))]
            output_connections: HashMap::new(),
        }
    }

    pub fn list_midi_ports(&self) -> Result<MidiPortsDto, CommandError> {
        let (inputs, outputs) = list_ports_platform();

        let inputs = inputs
            .into_iter()
            .enumerate()
            .map(|(index, name)| {
                let id = format!("in:{index}");
                DeviceInfoDto {
                    id: id.clone(),
                    name,
                    state: "connected".to_string(),
                    connection: if self.open_inputs.contains(&id) {
                        "open".to_string()
                    } else {
                        "closed".to_string()
                    },
                }
            })
            .collect();

        let outputs = outputs
            .into_iter()
            .enumerate()
            .map(|(index, name)| {
                let id = format!("out:{index}");
                DeviceInfoDto {
                    id: id.clone(),
                    name,
                    state: "connected".to_string(),
                    connection: if self.open_outputs.contains(&id) {
                        "open".to_string()
                    } else {
                        "closed".to_string()
                    },
                }
            })
            .collect();

        Ok(MidiPortsDto { inputs, outputs })
    }

    pub fn open_input(&mut self, in_port_id: &str, app_handle: &AppHandle) -> Result<String, CommandError> {
        validate_port_id(in_port_id, "in")?;
        #[cfg(any(target_os = "windows", target_os = "macos", target_os = "linux"))]
        {
            if self.input_connections.contains_key(in_port_id) {
                self.open_inputs.insert(in_port_id.to_string());
                return Ok(in_port_id.to_string());
            }

            let port_index = parse_port_index(in_port_id)?;
            let mut midi_in = MidiInput::new("zoom-explorer").map_err(|error| {
                CommandError::new("MIDI_INIT_FAILED", format!("Failed to initialize MIDI input: {error}"))
            })?;
            midi_in.ignore(Ignore::None);

            let ports = midi_in.ports();
            let port = ports
                .get(port_index)
                .ok_or_else(|| CommandError::new("INVALID_PORT_ID", format!("Invalid input port id: {in_port_id}")))?
                .clone();

            let input_id = in_port_id.to_string();
            let input_id_for_callback = input_id.clone();
            let app_handle = app_handle.clone();

            let conn = midi_in
                .connect(
                    &port,
                    "zoom-explorer-input",
                    move |timestamp, message, _| {
                        let payload = MidiMessageEventDto {
                            in_port_id: input_id_for_callback.clone(),
                            data: message.to_vec(),
                            time_stamp: timestamp as f64,
                        };
                        let _ = app_handle.emit("midi_message", payload);
                    },
                    (),
                )
                .map_err(|error| {
                    CommandError::new("MIDI_OPEN_INPUT_FAILED", format!("Failed to open input {in_port_id}: {error}"))
                })?;

            self.input_connections.insert(input_id.clone(), conn);
        }

        self.open_inputs.insert(in_port_id.to_string());
        Ok(in_port_id.to_string())
    }

    pub fn close_input(&mut self, in_port_id: &str) -> Result<String, CommandError> {
        validate_port_id(in_port_id, "in")?;
        self.open_inputs.remove(in_port_id);
        #[cfg(any(target_os = "windows", target_os = "macos", target_os = "linux"))]
        {
            self.input_connections.remove(in_port_id);
        }
        Ok(in_port_id.to_string())
    }

    pub fn open_output(&mut self, out_port_id: &str) -> Result<String, CommandError> {
        validate_port_id(out_port_id, "out")?;
        #[cfg(any(target_os = "windows", target_os = "macos", target_os = "linux"))]
        {
            if self.output_connections.contains_key(out_port_id) {
                self.open_outputs.insert(out_port_id.to_string());
                return Ok(out_port_id.to_string());
            }

            let port_index = parse_port_index(out_port_id)?;
            let midi_out = MidiOutput::new("zoom-explorer").map_err(|error| {
                CommandError::new("MIDI_INIT_FAILED", format!("Failed to initialize MIDI output: {error}"))
            })?;

            let ports = midi_out.ports();
            let port = ports
                .get(port_index)
                .ok_or_else(|| CommandError::new("INVALID_PORT_ID", format!("Invalid output port id: {out_port_id}")))?
                .clone();

            let conn = midi_out.connect(&port, "zoom-explorer-output").map_err(|error| {
                CommandError::new("MIDI_OPEN_OUTPUT_FAILED", format!("Failed to open output {out_port_id}: {error}"))
            })?;
            self.output_connections.insert(out_port_id.to_string(), conn);
        }

        self.open_outputs.insert(out_port_id.to_string());
        Ok(out_port_id.to_string())
    }

    pub fn close_output(&mut self, out_port_id: &str) -> Result<String, CommandError> {
        validate_port_id(out_port_id, "out")?;
        self.open_outputs.remove(out_port_id);
        #[cfg(any(target_os = "windows", target_os = "macos", target_os = "linux"))]
        {
            self.output_connections.remove(out_port_id);
        }
        Ok(out_port_id.to_string())
    }

    pub fn disconnect_all(&mut self) {
        self.open_inputs.clear();
        self.open_outputs.clear();
        #[cfg(any(target_os = "windows", target_os = "macos", target_os = "linux"))]
        {
            self.input_connections.clear();
            self.output_connections.clear();
        }
    }

    pub fn send_midi_message(&mut self, out_port_id: &str, message: &[u8]) -> Result<bool, CommandError> {
        validate_port_id(out_port_id, "out")?;
        if message.is_empty() || message.len() > 8192 {
            return Err(CommandError::new("INVALID_MIDI_MESSAGE", "MIDI message size is invalid"));
        }
        if !self.open_outputs.contains(out_port_id) {
            return Err(CommandError::new("OUTPUT_NOT_OPEN", "MIDI output port is not open"));
        }
        #[cfg(any(target_os = "windows", target_os = "macos", target_os = "linux"))]
        {
            let connection = self.output_connections.get_mut(out_port_id).ok_or_else(|| {
                CommandError::new("OUTPUT_NOT_OPEN", "MIDI output port is not open")
            })?;
            connection.send(message).map_err(|error| {
                CommandError::new("MIDI_SEND_FAILED", format!("Failed to send MIDI message: {error}"))
            })?;
        }
        Ok(true)
    }

    pub fn send_sysex(&mut self, out_port_id: &str, sysex: &[u8]) -> Result<bool, CommandError> {
        validate_port_id(out_port_id, "out")?;
        if sysex.is_empty() || sysex.len() > 8192 {
            return Err(CommandError::new("INVALID_SYSEX", "SysEx payload size is invalid"));
        }
        if sysex.iter().any(|value| *value > 0x7f) {
            return Err(CommandError::new(
                "INVALID_SYSEX",
                "SysEx payload must be 7-bit bytes (without F0/F7)",
            ));
        }
        if !self.open_outputs.contains(out_port_id) {
            return Err(CommandError::new("OUTPUT_NOT_OPEN", "MIDI output port is not open"));
        }
        #[cfg(any(target_os = "windows", target_os = "macos", target_os = "linux"))]
        {
            let mut full_sysex = Vec::with_capacity(sysex.len() + 2);
            full_sysex.push(0xf0);
            full_sysex.extend_from_slice(sysex);
            full_sysex.push(0xf7);

            let connection = self.output_connections.get_mut(out_port_id).ok_or_else(|| {
                CommandError::new("OUTPUT_NOT_OPEN", "MIDI output port is not open")
            })?;
            connection.send(&full_sysex).map_err(|error| {
                CommandError::new("MIDI_SEND_FAILED", format!("Failed to send SysEx message: {error}"))
            })?;
        }
        Ok(true)
    }
}

fn validate_port_id(value: &str, expected_prefix: &str) -> Result<(), CommandError> {
    let mut parts = value.split(':');
    let prefix = parts.next();
    let index = parts.next();
    let extra = parts.next();
    let index_ok = index.and_then(|v| v.parse::<usize>().ok()).is_some();

    if prefix != Some(expected_prefix) || !index_ok || extra.is_some() {
        return Err(CommandError::new(
            "INVALID_PORT_ID",
            format!("Invalid {expected_prefix} port id: {value}"),
        ));
    }

    Ok(())
}

fn parse_port_index(value: &str) -> Result<usize, CommandError> {
    let (_, index_part) = value.split_once(':').ok_or_else(|| {
        CommandError::new("INVALID_PORT_ID", format!("Invalid port id: {value}"))
    })?;
    index_part.parse::<usize>().map_err(|_| {
        CommandError::new("INVALID_PORT_ID", format!("Invalid port id: {value}"))
    })
}

#[cfg(any(target_os = "windows", target_os = "macos", target_os = "linux"))]
fn list_ports_platform() -> (Vec<String>, Vec<String>) {
    use midir::{MidiInput, MidiOutput};

    let inputs = MidiInput::new("zoom-explorer")
        .ok()
        .map(|midi_in| {
            midi_in
                .ports()
                .iter()
                .filter_map(|port| midi_in.port_name(port).ok())
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();

    let outputs = MidiOutput::new("zoom-explorer")
        .ok()
        .map(|midi_out| {
            midi_out
                .ports()
                .iter()
                .filter_map(|port| midi_out.port_name(port).ok())
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();

    (inputs, outputs)
}

#[cfg(any(target_os = "android", target_os = "ios"))]
fn list_ports_platform() -> (Vec<String>, Vec<String>) {
    (Vec::new(), Vec::new())
}
