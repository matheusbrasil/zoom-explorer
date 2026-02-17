// @ts-nocheck
import { LCXLDevice } from "./LCXLDevice.js";
import { DEFAULT_SCENE_NUMBER, TEMP_SCENE_NUMBER } from "./Scene.js";
import { MAX_NUM_SCENES, SCENE_CHANNEL, SceneCommands } from "./SceneDeviceController.js";
import { UNUSED_CC, UNUSED_NOTE } from "./VirtualMIDIDeviceModel.js";
import { LogLevel, shouldLog } from "./Logger.js";
const DEFAULT_TEMPLATE = 8;
export class SceneDeviceMIDIView {
    _sceneDeviceModel;
    _lcxl;
    _stateToNoteOrCCMapper;
    _parameterToCCMapper;
    /**
     * Creates a new SceneDeviceMIDIView.
     * @param model The model to view
     * @param lcxl The LCXLDevice to send MIDI messages to
     * @param stateToNoteOrCCMapper A function to map SceneDeviceModel states (notes) to LCXL notes or CCs. Typically comes from VirtualMIDIDeviceModel.ts
     * @param parameterToCCMapper A function to map SceneDeviceModel states (CCs) to LCXL CCs
     */
    constructor(model, stateToNoteOrCCMapper, parameterToCCMapper, lcxl = undefined) {
        this._sceneDeviceModel = model;
        this._sceneDeviceModel.addStateChangedListener(this.handleStateChanged.bind(this));
        // ^---- dangerous to use derived state here (like sceneSlotA status), cannot depend on order of state changed listeners
        this._sceneDeviceModel.addIsRecordingSceneChangedListener(this.handleIsRecordingSceneChanged.bind(this));
        this._sceneDeviceModel.addSceneSlotChangedListener(this.handleSceneSlotChanged.bind(this));
        this._sceneDeviceModel.addSceneChangedListener(this.handleSceneChanged.bind(this));
        this._sceneDeviceModel.addAllScenesChangedListener(this.handleAllScenesChanged.bind(this));
        this._lcxl = lcxl;
        this._stateToNoteOrCCMapper = stateToNoteOrCCMapper;
        this._parameterToCCMapper = parameterToCCMapper;
        this.updateColors();
    }
    setLCXLDevice(lcxl) {
        this._lcxl = lcxl;
        this.updateColors();
    }
    updateColors() {
        this.updateSceneSlotColors();
        this.updateSceneButtonColors();
        this.updateCommandButtonColors();
    }
    clearColors() {
        if (this._lcxl === undefined)
            return;
        this._lcxl.clearAllColors(DEFAULT_TEMPLATE);
    }
    handleStateChanged(device, channel, stateNumber, stateValue) {
        if (this._lcxl === undefined)
            return;
        // NB, we can't depend on derived state here (like sceneSlotASceneNumber), since the order of state changed listeners is not guaranteed
        if (stateNumber === SceneCommands.SLOT_A || stateNumber === SceneCommands.SLOT_B) {
            this.updateSceneButtonColors();
        }
        else if (stateNumber >= 0 && stateNumber < MAX_NUM_SCENES || stateNumber === DEFAULT_SCENE_NUMBER || stateNumber === TEMP_SCENE_NUMBER) {
            let sceneNumber = stateNumber;
            this.updateSceneButtonColor(sceneNumber);
        }
        // let sceneNumber = stateNumber;
        // this.updateSceneButtonColor(sceneNumber);
        // let stateSlotA = this._sceneDeviceModel.getState(SCENE_CHANNEL, SceneCommands.SLOT_A) > 0;
        // let stateSlotB = this._sceneDeviceModel.getState(SCENE_CHANNEL, SceneCommands.SLOT_B) > 0;
        // if (stateNumber >= 0 && stateNumber < MAX_NUM_SCENES) {
        //   let noteNumber = this._stateToNoteMapper(stateNumber);
        //   let index = LCXLDevice.getIndexFromNote(noteNumber);
        //   this._lcxl.sendColor(DEFAULT_TEMPLATE, index, stateValue > 0 ? 3 : 0, stateValue > 0 ? 3 : 0);
        // }
    }
    handleIsRecordingSceneChanged(sceneDeviceModel, isRecordingScene) {
        this.updateSceneButtonColors();
        this.updateCommandButtonColors();
    }
    handleSceneSlotChanged(device) {
        this.updateSceneSlotColors();
        this.updateSceneButtonColors();
    }
    updateCommandButtonColors() {
        if (this._lcxl === undefined)
            return;
        let [channel, note, cc] = this._stateToNoteOrCCMapper(SceneCommands.EDIT);
        if (channel === -1 || (note === UNUSED_NOTE && cc === UNUSED_CC))
            return; // no mapping for that button
        let editIndex = LCXLDevice.getIndexFromNoteOrCC(note, cc);
        if (editIndex === -1) {
            shouldLog(LogLevel.Warning) && console.warn(`LCXLDevice.updateCommandButtonColors() Unable to update colors. No mapping for note number ${note} or CC number ${cc}`);
            return; // no mapping for that button
        }
        let editIntensity = !this._sceneDeviceModel.isRecordingScene ? 0 : this._sceneDeviceModel.isRecordingSceneStart ? 1 : 3;
        this._lcxl.sendColor(DEFAULT_TEMPLATE, editIndex, editIntensity, LCXLDevice.indexIsMonochrome(editIndex) ? editIntensity : 0);
    }
    updateSceneSlotColors() {
        if (this._lcxl === undefined)
            return;
        let channel;
        let note;
        let cc;
        [channel, note, cc] = this._stateToNoteOrCCMapper(SceneCommands.SLOT_A);
        let slotAIndex = LCXLDevice.getIndexFromNoteOrCC(note, cc);
        let slotAIntensity = this._sceneDeviceModel.sceneSlotAMuted ? 1 : 3;
        [channel, note, cc] = this._stateToNoteOrCCMapper(SceneCommands.SLOT_B);
        let slotBIndex = LCXLDevice.getIndexFromNoteOrCC(note, cc);
        let slotBIntensity = this._sceneDeviceModel.sceneSlotBMuted ? 1 : 3;
        this._lcxl.sendColor(DEFAULT_TEMPLATE, slotAIndex, slotAIntensity, LCXLDevice.indexIsMonochrome(slotAIndex) ? slotAIntensity : 0);
        this._lcxl.sendColor(DEFAULT_TEMPLATE, slotBIndex, LCXLDevice.indexIsMonochrome(slotBIndex) ? slotBIntensity : 0, slotBIntensity);
    }
    updateSceneButtonColor(sceneNumber) {
        if (this._lcxl === undefined)
            return;
        let [channel, note, cc] = this._stateToNoteOrCCMapper(sceneNumber);
        if (note === UNUSED_NOTE && cc === UNUSED_CC) {
            return; // that scene isn't mapped to a hardware MIDI button ()
        }
        let index = LCXLDevice.getIndexFromNoteOrCC(note, cc);
        let stateSlotA = this._sceneDeviceModel.getState(SCENE_CHANNEL, SceneCommands.SLOT_A) > 0;
        let stateSlotB = this._sceneDeviceModel.getState(SCENE_CHANNEL, SceneCommands.SLOT_B) > 0;
        let stateCopy = this._sceneDeviceModel.getState(SCENE_CHANNEL, SceneCommands.COPY) > 0;
        let statePaste = this._sceneDeviceModel.getState(SCENE_CHANNEL, SceneCommands.PASTE) > 0;
        let stateClear = this._sceneDeviceModel.getState(SCENE_CHANNEL, SceneCommands.CLEAR) > 0;
        let stateSave = this._sceneDeviceModel.getState(SCENE_CHANNEL, SceneCommands.SAVE) > 0;
        let stateAny = stateCopy || statePaste || stateClear || stateSave || stateSlotA || stateSlotB;
        let stateNumber = sceneNumber;
        let stateScene = this._sceneDeviceModel.getState(SCENE_CHANNEL, stateNumber) > 0;
        let recordingScene = this._sceneDeviceModel.isRecordingScene && this._sceneDeviceModel.currentSceneNumber === sceneNumber;
        let r = this._sceneDeviceModel.getScene(sceneNumber)?.isEmpty ? 0 : 1;
        let g = this._sceneDeviceModel.getScene(sceneNumber)?.isEmpty ? 0 : 1;
        if (sceneNumber === this._sceneDeviceModel.sceneSlotASceneNumber && !(stateSlotB && sceneNumber === this._sceneDeviceModel.sceneSlotBSceneNumber)) {
            g = 0;
            if (recordingScene) {
                if (this._sceneDeviceModel.isRecordingSceneStart)
                    [r, g] = LCXLDevice.AMBER_HALF;
                else
                    r = 3;
            }
            else {
                r = r + 1;
                if (stateSlotA)
                    r = r + 1;
            }
        }
        else if (sceneNumber == this._sceneDeviceModel.sceneSlotBSceneNumber) {
            r = 0;
            if (recordingScene) {
                if (this._sceneDeviceModel.isRecordingSceneStart)
                    [r, g] = LCXLDevice.AMBER_HALF;
                else
                    g = 3;
            }
            else {
                g = g + 1;
                if (stateSlotB)
                    g = g + 1;
            }
        }
        else if (recordingScene) {
            if (this._sceneDeviceModel.isRecordingSceneStart)
                [r, g] = LCXLDevice.AMBER_HALF;
            else
                [r, g] = LCXLDevice.YELLOW_FULL;
        }
        // If destination LED is monochrome, convert to intensity
        if (LCXLDevice.indexIsMonochrome(index)) {
            r = Math.max(r, g);
            g = r;
        }
        this._lcxl.sendColor(DEFAULT_TEMPLATE, index, r, g);
    }
    updateSceneButtonColors() {
        if (this._lcxl === undefined)
            return;
        for (let i = 0; i < MAX_NUM_SCENES; i++) {
            this.updateSceneButtonColor(i);
        }
        this.updateSceneButtonColor(DEFAULT_SCENE_NUMBER);
        this.updateSceneButtonColor(TEMP_SCENE_NUMBER);
    }
    handleSceneChanged(device, sceneNumber) {
        this.updateSceneButtonColor(sceneNumber);
    }
    handleAllScenesChanged(device) {
        this.updateSceneSlotColors();
        this.updateSceneButtonColors();
    }
}

