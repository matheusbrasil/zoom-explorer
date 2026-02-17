// @ts-nocheck
// (c) 2024-2026 by Thomas Hammer, h@mmer.no
import { shouldLog, LogLevel } from "./Logger.js";
export class Action {
    doAction;
    undoAction;
    description;
    constructor(doAction, undoAction, description) {
        this.doAction = doAction;
        this.undoAction = undoAction;
        this.description = description;
    }
}
export class UndoRedoManager {
    actions = new Array();
    currentIndex = -1; // this will always refer to the next action to undo
    lastValidIndex = -1; // this is the last valid index in the actions array, just so we don't have do slice/resize the array and trigger garbage collection often  
    stateChangedListeners = new Array();
    constructor() {
    }
    addAction(doAction, undoAction, description) {
        let action = new Action(doAction, undoAction, description);
        if (this.currentIndex + 1 >= this.actions.length)
            this.actions.push(action);
        else
            this.actions[this.currentIndex + 1] = action;
        this.currentIndex++;
        this.lastValidIndex = this.currentIndex;
        // doAction();
        this.emitStateChanged();
    }
    async undo() {
        if (this.currentIndex >= 0) {
            let action = this.actions[this.currentIndex];
            await action.undoAction();
            this.currentIndex--;
            shouldLog(LogLevel.Info) && console.log("Undo: " + action.description);
            this.emitStateChanged();
        }
        else {
            shouldLog(LogLevel.Info) && console.log("Nothing to undo");
        }
    }
    async redo() {
        if (this.currentIndex + 1 <= this.lastValidIndex) {
            let action = this.actions[this.currentIndex + 1];
            await action.doAction();
            this.currentIndex++;
            shouldLog(LogLevel.Info) && console.log("Redo: " + action.description);
            this.emitStateChanged();
        }
        else {
            shouldLog(LogLevel.Info) && console.log("Nothing to redo");
        }
    }
    clear() {
        this.currentIndex = -1;
        this.lastValidIndex = -1;
        this.emitStateChanged();
    }
    addStateChangedListener(listener) {
        this.stateChangedListeners.push(listener);
    }
    removeStateChangedListener(listener) {
        let index = this.stateChangedListeners.indexOf(listener);
        if (index >= 0)
            this.stateChangedListeners.splice(index, 1);
    }
    emitStateChanged() {
        let undoAvailable = this.currentIndex >= 0;
        let undoDescription = undoAvailable ? this.actions[this.currentIndex].description : "";
        let redoAvailable = this.currentIndex + 1 <= this.lastValidIndex;
        let redoDescription = redoAvailable ? this.actions[this.currentIndex + 1].description : "";
        for (let i = 0; i < this.stateChangedListeners.length; i++)
            this.stateChangedListeners[i](this, undoAvailable, undoDescription, redoAvailable, redoDescription);
    }
    get undoAvailable() {
        return this.currentIndex >= 0;
    }
    get redoAvailable() {
        return this.currentIndex + 1 <= this.lastValidIndex;
    }
    get undoDescription() {
        return this.undoAvailable ? this.actions[this.currentIndex].description : "";
    }
    get redoDescription() {
        return this.redoAvailable ? this.actions[this.currentIndex + 1].description : "";
    }
}
// (c) 2024-2026 by Thomas Hammer, h@mmer.no

