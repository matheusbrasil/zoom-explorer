class MidiService {
  constructor({ onMessage }) {
    this.onMessage = onMessage;
    this.openInputs = new Map();
    this.openOutputs = new Map();
    this.midiModule = this.loadMidiModule();
  }

  loadMidiModule() {
    try {
      return require('midi');
    } catch (_error) {
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

    return { inputs, outputs };
  }

  openInput(inPortId) {
    this.assertAvailable();
    if (this.openInputs.has(inPortId)) {
      return inPortId;
    }
    const index = this.parsePortId(inPortId, 'in');
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
    this.openInputs.set(inPortId, input);
    return inPortId;
  }

  closeInput(inPortId) {
    const input = this.openInputs.get(inPortId);
    if (input) {
      input.closePort();
      this.openInputs.delete(inPortId);
    }
    return inPortId;
  }

  openOutput(outPortId) {
    this.assertAvailable();
    if (this.openOutputs.has(outPortId)) {
      return outPortId;
    }
    const index = this.parsePortId(outPortId, 'out');
    const output = new this.midiModule.Output();
    output.openPort(index);
    this.openOutputs.set(outPortId, output);
    return outPortId;
  }

  closeOutput(outPortId) {
    const output = this.openOutputs.get(outPortId);
    if (output) {
      output.closePort();
      this.openOutputs.delete(outPortId);
    }
    return outPortId;
  }

  sendMidiMessage(outPortId, message) {
    const output = this.openOutputs.get(outPortId);
    if (!output) {
      throw new Error(`Output ${outPortId} is not open`);
    }
    output.sendMessage(message);
    return true;
  }

  sendSysex(outPortId, sysexPayload) {
    const output = this.openOutputs.get(outPortId);
    if (!output) {
      throw new Error(`Output ${outPortId} is not open`);
    }
    output.sendMessage([0xf0, ...sysexPayload, 0xf7]);
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
}

module.exports = {
  MidiService,
};
