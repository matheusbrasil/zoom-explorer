import { LogLevel, shouldLog } from "./Logger.js";
import { MIDIDeviceDescription } from "./MIDIDeviceDescription.js";
import { IMIDIProxy, ListenerType, MessageType } from "./midiproxy.js";

export type MIDIDeviceMessageListener = (device: MIDIDevice, data: Uint8Array, timeStamp: number) => void;
export type MIDIDeviceOpenCloseListener = (device: MIDIDevice, open: boolean) => void;

export class MIDIDevice {
  private readonly _midi: IMIDIProxy;
  private readonly _midiMessageHandler: ListenerType;
  private _deviceInfo: MIDIDeviceDescription;
  private _isOpen = false;
  private _listeners: MIDIDeviceMessageListener[] = [];
  private _openCloseListeners: MIDIDeviceOpenCloseListener[] = [];

  public constructor(midi: IMIDIProxy, midiDevice: MIDIDeviceDescription) {
    this._deviceInfo = midiDevice;
    this._midi = midi;
    this._midiMessageHandler = (_deviceHandle: string, data: Uint8Array, timeStamp: number) => {
      this.handleMIDIData(data, timeStamp);
    };
  }

  public get isOpen(): boolean {
    return this._isOpen;
  }

  public get deviceInfo(): MIDIDeviceDescription {
    return this._deviceInfo;
  }

  public get deviceName(): string {
    return this._deviceInfo.deviceNameUnique;
  }

  public set deviceName(value: string) {
    this._deviceInfo.deviceNameUnique = value;
  }

  public static isDeviceType(_device: MIDIDeviceDescription): boolean {
    return true;
  }

  public async open(): Promise<void> {
    if (this._isOpen) {
      shouldLog(LogLevel.Warning) && console.warn(`Attempting to open MIDI device ${this.deviceName} which is already open`);
      return;
    }

    shouldLog(LogLevel.Info) && console.log(`Opening MIDI device ${this.deviceName}`);
    this._isOpen = true;
    await this._midi.openInput(this._deviceInfo.inputID);
    await this._midi.openOutput(this._deviceInfo.outputID);
    this.connectMessageHandler();
    this.emitOpenCloseEvent(true);
  }

  public async close(): Promise<void> {
    if (!this._isOpen) {
      shouldLog(LogLevel.Warning) && console.warn(`Attempting to close MIDI device ${this.deviceName} which is not open`);
      return;
    }

    shouldLog(LogLevel.Info) && console.log(`Closing MIDI device ${this.deviceName}`);
    this.removeAllListeners();
    this.disconnectMessageHandler();
    this._isOpen = false;
    await this._midi.closeInput(this._deviceInfo.inputID);
    await this._midi.closeOutput(this._deviceInfo.outputID);
    this.emitOpenCloseEvent(false);
  }

  public connectMessageHandler(): void {
    this._midi.addListener(this._deviceInfo.inputID, this._midiMessageHandler);
  }

  public disconnectMessageHandler(): void {
    this._midi.removeListener(this._deviceInfo.inputID, this._midiMessageHandler);
  }

  public addOpenCloseListener(listener: MIDIDeviceOpenCloseListener): void {
    this._openCloseListeners.push(listener);
  }

  public removeOpenCloseListener(listener: MIDIDeviceOpenCloseListener): void {
    this._openCloseListeners = this._openCloseListeners.filter((currentListener) => currentListener !== listener);
  }

  public removeAllOpenCloseListeners(): void {
    this._openCloseListeners = [];
  }

  public addListener(listener: MIDIDeviceMessageListener): void {
    this._listeners.push(listener);
  }

  public removeListener(listener: MIDIDeviceMessageListener): void {
    this._listeners = this._listeners.filter((currentListener) => currentListener !== listener);
  }

  public removeAllListeners(): void {
    this._listeners = [];
  }

  public sendCC(channel: number, ccNumber: number, ccValue: number): void {
    this._midi.sendCC(this._deviceInfo.outputID, channel, ccNumber, ccValue);
  }

  public setMuteState(messageType: MessageType, mute: boolean): void {
    this._midi.setMuteState(this._deviceInfo.inputID, messageType, mute);
  }

  protected emitOpenCloseEvent(open: boolean): void {
    this._openCloseListeners.forEach((listener) => listener(this, open));
  }

  protected handleMIDIData(data: Uint8Array, timeStamp: number): void {
    for (const listener of this._listeners) {
      listener(this, data, timeStamp);
    }
  }
}
