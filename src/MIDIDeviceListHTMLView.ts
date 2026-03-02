import { htmlToElement } from "./htmltools.js";
import { LogLevel, shouldLog } from "./Logger.js";
import { MIDIFilterDialog } from "./MIDIFilterDialog.js";
import {
  DevicePropertiesOperation,
  MIDIDeviceListModel,
  MIDIDeviceProperties,
} from "./MIDIDeviceListModel.js";
import { getChannelMessage } from "./miditools.js";
import { DeviceID, MessageType } from "./midiproxy.js";

const ON_CELL = 0;
const ACTIVITY_CELL = 9;

interface ActivityRowInfo {
  index: number;
  timeoutID: ReturnType<typeof setTimeout> | undefined;
  timestamp: number;
}

function queryOrThrow<T extends Element>(root: ParentNode, selector: string): T {
  const element = root.querySelector(selector);
  if (element === null) {
    throw new Error(`Element matching selector "${selector}" not found`);
  }
  return element as T;
}

function createElementFromHTML<T extends HTMLElement>(html: string): T {
  return htmlToElement(html) as T;
}

export class MIDIDeviceListHTMLView {
  private readonly _model: MIDIDeviceListModel;
  private _viewElement: HTMLDivElement = document.createElement("div");
  private _deviceListTable: HTMLTableElement = document.createElement("table");
  private _activityCheckbox: HTMLInputElement = document.createElement("input");
  private readonly _deviceInputIDToRowIndexMap = new Map<DeviceID, ActivityRowInfo>();
  private _enabled = true;
  private readonly _filterDialog: MIDIFilterDialog;
  private readonly _activityTimeout = 2000;

  public constructor(model: MIDIDeviceListModel) {
    this._model = model;
    this._model.addShowActivityChangedListener(this.showActivityChanged.bind(this));
    this._model.addDevicePropertiesChangedListener(this.devicePropertiesChanged.bind(this));
    this._model.addSelectedDeviceChangedListener(this.selectedDeviceChanged.bind(this));
    this._filterDialog = new MIDIFilterDialog("midiFilterDialog");
    this.createView();
  }

  public createView(): HTMLDivElement {
    const html = `
        <div id="midiDeviceList" class="midiDeviceListClass collapsibleContainer">
            <button type="button" class="collapsible" id="midiDeviceListCollapsibleButton">MIDI Devices
                <span class="material-symbols-outlined collapsibleIcon"></span>
            </button>
            <table class="midiDeviceListTable collapsibleContent">
                <tr>
                    <th>On</th>
                    <th>Device</th>
                    <th>Input</th>
                    <th>Output</th>
                    <th>Manufacturer</th>
                    <th>Family</th>
                    <th>Model</th>
                    <th>Version</th>
                    <th>Filter</th>
                    <th><label><input type="checkbox" name="activity" unchecked /><span>Activity</span></label></th>
                </tr>
            </table>
        </div>
    `;

    this._viewElement = createElementFromHTML<HTMLDivElement>(html);
    this._deviceListTable = queryOrThrow<HTMLTableElement>(this._viewElement, ".midiDeviceListTable");
    this._deviceListTable.addEventListener("click", this.deviceListTableClicked.bind(this));
    this._activityCheckbox = queryOrThrow<HTMLInputElement>(this._viewElement, "input[type=checkbox]");
    this._activityCheckbox.checked = this._model.showActivity;
    this._activityCheckbox.addEventListener("change", this.activityCheckboxChanged.bind(this));

    return this._viewElement;
  }

  public get viewElement(): HTMLDivElement {
    return this._viewElement;
  }

  public get enabled(): boolean {
    return this._enabled;
  }

  public set enabled(value: boolean) {
    this._enabled = value;
  }

