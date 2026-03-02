import { LogLevel, shouldLog } from "./Logger.js";
import { Model, ModelJSON } from "./Model.js";

export const UNUSED_CC = 255;
export const UNUSED_NOTE = 255;

export type OutputDeviceOperation = "set" | "remove";
export type InputDeviceChangedListener = (model: ZoomCCMapperModel, name: string) => void;
export type OutputDeviceChannelChangedListener = (
  model: ZoomCCMapperModel,
  outputDeviceName: string,
  channel: number,
  operation: OutputDeviceOperation,
) => void;

export interface ZoomCCMapperModelJSON extends ModelJSON {
  inputDevice: string;
  outputDeviceChannels: Record<string, number>;
}

export class ZoomCCMapperModel extends Model {
  private _inputDeviceName = "";
  private _inputDeviceChangedListeners: InputDeviceChangedListener[] = [];
  private _outputDeviceChannels = new Map<string, number>();
  private _outputDeviceChannelChangedListeners: OutputDeviceChannelChangedListener[] = [];
  private _availableOutputDevices = new Set<string>();

  public get inputDevice(): string {
    return this._inputDeviceName;
  }

  public set inputDevice(name: string) {
    this._inputDeviceName = name;
    this.emitInputDeviceChangedEvent(name);
  }

  public setOutputDeviceChannel(outputDeviceName: string, channel: number, available: boolean): void {
    this._outputDeviceChannels.set(outputDeviceName, channel);
    if (available) {
      this._availableOutputDevices.add(outputDeviceName);
    }
    this.emitOutputDeviceChannelChangedEvent(outputDeviceName, channel, "set");
  }

  public removeOuptutDevice(outputDeviceName: string, removeRememberedChannel = false): void {
    const channel = this._outputDeviceChannels.get(outputDeviceName);
    if (channel === undefined) {
      shouldLog(LogLevel.Warning) && console.warn(`ZoomCCMapperModel.removeOuptutDevice: Attempting to remove device "${outputDeviceName}", which is not found`);
      return;
    }

    if (removeRememberedChannel) {
      this._outputDeviceChannels.delete(outputDeviceName);
    }
    this._availableOutputDevices.delete(outputDeviceName);
    this.emitOutputDeviceChannelChangedEvent(outputDeviceName, channel, "remove");
  }

  public outputDeviceIsAvailable(outputDeviceName: string): boolean {
    return this._availableOutputDevices.has(outputDeviceName);
  }

  public get outputDeviceChannels(): Map<string, number> {
    return this._outputDeviceChannels;
  }

  public addInputDeviceChangedListener(listener: InputDeviceChangedListener): void {
    this._inputDeviceChangedListeners.push(listener);
  }

  public removeInputDeviceChangedListener(listener: InputDeviceChangedListener): void {
    this._inputDeviceChangedListeners = this._inputDeviceChangedListeners.filter((currentListener) => currentListener !== listener);
  }

  public removeAllInputDeviceChangedListeners(): void {
    this._inputDeviceChangedListeners = [];
  }

  public addOutputDeviceChannelChangedListener(listener: OutputDeviceChannelChangedListener): void {
    this._outputDeviceChannelChangedListeners.push(listener);
  }

  public removeOutputDeviceChannelChangedListener(listener: OutputDeviceChannelChangedListener): void {
    this._outputDeviceChannelChangedListeners = this._outputDeviceChannelChangedListeners.filter(
      (currentListener) => currentListener !== listener,
    );
  }

  public removeAllOutputDeviceChannelChangedListeners(): void {
    this._outputDeviceChannelChangedListeners = [];
  }

  public override toJSON(): ZoomCCMapperModelJSON {
    return {
      ...super.toJSON(),
      inputDevice: this._inputDeviceName,
      outputDeviceChannels: Object.fromEntries(this._outputDeviceChannels),
    };
  }

  public setFromJSON(json: Partial<ZoomCCMapperModelJSON>): void {
    while (this._outputDeviceChannels.size > 0) {
      const firstDevice = this._outputDeviceChannels.keys().next().value as string | undefined;
      if (firstDevice === undefined) {
        break;
      }
      this.removeOuptutDevice(firstDevice, true);
    }

    super.setFromJSON(json);
    this.inputDevice = json.inputDevice ?? "";

    const outputDeviceChannels = Object.entries(json.outputDeviceChannels ?? {});
    for (const [outputDeviceName, channel] of outputDeviceChannels) {
      this.setOutputDeviceChannel(outputDeviceName, channel, false);
    }
  }

  private emitInputDeviceChangedEvent(name: string): void {
    this._inputDeviceChangedListeners.forEach((listener) => listener(this, name));
  }

  private emitOutputDeviceChannelChangedEvent(outputDeviceName: string, channel: number, operation: OutputDeviceOperation): void {
    this._outputDeviceChannelChangedListeners.forEach((listener) => listener(this, outputDeviceName, channel, operation));
  }
}
