// @ts-nocheck
import { DeviceModel } from "./DeviceModel.js";
import { DEFAULT_SCENE_NUMBER, Scene, SceneSlot, TEMP_SCENE_NUMBER } from "./Scene.js";
import { LogLevel, shouldLog } from "./Logger.js";
export class SceneDeviceModel extends DeviceModel {
    _numScenesPerLine;
    _currentSceneNumber;
    _isRecordingScene;
    _isRecordingSceneStart; // If true, _isRecordingScene should also be true
    _currentSceneNumberChangedListeners = new Array();
    _isRecordingSceneChangedListeners = new Array();
    _sceneSlotChangedListeners = new Array();
    _sceneChangedListeners = new Array();
    _allScenesChangedListeners = new Array();
    _scenes;
    _defaultScene;
    _tempScene;
    _sceneSlotA;
    _sceneSlotB;
    constructor(numScenesPerLine = 4) {
        super();
        this._numScenesPerLine = numScenesPerLine;
        this._defaultScene = new Scene("Scene default");
        this._tempScene = new Scene("Scene temp");
        this._scenes = new Array();
        this.clearSceneDeviceModel();
    }
    /**
     * Clear the scene device model, resetting all properties to their default values.
     * Note that this method doesn't emit any events.
     * Also note that this method doesn't call clearDeviceModel() in the base class.
     */
    clearSceneDeviceModel() {
        this._currentSceneNumber = 0;
        this._isRecordingScene = false;
        this._isRecordingSceneStart = false;
        this.clearScenes();
        this._sceneSlotA = new SceneSlot(DEFAULT_SCENE_NUMBER, false);
        this._sceneSlotB = new SceneSlot(TEMP_SCENE_NUMBER, false);
    }
    clearScenes() {
        this.clearScene(DEFAULT_SCENE_NUMBER);
        this.clearScene(TEMP_SCENE_NUMBER);
        for (let i = 0; i < this._scenes.length; i++) {
            this.clearScene(i);
        }
    }
    clearScene(sceneNumber) {
        if (sceneNumber === DEFAULT_SCENE_NUMBER)
            this._defaultScene.clear();
        else if (sceneNumber === TEMP_SCENE_NUMBER)
            this._tempScene.clear();
        else
            this._scenes[sceneNumber].clear();
        this.emitSceneChangedEvent(sceneNumber);
    }
    get numScenesPerLine() {
        return this._numScenesPerLine;
    }
    addCurrentSceneNumberChangedListener(listener) {
        this._currentSceneNumberChangedListeners.push(listener);
    }
    removeCurrentSceneNumberChangedListener(listener) {
        this._currentSceneNumberChangedListeners = this._currentSceneNumberChangedListeners.filter((l) => l !== listener);
    }
    removeAllCurrentSceneNumberChangedListeners() {
        this._currentSceneNumberChangedListeners = [];
    }
    emitCurrentSceneNumberChangedEvent(currentSceneNumber) {
        for (let listener of this._currentSceneNumberChangedListeners) {
            listener(this, currentSceneNumber);
        }
    }
    addIsRecordingSceneChangedListener(listener) {
        this._isRecordingSceneChangedListeners.push(listener);
    }
    removeIsRecordingSceneChangedListener(listener) {
        this._isRecordingSceneChangedListeners = this._isRecordingSceneChangedListeners.filter((l) => l !== listener);
    }
    removeAllIsRecordingSceneChangedListeners() {
        this._isRecordingSceneChangedListeners = [];
    }
    emitIsRecordingSceneChangedEvent(isRecordingScene, isRecordingSceneStart, sceneNumber) {
        for (let listener of this._isRecordingSceneChangedListeners) {
            listener(this, isRecordingScene, isRecordingSceneStart, sceneNumber);
        }
    }
    addSceneSlotChangedListener(listener) {
        this._sceneSlotChangedListeners.push(listener);
    }
    removeSceneSlotChangedListener(listener) {
        this._sceneSlotChangedListeners = this._sceneSlotChangedListeners.filter((l) => l !== listener);
    }
    removeAllSceneSlotChangedListeners() {
        this._sceneSlotChangedListeners = [];
    }
    emitSceneSlotChangedEvent() {
        for (let listener of this._sceneSlotChangedListeners) {
            listener(this);
        }
    }
    addSceneChangedListener(listener) {
        this._sceneChangedListeners.push(listener);
    }
    removeSceneChangedListener(listener) {
        this._sceneChangedListeners = this._sceneChangedListeners.filter((l) => l !== listener);
    }
    removeAllSceneChangedListeners() {
        this._sceneChangedListeners = [];
    }
    emitSceneChangedEvent(sceneNumber) {
        for (let listener of this._sceneChangedListeners) {
            listener(this, sceneNumber);
        }
    }
    addAllScenesChangedListener(listener) {
        this._allScenesChangedListeners.push(listener);
    }
    removeAllScenesChangedListener(listener) {
        this._allScenesChangedListeners = this._allScenesChangedListeners.filter((l) => l !== listener);
    }
    removeAllScenesChangedListeners() {
        this._allScenesChangedListeners = [];
    }
    emitAllScenesChangedEvent() {
        for (let listener of this._allScenesChangedListeners) {
            listener(this);
        }
    }
    set currentSceneNumber(sceneNumber) {
        if (this._currentSceneNumber === sceneNumber)
            return;
        this._currentSceneNumber = sceneNumber;
        this.emitCurrentSceneNumberChangedEvent(sceneNumber);
    }
    get currentSceneNumber() {
        return this._currentSceneNumber;
    }
    addScene(name) {
        this._scenes.push(new Scene(name));
    }
    /**
     * Note: If you update scene parameters, make sure to call sceneHasBeenUpdated(sceneNumber) afterwards
     * @param sceneNumber
     * @returns scene
     */
    getScene(sceneNumber) {
        if (sceneNumber === DEFAULT_SCENE_NUMBER)
            return this._defaultScene;
        if (sceneNumber === TEMP_SCENE_NUMBER)
            return this._tempScene;
        return this._scenes[sceneNumber];
    }
    sceneHasBeenUpdated(sceneNumber) {
        // Note: It'd be better if we could detect this automatically,
        // but then we would probably need to create new Scene objects every time a parameter changes, 
        // which could be very often and it might have performance implications.
        // See DeviceModel.channelInfoHasBeenUpdated()
        this.emitSceneChangedEvent(sceneNumber);
    }
    get isRecordingScene() {
        return this._isRecordingScene;
    }
    get isRecordingSceneStart() {
        return this._isRecordingSceneStart;
    }
    setRecordingScene(isRecordingScene, isRecordingSceneStart, currentSceneNumber) {
        if (!isRecordingScene && isRecordingSceneStart) {
            shouldLog(LogLevel.Error) && console.error(`SceneDeviceModel.setRecordingScene() called with isRecordingScene false and isRecordingSceneStart true. This is an invalid state. Investigate.`);
            return;
        }
        if (this._isRecordingScene === isRecordingScene && this._isRecordingSceneStart === isRecordingSceneStart && this.currentSceneNumber === currentSceneNumber) {
            shouldLog(LogLevel.Error) && console.error(`this.isRecordingScene is already ${this._isRecordingScene}, this.isRecordingSceneStart is already ${this._isRecordingSceneStart}, and this.currentSceneNumber is already ${this.currentSceneNumber}. This is probably unintentional. Investigate.`);
            return;
        }
        this._isRecordingScene = isRecordingScene;
        this._isRecordingSceneStart = isRecordingSceneStart;
        let updatedCurrentSceneNumber = false;
        if (isRecordingScene && currentSceneNumber !== undefined && currentSceneNumber !== this.currentSceneNumber) {
            this._currentSceneNumber = currentSceneNumber;
            updatedCurrentSceneNumber = true;
        }
        this.emitIsRecordingSceneChangedEvent(this._isRecordingScene, this._isRecordingSceneStart, this._currentSceneNumber);
        if (updatedCurrentSceneNumber)
            this.emitCurrentSceneNumberChangedEvent(this._currentSceneNumber);
    }
    get sceneSlotASceneNumber() {
        return this._sceneSlotA.sceneNumber;
    }
    get sceneSlotAMuted() {
        return this._sceneSlotA.muted;
    }
    get sceneSlotBSceneNumber() {
        return this._sceneSlotB.sceneNumber;
    }
    get sceneSlotBMuted() {
        return this._sceneSlotB.muted;
    }
    set sceneSlotASceneNumber(sceneNumber) {
        if (this._sceneSlotA.sceneNumber === sceneNumber)
            return;
        this._sceneSlotA.sceneNumber = sceneNumber;
        this.emitSceneSlotChangedEvent();
    }
    set sceneSlotAMuted(muted) {
        if (this._sceneSlotA.muted === muted)
            return;
        this._sceneSlotA.muted = muted;
        this.emitSceneSlotChangedEvent();
    }
    set sceneSlotBSceneNumber(sceneNumber) {
        if (this._sceneSlotB.sceneNumber === sceneNumber)
            return;
        this._sceneSlotB.sceneNumber = sceneNumber;
        this.emitSceneSlotChangedEvent();
    }
    set sceneSlotBMuted(muted) {
        if (this._sceneSlotB.muted === muted)
            return;
        this._sceneSlotB.muted = muted;
        this.emitSceneSlotChangedEvent();
    }
    storeToJSONString() {
        return JSON.stringify(this);
    }
    loadFromJSONString(jsonString) {
        let json = JSON.parse(jsonString);
        this.setFromJSON(json);
    }
    setFromJSON(json) {
        super.setFromJSON(json);
        this.clearSceneDeviceModel();
        this._currentSceneNumber = json.currentSceneNumber;
        this._defaultScene = Scene.fromJSON(json.defaultScene);
        this._tempScene = Scene.fromJSON(json.tempScene);
        this._scenes = json.scenes.map((scene) => Scene.fromJSON(scene));
        this._sceneSlotA = SceneSlot.fromJSON(json.sceneSlotA);
        this._sceneSlotB = SceneSlot.fromJSON(json.sceneSlotB);
        this.emitAllScenesChangedEvent();
    }
    toJSON() {
        return {
            ...super.toJSON(),
            currentSceneNumber: this.currentSceneNumber,
            defaultScene: this._defaultScene.toJSON(),
            tempScene: this._tempScene.toJSON(),
            scenes: this._scenes.map(scene => scene.toJSON()),
            sceneSlotA: this._sceneSlotA.toJSON(),
            sceneSlotB: this._sceneSlotB.toJSON(),
        };
    }
}

