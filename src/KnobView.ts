import { startsWithHtmlCharacter, supportsContentEditablePlaintextOnly } from "./htmltools.js";
import { LogLevel, shouldLog } from "./Logger.js";
import { Knob } from "./Knob.js";

/**
 * A HTML-representation of a Knob.
 */
export class KnobView {
  private readonly _knob: Knob;
  private _value = 0;
  private readonly _div: HTMLDivElement;
  private readonly _svg: SVGSVGElement;
  private readonly _circleFg: SVGCircleElement;
  private readonly _circleBg: SVGCircleElement;
  private readonly _line: SVGLineElement;
  private readonly _label: HTMLLabelElement | undefined;
  private readonly _size: number;
  private _mouseDownX = 0;
  private _mouseDownY = 0;
  private _prevMouseX = 0;
  private _prevMouseY = 0;
  private _mouseDownValue = 0;
  private _undoOnEscape = 0;
  private _lastValidRawValue = 0;
  private _muteKnobRawValueChanged = false;
  private _muteBlurOnEscape = false;

  public constructor(knob: Knob, hasLabel = false, className = "knob", size = 64, strokeWidth = 6, sizeUnit = "px") {
    this._knob = knob;
    this._knob.setViewListener(this._knobRawValueChanged);
    this._value = this._calculateInternalValueFromRawValue(knob.rawValue);
    this._size = size;

    this._div = document.createElement("div");
    this._svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    this._circleBg = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    this._circleFg = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    this._line = document.createElementNS("http://www.w3.org/2000/svg", "line");

    this._div.style.setProperty("--value", this._value.toString());
    this._div.style.setProperty("--size", `${size}${sizeUnit}`);
    this._div.style.setProperty("--stroke-width", `${strokeWidth}${sizeUnit}`);
    this._div.classList.add(className);
    if (!this._div.hasAttribute("tabindex")) {
      this._div.tabIndex = 0;
    }

    this._circleBg.classList.add("bg");
    this._circleFg.classList.add("fg");
    this._line.setAttribute("x1", `${size / 2}${sizeUnit}`);
    this._line.setAttribute("y1", `${size / 2}${sizeUnit}`);
    this._line.setAttribute("x2", `${size - strokeWidth / 2}${sizeUnit}`);
    this._line.setAttribute("y2", `${size / 2}${sizeUnit}`);

    if (hasLabel) {
      const label = document.createElement("label");
      this._label = label;
      this.setLabel(this._knob.valueString);
      label.contentEditable = supportsContentEditablePlaintextOnly() ? "plaintext-only" : "true";
      label.addEventListener("blur", this._labelBlur);
    } else {
      this._label = undefined;
    }

    this._svg.appendChild(this._circleBg);
    this._svg.appendChild(this._circleFg);
    this._svg.appendChild(this._line);
    this._div.appendChild(this._svg);
    if (this._label !== undefined) {
      this._div.appendChild(this._label);
    }

    this._div.addEventListener("mousedown", this._mouseDown);
    this._div.addEventListener("touchstart", this._touchStart);
    this._div.addEventListener("keydown", this._keyDown);
    this._div.addEventListener("focus", this._focus);
    this._div.addEventListener("blur", this._blur);

    this._div.ondrag = () => false;
    this._div.ondragenter = () => false;
    this._div.ondragleave = () => false;
    this._div.ondragover = () => false;
    this._div.ondragstart = () => false;
    this._div.ondragend = () => false;
  }

  public get element(): HTMLDivElement {
    return this._div;
  }

  public setLabel(valueString: string): void {
    if (this._label === undefined) {
      return;
    }

    if (startsWithHtmlCharacter(valueString)) {
      this._label.innerHTML = valueString;
    } else {
      this._label.textContent = valueString;
    }
  }

  private readonly _keyDown = (event: KeyboardEvent): void => {
    shouldLog(LogLevel.Info) && console.log("KnobView._keyDown()");

    if (event.key === "Enter") {
      shouldLog(LogLevel.Info) && console.log("Enter");
      event.preventDefault();
      if (this._label !== undefined && this._label.textContent !== null) {
        this._lastValidRawValue = this._knob.rawValue;
        const rawValue = this._knob.getRawValueFromString(this._label.textContent);
        if (!Number.isNaN(rawValue)) {
          this._knob.rawValue = rawValue;
        } else {
          this.setLabel(this._knob.getStringFromRawValue(this._lastValidRawValue));
        }
        this._label.blur();
        this._div.focus();
      } else {
        this._div.blur();
      }
      return;
    }

    if (event.key === "Escape" || event.key === "Esc") {
      this._knob.rawValue = this._undoOnEscape;
      this._muteBlurOnEscape = true;
      this._div.blur();
      this._muteBlurOnEscape = false;
      return;
    }

    if (event.key === "ArrowUp" || event.key === "ArrowDown" || event.key === "PageUp" || event.key === "PageDown") {
      event.preventDefault();
      if (event.key === "ArrowUp") {
        this._knob.rawValue = Math.min(this._knob.max, this._knob.rawValue + 1);
      } else if (event.key === "ArrowDown") {
        this._knob.rawValue = Math.max(this._knob.min, this._knob.rawValue - 1);
      } else if (event.key === "PageUp") {
        this._knob.rawValue = Math.min(this._knob.max, this._knob.rawValue + 10);
      } else if (event.key === "PageDown") {
        this._knob.rawValue = Math.max(this._knob.min, this._knob.rawValue - 10);
      }
      return;
    }

    if (event.key.length === 1 && this._label !== undefined && document.activeElement !== this._label) {
      this._lastValidRawValue = this._knob.rawValue;
      this._label.focus();
      this._label.textContent = "";
    }
  };

