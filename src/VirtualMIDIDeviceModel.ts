// @ts-nocheck
import { DeviceModel } from "./DeviceModel.js";
import { shouldLog, LogLevel } from "./Logger.js";
class VirtualDeviceMessageReference {
    channel;
    parameterNumber;
    constructor(channel, parameterNumber) {
        this.channel = channel;
        this.parameterNumber = parameterNumber;
    }
    get numericalAddress() {
        return this.channel << 8 | this.parameterNumber;
    }
}
export const UNUSED_CC = 255;
export const UNUSED_NOTE = 255;
export class MIDIDeviceMessageReference {
    deviceName;
    portName;
    deviceIndex;
    channel;
    ccNumber;
    noteNumber;
    constructor(deviceName, portName, deviceIndex, channel, ccNumber = UNUSED_CC, noteNumber = UNUSED_NOTE) {
        this.deviceName = deviceName;
        this.portName = portName;
        this.deviceIndex = deviceIndex;
        this.channel = channel;
        this.ccNumber = ccNumber;
        this.noteNumber = noteNumber;
    }
    get numericalAddress() {
        return MIDIDeviceMessageReference.calculateAddress(this.deviceIndex, this.channel, this.ccNumber, this.noteNumber);
    }
    static calculateAddress(deviceIndex, channel, ccNumber = UNUSED_CC, noteNumber = UNUSED_NOTE) {
        if (deviceIndex === -1 || channel == -1)
            return -1;
        return deviceIndex << 24 | channel << 16 | ccNumber << 8 | noteNumber;
    }
    static fromUnmappedSource() {
        return new MIDIDeviceMessageReference("Unmapped device", "Unmapped port", -1, -1, UNUSED_CC, UNUSED_NOTE);
    }
    get isUnmapped() {
        return this.deviceIndex === -1;
    }
}
class MappingDestination {
    name;
    channel;
    parameterNumber;
    stateNumber;
    constructor(name = "", channel = 0, parameterNumber = UNUSED_CC, stateNumber = UNUSED_NOTE) {
        this.name = name;
        this.channel = channel;
        this.parameterNumber = parameterNumber;
        this.stateNumber = stateNumber;
    }
    equals(other) {
        return this.name === other.name && this.channel === other.channel && this.parameterNumber === other.parameterNumber && this.stateNumber === other.stateNumber;
    }
    get numericalAddress() {
        return MappingDestination.calculateAddress(this.channel, this.parameterNumber, this.stateNumber);
    }
    static calculateAddress(channel, parameterNumber = UNUSED_CC, stateNumber = UNUSED_NOTE) {
        return channel << 16 | parameterNumber << 8 | stateNumber;
    }
}
/**
 * Maps between device model and one or more MIDI devices.
 *
 * DeviceModel channel, parameterNumber, parameterValue -> MIDI device, channel, ccNumber, ccValue
 * MIDI device, channel, ccNumber, ccValue              -> DeviceModel channel, parameterNumber, parameterValue
 *
 * DeviceModel channel, stateNumber, stateValue -> MIDI device, channel, noteNumber, noteValue
 * MIDI device, channel, noteNumber, noteValue  -> DeviceModel channel, stateNumber, stateValue
 *
 * The mapping is done using a numerical address for source and destination.
 */
