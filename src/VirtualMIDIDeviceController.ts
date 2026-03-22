// @ts-nocheck
import { DEFAULT_SCENE_NUMBER, TEMP_SCENE_NUMBER } from "./Scene.js";
import { MAX_NUM_SCENES, SCENE_CHANNEL, SceneCommands, SceneParameters } from "./SceneDeviceController.js";
import { UNUSED_CC, UNUSED_NOTE } from "./VirtualMIDIDeviceModel.js";
import { shouldLog, LogLevel } from "./Logger.js";
import { ALL_MIDI_DEVICES, MessageType } from "./midiproxy.js";
import { getChannelMessage } from "./miditools.js";
export class VirtualMIDIDeviceController {
    model;
    view;
    _midi;
    _midiDeviceManager;
    _mapDeviceFilter = undefined;
    _deviceHandleToIndex = new Map();
    _nextDeviceIndex = 0;
    _isMappingChangedListeners = [];
    constructor(model, view, midi, midiDeviceManager) {
        this.model = model;
        this.view = view;
        this.view.addMappingDeletedListener(this.mappingDeleted.bind(this));
        this._midi = midi;
        this._midiDeviceManager = midiDeviceManager;
        this.onMIDIMessage = this.onMIDIMessage.bind(this);
        this.model.addDestination("Scene slot A", SCENE_CHANNEL, UNUSED_CC, SceneCommands.SLOT_A);
        this.model.addDestination("Scene slot B", SCENE_CHANNEL, UNUSED_CC, SceneCommands.SLOT_B);
        this.model.addDestination("Scene default", SCENE_CHANNEL, UNUSED_CC, DEFAULT_SCENE_NUMBER);
        this.model.addDestination("Scene temp", SCENE_CHANNEL, UNUSED_CC, TEMP_SCENE_NUMBER);
        this.model.addDestination("Crossfader", SCENE_CHANNEL, SceneParameters.CROSSFADER, UNUSED_NOTE);
        this.model.addDestination("Clear", SCENE_CHANNEL, UNUSED_CC, SceneCommands.CLEAR);
        this.model.addDestination("Save", SCENE_CHANNEL, UNUSED_CC, SceneCommands.SAVE);
        this.model.addDestination("Edit", SCENE_CHANNEL, UNUSED_CC, SceneCommands.EDIT);
        this.model.addDestination("Copy", SCENE_CHANNEL, UNUSED_CC, SceneCommands.COPY);
        this.model.addDestination("Paste", SCENE_CHANNEL, UNUSED_CC, SceneCommands.PASTE);
        let numScenes = MAX_NUM_SCENES;
        for (let i = 0; i < numScenes; i++) {
            this.model.addDestination("Scene " + (i + 1).toString().padStart(2, "0"), SCENE_CHANNEL, UNUSED_CC, i);
            // this._virtualMIDIDeviceModel.setSource(i, "Device 1", 1, i, -1, i*2);
        }
        this.model.addIsMappingChangedListener(this.isMappingChanged.bind(this));
        // // FIXME: Add listener only while mapping
        // this._midi.addListener(ALL_MIDI_DEVICES, this.onMIDIMessageFromAnyDevice.bind(this));
        this.onMIDIMessageFromAnyDevice = this.onMIDIMessageFromAnyDevice.bind(this);
    }
    /**
     * Set the filter for the devices that can be mapped.
     * @param mapDeviceFilter - The filter function to match the devices that can be mapped. Should return true if the device is to be mapped, false otherwise.
     */
    setMappingFilter(mapDeviceFilter) {
        this._mapDeviceFilter = mapDeviceFilter;
    }
    mappingDeleted(view, index) {
        this.model.clearSource(index);
        this.removeUnmappedMIDIListeners();
    }
    onMIDIMessageFromAnyDevice(deviceHandle, message) {
        if (!this.model.deviceIsOn)
            return;
        let [messageType, channel, data1, data2] = getChannelMessage(message);
        let portName = this._midiDeviceManager.getPortName(deviceHandle, "input");
        let deviceDescriptor = this._midiDeviceManager.getDeviceDescriptor(deviceHandle, "input");
        if (deviceDescriptor === undefined) {
            shouldLog(LogLevel.Error) && console.error(`VirtualMIDIDeviceController.onMIDIMessageFromAnyDevice(): Device descriptor not found for device handle ${deviceHandle}`);
            return;
        }
        let deviceName = deviceDescriptor.deviceNameUnique;
        shouldLog(LogLevel.Info) && console.log(`VirtualMIDIDeviceController: Received message from device ${deviceName} on port ${portName} - type: ${MessageType[messageType]},  channel: ${channel}, data1: ${data1}, data2: ${data2}`);
        let currentSourceIndex = this.model.currentSourceIndex;
        if (this.model.isMapping && (this._mapDeviceFilter === undefined || this._mapDeviceFilter(deviceDescriptor))) {
            if (messageType === MessageType.NoteOn) {
                let note = data1;
                this.setSourceMapping(currentSourceIndex, deviceHandle, channel, UNUSED_CC, note);
            }
            else if (messageType === MessageType.CC) {
                let cc = data1;
                this.setSourceMapping(currentSourceIndex, deviceHandle, channel, cc, UNUSED_NOTE);
            }
        }
    }
    setSourceMapping(mappingIndex, deviceHandle, channel, ccNumber, noteNumber) {
        // Don't map if CC was added in the previous mapping
        if (ccNumber !== UNUSED_CC && mappingIndex > 0 && this.model.sources[mappingIndex - 1].ccNumber === ccNumber)
            return;
        let portName = this._midiDeviceManager.getPortName(deviceHandle, "input");
        let deviceName = this._midiDeviceManager.getDeviceName(deviceHandle, "input");
        let deviceIndex;
        if (!this._deviceHandleToIndex.has(deviceHandle)) {
            deviceIndex = this._nextDeviceIndex++;
            this._deviceHandleToIndex.set(deviceHandle, deviceIndex);
            this._midi.addListener(deviceHandle, this.onMIDIMessage);
        }
        else {
            deviceIndex = this._deviceHandleToIndex.get(deviceHandle);
        }
        this.model.setSource(mappingIndex, deviceName, portName, deviceIndex, channel, ccNumber, noteNumber);
        if (mappingIndex < this.model.destinations.length - 1)
            this.model.currentSourceIndex = (this.model.currentSourceIndex + 1);
        else {
            this.model.currentSourceIndex = 0;
            this.model.isMapping = false;
        }
        this.removeUnmappedMIDIListeners();
    }
    removeUnmappedMIDIListeners() {
        for (let [deviceHandle, deviceIndex] of this._deviceHandleToIndex) {
            let source = this.model.sources.find(s => s.deviceIndex === deviceIndex);
            if (source === undefined) {
                shouldLog(LogLevel.Info) && console.log(`VirtualMIDIDeviceController.setSourceMapping(): Source not found for device index ${deviceIndex}. Removing MIDI listener.`);
                this._midi.removeListener(deviceHandle, this.onMIDIMessage);
                this._deviceHandleToIndex.delete(deviceHandle);
            }
        }
    }
    onMIDIMessage(deviceHandle, message, timeStamp) {
        if (!this.model.deviceIsOn)
            return;
        if (!this.model.isMapping) {
            let [messageType, channel, data1, data2] = getChannelMessage(message);
            let ccNumber = messageType === MessageType.CC ? data1 : UNUSED_CC;
            let noteNumber = (messageType === MessageType.NoteOn || messageType === MessageType.NoteOff) ? data1 : UNUSED_NOTE;
            let value = (messageType === MessageType.NoteOff) ? -data2 : data2;
            // For NoteOff, we set the value (note off velocity) to be negative.
            // So for notes, a value > 0 means note on and value is the note onvelocity, a value <= 0 means note off and -value is the note off velocity. 
            // For usage, see SceneDeviceController.handleSceneStateChanged()
            if (messageType === MessageType.CC || messageType === MessageType.NoteOn || messageType === MessageType.NoteOff) {
                let deviceIndex = this._deviceHandleToIndex.get(deviceHandle);
                if (deviceIndex === undefined) {
                    shouldLog(LogLevel.Warning) && console.warn(`VirtualMIDIDeviceController.onMIDIMessage(): Device index not found for device handle ${deviceHandle}`);
                    return;
                }
                this.model.receiveMIDIMessage(deviceIndex, channel, ccNumber, noteNumber, value, timeStamp);
            }
        }
    }
    get isMapping() {
        return this.model.isMapping;
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
    emitIsMappingChanged(controller, isMapping) {
        for (let listener of this._isMappingChangedListeners) {
            listener(controller, isMapping);
        }
    }
    isMappingChanged(device, isMapping) {
        if (isMapping) {
            this._midi.addListener(ALL_MIDI_DEVICES, this.onMIDIMessageFromAnyDevice);
        }
        else {
            this._midi.removeListener(ALL_MIDI_DEVICES, this.onMIDIMessageFromAnyDevice);
        }
        this.emitIsMappingChanged(this, isMapping);
    }
    setMappingFromJSON(json) {
        this.model.clearAllSources();
        this.removeUnmappedMIDIListeners();
        this._nextDeviceIndex = 0;
        let mappings = JSON.parse(json);
        for (let i = 0; i < mappings.length; i++) {
            let mapping = mappings[i];
            let destination = mapping["destination"];
            let source = mapping["source"];
            let mappingIndex = this.model.destinations.findIndex(d => d.name === destination.name);
            if (mappingIndex === -1) {
                shouldLog(LogLevel.Warning) && console.warn(`VirtualMIDIDeviceController.setMappingFromJSON(): Destination "${destination.name}" not found`);
                continue;
            }
            let deviceHandle = this._midiDeviceManager.getDeviceHandleFromDeviceName(source.deviceName, "input");
            if (deviceHandle === "") {
                shouldLog(LogLevel.Warning) && console.warn(`VirtualMIDIDeviceController.setMappingFromJSON(): Source MIDI device "${source.deviceName}" not found`);
                continue;
            }
            this.setSourceMapping(mappingIndex, deviceHandle, source.channel, source.ccNumber, source.noteNumber);
        }
        return true;
    }
}

