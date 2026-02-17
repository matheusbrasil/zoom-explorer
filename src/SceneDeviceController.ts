// @ts-nocheck
import { IGNORE_CHANNEL_ENABLED, IGNORE_INSTRUMENT, IGNORE_PARAMETER_VALUE } from "./IDeviceModel.js";
import { DeviceListChangeType } from "./RackDeviceModel.js";
import { DEFAULT_SCENE_NUMBER, Morphs, ParameterLock, Scene, TEMP_SCENE_NUMBER } from "./Scene.js";
import { SceneDeviceModel } from "./SceneDeviceModel.js";
import { shouldLog, LogLevel } from "./Logger.js";
export var SceneCommands;
(function (SceneCommands) {
    SceneCommands[SceneCommands["SLOT_A"] = 64] = "SLOT_A";
    SceneCommands[SceneCommands["SLOT_B"] = 65] = "SLOT_B";
    SceneCommands[SceneCommands["SAVE"] = 66] = "SAVE";
    SceneCommands[SceneCommands["COPY"] = 67] = "COPY";
    SceneCommands[SceneCommands["PASTE"] = 68] = "PASTE";
    SceneCommands[SceneCommands["CLEAR"] = 69] = "CLEAR";
    SceneCommands[SceneCommands["EDIT"] = 70] = "EDIT";
    SceneCommands[SceneCommands["UNKNOWN"] = 255] = "UNKNOWN";
})(SceneCommands || (SceneCommands = {}));
export var SceneParameters;
(function (SceneParameters) {
    SceneParameters[SceneParameters["CROSSFADER"] = 64] = "CROSSFADER";
})(SceneParameters || (SceneParameters = {}));
export const MAX_NUM_SCENES = 16; // not counting default and temp
export const SCENE_CHANNEL = 0;
export const NUM_SCENE_SLOTS = 2;
export const NUM_SPECIAL_SCENES = 2; // default and temp
const NOT_MORPHED_YET = -1;
const DOUBLE_CLICK_MILLISECONDS = 500;
export class SceneDeviceController {
    _sceneDeviceModel;
    _rackDeviceModel;
    _sceneDeviceView;
    _numSceneButtonsPressed = 0;
    _wasRecordingScene = false;
    _editPressedAlone = false;
    _isSendingScene = false; // used to prevent recording currentPatchScene while sending scene
    _isMorphing = false; // used to prevent recording defaultScene while morphing
    _mostRecentSceneNumber = -1;
    _copiedScene = new Scene("Scene copy");
    _blankScene = new Scene("Scene blank");
    _currentPatchScene = new Scene("Scene patch"); // Was currentPartScene in basic-nodejs-example 2024, used for morphing and such, this is the current unmorphed scene (= default/patch).
    _currentEditFlagsScene = new Scene("Scene edit"); // Was currentEditScene in basic-nodejs-example 2024, used to revert parameters back after editing. The values in the plocks are not used.
    _currentMorphFactor = NOT_MORPHED_YET; // Was lastMorphAmount in basic-nodejs-example 2024
    _previousMorphFactor = NOT_MORPHED_YET;
    _morphs = new Morphs();
    constructor(view, sceneDeviceModel, rackDeviceModel, numScenes = 16) {
        this._sceneDeviceView = view;
        this._sceneDeviceModel = sceneDeviceModel;
        this._rackDeviceModel = rackDeviceModel;
        this.setupScenes(numScenes);
        this.setupSceneSlots();
        this._sceneDeviceView.createView();
        this.setupDeviceListeners();
        this._sceneDeviceModel.addStateChangedListener(this.handleSceneStateChanged.bind(this));
        this._sceneDeviceModel.addParameterChangedListener(this.handleSceneParameterChanged.bind(this));
        this._sceneDeviceView.addStoreSceneListener(this.handleStoreSceneButtonClicked.bind(this));
        this._rackDeviceModel.addDeviceListChangedListener(this.handleRackDeviceListChanged.bind(this));
    }
    setupDeviceListeners() {
        let deviceModels = this._rackDeviceModel.deviceModels;
        for (let i = 1; i < deviceModels.length; i++) {
            // skip first device model, since we assume that is the SceneDeviceModel
            let deviceModel = deviceModels[i];
            // Listeners also added in handleRackDeviceListChanged(), keep these in sync
            deviceModel.addParameterChangedListener(this.handleRackDeviceParameterChanged.bind(this));
            deviceModel.addChannelEnabledListener(this.handleRackDeviceChannelEnabledChanged.bind(this));
            deviceModel.addChannelInstrumentNumberChangedListener(this.handleRackDeviceChannelInstrumentNumberChanged.bind(this));
            deviceModel.addChannelInfoRemovedListener(this.handleRackDeviceChannelInfoRemoved.bind(this));
        }
    }
    setupScenes(numScenes) {
        let channel = SCENE_CHANNEL;
        for (let sceneNumber = 0; sceneNumber < numScenes; sceneNumber++) {
            let sceneName = "Scene " + (sceneNumber + 1).toString().padStart(2, "0");
            let stateName = (sceneNumber + 1).toString().padStart(2, "0");
            this._sceneDeviceModel.addScene(sceneName);
            this._sceneDeviceModel.setStateName(channel, sceneNumber, stateName);
        }
        this._sceneDeviceModel.setStateName(channel, DEFAULT_SCENE_NUMBER, "DS");
        this._sceneDeviceModel.setStateName(channel, TEMP_SCENE_NUMBER, "TS");
    }
    setupSceneSlots() {
        let channel = 0;
        this._sceneDeviceModel.setStateName(channel, SceneCommands.SLOT_A, "A");
        this._sceneDeviceModel.setStateName(channel, SceneCommands.SLOT_B, "B");
        this._sceneDeviceModel.setParameterInfo(channel, SceneParameters.CROSSFADER, "", 0, 127);
    }
    storeSceneSnapshopOfRack(scene) {
        scene.clear();
        let deviceModels = this._rackDeviceModel.deviceModels;
        for (let deviceIndex = 1; deviceIndex < deviceModels.length; deviceIndex++) {
            // skip first device model, since we assume that is the SceneDeviceModel
            let deviceModel = deviceModels[deviceIndex];
            let channelList = deviceModel.getChannelList();
            for (let channel of channelList) {
                let channelInfo = deviceModel.getChannelInfo(channel);
                for (let [parameterNumber, parameterValue] of channelInfo.parameterValues) {
                    scene.setParameterLock(deviceModel, deviceIndex, channel, parameterNumber, parameterValue);
                }
                scene.setChannelEnabledLock(deviceModel, deviceIndex, channel, channelInfo.enabled);
                scene.setInstrumentLock(deviceModel, deviceIndex, channel, deviceModel.getChannelInstrumentNumber(channel));
            }
        }
    }
    storeSceneParameterLock(sceneNumber, deviceModel, deviceIndex, channel, parameterNumber, parameterValue, parameterValueStart = IGNORE_PARAMETER_VALUE) {
        let scene = this._sceneDeviceModel.getScene(sceneNumber);
        if (scene === undefined) {
            shouldLog(LogLevel.Warning) && console.warn(`Unable to store scene parameter lock. Scene ${sceneNumber} not found.`);
            return;
        }
        let firstPlock = scene.isEmpty;
        let plock = scene.setParameterLock(deviceModel, deviceIndex, channel, parameterNumber, parameterValue, parameterValueStart);
        if (firstPlock)
            this._sceneDeviceModel.sceneHasBeenUpdated(sceneNumber);
        if (plock.parameterValue === IGNORE_PARAMETER_VALUE) {
            shouldLog(LogLevel.Warning) && console.warn(`Parameter value is IGNORE_PARAMETER_VALUE for parameter ${parameterNumber} on channel ${channel} of device ${deviceModel.name}`);
        }
    }
    storeSceneChannelEnabledLock(sceneNumber, deviceModel, deviceIndex, channel, channelEnabled) {
        let scene = this._sceneDeviceModel.getScene(sceneNumber);
        if (scene === undefined) {
            shouldLog(LogLevel.Warning) && console.warn(`Unable to store scene channel enabled lock. Scene ${sceneNumber} not found.`);
            return;
        }
        let firstPlock = scene.isEmpty;
        scene.setChannelEnabledLock(deviceModel, deviceIndex, channel, channelEnabled);
        if (firstPlock)
            this._sceneDeviceModel.sceneHasBeenUpdated(sceneNumber);
    }
    storeSceneInstrumentLock(sceneNumber, deviceModel, deviceIndex, channel, instrumentNumber) {
        let scene = this._sceneDeviceModel.getScene(sceneNumber);
        if (scene === undefined) {
            shouldLog(LogLevel.Warning) && console.warn(`Unable to store scene instrument lock. Scene ${sceneNumber} not found.`);
            return;
        }
        let firstPlock = scene.isEmpty;
        scene.setInstrumentLock(deviceModel, deviceIndex, channel, instrumentNumber);
        if (firstPlock)
            this._sceneDeviceModel.sceneHasBeenUpdated(sceneNumber);
    }
    handleSceneStateChanged(device, channel, stateNumber, stateValue) {
        // This method will be called when a scene button is pressed or a scene is triggered or untriggered (stateValue 0 for not triggered, > 1 for triggered)
        shouldLog(LogLevel.Info) && console.log(`SceneDeviceController.handleSceneStateChanged() - channel ${channel}, stateNumber ${stateNumber}, stateValue ${stateValue}`);
        // There's a lot of room for optimization here:
        // o cache the stateXXX stuff, can be set when the key is first pressed, then we need no state lookups!
        let isNoteOn = stateValue > 0;
        let isNoteOff = !isNoteOn;
        let scene = this._blankScene;
        let anotherSceneButtonAlsoPressed = this._mostRecentSceneNumber >= 0 && device.getState(SCENE_CHANNEL, this._mostRecentSceneNumber) > 0;
        let commandIsScene = stateNumber >= 0 && stateNumber < MAX_NUM_SCENES || stateNumber === DEFAULT_SCENE_NUMBER || stateNumber === TEMP_SCENE_NUMBER;
        if (commandIsScene) {
            if (stateNumber === DEFAULT_SCENE_NUMBER)
                this._mostRecentSceneNumber = DEFAULT_SCENE_NUMBER;
            else if (stateNumber === TEMP_SCENE_NUMBER)
                this._mostRecentSceneNumber = TEMP_SCENE_NUMBER;
            else
                this._mostRecentSceneNumber = stateNumber;
        }
        let stateIsScene = this._mostRecentSceneNumber >= 0;
        if (this._mostRecentSceneNumber >= 0) {
            let getScene = this._sceneDeviceModel.getScene(this._mostRecentSceneNumber);
            if (getScene === undefined) {
                shouldLog(LogLevel.Warning) && console.warn(`Scene ${this._mostRecentSceneNumber} not found.`);
                return;
            }
            scene = getScene;
        }
        if (commandIsScene && isNoteOff)
            this._mostRecentSceneNumber = -1;
        let commandCopy = stateNumber === SceneCommands.COPY;
        let commandPaste = stateNumber === SceneCommands.PASTE;
        let commandClear = stateNumber === SceneCommands.CLEAR;
        let commandSave = stateNumber === SceneCommands.SAVE;
        let commandEdit = stateNumber === SceneCommands.EDIT;
        let commandSlotA = stateNumber === SceneCommands.SLOT_A;
        let commandSlotB = stateNumber === SceneCommands.SLOT_B;
        let commandAny = commandCopy || commandPaste || commandClear || commandSave || commandEdit || commandSlotA || commandSlotB;
        let doubleClickSlotA = commandSlotA && isNoteOn && this._sceneDeviceModel.getStateTimeStamp(SCENE_CHANNEL, SceneCommands.SLOT_A)[1] < DOUBLE_CLICK_MILLISECONDS;
        let doubleClickSlotB = commandSlotB && isNoteOn && this._sceneDeviceModel.getStateTimeStamp(SCENE_CHANNEL, SceneCommands.SLOT_B)[1] < DOUBLE_CLICK_MILLISECONDS;
        let stateLatchSlotA = this._sceneDeviceModel.getStateLatch(SCENE_CHANNEL, SceneCommands.SLOT_A);
        let stateLatchSlotB = this._sceneDeviceModel.getStateLatch(SCENE_CHANNEL, SceneCommands.SLOT_B);
        if (doubleClickSlotA || doubleClickSlotB) {
            shouldLog(LogLevel.Info) && console.log(`doubleClickSlotA: ${doubleClickSlotA}, doubleClickSlotB: ${doubleClickSlotB}`);
        }
        let stateCopy = this._sceneDeviceModel.getState(SCENE_CHANNEL, SceneCommands.COPY) > 0;
        let statePaste = this._sceneDeviceModel.getState(SCENE_CHANNEL, SceneCommands.PASTE) > 0;
        let stateClear = this._sceneDeviceModel.getState(SCENE_CHANNEL, SceneCommands.CLEAR) > 0;
        let stateSave = this._sceneDeviceModel.getState(SCENE_CHANNEL, SceneCommands.SAVE) > 0;
        let stateEdit = this._sceneDeviceModel.getState(SCENE_CHANNEL, SceneCommands.EDIT) > 0;
        let stateSlotA = this._sceneDeviceModel.getState(SCENE_CHANNEL, SceneCommands.SLOT_A) > 0;
        let stateSlotB = this._sceneDeviceModel.getState(SCENE_CHANNEL, SceneCommands.SLOT_B) > 0;
        let stateCommandOrSlot = stateCopy || statePaste || stateClear || stateSave || stateEdit || stateSlotA || stateSlotB;
        if (isNoteOn) {
            this._editPressedAlone = false;
            if (doubleClickSlotA) {
                stateLatchSlotA = stateLatchSlotA > 0 ? 0 : stateValue;
                this._sceneDeviceModel.setStateLatch(SCENE_CHANNEL, SceneCommands.SLOT_A, stateLatchSlotA);
                if (stateLatchSlotB > 0) {
                    stateLatchSlotB = 0;
                    this._sceneDeviceModel.setStateLatch(SCENE_CHANNEL, SceneCommands.SLOT_B, stateLatchSlotB);
                }
            }
            else if (doubleClickSlotB) {
                stateLatchSlotB = stateLatchSlotB > 0 ? 0 : stateValue;
                this._sceneDeviceModel.setStateLatch(SCENE_CHANNEL, SceneCommands.SLOT_B, stateLatchSlotB);
                if (stateLatchSlotA > 0) {
                    stateLatchSlotA = 0;
                    this._sceneDeviceModel.setStateLatch(SCENE_CHANNEL, SceneCommands.SLOT_A, stateLatchSlotA);
                }
            }
            else if (stateLatchSlotA > 0 && (commandSlotA || commandSlotB)) {
                stateLatchSlotA = 0;
                this._sceneDeviceModel.setStateLatch(SCENE_CHANNEL, SceneCommands.SLOT_A, stateLatchSlotA);
            }
            else if (stateLatchSlotB > 0 && (commandSlotA || commandSlotB)) {
                stateLatchSlotB = 0;
                this._sceneDeviceModel.setStateLatch(SCENE_CHANNEL, SceneCommands.SLOT_B, stateLatchSlotB);
            }
            if (commandIsScene && stateClear || commandClear && stateIsScene) {
                scene.clear();
                this._sceneDeviceModel.sceneHasBeenUpdated(this._mostRecentSceneNumber);
            }
            else if (commandIsScene && stateCopy || commandCopy && stateIsScene) {
                this._copiedScene = scene;
            }
            else if (commandIsScene && statePaste || commandPaste && stateIsScene) {
                scene.setFrom(this._copiedScene);
                this._sceneDeviceModel.sceneHasBeenUpdated(this._mostRecentSceneNumber);
                this.morph(this._currentMorphFactor, true);
            }
            else if (commandIsScene && stateSave || commandSave && stateIsScene) {
                this.storeScene(this._mostRecentSceneNumber);
            }
            else if (commandIsScene && stateEdit || commandEdit && stateIsScene) {
                if (this._sceneDeviceModel.isRecordingScene) {
                    if (this._sceneDeviceModel.currentSceneNumber !== this._mostRecentSceneNumber) {
                        // Maybe we should copy the scene from currentSceneNumber to the (new) mostRecentSceneNumber (if empty), see notes.
                        // Stop recording previous scene
                        this._sceneDeviceModel.setRecordingScene(false, false);
                        // Start recording new scene
                        this.sendSceneNumberToDevice(this._mostRecentSceneNumber, false, true);
                        this._sceneDeviceModel.setRecordingScene(true, false, this._mostRecentSceneNumber);
                    }
                    else if (!this._sceneDeviceModel.isRecordingSceneStart && scene.hasChannelEnabledOrInstrumentLock) {
                        // Start recording scene start for the current scene
                        this.sendSceneNumberToDevice(this._mostRecentSceneNumber, true, true);
                        this._sceneDeviceModel.setRecordingScene(true, true);
                    }
                    else {
                        // Stop recording scene
                        this._sceneDeviceModel.setRecordingScene(false, false);
                        this.restoreStateAfterRecording(this._sceneDeviceModel.currentSceneNumber);
                    }
                }
                else {
                    // Start recording new scene
                    this.sendSceneNumberToDevice(this._mostRecentSceneNumber, false, true);
                    this._sceneDeviceModel.setRecordingScene(true, false, this._mostRecentSceneNumber);
                }
            }
            else if (commandEdit && !stateIsScene && this._sceneDeviceModel.isRecordingScene) {
                this._editPressedAlone = true; // recording will be stopped on note off, unless some other button is pressed before that
            }
            else if (commandIsScene && stateSlotA || commandSlotA && stateIsScene || commandIsScene && stateLatchSlotA > 0) {
                if (this._sceneDeviceModel.sceneSlotASceneNumber !== this._mostRecentSceneNumber) {
                    this._sceneDeviceModel.sceneSlotASceneNumber = this._mostRecentSceneNumber;
                    this.morph(this._currentMorphFactor, true, true);
                }
            }
            else if (commandIsScene && stateSlotB || commandSlotB && stateIsScene || commandIsScene && stateLatchSlotB > 0) {
                if (this._sceneDeviceModel.sceneSlotBSceneNumber !== this._mostRecentSceneNumber) {
                    this._sceneDeviceModel.sceneSlotBSceneNumber = this._mostRecentSceneNumber;
                    this.morph(this._currentMorphFactor, true, true);
                }
            }
            else if (commandSlotA && stateClear || commandClear && stateSlotA) {
                this._sceneDeviceModel.sceneSlotAMuted = !this._sceneDeviceModel.sceneSlotAMuted;
            }
            else if (commandSlotB && stateClear || commandClear && stateSlotB) {
                this._sceneDeviceModel.sceneSlotBMuted = !this._sceneDeviceModel.sceneSlotBMuted;
            }
            else if (commandIsScene) {
                // The user pressed a scene button while no other button was pressed -> Punch-edit scene
                // 
                // Assume the user wants to plock a parameter for the selcted scene
                // This will send all scene plocks to the Zoom, which will change the audio
                // Since the editing will be done on the hardware device, it's not possible to edit 
                // plocks without the effect being heard. If editing was done on a separate midi
                // controller, we could have refrained from sending the values to the device,
                // but I'm not sure the user experience would be very good.
                if (this._sceneDeviceModel.isRecordingScene) { // Scene editing was latched, stop recording/editing
                    this._sceneDeviceModel.setRecordingScene(false, false);
                    this.restoreStateAfterRecording(this._sceneDeviceModel.currentSceneNumber);
                }
                shouldLog(LogLevel.Info) && console.log(`Start editing scene ${stateNumber}`);
                this.sendSceneNumberToDevice(stateNumber, false, true);
                // Temporarily enable the rec state
                this._sceneDeviceModel.currentSceneNumber = stateNumber;
                if (this._numSceneButtonsPressed === 0) {
                    this._wasRecordingScene = this._sceneDeviceModel.isRecordingScene;
                    if (this._sceneDeviceModel.isRecordingScene)
                        this._sceneDeviceModel.setRecordingScene(false, false);
                    this._sceneDeviceModel.setRecordingScene(true, false, stateNumber);
                }
                this._numSceneButtonsPressed++;
            }
        }
        else { // Note Off
            // If we temporarily enabled rec state when scene button was pressed, disable it here
            if (commandIsScene && !stateCommandOrSlot) {
                if (this._numSceneButtonsPressed > 0) {
                    this._numSceneButtonsPressed--;
                    if (this._numSceneButtonsPressed === 0 && !this._wasRecordingScene)
                        this._sceneDeviceModel.setRecordingScene(false, false);
                }
            }
            let wasPunchInEdit = commandIsScene && !stateCommandOrSlot && !scene.isEmpty && !stateLatchSlotA && !stateLatchSlotB;
            let wasLatchEdit = commandEdit && !stateIsScene && this._sceneDeviceModel.isRecordingScene && this._editPressedAlone;
            let unLatchSlotA = commandSlotA && !stateIsScene && !this._sceneDeviceModel.isRecordingScene && stateLatchSlotA > 0;
            let unLatchSlotB = commandSlotB && !stateIsScene && !this._sceneDeviceModel.isRecordingScene && stateLatchSlotB > 0;
            if (wasLatchEdit) {
                this._sceneDeviceModel.setRecordingScene(false, false);
            }
            // if (unLatchSlotA || unLatchSlotB) {
            //   // Unlatch both slots if user pressed one of the slot buttons
            //   shouldLog(LogLevel.Info) && console.log(`Unlatching slot A and B`);
            //   if (stateLatchSlotA > 0) {
            //     stateLatchSlotA = 0;
            //     this._sceneDeviceModel.setStateLatch(SCENE_CHANNEL, SceneCommands.SLOT_A, stateLatchSlotA);
            //   }
            //   if (stateLatchSlotB > 0) {
            //     stateLatchSlotB = 0;
            //     this._sceneDeviceModel.setStateLatch(SCENE_CHANNEL, SceneCommands.SLOT_B, stateLatchSlotB);
            //   }
            // }
            if ((wasPunchInEdit && !anotherSceneButtonAlsoPressed) || wasLatchEdit || unLatchSlotA || unLatchSlotB) {
                // We were probably editing plocks (or just pushing only the scene button or only the edit button)
                this.restoreStateAfterRecording(this._sceneDeviceModel.currentSceneNumber);
            }
        }
    }
    restoreStateAfterRecording(recordedSceneNumber) {
        if (recordedSceneNumber === this._sceneDeviceModel.sceneSlotASceneNumber || recordedSceneNumber === this._sceneDeviceModel.sceneSlotBSceneNumber) {
            // We were editing plocks for a scene assigned to slot A or B
            // We'll morph, and then the currentPatchScene will be identical to the morphed values
            this.morph(this._currentMorphFactor);
        }
        else {
            // We were editing the plocks of a scene not assigned to slot A or B
            // Revert plocks (making the scene button instantaneous)
            this.sendSceneToDevice(this._currentPatchScene, false, this._currentEditFlagsScene);
        }
    }
    handleStoreSceneButtonClicked(view, sceneNumber) {
        this.storeScene(sceneNumber);
    }
    storeScene(sceneNumber) {
        let scene = this._sceneDeviceModel.getScene(sceneNumber);
        if (scene === undefined) {
            shouldLog(LogLevel.Warning) && console.warn(`Unable to store scene. Scene ${sceneNumber} not found.`);
            return;
        }
        this.storeSceneSnapshopOfRack(scene);
        this._sceneDeviceModel.sceneHasBeenUpdated(sceneNumber);
    }
    handleRackDeviceParameterChanged(device, channel, parameterNumber, parameterValue) {
        if (this._isSendingScene)
            return; // see sendSceneToDevice() and morph()
        let deviceIndex = this._rackDeviceModel.getDeviceIndex(device);
        if (this._sceneDeviceModel.isRecordingScene) {
            // store plock
            let startString = this._sceneDeviceModel.isRecordingSceneStart ? "start" : "";
            shouldLog(LogLevel.Info) && console.log(`Storing plock to scene ${this._sceneDeviceModel.currentSceneNumber} - channel ${channel}, parameterNumber ${parameterNumber}, parameterValue${startString} ${parameterValue}`);
            if (this._sceneDeviceModel.isRecordingSceneStart)
                this.storeSceneParameterLock(this._sceneDeviceModel.currentSceneNumber, device, deviceIndex, channel, parameterNumber, IGNORE_PARAMETER_VALUE, parameterValue);
            else
                this.storeSceneParameterLock(this._sceneDeviceModel.currentSceneNumber, device, deviceIndex, channel, parameterNumber, parameterValue);
            this._currentEditFlagsScene.setParameterLock(device, deviceIndex, channel, parameterNumber, IGNORE_PARAMETER_VALUE);
            // The code below is for devices where we have no way of getting the patch data.
            // If we don't have a plock for this parameter, we store in in the currentPatchScene.
            // If we could get patch instead, we wouldn't need to do that, but that's for later and would have to be specific for each synth/device.
            // Note that this doesn't work very well for synths/devices with knobs when initial knob pos doesn't match the underlying parameter.
            let plock = this._currentPatchScene.getParameterLock(deviceIndex, channel, parameterNumber);
            if (plock === undefined) {
                shouldLog(LogLevel.Warning) && console.warn(`Storing plock to currentPatchScene - channel ${channel}, parameterNumber ${parameterNumber}, parameterValue ${parameterValue}. This shouldn't happen for Zoom devices. Investigate.`);
                this._currentPatchScene.setParameterLock(device, deviceIndex, channel, parameterNumber, parameterValue);
            }
        }
        else {
            // not recording scene
            this._currentPatchScene.setParameterLock(device, deviceIndex, channel, parameterNumber, parameterValue);
            // store plock to default scene if we're not morphing (to something else than the default scene)
            if (!this._isMorphing &&
                ((this._sceneDeviceModel.sceneSlotASceneNumber === DEFAULT_SCENE_NUMBER && (this._currentMorphFactor === 0 || this._currentMorphFactor === NOT_MORPHED_YET)) ||
                    (this._sceneDeviceModel.sceneSlotBSceneNumber === DEFAULT_SCENE_NUMBER && this._currentMorphFactor === 1) ||
                    (this._sceneDeviceModel.sceneSlotASceneNumber === DEFAULT_SCENE_NUMBER && this._sceneDeviceModel.sceneSlotBSceneNumber === DEFAULT_SCENE_NUMBER) ||
                    !this.slotScenesHavePlock(deviceIndex, channel, parameterNumber))) {
                let defaultScene = this._sceneDeviceModel.getScene(DEFAULT_SCENE_NUMBER);
                if (defaultScene === undefined) {
                    shouldLog(LogLevel.Warning) && console.warn(`Unable to store plock to default scene. Default scene not found.`);
                    return;
                }
                defaultScene.setParameterLock(device, deviceIndex, channel, parameterNumber, parameterValue);
                shouldLog(LogLevel.Info) && console.log(`Storing plock to default scene - channel ${channel}, parameterNumber ${parameterNumber}, parameterValue ${parameterValue}`);
            }
        }
    }
    /**
     * Check if the slot scenes have a plock for the given parameter
     * @param deviceIndex Device index
     * @param channel Channel number
     * @param parameterNumber Parameter number
     * @returns true if the slot scenes have a plock for the given parameter, false otherwise
     */
    slotScenesHavePlock(deviceIndex, channel, parameterNumber) {
        let plockAddress = Scene.getPlockAddress(ParameterLock.PARAMETER_MODE, deviceIndex, channel, parameterNumber);
        let sceneA = this._sceneDeviceModel.getScene(this._sceneDeviceModel.sceneSlotASceneNumber);
        let sceneB = this._sceneDeviceModel.getScene(this._sceneDeviceModel.sceneSlotBSceneNumber);
        return sceneA?.parameterLocks.has(plockAddress) || sceneB?.parameterLocks.has(plockAddress) || false;
    }
    handleRackDeviceChannelEnabledChanged(device, channel, enabled) {
        if (this._isSendingScene)
            return; // see sendSceneToDevice() and morph()
        let deviceIndex = this._rackDeviceModel.getDeviceIndex(device);
        if (this._sceneDeviceModel.isRecordingScene) {
            // store plock
            shouldLog(LogLevel.Info) && console.log(`Storing plock to scene ${this._sceneDeviceModel.currentSceneNumber} - channel ${channel}, enabled ${enabled}`);
            this.storeSceneChannelEnabledLock(this._sceneDeviceModel.currentSceneNumber, device, deviceIndex, channel, enabled);
            this._currentEditFlagsScene.setChannelEnabledLock(device, deviceIndex, channel, IGNORE_CHANNEL_ENABLED);
        }
        else {
            // not recording scene
            this._currentPatchScene.setChannelEnabledLock(device, deviceIndex, channel, enabled);
        }
    }
    handleRackDeviceChannelInstrumentNumberChanged(device, channel, instrumentNumber) {
        if (this._isSendingScene)
            return; // see sendSceneToDevice() and morph()
        let deviceIndex = this._rackDeviceModel.getDeviceIndex(device);
        if (this._sceneDeviceModel.isRecordingScene) {
            // store plock
            shouldLog(LogLevel.Info) && console.log(`Storing plock to scene ${this._sceneDeviceModel.currentSceneNumber} - channel ${channel}, instrumentNumber ${instrumentNumber}`);
            this.storeSceneInstrumentLock(this._sceneDeviceModel.currentSceneNumber, device, deviceIndex, channel, instrumentNumber);
            this._currentEditFlagsScene.setInstrumentLock(device, deviceIndex, channel, IGNORE_INSTRUMENT);
        }
        else {
            // not recording scene
            this._currentPatchScene.setInstrumentLock(device, deviceIndex, channel, instrumentNumber);
        }
    }
    handleRackDeviceChannelInfoRemoved(device, channel) {
        // FIXME: Should just update the individual scenes to accomodate the removed channel, instead of clearing all scenes
        shouldLog(LogLevel.Info) && console.log(`Channel info removed for device ${device.name} channel ${channel}. Clearing scenes.`);
        this._sceneDeviceModel.clearScenes();
    }
    handleSceneParameterChanged(device, channel, parameterNumber, parameterValue) {
        if (channel === SCENE_CHANNEL && parameterNumber === SceneParameters.CROSSFADER) {
            this._currentMorphFactor = parameterValue / 127;
            this.morph(this._currentMorphFactor);
        }
    }
    /**
     * @param morphFactor 0 = slot A, 1 = slot B
     * @param updateCurrentEditScene if true, the currentEditScene will be updated
     *
     *
     * Channel Enabled plocks (slot enabled on Zoom effect pedals)
     *
     * If morphFactor moving left to right, from slot A to slot B.
     *   Assume slot B is enabled, slot A is disabled. We'll morph from slotB.plockStart to slotB.plock.
     *   We'll also make sure we do all the morphs before doing the actual channel enabled switch.
     *
     *   The switch is done based on the currentpatch enabled state and destination plock enabled state
     *
     *
     *
     */
    morph(morphFactor, updateCurrentEditScene = false, initFromDefaults = false) {
        this._isMorphing = true; // don't record defaultScene while morphing
        const previousMorphFactor = this._previousMorphFactor === NOT_MORPHED_YET ? 0 : this._previousMorphFactor;
        this._previousMorphFactor = morphFactor;
        morphFactor = morphFactor === NOT_MORPHED_YET ? 0 : morphFactor;
        // Lots of room for optimization here!
        let morphs = this._morphs.morphs;
        morphs.clear();
        let sceneA = this._sceneDeviceModel.getScene(this._sceneDeviceModel.sceneSlotASceneNumber);
        let sceneB = this._sceneDeviceModel.getScene(this._sceneDeviceModel.sceneSlotBSceneNumber);
        let defaultScene = this._sceneDeviceModel.getScene(DEFAULT_SCENE_NUMBER);
        if (defaultScene === undefined) {
            shouldLog(LogLevel.Warning) && console.warn(`Unable to get plock from default scene. Default scene not found.`);
        }
        //    if (!this._sceneDeviceModel.sceneSlotAMuted && !this._sceneDeviceModel.sceneSlotAMuted && sceneA !== undefined && sceneB !== undefined) {
        if (sceneA === undefined || sceneB === undefined) {
            shouldLog(LogLevel.Error) && console.error(`sceneA or sceneB is undefined, not morphing. This should never happen. Investigate.`);
            return;
        }
        if (initFromDefaults && defaultScene !== undefined) {
            let addresses = Array.from(this._currentEditFlagsScene.parameterLocks.keys());
            for (let address of addresses) {
                let plock = defaultScene.parameterLocks.get(address);
                if (plock === undefined) {
                    shouldLog(LogLevel.Warning) && console.warn(`Unable to find plock ${address} from _currentEditFlagsScene in defaultScene.`);
                    continue;
                }
                shouldLog(LogLevel.Info) && console.log(`Initializing morph from defaults. Address: ${address}, parameterNumber: ${plock.parameterNumber}, value: ${plock.parameterValue}`);
                let morph = morphs.get(address);
                if (morph === undefined) {
                    morph = { A: plock, B: plock };
                    morphs.set(address, morph);
                    // shouldLog(LogLevel.Info) && console.log(`Morph ${address} - A: ${plock.parameterValue}`);
                }
                else {
                    morph.A = plock;
                    morph.B = plock;
                    // shouldLog(LogLevel.Info) && console.log(`Morph ${address} - A: ${plock.parameterValue}. Warn: Morph already exists`);
                }
            }
        }
        for (let [address, plock] of sceneA.parameterLocks) {
            let morph = morphs.get(address);
            if (morph === undefined) {
                let defaultScenePlock;
                if (defaultScene !== undefined) {
                    let deviceIndex = this._rackDeviceModel.getDeviceIndex(plock.deviceModel);
                    defaultScenePlock = defaultScene.getPLock(plock.mode, deviceIndex, plock.channel, plock.parameterNumber);
                    if (defaultScenePlock === undefined) {
                        shouldLog(LogLevel.Warning) && console.warn(`Unable to get default plock. Plock ${address} not found in default scene. ` +
                            `mode: ${plock.mode}, deviceIndex: ${deviceIndex}, channel: ${plock.channel}, parameterNumber: ${plock.parameterNumber}, ` +
                            `channelEnabled: ${plock.channelEnabled}, instrumentNumber: ${plock.instrumentNumber}`);
                    }
                }
                morph = { A: plock, B: defaultScenePlock !== undefined ? defaultScenePlock : plock };
                morphs.set(address, morph);
                // shouldLog(LogLevel.Info) && console.log(`Morph ${address} - A: ${plock.parameterValue}`);
            }
            else {
                morph.A = plock;
                // shouldLog(LogLevel.Info) && console.log(`Morph ${address} - A: ${plock.parameterValue}. Warn: Morph already exists`);
            }
        }
        for (let [address, plock] of sceneB.parameterLocks) {
            let morph = morphs.get(address);
            if (morph === undefined) {
                let defaultScenePlock;
                if (defaultScene !== undefined) {
                    let deviceIndex = this._rackDeviceModel.getDeviceIndex(plock.deviceModel);
                    defaultScenePlock = defaultScene.getParameterLock(deviceIndex, plock.channel, plock.parameterNumber);
                    if (defaultScenePlock === undefined) {
                        shouldLog(LogLevel.Warning) && console.warn(`Unable to get default plock. Plock ${address} not found in default scene.`);
                    }
                }
                morph = { A: defaultScenePlock !== undefined ? defaultScenePlock : plock, B: plock };
                morphs.set(address, morph);
                // shouldLog(LogLevel.Info) && console.log(`Morph ${address} - B: ${plock.parameterValue}`);
            }
            else {
                morph.B = plock;
                //shouldLog(LogLevel.Info) && console.log(`Morph ${address} - B: ${plock.parameterValue}. Info: Morph already exists`);
            }
        }
        if (updateCurrentEditScene)
            this._currentEditFlagsScene.clear();
        let channelEnabledPlocks = [];
        // Send the morphed plocks to the device
        let parameterValue;
        for (let [address, morph] of morphs) {
            let plockA = morph.A;
            let plockAParameterValue = plockA.parameterValue;
            let plockB = morph.B;
            let plockBParameterValue = plockB.parameterValue;
            let deviceIndex = this._rackDeviceModel.getDeviceIndex(plockA.deviceModel);
            let sceneAChannelEnabledLock = sceneA.getChannelEnabledLock(deviceIndex, plockA.channel); // probably inefficient, but we'll do it like this for now
            let sceneBChannelEnabledLock = sceneB.getChannelEnabledLock(deviceIndex, plockA.channel);
            let currentChannelEnabledSetting = plockA.deviceModel.getChannelEnabled(plockA.channel);
            let channelEnabledMorph = false;
            if (sceneAChannelEnabledLock !== undefined && sceneBChannelEnabledLock !== undefined) {
                if (sceneAChannelEnabledLock?.channelEnabled && !sceneBChannelEnabledLock?.channelEnabled) {
                    channelEnabledMorph = true;
                    plockBParameterValue = plockA.parameterValueStart;
                }
                else if (!sceneAChannelEnabledLock?.channelEnabled && sceneBChannelEnabledLock?.channelEnabled) {
                    channelEnabledMorph = true;
                    plockAParameterValue = plockB.parameterValueStart;
                }
            }
            if (plockA.mode === ParameterLock.PARAMETER_MODE) {
                let currentPatchPlock = this._currentPatchScene.getParameterLock(deviceIndex, plockA.channel, plockA.parameterNumber);
                if (currentPatchPlock === undefined) {
                    shouldLog(LogLevel.Warning) && console.warn(`Unable to morph. Plock ${address} not found in currentPatchScene.`);
                    continue;
                }
                if (channelEnabledMorph) {
                    parameterValue = plockAParameterValue + (plockBParameterValue - plockAParameterValue) * morphFactor;
                }
                else if (morphFactor > previousMorphFactor) { // We're moving towards slot B
                    let scaledMorphFactor = (morphFactor - previousMorphFactor) / (1 - previousMorphFactor);
                    parameterValue = currentPatchPlock.parameterValue + (plockBParameterValue - currentPatchPlock.parameterValue) * scaledMorphFactor;
                }
                else if (morphFactor < previousMorphFactor) { // We're moving towards slot A
                    let scaledMorphFactor = (previousMorphFactor - morphFactor) / (previousMorphFactor - 0);
                    parameterValue = currentPatchPlock.parameterValue + (plockAParameterValue - currentPatchPlock.parameterValue) * scaledMorphFactor;
                }
                else {
                    // we haven't moved
                    // However, scene in slot a or b might have changed (been edited), 
                    // or we might not have morphed yet (morphFactor and previousMorphFactor was set to 0 at start of morph() method),
                    // so we should compute again.
                    // parameterValue = currentPatchPlock.parameterValue;
                    parameterValue = plockAParameterValue + (plockBParameterValue - plockAParameterValue) * morphFactor;
                }
                let parameterChanged = plockA.deviceModel.setParameter(plockA.channel, plockA.parameterNumber, parameterValue);
                if (parameterChanged)
                    shouldLog(LogLevel.Info) && console.log(`Morph ${plockA.deviceModel.name} ${plockA.channel} ${plockA.parameterNumber} [${morphFactor.toFixed(3)}] -> ${parameterValue.toFixed(1)}`);
                if (updateCurrentEditScene)
                    this._currentEditFlagsScene.setParameterLock(plockA.deviceModel, this._rackDeviceModel.getDeviceIndex(plockA.deviceModel), plockA.channel, plockA.parameterNumber, IGNORE_PARAMETER_VALUE);
            }
            else if (plockA.mode === ParameterLock.CHANNEL_ENABLED_MODE) {
                channelEnabledPlocks.push({ plockA: plockA, plockB: plockB });
            }
            else if (plockA.mode === ParameterLock.INSTRUMENT_MODE) {
                // Need to know prev morphFactor, so we can switch instrument when moving from 0 or 1
                plockA.deviceModel.setChannelInstrumentNumber(plockA.channel, plockA.instrumentNumber);
                this._currentPatchScene.setInstrumentLock(plockA.deviceModel, deviceIndex, plockA.channel, plockA.instrumentNumber);
                if (updateCurrentEditScene)
                    this._currentEditFlagsScene.setInstrumentLock(plockA.deviceModel, deviceIndex, plockA.channel, IGNORE_INSTRUMENT);
            }
        }
        // Handle Channel Enabled (after all morphed parameter locks has been sent)
        for (let plockPair of channelEnabledPlocks) {
            let plockA = plockPair.plockA;
            let plockB = plockPair.plockB;
            let deviceIndex = this._rackDeviceModel.getDeviceIndex(plockA.deviceModel);
            let channelEnabled = undefined;
            if (plockA.channelEnabled && !plockB.channelEnabled)
                channelEnabled = morphFactor < 1; // off at 1, on at < 1
            else if (!plockA.channelEnabled && plockB.channelEnabled)
                channelEnabled = morphFactor > 0; // off at 0, on at > 0
            if (channelEnabled !== undefined) {
                plockA.deviceModel.setChannelEnabled(plockA.channel, channelEnabled);
                this._currentPatchScene.setChannelEnabledLock(plockA.deviceModel, deviceIndex, plockA.channel, plockA.channelEnabled);
                if (updateCurrentEditScene)
                    this._currentEditFlagsScene.setChannelEnabledLock(plockA.deviceModel, deviceIndex, plockA.channel, IGNORE_CHANNEL_ENABLED);
            }
        }
        this._isMorphing = false; // OK to record defaultScene from now on
    }
    handleRackDeviceListChanged(rackDevice, deviceModel, changeType) {
        shouldLog(LogLevel.Info) && console.log(`SceneDeviceController.handleRackDeviceListChanged() - changeType ${changeType}`);
        if (deviceModel instanceof SceneDeviceModel)
            return;
        if (changeType === DeviceListChangeType.ADD) {
            // Listeners also added in setupDeviceListeners(), keep these in sync
            deviceModel.addParameterChangedListener(this.handleRackDeviceParameterChanged.bind(this));
            deviceModel.addChannelEnabledListener(this.handleRackDeviceChannelEnabledChanged.bind(this));
            deviceModel.addChannelInstrumentNumberChangedListener(this.handleRackDeviceChannelInstrumentNumberChanged.bind(this));
            deviceModel.addChannelInfoRemovedListener(this.handleRackDeviceChannelInfoRemoved.bind(this));
        }
        // FIXME: If we remove a device, we should remove the listener for that device as well
        this.storeSceneSnapshopOfRack(this._currentPatchScene);
    }
    sendSceneNumberToDevice(sceneNumber, sendStartValues = false, updateCurrentEditScene = false) {
        let scene = this._sceneDeviceModel.getScene(sceneNumber);
        if (scene === undefined) {
            shouldLog(LogLevel.Warning) && console.warn(`Unable to send scene. Scene ${sceneNumber} not found.`);
            return;
        }
        this.sendSceneToDevice(scene, sendStartValues, undefined, updateCurrentEditScene);
    }
    sendSceneToDevice(scene, sendStartValues = false, filterScene = undefined, updateCurrentEditScene = false) {
        let rememberRecState = this._sceneDeviceModel.isRecordingScene;
        let rememberRecSceneStart = this._sceneDeviceModel.isRecordingSceneStart;
        let rememberCurrentSceneNumber = this._sceneDeviceModel.currentSceneNumber;
        if (rememberRecState)
            this._sceneDeviceModel.setRecordingScene(false, false); // don't record plocks while sending scene
        this._isSendingScene = true; // don't record currentPatchScene while sending scene
        let addresses = Array.from(filterScene === undefined ? scene.parameterLocks.keys() : filterScene.parameterLocks.keys());
        // Remember which plocks we've changed, so we can revert them later
        if (updateCurrentEditScene)
            this._currentEditFlagsScene.clear();
        let plocks = scene.parameterLocks;
        for (let address of addresses) {
            // shouldLog(LogLevel.Info) && console.log(`Playing back ploc in scene ${this._sceneDeviceModel.currentSceneNumber} - channel ${plock.channel}, parameterNumber ${plock.parameterNumber}, parameterValue ${plock.parameterValue}`);
            let plock = scene.parameterLocks.get(address);
            if (plock === undefined) {
                shouldLog(LogLevel.Warning) && console.warn(`Unable to send scene. Plock ${address} not found in scene ${scene.name}.`);
                continue;
            }
            let parameterValue = sendStartValues ? plock.parameterValueStart : plock.parameterValue;
            if (plock.mode === ParameterLock.PARAMETER_MODE) {
                plock.deviceModel.setParameter(plock.channel, plock.parameterNumber, parameterValue);
                if (updateCurrentEditScene) // Remember which plocks we've changed, so we can revert them later
                    this._currentEditFlagsScene.setParameterLock(plock.deviceModel, this._rackDeviceModel.getDeviceIndex(plock.deviceModel), plock.channel, plock.parameterNumber, IGNORE_PARAMETER_VALUE);
            }
            else if (plock.mode === ParameterLock.CHANNEL_ENABLED_MODE) {
                plock.deviceModel.setChannelEnabled(plock.channel, plock.channelEnabled);
                if (updateCurrentEditScene) // Remember which plocks we've changed, so we can revert them later
                    this._currentEditFlagsScene.setChannelEnabledLock(plock.deviceModel, this._rackDeviceModel.getDeviceIndex(plock.deviceModel), plock.channel, IGNORE_CHANNEL_ENABLED);
            }
            else if (plock.mode === ParameterLock.INSTRUMENT_MODE) {
                plock.deviceModel.setChannelInstrumentNumber(plock.channel, plock.instrumentNumber);
                if (updateCurrentEditScene) // Remember which plocks we've changed, so we can revert them later
                    this._currentEditFlagsScene.setInstrumentLock(plock.deviceModel, this._rackDeviceModel.getDeviceIndex(plock.deviceModel), plock.channel, IGNORE_INSTRUMENT);
            }
        }
        if (rememberRecState)
            this._sceneDeviceModel.setRecordingScene(rememberRecState, rememberRecSceneStart, rememberCurrentSceneNumber);
        this._isSendingScene = false; // OK to record currentPatchScene from now on
    }
    updateSceneModelsFromParameterLockAddresses() {
        for (let sceneNumber = 0; sceneNumber < MAX_NUM_SCENES; sceneNumber++) {
            this.updateSceneModelFromParameterLockAddresses(sceneNumber);
        }
        this.updateSceneModelFromParameterLockAddresses(DEFAULT_SCENE_NUMBER);
        this.updateSceneModelFromParameterLockAddresses(TEMP_SCENE_NUMBER);
    }
    updateSceneModelFromParameterLockAddresses(sceneNumber) {
        let scene = this._sceneDeviceModel.getScene(sceneNumber);
        if (scene === undefined) {
            shouldLog(LogLevel.Warning) && console.warn(`Unable to update scene model. Scene ${sceneNumber} not found.`);
            return;
        }
        // Update deviceModel in parameter locks based on the plock address
        for (let [address, plock] of scene.parameterLocks) {
            let [mode, deviceIndex, channel, parameterNumber] = Scene.decodePlockAddress(address);
            let deviceModel = this._rackDeviceModel.deviceModels[deviceIndex];
            if (deviceModel !== undefined) {
                plock.deviceModel = deviceModel;
            }
            else {
                shouldLog(LogLevel.Warning) && console.warn(`Unable to update scene model. Device model ${deviceIndex} not found.`);
            }
        }
    }
    storeDefaultScene() {
        this.storeScene(DEFAULT_SCENE_NUMBER);
    }
    storeCurrentPatchScene() {
        this.storeSceneSnapshopOfRack(this._currentPatchScene);
    }
}

