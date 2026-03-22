// (c) 2024-2026 by Thomas Hammer, h@mmer.no
import { LogLevel, shouldLog } from "./Logger.js";

export type UndoRedoActionCallback = () => Promise<void> | void;
export type UndoRedoStateChangedListener = (
  manager: UndoRedoManager,
  undoAvailable: boolean,
  undoDescription: string,
  redoAvailable: boolean,
  redoDescription: string,
) => void;

export class Action {
  public readonly doAction: UndoRedoActionCallback;
  public readonly undoAction: UndoRedoActionCallback;
  public readonly description: string;

  public constructor(doAction: UndoRedoActionCallback, undoAction: UndoRedoActionCallback, description: string) {
    this.doAction = doAction;
    this.undoAction = undoAction;
    this.description = description;
  }
}

export class UndoRedoManager {
  public actions: Action[] = [];
  public currentIndex = -1;
  public lastValidIndex = -1;
  public stateChangedListeners: UndoRedoStateChangedListener[] = [];

  public addAction(doAction: UndoRedoActionCallback, undoAction: UndoRedoActionCallback, description: string): void {
    const action = new Action(doAction, undoAction, description);
    if (this.currentIndex + 1 >= this.actions.length) {
      this.actions.push(action);
    } else {
      this.actions[this.currentIndex + 1] = action;
    }

    this.currentIndex++;
    this.lastValidIndex = this.currentIndex;
    this.emitStateChanged();
  }

  public async undo(): Promise<void> {
    if (this.currentIndex < 0) {
      shouldLog(LogLevel.Info) && console.log("Nothing to undo");
      return;
    }

    const action = this.actions[this.currentIndex];
    await action.undoAction();
    this.currentIndex--;
    shouldLog(LogLevel.Info) && console.log(`Undo: ${action.description}`);
    this.emitStateChanged();
  }

  public async redo(): Promise<void> {
    if (this.currentIndex + 1 > this.lastValidIndex) {
      shouldLog(LogLevel.Info) && console.log("Nothing to redo");
      return;
    }

    const action = this.actions[this.currentIndex + 1];
    await action.doAction();
    this.currentIndex++;
    shouldLog(LogLevel.Info) && console.log(`Redo: ${action.description}`);
    this.emitStateChanged();
  }

  public clear(): void {
    this.currentIndex = -1;
    this.lastValidIndex = -1;
    this.emitStateChanged();
  }

  public addStateChangedListener(listener: UndoRedoStateChangedListener): void {
    this.stateChangedListeners.push(listener);
  }

  public removeStateChangedListener(listener: UndoRedoStateChangedListener): void {
    const index = this.stateChangedListeners.indexOf(listener);
    if (index >= 0) {
      this.stateChangedListeners.splice(index, 1);
    }
  }

  public get undoAvailable(): boolean {
    return this.currentIndex >= 0;
  }

  public get redoAvailable(): boolean {
    return this.currentIndex + 1 <= this.lastValidIndex;
  }

  public get undoDescription(): string {
    return this.undoAvailable ? this.actions[this.currentIndex].description : "";
  }

  public get redoDescription(): string {
    return this.redoAvailable ? this.actions[this.currentIndex + 1].description : "";
  }

  private emitStateChanged(): void {
    const undoAvailable = this.undoAvailable;
    const redoAvailable = this.redoAvailable;
    const undoDescription = undoAvailable ? this.actions[this.currentIndex].description : "";
    const redoDescription = redoAvailable ? this.actions[this.currentIndex + 1].description : "";

    for (const listener of this.stateChangedListeners) {
      listener(this, undoAvailable, undoDescription, redoAvailable, redoDescription);
    }
  }
}

// (c) 2024-2026 by Thomas Hammer, h@mmer.no
