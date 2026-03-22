import { htmlToElement } from "./htmltools.js";
import { SettingsModel } from "./SettingsModel.js";

function queryOrThrow<T extends Element>(root: ParentNode, selector: string): T {
  const element = root.querySelector(selector);
  if (element === null) {
    throw new Error(`Element matching selector "${selector}" not found`);
  }
  return element as T;
}

export class SettingsHTMLView {
  private readonly _model: SettingsModel;
  private _viewElement: HTMLDivElement = document.createElement("div");
  private _performanceModeCheckBox: HTMLInputElement = document.createElement("input");
  private _loggingCheckBox: HTMLInputElement = document.createElement("input");
  private _performanceStatisticsCheckBox: HTMLInputElement = document.createElement("input");
  private _clearSettingsButton: HTMLButtonElement = document.createElement("button");
  private _experimentalPlaygroundCheckBox: HTMLInputElement = document.createElement("input");

  public constructor(model: SettingsModel) {
    this._model = model;
    this._model.addPropertyChangedListener("performanceMode", () => {
      this._performanceModeCheckBox.checked = this._model.performanceMode;
    });
    this._model.addPropertyChangedListener("logging", () => {
      this._loggingCheckBox.checked = this._model.logging;
    });
    this._model.addPropertyChangedListener("performanceStatistics", () => {
      this._performanceStatisticsCheckBox.checked = this._model.performanceStatistics;
    });
    this._model.addPropertyChangedListener("experimentalPlayground", () => {
      this._experimentalPlaygroundCheckBox.checked = this._model.experimentalPlayground;
    });
    this.createView();
  }

  public get viewElement(): HTMLDivElement {
    return this._viewElement;
  }

  private createView(): void {
    const html = `
    <div id="settings">
        <b>Settings</b>
        <div>
            <input type="checkbox" id="performanceMode" name="performanceMode" unchecked />
            <label for="performanceMode">Performance mode (no GUI)</label>
        </div>

        <div>
            <input type="checkbox" id="logging" name="logging" unchecked />
            <label for="logging">Logging</label>
        </div>

        <div>
            <input type="checkbox" id="performanceStatistics" name="performanceStatistics" unchecked />
            <label for="performanceStatistics">Performance statistics</label>
        </div>

        <div>
            <input type="checkbox" id="experimentalPlayground" name="experimentalPlayground" unchecked />
            <label for="experimentalPlayground">Experimental playground</label>
        </div>

        <button id="clearSettingsButton">Clear Stored Settings</button>
    </div>
    `;

    this._viewElement = htmlToElement(html) as HTMLDivElement;
    this._performanceModeCheckBox = queryOrThrow<HTMLInputElement>(this._viewElement, "#performanceMode");
    this._loggingCheckBox = queryOrThrow<HTMLInputElement>(this._viewElement, "#logging");
    this._performanceStatisticsCheckBox = queryOrThrow<HTMLInputElement>(this._viewElement, "#performanceStatistics");
    this._experimentalPlaygroundCheckBox = queryOrThrow<HTMLInputElement>(this._viewElement, "#experimentalPlayground");
    this._clearSettingsButton = queryOrThrow<HTMLButtonElement>(this._viewElement, "#clearSettingsButton");

    this._performanceModeCheckBox.checked = this._model.performanceMode;
    this._loggingCheckBox.checked = this._model.logging;
    this._performanceStatisticsCheckBox.checked = this._model.performanceStatistics;
    this._experimentalPlaygroundCheckBox.checked = this._model.experimentalPlayground;

    this._performanceModeCheckBox.addEventListener("change", () => {
      this._model.performanceMode = this._performanceModeCheckBox.checked;
    });
    this._loggingCheckBox.addEventListener("change", () => {
      this._model.logging = this._loggingCheckBox.checked;
    });
    this._performanceStatisticsCheckBox.addEventListener("change", () => {
      this._model.performanceStatistics = this._performanceStatisticsCheckBox.checked;
    });
    this._experimentalPlaygroundCheckBox.addEventListener("change", () => {
      this._model.experimentalPlayground = this._experimentalPlaygroundCheckBox.checked;
    });
    this._clearSettingsButton.addEventListener("click", () => {
      localStorage.clear();
    });
  }
}
