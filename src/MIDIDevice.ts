// @ts-nocheck
import { shouldLog, LogLevel } from "./Logger.js";
export class MIDIDevice {
    _midi;
    _deviceInfo;
    _midiMessageHandler;
    _isOpen = false;
    _listeners = new Array();
    _openCloseListeners = new Array();
    constructor(midi, midiDevice) {
        this._deviceInfo = midiDevice;
        this._midi = midi;
        this._midiMessageHandler = (deviceHandle, data, timeStamp) => {
            this.handleMIDIData(data, timeStamp);
        };
    }
    get isOpen() {
        return this._isOpen;
    }
    get deviceInfo() {
        return this._deviceInfo;
    }
    get deviceName() {
        return this._deviceInfo.deviceNameUnique;
    }
    set deviceName(value) {
        this._deviceInfo.deviceNameUnique = value;
    }
    static isDeviceType(device) {
        return true; // match any MIDI device
    }
    async open() {
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
    async close() {
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
    connectMessageHandler() {
        this._midi.addListener(this._deviceInfo.inputID, this._midiMessageHandler);
    }
    disconnectMessageHandler() {
        this._midi.removeListener(this._deviceInfo.inputID, this._midiMessageHandler);
    }
    addOpenCloseListener(listener) {
        this._openCloseListeners.push(listener);
    }
    removeOpenCloseListener(listener) {
        this._openCloseListeners = this._openCloseListeners.filter((l) => l !== listener);
    }
    removeAllOpenCloseListeners() {
        this._openCloseListeners = [];
    }
    emitOpenCloseEvent(open) {
        this._openCloseListeners.forEach((listener) => listener(this, open));
    }
    addListener(listener) {
        this._listeners.push(listener);
    }
    removeListener(listener) {
        this._listeners = this._listeners.filter((l) => l !== listener);
    }
    removeAllListeners() {
        this._listeners = [];
    }
    sendCC(channel, ccNumber, ccValue) {
        this._midi.sendCC(this._deviceInfo.outputID, channel, ccNumber, ccValue);
    }
    setMuteState(messageType, mute) {
        this._midi.setMuteState(this._deviceInfo.inputID, messageType, mute);
    }
    handleMIDIData(data, timeStamp) {
        for (let listener of this._listeners)
            listener(this, data, timeStamp);
    }
}

