// @ts-nocheck
import { DeviceHTMLView } from "./DeviceHTMLView.js";
import { supportsContentEditablePlaintextOnly } from "./htmltools.js";
export class RackDeviceHTMLView extends DeviceHTMLView {
    constructor(deviceModel, color = "#FFFFFF", onOff = false, collapsible = false, save = false) {
        super(deviceModel, color);
        this.createView(onOff, collapsible, save);
    }
    createView(onOff = false, collapsible = false, save = false) {
        super.createView(onOff, collapsible, save);
        this._headerLabelElement.contentEditable = supportsContentEditablePlaintextOnly() ? "plaintext-only" : "true";
        this._labelEdited = this._labelEdited.bind(this);
        this._headerLabelElement.addEventListener("blur", this._labelEdited);
        this._labelKeyDown = this._labelKeyDown.bind(this);
        this._headerLabelElement.addEventListener("keydown", this._labelKeyDown);
        if (save) {
            this._saveButton.setAttribute("tooltip", "Save rack");
        }
        return this._viewElement;
    }
    _labelKeyDown(e) {
        if (e.key === "Enter") {
            e.preventDefault();
            this._headerLabelElement.blur();
        }
    }
    _labelEdited(e) {
        let label = e.target;
        let value = label.textContent;
        if (value !== null) {
            this._deviceModel.name = value;
        }
    }
    addDevice(device) {
        this._mainAreaElement.appendChild(device.viewElement);
    }
    removeAllDevices() {
        while (this._mainAreaElement.firstChild !== null)
            this._mainAreaElement.removeChild(this._mainAreaElement.firstChild);
    }
}

