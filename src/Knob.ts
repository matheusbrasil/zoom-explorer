// @ts-nocheck
/**
 * The data representation of a knob.
 * Should perhaps be renamed to "KnobModel".
 * ... or perhaps it should never been a model, just a KnobView that also holds the data?
 * ... but it would be nice if knobs worked without a GUI, for later, think Wavestate and knobs as both source and target
 */
export class Knob {
    _listeners = new Array();
    _viewListener = undefined; // needed to avoid notification loops
    _rawValue = 0;
    _valueString = "0";
    _min = 0;
    _max = 0;
    _isInteger = false;
    getRawValueFromString = () => 0;
    getStringFromRawValue = () => "0";
    constructor(rawValue, min, max, getRawValueFromString, getStringFromRawValue, isInteger = false) {
        this.reset(rawValue, min, max, getRawValueFromString, getStringFromRawValue, isInteger, true);
    }
    reset(rawValue, min, max, getRawValueFromString, getStringFromRawValue, isInteger = false, mute = false) {
        if (getRawValueFromString !== undefined)
            this.getRawValueFromString = getRawValueFromString;
        if (getStringFromRawValue !== undefined)
            this.getStringFromRawValue = getStringFromRawValue;
        this._min = min;
        this._max = max;
        this._isInteger = isInteger;
        this.setRawValue(rawValue, mute);
    }
    get min() {
        return this._min;
    }
    get max() {
        return this._max;
    }
    get rawValue() {
        return this._rawValue;
    }
    get valueString() {
        return this._valueString;
    }
    set rawValue(rawValue) {
        this.setRawValue(rawValue);
    }
    setRawValue(rawValue, mute = false) {
        if (this._isInteger)
            rawValue = Math.round(rawValue);
        if (rawValue === this._rawValue)
            return;
        this._rawValue = rawValue;
        this._valueString = this.getStringFromRawValue(rawValue);
        this._emitValueChangedEvent(rawValue, mute);
    }
    setViewListener(listener) {
        this._viewListener = listener;
    }
    addListener(listener) {
        this._listeners.push(listener);
    }
    removeListener(listener) {
        let index = this._listeners.indexOf(listener);
        if (index !== -1)
            this._listeners.splice(index, 1);
    }
    removeAllListeners() {
        this._listeners = new Array();
    }
    _emitValueChangedEvent(rawValue, muteAllButKnobView = false) {
        if (this._viewListener !== undefined)
            this._viewListener(rawValue);
        if (muteAllButKnobView)
            return;
        for (let listener of this._listeners) {
            listener(rawValue);
        }
    }
}

