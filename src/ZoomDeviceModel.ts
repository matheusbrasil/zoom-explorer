import { DeviceModel } from "./DeviceModel.js";

export type CurrentEffectSlotChangedListener = (device: ZoomDeviceModel, currentEffectSlot: number) => void;

/**
 * Holds the state of a ZoomDevice.
 * Inherits DeviceModel. A ZoomDeviceModel slot maps to a DeviceModel channel.
 */
export class ZoomDeviceModel extends DeviceModel {
  private _currentEffectSlot = 0;
  private _currentEffectSlotChangedListeners: CurrentEffectSlotChangedListener[] = [];
  public numParametersPerPage = 4;

  public addCurrentEffectSlotChangedListener(listener: CurrentEffectSlotChangedListener): void {
    this._currentEffectSlotChangedListeners.push(listener);
  }

  public removeCurrentEffectSlotChangedListener(listener: CurrentEffectSlotChangedListener): void {
    this._currentEffectSlotChangedListeners = this._currentEffectSlotChangedListeners.filter((currentListener) => currentListener !== listener);
  }

  public removeAllCurrentEffectSlotChangedListeners(): void {
    this._currentEffectSlotChangedListeners = [];
  }

  public getSlotEffectName(slot: number): string {
    return this.getChannelName(slot);
  }

  public getNumSlots(): number {
    return this.getNumChannels();
  }

  public setSlotName(slot: number, name: string): void {
    this.setChannelName(slot, name);
  }

  public getSlotEffectID(slot: number): number {
    return this.getChannelInstrumentNumber(slot);
  }

  public setSlotEffectID(slot: number, instrumentNumber: number): void {
    this.setChannelInstrumentNumber(slot, instrumentNumber);
  }

  public getSlotColor(slot: number): string {
    return this.getChannelColor(slot);
  }

  public setSlotColor(slot: number, color: string): void {
    this.setChannelColor(slot, color);
  }

  public getSlotEnabled(slot: number): boolean {
    return this.getChannelEnabled(slot);
  }

  public setSlotEnabled(slot: number, enabled: boolean): void {
    this.setChannelEnabled(slot, enabled);
  }

  public getNumParametersForSlot(slot: number): number {
    return this.getNumParametersForChannel(slot);
  }

  public get currentEffectSlot(): number {
    return this._currentEffectSlot;
  }

  public set currentEffectSlot(value: number) {
    if (value !== this._currentEffectSlot) {
      this._currentEffectSlot = value;
      this.emitCurrentEffectSlotChangedEvent(this._currentEffectSlot);
    }
  }

  private emitCurrentEffectSlotChangedEvent(currentEffectSlot: number): void {
    for (const listener of this._currentEffectSlotChangedListeners) {
      listener(this, currentEffectSlot);
    }
  }
}
