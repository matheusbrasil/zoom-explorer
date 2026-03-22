// @ts-nocheck
import { DeviceHTMLView } from "./DeviceHTMLView.js";
import { DEFAULT_SCENE_NUMBER, TEMP_SCENE_NUMBER } from "./Scene.js";
import { MAX_NUM_SCENES, NUM_SCENE_SLOTS as NUM_SCENE_SLOTS, NUM_SPECIAL_SCENES, SCENE_CHANNEL, SceneCommands, SceneParameters } from "./SceneDeviceController.js";
import { htmlToElement } from "./htmltools.js";
import { shouldLog, LogLevel } from "./Logger.js";
import { rgb2hsv, hsv2rgb } from "./tools.js";
export class SceneDeviceHTMLView extends DeviceHTMLView {
    _sceneElement = document.createElement("div"); // dummy 
    _sceneHeaderElement = document.createElement("div"); // dummy 
    _currentSceneElement = document.createElement("div"); // dummy
    _storeSceneButtonElement = document.createElement("button"); // dummy
    _recSceneButtonElement = document.createElement("button"); // dummy
    _storeScenelisteners = [];
    constructor(sceneDeviceModel, color = "#FFFFFF") {
        super(sceneDeviceModel, color);
        sceneDeviceModel.addCurrentSceneNumberChangedListener(this.handleCurrentSceneNumberChanged.bind(this));
        sceneDeviceModel.addIsRecordingSceneChangedListener(this.handleIsRecordingSceneChanged.bind(this));
        sceneDeviceModel.addSceneSlotChangedListener(this.handleSceneSlotChanged.bind(this));
        sceneDeviceModel.addSceneChangedListener(this.handleSceneChanged.bind(this));
        sceneDeviceModel.addAllScenesChangedListener(this.handleAllScenesChanged.bind(this));
        sceneDeviceModel.addStateChangedListener(this.handleStateChanged.bind(this));
        sceneDeviceModel.addParameterChangedListener(this.handleParameterChanged.bind(this));
    }
    createView() {
        super.createView();
        let html;
        html = `
        <div class="rackScene">
        </div>
    `;
        this._sceneElement = htmlToElement(html);
        this._mainAreaElement.appendChild(this._sceneElement);
        html = `
        <div class="rackSceneHeader">
            <div>Current: </div>
            <div>01</div>
            <button>Store</button>
            <button>Rec</button>
        </div>
    `;
        this._sceneHeaderElement = htmlToElement(html);
        this._sceneElement.appendChild(this._sceneHeaderElement);
        this._currentSceneElement = this._sceneHeaderElement.children[1];
        this._storeSceneButtonElement = this._sceneHeaderElement.children[2];
        this._recSceneButtonElement = this._sceneHeaderElement.children[3];
        this._storeSceneButtonElement.addEventListener("click", this.handleStoreSceneButtonClicked.bind(this));
        this._recSceneButtonElement.addEventListener("click", this.handleRecSceneButtonClicked.bind(this));
        let channel = 0;
        let numSceneButtons = (this.sceneDeviceModel.getNumStates(channel) ?? 0) - NUM_SCENE_SLOTS - NUM_SPECIAL_SCENES;
        if (numSceneButtons === undefined) {
            shouldLog(LogLevel.Error) && console.error(`Channel ${channel} has no states`);
            return this._viewElement;
        }
        let numColumns = this.sceneDeviceModel.numScenesPerLine;
        let numRows = Math.ceil(numSceneButtons / numColumns) + 1; // + 1 just to align buttons at top, temporarily
        let deviceButtonGroup = this.createDeviceButtonGroup(numColumns, numRows);
        this._sceneElement.appendChild(deviceButtonGroup);
        for (let buttonNumber = 0; buttonNumber < numSceneButtons; buttonNumber++) {
            let stateValue = this.sceneDeviceModel.getState(channel, buttonNumber);
            let stateName = this.sceneDeviceModel.getStateName(channel, buttonNumber);
            let stateElement = this.createDeviceStateElement(channel, buttonNumber);
            deviceButtonGroup.appendChild(stateElement);
        }
        let stateElement = this.createDeviceStateElement(channel, SceneCommands.SLOT_A);
        deviceButtonGroup.appendChild(stateElement);
        stateElement = this.createDeviceStateElement(channel, DEFAULT_SCENE_NUMBER);
        deviceButtonGroup.appendChild(stateElement);
        stateElement = this.createDeviceStateElement(channel, TEMP_SCENE_NUMBER);
        deviceButtonGroup.appendChild(stateElement);
        stateElement = this.createDeviceStateElement(channel, SceneCommands.SLOT_B);
        deviceButtonGroup.appendChild(stateElement);
        stateElement = this.createDeviceParameterElement(channel, SceneParameters.CROSSFADER);
        stateElement.classList.add("span");
        deviceButtonGroup.appendChild(stateElement);
        this.updateSceneButtonColors();
        this.updateSceneSlotColors();
        this.updateOnOff(this.sceneDeviceModel.deviceIsOn);
        return this._viewElement;
    }
    get sceneDeviceModel() {
        return this._deviceModel;
    }
    addStoreSceneListener(listener) {
        this._storeScenelisteners.push(listener);
    }
    removeStoreSceneListener(listener) {
        this._storeScenelisteners = this._storeScenelisteners.filter((l) => l !== listener);
    }
    removeAllStoreSceneListeners() {
        this._storeScenelisteners = [];
    }
    emitStoreSceneEvent(sceneNumber) {
        for (let listener of this._storeScenelisteners)
            listener(this, sceneNumber);
    }
    handleButtonStateChanged(state, channel, stateNumber) {
        super.handleButtonStateChanged(state, channel, stateNumber);
        if (stateNumber < MAX_NUM_SCENES)
            this.sceneDeviceModel.currentSceneNumber = stateNumber;
    }
    handleCurrentSceneNumberChanged(sceneDeviceModel, currentSceneNumber) {
        let sceneName = this.sceneDeviceModel.getStateName(SCENE_CHANNEL, currentSceneNumber);
        this._currentSceneElement.textContent = sceneName;
        for (let [key, button] of this._buttons) {
            let channel = key >> 8;
            let stateNumber = key & 0xFF;
            let selected = (channel === SCENE_CHANNEL && (stateNumber >= 0 && stateNumber < MAX_NUM_SCENES || stateNumber === DEFAULT_SCENE_NUMBER || stateNumber === TEMP_SCENE_NUMBER)) && stateNumber === currentSceneNumber;
            button.element.classList.toggle("selected", selected);
        }
    }
    handleStoreSceneButtonClicked(event) {
        this.emitStoreSceneEvent(this.sceneDeviceModel.currentSceneNumber);
    }
    handleRecSceneButtonClicked(event) {
        if (!this.sceneDeviceModel.isRecordingScene) {
            this._recSceneButtonElement.textContent = "Rec";
            this.sceneDeviceModel.setRecordingScene(true, false);
        }
        else if (this.sceneDeviceModel.isRecordingScene && !this.sceneDeviceModel.isRecordingSceneStart) {
            this._recSceneButtonElement.textContent = "Start";
            this.sceneDeviceModel.setRecordingScene(true, true);
        }
        else {
            this._recSceneButtonElement.textContent = "Rec";
            this.sceneDeviceModel.setRecordingScene(false, false);
        }
    }
    handleIsRecordingSceneChanged(sceneDeviceModel, isRecordingScene, isRecordingSceneStart) {
        this._recSceneButtonElement.classList.toggle("rackSceneRecButtonEnabled", isRecordingScene);
        this._recSceneButtonElement.textContent = isRecordingSceneStart ? "Start" : "Rec";
    }
    handleStateChanged(device, channel, stateNumber, stateValue) {
        // NB, we can't depend on derived state here (like sceneSlotASceneNumber), since the order of state changed listeners is not guaranteed
        if (!this.enabled)
            return;
        if (stateNumber === SceneCommands.SLOT_A || stateNumber === SceneCommands.SLOT_B) {
            this.updateSceneSlotColors();
            this.updateSceneButtonColors();
        }
        else if (stateNumber >= 0 && stateNumber < MAX_NUM_SCENES || stateNumber === DEFAULT_SCENE_NUMBER || stateNumber === TEMP_SCENE_NUMBER) {
            let sceneNumber = stateNumber;
            this.updateSceneButtonColor(sceneNumber);
        }
    }
    handleParameterChanged(device, channel, parameterNumber, rawValue) {
        if (!this.enabled)
            return;
        if (channel === 0 && parameterNumber === SceneParameters.CROSSFADER) {
            let knob = this.getKnob(0, SceneParameters.CROSSFADER);
            knob.setRawValue(rawValue, true);
        }
    }
    handleSceneSlotChanged(device) {
        this.updateSceneSlotColors();
        this.updateSceneButtonColors();
    }
    handleSceneChanged(device, sceneNumber) {
        this.updateSceneButtonColor(sceneNumber);
    }
    handleAllScenesChanged(device) {
        this.updateSceneSlotColors();
        this.updateSceneButtonColors();
    }
    updateSceneSlotColors() {
        let slotAIntensity = this.sceneDeviceModel.sceneSlotAMuted ? 1 : 3;
        let slotBIntensity = this.sceneDeviceModel.sceneSlotBMuted ? 1 : 3;
        let stateSlotA = this.sceneDeviceModel.getState(SCENE_CHANNEL, SceneCommands.SLOT_A) > 0;
        let stateSlotB = this.sceneDeviceModel.getState(SCENE_CHANNEL, SceneCommands.SLOT_B) > 0;
        let latchSlotA = this.sceneDeviceModel.getStateLatch(SCENE_CHANNEL, SceneCommands.SLOT_A) > 0;
        let latchSlotB = this.sceneDeviceModel.getStateLatch(SCENE_CHANNEL, SceneCommands.SLOT_B) > 0;
        // this._lcxl.sendColor(DEFAULT_TEMPLATE, slotAIndex, slotAIntensity, 0);
        // this._lcxl.sendColor(DEFAULT_TEMPLATE, slotBIndex, 0, slotBIntensity);
        let button = this._buttons.get(SceneCommands.SLOT_A);
        if (button === undefined) {
            console.error(`button not found for scene slot A`);
            return;
        }
        let [R, G, B] = this.lcxlColorsToHTMLColor(slotAIntensity, 0);
        button.element.style.backgroundColor = `rgb(${R}, ${G}, ${B})`;
        button.element.classList.toggle("pressed", stateSlotA || latchSlotA);
        button = this._buttons.get(SceneCommands.SLOT_B);
        if (button === undefined) {
            console.error(`button not found for scene slot B`);
            return;
        }
        [R, G, B] = this.lcxlColorsToHTMLColor(0, slotBIntensity);
        button.element.style.backgroundColor = `rgb(${R}, ${G}, ${B})`;
        button.element.classList.toggle("pressed", stateSlotB || latchSlotB);
    }
    updateSceneButtonColors() {
        for (let i = 0; i < MAX_NUM_SCENES; i++) {
            this.updateSceneButtonColor(i);
        }
        this.updateSceneButtonColor(DEFAULT_SCENE_NUMBER);
        this.updateSceneButtonColor(TEMP_SCENE_NUMBER);
    }
    get zoomDeviceModel() {
        return this._deviceModel;
    }
    updateSceneButtonColor(sceneNumber) {
        let stateSlotA = this.sceneDeviceModel.getState(SCENE_CHANNEL, SceneCommands.SLOT_A) > 0;
        let stateSlotB = this.sceneDeviceModel.getState(SCENE_CHANNEL, SceneCommands.SLOT_B) > 0;
        let stateCopy = this.sceneDeviceModel.getState(SCENE_CHANNEL, SceneCommands.COPY) > 0;
        let statePaste = this.sceneDeviceModel.getState(SCENE_CHANNEL, SceneCommands.PASTE) > 0;
        let stateClear = this.sceneDeviceModel.getState(SCENE_CHANNEL, SceneCommands.CLEAR) > 0;
        let stateSave = this.sceneDeviceModel.getState(SCENE_CHANNEL, SceneCommands.SAVE) > 0;
        let stateAny = stateCopy || statePaste || stateClear || stateSave || stateSlotA || stateSlotB;
        let stateNumber = sceneNumber;
        let stateScene = this.sceneDeviceModel.getState(SCENE_CHANNEL, stateNumber) > 0;
        let r = this.sceneDeviceModel.getScene(sceneNumber)?.isEmpty ? 0 : 1;
        let g = this.sceneDeviceModel.getScene(sceneNumber)?.isEmpty ? 0 : 1;
        if (sceneNumber === this.sceneDeviceModel.sceneSlotASceneNumber && !(stateSlotB && sceneNumber === this.sceneDeviceModel.sceneSlotBSceneNumber)) {
            g = 0;
            if (stateScene) {
                r = 3;
            }
            else {
                r = r + 1;
                if (stateSlotA)
                    r = r + 1;
            }
        }
        else if (sceneNumber == this.sceneDeviceModel.sceneSlotBSceneNumber) {
            r = 0;
            if (stateScene) {
                g = 3;
            }
            else {
                g = g + 1;
                if (stateSlotB)
                    g = g + 1;
            }
        }
        else if (stateScene && !stateAny) {
            r = 3;
            g = 3;
        }
        // set color for the right button
        let button = this._buttons.get(sceneNumber);
        if (button === undefined) {
            console.error(`button not found for scene ${sceneNumber}`);
            return;
        }
        let [R, G, B] = this.lcxlColorsToHTMLColor(r, g);
        button.element.style.backgroundColor = `rgb(${R}, ${G}, ${B})`;
        button.element.classList.toggle("notEmpty", !this.sceneDeviceModel.getScene(sceneNumber)?.isEmpty);
    }
    lcxlColorsToHTMLColor(r, g) {
        let rn = r / 3;
        let gn = g / 3;
        let bn = 0;
        let [hn, sn, vn] = rgb2hsv(rn, gn, bn);
        let [Rn, Gn, Bn] = hsv2rgb(hn, vn, 1);
        let R = Math.round(Rn * 255);
        let G = Math.round(Gn * 255);
        let B = Math.round(Bn * 255);
        return [R, G, B];
    }
}

