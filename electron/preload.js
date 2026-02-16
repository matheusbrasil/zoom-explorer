const { contextBridge, ipcRenderer } = require('electron');
// Keep channel names local to preload so it works in sandboxed renderers.
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

contextBridge.exposeInMainWorld('zoomExplorerAPI', {
  listMidiPorts: () => ipcRenderer.invoke(CHANNELS.LIST_MIDI_PORTS),
  openInput: (inPortId) => ipcRenderer.invoke(CHANNELS.OPEN_INPUT, inPortId),
  closeInput: (inPortId) => ipcRenderer.invoke(CHANNELS.CLOSE_INPUT, inPortId),
  openOutput: (outPortId) => ipcRenderer.invoke(CHANNELS.OPEN_OUTPUT, outPortId),
  closeOutput: (outPortId) => ipcRenderer.invoke(CHANNELS.CLOSE_OUTPUT, outPortId),
  connectMidi: ({ inPortId, outPortId }) => ipcRenderer.invoke(CHANNELS.CONNECT_MIDI, { inPortId, outPortId }),
  disconnectMidi: () => ipcRenderer.invoke(CHANNELS.DISCONNECT_MIDI),
  sendMidiMessage: ({ outPortId, message }) => ipcRenderer.invoke(CHANNELS.SEND_MIDI_MESSAGE, { outPortId, message }),
  sendSysex: ({ outPortId, sysex }) => ipcRenderer.invoke(CHANNELS.SEND_SYSEX, { outPortId, sysex }),
  onMidiMessage: (callback) => {
    const wrapped = (_event, payload) => callback(payload);
    ipcRenderer.on(CHANNELS.MIDI_MESSAGE_EVENT, wrapped);
    return () => ipcRenderer.removeListener(CHANNELS.MIDI_MESSAGE_EVENT, wrapped);
  },
  getSettings: () => ipcRenderer.invoke(CHANNELS.GET_SETTINGS),
  setSettings: (settings) => ipcRenderer.invoke(CHANNELS.SET_SETTINGS, settings),
  getAppVersion: () => ipcRenderer.invoke(CHANNELS.GET_APP_VERSION),
  relaunchApp: () => ipcRenderer.invoke(CHANNELS.RELAUNCH_APP),
});
