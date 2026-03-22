import {
  MidiMessageEventDTO,
  MidiPortsDTO,
  PlatformCapabilitiesDTO,
  DeviceInfoDTO,
  DeviceState,
} from "./types.js";

export type DeviceStateIPC = DeviceState;

export type { DeviceInfoDTO, MidiMessageEventDTO, MidiPortsDTO, PlatformCapabilitiesDTO };

export type ZoomExplorerAPI = {
  listMidiPorts: () => Promise<MidiPortsDTO>;
  openInput: (inPortId: string) => Promise<string>;
  closeInput: (inPortId: string) => Promise<string>;
  openOutput: (outPortId: string) => Promise<string>;
  closeOutput: (outPortId: string) => Promise<string>;
  connectMidi: (params: { inPortId: string; outPortId: string }) => Promise<{ inPortId: string; outPortId: string }>;
  disconnectMidi: () => Promise<boolean>;
  sendMidiMessage: (params: { outPortId: string; message: number[] }) => Promise<boolean>;
  sendSysex: (params: { outPortId: string; sysex: number[] }) => Promise<boolean>;
  onMidiMessage: (callback: (payload: MidiMessageEventDTO) => void) => () => void;
  /** Subscribe to port hot-plug events emitted by Rust when the OS port list changes.
   *  Returns an unsubscribe function. Prefer this over client-side polling. */
  onMidiPortsChanged: (callback: () => void) => () => void;
  getSettings: () => Promise<Record<string, unknown>>;
  setSettings: (settings: Record<string, unknown>) => Promise<Record<string, unknown>>;
  readAppFile: (relativePath: string) => Promise<string>;
  readAppBinary?: (relativePath: string) => Promise<string>;
  getAppVersion: () => Promise<string>;
  relaunchApp: () => Promise<boolean>;
  getPlatformCapabilities: () => Promise<PlatformCapabilitiesDTO>;
};
