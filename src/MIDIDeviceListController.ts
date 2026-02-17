// @ts-nocheck
import { MIDIDeviceProperties } from "./MIDIDeviceListModel.js";
import { LogLevel, shouldLog } from "./Logger.js";
import { ALL_MIDI_DEVICES } from "./midiproxy.js";
import { bytesToHexString } from "./tools.js";
import { ZoomDevice } from "./ZoomDevice.js";
export class MIDIDeviceListController {
    _model;
    _view;
    _midi;
    _midiDeviceManager;
    constructor(model, view, midi, midiDeviceManager) {
        this._model = model;
        this._model.addDevicePropertiesChangedListener(this.devicePropertiesChanged.bind(this));
        this._view = view;
        this._midi = midi;
        this._midiDeviceManager = midiDeviceManager;
        this._midiDeviceManager.addConnectListener(this.midiDeviceConnected.bind(this));
        this._midiDeviceManager.addDisconnectListener(this.midiDeviceDisconnected.bind(this));
        this._midi.addListener(ALL_MIDI_DEVICES, this.onMIDIMessageFromAnyDevice.bind(this));
    }
    onMIDIMessageFromAnyDevice(deviceInputID, message) {
        if (!this._view.enabled)
            return;
        this._view.updateMIDIDevicesTableActivity(deviceInputID, message);
    }
    devicePropertiesChanged(model, deviceName, settings, operation) {
        // react to device on/off state changed by opening / closing device ...
    }
    midiDeviceConnected(deviceManager, device, key) {
        let deviceName = device.deviceName;
        let properties = this._model.deviceProperties.get(deviceName);
        ;
        let deviceExisted = properties !== undefined;
        properties = properties ?? new MIDIDeviceProperties();
        properties.inputID = device.deviceInfo.inputID;
        properties.deviceName = deviceName;
        properties.inputName = device.deviceInfo.inputName;
        properties.outputName = device.deviceInfo.outputName;
        properties.manufacturerName = device.deviceInfo.manufacturerName;
        properties.familyCode = bytesToHexString(device.deviceInfo.familyCode, " ");
        properties.modelNumber = bytesToHexString(device.deviceInfo.modelNumber, " ");
        properties.version = device.deviceInfo.manufacturerID[0] === 0x52 ? ZoomDevice.getZoomVersionNumber(device.deviceInfo.versionNumber).toString() :
            bytesToHexString(device.deviceInfo.versionNumber, " ");
        properties.deviceAvailable = true;
        // properties.deviceOn = deviceExisted ? properties.deviceOn : ZoomDevice.isDeviceType(device.deviceInfo) ? true : false;
        properties.deviceOn = deviceExisted ? properties.deviceOn : true; // default to device on
        this._model.setDeviceProperties(deviceName, properties);
    }
    midiDeviceDisconnected(deviceManager, device, key) {
        let deviceName = device.deviceName;
        let properties = this._model.deviceProperties.get(deviceName);
        ;
        if (properties === undefined) {
            shouldLog(LogLevel.Error) && console.error(`Disconnected MIDI device "${deviceName}" was not in device list`);
            return;
        }
        properties.deviceAvailable = false;
        this._model.setDeviceProperties(deviceName, properties);
    }
}