  public updateMIDIDevicesTable(): void {
    while (this._deviceListTable.rows.length > 1) {
      this._deviceListTable.deleteRow(this._deviceListTable.rows.length - 1);
    }

    this._deviceInputIDToRowIndexMap.clear();

    const sortedEntries = Array.from(this._model.deviceProperties.entries()).sort(([aDeviceName, aProperties], [bDeviceName, bProperties]) => {
      const aIsZoom = aProperties.manufacturerName.includes("Zoom Corporation");
      const bIsZoom = bProperties.manufacturerName.includes("Zoom Corporation");

      if (aIsZoom && bIsZoom) {
        return aDeviceName.localeCompare(bDeviceName);
      }
      if (aIsZoom) {
        return -1;
      }
      if (bIsZoom) {
        return 1;
      }
      return aDeviceName.localeCompare(bDeviceName);
    });

    let rowIndex = 0;
    for (const [deviceName, properties] of sortedEntries) {
      if (!properties.deviceAvailable) {
        continue;
      }

      this._deviceInputIDToRowIndexMap.set(properties.inputID, {
        index: rowIndex,
        timeoutID: undefined,
        timestamp: 0,
      });
      rowIndex++;

      const row = this._deviceListTable.insertRow(-1);
      row.setAttribute("data-deviceName", deviceName);
      if (properties.deviceName === this._model.selectedDeviceName) {
        row.classList.add("midiDeviceListTableSelected");
      }

      const deviceOn = createElementFromHTML<HTMLInputElement>('<input type="checkbox" name="onOff" unchecked />');
      deviceOn.checked = properties.deviceOn;
      deviceOn.setAttribute("data-deviceName", deviceName);
      deviceOn.addEventListener("change", this.deviceOnCheckboxChanged.bind(this));
      let cell = row.insertCell(-1);
      cell.appendChild(deviceOn);

      cell = row.insertCell(-1);
      cell.textContent = properties.deviceName;
      cell = row.insertCell(-1);
      cell.textContent = properties.inputName;
      cell = row.insertCell(-1);
      cell.textContent = properties.outputName;
      cell = row.insertCell(-1);
      cell.textContent = properties.manufacturerName;
      cell = row.insertCell(-1);
      cell.textContent = properties.familyCode;
      cell = row.insertCell(-1);
      cell.textContent = properties.modelNumber;
      cell = row.insertCell(-1);
      cell.textContent = properties.version;

      const filterButton = createElementFromHTML<HTMLButtonElement>("<button></button>");
      filterButton.appendChild(this.createFilterCheckbox(properties.filterMuteClock));
      filterButton.appendChild(this.createFilterCheckbox(properties.filterMuteCC));
      filterButton.appendChild(this.createFilterCheckbox(properties.filterMuteNote));
      filterButton.setAttribute("data-deviceName", deviceName);
      filterButton.addEventListener("click", this.filterButtonClicked.bind(this));
      cell = row.insertCell(-1);
      cell.appendChild(filterButton);

      cell = row.insertCell(-1);
      cell.textContent = "";
    }
  }

  public updateMIDIDevicesTableActivity(inputID: DeviceID, message: Uint8Array): void {
    if (!this._enabled || !this._model.showActivity) {
      return;
    }

    const rowInfo = this._deviceInputIDToRowIndexMap.get(inputID);
    if (rowInfo === undefined) {
      shouldLog(LogLevel.Error) && console.error(`Unable to get index for device "${inputID}"`);
      return;
    }

    const row = this._deviceListTable.rows[rowInfo.index + 1];
    const cell = row?.cells[ACTIVITY_CELL];
    if (cell === undefined) {
      return;
    }

    const [messageType, channel, data1, data2] = getChannelMessage(message);
    let messageString: string;
    if (messageType >= MessageType.SysEx) {
      messageString = `${MessageType[messageType]}`;
    } else {
      messageString = `Ch ${(channel + 1).toString().padStart(2, "0")} ${MessageType[messageType]}`;
      if (data1 > -1) {
        messageString += ` ${data1.toString().padStart(3, "0")}`;
      }
      if (data2 > -1) {
        messageString += ` ${data2.toString().padStart(3, "0")}`;
      }
    }

    cell.textContent = messageString;
    rowInfo.timestamp = Date.now();
    if (rowInfo.timeoutID === undefined) {
      this.scheduleActivityClear(rowInfo, cell, this._activityTimeout);
    }
  }

  public activityCheckboxChanged(_event: Event): void {
    this._model.showActivity = this._activityCheckbox.checked;
    if (this._activityCheckbox.checked) {
      return;
    }

    for (let index = 1; index < this._deviceListTable.rows.length; index++) {
      const row = this._deviceListTable.rows[index];
      const cell = row.cells[ACTIVITY_CELL];
      if (cell !== undefined) {
        cell.textContent = "";
      }
    }
  }

