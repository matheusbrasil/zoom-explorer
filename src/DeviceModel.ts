// @ts-nocheck
import { ChannelInfo, IGNORE_INSTRUMENT } from "./IDeviceModel.js";
import { shouldLog, LogLevel } from "./Logger.js";
//export type parameterNumberToInfoConverter = (channel: number, parameterNumber: number) => [name: string, min: number, max: number];
const DEFAULT_NUM_CHANNELS = 16;
const DEFAULT_NUM_STATES = 128;
const TIME_STAMP_DELTA_DEFAULT = 10000; // 10 seconds, so as not to be detected as double-click
export class DeviceModel {
    _listeners = [];
    _stateListeners = [];
    _nameChangedListeners = [];
    _channelEnabledListeners = [];
    _channelInstrumentNumberListeners = [];
    _channelColorListeners = [];
    _channelNameListeners = [];
    _channelInfoChangedListeners = [];
    _channelInfoInsertedListeners = [];
    _channelInfoRemovedListeners = [];
    _onOffChangedListeners = [];
    _patchSysexChangedListeners = [];
    //protected _parameterValues: Map<number, number> = new Map<number, number>(); // parameter path => parameter value
    //protected _parameterInfo: Map<number, [name: string, min: number, max: number]> = new Map<number, [name: string, min: number, max: number]>();
    _channelInfo; // map from channel number to info
    _stateValues; // Array with DEFAULT_NUM_CHANNELS channels and DEFAULT_NUM_STATES state values for each channel
    _stateTimeStamps; // Array with DEFAULT_NUM_CHANNELS channels and DEFAULT_NUM_STATES state timestamps for each channel. The timestamp is only recorded for state values > 0 (key down). Timestamp is in milliseconds from some arbitrary epoch.
    _stateTimeStampDeltas; // Array with DEFAULT_NUM_CHANNELS channels and DEFAULT_NUM_STATES state timestamp deltas for each channel. The timestamp is only recorded for state values > 0 (key down). Timestamp delta is in milliseconds from some arbitrary epoch.
    _stateLatch; // Array with DEFAULT_NUM_CHANNELS channels and DEFAULT_NUM_STATES state latches for each channel.
    // private _states: Map<number, Map<number, number>> = new Map<number, Map<number, number>>(); // map from channel number to map from state number to state value
    _valueToStringConverter = (channel, parameterNumber, rawValue) => rawValue.toString();
    _stringToValueConverter = (channel, parameterNumber, parameterValueString) => parseInt(parameterValueString);
    //protected _parameterNumberToInfoConverter: parameterNumberToInfoConverter = (channel: number, parameterNumber: number) => [parameterNumber.toString(), 0, 100];
    enabled;
    instrumentNumber; // memory slot number for Zoom pedal, bank/program change for generic MIDI devices
    // Note that ChannelInfo also has an instrumentNumber
    _deviceIsOn = true;
    _name;
    _patchSysex;
    constructor(valueToStringConverter, stringToValueConverter) {
        this._channelInfo = new Map();
        this.clearDeviceModel();
        this.setParameterInfoConverters(valueToStringConverter, stringToValueConverter);
    }
    /**
     * Clear the device model, resetting all properties to their default values.
     * Note that this method doesn't emit any events.
     */
    clearDeviceModel() {
        this.enabled = true;
        this.instrumentNumber = IGNORE_INSTRUMENT;
        this._deviceIsOn = true;
        this._name = "";
        this._patchSysex = "";
        this._stateValues = new Array(DEFAULT_NUM_CHANNELS);
        this._stateTimeStamps = new Array(DEFAULT_NUM_CHANNELS);
        this._stateTimeStampDeltas = new Array(DEFAULT_NUM_CHANNELS);
        this._stateLatch = new Array(DEFAULT_NUM_CHANNELS);
        for (let i = 0; i < DEFAULT_NUM_CHANNELS; i++) {
            this._stateValues[i] = new Array(DEFAULT_NUM_STATES);
            this._stateTimeStamps[i] = new Array(DEFAULT_NUM_STATES);
            this._stateTimeStampDeltas[i] = new Array(DEFAULT_NUM_STATES).fill(TIME_STAMP_DELTA_DEFAULT);
            this._stateLatch[i] = new Array(DEFAULT_NUM_STATES);
        }
    }
    // /**
    //  * Clear the device model, resetting all state values, timestamps, and latches to their default values.
    //  * Note that this method doesn't emit any events.
    //  */
    // public clear()
    // {
    //   for (let channel=0; channel<DEFAULT_NUM_CHANNELS; channel++) {
    //     this._stateTimeStampDeltas[channel].fill(TIME_STAMP_DELTA_DEFAULT);
    //     for (let state=0; state<DEFAULT_NUM_STATES; state++) {
    //       if (this._stateValues[channel][state] !== undefined) {
    //         this._stateValues[channel][state] = 0;
    //       }
    //       if (this._stateTimeStamps[channel][state] !== undefined) {
    //         this._stateTimeStamps[channel][state] = 0;
    //       }
    //       if (this._stateLatch[channel][state] !== undefined) {
    //         this._stateLatch[channel][state] = 0;
    //       }
    //     }
    //   }
    // }
    get deviceIsOn() {
        return this._deviceIsOn;
    }
    set deviceIsOn(value) {
        if (this._deviceIsOn === value)
            return;
        this._deviceIsOn = value;
        this.emitOnOffChangedEvent(value);
    }
    get patchSysex() {
        return this._patchSysex;
    }
    set patchSysex(value) {
        this._patchSysex = value;
        this.emitPatchSysexChangedEvent(value);
    }
    setPatchSysex(value, muteListener) {
        this._patchSysex = value;
        this.emitPatchSysexChangedEvent(value, muteListener);
    }
    get name() {
        return this._name;
    }
    set name(value) {
        this._name = value;
        this.emitNameChangedEvent(value);
    }
    addNameChangedListener(listener) {
        this._nameChangedListeners.push(listener);
    }
    removeNameChangedListener(listener) {
        this._nameChangedListeners = this._nameChangedListeners.filter(l => l !== listener);
    }
    removeAllNameChangedListeners() {
        this._nameChangedListeners = [];
    }
    emitNameChangedEvent(name) {
        for (let listener of this._nameChangedListeners)
            listener(this, name);
    }
    addPatchSysexChangedListener(listener) {
        this._patchSysexChangedListeners.push(listener);
    }
    removePatchSysexChangedListener(listener) {
        this._patchSysexChangedListeners = this._patchSysexChangedListeners.filter(l => l !== listener);
    }
    removeAllPatchSysexChangedListeners() {
        this._patchSysexChangedListeners = [];
    }
    emitPatchSysexChangedEvent(patchSysex, muteListener) {
        for (let listener of this._patchSysexChangedListeners) {
            if (muteListener !== undefined && listener === muteListener)
                continue;
            listener(this, patchSysex);
        }
    }
    addChannelInfoInsertedListener(listener) {
        this._channelInfoInsertedListeners.push(listener);
    }
    removeChannelInfoInsertedListener(listener) {
        this._channelInfoInsertedListeners = this._channelInfoInsertedListeners.filter(l => l !== listener);
    }
    removeAllChannelInfoInsertedListeners() {
        this._channelInfoInsertedListeners = [];
    }
    emitChannelInfoInsertedEvent(channel, info) {
        for (let listener of this._channelInfoInsertedListeners)
            listener(this, channel, info);
    }
    addChannelInfoRemovedListener(listener) {
        this._channelInfoRemovedListeners.push(listener);
    }
    removeChannelInfoRemovedListener(listener) {
        this._channelInfoRemovedListeners = this._channelInfoRemovedListeners.filter(l => l !== listener);
    }
    removeAllChannelInfoRemovedListeners() {
        this._channelInfoRemovedListeners = [];
    }
    emitChannelInfoRemovedEvent(channel) {
        for (let listener of this._channelInfoRemovedListeners)
            listener(this, channel);
    }
    addOnOffChangedListener(listener) {
        this._onOffChangedListeners.push(listener);
    }
    removeOnOffChangedListener(listener) {
        this._onOffChangedListeners = this._onOffChangedListeners.filter(l => l !== listener);
    }
    removeAllOnOffChangedListeners() {
        this._onOffChangedListeners = [];
    }
    emitOnOffChangedEvent(on) {
        for (let listener of this._onOffChangedListeners)
            listener(this, on);
    }
    setParameterInfoConverters(valueToStringConverter, stringToValueConverter) {
        if (valueToStringConverter !== undefined)
            this._valueToStringConverter = valueToStringConverter;
        if (stringToValueConverter !== undefined)
            this._stringToValueConverter = stringToValueConverter;
    }
    addParameterChangedListener(listener) {
        this._listeners.push(listener);
    }
    removeParameterChangedListener(listener) {
        this._listeners = this._listeners.filter((l) => l !== listener);
    }
    removeAllParameterChangedListeners() {
        this._listeners = [];
    }
    emitParameterChangedEvent(channel, parameterNumber, parameterValue) {
        for (let listener of this._listeners)
            listener(this, channel, parameterNumber, parameterValue);
    }
    addStateChangedListener(listener) {
        this._stateListeners.push(listener);
    }
    removeStateChangedListener(listener) {
        this._stateListeners = this._stateListeners.filter((l) => l !== listener);
    }
    removeAllStateChangedListeners() {
        this._stateListeners = [];
    }
    emitStateChangedEvent(channel, stateNumber, stateValue, timeStamp) {
        for (let listener of this._stateListeners)
            listener(this, channel, stateNumber, stateValue, timeStamp);
    }
    addChannelEnabledListener(listener) {
        this._channelEnabledListeners.push(listener);
    }
    removeChannelEnabledListener(listener) {
        this._channelEnabledListeners = this._channelEnabledListeners.filter((l) => l !== listener);
    }
    removeAllChannelEnabledListeners() {
        this._channelEnabledListeners = [];
    }
    emitChannelEnabledEvent(channel, enabled) {
        for (let listener of this._channelEnabledListeners)
            listener(this, channel, enabled);
    }
    addChannelInstrumentNumberChangedListener(listener) {
        this._channelInstrumentNumberListeners.push(listener);
    }
    removeChannelInstrumentNumberChangedListener(listener) {
        this._channelInstrumentNumberListeners = this._channelInstrumentNumberListeners.filter((l) => l !== listener);
    }
    removeAllChannelInstrumentNumberChangedListeners() {
        this._channelInstrumentNumberListeners = [];
    }
    emitChannelInstrumentNumberEvent(channel, instrumentNumber) {
        for (let listener of this._channelInstrumentNumberListeners)
            listener(this, channel, instrumentNumber);
    }
    addChannelColorChangedListener(listener) {
        this._channelColorListeners.push(listener);
    }
    removeChannelColorChangedListener(listener) {
        this._channelColorListeners = this._channelColorListeners.filter((l) => l !== listener);
    }
    removeAllChannelColorChangedListeners() {
        this._channelColorListeners = [];
    }
    emitChannelColorEvent(channel, color) {
        for (let listener of this._channelColorListeners)
            listener(this, channel, color);
    }
    addChannelNameChangedListener(listener) {
        this._channelNameListeners.push(listener);
    }
    removeChannelNameChangedListener(listener) {
        this._channelNameListeners = this._channelNameListeners.filter((l) => l !== listener);
    }
    removeAllChannelNameChangedListeners() {
        this._channelNameListeners = [];
    }
    emitChannelNameEvent(channel, name) {
        for (let listener of this._channelNameListeners)
            listener(this, channel, name);
    }
    addChannelInfoChangedListener(listener) {
        this._channelInfoChangedListeners.push(listener);
    }
    removeChannelInfoChangedListener(listener) {
        this._channelInfoChangedListeners = this._channelInfoChangedListeners.filter((l) => l !== listener);
    }
    removeAllChannelInfoChangedListeners() {
        this._channelInfoChangedListeners = [];
    }
    emitChannelInfoChangedEvent(channel, info) {
        for (let listener of this._channelInfoChangedListeners)
            listener(this, channel, info);
    }
    // Note: It'd be better if we could detect this automatically,
    // but then we would probably need to create new ChannelInfo objects every time a parameter changes, 
    // which could be very often and it might have performance implications.
    // See SceneDeviceModel.sceneHasBeenUpdated()
    channelInfoHasBeenUpdated(channel) {
        let channelInfo = this._channelInfo.get(channel);
        if (channelInfo === undefined) {
            shouldLog(LogLevel.Error) && console.error(`Cannot get channelInfo for channel ${channel} since there is no channelInfo for that channel`);
            return;
        }
        this.emitChannelInfoChangedEvent(channel, channelInfo);
    }
    setParameter(channel, parameterNumber, parameterValue) {
        if (parameterValue < 0) {
            shouldLog(LogLevel.Warning) && console.warn(`Parameter value cannot be negative: ${parameterValue}`);
        }
        let wasInserted = false;
        let channelInfo = this._channelInfo.get(channel);
        if (channelInfo === undefined) {
            channelInfo = new ChannelInfo();
            this._channelInfo.set(channel, channelInfo);
            wasInserted = true;
        }
        if (channelInfo.parameterValues.get(parameterNumber) === parameterValue) {
            return false; // no need to set variable if it's the same as the current value
        }
        channelInfo.parameterValues.set(parameterNumber, parameterValue);
        if (wasInserted)
            this.emitChannelInfoInsertedEvent(channel, channelInfo);
        this.emitParameterChangedEvent(channel, parameterNumber, parameterValue);
        return true;
    }
    getParameter(channel, parameterNumber, muteErrorMessages = false) {
        let channelInfo = this._channelInfo.get(channel);
        if (channelInfo === undefined) {
            if (!muteErrorMessages)
                shouldLog(LogLevel.Error) && console.error(`Cannot get parameter ${parameterNumber} on channel ${channel} since there is no channelInfo for that channel`);
            return undefined;
        }
        let value = channelInfo.parameterValues.get(parameterNumber);
        if (value === undefined) {
            if (!muteErrorMessages)
                shouldLog(LogLevel.Error) && console.error(`Cannot get parameter ${parameterNumber} on channel ${channel} since there is no value stored for that parameter`);
            return undefined;
        }
        return value;
    }
    setState(channel, stateNumber, stateValue, timeStamp) {
        // let channelInfo = this._channelInfo.get(channel);
        // if (channelInfo === undefined) {
        //   channelInfo = new ChannelInfo();
        //   this._channelInfo.set(channel, channelInfo);
        // }
        // channelInfo.stateValues.set(stateNumber, stateValue);
        if (channel < 0 || channel >= DEFAULT_NUM_CHANNELS) {
            shouldLog(LogLevel.Error) && console.error(`Invalid channel number: ${channel}`);
            return;
        }
        if (stateNumber < 0 || stateNumber >= DEFAULT_NUM_STATES) {
            shouldLog(LogLevel.Error) && console.error(`Invalid state number: ${stateNumber}`);
            return;
        }
        this._stateValues[channel][stateNumber] = stateValue;
        if (stateValue > 0) { // only record timestamp for key down
            this._stateTimeStampDeltas[channel][stateNumber] = timeStamp - this._stateTimeStamps[channel][stateNumber];
            this._stateTimeStamps[channel][stateNumber] = timeStamp;
        }
        this.emitStateChangedEvent(channel, stateNumber, stateValue, timeStamp);
    }
    /**
     *
     * @param channel
     * @param stateNumber
     * @returns 0 if note is currently not pressed
     */
    getState(channel, stateNumber, muteErrorMessages = false) {
        // let channelInfo = this._channelInfo.get(channel);
        // if (channelInfo === undefined) {
        //   // shouldLog(LogLevel.Error) && console.error(`Cannot get state ${stateNumber} on channel ${channel} since there is no channelInfo for that channel`);
        //   return 0;
        // }
        // let value = channelInfo.stateValues.get(stateNumber);
        // if (value === undefined) {
        //   // shouldLog(LogLevel.Error) && console.error(`Cannot get state ${stateNumber} on channel ${channel} since there is no value stored for that state number`);
        //   return 0;
        // }
        // return value;
        if (channel < 0 || channel >= DEFAULT_NUM_CHANNELS) {
            if (!muteErrorMessages)
                shouldLog(LogLevel.Error) && console.error(`Invalid channel number: ${channel}`);
            return 0;
        }
        if (stateNumber < 0 || stateNumber >= DEFAULT_NUM_STATES) {
            if (!muteErrorMessages)
                shouldLog(LogLevel.Error) && console.error(`Invalid state number: ${stateNumber}`);
            return 0;
        }
        return this._stateValues[channel][stateNumber];
    }
    /**
     * Get the timestamp of the last key down for a state
     * @param channel
     * @param stateNumber
     * @returns [0, 0] if no key down has been recorded for this state, otherwise the timestamp of the last key down and the delta between the last key down and the current key down
     * @note The timestamp is in milliseconds from some arbitrary epoch
     */
    getStateTimeStamp(channel, stateNumber) {
        if (channel < 0 || channel >= DEFAULT_NUM_CHANNELS) {
            shouldLog(LogLevel.Error) && console.error(`Invalid channel number: ${channel}`);
            return [0, 0];
        }
        if (stateNumber < 0 || stateNumber >= DEFAULT_NUM_STATES) {
            shouldLog(LogLevel.Error) && console.error(`Invalid state number: ${stateNumber}`);
            return [0, 0];
        }
        return [this._stateTimeStamps[channel][stateNumber], this._stateTimeStampDeltas[channel][stateNumber]];
    }
    setStateLatch(channel, stateNumber, stateLatch) {
        if (channel < 0 || channel >= DEFAULT_NUM_CHANNELS) {
            shouldLog(LogLevel.Error) && console.error(`Invalid channel number: ${channel}`);
            return;
        }
        if (stateNumber < 0 || stateNumber >= DEFAULT_NUM_STATES) {
            shouldLog(LogLevel.Error) && console.error(`Invalid state number: ${stateNumber}`);
            return;
        }
        this._stateLatch[channel][stateNumber] = stateLatch;
    }
    getStateLatch(channel, stateNumber) {
        if (channel < 0 || channel >= DEFAULT_NUM_CHANNELS) {
            shouldLog(LogLevel.Error) && console.error(`Invalid channel number: ${channel}`);
            return 0;
        }
        if (stateNumber < 0 || stateNumber >= DEFAULT_NUM_STATES) {
            shouldLog(LogLevel.Error) && console.error(`Invalid state number: ${stateNumber}`);
            return 0;
        }
        return this._stateLatch[channel][stateNumber];
    }
    getNumStates(channel) {
        let channelInfo = this._channelInfo.get(channel);
        if (channelInfo === undefined) {
            shouldLog(LogLevel.Error) && console.error(`Cannot get number of states on channel ${channel} since there is no channelInfo for that channel`);
            return undefined;
        }
        return channelInfo.stateNames.size;
    }
    getChannelName(channel) {
        let channelInfo = this._channelInfo.get(channel);
        if (channelInfo === undefined) {
            shouldLog(LogLevel.Error) && console.error(`Cannot get name of channel ${channel} since there is no channelInfo for that channel`);
            return "";
        }
        return channelInfo.name;
    }
    setChannelName(channel, name) {
        let wasInserted = false;
        let channelInfo = this._channelInfo.get(channel);
        if (channelInfo === undefined) {
            channelInfo = new ChannelInfo();
            this._channelInfo.set(channel, channelInfo);
            wasInserted = true;
        }
        if (channelInfo.name !== name) {
            channelInfo.name = name;
            if (wasInserted)
                this.emitChannelInfoInsertedEvent(channel, channelInfo);
            this.emitChannelNameEvent(channel, name);
        }
    }
    getChannelInstrumentNumber(channel) {
        let channelInfo = this._channelInfo.get(channel);
        if (channelInfo === undefined) {
            shouldLog(LogLevel.Error) && console.error(`Cannot get instrument number of channel ${channel} since there is no channelInfo for that channel`);
            return IGNORE_INSTRUMENT;
        }
        return channelInfo.instrumentNumber;
    }
    setChannelInstrumentNumber(channel, instrumentNumber) {
        let channelInfo = this._channelInfo.get(channel);
        if (channelInfo === undefined) {
            channelInfo = new ChannelInfo();
            this._channelInfo.set(channel, channelInfo);
            channelInfo.instrumentNumber = instrumentNumber;
            this.emitChannelInfoInsertedEvent(channel, channelInfo);
            this.emitChannelInstrumentNumberEvent(channel, instrumentNumber);
        }
        else {
            if (channelInfo.instrumentNumber !== instrumentNumber) {
                channelInfo.instrumentNumber = instrumentNumber;
                this.emitChannelInstrumentNumberEvent(channel, instrumentNumber);
            }
        }
    }
    getChannelColor(channel) {
        let channelInfo = this._channelInfo.get(channel);
        if (channelInfo === undefined) {
            shouldLog(LogLevel.Error) && console.error(`Cannot get color of channel ${channel} since there is no channelInfo for that channel`);
            return "";
        }
        return channelInfo.color;
    }
    setChannelColor(channel, color) {
        let channelInfo = this._channelInfo.get(channel);
        if (channelInfo === undefined) {
            channelInfo = new ChannelInfo();
            this._channelInfo.set(channel, channelInfo);
            this.emitChannelInfoInsertedEvent(channel, channelInfo);
            this.emitChannelColorEvent(channel, color);
        }
        if (channelInfo.color !== color) {
            channelInfo.color = color;
            this.emitChannelColorEvent(channel, color);
        }
    }
    getChannelEnabled(channel) {
        let channelInfo = this._channelInfo.get(channel);
        if (channelInfo === undefined) {
            shouldLog(LogLevel.Error) && console.error(`Cannot get enabled state of channel ${channel} since there is no channelInfo for that channel`);
            return false;
        }
        return channelInfo.enabled;
    }
    setChannelEnabled(channel, enabled) {
        let channelInfo = this._channelInfo.get(channel);
        if (channelInfo === undefined) {
            channelInfo = new ChannelInfo();
            this._channelInfo.set(channel, channelInfo);
            channelInfo.enabled = enabled;
            this.emitChannelInfoInsertedEvent(channel, channelInfo);
            this.emitChannelEnabledEvent(channel, enabled);
        }
        else {
            if (channelInfo.enabled !== enabled) {
                channelInfo.enabled = enabled;
                this.emitChannelEnabledEvent(channel, enabled);
            }
        }
    }
    getParameterInfo(channel, parameterNumber) {
        let channelInfo = this._channelInfo.get(channel);
        if (channelInfo === undefined) {
            shouldLog(LogLevel.Error) && console.error(`Cannot get parameterInfo for channel ${channel} parameter ${parameterNumber} since there is no channelInfo for that channel`);
            return ["", 0, 100];
        }
        let parameterInfo = channelInfo.parameterInfo.get(parameterNumber);
        if (parameterInfo === undefined) {
            shouldLog(LogLevel.Error) && console.error(`Cannot get parameter ${parameterNumber} on channel ${channel} since there is no value stored for that parameter`);
            return ["", 0, 100];
        }
        return parameterInfo;
    }
    getStateName(channel, stateNumber) {
        let channelInfo = this._channelInfo.get(channel);
        if (channelInfo === undefined) {
            shouldLog(LogLevel.Error) && console.error(`Cannot get state name for channel ${channel} state ${stateNumber} since there is no channelInfo for that channel`);
            return "";
        }
        let stateName = channelInfo.stateNames.get(stateNumber);
        if (stateName === undefined) {
            shouldLog(LogLevel.Error) && console.error(`Cannot get state name for state ${stateNumber} on channel ${channel} since there is no name stored for that state number`);
            return "";
        }
        return stateName;
    }
    setStateName(channel, stateNumber, stateName) {
        let channelInfo = this._channelInfo.get(channel);
        if (channelInfo === undefined) {
            channelInfo = new ChannelInfo();
            this._channelInfo.set(channel, channelInfo);
            channelInfo.stateNames.set(stateNumber, stateName);
            this.emitChannelInfoInsertedEvent(channel, channelInfo);
        }
        else {
            if (channelInfo.stateNames.get(stateNumber) !== stateName) {
                channelInfo.stateNames.set(stateNumber, stateName);
            }
        }
        // channelInfo.stateValues.set(stateNumber, 0);
    }
    removeChannelInfos(numChannelsToRemove) {
        // Loop through the _channelInfo map from the largest key to the smallest key
        // This makes it possible for views to remove html elements in the correct order, using the channel parameter in the event as an index to the element to remove
        const sortedKeys = Array.from(this._channelInfo.keys()).sort((a, b) => b - a);
        if (numChannelsToRemove === undefined)
            numChannelsToRemove = sortedKeys.length;
        let numChannelsRemoved = 0;
        for (let channel of sortedKeys) {
            if (numChannelsRemoved >= numChannelsToRemove)
                break;
            numChannelsRemoved++;
            this._channelInfo.delete(channel);
            this.emitChannelInfoRemovedEvent(channel);
        }
    }
    clearChannelInfo(channel) {
        // Note: Does not emit messages related to changed channel info
        let channelInfo = this._channelInfo.get(channel);
        if (channelInfo !== undefined)
            channelInfo.clear();
    }
    removeAllParametersFromChannel(channel) {
        let channelInfo = this._channelInfo.get(channel);
        if (channelInfo === undefined) {
            shouldLog(LogLevel.Error) && console.error(`Cannot clear parameter info for channel ${channel} since there is no channelInfo for that channel`);
            return;
        }
        channelInfo.parameterInfo.clear();
        channelInfo.parameterValues.clear();
    }
    getNumChannels() {
        return this._channelInfo.size;
    }
    getNumParametersForChannel(channel) {
        let channelInfo = this._channelInfo.get(channel);
        if (channelInfo === undefined) {
            shouldLog(LogLevel.Error) && console.error(`Cannot get num parameters for channel ${channel} since there is no channelInfo for that channel`);
            return 0;
        }
        return channelInfo.parameterInfo.size;
    }
    setParameterInfo(channel, parameterNumber, name, min, max, value) {
        let wasInserted = false;
        let channelInfo = this._channelInfo.get(channel);
        if (channelInfo === undefined) {
            channelInfo = new ChannelInfo();
            this._channelInfo.set(channel, channelInfo);
            wasInserted = true;
        }
        channelInfo.parameterInfo.set(parameterNumber, [name, min, max]);
        if (value !== undefined)
            channelInfo.parameterValues.set(parameterNumber, value);
        else
            channelInfo.parameterValues.set(parameterNumber, min);
        if (wasInserted)
            this.emitChannelInfoInsertedEvent(channel, channelInfo);
    }
    getChannelList() {
        return Array.from(this._channelInfo.keys());
    }
    getChannelInfo(channel) {
        return this._channelInfo.get(channel);
    }
    getRawParameterValueFromString(channel, parameterNumber, parameterValueString) {
        return this._stringToValueConverter(channel, parameterNumber, parameterValueString);
    }
    getStringFromRawParameterValue(channel, parameterNumber, rawValue) {
        return this._valueToStringConverter(channel, parameterNumber, rawValue);
    }
    toJSON() {
        // The state latch array is normally extremely sparse, so we store only latched states with latch state > 0 in the JSON object
        let latchedStates = [];
        for (let channel = 0; channel < DEFAULT_NUM_CHANNELS; channel++) {
            for (let state = 0; state < DEFAULT_NUM_STATES; state++) {
                let latch = this.getStateLatch(channel, state);
                if (latch > 0) {
                    latchedStates.push({ channel, state, latch });
                }
            }
        }
        return {
            name: this.name,
            deviceType: this.constructor.name,
            patchSysex: this.patchSysex,
            instrumentNumber: this.instrumentNumber,
            deviceIsOn: this.deviceIsOn,
            latchedStates: latchedStates,
        };
    }
    setFromJSON(json) {
        this.clearDeviceModel();
        this.name = json.name;
        this.patchSysex = json.patchSysex;
        this.instrumentNumber = json.instrumentNumber;
        this.deviceIsOn = json.deviceIsOn;
        if (json.latchedStates !== undefined) { // FIXME: This check is here for backwards compatibility, should be removed soon. 2025-11-02.
            for (let latchedState of json.latchedStates) {
                this.setStateLatch(latchedState.channel, latchedState.state, latchedState.latch);
            }
        }
    }
    static fromJSON(json) {
        let deviceModel = new DeviceModel();
        deviceModel.setFromJSON(json);
        return deviceModel;
    }
}

