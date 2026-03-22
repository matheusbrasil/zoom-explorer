use tauri::{AppHandle, State};

use crate::{
    models::{CommandError, ConnectMidiParams, MidiPortsDto, SendMidiMessageParams, SendSysexParams},
    AppState,
};

#[tauri::command]
pub fn list_midi_ports(state: State<'_, AppState>) -> Result<MidiPortsDto, CommandError> {
    let mut midi = state
        .midi
        .lock()
        .map_err(|_| CommandError::new("MUTEX_POISONED", "MIDI state lock poisoned"))?;
    midi.list_midi_ports()
}

#[tauri::command]
pub fn open_input(state: State<'_, AppState>, app_handle: AppHandle, in_port_id: String) -> Result<String, CommandError> {
    let mut midi = state
        .midi
        .lock()
        .map_err(|_| CommandError::new("MUTEX_POISONED", "MIDI state lock poisoned"))?;
    midi.open_input(&in_port_id, &app_handle)
}

#[tauri::command]
pub fn close_input(state: State<'_, AppState>, in_port_id: String) -> Result<String, CommandError> {
    let mut midi = state
        .midi
        .lock()
        .map_err(|_| CommandError::new("MUTEX_POISONED", "MIDI state lock poisoned"))?;
    midi.close_input(&in_port_id)
}

#[tauri::command]
pub fn open_output(state: State<'_, AppState>, out_port_id: String) -> Result<String, CommandError> {
    let mut midi = state
        .midi
        .lock()
        .map_err(|_| CommandError::new("MUTEX_POISONED", "MIDI state lock poisoned"))?;
    midi.open_output(&out_port_id)
}

#[tauri::command]
pub fn close_output(state: State<'_, AppState>, out_port_id: String) -> Result<String, CommandError> {
    let mut midi = state
        .midi
        .lock()
        .map_err(|_| CommandError::new("MUTEX_POISONED", "MIDI state lock poisoned"))?;
    midi.close_output(&out_port_id)
}

#[tauri::command]
pub fn connect_midi(
    state: State<'_, AppState>,
    app_handle: AppHandle,
    params: ConnectMidiParams,
) -> Result<ConnectMidiParams, CommandError> {
    let mut midi = state
        .midi
        .lock()
        .map_err(|_| CommandError::new("MUTEX_POISONED", "MIDI state lock poisoned"))?;
    let in_port_id = midi.open_input(&params.in_port_id, &app_handle)?;
    let out_port_id = midi.open_output(&params.out_port_id)?;
    Ok(ConnectMidiParams {
        in_port_id,
        out_port_id,
    })
}

#[tauri::command]
pub fn disconnect_midi(state: State<'_, AppState>) -> Result<bool, CommandError> {
    let mut midi = state
        .midi
        .lock()
        .map_err(|_| CommandError::new("MUTEX_POISONED", "MIDI state lock poisoned"))?;
    midi.disconnect_all();
    Ok(true)
}

#[tauri::command]
pub fn send_midi_message(
    state: State<'_, AppState>,
    params: SendMidiMessageParams,
) -> Result<bool, CommandError> {
    let mut midi = state
        .midi
        .lock()
        .map_err(|_| CommandError::new("MUTEX_POISONED", "MIDI state lock poisoned"))?;
    midi.send_midi_message(&params.out_port_id, &params.message)
}

#[tauri::command]
pub fn send_sysex(state: State<'_, AppState>, params: SendSysexParams) -> Result<bool, CommandError> {
    let mut midi = state
        .midi
        .lock()
        .map_err(|_| CommandError::new("MUTEX_POISONED", "MIDI state lock poisoned"))?;
    midi.send_sysex(&params.out_port_id, &params.sysex)
}