  public showActivityChanged(_model: MIDIDeviceListModel, showActivity: boolean): void {
    if (this._activityCheckbox.checked !== showActivity) {
      this._activityCheckbox.checked = showActivity;
    }
  }

  public devicePropertiesChanged(
    _model: MIDIDeviceListModel,
    _deviceName: string,
    _settings: MIDIDeviceProperties,
    _operation: DevicePropertiesOperation,
  ): void {
    this.updateMIDIDevicesTable();
  }

  public deviceOnCheckboxChanged(event: Event): void {
    const deviceOn = event.target;
    if (!(deviceOn instanceof HTMLInputElement)) {
      return;
    }

    const deviceName = deviceOn.getAttribute("data-deviceName");
    if (deviceName === null) {
      return;
    }

    this._model.setDeviceOn(deviceName, deviceOn.checked);
  }

  public filterButtonClicked(event: Event): void {
    const filterButton = this.findParentButton(event.target);
    if (filterButton === null) {
      return;
    }

    const deviceName = filterButton.getAttribute("data-deviceName");
    if (deviceName === null) {
      return;
    }

    const properties = this._model.deviceProperties.get(deviceName);
    if (properties === undefined) {
      return;
    }

    window.setTimeout(() => {
      void this.updateFilterSettings(deviceName, properties);
    }, 0);
  }

  public deviceListTableClicked(event: Event): void {
    let rowElement = event.target;
    if (rowElement === null) {
      return;
    }

    if (rowElement instanceof HTMLInputElement && !rowElement.checked) {
      return;
    }

    while (!(rowElement instanceof HTMLTableRowElement) && rowElement instanceof Node && rowElement.parentElement !== null) {
      rowElement = rowElement.parentElement;
    }

    if (!(rowElement instanceof HTMLTableRowElement)) {
      return;
    }

    const deviceName = rowElement.getAttribute("data-deviceName");
    if (deviceName === null) {
      return;
    }

    this._model.selectedDeviceName = deviceName;
  }

  public selectedDeviceChanged(_model: MIDIDeviceListModel, deviceName: string): void {
    for (let index = 1; index < this._deviceListTable.rows.length; index++) {
      const row = this._deviceListTable.rows[index];
      const rowDeviceName = row.getAttribute("data-deviceName");
      row.classList.toggle("midiDeviceListTableSelected", rowDeviceName === deviceName);
    }
  }

  private createFilterCheckbox(checked: boolean): HTMLInputElement {
    const checkbox = createElementFromHTML<HTMLInputElement>("<input type=\"checkbox\"/>");
    checkbox.checked = checked;
    checkbox.addEventListener("click", (event: MouseEvent) => event.preventDefault());
    return checkbox;
  }

  private scheduleActivityClear(rowInfo: ActivityRowInfo, cell: HTMLTableCellElement, activityTimeout: number): void {
    rowInfo.timeoutID = window.setTimeout(() => {
      const timeDiff = Date.now() - rowInfo.timestamp;
      if (timeDiff > activityTimeout * 0.95) {
        cell.textContent = "";
        rowInfo.timeoutID = undefined;
        rowInfo.timestamp = 0;
      } else {
        this.scheduleActivityClear(rowInfo, cell, activityTimeout - timeDiff);
      }
    }, activityTimeout);
  }

  private findParentButton(target: EventTarget | null): HTMLButtonElement | null {
    let current: EventTarget | null = target;
    while (!(current instanceof HTMLButtonElement)) {
      if (!(current instanceof Node) || current.parentElement === null) {
        return null;
      }
      current = current.parentElement;
    }
    return current;
  }

  private async updateFilterSettings(deviceName: string, properties: MIDIDeviceProperties): Promise<void> {
    const filter = await this._filterDialog.getFilterSettings([
      properties.filterMuteClock,
      properties.filterMuteCC,
      properties.filterMuteNote,
    ]);

    properties.filterMuteClock = filter[0] ?? properties.filterMuteClock;
    properties.filterMuteCC = filter[1] ?? properties.filterMuteCC;
    properties.filterMuteNote = filter[2] ?? properties.filterMuteNote;
    this._model.setDeviceProperties(deviceName, properties);
  }
}
