// @ts-nocheck
import { startsWithHtmlCharacter, supportsContentEditablePlaintextOnly } from "./htmltools.js";
import { shouldLog, LogLevel } from "./Logger.js";
/**
 * A HTML-representation of a Knob.
 *
 * @example
 *   <div style="--value: 70; --size: 64px; --stroke-width: 6px;" class="knob">
 *     <svg>
 *       <circle class="bg"></circle>
 *       <circle class="fg"></circle>
 *       <line x1="32px" y1="32px" x2="61px" y2="32px"></line>
 *     </svg>
 *     <label contenteditable="true">12 dB</label>
 *   </div>
 */
export class KnobView {
    _knob; // Reference to the data of the Knob that this view is displaying
    _value = 0; // internal value in the range [0..100] 
    _div;
    _svg;
    _circleFg;
    _circleBg;
    _line;
    _label;
    _size;
    _mouseDownX = 0;
    _mouseDownY = 0;
    _prevMouseX = 0;
    _prevMouseY = 0;
    _mouseDownValue = 0;
    _undoOnEscape = 0;
    _lastValidRawValue = 0;
    _muteKnobRawValueChanged = false;
    _muteBlurOnEscape = false;
    constructor(knob, hasLabel = false, className = "knob", size = 64, strokeWidth = 6, sizeUnit = "px") {
        this._knob = knob;
        this._knob.setViewListener(this._knobRawValueChanged.bind(this));
        this._value = this._calculateInternalValueFromRawValue(knob.rawValue);
        this._size = size;
        this._mouseDown = this._mouseDown.bind(this);
        this._mouseMove = this._mouseMove.bind(this);
        this._mouseUp = this._mouseUp.bind(this);
        this._touchStart = this._touchStart.bind(this);
        this._touchMove = this._touchMove.bind(this);
        this._touchEnd = this._touchEnd.bind(this);
        this._keyDown = this._keyDown.bind(this);
        this._focus = this._focus.bind(this);
        this._blur = this._blur.bind(this);
        this._labelBlur = this._labelBlur.bind(this);
        this._div = document.createElement("div");
        this._svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        this._circleBg = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        this._circleFg = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        this._line = document.createElementNS("http://www.w3.org/2000/svg", "line");
        this._div.style.setProperty("--value", this._value.toString());
        this._div.style.setProperty("--size", size + sizeUnit);
        this._div.style.setProperty("--stroke-width", strokeWidth + sizeUnit);
        //this._div.style.setProperty("--opacity", "1.0");
        this._div.classList.add(className);
        if (!this._div.hasAttribute('tabindex'))
            this._div.tabIndex = 0; // make the div focusable
        this._circleBg.classList.add("bg");
        this._circleFg.classList.add("fg");
        this._line.setAttribute('x1', size / 2 + sizeUnit);
        this._line.setAttribute('y1', size / 2 + sizeUnit);
        this._line.setAttribute('x2', (size - strokeWidth / 2) + sizeUnit);
        this._line.setAttribute('y2', size / 2 + sizeUnit);
        if (hasLabel) {
            this._label = document.createElement("label");
            this.setLabel(this._knob.valueString);
            this._label.contentEditable = supportsContentEditablePlaintextOnly() ? "plaintext-only" : "true";
            this._label.addEventListener("blur", this._labelBlur);
            // this._label.addEventListener("mousedown", (e) => { 
            //   this._label?.focus(); 
            //   e.preventDefault(); 
            // });
        }
        this._svg.appendChild(this._circleBg);
        this._svg.appendChild(this._circleFg);
        this._svg.appendChild(this._line);
        this._div.appendChild(this._svg);
        if (this._label !== undefined)
            this._div.appendChild(this._label);
        this._div.addEventListener("mousedown", this._mouseDown);
        this._div.addEventListener("touchstart", this._touchStart);
        // point as well? 
        this._div.addEventListener("keydown", this._keyDown);
        this._div.addEventListener("focus", this._focus);
        this._div.addEventListener("blur", this._blur);
        // disable accidental drag
        this._div.ondrag = () => { return false; };
        this._div.ondragenter = () => { return false; };
        this._div.ondragleave = () => { return false; };
        this._div.ondragover = () => { return false; };
        this._div.ondragstart = () => { return false; };
        this._div.ondragend = () => { return false; };
    }
    get element() {
        return this._div;
    }
    _keyDown(e) {
        shouldLog(LogLevel.Info) && console.log(`KnobView._keyDown()`);
        if (e.key === "Enter") {
            shouldLog(LogLevel.Info) && console.log("Enter");
            e.preventDefault();
            if (this._label !== undefined && this._label.textContent !== null) {
                this._lastValidRawValue = this._knob.rawValue;
                let rawValue = this._knob.getRawValueFromString(this._label.textContent);
                if (!isNaN(rawValue)) {
                    this._knob.rawValue = rawValue;
                }
                else {
                    let valueString = this._knob.getStringFromRawValue(this._lastValidRawValue);
                    this.setLabel(valueString);
                }
                this._label.blur();
                this._div.focus();
            }
            else
                this._div.blur();
        }
        else if (e.key === "Escape" || e.key === "Esc") {
            this._knob.rawValue = this._undoOnEscape;
            this._muteBlurOnEscape = true;
            this._div.blur();
            this._muteBlurOnEscape = false;
        }
        else if (e.key === "ArrowUp" || e.key === "ArrowDown" || e.key === "PageUp" || e.key === "PageDown") {
            e.preventDefault();
            if (e.key === "ArrowUp")
                this._knob.rawValue = Math.min(this._knob.max, this._knob.rawValue + 1);
            else if (e.key === "ArrowDown")
                this._knob.rawValue = Math.max(this._knob.min, this._knob.rawValue - 1);
            else if (e.key === "PageUp")
                this._knob.rawValue = Math.min(this._knob.max, this._knob.rawValue + 10);
            else if (e.key === "PageDown")
                this._knob.rawValue = Math.max(this._knob.min, this._knob.rawValue - 10);
        }
        else if (e.key.length === 1) { // Printable ASCII character, /^[\x00-\x7F]{2,}$/.test(e.key), see https://github.com/w3c/uievents/issues/264
            if (this._label && document.activeElement !== this._label) {
                this._lastValidRawValue = this._knob.rawValue;
                this._label.focus();
                this._label.textContent = "";
            }
        }
    }
    _labelBlur(e) {
        shouldLog(LogLevel.Info) && console.log("KnobView._labelBlur()");
        if (this._label !== undefined && this._label.textContent !== null) {
            this._lastValidRawValue = this._knob.rawValue;
            let rawValue = this._knob.getRawValueFromString(this._label.textContent);
            if (!isNaN(rawValue)) {
                this._knob.rawValue = rawValue;
            }
            else {
                let valueString = this._knob.getStringFromRawValue(this._lastValidRawValue);
                this.setLabel(valueString);
            }
        }
    }
    _focus(e) {
        this._undoOnEscape = this._knob.rawValue;
    }
    _blur(e) {
    }
    _addTempListeners() {
        window.addEventListener("touchmove", this._touchMove, { passive: false }); // See https://www.uriports.com/blog/easy-fix-for-unable-to-preventdefault-inside-passive-event-listener/
        window.addEventListener("mousemove", this._mouseMove);
        window.addEventListener("touchend", this._touchEnd, { passive: false });
        window.addEventListener("mouseup", this._mouseUp);
    }
    _removeTempListeners() {
        window.removeEventListener("touchmove", this._touchMove);
        window.removeEventListener("mousemove", this._mouseMove);
        window.removeEventListener("touchend", this._touchEnd);
        window.removeEventListener("mouseup", this._mouseUp);
    }
    /**
     * Stops the propagation of events, to prevent accidental selection of text or page scrolling
     * @param e event
     * @returns
     */
    _stopEventPropagation(e) {
        if (e.stopPropagation)
            e.stopPropagation();
        if (e.preventDefault)
            e.preventDefault();
    }
    _mouseDown(event) {
        let x = event.pageX;
        let y = event.pageY;
        this._down(x, y);
        let labelFocus = false;
        if (this._label !== undefined) {
            let labelRect = this._label.getBoundingClientRect();
            if (event.clientY > labelRect.top) {
                labelFocus = true;
                this._label.focus();
            }
        }
        if (!labelFocus)
            this._div.focus();
        this._stopEventPropagation(event);
    }
    _touchStart(event) {
        let x = event.touches[0].pageX;
        let y = event.touches[0].pageY;
        this._down(x, y);
        this._stopEventPropagation(event);
    }
    _mouseMove(event) {
        let x = event.pageX;
        let y = event.pageY;
        this._move(x, y);
        this._stopEventPropagation(event);
    }
    _touchMove(event) {
        let x = event.touches[0].pageX;
        let y = event.touches[0].pageY;
        this._move(x, y);
        this._stopEventPropagation(event);
    }
    _mouseUp(event) {
        let x = event.pageX;
        let y = event.pageY;
        this._up(x, y);
        this._stopEventPropagation(event);
    }
    _touchEnd(event) {
        let x = event.touches[0]?.pageX;
        x = x ?? this._prevMouseX;
        let y = event.touches[0]?.pageY;
        y = y ?? this._prevMouseY;
        this._up(x, y);
        this._stopEventPropagation(event);
    }
    _down(x, y) {
        this._mouseDownX = this._prevMouseX = x;
        this._mouseDownY = this._prevMouseY = y;
        this._mouseDownValue = this._value;
        this._addTempListeners();
    }
    _move(x, y) {
        this._prevMouseX = x;
        this._prevMouseY = y;
        this._value = this._calculateNewValue(x, y);
        this._div.style.setProperty("--value", this._value.toString());
        let newRawValue = this._knob.min + (this._knob.max - this._knob.min) * this._value / 100;
        if (newRawValue === this._knob.rawValue)
            return;
        this._muteKnobRawValueChanged = true;
        this._knob.rawValue = this._knob.min + (this._knob.max - this._knob.min) * this._value / 100;
        this._muteKnobRawValueChanged = false;
        if (this._label !== undefined)
            this.setLabel(this._knob.valueString);
    }
    _up(x, y) {
        this._value = this._calculateNewValue(x, y);
        this._div.style.setProperty("--value", this._value.toString());
        this._removeTempListeners();
    }
    _calculateNewValue(x, y) {
        let dy = this._mouseDownY - y; // y is positive down, dy is positive up
        let deadZone = 7;
        if (Math.abs(dy) < deadZone)
            return this._mouseDownValue; // mouse is too close to initial position, cancel edit
        dy = (Math.abs(dy) - deadZone) * Math.sign(dy);
        let dv = dy / (this._size * 3) * 100;
        let value = Math.max(0, Math.min(100, this._mouseDownValue + dv));
        shouldLog(LogLevel.Info) && console.log(`x: ${x}, y: ${y}, dy: ${dy}, dv: ${dv}, value: ${value}`);
        return value;
    }
    _calculateInternalValueFromRawValue(rawValue) {
        return (rawValue - this._knob.min) / (this._knob.max - this._knob.min) * 100;
    }
    _knobRawValueChanged(rawValue) {
        if (this._muteKnobRawValueChanged)
            return;
        this._value = this._calculateInternalValueFromRawValue(rawValue);
        this._div.style.setProperty("--value", this._value.toString());
        this.setLabel(this._knob.valueString);
    }
    setLabel(valueString) {
        if (this._label === undefined)
            return;
        if (startsWithHtmlCharacter(valueString))
            this._label.innerHTML = valueString;
        else
            this._label.textContent = valueString;
    }
}

