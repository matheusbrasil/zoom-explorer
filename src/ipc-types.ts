export type DeviceStateIPC = "connected" | "disconnected" | "unknown";

export type DeviceInfoDTO = {
  id: string;
  name: string;
  state: DeviceStateIPC;
  connection: "open" | "closed" | "pending" | "unknown";
};

export type MidiPortsDTO = {
  inputs: DeviceInfoDTO[];
  outputs: DeviceInfoDTO[];
};

export type MidiMessageEventDTO = {
  inPortId: string;
  data: number[];
  timeStamp: number;
};

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
  getSettings: () => Promise<Record<string, unknown>>;
  setSettings: (settings: Record<string, unknown>) => Promise<Record<string, unknown>>;
  getAppVersion: () => Promise<string>;
};
