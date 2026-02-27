import { LogLevel, shouldLog } from "./Logger.js";

export class MIDIDeviceProperties {
  public deviceAvailable = false;
  public deviceOn = false;
  public filterMuteClock = true;
  public filterMuteCC = false;
  public filterMuteNote = false;
  public inputID = "";
  public deviceName = "";
  public inputName = "";
  public outputName = "";
  public manufacturerName = "";
  public familyCode = "";
  public modelNumber = "";
  public version = "";

  public constructor(object?: Partial<MIDIDeviceProperties>) {
    if (object !== undefined) {
      Object.assign(this, object);
    }
  }

  public toJSON(): Pick<MIDIDeviceProperties, "deviceName" | "deviceOn" | "filterMuteClock" | "filterMuteCC" | "filterMuteNote"> {
    return {
      deviceName: this.deviceName,
      deviceOn: this.deviceOn,
      filterMuteClock: this.filterMuteClock,
      filterMuteCC: this.filterMuteCC,
      filterMuteNote: this.filterMuteNote,
    };
  }
}

export type DevicePropertiesOperation = "set" | "remove";
export type DevicePropertiesChangedListener = (
  model: MIDIDeviceListModel,
  deviceName: string,
  properties: MIDIDeviceProperties,
  operation: DevicePropertiesOperation,
) => void;
export type DeviceOnChangedListener = (model: MIDIDeviceListModel, deviceName: string, on: boolean) => void;
export type ShowActivityChangedListener = (model: MIDIDeviceListModel, showActivity: boolean) => void;
export type SelectedDeviceChangedListener = (model: MIDIDeviceListModel, deviceName: string) => void;

export interface MIDIDeviceListModelJSON {
  selectedDeviceName: string;
  showActivity: boolean;
  deviceProperties: Record<string, MIDIDeviceProperties>;
}

export class MIDIDeviceListModel {
  private _showActivity = false;
  private _showActivityChangedListeners: ShowActivityChangedListener[] = [];
  private _deviceProperties = new Map<string, MIDIDeviceProperties>();
  private _devicePropertiesChangedListeners: DevicePropertiesChangedListener[] = [];
  private _deviceOnChangedListeners: DeviceOnChangedListener[] = [];
  private _selectedDeviceName = "";
  private _selectedDeviceChangedListeners: SelectedDeviceChangedListener[] = [];

  public get deviceProperties(): Map<string, MIDIDeviceProperties> {
    return this._deviceProperties;
  }

  public setDeviceProperties(deviceName: string, properties: MIDIDeviceProperties): void {
    this._deviceProperties.set(deviceName, properties);
    this.emitDevicePropertiesChannelChangedEvent(deviceName, properties, "set");
  }

  public removeDevice(deviceName: string): void {
    const properties = this._deviceProperties.get(deviceName);
    if (properties === undefined) {
      shouldLog(LogLevel.Warning) && console.warn(`MIDIDeviceListModel: Attempting to remove device "${deviceName}", which is not found`);
      return;
    }

    this._deviceProperties.delete(deviceName);
    this.emitDevicePropertiesChannelChangedEvent(deviceName, properties, "remove");
  }

  public addDevicePropertiesChangedListener(listener: DevicePropertiesChangedListener): void {
    this._devicePropertiesChangedListeners.push(listener);
  }

  public removeDevicePropertiesChannelChangedListener(listener: DevicePropertiesChangedListener): void {
    this._devicePropertiesChangedListeners = this._devicePropertiesChangedListeners.filter((currentListener) => currentListener !== listener);
  }

  public removeAllDevicePropertiesChannelChangedListeners(): void {
    this._devicePropertiesChangedListeners = [];
  }

  public setDeviceOn(deviceName: string, on: boolean): void {
    const properties = this._deviceProperties.get(deviceName);
    if (properties === undefined) {
      shouldLog(LogLevel.Warning) && console.warn(`MIDIDeviceListModel: Attempting to set on state for device "${deviceName}", which is not found`);
      return;
    }

    properties.deviceOn = on;
    this.emitDeviceOnChangedEvent(deviceName, on);
  }

