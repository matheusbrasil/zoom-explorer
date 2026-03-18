# AGENTS.md — Tauri 2.0 + Rust (TypeScript Required) MIDI Application Agent

## Mission

You are responsible for evolving an existing application into a stable, production-ready,
secure, cross-platform app by migrating from Electron to **Tauri 2.0**, using:

- Tauri 2.0
- Rust (native application core)
- TypeScript (strict mode) for the Web UI and shared contracts

The application controls a MIDI device, specifically the **Zoom MS-60B+**, including **SysEx**
communication when supported by the platform.

The primary goal is to improve architecture, reliability, UX, and cross-platform compatibility
across **Windows, macOS, Linux, iOS, and Android**, using a single codebase approach.

---

## Core Objectives

1. Preserve and document existing behavior before refactoring or migration.
2. Migrate incrementally from Electron to Tauri 2.0 (avoid big-bang rewrites).
3. Modularize the architecture with clear separation between UI and native core.
4. Ensure real cross-platform compatibility (desktop and mobile).
5. Improve UX, stability, and diagnostics.
6. Keep strong typing with TypeScript (strict) and explicit Rust models.
7. Maintain minimal and safe command exposure between UI and Rust core.
8. Deliver reproducible builds for all target platforms.

---

## Mandatory Stack

- Tauri 2.0
- Rust
- TypeScript (strict mode enabled)

---

## UI Stack (Required)

- Web UI rendered inside the system WebView
- Preferred:
  - React
  - Vite
  - Tailwind CSS
  - shadcn/ui (optional)

Rules:
- UI must be responsive and mobile-friendly.
- UI must not contain business logic or native access logic.
- TypeScript is mandatory for UI and shared API contracts.

---

## Architecture Principles

The application is composed of:
- A Web UI (HTML/CSS/TypeScript)
- A native application core written in Rust

The Web UI communicates with the Rust core exclusively through explicit commands and events.

---

## Separation of Responsibilities

### Rust Core (Tauri Backend)

Responsibilities:
- MIDI device discovery (IN/OUT ports) where supported
- MIDI connection management
- SysEx transmission and reception where supported
- Zoom MS-60B+ device communication logic
- Application settings persistence
- Logging and diagnostics
- Secure command handlers (explicit allowlist)
- Platform capability detection (desktop vs mobile)

---

### Web UI (TypeScript)

Responsibilities:
- UI and user interactions
- Connection setup wizard
- Preset and patch interface
- MIDI monitor display (when available)
- Settings screen
- Status indicators and notifications
- Graceful fallback when MIDI or SysEx are unavailable

---

### Shared Contract Layer

- Shared DTOs and command payload schemas
- Enums and typed error models
- Versioned API contract between UI and Rust core

---

## MIDI Architecture Rules

- All MIDI logic must run in the Rust core.
- The TypeScript UI must never access native MIDI libraries directly.
- Communication must occur only through explicit commands and events.
- No generic forwarding or dynamic command execution.
- All command inputs must be validated.

---

## Command & Event API Contract (Example)

Commands:
- list_midi_ports()
- connect_midi({ inPortId, outPortId })
- disconnect_midi()
- send_midi_message(message)
- send_sysex(payload)
- get_settings()
- set_settings(settings)
- get_app_version()
- get_platform_capabilities()

Events:
- midi_message
- midi_connection_state
- diagnostics_log
- error

Rules:
- Validate inputs and reject unknown fields.
- Return typed errors.
- Never expose filesystem, process, or network access without explicit need.

---

## Zoom MS-60B+ Device Handling

Treat the Zoom MS-60B+ as a strict, documented device profile.

Do NOT invent protocol behavior.

Document and implement:
- Manufacturer ID
- SysEx structure
- Checksum rules (if applicable)
- Payload limits

All Zoom-specific logic must be isolated in a single module.

Conceptual interface:
- supportsSysex
- matchesPortName()
- encodeCommand()
- decodeResponse()

---

## Platform & Capability Rules

Target platforms:
- Windows
- macOS
- Linux
- iOS
- Android

Rules:
- Desktop platforms are the primary environment for full MIDI workflows.
- Mobile platforms must not assume MIDI or SysEx availability.
- UI behavior must adapt based on platform capability flags.

---

## Suggested Project Structure

Adapt incrementally to the existing repository:

/src
  /core-rust
    /midi
    /device
    /commands
    /persistence
    /logging
  /ui
    /app
    /components
    /features
    /shared
      api-contract.ts
      types.ts

---

## Persistence

Use a simple cross-platform persistence solution compatible with Tauri.

Persist:
- Selected MIDI IN/OUT ports
- SysEx enabled or disabled
- UI preferences
- Theme
- Device profile settings

---

## Logging & Diagnostics

Rust core must provide structured logging.

Include:
- Debug mode
- Filtered MIDI message logging
- Error context (command, device state, platform capabilities)

UI must expose:
- Diagnostics panel
- Copy-to-clipboard functionality
- App version
- OS and platform info
- Active MIDI ports (when available)

---

## Development Workflow

1. Run and document current Electron behavior.
2. Bootstrap the Tauri application shell.
3. Introduce Rust logging and diagnostics early.
4. Replace Electron IPC with explicit Tauri commands and events.
5. Move MIDI logic into the Rust core incrementally.
6. Implement platform capability detection and UI feature gating.
7. Stabilize desktop builds (Windows, macOS, Linux).
8. Enable mobile builds (iOS, Android) with graceful limitations.
9. Add packaging and CI verification.
10. Update documentation.

---

## Code Quality Rules

- TypeScript strict mode; no unnecessary `any`
- Rust idiomatic code; no unsafe unless justified and documented
- Clear domain separation
- No business logic in UI components
- Graceful error handling for:
  - Missing ports
  - Device busy
  - SysEx unavailable
  - Disconnection
  - Unsupported platform capabilities

---

## UI / UX Guidelines

UX must provide:
- Clear status indicators
- Retry actions
- Toast notifications
- No silent failures
- Mobile-friendly layout

Connection states:
- Unsupported
- Disconnected
- Connecting
- Connected
- Error

---

## Definition of Done

The project is considered complete when:

- The app runs in development mode on all target platforms.
- MIDI communication works reliably where supported.
- Zoom MS-60B+ SysEx behaves according to the existing implementation.
- Settings persist between sessions.
- UI reflects connection state correctly and adapts to platform limitations.
- Build artifacts can be generated for all platforms.
- Documentation explains setup, permissions, and packaging.

---

## Agent Behavior Rules

- Never rewrite working logic without reason.
- Prefer incremental refactors.
- Always validate protocol assumptions.
- Avoid speculative implementation of undocumented MIDI behavior.
- Prioritize stability over feature expansion.
- Keep changes modular, testable, and reviewable.

---

End of Agent specification.