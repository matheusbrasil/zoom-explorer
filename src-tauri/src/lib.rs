mod commands;
mod device;
mod logging;
mod midi;
mod models;
mod persistence;

use std::sync::Mutex;

use midi::MidiService;
use persistence::SettingsStore;

pub struct AppState {
    pub midi: Mutex<MidiService>,
    pub settings: Mutex<SettingsStore>,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    logging::init_logging();

    tauri::Builder::default()
        .manage(AppState {
            midi: Mutex::new(MidiService::new()),
            settings: Mutex::new(SettingsStore::new()),
        })
        .invoke_handler(tauri::generate_handler![
            commands::midi::list_midi_ports,
            commands::midi::open_input,
            commands::midi::close_input,
            commands::midi::open_output,
            commands::midi::close_output,
            commands::midi::connect_midi,
            commands::midi::disconnect_midi,
            commands::midi::send_midi_message,
            commands::midi::send_sysex,
            commands::app::get_settings,
            commands::app::set_settings,
            commands::app::read_app_file,
            commands::app::read_app_binary,
            commands::app::get_app_version,
            commands::app::relaunch_app,
            commands::app::get_platform_capabilities
        ])
        .run(tauri::generate_context!())
        .expect("error while running Zoom Explorer Tauri application");
}
