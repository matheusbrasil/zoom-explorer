const { ipcMain } = require('electron');
const { MidiService } = require('./midi-service');
const { SettingsStore } = require('./settings-store');

const CHANNELS = {
  LIST_MIDI_PORTS: 'midi:list-ports',
  OPEN_INPUT: 'midi:open-input',
  CLOSE_INPUT: 'midi:close-input',
  OPEN_OUTPUT: 'midi:open-output',
  CLOSE_OUTPUT: 'midi:close-output',
  SEND_MIDI_MESSAGE: 'midi:send-message',
  SEND_SYSEX: 'midi:send-sysex',
  CONNECT_MIDI: 'midi:connect',
  DISCONNECT_MIDI: 'midi:disconnect',
  GET_SETTINGS: 'app:get-settings',
  SET_SETTINGS: 'app:set-settings',
  GET_APP_VERSION: 'app:get-version',
  RELAUNCH_APP: 'app:relaunch',
  MIDI_MESSAGE_EVENT: 'midi:message',
};

function isValidPortId(value) {
  return typeof value === 'string' && /^(in|out):\d+$/.test(value);
}

function assertByteArray(payload, name, { allowSystemBytes = false } = {}) {
  if (!Array.isArray(payload)) {
    throw new Error(`${name} must be an array`);
  }
  if (payload.length === 0) {
    throw new Error(`${name} must not be empty`);
  }
  if (payload.length > 8192) {
    throw new Error(`${name} too large`);
  }
  for (const byte of payload) {
    if (!Number.isInteger(byte) || byte < 0 || byte > 255) {
      throw new Error(`${name} contains invalid MIDI byte`);
    }
    if (!allowSystemBytes && byte > 0x7f) {
      throw new Error(`${name} must contain only 7-bit bytes`);
    }
  }
}

function createIpcHandlers(app) {
  const store = new SettingsStore(app);
  const midiService = new MidiService({
    onMessage: (message) => {
      for (const wc of require('electron').webContents.getAllWebContents()) {
        wc.send(CHANNELS.MIDI_MESSAGE_EVENT, message);
      }
    },
  });

  ipcMain.handle(CHANNELS.LIST_MIDI_PORTS, async () => midiService.listMidiPorts());

  ipcMain.handle(CHANNELS.OPEN_INPUT, async (_event, inPortId) => {
    if (!isValidPortId(inPortId) || !inPortId.startsWith('in:')) {
      throw new Error('Invalid input port id');
    }
    return midiService.openInput(inPortId);
  });

  ipcMain.handle(CHANNELS.CLOSE_INPUT, async (_event, inPortId) => {
    if (!isValidPortId(inPortId) || !inPortId.startsWith('in:')) {
      throw new Error('Invalid input port id');
    }
    return midiService.closeInput(inPortId);
  });

  ipcMain.handle(CHANNELS.OPEN_OUTPUT, async (_event, outPortId) => {
    if (!isValidPortId(outPortId) || !outPortId.startsWith('out:')) {
      throw new Error('Invalid output port id');
    }
    return midiService.openOutput(outPortId);
  });

  ipcMain.handle(CHANNELS.CLOSE_OUTPUT, async (_event, outPortId) => {
    if (!isValidPortId(outPortId) || !outPortId.startsWith('out:')) {
      throw new Error('Invalid output port id');
    }
    return midiService.closeOutput(outPortId);
  });

  ipcMain.handle(CHANNELS.SEND_MIDI_MESSAGE, async (_event, payload) => {
    if (typeof payload !== 'object' || payload === null) {
      throw new Error('Invalid payload');
    }
    const { outPortId, message } = payload;
    if (!isValidPortId(outPortId) || !outPortId.startsWith('out:')) {
      throw new Error('Invalid output port id');
    }
    assertByteArray(message, 'message', { allowSystemBytes: true });
    return midiService.sendMidiMessage(outPortId, message);
  });

  ipcMain.handle(CHANNELS.SEND_SYSEX, async (_event, payload) => {
    if (typeof payload !== 'object' || payload === null) {
      throw new Error('Invalid payload');
    }
    const { outPortId, sysex } = payload;
    if (!isValidPortId(outPortId) || !outPortId.startsWith('out:')) {
      throw new Error('Invalid output port id');
    }
    assertByteArray(sysex, 'sysex', { allowSystemBytes: false });
    return midiService.sendSysex(outPortId, sysex);
  });

  ipcMain.handle(CHANNELS.CONNECT_MIDI, async (_event, payload) => {
    const inPortId = payload?.inPortId;
    const outPortId = payload?.outPortId;
    if (!isValidPortId(inPortId) || !inPortId.startsWith('in:')) {
      throw new Error('Invalid input port id');
    }
    if (!isValidPortId(outPortId) || !outPortId.startsWith('out:')) {
      throw new Error('Invalid output port id');
    }
    await midiService.openInput(inPortId);
    await midiService.openOutput(outPortId);
    return { inPortId, outPortId };
  });

  ipcMain.handle(CHANNELS.DISCONNECT_MIDI, async () => {
    await midiService.disconnectAll();
    return true;
  });

  ipcMain.handle(CHANNELS.GET_SETTINGS, async () => store.getSettings());
  ipcMain.handle(CHANNELS.SET_SETTINGS, async (_event, settings) => store.setSettings(settings));
  ipcMain.handle(CHANNELS.GET_APP_VERSION, async () => app.getVersion());
  ipcMain.handle(CHANNELS.RELAUNCH_APP, async () => {
    setImmediate(() => {
      app.relaunch();
      app.exit(0);
    });
    return true;
  });
}

module.exports = {
  CHANNELS,
  createIpcHandlers,
};
