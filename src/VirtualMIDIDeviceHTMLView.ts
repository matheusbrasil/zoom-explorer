// @ts-nocheck
import { DeviceHTMLView } from "./DeviceHTMLView.js";
import { UNUSED_CC } from "./VirtualMIDIDeviceModel.js";
import { htmlToElement } from "./htmltools.js";
import { shouldLog, LogLevel } from "./Logger.js";
export class VirtualMIDIDeviceHTMLView extends DeviceHTMLView {
    _mappingTableElement = document.createElement("table"); // dummy
    _mapButtonElement = document.createElement("button"); // dummy
    _mappingDeletedListeners = [];
    _lastSelectedMappingIndex = -1;
    constructor(deviceModel, onOff = false) {
        super(deviceModel);
        this.createView(onOff);
        this.model.addIsMappingChangedListener(this.isMappingChanged.bind(this));
        this.model.addCurrentSourceIndexChangedListener(this.currentSourceIndexChanged.bind(this));
        this.model.addSourceChangedListener(this.sourceChanged.bind(this));
    }
    createView(onOff = false) {
        // <div type="button" class="collapsible" id="midiMapperCollapsibleButton">
        //   <div>Rack MIDI Mapper</div>
        //   <button>Map</button>
        //   <span class="material-symbols-outlined collapsibleIcon"></span>
        // </div>
        let html = `
      <div class="midiMapperClass collapsibleContainer">
          <div type="button" class="collapsible" id="midiMapperCollapsibleButton">
              ${onOff ? `<button class="material-symbols-outlined onOffButton">mode_off_on</button>` : ""}
              <label class="collapsibleContainerTitle">Rack MIDI Mapper</label>
              <button class="midiMapperMapButton">Map</button>
              <span class="material-symbols-outlined collapsibleIcon"></span>
          </div>
          <table class="collapsibleContent">
              <tr>
                  <th>Rack</th>
                  <th>Destination</th>
                  <th>&#8592;</th>
                  <th>Device</th>
                  <th>Channel</th>
                  <th>Message</th>
              </tr>
          </table>
      </div>
    `;
        this._viewElement = htmlToElement(html);
        this._headerLabelElement = this._viewElement.getElementsByClassName("collapsibleContainerTitle")[0];
        this._mainAreaElement = this._viewElement.getElementsByClassName("collapsibleContent")[0];
        this._mappingTableElement = this._viewElement.getElementsByClassName("collapsibleContent")[0];
        this._mappingTableElement.contentEditable = "true";
        this._mappingTableElement.addEventListener("keydown", (event) => {
            this.mappingTableKeyDown(event);
        });
        this._mapButtonElement = this._viewElement.children[0].children[2];
        this._mappingTableElement.addEventListener("click", this.mappingTableClicked.bind(this));
        this._mapButtonElement.addEventListener("click", this.mapButtonClicked.bind(this));
        if (onOff) {
            this._onOffButton = this._viewElement.getElementsByClassName("onOffButton")[0];
            this._onOffButton.addEventListener("click", this.onOffButtonClicked.bind(this));
        }
        this.updateOnOff(this.model.deviceIsOn);
        return this._viewElement;
    }
    mappingTableKeyDown(event) {
        event.preventDefault();
        if (event.key === "Delete" || event.key === "Backspace") {
            this.emitMappingDeletedEvent(this._lastSelectedMappingIndex);
        }
        else if (event.key === "Escape" || event.key === "Esc") {
            if (this.model.isMapping)
                this.model.isMapping = false;
            this._mappingTableElement.blur();
        }
        else if (event.key === "Up" || event.key === "ArrowUp") {
            this.model.currentSourceIndex = Math.max(0, this.model.currentSourceIndex - 1);
        }
        else if (event.key === "Down" || event.key === "ArrowDown") {
            this.model.currentSourceIndex = Math.min(this.model.destinations.length - 1, this.model.currentSourceIndex + 1);
        }
    }
    addMappingDeletedListener(listener) {
        this._mappingDeletedListeners.push(listener);
    }
    removeMappingDeletedListener(listener) {
        this._mappingDeletedListeners = this._mappingDeletedListeners.filter(l => l !== listener);
    }
    removeAllMappingDeletedListeners() {
        this._mappingDeletedListeners = [];
    }
    emitMappingDeletedEvent(index) {
        for (let listener of this._mappingDeletedListeners) {
            listener(this, index);
        }
    }
    updateDestinatons() {
        while (this._mappingTableElement.rows.length > 1)
            this._mappingTableElement.deleteRow(this._mappingTableElement.rows.length - 1);
        for (let i = 0; i < this.model.destinations.length; i++) {
            let row = this._mappingTableElement.insertRow(-1);
            let c;
            let destination = this.model.destinations[i];
            // let destinationName = (destination.stateNumber +1).toString().padStart(2, "0")
            let destinationName = destination.name;
            let source = this.model.sources[i];
            let sourceDeviceName = source === undefined || source.isUnmapped ? "" : source.deviceName;
            let sourceChannel = source === undefined || source.isUnmapped ? "" : source.channel !== undefined ? (source.channel + 1).toString().padStart(2, "0") : "";
            let sourceMessage = source === undefined || source.isUnmapped ? "" : source.ccNumber !== -1 ? "CC " + (source.ccNumber).toString().padStart(2, "0") : "Note " + (source.noteNumber).toString().padStart(2, "0");
            c = row.insertCell(-1);
            c.setAttribute("data-index", i.toString());
            c.innerHTML = (destination.channel + 1).toString();
            c = row.insertCell(-1);
            c.setAttribute("data-index", i.toString());
            c.innerHTML = destinationName;
            c = row.insertCell(-1);
            c.setAttribute("data-index", i.toString());
            c.innerHTML = "&#8592;";
            c = row.insertCell(-1);
            c.setAttribute("data-index", i.toString());
            c.innerHTML = sourceDeviceName;
            c = row.insertCell(-1);
            c.setAttribute("data-index", i.toString());
            c.innerHTML = sourceChannel;
            c = row.insertCell(-1);
            c.setAttribute("data-index", i.toString());
            c.innerHTML = sourceMessage;
            // Hide the caret in the mapping table
            row.style.caretColor = "transparent";
        }
    }
    updateRow(index) {
        let row = this._mappingTableElement.rows[index + 1];
        let source = this.model.sources[index];
        let c;
        let sourceDevice = source === undefined || source.isUnmapped ? "" : source.deviceName;
        let sourceChannel = source === undefined || source.isUnmapped ? "" : source.channel !== undefined ? (source.channel + 1).toString().padStart(2, "0") : "";
        let sourceMessage = source === undefined || source.isUnmapped ? "" : source.ccNumber !== UNUSED_CC ? "CC " + (source.ccNumber).toString().padStart(2, "0") :
            "Note " + (source.noteNumber).toString().padStart(2, "0");
        c = row.cells[3];
        c.innerHTML = sourceDevice;
        c = row.cells[4];
        c.innerHTML = sourceChannel;
        c = row.cells[5];
        c.innerHTML = sourceMessage;
    }
    get model() {
        return this._deviceModel;
    }
    mappingTableClicked(event) {
        if (event.target == null)
            return;
        let cell = event.target;
        let index = this.getMappingTableIndex(cell);
        shouldLog(LogLevel.Info) && console.log(`Mapping index clicked: ${index}`);
        if (index !== -1)
            this.model.currentSourceIndex = index;
    }
    toggleMappingTableLine(row, highlight) {
        // let row = cell.parentElement as HTMLTableRowElement;
        // if (row == null)
        //   return;
        for (let i = 0; i < row.cells.length; i++) {
            row.cells[i].classList.toggle("highlight", highlight);
        }
    }
    getMappingTableIndex(cell) {
        let data_index = cell.getAttribute("data-index");
        if (data_index == null)
            return -1;
        let index = Number.parseInt(data_index);
        return index;
    }
    mapButtonClicked(event) {
        this.model.isMapping = !this.model.isMapping;
    }
    isMappingChanged(device, isMapping) {
        if (this.model.isMapping) {
            this._mapButtonElement.classList.add("highlight");
            this._mappingTableElement.focus();
            this.model.currentSourceIndex = 0;
        }
        else {
            this._mapButtonElement.classList.remove("highlight");
            this._mappingTableElement.blur();
        }
    }
    currentSourceIndexChanged(device, currentSourceIndex) {
        if (this._lastSelectedMappingIndex != -1) {
            let row = this._mappingTableElement.rows[this._lastSelectedMappingIndex + 1];
            this.toggleMappingTableLine(row, false);
        }
        let row = this._mappingTableElement.rows[currentSourceIndex + 1];
        this.toggleMappingTableLine(row, true);
        this._lastSelectedMappingIndex = currentSourceIndex;
    }
    sourceChanged(device, index) {
        this.updateRow(index);
    }
}

