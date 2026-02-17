// @ts-nocheck
import { Model } from "./Model.js";
import { LogLevel, shouldLog } from "./Logger.js";
export const UNUSED_CC = 255;
export const UNUSED_NOTE = 255;
export class ZoomCCMapperModel extends Model {
    _inputDeviceName = "";
    _inputDeviceChangedListeners = [];
    _outputDeviceChannels = new Map();
    _outputDeviceChannelChangedListeners = [];
    _availableOutputDevices = new Set();
    get inputDevice() {
        return this._inputDeviceName;
    }
    set inputDevice(name) {
        this._inputDeviceName = name;
        this.emitInputDeviceChangedEvent(name);
    }
    setOutputDeviceChannel(outputDeviceName, channel, available) {
        this._outputDeviceChannels.set(outputDeviceName, channel);
        if (available)
            this._availableOutputDevices.add(outputDeviceName);
        this.emitOutputDeviceChannelChangedEvent(outputDeviceName, channel, "set");
    }
    removeOuptutDevice(outputDeviceName, removeRememberedChannel = false) {
        let channel = this._outputDeviceChannels.get(outputDeviceName);
        if (channel === undefined) {
            shouldLog(LogLevel.Warning) && console.warn(`ZoomCCMapperModel.removeOuptutDevice: Attempting to remove device "${outputDeviceName}", which is not found`);
            return;
        }
        if (removeRememberedChannel)
            this._outputDeviceChannels.delete(outputDeviceName);
        this._availableOutputDevices.delete(outputDeviceName);
        this.emitOutputDeviceChannelChangedEvent(outputDeviceName, channel, "remove");
    }
    outputDeviceIsAvailable(outputDeviceName) {
        return this._availableOutputDevices.has(outputDeviceName);
    }
    get outputDeviceChannels() {
        return this._outputDeviceChannels;
    }
    addInputDeviceChangedListener(listener) {
        this._inputDeviceChangedListeners.push(listener);
    }
    removeInputDeviceChangedListener(listener) {
        this._inputDeviceChangedListeners = this._inputDeviceChangedListeners.filter((l) => l !== listener);
    }
    removeAllInputDeviceChangedListeners() {
        this._inputDeviceChangedListeners = [];
    }
    emitInputDeviceChangedEvent(name) {
        this._inputDeviceChangedListeners.forEach((listener) => listener(this, name));
    }
    addOutputDeviceChannelChangedListener(listener) {
        this._outputDeviceChannelChangedListeners.push(listener);
    }
    removeOutputDeviceChannelChangedListener(listener) {
        this._outputDeviceChannelChangedListeners = this._outputDeviceChannelChangedListeners.filter((l) => l !== listener);
    }
    removeAllOutputDeviceChannelChangedListeners() {
        this._outputDeviceChannelChangedListeners = [];
    }
    emitOutputDeviceChannelChangedEvent(outputDeviceName, channel, operation) {
        this._outputDeviceChannelChangedListeners.forEach((listener) => listener(this, outputDeviceName, channel, operation));
    }
    toJSON() {
        let superJSON = super.toJSON();
        return {
            ...superJSON,
            inputDevice: this._inputDeviceName,
            outputDeviceChannels: Object.fromEntries(this._outputDeviceChannels),
        };
    }
    setFromJSON(json) {
        while (this._outputDeviceChannels.size > 0)
            this.removeOuptutDevice(this._outputDeviceChannels.keys().next().value, true);
        super.setFromJSON(json);
        this.inputDevice = json.inputDevice;
        let outputDeviceChannels = new Map(Object.entries(json.outputDeviceChannels));
        for (let [outputDeviceName, channel] of outputDeviceChannels) {
            this.setOutputDeviceChannel(outputDeviceName, channel, false);
        }
    }
}

