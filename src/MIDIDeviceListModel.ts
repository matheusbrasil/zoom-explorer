// @ts-nocheck
import { LogLevel, shouldLog } from "./Logger.js";
export class MIDIDeviceProperties {
    deviceAvailable = false;
    deviceOn = false;
    filterMuteClock = true;
    filterMuteCC = false;
    filterMuteNote = false;
    inputID = "";
    deviceName = "";
    inputName = "";
    outputName = "";
    manufacturerName = "";
    familyCode = "";
    modelNumber = "";
    version = "";
    constructor(object = undefined) {
        if (object !== undefined) // See https://cassey.dev/til/2020-11-24-spread-object-properties-to-es6-class/
            Object.assign(this, object);
    }
    toJSON() {
        return {
            deviceName: this.deviceName,
            deviceOn: this.deviceOn,
            filterMuteClock: this.filterMuteClock,
            filterMuteCC: this.filterMuteCC,
            filterMuteNote: this.filterMuteNote,
        };
    }
}
export class MIDIDeviceListModel {
    _showActivity = false;
    _showActivityChangedListeners = [];
    _deviceProperties = new Map();
    _devicePropertiesChangedListeners = [];
    _deviceOnChangedListeners = [];
    _selectedDeviceName = "";
    _selectedDeviceChangedListeners = [];
    get deviceProperties() {
        return this._deviceProperties;
    }
    setDeviceProperties(deviceName, properties) {
        this._deviceProperties.set(deviceName, properties);
        this.emitDevicePropertiesChannelChangedEvent(deviceName, properties, "set");
    }
    removeDevice(deviceName) {
        let properties = this._deviceProperties.get(deviceName);
        if (properties === undefined) {
            shouldLog(LogLevel.Warning) && console.warn(`MIDIDeviceListModel: Attempting to remove device "${deviceName}", which is not found`);
            return;
        }
        this._deviceProperties.delete(deviceName);
        this.emitDevicePropertiesChannelChangedEvent(deviceName, properties, "remove");
    }
    addDevicePropertiesChangedListener(listener) {
        this._devicePropertiesChangedListeners.push(listener);
    }
    removeDevicePropertiesChannelChangedListener(listener) {
        this._devicePropertiesChangedListeners = this._devicePropertiesChangedListeners.filter((l) => l !== listener);
    }
    removeAllDevicePropertiesChannelChangedListeners() {
        this._devicePropertiesChangedListeners = [];
    }
    emitDevicePropertiesChannelChangedEvent(deviceName, properties, operation) {
        this._devicePropertiesChangedListeners.forEach((listener) => listener(this, deviceName, properties, operation));
    }
    setDeviceOn(deviceName, on) {
        let properties = this._deviceProperties.get(deviceName);
        if (properties === undefined) {
            shouldLog(LogLevel.Warning) && console.warn(`MIDIDeviceListModel: Attempting to set on state for device "${deviceName}", which is not found`);
            return;
        }
        properties.deviceOn = on;
        this.emitDeviceOnChangedEvent(deviceName, on);
    }
    deviceIsOn(deviceName) {
        let properties = this._deviceProperties.get(deviceName);
        if (properties === undefined) {
            shouldLog(LogLevel.Warning) && console.warn(`MIDIDeviceListModel: Attempting to get on state for device "${deviceName}", which is not found`);
            return false;
        }
        return properties.deviceOn;
    }
    addDeviceOnChangedListener(listener) {
        this._deviceOnChangedListeners.push(listener);
    }
    removeDeviceOnChangedListener(listener) {
        this._deviceOnChangedListeners = this._deviceOnChangedListeners.filter((l) => l !== listener);
    }
    removeAllDeviceOnChangedListeners() {
        this._deviceOnChangedListeners = [];
    }
    emitDeviceOnChangedEvent(deviceName, on) {
        this._deviceOnChangedListeners.forEach((listener) => listener(this, deviceName, on));
    }
    get showActivity() {
        return this._showActivity;
    }
    set showActivity(value) {
        this._showActivity = value;
        this.emitShowActivityChanged(value);
    }
    addShowActivityChangedListener(listener) {
        this._showActivityChangedListeners.push(listener);
    }
    removeShowActivityChangedListener(listener) {
        this._showActivityChangedListeners = this._showActivityChangedListeners.filter(l => l !== listener);
    }
    removeAllShowActivityChangedListeners() {
        this._showActivityChangedListeners = [];
    }
    emitShowActivityChanged(showActivity) {
        for (let listener of this._showActivityChangedListeners)
            listener(this, showActivity);
    }
    get selectedDeviceName() {
        return this._selectedDeviceName;
    }
    set selectedDeviceName(deviceName) {
        if (deviceName === this._selectedDeviceName)
            return;
        this._selectedDeviceName = deviceName;
        this.emitSelectedDeviceChanged(deviceName);
    }
    addSelectedDeviceChangedListener(listener) {
        this._selectedDeviceChangedListeners.push(listener);
    }
    removeSelectedDeviceChangedListener(listener) {
        this._selectedDeviceChangedListeners = this._selectedDeviceChangedListeners.filter(l => l !== listener);
    }
    removeAllSelectedDeviceChangedListeners() {
        this._selectedDeviceChangedListeners = [];
    }
    emitSelectedDeviceChanged(deviceName) {
        this._selectedDeviceChangedListeners.forEach(listener => listener(this, deviceName));
    }
    toJSON() {
        return {
            selectedDeviceName: this.selectedDeviceName,
            showActivity: this.showActivity,
            deviceProperties: Object.fromEntries(this._deviceProperties)
        };
    }
    storeToJSON() {
        return JSON.stringify(this);
    }
    setFromJSON(json) {
        while (this._deviceProperties.size > 0)
            this.removeDevice(this._deviceProperties.keys().next().value);
        let model = JSON.parse(json);
        this.showActivity = model.showActivity ?? false;
        this.selectedDeviceName = model.selectedDeviceName ?? "";
        if (Object.hasOwn(model, "deviceProperties")) {
            let deviceProperties = new Map(Object.entries(model.deviceProperties));
            for (let [deviceName, propertiesObject] of deviceProperties) {
                let properties = new MIDIDeviceProperties(propertiesObject);
                this.setDeviceProperties(deviceName, properties);
            }
        }
    }
}

