// @ts-nocheck
import { DeviceHTMLView } from "./DeviceHTMLView.js";
import { htmlToElement } from "./htmltools.js";
import { shouldLog, LogLevel } from "./Logger.js";
class SlotElementInfo {
    slotElement;
    parameterElements = new Array();
    effectOnOffButton;
    effectDeleteButton;
    effectMoveLeftButton;
    effectMoveRightButton;
    effectAddLeftButton;
    effectAddRightButton;
    effectSelectEffectButton;
    effectName;
    constructor(slotElement) {
        this.slotElement = slotElement;
        let effectHeader = this.slotElement.children[0];
        // @see ZoomDeviceHTMLView.createEffectHeader() for lookup of these buttons
        this.effectOnOffButton = effectHeader.children[0].children[0];
        this.effectAddLeftButton = effectHeader.children[1].children[0];
        this.effectMoveLeftButton = effectHeader.children[1].children[1];
        this.effectDeleteButton = effectHeader.children[1].children[2];
        this.effectMoveRightButton = effectHeader.children[1].children[3];
        this.effectAddRightButton = effectHeader.children[1].children[4];
        this.effectSelectEffectButton = effectHeader.children[0].children[2];
        this.effectName = effectHeader.children[0].children[1];
    }
}
/**
 * This class will probably replace the ZoomPatchEditor from zoom-explorer, at least in the rack.
 *
 * Input:
 * o numberOfSlots
 * o for each slot
 *   o effect name
 *   o number of parameters per slot
 * o for each parameter
 *   o name
 *   o valueString
 *   o minValue
 *   o maxValue
 */
