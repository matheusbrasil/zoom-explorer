import { IManagedMIDIDevice } from "./IManagedMIDIDevice.js";
import { LogLevel, shouldLog } from "./Logger.js";
import { MIDIDeviceManager } from "./MIDIDeviceManager.js";
import { MIDIDeviceListHTMLView } from "./MIDIDeviceListHTMLView.js";
import { MIDIDeviceListModel, MIDIDeviceProperties } from "./MIDIDeviceListModel.js";
import { DeviceID, IMIDIProxy } from "./midiproxy.js";
import { ALL_MIDI_DEVICES } from "./midiproxy.js";
import { bytesToHexString } from "./tools.js";
import { ZoomDevice } from "./ZoomDevice.js";

export class MIDIDeviceListController {
  private readonly _model: MIDIDeviceListModel;
  private readonly _view: MIDIDeviceListHTMLView;
  private readonly _midi: IMIDIProxy;
  private readonly _midiDeviceManager: MIDIDeviceManager;

  public constructor(model: MIDIDeviceListModel, view: MIDIDeviceListHTMLView, midi: IMIDIProxy, midiDeviceManager: MIDIDeviceManager) {
    this._model = model;
    this._model.addDevicePropertiesChangedListener(this.devicePropertiesChanged.bind(this));
    this._view = view;
    this._midi = midi;
    this._midiDeviceManager = midiDeviceManager;
    this._midiDeviceManager.addConnectListener(this.midiDeviceConnected.bind(this));
    this._midiDeviceManager.addDisconnectListener(this.midiDeviceDisconnected.bind(this));
    this._midi.addListener(ALL_MIDI_DEVICES, this.onMIDIMessageFromAnyDevice.bind(this));
  }

  public onMIDIMessageFromAnyDevice(deviceInputID: DeviceID, message: Uint8Array): void {
    if (!this._view.enabled) {
      return;
    }

    this._view.updateMIDIDevicesTableActivity(deviceInputID, message);
  }

  public devicePropertiesChanged(
    _model: MIDIDeviceListModel,
    _deviceName: string,
    _settings: MIDIDeviceProperties,
    _operation: "set" | "remove",
  ): void {
    // React to device on/off state changes by opening / closing devices in a later refactor.
  }

  public midiDeviceConnected(_deviceManager: MIDIDeviceManager, device: IManagedMIDIDevice, _key: string): void {
    const deviceName = device.deviceName;
    let properties = this._model.deviceProperties.get(deviceName);
    const deviceExisted = properties !== undefined;

    properties = properties ?? new MIDIDeviceProperties();
    properties.inputID = device.deviceInfo.inputID;
    properties.deviceName = deviceName;
    properties.inputName = device.deviceInfo.inputName;
    properties.outputName = device.deviceInfo.outputName;
    properties.manufacturerName = device.deviceInfo.manufacturerName;
    properties.familyCode = bytesToHexString(device.deviceInfo.familyCode, " ");
    properties.modelNumber = bytesToHexString(device.deviceInfo.modelNumber, " ");
    properties.version =
      device.deviceInfo.manufacturerID[0] === 0x52
        ? ZoomDevice.getZoomVersionNumber(device.deviceInfo.versionNumber).toString()
        : bytesToHexString(device.deviceInfo.versionNumber, " ");
    properties.deviceAvailable = true;
    properties.deviceOn = deviceExisted ? properties.deviceOn : true;

    this._model.setDeviceProperties(deviceName, properties);
  }

  public midiDeviceDisconnected(_deviceManager: MIDIDeviceManager, device: IManagedMIDIDevice, _key: string): void {
    const deviceName = device.deviceName;
    const properties = this._model.deviceProperties.get(deviceName);

    if (properties === undefined) {
      shouldLog(LogLevel.Error) && console.error(`Disconnected MIDI device "${deviceName}" was not in device list`);
      return;
    }

    properties.deviceAvailable = false;
    this._model.setDeviceProperties(deviceName, properties);
  }
}
