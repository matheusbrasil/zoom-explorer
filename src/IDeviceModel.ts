// @ts-nocheck
export const IGNORE_INSTRUMENT = -1;
export const IGNORE_CHANNEL_ENABLED = true;
export const IGNORE_PARAMETER_NUMBER = -1;
export const IGNORE_PARAMETER_VALUE = -1;
export class ChannelInfo {
    name = "";
    color = "";
    enabled = true; // used as effect slot enabled for Zoom pedals
    parameterValues = new Map(); // map from parameter number to parameter value
    parameterInfo = new Map();
    // public stateValues: Map<number, number> = new Map<number, number>(); // map from state number to state value
    stateNames = new Map(); // map from state number to state name
    instrumentNumber = IGNORE_INSTRUMENT; // used as effect ID for Zoom pedals and as bank/program change for generic MIDI devices
    clear() {
        this.name = "";
        this.color = "";
        this.enabled = true;
        this.parameterValues.clear();
        this.parameterInfo.clear();
        this.stateNames.clear();
        this.instrumentNumber = IGNORE_INSTRUMENT;
    }
}

