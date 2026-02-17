// @ts-nocheck
export class Model {
    _on = false;
    _onOffChangedListeners = [];
    get on() {
        return this._on;
    }
    set on(on) {
        this._on = on;
        this.emitOnOffChanged(on);
    }
    addOnOffChangedListener(listener) {
        this._onOffChangedListeners.push(listener);
    }
    removeOnOffChangedListener(listener) {
        this._onOffChangedListeners = this._onOffChangedListeners.filter(l => l !== listener);
    }
    removeAllOnOffChangedListeners() {
        this._onOffChangedListeners = [];
    }
    emitOnOffChanged(on) {
        for (let listener of this._onOffChangedListeners)
            listener(this, on);
    }
    toJSON() {
        return {
            on: this.on,
        };
    }
    storeToJSON() {
        return JSON.stringify(this);
    }
    setFromJSON(json) {
        this.on = json.on ?? this.on;
    }
}

