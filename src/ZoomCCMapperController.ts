// @ts-nocheck
import { LogLevel, shouldLog } from "./Logger.js";
import { MessageType } from "./midiproxy.js";
import { getChannelMessage } from "./miditools.js";
import { numberToHexString } from "./tools.js";
import { ZoomDevice } from "./ZoomDevice.js";
import { UNUSED_CC, UNUSED_NOTE } from "./ZoomCCMapperModel.js";
/*
Each Zoom pedal is a separate channel, from channel 1 to channel 16.

These mappings are constant for each device.

App-level mappings and/or macros are on top of these

 CC  Meaning
  0  Bank MSB
  1  Reserved
  2  Effect 1 on/off
  3  Effect 1 parameter  1
  4  Effect 1 parameter  2
 14  Effect 1 parameter 12
 15  Reserved
 16  Reserved
 17  Effect 2 on/off
 18  Effect 2 parameter  1
 19  Effect 2 parameter  2
 29  Effect 2 parameter 12
 30  Reserved
 31  Reserved
 32  Bank LSB
 33  Effect 3 on/off
 34  Effect 3 parameter  1
 35  Effect 3 parameter  2
 45  Effect 3 parameter 12
 46  Reserved
 47  Reserved
 48  Effect 4 on/off
 49  Effect 4 parameter  1
 50  Effect 4 parameter  2
 60  Effect 4 parameter 12
 61  Reserved
 62  Reserved
 63  Effect 5 on/off
 64  Effect 5 parameter  1
 65  Effect 5 parameter  2
 75  Effect 5 parameter 12
 76  Reserved
 77  Reserved
 78  Effect 6 on/off
 79  Effect 6 parameter  1
 80  Effect 6 parameter  2
 90  Effect 6 parameter 12
 91  Reserved
 92  Reserved
 93  Current Edit Effect on/off
 94  Current Edit Effect parameter  1
 95  Current Edit Effect parameter  2
105  Current Edit Effect parameter 12
106  Reserved
107  Reserved
108  Set Current Edit Effect

120  Not used, channel message


Note Meaning
 C1  Edit next effect slot
 C#1  Edit previous effect slot

 C2  Effect 1 on
 C#2 Effect 2 on
 D2  Effect 3 on
 D#2 Effect 4 on
 E2  Effect 5 on
 F2  Effect 6 on
 G2  Current Edit Effect on

 C3  Effect 1 off
 C#3 Effect 2 off
 D3  Effect 3 off
 D#3 Effect 4 off
 E3  Effect 5 off
 F3  Effect 6 off
 G3  Current Edit Effect off

 C4  Effect 1 on/off toggle
 C#4 Effect 2 on/off toggle
 D4  Effect 3 on/off toggle
 D#4 Effect 4 on/off toggle
 E4  Effect 5 on/off toggle
 F4  Effect 6 on/off toggle
 G4  Current Edit Effect on/off

 C5  Effect 1 on/off momentary
 C#5 Effect 2 on/off momentary
 D5  Effect 3 on/off momentary
 D#5 Effect 4 on/off momentary
 E5  Effect 5 on/off momentary
 F5  Effect 6 on/off momentary
 G5  Current Edit Effect on/off

*/
const ZOOM_MAPPER_NUM_CHANNELS = 16;
const ZOOM_MAPPER_NUM_PARAMETERS = 12;
let ccOffsets = [2, 17, 33, 48, 63, 78, 93];
/**
 * This class maps back and forth between Zoom parameters and MIDI CC values.
 *
 */
