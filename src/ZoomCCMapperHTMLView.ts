// @ts-nocheck
import { htmlToElement, setHtmlFast, supportsContentEditablePlaintextOnly } from "./htmltools.js";
import { shouldLog, LogLevel } from "./Logger.js";
import { UNUSED_CC, UNUSED_NOTE } from "./ZoomCCMapperModel.js";
export class ZoomCCMapperHTMLView {
    _mapperModel;
    _viewElement = document.createElement("div"); // dummy element;
    _onOffButton = document.createElement("div"); // dummy element
    _title = document.createElement("div"); // dummy element
    _content = document.createElement("div"); // dummy element;
    _deviceSelector = document.createElement("select"); // dummy element
    _ouptutDeviceTable = document.createElement("table"); // dummy element
    _mappingsTable = document.createElement("table"); // dummy element
    _clearLogButton = document.createElement("button"); // dummy element
    _muteInputDeviceChanged = false;
    _mappingHistory = new Map();
    _lastUnmappedInput = [-1, -1, -1, -1];
    _undoChannelEditOnEscape = "";
    _enabled = true;
    _muteBlurOnEscape = false;
    ;
    constructor(model) {
        this._mapperModel = model;
        this._mapperModel.addInputDeviceChangedListener(this.inputDeviceChanged.bind(this));
        this._mapperModel.addOutputDeviceChannelChangedListener(this.outputDeviceChanged.bind(this));
        this.createView();
        this.updateOutputDeviceTable();
        if (this._mapperModel.inputDevice !== "") {
            this.updateDeviceSelector([this._mapperModel.inputDevice]);
            this.inputDeviceChanged(this._mapperModel, this._mapperModel.inputDevice);
        }
    }
    createView() {
        let html = `
    <div class="zoomCCMapperClass collapsibleContainer">
        <div type="button" class="collapsible" id="zoomCCMapperCollapsibleButton">
            <button class="material-symbols-outlined onOffButton">mode_off_on</button>
            <span class="collapsibleContainerTitle">Zoom MIDI CC Mapper</span>
            <span class="material-symbols-outlined collapsibleIcon"></span>
        </div>
        <div class="collapsibleContent">
            <label for="deviceSelect" class="zoomCCMapperDeviceSelectorLabel">Input device: </label>

            <select name="devices" id="deviceSelect" class="zoomCCMapperDeviceSelector">
              <option value="">--Please select a device--</option>
            </select>

            <button type="button" class="clearLogButtonClass">Clear log</button>

            <table class="zoomCCMapperOutputDeviceTable">
                <tr>
                    <th>Output device</th>
                    <th>&#8592;</th>
                    <th>Input Channel</th>
                </tr>
                <tr>
                    <td>Zoom MS-70CDR+ #1</td>
                    <th>&#8592;</th>
                    <td>1</td>
                </tr>
            </table>

            <table class="zoomCCMapperTable">
                <tr>
                    <th>Channel</th>
                    <th>Message</th>
                    <th>Value</th>
                    <th>&#8594;</th>
                    <th>Device</th>
                    <th>Parameter</th>
                    <th>Value</th>
                </tr>
                <tr>
                    <td>1</td>
                    <td>CC 22</td>
                    <td>88</td>
                    <td>&#8594;</td>
                    <td>Zoom MS-70CDR+ #1</td>
                    <td>Slot 1 BitCrush Mix</td>
                    <td>42</td>
                </tr>
            </table>
        </div>
    </div>
    `;
        this._viewElement = htmlToElement(html);
        this._onOffButton = this._viewElement.getElementsByClassName("onOffButton")[0];
        this._title = this._viewElement.getElementsByClassName("collapsibleContainerTitle")[0];
        this._content = this._viewElement.getElementsByClassName("collapsibleContent")[0];
        this._deviceSelector = this._viewElement.getElementsByClassName("zoomCCMapperDeviceSelector")[0];
        this._ouptutDeviceTable = this._viewElement.getElementsByClassName("zoomCCMapperOutputDeviceTable")[0];
        this._mappingsTable = this._viewElement.getElementsByClassName("zoomCCMapperTable")[0];
        this._clearLogButton = this._viewElement.getElementsByClassName("clearLogButtonClass")[0];
        if (this._mapperModel.on) {
            this._onOffButton.classList.add("on");
            this._title.classList.add("on");
            this._content.classList.add("on");
        }
        this.clearMappingsTable();
        this._onOffButton.addEventListener("click", this.onOffButtonClicked.bind(this));
        this._deviceSelector.addEventListener("change", this.deviceSelectorChanged.bind(this));
        this._clearLogButton.addEventListener("click", this.clearLogButtonClicked.bind(this));
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
    updateDeviceSelector(deviceNames) {
        //let selectedDevice = this._deviceSelector.value;
        while (this._deviceSelector.children.length > 1)
            this._deviceSelector.removeChild(this._deviceSelector.lastChild);
        for (let deviceName of deviceNames) {
            let option = document.createElement("option");
            option.value = deviceName;
            option.text = deviceName;
            this._deviceSelector.appendChild(option);
        }
        if (deviceNames.includes(this._mapperModel.inputDevice))
            this._deviceSelector.value = this._mapperModel.inputDevice;
    }
    clearMappingsTable() {
        const mappingsList = this._mappingsTable.children[0];
        while (mappingsList.children.length > 1)
            mappingsList.removeChild(mappingsList.lastChild);
    }
    updateMappingsTable() {
        const mappingsList = this._mappingsTable.children[0];
        while (mappingsList.children.length > this._mappingHistory.size + 1 + (this._lastUnmappedInput[0] >= 0 ? 1 : 0))
            mappingsList.removeChild(mappingsList.lastChild);
        let line = 0;
        for (let [address, [inputValue, device, parameter, outputValue]] of this._mappingHistory.entries()) {
            let [channel, ccNumber, noteNumber] = ZoomCCMapperHTMLView.decomposeAddress(address);
            updateRow(channel, ccNumber, noteNumber, inputValue, device, parameter, outputValue);
            line += 1;
        }
        if (this._lastUnmappedInput[0] >= 0 && (this._lastUnmappedInput[1] !== UNUSED_CC || this._lastUnmappedInput[2] !== UNUSED_NOTE)) {
            updateRow(this._lastUnmappedInput[0], this._lastUnmappedInput[1], this._lastUnmappedInput[2], this._lastUnmappedInput[3], "Unmapped", "", "");
        }
        function updateRow(channel, ccNumber, noteNumber, inputValue, device, parameter, outputValue) {
            let displayChannel = channel + 1;
            let messageString = ccNumber === UNUSED_CC ? `Note ${noteNumber.toString()}` : `CC ${ccNumber.toString().padStart(2, "0")}`;
            if (mappingsList.children.length <= 1 + line) {
                let html = `
        <tr>
        <td>${displayChannel.toString().padStart(2, "0")}</td>
        <td>${messageString}</td>
        <td>${inputValue.toString().padStart(3, "0")}</td>
        <td>&#8594;</td>
        <td>${device}</td>
        <td>${parameter}</td>
        <td>${outputValue}</td>
        </tr>
        `;
                mappingsList.appendChild(htmlToElement(html));
            }
            else {
                let tr = mappingsList.children[1 + line];
                tr.children[0].textContent = displayChannel.toString().padStart(2, "0");
                tr.children[1].textContent = messageString;
                tr.children[2].textContent = inputValue.toString().padStart(3, "0");
                tr.children[4].textContent = device;
                tr.children[5].textContent = parameter;
                setHtmlFast(tr.children[6], outputValue);
            }
        }
    }
    addMapping(channel, ccNumber, noteNumber, inputValue, device, parameter, outputValue) {
        if (device !== "") {
            let address = ZoomCCMapperHTMLView.composeAddress(channel, ccNumber, noteNumber);
            this._mappingHistory.set(address, [inputValue, device, parameter, outputValue]);
            // this._lastUnmappedInput = [-1, -1, -1, -1];
        }
        else {
            this._lastUnmappedInput = [channel, ccNumber, noteNumber, inputValue];
        }
        this.updateMappingsTable();
    }
    updateOutputDeviceTable() {
        const deviceList = this._ouptutDeviceTable.children[0];
        while (deviceList.children.length > 1)
            deviceList.removeChild(deviceList.lastChild);
        let indexIntoMapperModelOutputDeviceChannels = 0;
        for (let [outputDeviceName, channel] of this._mapperModel.outputDeviceChannels) {
            if (this._mapperModel.outputDeviceIsAvailable(outputDeviceName)) {
                // Only show available devices
                let displayChannel = channel + 1;
                let tr = htmlToElement(`<tr><td>${outputDeviceName}</td><td>&#8592;</td><td>${displayChannel}</td></tr>`);
                let channelCell = tr.children[2];
                this.setupEventListenersForCell(channelCell, indexIntoMapperModelOutputDeviceChannels);
                deviceList.appendChild(tr);
            }
            indexIntoMapperModelOutputDeviceChannels++;
        }
    }
    onOffButtonClicked(event) {
        shouldLog(LogLevel.Info) && console.log(`ZoomCCMapperHTMLView.onOffButtonClicked()`);
        this._onOffButton.classList.toggle("on");
        this._title.classList.toggle("on");
        this._content.classList.toggle("on");
        this._mapperModel.on = this._onOffButton.classList.contains("on");
    }
    inputDeviceChanged(model, name) {
        if (this._muteInputDeviceChanged)
            return;
        shouldLog(LogLevel.Info) && console.log(`ZoomCCMapperHTMLView.inputDeviceChanged(${name})`);
        this._deviceSelector.value = name;
    }
    deviceSelectorChanged(event) {
        let deviceSelector = event.target;
        shouldLog(LogLevel.Info) && console.log(`ZoomCCMapperHTMLView.deviceSelectorChanged(${deviceSelector.value})`);
        this._muteInputDeviceChanged = true;
        this._mapperModel.inputDevice = deviceSelector.value;
        this._muteInputDeviceChanged = false;
    }
    clearLogButtonClicked(event) {
        shouldLog(LogLevel.Info) && console.log(`ZoomCCMapperHTMLView.clearLogButtonClicked()`);
        this._mappingHistory.clear();
        this._lastUnmappedInput = [-1, -1, -1, -1];
        this.updateMappingsTable();
    }
    setupEventListenersForCell(cell, indexIntoMapperModelOutputDeviceChannels) {
        cell.contentEditable = supportsContentEditablePlaintextOnly() ? "plaintext-only" : "true";
        cell.setAttribute("data-index", indexIntoMapperModelOutputDeviceChannels.toString());
        cell.ondrag = () => { return false; };
        cell.ondragenter = () => { return false; };
        cell.ondragleave = () => { return false; };
        cell.ondragover = () => { return false; };
        cell.ondragstart = () => { return false; };
        cell.ondragend = () => { return false; };
        cell.addEventListener("keydown", (e) => {
            if (e.key === "Enter") {
                e.preventDefault();
                cell.blur();
            }
            else if (e.key === "Escape" || e.key === "Esc") {
                cell.innerText = this._undoChannelEditOnEscape;
                this._muteBlurOnEscape = true;
                cell.blur();
                this._muteBlurOnEscape = false;
            }
        });
        cell.addEventListener("focus", (e) => {
            this._undoChannelEditOnEscape = cell.innerText;
        });
        cell.addEventListener("blur", (e) => {
            if (!this._muteBlurOnEscape) {
                let channel = parseInt(cell.innerText) - 1;
                if (isNaN(channel) || channel < 0 || channel > 15) {
                    cell.innerText = this._undoChannelEditOnEscape;
                }
                else {
                    let indexIntoMapperModelOutputDeviceChannels = parseInt(cell.getAttribute("data-index"));
                    let duplicateFound = false;
                    let listIndex = 0;
                    let outputDeviceNameForIndex = "";
                    let deleteDuplicateName = "";
                    for (let [outputDeviceName, channelForOutputDevice] of this._mapperModel.outputDeviceChannels) {
                        if (channel === channelForOutputDevice) {
                            if (this._mapperModel.outputDeviceIsAvailable(outputDeviceName)) {
                                duplicateFound = true;
                                break;
                            }
                            else {
                                deleteDuplicateName = outputDeviceName;
                            }
                        }
                        if (listIndex === indexIntoMapperModelOutputDeviceChannels) {
                            outputDeviceNameForIndex = outputDeviceName;
                        }
                        listIndex++;
                    }
                    if (deleteDuplicateName !== "") {
                        this._mapperModel.removeOuptutDevice(deleteDuplicateName, true);
                    }
                    if (duplicateFound) {
                        cell.innerText = this._undoChannelEditOnEscape;
                    }
                    else {
                        // FIXME: need to set in another way, to notify the model and controller and stuff
                        this._mapperModel.setOutputDeviceChannel(outputDeviceNameForIndex, channel, true);
                        this.clearMappingsTable();
                    }
                }
            }
        });
    }
    outputDeviceChanged(mapperModel, outputDeviceName, channel, operation) {
        shouldLog(LogLevel.Info) && console.log(`ZoomCCMapperHTMLView.outputDeviceChanged(${outputDeviceName}, ${channel}, ${operation})`);
        this.updateOutputDeviceTable();
    }
    static composeAddress(channel, ccNumber = UNUSED_CC, noteNumber = UNUSED_NOTE) {
        return channel << 16 | ccNumber << 8 | noteNumber;
    }
    static decomposeAddress(address) {
        return [(address >> 16) & 0xFF, (address >> 8) & 0xFF, address & 0xFF];
    }
}

