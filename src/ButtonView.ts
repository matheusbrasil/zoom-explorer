export type ButtonViewListener = (state: boolean) => void;

export class ButtonView {
  private readonly _button: HTMLButtonElement;
  private _listeners: ButtonViewListener[] = [];
  private _buttonState = false;

  public constructor(text = "", classname = "rackDeviceParameterButton") {
    this._button = document.createElement("button");
    this._button.textContent = text;
    this._button.classList.add(classname);
    this._button.dataset.text = text;
    this._button.addEventListener("mousedown", this._mouseDownHandler.bind(this));
    this._button.addEventListener("mouseup", this._mouseUpHandler.bind(this));
  }

  public get element(): HTMLButtonElement {
    return this._button;
  }

  public get state(): boolean {
    return this._buttonState;
  }

  public set state(state: boolean) {
    this._buttonState = state;
    this._button.classList.toggle("active", state);
  }

  public addListener(listener: ButtonViewListener): void {
    this._listeners.push(listener);
  }

  public removeListener(listener: ButtonViewListener): void {
    const index = this._listeners.indexOf(listener);
    if (index !== -1) {
      this._listeners.splice(index, 1);
    }
  }

  public removeAllListeners(): void {
    this._listeners = [];
  }

  private _mouseDownHandler(_event: MouseEvent): void {
    this._buttonState = true;
    this._emitButtonStateChangedEvent(this._buttonState);
  }

  private _mouseUpHandler(_event: MouseEvent): void {
    this._buttonState = false;
    this._emitButtonStateChangedEvent(this._buttonState);
  }

  private _emitButtonStateChangedEvent(state: boolean): void {
    for (const listener of this._listeners) {
      listener(state);
    }
  }
}
