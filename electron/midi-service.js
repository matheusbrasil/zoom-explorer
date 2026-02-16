class MidiService {
  constructor({ onMessage }) {
    this.onMessage = onMessage;
    this.openInputs = new Map();
    this.openOutputs = new Map();
    this.midiModule = this.loadMidiModule();
    this.lastPortSignature = '';
  }

  loadMidiModule() {
    try {
      return require('midi');
    } catch (error) {
      console.warn(`[midi-service] Native MIDI module unavailable: ${error?.message ?? String(error)}`);
      return null;
    }
  }

  assertAvailable() {
    if (this.midiModule === null) {
      throw new Error('MIDI backend unavailable. Install the "midi" package to use main-process MIDI.');
    }
  }

  parsePortId(id, type) {
    const parts = id.split(':');
    if (parts.length !== 2 || parts[0] !== type || Number.isNaN(Number(parts[1]))) {
      throw new Error(`Invalid ${type} port id: ${id}`);
    }
    return Number(parts[1]);
  }

  listMidiPorts() {
    this.assertAvailable();
    const inputProbe = new this.midiModule.Input();
    const outputProbe = new this.midiModule.Output();

    this.cleanupStaleOpenPorts(inputProbe, outputProbe);

    const inputs = [];
    for (let i = 0; i < inputProbe.getPortCount(); i += 1) {
      inputs.push({
        id: `in:${i}`,
        name: inputProbe.getPortName(i),
        state: 'connected',
        connection: this.openInputs.has(`in:${i}`) ? 'open' : 'closed',
      });
    }

    const outputs = [];
    for (let i = 0; i < outputProbe.getPortCount(); i += 1) {
      outputs.push({
        id: `out:${i}`,
        name: outputProbe.getPortName(i),
        state: 'connected',
        connection: this.openOutputs.has(`out:${i}`) ? 'open' : 'closed',
      });
    }

    if (typeof inputProbe.closePort === 'function') {
      inputProbe.closePort();
    }
    if (typeof outputProbe.closePort === 'function') {
      outputProbe.closePort();
    }

    const signature = JSON.stringify({
      inputs: inputs.map((p) => p.name),
      outputs: outputs.map((p) => p.name),
    });
    if (signature !== this.lastPortSignature) {
      this.lastPortSignature = signature;
      // Intentionally log in main process to aid hotplug diagnostics in terminal.
      console.log(`[midi-service] Ports changed: inputs=${inputs.length}, outputs=${outputs.length}`);
      if (inputs.length > 0) {
        console.log(`[midi-service] Inputs: ${inputs.map((p) => p.name).join(' | ')}`);
      }
      if (outputs.length > 0) {
        console.log(`[midi-service] Outputs: ${outputs.map((p) => p.name).join(' | ')}`);
      }
    }

    return { inputs, outputs };
  }

  openInput(inPortId) {
    this.assertAvailable();
    const index = this.parsePortId(inPortId, 'in');
    const expectedName = this.getPortNameByIndex('in', index);
    const existing = this.openInputs.get(inPortId);
    if (existing) {
      if (existing.name === expectedName) {
        return inPortId;
      }
      this.safeClosePort(existing.port);
      this.openInputs.delete(inPortId);
    }

    const input = new this.midiModule.Input();
    input.ignoreTypes(false, false, false);
    input.on('message', (deltaTime, message) => {
      this.onMessage({
        inPortId,
        data: Array.from(message),
        timeStamp: Date.now() + deltaTime * 1000,
      });
    });
    input.openPort(index);
    this.openInputs.set(inPortId, { port: input, name: expectedName });
    return inPortId;
  }

  closeInput(inPortId) {
    const entry = this.openInputs.get(inPortId);
    if (entry) {
      this.safeClosePort(entry.port);
      this.openInputs.delete(inPortId);
    }
    return inPortId;
  }

  openOutput(outPortId) {
    this.assertAvailable();
    const index = this.parsePortId(outPortId, 'out');
    const expectedName = this.getPortNameByIndex('out', index);
    const existing = this.openOutputs.get(outPortId);
    if (existing) {
      if (existing.name === expectedName) {
        return outPortId;
      }
      this.safeClosePort(existing.port);
      this.openOutputs.delete(outPortId);
    }

    const output = new this.midiModule.Output();
    output.openPort(index);
    this.openOutputs.set(outPortId, { port: output, name: expectedName });
    return outPortId;
  }

  closeOutput(outPortId) {
    const entry = this.openOutputs.get(outPortId);
    if (entry) {
      this.safeClosePort(entry.port);
      this.openOutputs.delete(outPortId);
    }
    return outPortId;
  }

  sendMidiMessage(outPortId, message) {
    const entry = this.openOutputs.get(outPortId);
    if (!entry) {
      throw new Error(`Output ${outPortId} is not open`);
    }
    entry.port.sendMessage(message);
    return true;
  }

  sendSysex(outPortId, sysexPayload) {
    const entry = this.openOutputs.get(outPortId);
    if (!entry) {
      throw new Error(`Output ${outPortId} is not open`);
    }
    entry.port.sendMessage([0xf0, ...sysexPayload, 0xf7]);
    return true;
  }

  async disconnectAll() {
    for (const inPortId of Array.from(this.openInputs.keys())) {
      this.closeInput(inPortId);
    }
    for (const outPortId of Array.from(this.openOutputs.keys())) {
      this.closeOutput(outPortId);
    }
  }

  getPortNameByIndex(type, index) {
    const probe = type === 'in' ? new this.midiModule.Input() : new this.midiModule.Output();
    try {
      if (index < 0 || index >= probe.getPortCount()) {
        throw new Error(`Invalid ${type} port index: ${index}`);
      }
      return probe.getPortName(index);
    } finally {
      this.safeClosePort(probe);
    }
  }

  cleanupStaleOpenPorts(inputProbe, outputProbe) {
    for (const [inPortId, entry] of Array.from(this.openInputs.entries())) {
      let keep = true;
      try {
        const index = this.parsePortId(inPortId, 'in');
        if (index < 0 || index >= inputProbe.getPortCount()) {
          keep = false;
        } else if (inputProbe.getPortName(index) !== entry.name) {
          keep = false;
        }
      } catch (_error) {
        keep = false;
      }
      if (!keep) {
        this.safeClosePort(entry.port);
        this.openInputs.delete(inPortId);
      }
    }

    for (const [outPortId, entry] of Array.from(this.openOutputs.entries())) {
      let keep = true;
      try {
        const index = this.parsePortId(outPortId, 'out');
        if (index < 0 || index >= outputProbe.getPortCount()) {
          keep = false;
        } else if (outputProbe.getPortName(index) !== entry.name) {
          keep = false;
        }
      } catch (_error) {
        keep = false;
      }
      if (!keep) {
        this.safeClosePort(entry.port);
        this.openOutputs.delete(outPortId);
      }
    }
  }

  safeClosePort(port) {
    if (port && typeof port.closePort === 'function') {
      try {
        port.closePort();
      } catch (_error) {
        // Ignore close errors from stale OS handles.
      }
    }
  }
}

module.exports = {
  MidiService,
};
