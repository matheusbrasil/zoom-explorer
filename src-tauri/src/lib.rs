mod commands;
mod device;
mod logging;
mod midi;
mod models;
mod persistence;

use std::sync::Mutex;

use midi::{MidiService, list_port_names_snapshot};
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
        .setup(|app| {
            // Background thread: emit "midi_ports_changed" whenever the OS port list
            // changes (device plugged/unplugged). The TypeScript side subscribes to
            // this event and refreshes the port list on demand instead of polling.
            let app_handle = app.handle().clone();
            std::thread::spawn(move || {
                use tauri::Emitter;
                let mut prev = list_port_names_snapshot();
                loop {
                    std::thread::sleep(std::time::Duration::from_millis(2000));
                    let current = list_port_names_snapshot();
                    if current != prev {
                        let _ = app_handle.emit("midi_ports_changed", ());
                        prev = current;
                    }
                }
            });
            Ok(())
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
