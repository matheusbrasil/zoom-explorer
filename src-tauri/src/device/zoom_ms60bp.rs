pub const ZOOM_MANUFACTURER_ID: u8 = 0x52;
pub const MS60BP_DEVICE_ID: u8 = 0x6e;

pub fn supports_sysex() -> bool {
    true
}

pub fn matches_port_name(name: &str) -> bool {
    let lower = name.to_ascii_lowercase();
    lower.contains("zoom") && lower.contains("ms-60b")
}