export class ZoomDeviceHTMLView extends DeviceHTMLView {
    _slotElements = new Array();
    _zoomEffectSelector = undefined;
    constructor(zoomDeviceModel, color = "#FFFFFF") {
        super(zoomDeviceModel, color);
        this.createView();
        this.zoomDeviceModel.addCurrentEffectSlotChangedListener((device, currentEffectSlot) => {
            if (!this.enabled)
                return;
            this.selectSlot(currentEffectSlot);
        });
        this.zoomDeviceModel.addChannelEnabledListener((device, channel, enabled) => {
            if (!this.enabled)
                return;
            this.setSlotEnabled(channel, enabled);
        });
        // Note: This parameterChanged callback is called twice when GUI changes value of parameter, but the loop propagation is 
        // stopped in Knob.setRawValue() since it bails out if old and new values are the same
        this.zoomDeviceModel.addParameterChangedListener((device, channel, parameterNumber, rawValue) => {
            if (!this.enabled)
                return;
            this.setParameter(channel, parameterNumber, rawValue, true);
        });
        this.zoomDeviceModel.addChannelColorChangedListener((device, channel, color) => {
            if (!this.enabled)
                return;
            this.setSlotColor(channel, color);
        });
        this.zoomDeviceModel.addChannelNameChangedListener((device, channel, name) => {
            if (!this.enabled)
                return;
            this.setSlotName(channel, name);
        });
        this.zoomDeviceModel.addChannelInfoChangedListener((device, channel, info) => {
            if (!this.enabled)
                return;
            this.setSlotInfo(channel, info);
        });
        this.zoomDeviceModel.addChannelInfoInsertedListener((device, channel, info) => {
            if (!this.enabled)
                return;
            this.insertSlot(channel, info);
        });
        this.zoomDeviceModel.addChannelInfoRemovedListener((device, channel) => {
            if (!this.enabled)
                return;
            this.removeSlot(channel);
        });
    }
    // Generate HTML
    //   -> Need some kind of interface description and perhaps layout hints
    //   o List of parameters
    //   o Number of params 
    createView() {
        super.createView();
        this.updateView();
        return this._viewElement;
    }
    updateView() {
        for (let slotElementInfo of this._slotElements) {
            slotElementInfo.slotElement.remove();
        }
        this._slotElements = new Array();
        let maxNumParams = 0;
        for (let slot = 0; slot < this.zoomDeviceModel.getNumSlots(); slot++) {
            maxNumParams = Math.max(maxNumParams, this.zoomDeviceModel.getNumParametersForSlot(slot));
        }
        let numRows = Math.ceil(maxNumParams / this.zoomDeviceModel.numParametersPerPage);
        for (let effectSlot = 0; effectSlot < this.zoomDeviceModel.getNumSlots(); effectSlot++) {
            let name = this.zoomDeviceModel.getSlotEffectName(effectSlot);
            let color = this.zoomDeviceModel.getSlotColor(effectSlot);
            let headerElement = this.createEffectHeader(name, effectSlot);
            let slotElement = this.createDeviceParameterGroup(headerElement, color, this.zoomDeviceModel.numParametersPerPage, numRows);
            this._mainAreaElement.insertBefore(slotElement, this._mainAreaElement.firstChild);
            let slotElementInfo = new SlotElementInfo(slotElement);
            this._slotElements.push(slotElementInfo);
            for (let parameter = 0; parameter < this.zoomDeviceModel.getNumParametersForSlot(effectSlot); parameter++) {
                let parameterElement = this.createDeviceParameterElement(effectSlot, parameter);
                slotElementInfo.parameterElements.push(parameterElement);
                slotElement.appendChild(parameterElement);
            }
            this.setSlotEnabled(effectSlot, this.zoomDeviceModel.getSlotEnabled(effectSlot));
        }
        this.selectSlot(this.zoomDeviceModel.currentEffectSlot);
        this.updateOnOff(this.zoomDeviceModel.deviceIsOn);
        return this._viewElement;
    }
    createEffectHeader(name, effectSlot) {
        let html = `
      <div class="rackDeviceParameterHeader" >
          <span class="rackDeviceParameterGroupButtons">
              <button class="material-symbols-outlined effectOnOffButton">radio_button_unchecked</button>
              <span class="editEffectTableEffectName">${name}</span>
              <button class="material-symbols-outlined effectActionButton">data_table</button>
          </span>
          <span class="rackDeviceParameterGroupButtons">
              <button class="material-symbols-outlined effectActionButton">add_circle</button>
              <button class="material-symbols-outlined effectActionButton">arrow_back_2</button>
              <button class="material-symbols-outlined effectActionButton">delete</button>
              <button class="material-symbols-outlined effectActionButton">play_arrow</button>
              <button class="material-symbols-outlined effectActionButton">add_circle</button>
          </span>                                
      </div>
    `;
        let effectHeader = htmlToElement(html);
        let effectOnOffButton;
        let effectDeleteButton;
        let effectMoveLeftButton;
        let effectMoveRightButton;
        let effectAddLeftButton;
        let effectAddRightButton;
        let effectSelectEffectButton;
        // @see SlotInfo.constructor() for lookup of these buttons
        effectOnOffButton = effectHeader.children[0].children[0];
        effectOnOffButton.dataset.effectSlot = effectSlot.toString();
        effectOnOffButton.addEventListener("click", (event) => this.onEffectSlotOnOffButtonClick(event));
        effectAddLeftButton = effectHeader.children[1].children[0];
        effectAddLeftButton.dataset.effectSlot = effectSlot.toString();
        effectAddLeftButton.addEventListener("click", (event) => this.onEffectSlotAddButtonClick(event, "left"));
        effectMoveLeftButton = effectHeader.children[1].children[1];
        effectMoveLeftButton.dataset.effectSlot = effectSlot.toString();
        effectMoveLeftButton.addEventListener("click", (event) => this.onEffectSlotMoveButtonClick(event, "left"));
        effectDeleteButton = effectHeader.children[1].children[2];
        effectDeleteButton.dataset.effectSlot = effectSlot.toString();
        effectDeleteButton.addEventListener("click", (event) => this.onEffectSlotDeleteButtonClick(event));
        effectMoveRightButton = effectHeader.children[1].children[3];
        effectMoveRightButton.dataset.effectSlot = effectSlot.toString();
        effectMoveRightButton.addEventListener("click", (event) => this.onEffectSlotMoveButtonClick(event, "right"));
        effectAddRightButton = effectHeader.children[1].children[4];
        effectAddRightButton.dataset.effectSlot = effectSlot.toString();
        effectAddRightButton.addEventListener("click", (event) => this.onEffectSlotAddButtonClick(event, "right"));
        effectSelectEffectButton = effectHeader.children[0].children[2];
        effectSelectEffectButton.dataset.effectSlot = effectSlot.toString();
        effectSelectEffectButton.addEventListener("click", (event) => this.onEffectSlotSelectEffectButtonClick(event));
        return effectHeader;
    }
    onEffectSlotOnOffButtonClick(event) {
        let button = event.target;
        if (button.dataset.effectSlot === undefined)
            return; // this should never happen
        let effectSlot = Number.parseInt(button.dataset.effectSlot);
        this.zoomDeviceModel.setSlotEnabled(effectSlot, !button.classList.contains("on"));
    }
    onEffectSlotSelectEffectButtonClick(event) {
        if (this._zoomEffectSelector === undefined)
            return;
        let button = event.target;
        if (button.dataset.effectSlot === undefined)
            return; // this should never happen
        let effectSlot = Number.parseInt(button.dataset.effectSlot);
        let effectID = this.zoomDeviceModel.getChannelInstrumentNumber(effectSlot);
        this._zoomEffectSelector.getEffect(effectID, this.zoomDeviceModel.name).then(([effectID, effectName, pedalName]) => {
            shouldLog(LogLevel.Info) && console.log(`User selected effectID: ${effectID}, effectName: ${effectName}, pedalName: ${pedalName}`);
            if (effectID !== -1) {
                this.zoomDeviceModel.setSlotEffectID(effectSlot, effectID);
            }
        });
    }
    onEffectSlotAddButtonClick(event, arg1) {
        throw new Error("Method not implemented.");
    }
    onEffectSlotDeleteButtonClick(event) {
        throw new Error("Method not implemented.");
    }
    onEffectSlotMoveButtonClick(event, arg1) {
        throw new Error("Method not implemented.");
    }
    setZoomEffectSelector(zoomEffectSelector) {
        this._zoomEffectSelector = zoomEffectSelector;
    }
    selectSlot(slot) {
        for (let i = 0; i < this._slotElements.length; i++)
            this._slotElements[i].slotElement.classList.toggle("rackDeviceParameterGroupSelected", i === slot);
    }
    setSlotEnabled(slot, enabled) {
        this._slotElements[slot].slotElement.classList.toggle("editEffectOff", !enabled);
        this._slotElements[slot].effectOnOffButton.classList.toggle("on", enabled);
        this._slotElements[slot].effectOnOffButton.textContent = enabled ? "radio_button_checked" : "radio_button_unchecked";
    }
    setSlotColor(slot, color) {
        this._slotElements[slot].slotElement.style.setProperty("background-color", color);
    }
    setSlotName(slot, name) {
        this._slotElements[slot].effectName.textContent = name;
    }
    setSlotInfo(slot, info) {
        this.setSlotEnabled(slot, info.enabled);
        let maxNumParams = 0;
        for (let slot = 0; slot < this.zoomDeviceModel.getNumSlots(); slot++) {
            maxNumParams = Math.max(maxNumParams, this.zoomDeviceModel.getNumParametersForSlot(slot));
        }
        let numRows = Math.ceil(maxNumParams / this.zoomDeviceModel.numParametersPerPage);
        let slotElementInfo = this._slotElements[slot];
        this.updateDeviceParameterGroup(slotElementInfo.slotElement, info.name, info.color, this.zoomDeviceModel.numParametersPerPage, numRows);
        for (let parameterNumber = 0; parameterNumber < info.parameterValues.size; parameterNumber++) {
            let value = info.parameterValues.get(parameterNumber);
            if (value === undefined) {
                shouldLog(LogLevel.Error) && console.error(`Unable to get value for parameter ${parameterNumber} in effectSlot ${slot} in patch ${this.zoomDeviceModel.name}`);
                return;
            }
            let parameterElement = slotElementInfo.parameterElements[parameterNumber];
            if (parameterElement === undefined) {
                let parameterElement = this.createDeviceParameterElement(slot, parameterNumber);
                slotElementInfo.parameterElements.push(parameterElement);
                slotElementInfo.slotElement.appendChild(parameterElement);
            }
            else
                this.updateDeviceParameterElement(parameterElement, slot, parameterNumber);
        }
        while (slotElementInfo.parameterElements.length > info.parameterValues.size) {
            let parameterElement = slotElementInfo.parameterElements.pop();
            if (parameterElement !== undefined) {
                slotElementInfo.slotElement.removeChild(parameterElement);
            }
        }
    }
    insertSlot(slot, info) {
        let maxNumParams = 0;
        for (let slot = 0; slot < this.zoomDeviceModel.getNumSlots(); slot++) {
            maxNumParams = Math.max(maxNumParams, this.zoomDeviceModel.getNumParametersForSlot(slot));
        }
        let numRows = Math.ceil(maxNumParams / this.zoomDeviceModel.numParametersPerPage);
        let name = this.zoomDeviceModel.getSlotEffectName(slot);
        let color = this.zoomDeviceModel.getSlotColor(slot);
        let headerElement = this.createEffectHeader(name, slot);
        let slotElement = this.createDeviceParameterGroup(headerElement, color, this.zoomDeviceModel.numParametersPerPage, numRows);
        this._mainAreaElement.insertBefore(slotElement, this._mainAreaElement.firstChild);
        let slotElementInfo = new SlotElementInfo(slotElement);
        this._slotElements.push(slotElementInfo);
        for (let parameter = 0; parameter < this.zoomDeviceModel.getNumParametersForSlot(slot); parameter++) {
            let parameterElement = this.createDeviceParameterElement(slot, parameter);
            slotElementInfo.parameterElements.push(parameterElement);
            slotElement.appendChild(parameterElement);
        }
        this.setSlotEnabled(slot, this.zoomDeviceModel.getSlotEnabled(slot));
        this.selectSlot(this.zoomDeviceModel.currentEffectSlot);
    }
    removeSlot(slot) {
        if (this._slotElements.length !== this.zoomDeviceModel.getNumSlots() + 1) {
            shouldLog(LogLevel.Error) && console.error(`Slot ${slot} has been removed from ZoomDeviceModel, but the number of slots in ZoomDeviceHTMLView is ${this._slotElements.length} instead of ${this.zoomDeviceModel.getNumSlots() + 1}`);
            return;
        }
        this._slotElements[slot].slotElement.remove();
        this._slotElements.splice(slot, 1);
        this.selectSlot(this.zoomDeviceModel.currentEffectSlot);
    }
    setParameter(slot, parameterNumber, value, mute = false) {
        // There is no parameter changed notification loop because the knob.setRawValue() will bail out if the previous and the new value are the same.
        // It would be a slightly cleaner design if we explicitly broke the loop in ZoomDeviceHTMLView or DeviceHTMLView instead.
        // ???? Update 2024-11-16: using setRawValue(value, true) to break notification loop here
        // Update 2024-12-08: breaking loop here becaause mute will be true if this method was called from the model listener
        // FIXME: this one should probably be in the base class (too? update patch here, update model in base class?)
        this.getKnob(slot, parameterNumber).setRawValue(value, mute);
    }
    get zoomDeviceModel() {
        return this._deviceModel;
    }
}

