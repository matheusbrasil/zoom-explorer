import { DeviceHTMLView } from "./DeviceHTMLView.js";
import { supportsContentEditablePlaintextOnly } from "./htmltools.js";

export class RackDeviceHTMLView extends DeviceHTMLView {
  public constructor(deviceModel: { name: string }, color = "#FFFFFF", onOff = false, collapsible = false, save = false) {
    super(deviceModel, color);
    this.createView(onOff, collapsible, save);
  }

  public createView(onOff = false, collapsible = false, save = false): HTMLDivElement {
    super.createView(onOff, collapsible, save);
    this._headerLabelElement.contentEditable = supportsContentEditablePlaintextOnly() ? "plaintext-only" : "true";
    this._headerLabelElement.addEventListener("blur", this._labelEdited);
    this._headerLabelElement.addEventListener("keydown", this._labelKeyDown);

    if (save) {
      this._saveButton.setAttribute("tooltip", "Save rack");
    }

    return this._viewElement;
  }

  public addDevice(device: { viewElement: HTMLElement }): void {
    this._mainAreaElement.appendChild(device.viewElement);
  }

  public removeAllDevices(): void {
    while (this._mainAreaElement.firstChild !== null) {
      this._mainAreaElement.removeChild(this._mainAreaElement.firstChild);
    }
  }

  private readonly _labelKeyDown = (event: KeyboardEvent): void => {
    if (event.key === "Enter") {
      event.preventDefault();
      this._headerLabelElement.blur();
    }
  };

  private readonly _labelEdited = (event: FocusEvent): void => {
    const label = event.target;
    if (!(label instanceof HTMLElement)) {
      return;
    }

    const value = label.textContent;
    if (value !== null) {
      this._deviceModel.name = value;
    }
  };
}
