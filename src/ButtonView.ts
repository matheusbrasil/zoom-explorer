// @ts-nocheck
export class ButtonView {
    _button;
    _listeners = new Array();
    _buttonState = false;
    constructor(text = "", classname = "rackDeviceParameterButton") {
        this._button = document.createElement("button");
        this._button.textContent = text;
        this._button.classList.add(classname);
        this._button.dataset.text = text;
        this._button.addEventListener("mousedown", this._mouseDownHandler.bind(this));
        this._button.addEventListener("mouseup", this._mouseUpHandler.bind(this));
    }
    _mouseDownHandler(event) {
        this._buttonState = true;
        this._emitButtonStateChangedEvent(this._buttonState);
    }
    _mouseUpHandler(event) {
        this._buttonState = false;
        this._emitButtonStateChangedEvent(this._buttonState);
    }
    get element() {
        return this._button;
    }
    get state() {
        return this._buttonState;
    }
    set state(state) {
        this._buttonState = state;
        this._button.classList.toggle("active", state);
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
    _emitButtonStateChangedEvent(state) {
        for (let listener of this._listeners)
            listener(state);
    }
}

