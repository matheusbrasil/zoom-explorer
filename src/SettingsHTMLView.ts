// @ts-nocheck
import { htmlToElement } from "./htmltools.js";
export class SettingsHTMLView {
    _model;
    _viewElement = document.createElement("div"); // dummy element
    _performanceModeCheckBox = document.createElement("input");
    _loggingCheckBox = document.createElement("input");
    _performanceStatisticsCheckBox = document.createElement("input");
    _clearSettingsButton = document.createElement("button");
    _experimentalPlaygroundCheckBox = document.createElement("input");
    constructor(model) {
        this._model = model;
        this._model.addPropertyChangedListener("performanceMode", (e) => {
            this._performanceModeCheckBox.checked = this._model.performanceMode;
        });
        this._model.addPropertyChangedListener("logging", (e) => {
            this._loggingCheckBox.checked = this._model.logging;
        });
        this._model.addPropertyChangedListener("performanceStatistics", (e) => {
            this._performanceStatisticsCheckBox.checked = this._model.performanceStatistics;
        });
        this.createView();
    }
    createView() {
        let html = `
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
        this._viewElement = htmlToElement(html);
        this._performanceModeCheckBox = this._viewElement.querySelector("#performanceMode");
        this._loggingCheckBox = this._viewElement.querySelector("#logging");
        this._performanceStatisticsCheckBox = this._viewElement.querySelector("#performanceStatistics");
        this._experimentalPlaygroundCheckBox = this._viewElement.querySelector("#experimentalPlayground");
        this._clearSettingsButton = this._viewElement.querySelector("#clearSettingsButton");
        // this._experimentalPlaygroundCheckBox.parentElement!.style.display = "none";
        this._performanceModeCheckBox.checked = this._model.performanceMode;
        this._loggingCheckBox.checked = this._model.logging;
        this._performanceStatisticsCheckBox.checked = this._model.performanceStatistics;
        this._experimentalPlaygroundCheckBox.checked = this._model.experimentalPlayground;
        this._performanceModeCheckBox.addEventListener("change", (e) => {
            this._model.performanceMode = this._performanceModeCheckBox.checked;
        });
        this._loggingCheckBox.addEventListener("change", (e) => {
            this._model.logging = this._loggingCheckBox.checked;
        });
        this._performanceStatisticsCheckBox.addEventListener("change", (e) => {
            this._model.performanceStatistics = this._performanceStatisticsCheckBox.checked;
        });
        this._experimentalPlaygroundCheckBox.addEventListener("change", (e) => {
            this._model.experimentalPlayground = this._experimentalPlaygroundCheckBox.checked;
        });
        this._clearSettingsButton.addEventListener("click", (e) => {
            localStorage.clear();
        });
    }
    get viewElement() {
        return this._viewElement;
    }
}

