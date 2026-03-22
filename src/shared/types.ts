export type DeviceState = "connected" | "disconnected" | "unknown";

export type DeviceInfoDTO = {
  id: string;
  name: string;
  state: DeviceState;
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

export type PlatformCapabilitiesDTO = {
  platform: string;
  desktop: boolean;
  mobile: boolean;
  midiSupported: boolean;
  sysexSupported: boolean;
};