export class ZoomCCMapperController {
    _model;
    _view;
    _midiDeviceManager;
    // a parameter is encoded as effectSlot << 8 | parameterNumber
    // effectSlot 7 is the current edit effect
    _paramToCC = new Map();
    _ccToParam = new Map();
    _zoomDevices = new Array();
    _inputDevice = undefined;
    _channelToZoomDeviceIndex = new Array(ZOOM_MAPPER_NUM_CHANNELS);
    constructor(model, view, midiDeviceManager) {
        this.onMIDIMessage = this.onMIDIMessage.bind(this);
        this._model = model;
        this._model.addInputDeviceChangedListener(this.inputDeviceChanged.bind(this));
        this._model.addOutputDeviceChannelChangedListener(this.outputDeviceChanged.bind(this));
        this._view = view;
        this._midiDeviceManager = midiDeviceManager;
        this._midiDeviceManager.addConnectListener(this.midiDeviceConnected.bind(this));
        this._midiDeviceManager.addDisconnectListener(this.midiDeviceDisconnected.bind(this));
        this._midiDeviceManager.addOpenCloseListener(this.midiDeviceOpenedOrClosed.bind(this));
        this.updateInputDeviceList();
        this.initMappings();
        this.initChannelToDeviceIndex();
    }
    addZoomDevice(zoomDevice) {
        this._zoomDevices.push(zoomDevice);
        // find a suitable channel number (after biggest existing number and below ZOOM_MAPPER_NUM_CHANNELS)
        let channel;
        if (this._model.outputDeviceChannels.size === 0) {
            channel = 0;
        }
        else if (this._model.outputDeviceChannels.has(zoomDevice.deviceName)) {
            channel = this._model.outputDeviceChannels.get(zoomDevice.deviceName);
        }
        else {
            let max = Math.max(...this._model.outputDeviceChannels.values());
            if (max < ZOOM_MAPPER_NUM_CHANNELS - 1) {
                channel = max + 1;
            }
            else {
                let max = ZOOM_MAPPER_NUM_CHANNELS - 1;
                let values = this._model.outputDeviceChannels.values();
                let set = new Set(values);
                while (set.has(max)) {
                    max--;
                }
                channel = max;
            }
        }
        this._model.setOutputDeviceChannel(zoomDevice.deviceName, channel, true);
    }
    removeZoomDevice(zoomDevice) {
        let index = this._zoomDevices.indexOf(zoomDevice);
        if (index === -1) {
            // Note: If device was never added (because it was off), then we would end up here. Should detect that.
            // ... or just ignore this error as it's not an error
            shouldLog(LogLevel.Error) && console.error(`ZoomCCMapperController: ZoomDevice ${zoomDevice.deviceName} not found`);
            return;
        }
        this._zoomDevices.splice(this._zoomDevices.indexOf(zoomDevice), 1);
        this._model.removeOuptutDevice(zoomDevice.deviceName);
    }
    paramToKey(effectSlot, parameterNumber) {
        return effectSlot << 8 | (parameterNumber & 0xFF);
    }
    keyToParam(key) {
        return [key >> 8, key & 0xFF];
    }
    mapFromCCToParam(zoomDevice, zoomPatch, ccNumber, ccValue) {
        let paramKey = this._ccToParam.get(ccNumber);
        if (paramKey === undefined) {
            shouldLog(LogLevel.Warning) && console.warn(`ZoomCCMapperController: No mapping for CC ${ccNumber}`);
            return [undefined, undefined, undefined];
        }
        let [effectSlot, parameterNumber] = this.keyToParam(paramKey);
        if (zoomPatch.effectSettings === null) {
            shouldLog(LogLevel.Warning) && console.warn(`ZoomCCMapperController: zoomPatch.effectSettings === null`);
            return [undefined, undefined, undefined];
        }
        if (effectSlot >= zoomPatch.effectSettings.length) {
            shouldLog(LogLevel.Warning) && console.warn(`ZoomCCMapperController: effectSlot >= zoomPatch.effectSettings.length`);
            return [undefined, undefined, undefined];
        }
        let [effectName, numParameters] = ZoomDevice.getEffectNameAndNumParameters(zoomDevice.effectIDMap, zoomPatch.effectSettings[effectSlot].id);
        let parameterName;
        let maxValue;
        let maxNumerical;
        if (parameterNumber == 0) {
            // device on/off
            parameterName = 'ON/OFF';
            maxValue = 1;
        }
        else {
            [parameterName, maxValue, maxNumerical] = ZoomDevice.getParameterNameAndMaxValue(zoomDevice.effectIDMap, zoomPatch.effectSettings[effectSlot].id, parameterNumber);
            if (parameterName === undefined || maxValue === undefined || effectName === undefined) {
                shouldLog(LogLevel.Warning) && console.warn(`ZoomCCMapperController: Effect mapping not found for effect id ${numberToHexString(zoomPatch.effectSettings[effectSlot].id)}, parameter number ${parameterNumber}`);
                return [undefined, undefined, undefined];
            }
        }
        let parameterValue;
        if (maxValue > 127 && maxNumerical !== undefined && maxNumerical !== maxValue && maxValue - maxNumerical > 1 && maxValue - maxNumerical < 120) {
            let numStrings = maxValue - maxNumerical;
            if (127 - ccValue < numStrings) {
                parameterValue = maxValue - (127 - ccValue);
            }
            else {
                parameterValue = Math.round(maxNumerical * ccValue / (127 - numStrings));
            }
        }
        else
            parameterValue = Math.round(maxValue * ccValue / 127);
        return [effectSlot, parameterNumber, parameterValue];
    }
    mapFromParamToCC(zoomDevice, zoomPatch, effectSlot, parameterNumber, parameterValue) {
        let param = this.paramToKey(effectSlot, parameterNumber);
        let ccNumber = this._paramToCC.get(param);
        if (ccNumber === undefined) {
            shouldLog(LogLevel.Warning) && console.warn(`ZoomCCMapperController: No mapping for param ${param}`);
            return [undefined, undefined];
        }
        if (zoomPatch.effectSettings === null) {
            shouldLog(LogLevel.Warning) && console.warn(`ZoomCCMapperController: zoomPatch.effectSettings === null`);
            return [undefined, undefined];
        }
        if (effectSlot >= zoomPatch.effectSettings.length) {
            shouldLog(LogLevel.Warning) && console.warn(`ZoomCCMapperController: effectSlot >= zoomPatch.effectSettings.length`);
            return [undefined, undefined];
        }
        let [parameterName, maxValue] = ZoomDevice.getParameterNameAndMaxValue(zoomDevice.effectIDMap, zoomPatch.effectSettings[effectSlot].id, parameterNumber);
        if (parameterName === undefined || maxValue === undefined) {
            shouldLog(LogLevel.Warning) && console.warn(`ZoomCCMapperController: Effect mapping not found for effect id ${numberToHexString(zoomPatch.effectSettings[effectSlot].id)}`);
            return [undefined, undefined];
        }
        let ccValue = Math.round(parameterValue * 127 / maxValue);
        return [ccNumber, ccValue];
    }
    initMappings() {
        for (let effectSlot = 0; effectSlot < 7; effectSlot++) {
            // add mapping for device on/off
            let parameterNumber = 0; // device on/off
            let ccNumber = ccOffsets[effectSlot];
            this._ccToParam.set(ccNumber, this.paramToKey(effectSlot, parameterNumber));
            this._paramToCC.set(this.paramToKey(effectSlot, parameterNumber), ccNumber);
            // add mapping for ZOOM_MAPPER_NUM_PARAMETERS
            for (let parameterIndex = 0; parameterIndex < ZOOM_MAPPER_NUM_PARAMETERS; parameterIndex++) {
                parameterNumber = parameterIndex + 2;
                ccNumber = ccOffsets[effectSlot] + 1 + parameterIndex;
                this._ccToParam.set(ccNumber, this.paramToKey(effectSlot, parameterNumber));
                this._paramToCC.set(this.paramToKey(effectSlot, parameterNumber), ccNumber);
            }
        }
    }
    inputDeviceChanged(mapperModel, name) {
        shouldLog(LogLevel.Info) && console.log(`ZoomCCMapperController.inputDeviceChanged(${name})`);
        this.updateInputDevice();
    }
    updateInputDevice() {
        let [device, key] = this._midiDeviceManager.getDeviceFromName(this._model.inputDevice);
        if (device === undefined) {
            shouldLog(LogLevel.Warning) && console.warn(`ZoomCCMapperController.inputDeviceChanged: Device ${name} not found`);
            return;
        }
        if (this._inputDevice !== undefined) {
            this._inputDevice.removeListener(this.onMIDIMessage);
        }
        this._inputDevice = device;
        this._inputDevice.addListener(this.onMIDIMessage);
    }
    outputDeviceChanged(mapperModel, name, channel, operation) {
        this.initChannelToDeviceIndex();
    }
    initChannelToDeviceIndex() {
        this._channelToZoomDeviceIndex.fill(-1);
        for (let [outputDeviceName, channel] of this._model.outputDeviceChannels) {
            let zoomDeviceIndex = this._zoomDevices.findIndex(zoomDevice => zoomDevice.deviceName === outputDeviceName);
            if (zoomDeviceIndex === -1) {
                shouldLog(LogLevel.Info) && console.log(`ZoomCCMapperController.initChannelToDeviceIndex: Device ${outputDeviceName} not found`);
                continue;
            }
            this._channelToZoomDeviceIndex[channel] = zoomDeviceIndex;
        }
    }
    midiDeviceConnected(deviceManager, device, key) {
        this.updateInputDeviceList();
        if (device instanceof ZoomDevice && device.isOpen) {
            // FIXME: Are we sure that the device has been opened if it should be, if another listener is supposed to open it? 
            // Are we sensitive to the order the listeners are called in? 
            this.addZoomDevice(device);
        }
    }
    midiDeviceDisconnected(deviceManager, device, key) {
        this.updateInputDeviceList();
        if (device instanceof ZoomDevice) {
            this.removeZoomDevice(device);
        }
    }
    midiDeviceOpenedOrClosed(deviceManager, device, key, open) {
        if (open)
            this.midiDeviceConnected(deviceManager, device, key);
        else
            this.midiDeviceDisconnected(deviceManager, device, key);
    }
    updateInputDeviceList() {
        let devices = this._midiDeviceManager.midiDeviceList;
        let inputDevices = [];
        for (let device of devices) {
            if (device.isInput && !ZoomDevice.isDeviceType(device))
                inputDevices.push(device.deviceName);
        }
        this._view.updateDeviceSelector(inputDevices);
    }
    onMIDIMessage(device, data) {
        if (!this._model.on)
            return;
        let [messageType, channel, data1, data2] = getChannelMessage(data);
        if (messageType !== MessageType.CC && messageType !== MessageType.NoteOn && messageType !== MessageType.NoteOff) {
            return;
        }
        let ccNumber = messageType == MessageType.CC ? data1 : UNUSED_CC;
        let noteNumber = (messageType == MessageType.NoteOn || messageType == MessageType.NoteOff) ? data1 : UNUSED_NOTE;
        let inputValue = data2;
        shouldLog(LogLevel.Info) && console.log(`ZoomCCMapperController: Received message from device ${device.deviceName} - type: ${MessageType[messageType]},  channel: ${channel + 1}, data1: ${data1}, data2: ${data2}`);
        let parameterName;
        let maxValue;
        let effectName;
        let numParameters;
        let deviceName;
        let parameterString;
        let valueString;
        let zoomDevice = undefined;
        let effectSlot = undefined;
        let parameterNumber = undefined;
        let parameterValue = undefined;
        let zoomDeviceIndex = this._channelToZoomDeviceIndex[channel];
        if (zoomDeviceIndex === -1) {
            shouldLog(LogLevel.Warning) && console.warn(`ZoomCCMapperController.onMIDIMessage: No Zoom output device found for channel ${channel + 1}`);
        }
        else {
            zoomDevice = this._zoomDevices[zoomDeviceIndex];
            if (zoomDevice.currentPatch === undefined) {
                shouldLog(LogLevel.Warning) && console.warn(`ZoomCCMapperController.onMIDIMessage: No current patch found for device ${zoomDevice.deviceName}`);
                return;
            }
            if (ccNumber !== UNUSED_CC) {
                [effectSlot, parameterNumber, parameterValue] = this.mapFromCCToParam(zoomDevice, zoomDevice.currentPatch, ccNumber, inputValue);
                if (effectSlot === undefined || parameterNumber === undefined || parameterValue === undefined) {
                    shouldLog(LogLevel.Info) && console.log(`ZoomCCMapperController.onMIDIMessage: No mapping found for CC ${ccNumber} on channel ${channel + 1}`);
                }
                else {
                    shouldLog(LogLevel.Info) && console.log(`ZoomCCMapperController.onMIDIMessage: Mapping from channel ${channel + 1} CC ${ccNumber} to device ${zoomDevice.deviceName} effectSlot ${effectSlot} and parameterNumber ${parameterNumber}`);
                    zoomDevice.setEffectParameterForCurrentPatch(effectSlot, parameterNumber, parameterValue);
                }
            }
        }
        if (this._view.enabled) {
            if (zoomDevice === undefined || zoomDevice.currentPatch === undefined || effectSlot === undefined || parameterNumber === undefined || parameterValue === undefined) {
                deviceName = "";
                parameterString = "";
                valueString = "";
            }
            else {
                [parameterName, maxValue] = ZoomDevice.getParameterNameAndMaxValue(zoomDevice.effectIDMap, zoomDevice.currentPatch.effectSettings[effectSlot].id, parameterNumber);
                [effectName, numParameters] = ZoomDevice.getEffectNameAndNumParameters(zoomDevice.effectIDMap, zoomDevice.currentPatch.effectSettings[effectSlot].id);
                deviceName = zoomDevice.deviceName;
                parameterString = `Slot ${effectSlot + 1} ${effectName} ${parameterName}`;
                valueString = zoomDevice.getStringFromRawParameterValue(zoomDevice.currentPatch.effectSettings[effectSlot].id, parameterNumber, parameterValue);
            }
            this._view.addMapping(channel, ccNumber, noteNumber, inputValue, deviceName, parameterString, valueString);
        }
    }
}

