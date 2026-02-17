// @ts-nocheck
import { DeviceModel } from "./DeviceModel.js";
import { SceneDeviceModel } from "./SceneDeviceModel.js";
import { shouldLog, LogLevel } from "./Logger.js";
export var DeviceListChangeType;
(function (DeviceListChangeType) {
    DeviceListChangeType["ADD"] = "add";
    DeviceListChangeType["REMOVE"] = "remove";
})(DeviceListChangeType || (DeviceListChangeType = {}));
export class RackDeviceModel extends DeviceModel {
    _deviceModels = [];
    _sceneDeviceModel = undefined; // the _sceneDeviceModel is also stored in the _deviceModels array
    _deviceModelToIndex = new Map();
    _deviceListChangedListeners = [];
    removeAllDevices() {
        this._deviceModels = [];
    }
    addDevice(deviceModel) {
        this._deviceModelToIndex.set(deviceModel, this._deviceModels.length);
        this._deviceModels.push(deviceModel);
        if (deviceModel instanceof SceneDeviceModel)
            this._sceneDeviceModel = deviceModel;
        this.emitDeviceListChangedEvent(deviceModel, DeviceListChangeType.ADD);
    }
    get deviceModels() {
        return this._deviceModels;
    }
    get sceneDeviceModel() {
        return this._sceneDeviceModel;
    }
    getDeviceIndex(deviceModel) {
        let index = this._deviceModelToIndex.get(deviceModel);
        if (index === undefined) {
            shouldLog(LogLevel.Error) && console.error(`Unable to find index for device model ${deviceModel} "${deviceModel.name}"`);
            return -1;
        }
        return index;
    }
    addDeviceListChangedListener(listener) {
        this._deviceListChangedListeners.push(listener);
    }
    removeDeviceListChangedListener(listener) {
        this._deviceListChangedListeners = this._deviceListChangedListeners.filter(l => l !== listener);
    }
    removeAllDeviceListChangedListeners() {
        this._deviceListChangedListeners = [];
    }
    emitDeviceListChangedEvent(device, changeType) {
        for (let listener of this._deviceListChangedListeners)
            listener(this, device, changeType);
    }
    storeToJSONString() {
        return JSON.stringify(this);
    }
    loadFromJSONString(jsonString) {
        let json = JSON.parse(jsonString);
        this.setFromJSON(json);
    }
    setFromJSON(json) {
        super.setFromJSON(json);
        // this._deviceModels = json.deviceModels.map((deviceModel: any) => DeviceModel.fromJSON(deviceModel));
        if (json.deviceModels === undefined) {
            shouldLog(LogLevel.Error) && console.error("deviceModels undefined in RackDeviceModel setFromJSON");
            return;
        }
        if (json.deviceModels.length !== this._deviceModels.length) {
            shouldLog(LogLevel.Error) && console.error(`deviceModels length mismatch in RackDeviceModel setFromJSON, got ${json.deviceModels.length} but expected ${this._deviceModels.length}`);
            return;
        }
        // Read the SceneDeviceModel last so that it isn't cleared when the other device models change (on load)
        for (let i = json.deviceModels.length - 1; i >= 0; i--) {
            this._deviceModels[i].setFromJSON(json.deviceModels[i]);
        }
        this._sceneDeviceModel = this._deviceModels.find(deviceModel => deviceModel instanceof SceneDeviceModel);
    }
    toJSON() {
        return {
            ...super.toJSON(),
            deviceModels: this._deviceModels.map(deviceModel => deviceModel.toJSON()),
            //sceneDeviceModel: this._sceneDeviceModel.toJSON()
        };
    }
    static fromJSON(json) {
        let rackDeviceModel = new RackDeviceModel();
        rackDeviceModel.setFromJSON(json);
        return rackDeviceModel;
    }
}

