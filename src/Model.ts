export interface ModelJSON {
  on: boolean;
}

export type OnOffChangedListener = (model: Model, on: boolean) => void;

export class Model {
  private _on = false;
  private _onOffChangedListeners: OnOffChangedListener[] = [];

  public get on(): boolean {
    return this._on;
  }

  public set on(on: boolean) {
    this._on = on;
    this.emitOnOffChanged(on);
  }

  public addOnOffChangedListener(listener: OnOffChangedListener): void {
    this._onOffChangedListeners.push(listener);
  }

  public removeOnOffChangedListener(listener: OnOffChangedListener): void {
    this._onOffChangedListeners = this._onOffChangedListeners.filter((currentListener) => currentListener !== listener);
  }

  public removeAllOnOffChangedListeners(): void {
    this._onOffChangedListeners = [];
  }

  public toJSON(): ModelJSON {
    return {
      on: this.on,
    };
  }

  public storeToJSON(): string {
    return JSON.stringify(this);
  }

  public setFromJSON(json: Partial<ModelJSON>): void {
    this.on = json.on ?? this.on;
  }

  protected emitOnOffChanged(on: boolean): void {
    for (const listener of this._onOffChangedListeners) {
      listener(this, on);
    }
  }
}
