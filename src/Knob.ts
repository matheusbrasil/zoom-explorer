/**
 * The data representation of a knob.
 * Should perhaps be renamed to "KnobModel".
 */
export type KnobValueParser = (valueString: string) => number;
export type KnobValueFormatter = (rawValue: number) => string;
export type KnobValueListener = (rawValue: number) => void;

export class Knob {
  private _listeners: KnobValueListener[] = [];
  private _viewListener: KnobValueListener | undefined = undefined;
  private _rawValue = 0;
  private _valueString = "0";
  private _min = 0;
  private _max = 0;
  private _isInteger = false;
  public getRawValueFromString: KnobValueParser = () => 0;
  public getStringFromRawValue: KnobValueFormatter = () => "0";

  public constructor(
    rawValue: number,
    min: number,
    max: number,
    getRawValueFromString: KnobValueParser,
    getStringFromRawValue: KnobValueFormatter,
    isInteger = false,
  ) {
    this.reset(rawValue, min, max, getRawValueFromString, getStringFromRawValue, isInteger, true);
  }

  public reset(
    rawValue: number,
    min: number,
    max: number,
    getRawValueFromString?: KnobValueParser,
    getStringFromRawValue?: KnobValueFormatter,
    isInteger = false,
    mute = false,
  ): void {
    if (getRawValueFromString !== undefined) {
      this.getRawValueFromString = getRawValueFromString;
    }
    if (getStringFromRawValue !== undefined) {
      this.getStringFromRawValue = getStringFromRawValue;
    }

    this._min = min;
    this._max = max;
    this._isInteger = isInteger;
    this.setRawValue(rawValue, mute);
  }

  public get min(): number {
    return this._min;
  }

  public get max(): number {
    return this._max;
  }

  public get rawValue(): number {
    return this._rawValue;
  }

  public get valueString(): string {
    return this._valueString;
  }

  public set rawValue(rawValue: number) {
    this.setRawValue(rawValue);
  }

  public setRawValue(rawValue: number, mute = false): void {
    const normalizedRawValue = this._isInteger ? Math.round(rawValue) : rawValue;
    if (normalizedRawValue === this._rawValue) {
      return;
    }

    this._rawValue = normalizedRawValue;
    this._valueString = this.getStringFromRawValue(normalizedRawValue);
    this._emitValueChangedEvent(normalizedRawValue, mute);
  }

  public setViewListener(listener: KnobValueListener): void {
    this._viewListener = listener;
  }

  public addListener(listener: KnobValueListener): void {
    this._listeners.push(listener);
  }

  public removeListener(listener: KnobValueListener): void {
    const index = this._listeners.indexOf(listener);
    if (index !== -1) {
      this._listeners.splice(index, 1);
    }
  }

  public removeAllListeners(): void {
    this._listeners = [];
  }

  private _emitValueChangedEvent(rawValue: number, muteAllButKnobView = false): void {
    this._viewListener?.(rawValue);
    if (muteAllButKnobView) {
      return;
    }

    for (const listener of this._listeners) {
      listener(rawValue);
    }
  }
}
