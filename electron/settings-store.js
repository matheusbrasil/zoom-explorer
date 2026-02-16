const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_SETTINGS = {
  selectedMidiInPortId: '',
  selectedMidiOutPortId: '',
  sysexEnabled: true,
  theme: 'system',
  ui: {},
  deviceProfiles: {},
};

class SettingsStore {
  constructor(app) {
    this.filePath = path.join(app.getPath('userData'), 'settings.json');
  }

  readFile() {
    try {
      const json = fs.readFileSync(this.filePath, 'utf8');
      return JSON.parse(json);
    } catch (_error) {
      return {};
    }
  }

  writeFile(settings) {
    const dir = path.dirname(this.filePath);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(this.filePath, JSON.stringify(settings, null, 2), 'utf8');
  }

  getSettings() {
    return {
      ...DEFAULT_SETTINGS,
      ...this.readFile(),
    };
  }

  setSettings(partialSettings) {
    if (typeof partialSettings !== 'object' || partialSettings === null) {
      throw new Error('Invalid settings payload');
    }
    const next = {
      ...this.getSettings(),
      ...partialSettings,
    };
    this.writeFile(next);
    return next;
  }
}

module.exports = {
  SettingsStore,
};
