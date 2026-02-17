// @ts-nocheck
import { MIDIFilterDialog } from "./MIDIFilterDialog.js";
import { htmlToElement } from "./htmltools.js";
import { LogLevel, shouldLog } from "./Logger.js";
import { MessageType } from "./midiproxy.js";
import { getChannelMessage } from "./miditools.js";
const ON_CELL = 0;
const ACTIVITY_CELL = 9;
export class MIDIDeviceListHTMLView {
    _model;
    _viewElement = document.createElement("table"); // dummy element
    _deviceListTable = document.createElement("table"); // dummy element
    _activityCheckbox = document.createElement("input"); // dummy element
    _deviceInputIDToRowIndexMap = new Map();
    _enabled = true;
    _filterDialog;
    _activityTimeout = 2000;
    constructor(model) {
        this._model = model;
        this._model.addShowActivityChangedListener(this.showActivityChanged.bind(this));
        this._model.addDevicePropertiesChangedListener(this.devicePropertiesChanged.bind(this));
        this._model.addSelectedDeviceChangedListener(this.selectedDeviceChanged.bind(this));
        this._filterDialog = new MIDIFilterDialog("midiFilterDialog");
        this.createView();
    }
    createView() {
        let html = `
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
        this._viewElement = htmlToElement(html);
        this._deviceListTable = this._viewElement.getElementsByClassName("midiDeviceListTable")[0];
        this._deviceListTable.addEventListener("click", this.deviceListTableClicked.bind(this));
        this._activityCheckbox = this._viewElement.querySelector("input[type=checkbox]");
        this._activityCheckbox.checked = this._model.showActivity;
        this._activityCheckbox.addEventListener("change", this.activityCheckboxChanged.bind(this));
        return this._viewElement;
    }
    get viewElement() {
        return this._viewElement;
    }
    get enabled() {
        return this._enabled;
    }
    set enabled(value) {
        this._enabled = value;
    }
    // public updateMIDIDevicesTableDeprecated(devices: IManagedMIDIDevice[]) {
    //   while (this._deviceListTable.rows.length > 1)
    //     this._deviceListTable.deleteRow(this._deviceListTable.rows.length - 1);
    //   this._deviceNameToRowIndexMap.clear();
    //   for (let index = 0; index < devices.length; index++) {
    //     let info = devices[index].deviceInfo;
    //     this._deviceNameToRowIndexMap.set(info.inputID, { index: index, timeoutID: -1 });
    //     let version = info.manufacturerID[0] === 0x52 ? ZoomDevice.getZoomVersionNumber(info.versionNumber).toString() : bytesToHexString(info.versionNumber, " ");
    //     let row = this._deviceListTable.insertRow(-1);
    //     let c;
    //     c = row.insertCell(-1); c.innerHTML = info.deviceName;
    //     c = row.insertCell(-1); c.innerHTML = info.inputName;
    //     c = row.insertCell(-1); c.innerHTML = info.outputName;
    //     c = row.insertCell(-1); c.innerHTML = info.manufacturerName;
    //     c = row.insertCell(-1); c.innerHTML = bytesToHexString(info.familyCode, " ");
    //     c = row.insertCell(-1); c.innerHTML = bytesToHexString(info.modelNumber, " ");
    //     c = row.insertCell(-1); c.innerHTML = version;
    //     c = row.insertCell(-1); c.innerHTML = "";
    //     shouldLog(LogLevel.Info) && console.log(`  ${index + 1}: ${info.deviceName.padEnd(8)} OS v ${version} - input: ${info.inputName.padEnd(20)} output: ${info.outputName}`);
    //   }
    // }
    updateMIDIDevicesTable() {
        while (this._deviceListTable.rows.length > 1)
            this._deviceListTable.deleteRow(this._deviceListTable.rows.length - 1);
        this._deviceInputIDToRowIndexMap.clear();
        const sortedMapArray = Array.from(this._model.deviceProperties).sort((a, b) => {
            let aDeviceName = a[0];
            let bDeviceName = b[0];
            let aProperties = a[1];
            let bProperties = b[1];
            if (aProperties.manufacturerName !== undefined && aProperties.manufacturerName.includes("Zoom Corporation")) {
                if (bProperties.manufacturerName !== undefined && bProperties.manufacturerName.includes("Zoom Corporation"))
                    return aDeviceName.localeCompare(bDeviceName);
                else
                    return -1;
            }
            if (bProperties.manufacturerName !== undefined && bProperties.manufacturerName.includes("Zoom Corporation"))
                return 1;
            return aDeviceName.localeCompare(bDeviceName);
        });
        const sortedDevicePropertiesMap = new Map(sortedMapArray);
        let index = 0;
        for (let [deviceName, properties] of sortedDevicePropertiesMap) {
            if (!properties.deviceAvailable)
                continue;
            this._deviceInputIDToRowIndexMap.set(properties.inputID, { index: index, timeoutID: -1, timestamp: 0 });
            index++;
            let row = this._deviceListTable.insertRow(-1);
            row.setAttribute("data-deviceName", deviceName);
            if (properties.deviceName === this._model.selectedDeviceName)
                row.classList.add("midiDeviceListTableSelected");
            let c;
            let html = `<input type="checkbox" name="onOff" unchecked />`;
            let deviceOn = htmlToElement(html);
            deviceOn.checked = properties.deviceOn;
            deviceOn.setAttribute("data-deviceName", deviceName);
            deviceOn.addEventListener("change", this.deviceOnCheckboxChanged.bind(this));
            c = row.insertCell(-1);
            c.appendChild(deviceOn);
            c = row.insertCell(-1);
            c.innerHTML = properties.deviceName;
            c = row.insertCell(-1);
            c.innerHTML = properties.inputName;
            c = row.insertCell(-1);
            c.innerHTML = properties.outputName;
            c = row.insertCell(-1);
            c.innerHTML = properties.manufacturerName;
            c = row.insertCell(-1);
            c.innerHTML = properties.familyCode;
            c = row.insertCell(-1);
            c.innerHTML = properties.modelNumber;
            c = row.insertCell(-1);
            c.innerHTML = properties.version;
            html = `<button></button>`;
            let filterButton = htmlToElement(html);
            // let filterText = "";
            // filterText += properties.filterEnableClock ? "&#x2611;" : "&#x2610;";
            // filterText += properties.filterEnableCC ? "&#x2611;" : "&#x2610;";
            // filterText += properties.filterEnableNote ? "&#x2611;" : "&#x2610;";
            // filterButton.innerHTML = filterText;
            // <td><button><input type="checkbox" unchecked /><input type="checkbox" unchecked /><input type="checkbox" checked /></button></td>
            html = `<input type="checkbox"/>`;
            let checkbox = htmlToElement(html);
            checkbox.checked = properties.filterMuteClock;
            checkbox.addEventListener("click", (e) => e.preventDefault());
            filterButton.appendChild(checkbox);
            html = `<input type="checkbox"/>`;
            checkbox = htmlToElement(html);
            checkbox.checked = properties.filterMuteCC;
            checkbox.addEventListener("click", (e) => e.preventDefault());
            filterButton.appendChild(checkbox);
            html = `<input type="checkbox"/>`;
            checkbox = htmlToElement(html);
            checkbox.checked = properties.filterMuteNote;
            checkbox.addEventListener("click", (e) => e.preventDefault());
            filterButton.appendChild(checkbox);
            filterButton.setAttribute("data-deviceName", deviceName);
            filterButton.addEventListener("click", this.filterButtonClicked.bind(this));
            c = row.insertCell(-1);
            c.appendChild(filterButton);
            c = row.insertCell(-1);
            c.innerHTML = ""; // activity
        }
    }
    updateMIDIDevicesTableActivity(inputID, message) {
        if (!this._enabled || !this._model.showActivity)
            return;
        let indexAndTimeout = this._deviceInputIDToRowIndexMap.get(inputID);
        if (indexAndTimeout === undefined) {
            shouldLog(LogLevel.Error) && console.error(`Unable to get index for device "${inputID}"`);
            return;
        }
        let row = this._deviceListTable.rows[indexAndTimeout.index + 1];
        let c = row.cells[ACTIVITY_CELL];
        let [messageType, channel, data1, data2] = getChannelMessage(message);
        let messageString;
        if (messageType >= MessageType.SysEx) {
            messageString = `${MessageType[messageType]}`;
        }
        else {
            messageString = `Ch ${(channel + 1).toString().padStart(2, "0")} ${MessageType[messageType]}`;
            if (data1 > -1)
                messageString += ` ${data1.toString().padStart(3, "0")}`;
            if (data2 > -1)
                messageString += ` ${data2.toString().padStart(3, "0")}`;
        }
        c.textContent = messageString;
        indexAndTimeout.timestamp = Date.now();
        if (indexAndTimeout.timeoutID === -1)
            fireOffNewTimeout(indexAndTimeout, this._activityTimeout);
        function fireOffNewTimeout(indexAndTimeout, activityTimeout) {
            indexAndTimeout.timeoutID = setTimeout(() => {
                let timeDiff = Date.now() - indexAndTimeout.timestamp;
                if (timeDiff > activityTimeout * 0.95) {
                    c.textContent = "";
                    indexAndTimeout.timeoutID = -1;
                    indexAndTimeout.timestamp = 0;
                }
                else {
                    // activity text was updated since we fired off the timeout, so we need to fire off a new timeout
                    fireOffNewTimeout(indexAndTimeout, activityTimeout - timeDiff);
                }
            }, activityTimeout);
        }
    }
    activityCheckboxChanged(event) {
        this._model.showActivity = this._activityCheckbox.checked;
        if (!this._activityCheckbox.checked) {
            for (let i = 1; i < this._deviceListTable.rows.length; i++) {
                let row = this._deviceListTable.rows[i];
                let c = row.cells[ACTIVITY_CELL];
                c.textContent = "";
            }
        }
    }
    showActivityChanged(model, showActivity) {
        if (this._activityCheckbox.checked !== showActivity)
            this._activityCheckbox.checked = showActivity;
    }
    devicePropertiesChanged(model, deviceName, settings, operation) {
        this.updateMIDIDevicesTable();
    }
    deviceOnCheckboxChanged(event) {
        let deviceOn = event.target;
        let deviceName = deviceOn.getAttribute("data-deviceName");
        this._model.setDeviceOn(deviceName, deviceOn.checked);
    }
    filterButtonClicked(event) {
        let filterButton = event.target;
        while (!(filterButton instanceof HTMLButtonElement)) {
            filterButton = filterButton.parentElement;
        }
        let deviceName = filterButton.getAttribute("data-deviceName");
        let properties = this._model.deviceProperties.get(deviceName);
        setTimeout(async () => {
            let filter = await this._filterDialog.getFilterSettings([properties.filterMuteClock, properties.filterMuteCC, properties.filterMuteNote]);
            properties.filterMuteClock = filter[0];
            properties.filterMuteCC = filter[1];
            properties.filterMuteNote = filter[2];
            this._model.setDeviceProperties(deviceName, properties);
        });
    }
    deviceListTableClicked(event) {
        let rowElement = event.target;
        if (rowElement === null)
            return;
        if (rowElement instanceof HTMLInputElement && rowElement.checked === false)
            return; // no point in selecting a device that is off 
        while ((rowElement instanceof HTMLTableRowElement === false) && rowElement.parentElement !== null) {
            rowElement = rowElement.parentElement;
        }
        let row = rowElement;
        let deviceName = row.getAttribute("data-deviceName");
        if (deviceName === null)
            return; // user didn't click on a device row (probably clicked on the header)
        this._model.selectedDeviceName = deviceName;
    }
    selectedDeviceChanged(model, deviceName) {
        for (let i = 1; i < this._deviceListTable.rows.length; i++) {
            let row = this._deviceListTable.rows[i];
            let rowDeviceName = row.getAttribute("data-deviceName");
            row.classList.toggle("midiDeviceListTableSelected", rowDeviceName === deviceName);
        }
    }
}

