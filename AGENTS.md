# Agent.md — Electron MIDI Desktop Application Agent

## Mission

You are responsible for evolving an existing codebase into a stable, production-ready, cross-platform desktop application using:

- Electron
- Node.js
- TypeScript
- A modern UI framework (React preferred)

The application controls a MIDI device, specifically the Zoom MS-60B+, including SysEx communication when supported.

The goal is to improve architecture, reliability, UX, and cross-platform compatibility (Windows, macOS, Linux) without rewriting everything from scratch.

---

# Core Objectives

1. Preserve and understand the existing behavior before refactoring.
2. Modularize the architecture.
3. Ensure real cross-platform compatibility.
4. Improve user experience and stability.
5. Keep strong TypeScript typing.
6. Maintain safe and minimal IPC exposure.
7. Deliver reproducible builds for Windows, macOS, and Linux.

---

# Mandatory Stack

- Electron
- Node.js
- TypeScript (strict mode enabled)

---

# Recommended UI Stack

Preferred:
- React (renderer process)
- Vite (renderer build tool)
- Tailwind CSS
- shadcn/ui (optional but recommended)

Alternative:
- Svelte (only if existing codebase already uses it)

---

# Architecture Principles

## Process Separation

### Main Process Responsibilities
- MIDI device discovery (IN/OUT ports)
- MIDI connection management
- SysEx transmission and reception
- Device communication logic
- Application settings persistence
- Logging
- Secure IPC handlers

### Renderer Process Responsibilities
- UI and user interactions
- Connection setup wizard
- Preset/patch interface
- MIDI monitor display
- Settings screen
- Status indicators and notifications

### Shared Layer
- Shared types
- MIDI message definitions
- DTOs
- Enums

---

# MIDI Architecture Rules

- All MIDI logic must run in the main process.
- The renderer must never access Node MIDI libraries directly.
- Communication must occur through a strict IPC API exposed via preload.
- No generic IPC forwarding.

---

# IPC API Contract (Example)

Expose only necessary methods via preload:

- listMidiPorts()
- connectMidi({ inPortId, outPortId })
- disconnectMidi()
- sendMidiMessage(message)
- sendSysex(payload)
- onMidiMessage(callback)
- getSettings()
- setSettings(settings)
- getAppVersion()

IPC must:
- Use contextIsolation: true
- Use nodeIntegration: false
- Validate inputs
- Handle errors safely

---

# Zoom MS-60B+ Device Handling

Treat the Zoom MS-60B+ as a structured device profile.

Do NOT invent protocol behavior.

Use and document:
- Manufacturer ID
- SysEx structure
- Checksum rules (if any)
- Payload limits

Encapsulate device logic in:

DeviceProfile:
- supportsSysex
- matchesPortName()
- encodeCommand()
- decodeResponse()

All Zoom-specific logic must be isolated in one module.

---

# Suggested Project Structure
/src
/main
main.ts
/midi
/ipc
/persistence
/logging
/preload
preload.ts
/renderer
main.tsx
/app
/components
/features
/shared
types.ts


Adapt this to the existing repository structure incrementally.

---

# Cross-Platform Requirements

The application must work on:

- Windows
- macOS
- Linux

Use:
- electron-builder (preferred)

Generate:
- Windows: NSIS installer (.exe)
- macOS: .dmg
- Linux: AppImage (and optionally .deb)

If native MIDI modules are used:
- Ensure rebuild compatibility with Electron
- Avoid unnecessary native dependencies in renderer

---

# Persistence

Use a simple cross-platform solution:
- electron-store (recommended)

Persist:
- Selected MIDI IN/OUT ports
- SysEx enabled/disabled
- UI preferences
- Theme
- Device profile settings

---

# Logging & Diagnostics

Implement structured logging in main process.

Recommended:
- pino or winston

Include:
- Debug mode
- MIDI message logging (filtered)
- Error context

UI must include:
- MIDI monitor panel
- Copy diagnostics button
- App version
- OS info
- Active MIDI ports

---

# Development Workflow

1. Run and document current behavior.
2. Identify OS-specific issues.
3. Introduce logging.
4. Isolate MIDI logic.
5. Refactor IPC layer.
6. Improve UI states:
   - Disconnected
   - Connecting
   - Connected
   - Error
7. Harden cross-platform compatibility.
8. Add packaging configuration.
9. Update documentation.

---

# Code Quality Rules

- Strict TypeScript
- No unnecessary `any`
- Clear domain separation
- No business logic inside UI components
- Graceful error handling for:
  - Missing ports
  - Device busy
  - SysEx blocked
  - Disconnection

---

# UI/UX Guidelines

Layout suggestion:

Sidebar:
- Connection status
- Port selection
- Device info

Main Area:
- Preset controls
- Patch management
- Device actions

Bottom Drawer:
- MIDI monitor

UX must provide:
- Clear status indicators
- Retry buttons
- Toast notifications
- No silent failures

---

# Definition of Done

The project is considered complete when:

- The app runs locally in dev mode on Windows, macOS, and Linux.
- MIDI connection and communication work reliably.
- Zoom MS-60B+ SysEx works according to existing implementation.
- Settings persist between sessions.
- UI reflects connection state correctly.
- Build artifacts can be generated for all three platforms.
- Documentation explains setup and packaging.

---

# Agent Behavior Rules

- Never rewrite working logic without reason.
- Prefer incremental refactors.
- Always validate protocol assumptions.
- Avoid speculative implementation of undocumented MIDI behavior.
- Prioritize stability over feature expansion.
- Keep changes modular and testable.

---

End of Agent specification.
