// @ts-nocheck
import { ButtonView } from "./ButtonView.js";
import { Knob } from "./Knob.js";
import { KnobView } from "./KnobView.js";
import { htmlToElement } from "./htmltools.js";
export class DeviceHTMLView {
    _deviceModel;
    _color;
    _viewElement = document.createElement("div"); // dummy
    _onOffButton = document.createElement("div"); // dummy
    _saveButton = document.createElement("div"); // dummy
    _headerElement = document.createElement("div"); // dummy
    _headerLabelElement = document.createElement("label"); // dummy
    _mainAreaElement = document.createElement("div"); // dummy
    _enabled = true;
    _saveButtonClickedListeners = [];
    _knobs = new Map();
    _buttons = new Map();
    constructor(deviceModel, color = "#FFFFFF") {
        this._deviceModel = deviceModel;
        this._color = color;
        this._deviceModel.addOnOffChangedListener(this.handleOnOffChanged.bind(this));
        this._deviceModel.addNameChangedListener(this.handleNameChanged.bind(this));
        this.updateOnOff(this._deviceModel.deviceIsOn);
    }
    /**
     * Get whether the GUI of the device is enabled
     */
    get enabled() {
        return this._enabled;
    }
    /**
     * Set whether the GUI of the device is enabled
     */
    set enabled(value) {
        this._enabled = value;
    }
    get model() {
        return this._deviceModel;
    }
    createView(onOff = false, collapsible = false, save = false) {
        let html = `
    <div class="rackDevice ${collapsible ? "collapsibleContainer" : ""}">
    </div>
    `;
        this._viewElement = htmlToElement(html);
        /*
          <div class="rackDeviceHeader">
              ${this._name}
          </div>
        */
        let name = this._deviceModel.name;
        // html = `
        //     <div class="rackDeviceHeader"><label class="rackDeviceHeaderLabel">${name}</label></div>
        // `;
        html = `
      <div type="button" class="${collapsible ? "collapsible" : ""} rackDeviceHeader">
        ${onOff ? `<button class="material-symbols-outlined onOffButton">mode_off_on</button>` : ""}
        ${save ? `<button class="saveButton ignoreCollapse" tooltip="Save"><span class="material-symbols-outlined ignoreCollapse">save</span></button>` : ""}
        <label class="collapsibleContainerTitle on rackDeviceHeaderLabel ignoreCollapse">${name}</label>
        ${collapsible ? `<span class="material-symbols-outlined collapsibleIcon"></span>` : ""}
      </div>
    `;
        this._headerElement = htmlToElement(html);
        this._headerElement.style.setProperty("background-color", this._color);
        this._headerLabelElement = this._headerElement.querySelector(".rackDeviceHeaderLabel");
        this._viewElement.appendChild(this._headerElement);
        html = `
        <div class="rackDeviceMainArea">
        </div>
    `;
        this._mainAreaElement = htmlToElement(html);
        this._viewElement.appendChild(this._mainAreaElement);
        if (onOff) {
            this._onOffButton = this._viewElement.getElementsByClassName("onOffButton")[0];
            this._onOffButton.addEventListener("click", this.onOffButtonClicked.bind(this));
            if (this._deviceModel.deviceIsOn) {
                this._onOffButton.classList.add("on");
                this._headerLabelElement.classList.add("on");
                this._mainAreaElement.classList.add("on");
            }
        }
        if (save) {
            this._saveButton = this._viewElement.getElementsByClassName("saveButton")[0];
        }
        this._saveButton.addEventListener("click", this.saveButtonClicked.bind(this));
        return this._viewElement;
    }
    get viewElement() {
        return this._viewElement;
    }
    createDeviceParameterGroup(header = undefined, color = "", numColumns = 4, numRows = -1) {
        let html = `
        <div class="rackDeviceParameterGroup">
        </div>
    `;
        let container = htmlToElement(html);
        container.style.setProperty("--num-columns", `${numColumns}`);
        if (numRows !== -1) {
            container.style.setProperty("--num-rows", `${numRows}`);
        }
        if (color !== "")
            container.style.setProperty("background-color", color);
        if (typeof header === "string") {
            let html = `
          <div class="rackDeviceParameterItem rackDeviceParameterHeader">
              ${header}
          </div>
      `;
            let headerElement = htmlToElement(html);
            container.appendChild(headerElement);
            container.style.setProperty("--has-header", `1`);
        }
        else if (header instanceof HTMLDivElement) {
            container.appendChild(header);
            container.style.setProperty("--has-header", `1`);
        }
        return container;
    }
    updateDeviceParameterGroup(container, header = undefined, color = "", numColumns = 4, numRows = -1) {
        container.style.setProperty("--num-columns", `${numColumns}`);
        if (numRows !== -1) {
            container.style.setProperty("--num-rows", `${numRows}`);
        }
        if (color !== "")
            container.style.setProperty("background-color", color);
        return container;
    }
    createDeviceParameterElement(channel, parameterNumber) {
        let [name, min, max] = this._deviceModel.getParameterInfo(channel, parameterNumber);
        let value = this._deviceModel.getParameter(channel, parameterNumber) ?? 0;
        let html = `
        <div class="rackDeviceParameterItem">
            <div>${name}</div>
        </div>    
    `;
        let parameterElement = htmlToElement(html);
        let knob = new Knob(value, min, max, (valueString) => this._deviceModel.getRawParameterValueFromString(channel, parameterNumber, valueString), (rawValue) => this._deviceModel.getStringFromRawParameterValue(channel, parameterNumber, rawValue), true);
        knob.addListener((rawValue) => this._deviceModel.setParameter(channel, parameterNumber, rawValue));
        let knobView = new KnobView(knob, true, "knob", 32, 4);
        parameterElement.appendChild(knobView.element);
        let path = channel << 8 | parameterNumber;
        this._knobs.set(path, { knob, knobView });
        return parameterElement;
    }
    updateDeviceParameterElement(parameterElement, channel, parameterNumber) {
        let [name, min, max] = this._deviceModel.getParameterInfo(channel, parameterNumber);
        parameterElement.children[0].textContent = name;
        let value = this._deviceModel.getParameter(channel, parameterNumber) ?? 0;
        let knob = this.getKnob(channel, parameterNumber);
        knob.reset(value, min, max, undefined, undefined, true);
    }
    createDeviceButtonGroup(numColumns = 4, numRows = -1) {
        let html = `
        <div class="rackDeviceButtonGroup">
        </div>
    `;
        let container = htmlToElement(html);
        container.style.setProperty("--num-columns", `${numColumns}`);
        if (numRows !== -1) {
            container.style.setProperty("--num-rows", `${numRows}`);
        }
        return container;
    }
    createDeviceStateElement(channel, stateNumber) {
        let name = this._deviceModel.getStateName(channel, stateNumber);
        let value = this._deviceModel.getState(channel, stateNumber) ?? 0;
        let html = `
        <div class="rackDeviceParameterItem">
        </div>    
    `;
        let stateElement = htmlToElement(html);
        let button = new ButtonView(name, "rackDeviceParameterButton");
        button.addListener((state) => this.handleButtonStateChanged(state, channel, stateNumber));
        stateElement.appendChild(button.element);
        let path = channel << 8 | stateNumber;
        this._buttons.set(path, button);
        return stateElement;
    }
    getKnob(channel, parameterNumber) {
        let path = channel << 8 | parameterNumber;
        return this._knobs.get(path).knob;
    }
    handleButtonStateChanged(state, channel, stateNumber) {
        this._deviceModel.setState(channel, stateNumber, state ? 127 : 0, performance.now());
    }
    /**
     * Handle the click event of the on/off button
     */
    onOffButtonClicked(event) {
        this._onOffButton.classList.toggle("on");
        // These are uptated in updateOnOff(), called by DeviceController
        // this._headerLabelElement.classList.toggle("on");
        // this._mainAreaElement.classList.toggle("on");  
        this._deviceModel.deviceIsOn = this._onOffButton.classList.contains("on");
    }
    updateOnOff(on) {
        this._onOffButton.classList.toggle("on", on);
        this._headerLabelElement.classList.toggle("on", on);
        this._mainAreaElement.classList.toggle("on", on);
    }
    handleOnOffChanged(device, on) {
        this.updateOnOff(on);
    }
    handleNameChanged(device, name) {
        this._headerLabelElement.textContent = name;
    }
    addSaveButtonClickedListener(listener) {
        this._saveButtonClickedListeners.push(listener);
    }
    removeSaveButtonClickedListener(listener) {
        let index = this._saveButtonClickedListeners.indexOf(listener);
        if (index !== -1)
            this._saveButtonClickedListeners.splice(index, 1);
    }
    removeAllSaveButtonClickedListeners() {
        this._saveButtonClickedListeners = [];
    }
    emitSaveButtonClickedEvent(shiftKey) {
        for (let listener of this._saveButtonClickedListeners)
            listener(this, shiftKey);
    }
    saveButtonClicked(event) {
        let shiftKey = event instanceof MouseEvent && event.shiftKey;
        this.emitSaveButtonClickedEvent(shiftKey);
    }
}

