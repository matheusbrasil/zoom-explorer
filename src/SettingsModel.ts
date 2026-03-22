export type SettingsPropertyName =
  | ""
  | "performanceMode"
  | "logging"
  | "performanceStatistics"
  | "experimentalPlayground";

export interface SettingsModelChangeEvent {
  propertyName: SettingsPropertyName;
}

export interface SettingsModelJSON {
  performanceMode: boolean;
  logging: boolean;
  performanceStatistics: boolean;
  experimentalPlayground: boolean;
}

export type SettingsModelListener = (event: SettingsModelChangeEvent) => void;

function isBoolean(value: unknown): value is boolean {
  return typeof value === "boolean";
}

export class SettingsModel {
  private readonly _eventListeners = new Map<SettingsPropertyName, SettingsModelListener[]>();
  private _performanceMode = false;
  private _logging = false;
  private _performanceStatistics = false;
  private _experimentalPlayground = false;

  public addPropertyChangedListener(propertyName: SettingsPropertyName, listener: SettingsModelListener): void {
    const listeners = this._eventListeners.get(propertyName) ?? [];
    listeners.push(listener);
    this._eventListeners.set(propertyName, listeners);
  }

  public removePropertyChangedListener(propertyName: SettingsPropertyName, listener: SettingsModelListener): void {
    const listeners = this._eventListeners.get(propertyName);
    if (listeners === undefined) {
      return;
    }

    const index = listeners.indexOf(listener);
    if (index >= 0) {
      listeners.splice(index, 1);
    }
  }

  public get performanceMode(): boolean {
    return this._performanceMode;
  }

  public set performanceMode(value: boolean) {
    this._performanceMode = value;
    this.notifyPropertyChangedListeners("performanceMode");
  }

  public get logging(): boolean {
    return this._logging;
  }

  public set logging(value: boolean) {
    this._logging = value;
    this.notifyPropertyChangedListeners("logging");
  }

  public get performanceStatistics(): boolean {
    return this._performanceStatistics;
  }

  public set performanceStatistics(value: boolean) {
    this._performanceStatistics = value;
    this.notifyPropertyChangedListeners("performanceStatistics");
  }

  public get experimentalPlayground(): boolean {
    return this._experimentalPlayground;
  }

  public set experimentalPlayground(value: boolean) {
    this._experimentalPlayground = value;
    this.notifyPropertyChangedListeners("experimentalPlayground");
  }

  public storeToJSON(): string {
    return JSON.stringify(this);
  }

  public loadFromJSON(json: string): void {
    const settings = JSON.parse(json) as Partial<SettingsModelJSON>;

    if (isBoolean(settings.performanceMode)) {
      this.performanceMode = settings.performanceMode;
    }
    if (isBoolean(settings.logging)) {
      this.logging = settings.logging;
    }
    if (isBoolean(settings.performanceStatistics)) {
      this.performanceStatistics = settings.performanceStatistics;
    }
    if (isBoolean(settings.experimentalPlayground)) {
      this.experimentalPlayground = settings.experimentalPlayground;
    }
  }

  public toJSON(): SettingsModelJSON {
    return {
      performanceMode: this.performanceMode,
      logging: this.logging,
      performanceStatistics: this.performanceStatistics,
      experimentalPlayground: this.experimentalPlayground,
    };
  }

  private notifyPropertyChangedListeners(propertyName: SettingsPropertyName): void {
    this.emitPropertyChanged(propertyName);

    if (propertyName !== "") {
      this.emitPropertyChanged("");
    }
  }

  private emitPropertyChanged(propertyName: SettingsPropertyName): void {
    const listeners = this._eventListeners.get(propertyName);
    if (listeners === undefined) {
      return;
    }

    for (const listener of listeners) {
      listener({ propertyName });
    }
  }
}
