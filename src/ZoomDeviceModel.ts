// @ts-nocheck
import { DeviceModel } from "./DeviceModel.js";
/**
 * Holds the state of a ZoomDevice.
 * Inherits DeviceModel. A ZoomDeviceModel slot maps to a DeviceModel channel.
 */
export class ZoomDeviceModel extends DeviceModel {
    _currentEffectSlot = 0;
    _currentEffectSlotChangedListeners = new Array();
    numParametersPerPage = 4;
    addCurrentEffectSlotChangedListener(listener) {
        this._currentEffectSlotChangedListeners.push(listener);
    }
    removeCurrentEffectSlotChangedListener(listener) {
        this._currentEffectSlotChangedListeners = this._currentEffectSlotChangedListeners.filter((l) => l !== listener);
    }
    removeAllCurrentEffectSlotChangedListeners() {
        this._currentEffectSlotChangedListeners = [];
    }
    emitCurrentEffectSlotChangedEvent(currentEffectSlot) {
        for (let listener of this._currentEffectSlotChangedListeners)
            listener(this, currentEffectSlot);
    }
    getSlotEffectName(slot) {
        return this.getChannelName(slot);
    }
    getNumSlots() {
        return this.getNumChannels();
    }
    setSlotName(slot, name) {
        this.setChannelName(slot, name);
    }
    getSlotEffectID(slot) {
        return this.getChannelInstrumentNumber(slot);
    }
    setSlotEffectID(slot, instrumentNumber) {
        this.setChannelInstrumentNumber(slot, instrumentNumber);
    }
    getSlotColor(slot) {
        return this.getChannelColor(slot);
    }
    setSlotColor(slot, color) {
        this.setChannelColor(slot, color);
    }
    getSlotEnabled(slot) {
        return this.getChannelEnabled(slot);
    }
    setSlotEnabled(slot, enabled) {
        this.setChannelEnabled(slot, enabled);
    }
    getNumParametersForSlot(slot) {
        return this.getNumParametersForChannel(slot);
    }
    get currentEffectSlot() {
        return this._currentEffectSlot;
    }
    set currentEffectSlot(value) {
        if (value != this._currentEffectSlot) {
            this._currentEffectSlot = value;
            this.emitCurrentEffectSlotChangedEvent(this._currentEffectSlot);
        }
    }
}