  public deviceIsOn(deviceName: string): boolean {
    const properties = this._deviceProperties.get(deviceName);
    if (properties === undefined) {
      shouldLog(LogLevel.Warning) && console.warn(`MIDIDeviceListModel: Attempting to get on state for device "${deviceName}", which is not found`);
      return false;
    }

    return properties.deviceOn;
  }

  public addDeviceOnChangedListener(listener: DeviceOnChangedListener): void {
    this._deviceOnChangedListeners.push(listener);
  }

  public removeDeviceOnChangedListener(listener: DeviceOnChangedListener): void {
    this._deviceOnChangedListeners = this._deviceOnChangedListeners.filter((currentListener) => currentListener !== listener);
  }

  public removeAllDeviceOnChangedListeners(): void {
    this._deviceOnChangedListeners = [];
  }

  public get showActivity(): boolean {
    return this._showActivity;
  }

  public set showActivity(value: boolean) {
    this._showActivity = value;
    this.emitShowActivityChanged(value);
  }

  public addShowActivityChangedListener(listener: ShowActivityChangedListener): void {
    this._showActivityChangedListeners.push(listener);
  }

  public removeShowActivityChangedListener(listener: ShowActivityChangedListener): void {
    this._showActivityChangedListeners = this._showActivityChangedListeners.filter((currentListener) => currentListener !== listener);
  }

  public removeAllShowActivityChangedListeners(): void {
    this._showActivityChangedListeners = [];
  }

  public get selectedDeviceName(): string {
    return this._selectedDeviceName;
  }

  public set selectedDeviceName(deviceName: string) {
    if (deviceName === this._selectedDeviceName) {
      return;
    }

    this._selectedDeviceName = deviceName;
    this.emitSelectedDeviceChanged(deviceName);
  }

  public addSelectedDeviceChangedListener(listener: SelectedDeviceChangedListener): void {
    this._selectedDeviceChangedListeners.push(listener);
  }

  public removeSelectedDeviceChangedListener(listener: SelectedDeviceChangedListener): void {
    this._selectedDeviceChangedListeners = this._selectedDeviceChangedListeners.filter((currentListener) => currentListener !== listener);
  }

  public removeAllSelectedDeviceChangedListeners(): void {
    this._selectedDeviceChangedListeners = [];
  }

  public toJSON(): MIDIDeviceListModelJSON {
    return {
      selectedDeviceName: this.selectedDeviceName,
      showActivity: this.showActivity,
      deviceProperties: Object.fromEntries(this._deviceProperties),
    };
  }

  public storeToJSON(): string {
    return JSON.stringify(this);
  }

  public setFromJSON(json: string): void {
    while (this._deviceProperties.size > 0) {
      const firstDeviceName = this._deviceProperties.keys().next().value as string | undefined;
      if (firstDeviceName === undefined) {
        break;
      }
      this.removeDevice(firstDeviceName);
    }

    const model = JSON.parse(json) as Partial<MIDIDeviceListModelJSON>;
    this.showActivity = model.showActivity ?? false;
    this.selectedDeviceName = model.selectedDeviceName ?? "";

    if (model.deviceProperties !== undefined) {
      for (const [deviceName, propertiesObject] of Object.entries(model.deviceProperties)) {
        const properties = new MIDIDeviceProperties(propertiesObject);
        this.setDeviceProperties(deviceName, properties);
      }
    }
  }

  private emitDevicePropertiesChannelChangedEvent(
    deviceName: string,
    properties: MIDIDeviceProperties,
    operation: DevicePropertiesOperation,
  ): void {
    this._devicePropertiesChangedListeners.forEach((listener) => listener(this, deviceName, properties, operation));
  }

  private emitDeviceOnChangedEvent(deviceName: string, on: boolean): void {
    this._deviceOnChangedListeners.forEach((listener) => listener(this, deviceName, on));
  }

  private emitShowActivityChanged(showActivity: boolean): void {
    for (const listener of this._showActivityChangedListeners) {
      listener(this, showActivity);
    }
  }

  private emitSelectedDeviceChanged(deviceName: string): void {
    this._selectedDeviceChangedListeners.forEach((listener) => listener(this, deviceName));
  }
}
