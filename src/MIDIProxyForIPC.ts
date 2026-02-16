import { shouldLog, LogLevel } from "./Logger.js";
import { ZoomExplorerAPI } from "./ipc-types.js";
import {
  ALL_MIDI_DEVICES,
  ConnectionListenerType,
  DeviceID,
  DeviceInfo,
  DeviceState,
  ListenerType,
  MessageType,
  MIDIProxy,
  PortType,
} from "./midiproxy.js";
import { getChannelMessage } from "./miditools.js";

export class MIDIProxyForIPC extends MIDIProxy {
  private api: ZoomExplorerAPI;
  private inputMap = new Map<DeviceID, DeviceInfo>();
  private outputMap = new Map<DeviceID, DeviceInfo>();
  private midiMessageListenerMap = new Map<DeviceID, ListenerType[]>();
  private connectionStateChangeListeners = new Array<ConnectionListenerType>();
  private unsubscribeMidi: (() => void) | undefined;

  constructor(api: ZoomExplorerAPI) {
    super();
    this.api = api;
    this.midiMessageListenerMap.set(ALL_MIDI_DEVICES, new Array<ListenerType>());
  }

  get inputs() {
    return new Map(this.inputMap);
  }

  get outputs() {
    return new Map(this.outputMap);
  }

  async enable(): Promise<boolean> {
    const ports = await this.api.listMidiPorts();
    this.inputMap = new Map(ports.inputs.map((d) => [d.id, d]));
    this.outputMap = new Map(ports.outputs.map((d) => [d.id, d]));

    if (!this.unsubscribeMidi) {
      this.unsubscribeMidi = this.api.onMidiMessage((payload) => {
        const data = Uint8Array.from(payload.data);
        this.onMIDIMessage(payload.inPortId, data, payload.timeStamp);
      });
    }
    this.enabled = true;
    return true;
  }

  isOutputConnected(id: DeviceID): boolean {
    const info = this.outputMap.get(id);
    return info !== undefined && info.state !== "disconnected";
  }

  isInputConnected(id: DeviceID): boolean {
    const info = this.inputMap.get(id);
    return info !== undefined && info.state !== "disconnected";
  }

  async openInput(id: DeviceID): Promise<DeviceID> {
    const result = await this.api.openInput(id);
    this.ensureInputListenerList(id);
    this.updateInputConnection(id, "open");
    return result;
  }

  async closeInput(deviceHandle: DeviceID): Promise<DeviceID> {
    const result = await this.api.closeInput(deviceHandle);
    this.midiMessageListenerMap.set(deviceHandle, new Array<ListenerType>());
    this.updateInputConnection(deviceHandle, "closed");
    return result;
  }

  async closeAllInputs(): Promise<void> {
    for (const id of this.inputMap.keys()) {
      await this.closeInput(id);
    }
  }

  getInputInfo(id: DeviceID): DeviceInfo {
    const info = this.inputMap.get(id);
    if (!info) {
      throw new Error(`No input found with ID "${id}"`);
    }
    return info;
  }

  async openOutput(id: DeviceID): Promise<DeviceID> {
    const result = await this.api.openOutput(id);
    this.updateOutputConnection(id, "open");
    return result;
  }

  async closeOutput(deviceHandle: DeviceID): Promise<DeviceID> {
    const result = await this.api.closeOutput(deviceHandle);
    this.updateOutputConnection(deviceHandle, "closed");
    return result;
  }

  async closeAllOutputs(): Promise<void> {
    for (const id of this.outputMap.keys()) {
      await this.closeOutput(id);
    }
  }

  getOutputInfo(id: DeviceID): DeviceInfo {
    const info = this.outputMap.get(id);
    if (!info) {
      throw new Error(`No output found with ID "${id}"`);
    }
    return info;
  }

  send(deviceHandle: DeviceID, data: number[] | Uint8Array): void {
    void this.api.sendMidiMessage({ outPortId: deviceHandle, message: Array.from(data) });
  }

  addListener(deviceHandle: DeviceID, listener: ListenerType): void {
    this.ensureInputListenerList(deviceHandle);
    const listeners = this.midiMessageListenerMap.get(deviceHandle);
    if (!listeners) {
      throw new Error(`No listener list for device "${deviceHandle}"`);
    }
    listeners.push(listener);
  }

  removeListener(deviceHandle: DeviceID, listener: ListenerType): void {
    const listeners = this.midiMessageListenerMap.get(deviceHandle);
    if (!listeners) {
      return;
    }
    this.midiMessageListenerMap.set(deviceHandle, listeners.filter((l) => l !== listener));
  }

  addConnectionListener(listener: ConnectionListenerType): void {
    this.connectionStateChangeListeners.push(listener);
  }

  removeConnectionListener(listener: ConnectionListenerType): void {
    this.connectionStateChangeListeners = this.connectionStateChangeListeners.filter((l) => l !== listener);
  }

  private ensureInputListenerList(deviceHandle: DeviceID): void {
    if (!this.midiMessageListenerMap.has(deviceHandle)) {
      this.midiMessageListenerMap.set(deviceHandle, new Array<ListenerType>());
    }
  }

  private onMIDIMessage(deviceHandle: DeviceID, data: Uint8Array, timeStamp: number): void {
    let mute = false;
    const muteStates = this.getMuteStates(deviceHandle);
    if (muteStates !== undefined) {
      const [messageType] = getChannelMessage(data);
      mute = muteStates.get(messageType) ?? false;
    }
    if (mute) {
      return;
    }

    const allDeviceListeners = this.midiMessageListenerMap.get(ALL_MIDI_DEVICES) ?? [];
    for (const listener of allDeviceListeners) {
      listener(deviceHandle, data, timeStamp);
    }

    const listeners = this.midiMessageListenerMap.get(deviceHandle);
    if (!listeners) {
      shouldLog(LogLevel.Warning) && console.warn(`Received MIDI from unknown listener list for ${deviceHandle}`);
      return;
    }
    for (const listener of listeners) {
      listener(deviceHandle, data, timeStamp);
    }
  }

  private updateInputConnection(deviceHandle: DeviceID, connection: "open" | "closed"): void {
    const current = this.inputMap.get(deviceHandle);
    if (!current) {
      return;
    }
    this.inputMap.set(deviceHandle, { ...current, connection });
    this.emitConnectionEvent(deviceHandle, "input", "connected");
  }

  private updateOutputConnection(deviceHandle: DeviceID, connection: "open" | "closed"): void {
    const current = this.outputMap.get(deviceHandle);
    if (!current) {
      return;
    }
    this.outputMap.set(deviceHandle, { ...current, connection });
    this.emitConnectionEvent(deviceHandle, "output", "connected");
  }

  private emitConnectionEvent(deviceHandle: DeviceID, portType: PortType, state: DeviceState): void {
    for (const listener of this.connectionStateChangeListeners) {
      listener(deviceHandle, portType, state);
    }
  }
}
