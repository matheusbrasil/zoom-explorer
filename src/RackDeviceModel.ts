import { DeviceModel } from "./DeviceModel.js";
import { LogLevel, shouldLog } from "./Logger.js";
import { SceneDeviceModel } from "./SceneDeviceModel.js";

export enum DeviceListChangeType {
  ADD = "add",
  REMOVE = "remove",
}

export type DeviceListChangedListener = (rack: RackDeviceModel, device: DeviceModel, changeType: DeviceListChangeType) => void;

interface RackDeviceModelJSON {
  on: boolean;
  deviceModels?: unknown[];
}

export class RackDeviceModel extends DeviceModel {
  private _deviceModels: DeviceModel[] = [];
  private _sceneDeviceModel: SceneDeviceModel | undefined = undefined;
  private _deviceModelToIndex = new Map<DeviceModel, number>();
  private _deviceListChangedListeners: DeviceListChangedListener[] = [];

  public constructor() {
    super(
      (_channel: number, _parameterNumber: number, rawValue: number) => rawValue.toString(),
      (_channel: number, _parameterNumber: number, parameterValueString: string) => Number.parseInt(parameterValueString, 10),
    );
  }

  public removeAllDevices(): void {
    this._deviceModels = [];
    this._deviceModelToIndex = new Map<DeviceModel, number>();
    this._sceneDeviceModel = undefined;
  }

  public addDevice(deviceModel: DeviceModel): void {
    this._deviceModelToIndex.set(deviceModel, this._deviceModels.length);
    this._deviceModels.push(deviceModel);
    if (deviceModel instanceof SceneDeviceModel) {
      this._sceneDeviceModel = deviceModel;
    }
    this.emitDeviceListChangedEvent(deviceModel, DeviceListChangeType.ADD);
  }

  public get deviceModels(): DeviceModel[] {
    return this._deviceModels;
  }

  public get sceneDeviceModel(): SceneDeviceModel | undefined {
    return this._sceneDeviceModel;
  }

  public getDeviceIndex(deviceModel: DeviceModel): number {
    const index = this._deviceModelToIndex.get(deviceModel);
    if (index === undefined) {
      shouldLog(LogLevel.Error) && console.error(`Unable to find index for device model ${deviceModel} "${deviceModel.name}"`);
      return -1;
    }
    return index;
  }

  public addDeviceListChangedListener(listener: DeviceListChangedListener): void {
    this._deviceListChangedListeners.push(listener);
  }

  public removeDeviceListChangedListener(listener: DeviceListChangedListener): void {
    this._deviceListChangedListeners = this._deviceListChangedListeners.filter((currentListener) => currentListener !== listener);
  }

  public removeAllDeviceListChangedListeners(): void {
    this._deviceListChangedListeners = [];
  }

  public storeToJSONString(): string {
    return JSON.stringify(this);
  }

  public loadFromJSONString(jsonString: string): void {
    const json = JSON.parse(jsonString) as RackDeviceModelJSON;
    this.setFromJSON(json);
  }

  public setFromJSON(json: RackDeviceModelJSON): void {
    super.setFromJSON(json);

    if (json.deviceModels === undefined) {
      shouldLog(LogLevel.Error) && console.error("deviceModels undefined in RackDeviceModel setFromJSON");
      return;
    }

    if (json.deviceModels.length !== this._deviceModels.length) {
      shouldLog(LogLevel.Error) &&
        console.error(`deviceModels length mismatch in RackDeviceModel setFromJSON, got ${json.deviceModels.length} but expected ${this._deviceModels.length}`);
      return;
    }

    for (let index = json.deviceModels.length - 1; index >= 0; index--) {
      this._deviceModels[index].setFromJSON(json.deviceModels[index]);
    }

    this._sceneDeviceModel = this._deviceModels.find((deviceModel) => deviceModel instanceof SceneDeviceModel) as
      | SceneDeviceModel
      | undefined;
  }

  public override toJSON(): ReturnType<DeviceModel["toJSON"]> & { deviceModels: unknown[] } {
    return {
      ...super.toJSON(),
      deviceModels: this._deviceModels.map((deviceModel) => deviceModel.toJSON()),
    };
  }

  public static fromJSON(json: RackDeviceModelJSON): RackDeviceModel {
    const rackDeviceModel = new RackDeviceModel();
    rackDeviceModel.setFromJSON(json);
    return rackDeviceModel;
  }

  private emitDeviceListChangedEvent(device: DeviceModel, changeType: DeviceListChangeType): void {
    for (const listener of this._deviceListChangedListeners) {
      listener(this, device, changeType);
    }
  }
}
