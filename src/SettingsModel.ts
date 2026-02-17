// @ts-nocheck
export class SettingsModel {
    _eventListeners = new Map();
    _performanceMode = false;
    _logging = false;
    _performanceStatistics = false;
    _experimentalPlayground = false;
    addPropertyChangedListener(propertyName, listener) {
        if (!this._eventListeners.has(propertyName)) {
            this._eventListeners.set(propertyName, []);
        }
        this._eventListeners.get(propertyName).push(listener);
    }
    removePropertyChangedListener(propertyName, listener) {
        if (this._eventListeners.has(propertyName)) {
            const index = this._eventListeners.get(propertyName).indexOf(listener);
            if (index >= 0) {
                this._eventListeners.get(propertyName).splice(index, 1);
            }
        }
    }
    notifyPropertyChangedListeners(propertyName) {
        if (this._eventListeners.has(propertyName)) {
            for (const listener of this._eventListeners.get(propertyName)) {
                listener({ propertyName });
            }
        }
        // Notify listeners for property "" which means everything 
        propertyName = "";
        if (this._eventListeners.has(propertyName)) {
            for (const listener of this._eventListeners.get(propertyName)) {
                listener({ propertyName });
            }
        }
    }
    get performanceMode() {
        return this._performanceMode;
    }
    set performanceMode(value) {
        this._performanceMode = value;
        this.notifyPropertyChangedListeners("performanceMode");
    }
    get logging() {
        return this._logging;
    }
    set logging(value) {
        this._logging = value;
        this.notifyPropertyChangedListeners("logging");
    }
    get performanceStatistics() {
        return this._performanceStatistics;
    }
    set performanceStatistics(value) {
        this._performanceStatistics = value;
        this.notifyPropertyChangedListeners("performanceStatistics");
    }
    get experimentalPlayground() {
        return this._experimentalPlayground;
    }
    set experimentalPlayground(value) {
        this._experimentalPlayground = value;
        this.notifyPropertyChangedListeners("experimentalPlayground");
    }
    storeToJSON() {
        return JSON.stringify(this);
    }
    loadFromJSON(json) {
        let settings = JSON.parse(json);
        this.performanceMode = settings.performanceMode;
        this.logging = settings.logging;
        this.performanceStatistics = settings.performanceStatistics;
        this.experimentalPlayground = settings.experimentalPlayground;
    }
    toJSON() {
        return {
            performanceMode: this.performanceMode,
            logging: this.logging,
            performanceStatistics: this.performanceStatistics,
            experimentalPlayground: this.experimentalPlayground
        };
    }
}

