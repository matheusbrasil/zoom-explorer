// @ts-nocheck
import { getPatchFromSysex } from "./SymbiosisTools.js";
import { LogLevel, shouldLog } from "./Logger.js";
import { bytesToHexString, numberToHexString } from "./tools.js";
import { ZoomDevice } from "./ZoomDevice.js";
/**
 * This class is the middle-man between a ZoomDevice and a ZoomDeviceModel.
 * Maybe it should be called ZoomDeviceMIDIView instead?
 * Or ZoomDeviceMIDIViewController.
 */
export class ZoomDeviceController {
    _zoomDevice;
    _zoomDeviceModel;
    _muteModelParameterChanges = 0; // mute if > 0. To mute, increment this value. To unmute, decrement this value.
    constructor(zoomDeviceModel, zoomDevice) {
        this._zoomDeviceModel = zoomDeviceModel;
        this._zoomDevice = zoomDevice;
        this.valueToStringConverter = this.valueToStringConverter.bind(this);
        this.stringToValueConverter = this.stringToValueConverter.bind(this);
        this._zoomDeviceModel.setParameterInfoConverters(this.valueToStringConverter, this.stringToValueConverter);
        this._zoomDeviceModel.name = this._zoomDevice.deviceName;
        this._zoomDeviceModel.numParametersPerPage = this._zoomDevice.numParametersPerPage;
        this.updateModelFromPatch();
        // FIXME: keep effect names and parameter info up to date
        //this._zoomDevice.addCurrentPatchChangedListener(handleCurrentPatchChanged);
        this.handleEffectSlotChangedOnDevice = this.handleEffectSlotChangedOnDevice.bind(this);
        this._zoomDevice.addEffectSlotChangedListener(this.handleEffectSlotChangedOnDevice);
        this.handleEffectParameterChangedOnDevice = this.handleEffectParameterChangedOnDevice.bind(this);
        this._zoomDevice.addEffectParameterChangedListener(this.handleEffectParameterChangedOnDevice);
        this.handleMemorySlotChangedOnDevice = this.handleMemorySlotChangedOnDevice.bind(this);
        this._zoomDevice.addMemorySlotChangedListener(this.handleMemorySlotChangedOnDevice);
        this.handleEffectParameterChangedInModel = this.handleEffectParameterChangedInModel.bind(this);
        this._zoomDeviceModel.addParameterChangedListener(this.handleEffectParameterChangedInModel);
        this.handleEffectSlotEnabledInModel = this.handleEffectSlotEnabledInModel.bind(this);
        this._zoomDeviceModel.addChannelEnabledListener(this.handleEffectSlotEnabledInModel);
        this.handleEffectSlotChangedInModel = this.handleEffectSlotChangedInModel.bind(this);
        this._zoomDeviceModel.addCurrentEffectSlotChangedListener(this.handleEffectSlotChangedInModel);
        this.handleEffectSlotInstrumentNumberChangedInModel = this.handleEffectSlotInstrumentNumberChangedInModel.bind(this);
        this._zoomDeviceModel.addChannelInstrumentNumberChangedListener(this.handleEffectSlotInstrumentNumberChangedInModel);
        this.handlePatchSysexChangedInModel = this.handlePatchSysexChangedInModel.bind(this);
        this._zoomDeviceModel.addPatchSysexChangedListener(this.handlePatchSysexChangedInModel);
    }
    /**
     * Store the current patch from the ZoomDeviceto the model as sysex data.
     * Used before storing a model to file.
     */
    storePatchToModelAsSysex() {
        let patch = this._zoomDevice.currentPatch;
        if (patch === undefined) {
            shouldLog(LogLevel.Error) && console.error(`currentPatch is undefined`);
            return;
        }
        let sysex = this._zoomDevice.getSysexForCurrentPatch(patch);
        if (sysex === undefined) {
            shouldLog(LogLevel.Error) && console.error(`getSysexForCurrentPatch() failed for patch "${patch.name}"`);
            return;
        }
        let sysexString = bytesToHexString(sysex).toLowerCase();
        this._zoomDeviceModel.setPatchSysex(sysexString, this.handlePatchSysexChangedInModel);
    }
    updateModelFromPatch() {
        let patch = this._zoomDevice.currentPatch;
        if (patch === undefined || patch.effectSettings === null)
            return;
        this._muteModelParameterChanges++;
        this._zoomDeviceModel.currentEffectSlot = patch.currentEffectSlot;
        let numChannelsToRemove = Math.max(0, this._zoomDeviceModel.getNumChannels() - patch.effectSettings.length);
        this._zoomDeviceModel.removeChannelInfos(numChannelsToRemove); // Note: This will trigger channelInfoRemoved events for all channels
        this._muteModelParameterChanges--;
        for (let slot = 0; slot < patch.effectSettings.length; slot++) {
            let effectID = patch.effectSettings[slot].id;
            let parameters = patch.effectSettings[slot].parameters;
            let [effectName, numParameters] = ZoomDevice.getEffectNameAndNumParameters(this._zoomDevice.effectIDMap, effectID);
            if (effectName === undefined || numParameters === undefined) {
                shouldLog(LogLevel.Error) && console.error(`Could not get effect name for effect with ID ${effectID}`);
                continue;
            }
            this._muteModelParameterChanges++;
            this._zoomDeviceModel.clearChannelInfo(slot);
            this._zoomDeviceModel.setSlotName(slot, effectName);
            let effectColor = ZoomDevice.getColorFromEffectID(effectID, this._zoomDevice.deviceName);
            this._zoomDeviceModel.setSlotColor(slot, effectColor);
            this._zoomDeviceModel.setSlotEnabled(slot, patch.effectSettings[slot].enabled);
            this._zoomDeviceModel.setSlotEffectID(slot, effectID);
            for (let parameterIndex = 0; parameterIndex < numParameters; parameterIndex++) {
                let parameterNumber = parameterIndex + 2;
                let [parameterName, maxValue] = ZoomDevice.getParameterNameAndMaxValue(this._zoomDevice.effectIDMap, effectID, parameterNumber);
                let name = parameterName ?? "";
                let max = maxValue ?? 0;
                let value = parameters[parameterIndex];
                this._zoomDeviceModel.setParameterInfo(slot, parameterIndex, name, 0, max, value);
            }
            // FIXME: Should we notify about individual channel info's being updated, or should we have a separate message for all notifications?
            this._zoomDeviceModel.channelInfoHasBeenUpdated(slot);
            this._muteModelParameterChanges--;
        }
        // this._muteModelParameterChanges++;
        // this._zoomDeviceModel.fullModelHasBeenUpdated();
        // this._muteModelParameterChanges--;    
    }
    valueToStringConverter(channel, parameterNumber, rawValue) {
        let effectSlot = channel;
        let patch = this._zoomDevice.currentPatch;
        let valueString = "";
        if (patch !== undefined && patch.effectSettings !== null && effectSlot < patch.effectSettings.length) {
            let effectID = patch.effectSettings[effectSlot].id;
            let zoomParameterNumber = parameterNumber + 2;
            valueString = this._zoomDevice.getStringFromRawParameterValue(effectID, zoomParameterNumber, rawValue);
        }
        return valueString;
    }
    stringToValueConverter(channel, parameterNumber, valueString) {
        let effectSlot = channel;
        let patch = this._zoomDevice.currentPatch;
        let rawValue = 0;
        if (patch !== undefined && patch.effectSettings !== null && effectSlot < patch.effectSettings.length) {
            let effectID = patch.effectSettings[effectSlot].id;
            let zoomParameterNumber = parameterNumber + 2;
            let maxValue;
            [rawValue, maxValue] = this._zoomDevice.getRawParameterValueFromString(effectID, zoomParameterNumber, valueString);
        }
        return rawValue;
    }
    // private parameterNumberToInfoConverter(channel: number, parameterNumber: number): [name: string, min: number, max: number]
    // {
    //   let effectSlot = channel;
    //   let patch = this._zoomDevice.currentPatch;
    //   let name: string = "";
    //   let min: number = 0;
    //   let max: number = 0;
    //   if (patch !== undefined && patch.effectSettings !== null && effectSlot< patch.effectSettings.length) {
    //     let effectID = patch.effectSettings[effectSlot].id;
    //     let [parameterName, maxValue] = this._zoomDevice.getParameterNameAndMaxValue(effectID, parameterNumber);
    //     max = maxValue ?? max;
    //     name = parameterName ?? name;
    //   }
    //   return [name, min, max];
    // }
    handleEffectSlotChangedOnDevice(zoomDevice, effectSlot) {
        // FIXME: see ZoomPatchEditor, updateEffectSlotFrame, probably keep a patch in ZoomDeviceModel ??
        // or just keep the selected slot in th emodel
        //    patchEditor.updateEffectSlotFrame(effectSlot);
        this._muteModelParameterChanges++;
        this._zoomDeviceModel.currentEffectSlot = effectSlot;
        this._muteModelParameterChanges--;
    }
    handleEffectParameterChangedOnDevice(zoomDevice, effectSlot, paramNumber, paramValue) {
        this._muteModelParameterChanges++;
        if (paramNumber == 0) {
            // Effect slot on/off
            this._zoomDeviceModel.setSlotEnabled(effectSlot, paramValue !== 0);
        }
        else if (paramNumber == 1) {
            // Effect slot effect ID
            this._zoomDeviceModel.setSlotEffectID(effectSlot, paramValue);
        }
        else if (paramNumber >= 2) {
            let parameterIndex = paramNumber - 2;
            this._zoomDeviceModel.setParameter(effectSlot, parameterIndex, paramValue);
        }
        this._muteModelParameterChanges--;
    }
    handleMemorySlotChangedOnDevice(zoomDevice, memorySlot) {
        this.updateModelFromPatch();
        // FIXME: Should all scenes be wiped now?
    }
    handleEffectParameterChangedInModel(device, channel, parameterNumber, parameterValue) {
        let slot = channel;
        if (!this._muteModelParameterChanges) {
            let zoomParameterNumber = parameterNumber + 2;
            let integerValue = Math.round(parameterValue); // Assume device uses integer values
            this._zoomDevice.setEffectParameterForCurrentPatch(slot, zoomParameterNumber, integerValue);
        }
        this._muteModelParameterChanges++;
        this._zoomDeviceModel.currentEffectSlot = slot;
        this._muteModelParameterChanges--;
    }
    handleEffectSlotEnabledInModel(device, channel, enabled) {
        let slot = channel;
        if (!this._muteModelParameterChanges) {
            let parameterValue = enabled ? 1 : 0;
            let parameterNumber = 0;
            this._zoomDevice.setEffectParameterForCurrentPatch(slot, parameterNumber, parameterValue);
        }
        this._muteModelParameterChanges++;
        this._zoomDeviceModel.currentEffectSlot = slot;
        this._muteModelParameterChanges--;
    }
    handleEffectSlotChangedInModel(device, currentEffectSlot) {
        if (this._muteModelParameterChanges)
            return;
        this._zoomDevice.setCurrentEffectSlot(currentEffectSlot);
    }
    /**
     * Called when the effect in an effect slot has been changed
     * @param device
     * @param channel
     * @param instrumentNumber
     * @returns
     */
    handleEffectSlotInstrumentNumberChangedInModel(device, channel, instrumentNumber) {
        if (this._muteModelParameterChanges)
            return;
        let effectSlot = channel;
        let effectID = instrumentNumber;
        // Set effect ID on device
        this._zoomDevice.setEffectParameterForCurrentPatch(channel, 1, effectID);
        let effectMap = this._zoomDevice.effectIDMap?.get(effectID);
        if (effectMap === undefined) {
            shouldLog(LogLevel.Error) && console.error(`Unable to find mapping for effect id ${numberToHexString(effectID)} in effectSlot ${channel} in patch ${this._zoomDevice.currentPatch?.name}`);
            return;
        }
        // Update device model
        this._muteModelParameterChanges++;
        let effectName = effectMap.name;
        let effectColor = ZoomDevice.getColorFromEffectID(effectID, this._zoomDevice.deviceName);
        this._zoomDeviceModel.setSlotName(effectSlot, effectName);
        this._zoomDeviceModel.setSlotColor(effectSlot, effectColor);
        let effectSettings = this._zoomDevice.currentPatch?.effectSettings?.[effectSlot];
        if (effectSettings === undefined) {
            shouldLog(LogLevel.Error) && console.error(`Unable to get effect settings for effect id ${numberToHexString(effectID)} in effectSlot ${effectSlot} in patch ${this._zoomDevice.currentPatch?.name}`);
            return;
        }
        this._zoomDeviceModel.removeAllParametersFromChannel(effectSlot);
        let parameters = effectSettings.parameters;
        for (let parameterIndex = 0; parameterIndex < effectMap.parameters.length; parameterIndex++) {
            let parameterNumber = parameterIndex + 2;
            let [parameterName, maxValue] = ZoomDevice.getParameterNameAndMaxValue(this._zoomDevice.effectIDMap, effectID, parameterNumber);
            let name = parameterName ?? "";
            let max = maxValue ?? 0;
            let value = parameters[parameterIndex];
            this._zoomDeviceModel.setParameterInfo(effectSlot, parameterIndex, name, 0, max, value);
        }
        this._zoomDeviceModel.channelInfoHasBeenUpdated(effectSlot);
        this._muteModelParameterChanges--;
        /*
      *** something from here (index.ts)
    
      let effectSettings = zoomPatch.effectSettings[effectSlot];
      let previousEffectID = effectSettings.id;
      effectSettings.id = effectID;
      ZoomDevice.setDefaultsForEffect(effectSettings, effectIDMap);
      zoomPatch.changeEffectInSlot(effectSlot, effectSettings);
    
      let effectMap = effectIDMap.get(effectSettings.id);
      if (effectMap === undefined) {
        shouldLog(LogLevel.Error) && console.error(`Unable to find mapping for effect id ${numberToHexString(effectSettings.id)} in effectSlot ${effectSlot} in patch ${zoomPatch.name}`);
        return;
      }
    
      if (zoomDevice !== undefined && patchAndDeviceMatches) {
        zoomDevice.updateScreenForEffectInSlot(effectSlot, effectMap, effectSettings);
        zoomDevice.uploadPatchToCurrentPatch(zoomPatch);
      }
        
        */
    }
    handlePatchSysexChangedInModel(device, modelPatchSysexString) {
        let currentPatch = this._zoomDevice.currentPatch;
        if (currentPatch === undefined) {
            shouldLog(LogLevel.Error) && console.error(`currentPatch is undefined`);
            return;
        }
        let currentPatchSysex = this._zoomDevice.getSysexForCurrentPatch(currentPatch);
        if (currentPatchSysex === undefined) {
            shouldLog(LogLevel.Error) && console.error(`getSysexForCurrentPatch() failed for patch "${currentPatch.name}"`);
            return;
        }
        let currentPatchSysexString = bytesToHexString(currentPatchSysex).toLowerCase();
        if (currentPatchSysexString === modelPatchSysexString) {
            shouldLog(LogLevel.Info) && console.log(`currentPatchSysex is equal to modelPatchSysex. Not updating currentPatch in pedal.`);
            return;
        }
        let patch = getPatchFromSysex(modelPatchSysexString, this._zoomDevice);
        if (patch !== undefined) {
            shouldLog(LogLevel.Info) && console.log(`Uploading patch "${patch.name}" to current patch on pedal`);
            this._zoomDevice.uploadPatchToCurrentPatch(patch);
        }
    }
}