export class VirtualMIDIDeviceModel extends DeviceModel {
    _virtualParameterToMIDI = new Map();
    _midiToVirtualParameter = new Map();
    _virtualStateToMIDI = new Map();
    _midiToVirtualState = new Map();
    _midiDeviceAddresses = new Map();
    _virtualDeviceAddresses = new Map();
    _sourceAddressToIndex = new Map();
    _destinationAddressToIndex = new Map();
    // I'm not entirely sure this is the best way to do mapping, but I should probably just make a choice and get on with it
    // array lookups are faster than map lookups
    // Maybe this is really a controller instead?
    // Should probably store a human readable map and then derive the fast map from that
    _destinations = [];
    _sources = []; // sources maps to destinations of the same index
    _sourceChangedListeners = [];
    _currentSourceIndex = 0;
    _currentSourceIndexChangedListeners = [];
    _isMapping = false;
    _isMappingChangedListeners = [];
    addDestination(name, channel = 0, parameterNumber = UNUSED_CC, stateNumber = UNUSED_NOTE) {
        let destination = new MappingDestination(name, channel, parameterNumber, stateNumber);
        let mappingTableIndex = this._destinations.length;
        this._destinations.push(destination);
        this._destinationAddressToIndex.set(destination.numericalAddress, mappingTableIndex);
        let source = MIDIDeviceMessageReference.fromUnmappedSource();
        this._sources.push(source);
        this._sourceAddressToIndex.set(source.numericalAddress, mappingTableIndex);
    }
    get destinations() {
        return this._destinations;
    }
    setSource(mappingTableIndex, deviceName, portName, deviceIndex, channel, ccNumber, noteNumber) {
        let sourceReference = new MIDIDeviceMessageReference(deviceName, portName, deviceIndex, channel, ccNumber, noteNumber);
        this._sources[mappingTableIndex] = sourceReference;
        this._sourceAddressToIndex.set(sourceReference.numericalAddress, mappingTableIndex);
        this.emitSourceChanged(this, mappingTableIndex);
    }
    get sources() {
        return this._sources;
    }
    clearSource(mappingTableIndex) {
        let source = MIDIDeviceMessageReference.fromUnmappedSource();
        this._sources[mappingTableIndex] = source;
        this._sourceAddressToIndex.set(source.numericalAddress, mappingTableIndex);
        // Delete all source addresses that map to this source index
        for (let [address, index] of this._sourceAddressToIndex) {
            if (index === mappingTableIndex) {
                this._sourceAddressToIndex.delete(address);
            }
        }
        this.emitSourceChanged(this, mappingTableIndex);
    }
    clearAllSources() {
        this._sourceAddressToIndex.clear();
        for (let i = 0; i < this._destinations.length; i++) {
            this.clearSource(i);
        }
    }
    addSourceChangedListener(listener) {
        this._sourceChangedListeners.push(listener);
    }
    removeSourceChangedListener(listener) {
        this._sourceChangedListeners = this._sourceChangedListeners.filter(l => l !== listener);
    }
    removeAllSourceChangedListeners() {
        this._sourceChangedListeners = [];
    }
    emitSourceChanged(device, mappingTableIndex) {
        for (let listener of this._sourceChangedListeners) {
            listener(device, mappingTableIndex);
        }
    }
    set currentSourceIndex(mappingTableIndex) {
        this._currentSourceIndex = mappingTableIndex;
        this.emitCurrentSourceIndexChanged(this, mappingTableIndex);
    }
    get currentSourceIndex() {
        return this._currentSourceIndex;
    }
    addCurrentSourceIndexChangedListener(listener) {
        this._currentSourceIndexChangedListeners.push(listener);
    }
    removeCurrentSourceIndexChangedListener(listener) {
        this._currentSourceIndexChangedListeners = this._currentSourceIndexChangedListeners.filter(l => l !== listener);
    }
    removeAllCurrentSourceIndexChangedListeners() {
        this._currentSourceIndexChangedListeners = [];
    }
    emitCurrentSourceIndexChanged(device, currentSourceIndex) {
        for (let listener of this._currentSourceIndexChangedListeners) {
            listener(device, currentSourceIndex);
        }
    }
    get isMapping() {
        return this._isMapping;
    }
    set isMapping(isMapping) {
        this._isMapping = isMapping;
        this.emitIsMappingChanged(this, isMapping);
    }
    addIsMappingChangedListener(listener) {
        this._isMappingChangedListeners.push(listener);
    }
    removeIsMappingChangedListener(listener) {
        this._isMappingChangedListeners = this._isMappingChangedListeners.filter(l => l !== listener);
    }
    removeAllIsMappingChangedListeners() {
        this._isMappingChangedListeners = [];
    }
    emitIsMappingChanged(device, isMapping) {
        for (let listener of this._isMappingChangedListeners) {
            listener(device, isMapping);
        }
    }
    receiveMIDIMessage(deviceIndex, channel, ccNumber, noteNumber, value, timeStamp) {
        let sourceAddress = MIDIDeviceMessageReference.calculateAddress(deviceIndex, channel, ccNumber, noteNumber);
        let index = this._sourceAddressToIndex.get(sourceAddress);
        if (index === undefined) {
            shouldLog(LogLevel.Info) && console.log(`VirtualMIDIDeviceModel.receiveMIDIMessage() no mapping for source address ${sourceAddress}, ` +
                `deviceIndex: ${deviceIndex}, channel: ${channel}, ccNumber: ${ccNumber}, noteNumber: ${noteNumber}, value: ${value}, timeStamp: ${timeStamp}`);
            return;
        }
        let destination = this._destinations[index];
        if (ccNumber !== UNUSED_CC) {
            if (destination.stateNumber !== UNUSED_NOTE) {
                // CC-as-state mapping
                let previousState = this.getState(destination.channel, destination.stateNumber, true);
                let thisState = value < 63 ? 0 : 127;
                if (previousState !== thisState) {
                    this.setState(destination.channel, destination.stateNumber, thisState, timeStamp);
                }
            }
            if (destination.parameterNumber !== UNUSED_CC) {
                // CC-as-parameter mapping
                this.setParameter(destination.channel, destination.parameterNumber, value);
            }
        }
        else if (noteNumber !== UNUSED_NOTE) {
            this.setState(destination.channel, destination.stateNumber, value, timeStamp);
        }
        else {
            shouldLog(LogLevel.Error) && console.error(`VirtualMIDIDeviceModel.receiveMIDIMessage() received message without note or CC for ` +
                `deviceIndex: ${deviceIndex}, channel: ${channel}, ccNumber: ${ccNumber}, noteNumber: ${noteNumber}, value: ${value}, timeStamp: ${timeStamp}`);
        }
    }
    storeMapToJSON() {
        // array of (source, destination) pairs
        let mappings = [];
        for (let i = 0; i < this._destinations.length; i++) {
            let source = this._sources[i];
            if (!source.isUnmapped) {
                let destination = this._destinations[i];
                let mapping = { destination: destination, source: source };
                mappings.push(mapping);
            }
        }
        return JSON.stringify(mappings);
    }
    /**
     *
     * @param channel
     * @param stateNumber
     * @returns the MIDI note number (a key/button on your MIDI controller) that was mapped to the given state number
     */
    getSourceNoteOrCCFromDestinationState(channel, stateNumber) {
        let destinationAddress = MappingDestination.calculateAddress(channel, UNUSED_CC, stateNumber);
        let index = this._destinationAddressToIndex.get(destinationAddress);
        if (index === undefined) {
            shouldLog(LogLevel.Warning) && console.warn(`VirtualMIDIDeviceModel.getMappedNote() no mapping for destination address ${destinationAddress}, channel: ${channel}, stateNumber: ${stateNumber}`);
            return [0, UNUSED_NOTE, UNUSED_CC];
        }
        if (index >= this.sources.length)
            return [0, UNUSED_NOTE, UNUSED_CC]; // no source has been mapped to that destination
        let source = this._sources[index];
        return [source.channel, source.noteNumber, source.ccNumber];
    }
    /**
     *
     * @param channel
     * @param parameterNumber
     * @returns the MIDI CC number (a slider/knob on your MIDI controller) that was mapped to the given parameter number
     */
    getSourceCCFromDestinationParameter(channel, parameterNumber) {
        let destinationAddress = MappingDestination.calculateAddress(channel, parameterNumber, UNUSED_NOTE);
        let index = this._destinationAddressToIndex.get(destinationAddress);
        if (index === undefined) {
            shouldLog(LogLevel.Warning) && console.warn(`VirtualMIDIDeviceModel.getMappedCC() no mapping for destination address ${destinationAddress}, channel: ${channel}, parameterNumber: ${parameterNumber}`);
            return [0, UNUSED_CC];
        }
        let source = this._sources[index];
        return [source.channel, source.ccNumber];
    }
}