  private readonly _labelBlur = (_event: FocusEvent): void => {
    shouldLog(LogLevel.Info) && console.log("KnobView._labelBlur()");
    if (this._label === undefined || this._label.textContent === null) {
      return;
    }

    this._lastValidRawValue = this._knob.rawValue;
    const rawValue = this._knob.getRawValueFromString(this._label.textContent);
    if (!Number.isNaN(rawValue)) {
      this._knob.rawValue = rawValue;
    } else {
      this.setLabel(this._knob.getStringFromRawValue(this._lastValidRawValue));
    }
  };

  private readonly _focus = (_event: FocusEvent): void => {
    this._undoOnEscape = this._knob.rawValue;
  };

  private readonly _blur = (_event: FocusEvent): void => {
    if (this._muteBlurOnEscape) {
      return;
    }
  };

  private readonly _mouseDown = (event: MouseEvent): void => {
    this._down(event.pageX, event.pageY);

    let labelFocus = false;
    if (this._label !== undefined) {
      const labelRect = this._label.getBoundingClientRect();
      if (event.clientY > labelRect.top) {
        labelFocus = true;
        this._label.focus();
      }
    }

    if (!labelFocus) {
      this._div.focus();
    }

    this._stopEventPropagation(event);
  };

  private readonly _touchStart = (event: TouchEvent): void => {
    const touch = event.touches[0];
    if (touch === undefined) {
      return;
    }

    this._down(touch.pageX, touch.pageY);
    this._stopEventPropagation(event);
  };

  private readonly _mouseMove = (event: MouseEvent): void => {
    this._move(event.pageX, event.pageY);
    this._stopEventPropagation(event);
  };

  private readonly _touchMove = (event: TouchEvent): void => {
    const touch = event.touches[0];
    if (touch === undefined) {
      return;
    }

    this._move(touch.pageX, touch.pageY);
    this._stopEventPropagation(event);
  };

  private readonly _mouseUp = (event: MouseEvent): void => {
    this._up(event.pageX, event.pageY);
    this._stopEventPropagation(event);
  };

  private readonly _touchEnd = (event: TouchEvent): void => {
    const touch = event.changedTouches[0];
    const x = touch?.pageX ?? this._prevMouseX;
    const y = touch?.pageY ?? this._prevMouseY;
    this._up(x, y);
    this._stopEventPropagation(event);
  };

  private readonly _knobRawValueChanged = (rawValue: number): void => {
    if (this._muteKnobRawValueChanged) {
      return;
    }

    this._value = this._calculateInternalValueFromRawValue(rawValue);
    this._div.style.setProperty("--value", this._value.toString());
    this.setLabel(this._knob.valueString);
  };

  private _addTempListeners(): void {
    window.addEventListener("touchmove", this._touchMove, { passive: false });
    window.addEventListener("mousemove", this._mouseMove);
    window.addEventListener("touchend", this._touchEnd, { passive: false });
    window.addEventListener("mouseup", this._mouseUp);
  }

  private _removeTempListeners(): void {
    window.removeEventListener("touchmove", this._touchMove);
    window.removeEventListener("mousemove", this._mouseMove);
    window.removeEventListener("touchend", this._touchEnd);
    window.removeEventListener("mouseup", this._mouseUp);
  }

  private _stopEventPropagation(event: Event): void {
    event.stopPropagation();
    event.preventDefault();
  }

  private _down(x: number, y: number): void {
    this._mouseDownX = x;
    this._prevMouseX = x;
    this._mouseDownY = y;
    this._prevMouseY = y;
    this._mouseDownValue = this._value;
    this._addTempListeners();
  }

  private _move(x: number, y: number): void {
    this._prevMouseX = x;
    this._prevMouseY = y;
    this._value = this._calculateNewValue(x, y);
    this._div.style.setProperty("--value", this._value.toString());

    const newRawValue = this._knob.min + ((this._knob.max - this._knob.min) * this._value) / 100;
    if (newRawValue === this._knob.rawValue) {
      return;
    }

    this._muteKnobRawValueChanged = true;
    this._knob.rawValue = newRawValue;
    this._muteKnobRawValueChanged = false;

    if (this._label !== undefined) {
      this.setLabel(this._knob.valueString);
    }
  }

  private _up(x: number, y: number): void {
    this._value = this._calculateNewValue(x, y);
    this._div.style.setProperty("--value", this._value.toString());
    this._removeTempListeners();
  }

  private _calculateNewValue(x: number, y: number): number {
    let dy = this._mouseDownY - y;
    const deadZone = 7;
    if (Math.abs(dy) < deadZone) {
      return this._mouseDownValue;
    }

    dy = (Math.abs(dy) - deadZone) * Math.sign(dy);
    const dv = (dy / (this._size * 3)) * 100;
    const value = Math.max(0, Math.min(100, this._mouseDownValue + dv));
    shouldLog(LogLevel.Info) && console.log(`x: ${x}, y: ${y}, dy: ${dy}, dv: ${dv}, value: ${value}`);
    return value;
  }

  private _calculateInternalValueFromRawValue(rawValue: number): number {
    const range = this._knob.max - this._knob.min;
    if (range === 0) {
      return 0;
    }
    return ((rawValue - this._knob.min) / range) * 100;
  }
}
