// @ts-nocheck
import { IGNORE_CHANNEL_ENABLED, IGNORE_INSTRUMENT, IGNORE_PARAMETER_NUMBER, IGNORE_PARAMETER_VALUE } from "./IDeviceModel.js";
import { LogLevel, shouldLog } from "./Logger.js";
export const NO_SCENE_NUMBER = -1;
export const DEFAULT_SCENE_NUMBER = 127;
export const TEMP_SCENE_NUMBER = 126;
export class ParameterLock {
    static PARAMETER_MODE = 0;
    static CHANNEL_ENABLED_MODE = 1;
    static INSTRUMENT_MODE = 2;
    static MODE_MASK = 0x03;
    mode; // See *_MODE constants above
    deviceModel;
    channel;
    parameterNumber;
    parameterValue;
    parameterValueStart; // should be set to parameterValue if parameterValueStart doesn't already have a value (!== IGNORE_PARAMETER_VALUE)
    channelEnabled; // channel on/off state, translates to effect slot for Zoom pedals
    instrumentNumber; // translates to effect ID for Zoom pedals and to Bank/program change for generic MIDI devices
    constructor(mode, deviceModel, channel, parameterNumber = IGNORE_PARAMETER_NUMBER, parameterValue = IGNORE_PARAMETER_VALUE, parameterValueStart = IGNORE_PARAMETER_VALUE, channelEnabled = IGNORE_CHANNEL_ENABLED, instrumentNumber = IGNORE_INSTRUMENT) {
        this.mode = mode;
        this.deviceModel = deviceModel;
        this.channel = channel;
        this.parameterNumber = parameterNumber;
        this.parameterValue = parameterValue;
        this.parameterValueStart = parameterValueStart !== IGNORE_PARAMETER_VALUE ? parameterValueStart : parameterValue;
        this.channelEnabled = channelEnabled;
        this.instrumentNumber = instrumentNumber;
    }
    clone() {
        return new ParameterLock(this.mode, this.deviceModel, this.channel, this.parameterNumber, this.parameterValue, this.parameterValueStart, this.channelEnabled, this.instrumentNumber);
    }
    set(mode, deviceModel, channel, parameterNumber = IGNORE_PARAMETER_NUMBER, parameterValue = IGNORE_PARAMETER_VALUE, parameterValueStart = IGNORE_PARAMETER_VALUE, channelEnabled = IGNORE_CHANNEL_ENABLED, instrumentNumber = IGNORE_INSTRUMENT) {
        this.mode = mode;
        this.deviceModel = deviceModel;
        this.channel = channel;
        if (parameterNumber !== IGNORE_PARAMETER_NUMBER)
            this.parameterNumber = parameterNumber;
        if (parameterValue !== IGNORE_PARAMETER_VALUE)
            this.parameterValue = parameterValue;
        if (parameterValueStart !== IGNORE_PARAMETER_VALUE)
            this.parameterValueStart = parameterValueStart;
        else if (this.parameterValueStart === IGNORE_PARAMETER_VALUE)
            this.parameterValueStart = this.parameterValue;
        this.channelEnabled = channelEnabled;
        if (instrumentNumber !== IGNORE_INSTRUMENT)
            this.instrumentNumber = instrumentNumber;
    }
    toJSON() {
        return {
            mode: this.mode,
            deviceModel: this.deviceModel.name, // FIXME: handle device model properly
            parameterNumber: this.parameterNumber,
            parameterValue: this.parameterValue,
            parameterValueStart: this.parameterValueStart,
            channelEnabled: this.channelEnabled,
            instrumentNumber: this.instrumentNumber,
            channel: this.channel,
        };
    }
    static fromJSON(json) {
        // FIXME: handle device model properly
        return new ParameterLock(json.mode, json.deviceModel, json.channel, json.parameterNumber, json.parameterValue, json.parameterValueStart, json.channelEnabled, json.instrumentNumber);
    }
}
export class Scene {
    name;
    parameterLocks = new Map(); // key is address from getPlockAddress() 
    // patches for the devices that are part of this scene
    // patches will be loaded when scene is activated
    // but think about instant loading of effects into slots
    constructor(name) {
        this.name = name;
    }
    setFrom(other) {
        this.parameterLocks.clear();
        for (let [address, plock] of other.parameterLocks) {
            this.parameterLocks.set(address, plock.clone());
        }
    }
    get isEmpty() {
        return this.parameterLocks.size == 0;
    }
    clear() {
        this.parameterLocks.clear();
    }
    /**
     * @param mode ParameterLock.PARAMETER_MODE, ParameterLock.CHANNEL_ENABLED_MODE, ParameterLock.INSTRUMENT_MODE
     * @param deviceModel Device model
     * @param deviceIndex Device index
     * @param channel Channel number
     * @param parameterNumber Parameter number to lock
     * @param parameterValue Parameter value to lock, if IGNORE_PARAMETER_VALUE and parameterValueStart is not IGNORE_PARAMETER_VALUE, the existing value of the parameter is used
     * @param parameterValueStart Parameter value to start from if morphing a scene with a channelEnabled or instrumentNumber plock
     * @param channelEnabled Channel enabled state to lock
     * @param instrumentNumber Instrument number to lock
     */
    setPLock(mode, deviceModel, deviceIndex, channel, parameterNumber = IGNORE_PARAMETER_NUMBER, parameterValue = IGNORE_PARAMETER_VALUE, parameterValueStart = IGNORE_PARAMETER_VALUE, channelEnabled = IGNORE_CHANNEL_ENABLED, instrumentNumber = IGNORE_INSTRUMENT) {
        let plockAddress = Scene.getPlockAddress(mode, deviceIndex, channel, parameterNumber);
        let plock = this.parameterLocks.get(plockAddress);
        if (plock === undefined) {
            plock = new ParameterLock(mode, deviceModel, channel, parameterNumber, parameterValue, parameterValueStart, channelEnabled, instrumentNumber);
            this.parameterLocks.set(plockAddress, plock);
        }
        else {
            if (parameterValueStart !== IGNORE_PARAMETER_VALUE && parameterValue === IGNORE_PARAMETER_VALUE)
                parameterValue = plock.parameterValue;
            plock.set(mode, deviceModel, channel, parameterNumber, parameterValue, parameterValueStart, channelEnabled, instrumentNumber);
        }
        return plock;
    }
    getPLock(mode, deviceIndex, channel, parameterNumber) {
        let plockAddress = Scene.getPlockAddress(mode, deviceIndex, channel, parameterNumber);
        return this.parameterLocks.get(plockAddress);
    }
    getParameterLock(deviceIndex, channel, parameterNumber) {
        return this.getPLock(ParameterLock.PARAMETER_MODE, deviceIndex, channel, parameterNumber);
    }
    getChannelEnabledLock(deviceIndex, channel) {
        return this.getPLock(ParameterLock.CHANNEL_ENABLED_MODE, deviceIndex, channel, IGNORE_PARAMETER_NUMBER);
    }
    getInstrumentLock(deviceIndex, channel) {
        return this.getPLock(ParameterLock.INSTRUMENT_MODE, deviceIndex, channel, IGNORE_PARAMETER_NUMBER);
    }
    /**
     * Set a parameter lock for a parameter
     * @param deviceModel Device model
     * @param deviceIndex Device index
     * @param channel Channel number
     * @param parameterNumber Parameter number to lock
     * @param parameterValue Parameter value to lock, if IGNORE_PARAMETER_VALUE and parameterValueStart is not IGNORE_PARAMETER_VALUE, the existing value of the parameter is used
     * @param parameterValueStart Parameter value to start from if morphing a scene with a channelEnabled or instrumentNumber plock
     */
    setParameterLock(deviceModel, deviceIndex, channel, parameterNumber, parameterValue, parameterValueStart = IGNORE_PARAMETER_VALUE) {
        return this.setPLock(ParameterLock.PARAMETER_MODE, deviceModel, deviceIndex, channel, parameterNumber, parameterValue, parameterValueStart);
    }
    setChannelEnabledLock(deviceModel, deviceIndex, channel, channelEnabled) {
        this.setPLock(ParameterLock.CHANNEL_ENABLED_MODE, deviceModel, deviceIndex, channel, IGNORE_PARAMETER_NUMBER, IGNORE_PARAMETER_VALUE, IGNORE_PARAMETER_VALUE, channelEnabled);
    }
    setInstrumentLock(deviceModel, deviceIndex, channel, instrumentNumber) {
        this.setPLock(ParameterLock.INSTRUMENT_MODE, deviceModel, deviceIndex, channel, IGNORE_PARAMETER_NUMBER, IGNORE_PARAMETER_VALUE, IGNORE_PARAMETER_VALUE, IGNORE_CHANNEL_ENABLED, instrumentNumber);
    }
    get hasChannelEnabledOrInstrumentLock() {
        for (let plock of this.parameterLocks.values()) {
            if (plock.mode === ParameterLock.CHANNEL_ENABLED_MODE || plock.mode === ParameterLock.INSTRUMENT_MODE) {
                return true;
            }
        }
        return false;
    }
    static getPlockAddress(mode, deviceIndex, channel, parameterNumber = 0) {
        parameterNumber = parameterNumber & 0xFF;
        let address = mode << 24 | deviceIndex << 16 | channel << 8 | parameterNumber;
        if (address < 0) {
            shouldLog(LogLevel.Error) && console.error(`Plock address is negative: ${address}`);
        }
        return address;
    }
    static decodePlockAddress(address) {
        return [(address >> 24) & 0xFF, (address >> 16) & 0xFF, (address >> 8) & 0xFF, address & 0xFF];
    }
    toJSON() {
        return {
            // parameterLocks: Array.from(this.parameterLocks.values()).map(plock => plock.toJSON())
            parameterLocks: Object.fromEntries(this.parameterLocks)
        };
    }
    static fromJSON(json) {
        let scene = new Scene(json.name);
        // for (let plock of json.parameterLocks) {
        //   scene.parameterLocks.set(plock.address, ParameterLock.fromJSON(plock));
        // }
        let parameterLocks = new Map(Object.entries(json.parameterLocks));
        for (let [address, plock] of parameterLocks) {
            scene.parameterLocks.set(parseInt(address), ParameterLock.fromJSON(plock));
        }
        return scene;
    }
}
export class SceneSlot {
    sceneNumber;
    muted; // Note: 2025-07-31 We might not need this after we decided S1 = default patch
    constructor(sceneNumber, muted = false) {
        this.sceneNumber = sceneNumber;
        this.muted = muted;
    }
    toJSON() {
        return {
            sceneNumber: this.sceneNumber
        };
    }
    static fromJSON(json) {
        let sceneNumber = json.sceneNumber;
        return new SceneSlot(sceneNumber);
    }
}
export class Morphs {
    // map from address to a pair of plocks
    morphs = new Map(); // key is address from getPlockAddress() 
}

