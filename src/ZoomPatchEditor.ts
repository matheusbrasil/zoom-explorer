import { htmlToElement, supportsContentEditablePlaintextOnly } from "./htmltools.js";
import { LogLevel, shouldLog } from "./Logger.js";
import { EffectIDMap, EffectParameterMap, ZoomDevice } from "./ZoomDevice.js";
import { ZoomPatch } from "./ZoomPatch.js";
import { ZoomScreen, ZoomScreenCollection } from "./ZoomScreenInfo.js";
import zoomEffectIDsMS60BPlus from "./zoom-effect-ids-ms60bp.js";

export type EditPatchTextEditedListenerType = (event: Event, type: string, initialValueString: string) => boolean;
export type EditPatchMouseEventListenerType = (cell: HTMLTableCellElement, initialValueString: string, x: number, y: number) => void;
export type EditPatchEffectSlotOnOffListenerType = (effectSlot: number, on: boolean) => void;
export type EditPatchEffectSlotDeleteListenerType = (effectSlot: number) => void;
export type EditPatchEffectSlotMoveListenerType = (effectSlot: number, direction: "left" | "right") => void;
export type EditPatchEffectSlotAddListenerType = (effectSlot: number, direction: "left" | "right") => void;
export type EditPatchEffectSlotSelectEffectListenerType = (effectSlot: number) => void;
export type EditPatchEffectSlotSelectListenerType = (effectSlot: number) => void;

let debugCounter = 0;

export class ZoomPatchEditor
{
  private readonly maxEffectSlots = 6;

  private textEditedCallback: EditPatchTextEditedListenerType | undefined = undefined;
  private mouseMovedCallback: EditPatchMouseEventListenerType | undefined = undefined;
  private mouseUpCallback: EditPatchMouseEventListenerType | undefined = undefined;
  private effectSlotOnOffCallback: EditPatchEffectSlotOnOffListenerType | undefined = undefined;
  private effectSlotDeleteCallback: EditPatchEffectSlotDeleteListenerType | undefined = undefined;
  private effectSlotMoveCallback: EditPatchEffectSlotMoveListenerType | undefined = undefined;
  private effectSlotAddCallback: EditPatchEffectSlotAddListenerType | undefined = undefined;
  private effectSlotSelectEffectCallback: EditPatchEffectSlotSelectEffectListenerType | undefined = undefined;
  private effectSlotSelectCallback: EditPatchEffectSlotSelectListenerType | undefined = undefined;

  private undoOnEscape = "";
  private muteBlurOnEscape = false;

  private patchEditorTable: HTMLTableElement;
  private effectsTable: HTMLTableElement;
  private effectsRow: HTMLTableRowElement;
  private effectsViewport: HTMLDivElement;
  private parameterTable: HTMLTableElement;
  private parameterTitle: HTMLSpanElement;
  private parameterSelectionPointer: HTMLDivElement;

  private patchNumberCell: HTMLTableCellElement;
  private patchNameCell: HTMLTableCellElement;
  private patchTempoCell: HTMLTableCellElement;
  private patchDescriptionCell: HTMLTableCellElement;

  private currentMouseMoveCell: HTMLTableCellElement | undefined = undefined;
  private initialMouseMoveCellText = "";
  private mouseDownX = 0;
  private mouseDownY = 0;

  private draggedEffectSlot: number | undefined = undefined;
  private selectedEffectSlot: number | undefined = undefined;
  private lastPatchIdentity = "";
  private visibleEffectSlots: number[] = [];

  private cachedPedalName = "";
  private cachedEffectIDMap: EffectIDMap | undefined = undefined;
  private cachedNumParametersPerPage = 4;
  private cachedScreenCollection: ZoomScreenCollection | undefined = undefined;
  private cachedPatch: ZoomPatch | undefined = undefined;
  private cachedPreviousScreenCollection: ZoomScreenCollection | undefined = undefined;
  private cachedPreviousPatch: ZoomPatch | undefined = undefined;

  constructor(patchEditorID?: string)
  {
    if (patchEditorID !== undefined) {
      const replacement = this.createHTML(true);
      const existing = document.getElementById(patchEditorID) as HTMLTableElement | null;
      if (existing !== null)
        existing.replaceWith(replacement);
      this.patchEditorTable = replacement;
    }
    else {
      this.patchEditorTable = this.createHTML(false);
    }

    const effectsTable = this.patchEditorTable.querySelector(".editEffectsChainTable");
    const effectsViewport = this.patchEditorTable.querySelector(".effectsChainViewport");
    const parameterTable = this.patchEditorTable.querySelector(".editParameterTable");
    const parameterTitle = this.patchEditorTable.querySelector(".parameterEditorEffectName");
    const parameterSelectionPointer = this.patchEditorTable.querySelector(".parameterSelectionPointer");
    const patchNumberCell = this.patchEditorTable.querySelector(".editPatchTableNumber");
    const patchNameCell = this.patchEditorTable.querySelector(".editPatchTableName");
    const patchTempoCell = this.patchEditorTable.querySelector(".editPatchTableTempoValue");
    const patchDescriptionCell = this.patchEditorTable.querySelector(".editPatchTableDescription");

    if (!(effectsTable instanceof HTMLTableElement) ||
      !(effectsViewport instanceof HTMLDivElement) ||
      !(parameterTable instanceof HTMLTableElement) ||
      !(parameterTitle instanceof HTMLSpanElement) ||
      !(parameterSelectionPointer instanceof HTMLDivElement) ||
      !(patchNumberCell instanceof HTMLTableCellElement) ||
      !(patchNameCell instanceof HTMLTableCellElement) ||
      !(patchTempoCell instanceof HTMLTableCellElement) ||
      !(patchDescriptionCell instanceof HTMLTableCellElement)) {
      throw new Error("ZoomPatchEditor failed to initialize required DOM references.");
    }

    this.effectsTable = effectsTable;
    this.effectsRow = this.effectsTable.rows[0] as HTMLTableRowElement;
    this.effectsViewport = effectsViewport;
    this.parameterTable = parameterTable;
    this.parameterTitle = parameterTitle;
    this.parameterSelectionPointer = parameterSelectionPointer;

    this.patchNumberCell = patchNumberCell;
    this.patchNameCell = patchNameCell;
    this.patchTempoCell = patchTempoCell;
    this.patchDescriptionCell = patchDescriptionCell;

    while (this.effectsRow.lastChild)
      this.effectsRow.removeChild(this.effectsRow.lastChild);

    for (let cell of [this.patchNameCell, this.patchTempoCell, this.patchDescriptionCell]) {
      this.setupEventListenersForCell(cell as HTMLTableCellElement);
    }
    this.setupActionRow();

    document.addEventListener("mousemove", e => {
      if (this.currentMouseMoveCell !== undefined && this.mouseMovedCallback !== undefined) {
        let xOffset = e.pageX - this.mouseDownX;
        let yOffset = -1 * (e.pageY - this.mouseDownY);
        this.mouseMovedCallback(this.currentMouseMoveCell, this.initialMouseMoveCellText, xOffset, yOffset);
      }
    });

    document.addEventListener("touchmove", e => {
      if (this.currentMouseMoveCell !== undefined && this.mouseMovedCallback !== undefined) {
        if (e.touches.length < 1)
          return;
        let touch = e.touches[0];
        let xOffset = touch.pageX - this.mouseDownX;
        let yOffset = -1 * (touch.pageY - this.mouseDownY);
        this.mouseMovedCallback(this.currentMouseMoveCell, this.initialMouseMoveCellText, xOffset, yOffset);
        e.preventDefault();
      }
    }, { passive: false });

    window.addEventListener("mouseup", (e) => {
      if (e.button === 0) {
        let xOffset = e.pageX - this.mouseDownX;
        let yOffset = -1 * (e.pageY - this.mouseDownY);

        if (this.mouseUpCallback !== undefined && this.currentMouseMoveCell !== undefined)
          this.mouseUpCallback(this.currentMouseMoveCell, this.initialMouseMoveCellText, xOffset, yOffset);

        let draggingCells = this.patchEditorTable.querySelectorAll(".editParameterValueCell.knobDragging");
        for (let draggingCell of draggingCells)
          draggingCell.classList.remove("knobDragging");

        this.currentMouseMoveCell = undefined;
        this.initialMouseMoveCellText = "";
      }
    });

    window.addEventListener("touchend", (e) => {
      if (this.mouseUpCallback !== undefined && this.currentMouseMoveCell !== undefined) {
        let touch = e.changedTouches.length > 0 ? e.changedTouches[0] : undefined;
        let xOffset = touch !== undefined ? touch.pageX - this.mouseDownX : 0;
        let yOffset = touch !== undefined ? -1 * (touch.pageY - this.mouseDownY) : 0;
        this.mouseUpCallback(this.currentMouseMoveCell, this.initialMouseMoveCellText, xOffset, yOffset);
      }
      let draggingCells = this.patchEditorTable.querySelectorAll(".editParameterValueCell.knobDragging");
      for (let draggingCell of draggingCells)
        draggingCell.classList.remove("knobDragging");
      this.currentMouseMoveCell = undefined;
      this.initialMouseMoveCellText = "";
    });

    this.effectsViewport.addEventListener("scroll", () => this.scheduleParameterSelectionPointerPositionUpdate(), { passive: true });
    window.addEventListener("resize", () => this.scheduleParameterSelectionPointerPositionUpdate());
  }

  createHTML(includeControls: boolean): HTMLTableElement
  {
    const tableID = includeControls ? ` id="editPatchTableID"` : "";
    const patchNameID = includeControls ? ` id="editPatchTableNameID"` : "";
    const patchTempoID = includeControls ? ` id="editPatchTableTempoValueID"` : "";
    const patchDescriptionID = includeControls ? ` id="editPatchTableDescriptionID"` : "";

    const selectorHTML = includeControls ? `
            <th class="editPatchTableSelector">
              <div class="patchSelectorGroup">
                <label class="patchSelectorLabel" for="patchSelectorDropdown">Patch</label>
                <button id="patchSelectorButton" class="patchSelectorButton" type="button" aria-haspopup="listbox" aria-expanded="false">
                  <span id="patchSelectorButtonLabel">Loading patches...</span>
                  <span class="material-symbols-outlined">expand_more</span>
                </button>
                <div id="patchSelectorMenu" class="patchSelectorMenu" role="listbox"></div>
                <select id="patchSelectorDropdown" class="patchSelectorDropdown" tabindex="-1" aria-hidden="true">
                  <option value="">Loading patches...</option>
                </select>
                <span id="patchDirtyIndicator" class="patchDirtyIndicator">Saved</span>
              </div>
            </th>` : "";

    const buttonsHTML = includeControls ? `
            <th class="editPatchTableButtons" rowspan="2">
              <button id="syncPatchToPedalButton" class="loadSaveButtons" tooltip="Save edited patch to selected memory slot on pedal" disabled><span class="material-symbols-outlined">save</span><br/>Save</button>
              <button id="undoEditPatchButton" class="loadSaveButtons" disabled><span class="material-symbols-outlined">undo</span><br/>Undo</button>
              <button id="redoEditPatchButton" class="loadSaveButtons" disabled><span class="material-symbols-outlined">redo</span><br/>Redo</button>
              <button id="savePatchToDiskButton" class="loadSaveButtons" tooltip="Save selected patch to file"><span class="material-symbols-outlined">save</span><br/>Save</button>
              <button id="loadPatchFromDiskButton" class="loadSaveButtons" tooltip="Load patch from file and save to selected memory slot on pedal"><span class="material-symbols-outlined">file_open</span><br/>Load</button>
              <button id="loadPatchFromTextButton" class="loadSaveButtons" tooltip="Load patch from sysex text and save to selected memory slot on pedal"><span class="material-symbols-outlined">article_shortcut</span><br/>Text</button>
            </th>` : "";
    const topColSpan = includeControls ? 5 : 4;
    const fullColSpan = includeControls ? 6 : 4;
    const actionRowHTML = includeControls ? `
        <tr class="editPatchActionRow">
          <td colspan="${fullColSpan}" class="editPatchActionCell">
            <div class="patchActionButtons">
              <button class="patchActionButton" data-action="add"><span class="material-symbols-outlined">add_circle</span><span>Add</span></button>
              <button class="patchActionButton" data-action="delete"><span class="material-symbols-outlined">delete</span><span>Delete</span></button>
              <button class="patchActionButton" data-action="change"><span class="material-symbols-outlined">swap_horiz</span><span>Change</span></button>
              <button class="patchActionButton" data-action="clip" disabled><span class="material-symbols-outlined">content_cut</span><span>Clip</span></button>
              <button class="patchActionButton" data-action="clipboard" disabled><span class="material-symbols-outlined">content_paste</span><span>Clipboard</span></button>
              <button class="patchActionButton" data-action="tuner" disabled><span class="material-symbols-outlined">tune</span><span>Tuner</span></button>
            </div>
          </td>
        </tr>` : "";

    let html = `
      <table${tableID} class="editPatchTable">
        <tr class="editPatchTopRow">
          <th class="editPatchTableNumber">Patch 00:</th>
          <th class="editPatchTableName"${patchNameID}>Patch Name</th>
          <th class="editPatchTableTempoValue"${patchTempoID}>120</th>
          <th class="editPatchTableTempoLabel">BPM</th>
          ${selectorHTML}
          ${buttonsHTML}
        </tr>
        <tr class="editPatchDescriptionRow">
          <th colspan="${topColSpan}" class="editPatchTableDescription"${patchDescriptionID}></th>
        </tr>
        ${actionRowHTML}
        <tr class="editPatchEffectsRow">
          <td colspan="${fullColSpan}" class="editPatchEffectsCell">
            <div class="effectsChainViewport">
              <table class="editEffectsChainTable">
                <tr></tr>
              </table>
            </div>
          </td>
        </tr>
        <tr class="editPatchParametersRow">
          <td colspan="${fullColSpan}" class="editPatchParametersCell">
            <div class="parameterSelectionPointer"></div>
            <div class="parameterEditorHeader">
              <span class="parameterEditorTitle">Parameter Editor</span>
              <span class="parameterEditorEffectName">No effect selected</span>
            </div>
            <table class="editParameterTable">
              <tr>
                <td class="emptyParameterCell">Select an effect to edit parameters.</td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    `;

    return htmlToElement(html) as HTMLTableElement;
  }

  public get htmlElement(): HTMLTableElement
  {
    return this.patchEditorTable;
  }

  hide()
  {
    this.patchEditorTable.style.display = "none";
  }

  show()
  {
    this.patchEditorTable.style.display = "table";
  }

  get visible(): boolean
  {
    return this.patchEditorTable.style.display === "table";
  }

  setTextEditedCallback(textEditedCallback: EditPatchTextEditedListenerType)
  {
    this.textEditedCallback = textEditedCallback;
  }

  setMouseMovedCallback(mouseMovedCallback: EditPatchMouseEventListenerType)
  {
    this.mouseMovedCallback = mouseMovedCallback;
  }

  setMouseUpCallback(mouseUpCallback: EditPatchMouseEventListenerType)
  {
    this.mouseUpCallback = mouseUpCallback;
  }

  setEffectSlotOnOffCallback(effectSlotOnOffCallback: EditPatchEffectSlotOnOffListenerType)
  {
    this.effectSlotOnOffCallback = effectSlotOnOffCallback;
  }

  setEffectSlotDeleteCallback(effectSlotDeleteCallback: EditPatchEffectSlotDeleteListenerType)
  {
    this.effectSlotDeleteCallback = effectSlotDeleteCallback;
  }

  setEffectSlotMoveCallback(effectSlotMoveCallback: EditPatchEffectSlotMoveListenerType)
  {
    this.effectSlotMoveCallback = effectSlotMoveCallback;
  }

  setEffectSlotAddCallback(effectSlotAddCallback: EditPatchEffectSlotAddListenerType)
  {
    this.effectSlotAddCallback = effectSlotAddCallback;
  }

  setEffectSlotSelectEffectCallback(effectSlotSelectEffectCallback: EditPatchEffectSlotSelectEffectListenerType)
  {
    this.effectSlotSelectEffectCallback = effectSlotSelectEffectCallback;
  }

  setEffectSlotSelectCallback(effectSlotSelectCallback: EditPatchEffectSlotSelectListenerType)
  {
    this.effectSlotSelectCallback = effectSlotSelectCallback;
  }

  private getSelectedEffectSlot(): number | undefined
  {
    if (this.selectedEffectSlot !== undefined)
      return this.selectedEffectSlot;
    if (this.visibleEffectSlots.length > 0)
      return this.visibleEffectSlots[0];
    return undefined;
  }

  private setupActionRow(): void
  {
    let actionButtons = this.patchEditorTable.querySelectorAll(".patchActionButton");
    for (let actionButton of actionButtons) {
      if (!(actionButton instanceof HTMLButtonElement))
        continue;
      actionButton.addEventListener("click", () => {
        let action = actionButton.dataset.action;
        let effectSlot = this.getSelectedEffectSlot();
        if (effectSlot === undefined || action === undefined)
          return;
        if (action === "add" && this.effectSlotAddCallback !== undefined)
          this.effectSlotAddCallback(effectSlot, "right");
        else if (action === "delete" && this.effectSlotDeleteCallback !== undefined)
          this.effectSlotDeleteCallback(effectSlot);
        else if (action === "change" && this.effectSlotSelectEffectCallback !== undefined)
          this.effectSlotSelectEffectCallback(effectSlot);
      });
    }
  }

  getEffectAndParameterNumber(str: string): [effectSlot: number | undefined, parameterNumber: number | undefined] {
    let values = str.match(/effectSlot: (\d+), parameterNumber: (\d+)/);
    if (values === null || values.length !== 3)
      return [undefined, undefined];
    return [parseInt(values[1]), parseInt(values[2])];
  }

  private encodeEffectAndParameterNumber(effectSlot: number, parameterNumber: number): string
  {
    return `effectSlot: ${effectSlot}, parameterNumber: ${parameterNumber}`;
  }

  getCell(effectSlot: number, parameterNumber: number): HTMLTableCellElement | undefined
  {
    let id = this.encodeEffectAndParameterNumber(effectSlot, parameterNumber);
    let cell = this.patchEditorTable.querySelector(`[id="${id}"]`) as HTMLTableCellElement;
    if (cell === null)
      return undefined;
    return cell;
  }

  private setCaret(target: HTMLElement, position = 0)
  {
    const range = document.createRange();
    const sel = window.getSelection();
    range.setStart(target.childNodes[0], position);
    range.collapse(true);
    if (sel !== null) {
      sel.removeAllRanges();
      sel.addRange(range);
    }
  }

  private setupEventListenersForCell(cell: HTMLTableCellElement) {
    if (cell !== undefined) {
      cell.contentEditable = supportsContentEditablePlaintextOnly() ? "plaintext-only" : "true";

      cell.ondrag = () => { this.currentMouseMoveCell = undefined; return false; };
      cell.ondragenter = () => { this.currentMouseMoveCell = undefined; return false; };
      cell.ondragleave = () => { this.currentMouseMoveCell = undefined; return false; };
      cell.ondragover = () => { this.currentMouseMoveCell = undefined; return false; };
      cell.ondragstart = () => { this.currentMouseMoveCell = undefined; return false; };
      cell.ondragend = () => { this.currentMouseMoveCell = undefined; return false; };

      cell.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          cell.blur();
        }
        else if (e.key === "Escape" || e.key === "Esc") {
          cell.innerText = this.undoOnEscape;
          if (this.textEditedCallback !== undefined)
            this.textEditedCallback(e, "input", this.undoOnEscape);
          this.muteBlurOnEscape = true;
          cell.blur();
          this.muteBlurOnEscape = false;
        }
        else if (e.key === "ArrowUp" || e.key === "ArrowDown" || e.key === "PageUp" || e.key === "PageDown" || e.key === "Tab") {
          e.preventDefault();
          if (this.textEditedCallback !== undefined)
            this.textEditedCallback(e, "key", this.undoOnEscape);
        }
      });

      cell.addEventListener("input", (e) => {
        if (this.textEditedCallback !== undefined)
          this.textEditedCallback(e, "input", this.undoOnEscape);
      });

      cell.addEventListener("focus", (e) => {
        this.undoOnEscape = cell.innerText;
        if (this.textEditedCallback !== undefined)
          this.textEditedCallback(e, "focus", this.undoOnEscape);
      });

      cell.addEventListener("blur", (e) => {
        if (!this.muteBlurOnEscape)
          if (this.textEditedCallback !== undefined) {
            let acceptEdit = this.textEditedCallback(e, "blur", this.undoOnEscape);
            if (!acceptEdit)
              cell.innerText = this.undoOnEscape;
          }
      });

      cell.addEventListener("mousedown", (e) => {
        if (e.button === 0) {
          if (cell.classList.contains("parameterSwitchCell")) {
            e.preventDefault();
            cell.focus();
            return;
          }
          if (cell.classList.contains("editParameterValueCell")) {
            e.preventDefault();
            cell.focus();
          }
          this.currentMouseMoveCell = cell;
          this.initialMouseMoveCellText = cell.innerText;
          this.mouseDownX = e.pageX;
          this.mouseDownY = e.pageY;
          if (cell.classList.contains("editParameterValueCell"))
            cell.classList.add("knobDragging");
        }
      });

      cell.addEventListener("touchstart", (e) => {
        if (e.touches.length < 1)
          return;
        if (cell.classList.contains("parameterSwitchCell")) {
          e.preventDefault();
          cell.focus();
          return;
        }
        let touch = e.touches[0];
        this.currentMouseMoveCell = cell;
        this.initialMouseMoveCellText = cell.innerText;
        this.mouseDownX = touch.pageX;
        this.mouseDownY = touch.pageY;
        if (cell.classList.contains("editParameterValueCell"))
          cell.classList.add("knobDragging");
        e.preventDefault();
      }, { passive: false });

      cell.addEventListener("click", (e) => {
        if (!cell.classList.contains("parameterSwitchCell"))
          return;
        e.preventDefault();
        e.stopPropagation();
        let currentRaw = Number.parseInt(cell.dataset.switchRaw ?? "0");
        let toggleKey = Number.isNaN(currentRaw) || currentRaw <= 0 ? "ArrowUp" : "ArrowDown";
        cell.focus();
        let keyEvent = new KeyboardEvent("keydown", { key: toggleKey, bubbles: true });
        cell.dispatchEvent(keyEvent);
      });
    }
  }

  private scheduleParameterSelectionPointerPositionUpdate(): void
  {
    requestAnimationFrame(() => this.updateParameterSelectionPointerPosition());
  }

  private updateParameterSelectionPointerPosition(): void
  {
    if (this.selectedEffectSlot === undefined) {
      this.parameterSelectionPointer.classList.remove("visible");
      return;
    }

    let hasVisibleParameters = Array.from(this.parameterTable.querySelectorAll(".editParameterValueCell"))
      .some(cell => (cell as HTMLTableCellElement).id !== "");
    if (this.parameterTable.style.display === "none" || !hasVisibleParameters) {
      this.parameterSelectionPointer.classList.remove("visible");
      return;
    }

    let selectedCard = this.patchEditorTable.querySelector(`.editEffectTable[data-effect-slot="${this.selectedEffectSlot}"]`) as HTMLTableElement | null;
    let pointerContainer = this.parameterSelectionPointer.offsetParent as HTMLElement | null;
    if (!(selectedCard instanceof HTMLTableElement) || pointerContainer === null) {
      this.parameterSelectionPointer.classList.remove("visible");
      return;
    }
    if (selectedCard.classList.contains("blankEffect")) {
      this.parameterSelectionPointer.classList.remove("visible");
      return;
    }

    let anchor = selectedCard.querySelector(".effectPedalImageWrapper") as HTMLElement | null;
    let anchorRect = (anchor ?? selectedCard).getBoundingClientRect();
    let containerRect = pointerContainer.getBoundingClientRect();
    let centerX = (anchorRect.left + (anchorRect.width / 2)) - containerRect.left;
    let clampedX = Math.max(20, Math.min(pointerContainer.clientWidth - 20, centerX));
    this.parameterSelectionPointer.style.left = `${clampedX.toFixed(1)}px`;
    this.parameterSelectionPointer.classList.add("visible");
  }

  public updateEffectSlotFrame(currentEffectSlot: number): void
  {
    this.selectedEffectSlot = currentEffectSlot;
    for (let effectColumn = 0; effectColumn < this.effectsRow.children.length; effectColumn++) {
      let cellWithEffectTable = this.effectsRow.children[effectColumn] as HTMLTableCellElement;
      if (!(cellWithEffectTable.firstElementChild instanceof HTMLTableElement))
        continue;
      let effectTable = cellWithEffectTable.firstElementChild as HTMLTableElement;
      let effectSlot = Number.parseInt(effectTable.dataset.effectSlot ?? "-1");
      effectTable.classList.toggle("editEffectSlot", effectSlot === currentEffectSlot);
    }
    this.renderParameterEditor();
    this.scheduleParameterSelectionPointerPositionUpdate();
  }

  public updateTempo(tempo: number): void
  {
    let newPatchTempo = tempo.toString().padStart(3, "0");
    this.updateTextContentIfChanged(this.patchTempoCell, newPatchTempo, true);
  }

  public addCellHighlights(slotParameterEffectList: [slot: number, parameterNumber: number, unmapped: boolean][])
  {
    for (let slotParameter of slotParameterEffectList) {
      let slot = slotParameter[0];
      let parameterNumber = slotParameter[1];
      let unmapped = slotParameter[2];
      let cell = this.getCell(slot, parameterNumber);
      if (cell !== undefined) {
        if (unmapped)
          cell.classList.add("unmapped");
        else
          cell.classList.add("changed");
      }
    }
  }

  public clearAllCellHighlights()
  {
    let cells = this.patchEditorTable.querySelectorAll(".unmapped, .changed");
    for (let cell of cells) {
      cell.classList.remove("unmapped");
      cell.classList.remove("changed");
    }
  }

  private updateTextContentIfChanged(cell: HTMLElement, textContent: string, blur: boolean = false) {
    if (cell.textContent !== textContent) {
      cell.textContent = textContent;
      if (blur)
        cell.blur();
    }
  }

  private updateFontWeightIfChanged(cell: HTMLElement, fontWeight: string) {
    if (cell.style.fontWeight !== fontWeight) {
      cell.style.fontWeight = fontWeight;
    }
  }

  private updateBackgroundSizeIfChanged(cell: HTMLElement, backgroundSize: string) {
    if (cell.style.backgroundSize !== backgroundSize) {
      cell.style.backgroundSize = backgroundSize;
      let parsed = Number.parseFloat(backgroundSize.replace("%", ""));
      if (!Number.isNaN(parsed))
        cell.style.setProperty("--value-percent", parsed.toFixed(0));
    }
  }

  private updateBackgroundImageIfChanged(cell: HTMLElement, backgroundImage: string) {
    if (cell.style.backgroundImage !== backgroundImage) {
      cell.style.backgroundImage = backgroundImage;
    }
  }

  private screenIsVisible(screen: ZoomScreen, screenNumber: number, patch: ZoomPatch | undefined) {
    return !(patch !== undefined && patch.effectSettings !== null && screenNumber >= patch.effectSettings.length);
  }

  private clamp(value: number) {
    return Math.max(0, Math.min(255, Math.round(value)));
  }

  private getVisibleEffectSlots(screenCollection: ZoomScreenCollection, patch: ZoomPatch | undefined): number[] {
    let slots: number[] = [];
    for (let effectSlot = screenCollection.screens.length - 1; effectSlot >= 0; effectSlot--) {
      let screen = screenCollection.screens[effectSlot];
      if (this.screenIsVisible(screen, effectSlot, patch))
        slots.push(effectSlot);
    }
    return slots;
  }

  private getPatchIdentity(patch: ZoomPatch | undefined, patchNumberText: string): string {
    if (patch === undefined)
      return patchNumberText;
    let patchName = patch.nameTrimmed ?? "";
    let effectCount = patch.effectSettings?.length ?? 0;
    return `${patchNumberText}|${patchName}|${effectCount}`;
  }

  private ensureEffectCellCount(numVisibleScreens: number): void {
    while (this.effectsRow.lastChild !== null && this.effectsRow.children.length > numVisibleScreens) {
      this.effectsRow.removeChild(this.effectsRow.lastChild);
    }

    while (this.effectsRow.children.length < numVisibleScreens) {
      let td = document.createElement("td") as HTMLTableCellElement;
      this.effectsRow.appendChild(td);
    }
  }

  private createEffectCard(): HTMLTableElement {
    let html = `
      <table class="editEffectTable" draggable="true">
        <tr>
          <th colspan="1">
            <div class="editEffectTableTopBar">
              <button class="material-symbols-outlined effectOnOffButton" tooltip="Bypass / Enable">radio_button_unchecked</button>
              <span class="editEffectTableEffectName"></span>
              <button class="material-symbols-outlined effectDragHandle" tooltip="Drag to reorder">drag_indicator</button>
            </div>
            <button class="effectLed effectLedToggle" tooltip="Bypass / Enable"></button>
            <div class="effectPedalImageWrapper">
              <img class="effectPedalImage" alt="" draggable="false" />
              <div class="effectPedalFallback">No Image</div>
            </div>
            <div class="editEffectTableButtons">
              <button class="material-symbols-outlined effectActionButton effectAddLeftButton" tooltip="Add effect to the left">add_circle</button>
              <button class="material-symbols-outlined effectActionButton effectMoveLeftButton" tooltip="Move effect left">arrow_back_2</button>
              <button class="material-symbols-outlined effectActionButton effectDeleteButton" tooltip="Delete effect">delete</button>
              <button class="material-symbols-outlined effectActionButton effectMoveRightButton" tooltip="Move effect right">play_arrow</button>
              <button class="material-symbols-outlined effectActionButton effectAddRightButton" tooltip="Add effect to the right">add_circle</button>
            </div>
            <div class="effectCardBottomRow">
              <button class="material-symbols-outlined effectSelectButton" tooltip="Select a different effect">tune</button>
            </div>
            <div class="effectSelectionIndicator"></div>
          </th>
        </tr>
      </table>
    `;
    let effectTable = htmlToElement(html) as HTMLTableElement;

    effectTable.addEventListener("click", (event) => this.onEffectCardClick(event));
    effectTable.addEventListener("dragstart", (event) => this.onEffectCardDragStart(event));
    effectTable.addEventListener("dragover", (event) => this.onEffectCardDragOver(event));
    effectTable.addEventListener("dragleave", (event) => this.onEffectCardDragLeave(event));
    effectTable.addEventListener("drop", (event) => this.onEffectCardDrop(event));
    effectTable.addEventListener("dragend", (event) => this.onEffectCardDragEnd(event));

    let effectOnOffButton = effectTable.querySelector(".effectOnOffButton") as HTMLButtonElement;
    effectOnOffButton.addEventListener("click", (event) => this.onEffectSlotOnOffButtonClick(event as MouseEvent));
    let effectLedToggle = effectTable.querySelector(".effectLedToggle") as HTMLButtonElement;
    effectLedToggle.addEventListener("click", (event) => this.onEffectSlotOnOffButtonClick(event as MouseEvent));

    let effectAddLeftButton = effectTable.querySelector(".effectAddLeftButton") as HTMLButtonElement;
    effectAddLeftButton.addEventListener("click", (event) => this.onEffectSlotAddButtonClick(event as MouseEvent, "left"));

    let effectMoveLeftButton = effectTable.querySelector(".effectMoveLeftButton") as HTMLButtonElement;
    effectMoveLeftButton.addEventListener("click", (event) => this.onEffectSlotMoveButtonClick(event as MouseEvent, "left"));

    let effectDeleteButton = effectTable.querySelector(".effectDeleteButton") as HTMLButtonElement;
    effectDeleteButton.addEventListener("click", (event) => this.onEffectSlotDeleteButtonClick(event as MouseEvent));

    let effectMoveRightButton = effectTable.querySelector(".effectMoveRightButton") as HTMLButtonElement;
    effectMoveRightButton.addEventListener("click", (event) => this.onEffectSlotMoveButtonClick(event as MouseEvent, "right"));

    let effectAddRightButton = effectTable.querySelector(".effectAddRightButton") as HTMLButtonElement;
    effectAddRightButton.addEventListener("click", (event) => this.onEffectSlotAddButtonClick(event as MouseEvent, "right"));

    let effectSelectButton = effectTable.querySelector(".effectSelectButton") as HTMLButtonElement;
    effectSelectButton.addEventListener("click", (event) => this.onEffectSlotSelectEffectButtonClick(event as MouseEvent));

    let effectImage = effectTable.querySelector(".effectPedalImage") as HTMLImageElement;
    let effectFallback = effectTable.querySelector(".effectPedalFallback") as HTMLDivElement;
    effectImage.addEventListener("error", () => {
      this.tryNextEffectImage(effectImage, effectFallback);
    });
    effectImage.addEventListener("load", () => {
      effectImage.classList.remove("missing");
      effectFallback.classList.remove("visible");
      this.scheduleParameterSelectionPointerPositionUpdate();
    });

    return effectTable;
  }

  private removeDragStateClasses(): void {
    let cards = this.patchEditorTable.querySelectorAll(".editEffectTable.dragging, .editEffectTable.drag-over");
    for (let card of cards) {
      card.classList.remove("dragging");
      card.classList.remove("drag-over");
    }
  }

  private onEffectCardDragStart(event: DragEvent): void {
    let effectTable = event.currentTarget as HTMLTableElement;
    if (effectTable.dataset.effectSlot === undefined)
      return;
    this.draggedEffectSlot = Number.parseInt(effectTable.dataset.effectSlot);
    effectTable.classList.add("dragging");
    if (event.dataTransfer !== null) {
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", effectTable.dataset.effectSlot);
    }
  }

  private onEffectCardDragOver(event: DragEvent): void {
    event.preventDefault();
    let effectTable = event.currentTarget as HTMLTableElement;
    effectTable.classList.add("drag-over");
    if (event.dataTransfer !== null)
      event.dataTransfer.dropEffect = "move";
  }

  private onEffectCardDragLeave(event: DragEvent): void {
    let effectTable = event.currentTarget as HTMLTableElement;
    effectTable.classList.remove("drag-over");
  }

  private onEffectCardDrop(event: DragEvent): void {
    event.preventDefault();
    let effectTable = event.currentTarget as HTMLTableElement;
    effectTable.classList.remove("drag-over");

    if (effectTable.dataset.effectSlot === undefined)
      return;
    let targetEffectSlot = Number.parseInt(effectTable.dataset.effectSlot);

    let sourceEffectSlot = this.draggedEffectSlot;
    if (sourceEffectSlot === undefined && event.dataTransfer !== null) {
      let data = event.dataTransfer.getData("text/plain");
      sourceEffectSlot = Number.parseInt(data);
    }
    if (sourceEffectSlot === undefined || Number.isNaN(sourceEffectSlot))
      return;
    if (targetEffectSlot === sourceEffectSlot)
      return;
    if (this.effectSlotMoveCallback === undefined)
      return;

    let currentEffectSlot = sourceEffectSlot;
    while (currentEffectSlot < targetEffectSlot) {
      this.effectSlotMoveCallback(currentEffectSlot, "left");
      currentEffectSlot += 1;
    }
    while (currentEffectSlot > targetEffectSlot) {
      this.effectSlotMoveCallback(currentEffectSlot, "right");
      currentEffectSlot -= 1;
    }

    this.selectedEffectSlot = targetEffectSlot;
    this.draggedEffectSlot = undefined;
  }

  private onEffectCardDragEnd(_event: DragEvent): void {
    this.draggedEffectSlot = undefined;
    this.removeDragStateClasses();
  }

  private onEffectCardClick(event: Event): void {
    if (!(event.currentTarget instanceof HTMLTableElement))
      return;

    let target = event.target as HTMLElement;
    if (target.closest("button") !== null)
      return;

    let effectTable = event.currentTarget as HTMLTableElement;
    if (effectTable.dataset.effectSlot === undefined)
      return;
    let effectSlot = Number.parseInt(effectTable.dataset.effectSlot);
    if (Number.isNaN(effectSlot))
      return;

    this.selectedEffectSlot = effectSlot;
    this.updateEffectSlotFrame(effectSlot);
    if (this.effectSlotSelectCallback !== undefined)
      this.effectSlotSelectCallback(effectSlot);
  }

  private resolveEffectName(effectIDMap: EffectIDMap | undefined, effectID: number, fallbackName: string): string {
    let effectMap = this.resolveEffectMap(effectIDMap, effectID);
    if (effectMap !== undefined && effectMap.name.trim().length > 0)
      return effectMap.name;

    let fallbackNormalized = fallbackName.trim().toLowerCase();
    if (fallbackNormalized.length === 0 || fallbackNormalized === "effect") {
      let ms60Name = zoomEffectIDsMS60BPlus.get(effectID) ?? zoomEffectIDsMS60BPlus.get(effectID & 0xFFFFFFF0);
      if (ms60Name !== undefined && ms60Name.trim().length > 0)
        return ms60Name;
    }

    return fallbackName;
  }

  private resolveEffectMap(effectIDMap: EffectIDMap | undefined, effectID: number): EffectParameterMap | undefined
  {
    if (effectIDMap === undefined || effectID === -1)
      return undefined;

    let effectMap = effectIDMap.get(effectID);
    if (effectMap !== undefined)
      return effectMap;

    effectMap = effectIDMap.get(effectID & 0xFFFFFFF0);
    if (effectMap !== undefined)
      return effectMap;

    return undefined;
  }

  private resolveEffectIDForMap(effectIDMap: EffectIDMap | undefined, effectID: number): number | undefined
  {
    if (effectIDMap === undefined || effectID === -1)
      return undefined;
    if (effectIDMap.has(effectID))
      return effectID;
    let maskedID = effectID & 0xFFFFFFF0;
    if (effectIDMap.has(maskedID))
      return maskedID;
    return undefined;
  }

  private getDisplayParameters(screen: ZoomScreen, patch: ZoomPatch, effectSlot: number, effectIDMap: EffectIDMap | undefined, effectID: number):
    { name: string, valueString: string }[]
  {
    let parameters = screen.parameters.map(parameter => ({ name: parameter.name, valueString: parameter.valueString }));
    let hasUsableScreenParameters = parameters.length > 2 && parameters.slice(2).some(parameter => {
      if (!this.shouldRenderParameter(parameter))
        return false;
      let parameterName = parameter.name.trim().toLowerCase();
      if (parameterName === "effect")
        return false;
      return parameter.valueString.trim().length > 0;
    });
    if (hasUsableScreenParameters)
      return parameters;

    if (parameters.length > 2)
      parameters = parameters.slice(0, 2);

    if (patch.effectSettings === null || effectSlot >= patch.effectSettings.length)
      return parameters;

    let effectMap = this.resolveEffectMap(effectIDMap, effectID);
    if (effectMap === undefined)
      return parameters;

    if (parameters.length === 0) {
      parameters.push({ name: "OnOff", valueString: patch.effectSettings[effectSlot].enabled ? "1" : "0" });
    }

    if (parameters.length === 1) {
      parameters.push({ name: effectMap.name, valueString: effectMap.name });
    }
    else if (parameters[1].name.trim().length === 0 || parameters[1].name === "Effect") {
      parameters[1] = { name: effectMap.name, valueString: effectMap.name };
    }

    let effectParameters = patch.effectSettings[effectSlot].parameters;
    for (let parameterIndex = 0; parameterIndex < effectMap.parameters.length; parameterIndex++) {
      let parameterMap = effectMap.parameters[parameterIndex];
      let rawValue = effectParameters[parameterIndex];
      if (!Number.isInteger(rawValue))
        rawValue = parameterMap.default ?? 0;
      if (parameterMap.values.length === 0) {
        parameters.push({ name: parameterMap.name, valueString: String(rawValue) });
        continue;
      }
      let parameterNumber = parameterIndex + 2;
      let valueString = ZoomDevice.getStringFromRawParameterValueAndMap(effectIDMap, effectID, parameterNumber, Number(rawValue));
      if (valueString.length === 0) {
        let fallbackIndex = Math.max(0, Math.min(parameterMap.values.length - 1, Number(rawValue)));
        valueString = parameterMap.values[fallbackIndex] ?? String(rawValue);
      }
      parameters.push({ name: parameterMap.name, valueString: valueString });
    }

    return parameters;
  }



  private isBlankEffectName(name: string): boolean
  {
    let lower = name.trim().toLowerCase();
    return lower === "blank" ||
      lower === "empty" ||
      lower === "thru" ||
      lower === "line sel" ||
      lower === "linesel" ||
      lower.startsWith("blank");
  }

  private getEffectImageNames(_pedalName: string, effectID: number, effectName: string, fallbackName: string): string[]
  {
    let imageNames: string[] = [];
    let lowerCaseNames = new Set<string>();
    let addName = (name: string | undefined) => {
      if (name === undefined)
        return;
      let trimmed = name.trim();
      if (trimmed.length === 0)
        return;
      let lower = trimmed.toLowerCase();
      if (lowerCaseNames.has(lower))
        return;
      lowerCaseNames.add(lower);
      imageNames.push(trimmed);
    };

    let isBlankEffect = this.isBlankEffectName(effectName) || this.isBlankEffectName(fallbackName);
    if (isBlankEffect)
      addName("BLANK");
    addName(effectName);
    addName(fallbackName);
    if (effectID !== -1) {
      addName(zoomEffectIDsMS60BPlus.get(effectID));
      addName(zoomEffectIDsMS60BPlus.get(effectID & 0xfffffff0));
    }

    return imageNames;
  }

  private getEffectImageCandidates(effectNames: string[]): string[]
  {
    let candidates: string[] = [];
    let seen = new Set<string>();
    let addCandidate = (candidate: string) => {
      if (seen.has(candidate))
        return;
      seen.add(candidate);
      candidates.push(candidate);
    };

    for (let effectName of effectNames) {
      let variants: string[] = [];
      let variantSeen = new Set<string>();
      let addVariant = (variant: string) => {
        if (variant.length === 0)
          return;
        if (variantSeen.has(variant))
          return;
        variantSeen.add(variant);
        variants.push(variant);
      };

      let trimmedName = effectName.trim();
      addVariant(trimmedName);
      addVariant(trimmedName.replace(/\s+/g, " "));
      addVariant(trimmedName.replace(/\s*\/\s*/g, "-"));
      addVariant(trimmedName.replace(/\s*-\s*/g, "-"));

      for (let variant of variants) {
        let encoded = encodeURI(variant);
        addCandidate(`/img/effects/${encoded}.png`);
        addCandidate(`img/effects/${encoded}.png`);
        addCandidate(`./img/effects/${encoded}.png`);
        addCandidate(`${encoded}.png`);
        addCandidate(`./${encoded}.png`);
        addCandidate(`/img/effects/${variant}.png`);
        addCandidate(`img/effects/${variant}.png`);
        addCandidate(`./img/effects/${variant}.png`);
        addCandidate(`${variant}.png`);
        addCandidate(`./${variant}.png`);
      }
    }

    return candidates;
  }

  private createFallbackPedalImage(effectName: string): string
  {
    let escapedName = effectName
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
    let svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="360" height="520" viewBox="0 0 360 520">
        <defs>
          <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#3e4e60"/>
            <stop offset="100%" stop-color="#2a3644"/>
          </linearGradient>
        </defs>
        <rect x="20" y="20" width="320" height="480" rx="28" fill="url(#bg)" stroke="#10161d" stroke-width="8"/>
        <circle cx="180" cy="92" r="18" fill="#ff5056"/>
        <text x="180" y="236" fill="#e3ebf4" font-family="Arial, sans-serif" font-size="30" text-anchor="middle">NO IMAGE</text>
        <text x="180" y="286" fill="#b7c3cf" font-family="Arial, sans-serif" font-size="22" text-anchor="middle">${escapedName}</text>
      </svg>
    `.trim();
    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
  }

  private showFallbackPedalImage(effectImage: HTMLImageElement, effectFallback: HTMLDivElement): void
  {
    effectImage.classList.remove("missing");
    effectFallback.classList.remove("visible");
    effectImage.src = this.createFallbackPedalImage(effectFallback.textContent ?? "No Image");
  }

  private tryNextEffectImage(effectImage: HTMLImageElement, effectFallback: HTMLDivElement): void
  {
    let candidatesText = effectImage.dataset.imageCandidates;
    if (candidatesText === undefined) {
      this.showFallbackPedalImage(effectImage, effectFallback);
      return;
    }
    let candidates: string[] = [];
    try {
      candidates = JSON.parse(candidatesText) as string[];
    }
    catch {
      this.showFallbackPedalImage(effectImage, effectFallback);
      return;
    }
    let currentIndex = Number.parseInt(effectImage.dataset.imageIndex ?? "0");
    let nextIndex = currentIndex + 1;
    effectImage.dataset.imageIndex = nextIndex.toString();
    if (nextIndex < candidates.length) {
      effectImage.src = candidates[nextIndex];
      return;
    }
    this.showFallbackPedalImage(effectImage, effectFallback);
  }

  private updateEffectImage(effectImage: HTMLImageElement, effectFallback: HTMLDivElement, effectName: string, effectImageNames: string[]): void {
    let candidates = this.getEffectImageCandidates(effectImageNames);
    effectFallback.textContent = effectName;
    if (candidates.length === 0) {
      this.showFallbackPedalImage(effectImage, effectFallback);
      return;
    }

    let candidatesText = JSON.stringify(candidates);
    if (effectImage.dataset.imageCandidates !== candidatesText || effectImage.classList.contains("missing")) {
      effectImage.classList.remove("missing");
      effectFallback.classList.remove("visible");
      effectImage.dataset.imageCandidates = candidatesText;
      effectImage.dataset.imageIndex = "0";
      effectImage.src = candidates[0];
    }
  }

  private setParameterEditorMessage(message: string): void {
    this.parameterSelectionPointer.classList.remove("visible");
    this.parameterTable.style.display = "table";
    while (this.parameterTable.firstChild !== null)
      this.parameterTable.removeChild(this.parameterTable.firstChild);
    let row = document.createElement("tr");
    let cell = document.createElement("td");
    cell.classList.add("emptyParameterCell");
    cell.textContent = message;
    row.appendChild(cell);
    this.parameterTable.appendChild(row);
  }

  private setParameterEditorEmpty(): void
  {
    this.parameterSelectionPointer.classList.remove("visible");
    this.parameterTable.style.display = "none";
    while (this.parameterTable.firstChild !== null)
      this.parameterTable.removeChild(this.parameterTable.firstChild);
  }

  private shouldRenderParameter(parameter: { name: string }): boolean
  {
    let name = parameter.name.trim();
    let lowerName = name.toLowerCase();
    if (name.length === 0)
      return false;
    if (lowerName === "blank")
      return false;
    if (lowerName === "hidden-1" || lowerName === "hidden 1")
      return false;
    return true;
  }

  private normalizeStateLabel(value: string): string
  {
    let normalized = value;
    if (ZoomPatch.isNoteHtml(normalized))
      normalized = ZoomPatch.noteHtmlToUTF16(normalized);
    normalized = normalized.trim();
    return normalized;
  }

  private renderSwitchCell(valueCell: HTMLTableCellElement, currentLabel: string, isOn: boolean): void
  {
    valueCell.replaceChildren();
    let valueLabel = document.createElement("div");
    valueLabel.className = "parameterSwitchCurrentValue";
    valueLabel.textContent = currentLabel;

    let track = document.createElement("div");
    track.className = "parameterSwitchTrack";
    let thumb = document.createElement("div");
    thumb.className = "parameterSwitchThumb";
    track.appendChild(thumb);

    valueCell.appendChild(valueLabel);
    valueCell.appendChild(track);
    valueCell.classList.toggle("parameterSwitchOn", isOn);
  }

  private renderParameterEditor(): void {
    let screenCollection = this.cachedScreenCollection;
    let patch = this.cachedPatch;
    let previousScreenCollection = this.cachedPreviousScreenCollection;
    let previousPatch = this.cachedPreviousPatch;
    let effectIDMap = this.cachedEffectIDMap;
    let pedalName = this.cachedPedalName;
    if (screenCollection === undefined || patch === undefined) {
      this.parameterTitle.textContent = "No effect selected";
      this.setParameterEditorMessage("No patch loaded.");
      return;
    }

    if (this.selectedEffectSlot === undefined || !this.visibleEffectSlots.includes(this.selectedEffectSlot)) {
      this.selectedEffectSlot = this.visibleEffectSlots.length > 0 ? this.visibleEffectSlots[0] : undefined;
    }
    if (this.selectedEffectSlot === undefined) {
      this.parameterTitle.textContent = "No effect selected";
      this.setParameterEditorMessage("No visible effect in current patch.");
      return;
    }

    let effectSlot = this.selectedEffectSlot;
    patch.currentEffectSlot = effectSlot;

    let screen = screenCollection.screens[effectSlot];
    let effectID = -1;
    let effectColor = "#3b82f6";
    if (patch.effectSettings !== null && effectSlot < patch.effectSettings.length) {
      effectID = patch.effectSettings[effectSlot].id;
      effectColor = ZoomDevice.getColorFromEffectID(effectID, pedalName);
    }

    let displayParameters = this.getDisplayParameters(screen, patch, effectSlot, effectIDMap, effectID);
    let fallbackName = displayParameters.length > 1 ? displayParameters[1].name : "Effect";
    let effectName = this.resolveEffectName(effectIDMap, effectID, fallbackName);
    this.parameterTitle.textContent = effectName;

    let visibleParameterNumbers: number[] = [];
    for (let parameterNumber = 2; parameterNumber < displayParameters.length; parameterNumber++) {
      if (!this.shouldRenderParameter(displayParameters[parameterNumber]))
        continue;
      visibleParameterNumbers.push(parameterNumber);
    }

    let numParameters = visibleParameterNumbers.length;
    if (numParameters <= 0) {
      this.setParameterEditorEmpty();
      return;
    }
    this.parameterTable.style.display = "table";

    let parameterContainer = this.patchEditorTable.querySelector(".editPatchParametersCell") as HTMLTableCellElement | null;
    let availableWidth = parameterContainer?.clientWidth ?? this.patchEditorTable.clientWidth;
    let cellGap = 18;
    let minCellSize = 96;
    let maxCellSize = 138;
    let maxColumnsFromWidth = Math.max(1, Math.floor((availableWidth + cellGap) / (minCellSize + cellGap)));
    let numColumns = Math.max(1, Math.min(numParameters, maxColumnsFromWidth));
    let fittedCellSize = Math.floor((availableWidth - ((numColumns - 1) * cellGap) - 24) / numColumns);
    fittedCellSize = Math.max(minCellSize, Math.min(maxCellSize, fittedCellSize));
    this.parameterTable.style.setProperty("--param-cell-size", `${fittedCellSize}px`);

    let numRowPairs = Math.max(Math.ceil(numParameters / numColumns), 1);

    while (this.parameterTable.firstChild !== null)
      this.parameterTable.removeChild(this.parameterTable.firstChild);

    let valueRows: HTMLTableRowElement[] = [];
    let nameRows: HTMLTableRowElement[] = [];
    for (let rowPair = 0; rowPair < numRowPairs; rowPair++) {
      let valueRow = document.createElement("tr") as HTMLTableRowElement;
      valueRow.className = "parameterValueRow";
      let nameRow = document.createElement("tr") as HTMLTableRowElement;
      nameRow.className = "parameterNameRow";

      for (let column = 0; column < numColumns; column++) {
        let valueCell = document.createElement("td") as HTMLTableCellElement;
        valueCell.className = "editParameterValueCell";
        this.setupEventListenersForCell(valueCell);
        valueRow.appendChild(valueCell);

        let nameCell = document.createElement("td") as HTMLTableCellElement;
        nameCell.className = "editParameterNameCell";
        nameRow.appendChild(nameCell);
      }

      this.parameterTable.appendChild(valueRow);
      this.parameterTable.appendChild(nameRow);
      valueRows.push(valueRow);
      nameRows.push(nameRow);
    }

    let switchParameterNames = new Set<string>(["attack", "knee", "detect", "mode", "hidden", "type"]);
    let numCellPairsToFill = numColumns * numRowPairs;
    for (let cellPairNumber = 0; cellPairNumber < numCellPairsToFill; cellPairNumber++) {
      let rowPairNumber = Math.floor(cellPairNumber / numColumns);
      let columnNumber = cellPairNumber % numColumns;
      let paramValueRow = valueRows[rowPairNumber];
      let paramNameRow = nameRows[rowPairNumber];

      let nameCell = paramNameRow.children[columnNumber] as HTMLTableCellElement;
      let valueCell = paramValueRow.children[columnNumber] as HTMLTableCellElement;
      valueCell.style.setProperty("--knob-color", "#1296ff");

      if (cellPairNumber < visibleParameterNumbers.length) {
        let parameterNumber = visibleParameterNumbers[cellPairNumber];
        let parameterName = displayParameters[parameterNumber].name;
        this.updateTextContentIfChanged(nameCell, parameterName);
        nameCell.classList.remove("parameterSwitchNameCell");

        let valueString = displayParameters[parameterNumber].valueString;
        if (ZoomPatch.isNoteHtml(valueString)) {
          this.updateTextContentIfChanged(valueCell, ZoomPatch.noteHtmlToUTF16(valueString));
        }
        else {
          this.updateTextContentIfChanged(valueCell, valueString);
        }

        let valueChanged = previousPatch !== undefined && previousPatch.name === patch.name && previousScreenCollection !== undefined &&
          previousScreenCollection.screens.length === screenCollection.screens.length &&
          previousScreenCollection.screens[effectSlot].parameters.length === screen.parameters.length &&
          previousScreenCollection.screens[effectSlot].parameters.length >= 2 &&
          previousScreenCollection.screens[effectSlot].parameters[1].name === screen.parameters[1].name &&
          parameterNumber < screen.parameters.length &&
          previousScreenCollection.screens[effectSlot].parameters.length > parameterNumber &&
          previousScreenCollection.screens[effectSlot].parameters[parameterNumber].valueString !== screen.parameters[parameterNumber].valueString;
        this.updateFontWeightIfChanged(valueCell, valueChanged ? "bold" : "normal");

        valueCell.id = this.encodeEffectAndParameterNumber(effectSlot, parameterNumber);

        let rawValue = -1;
        let maxValue = -1;
        let mappedEffectID = this.resolveEffectIDForMap(effectIDMap, effectID);
        if (effectID !== -1) {
          [rawValue, maxValue] = ZoomDevice.getRawParameterValueFromStringAndMap(effectIDMap, effectID, parameterNumber, valueString);
          if (maxValue === -1 && mappedEffectID !== undefined && mappedEffectID !== effectID) {
            [rawValue, maxValue] = ZoomDevice.getRawParameterValueFromStringAndMap(effectIDMap, mappedEffectID, parameterNumber, valueString);
          }
        }

        let lowerParameterName = parameterName.trim().toLowerCase();
        let isSwitchParameter = maxValue === 1 || switchParameterNames.has(lowerParameterName) || lowerParameterName.startsWith("hidden");
        valueCell.classList.toggle("parameterSwitchCell", isSwitchParameter);
        if (isSwitchParameter) {
          let offLabel = "OFF";
          let onLabel = "ON";
          let labelEffectID = mappedEffectID ?? effectID;
          if (labelEffectID !== -1) {
            offLabel = this.normalizeStateLabel(ZoomDevice.getStringFromRawParameterValueAndMap(effectIDMap, labelEffectID, parameterNumber, 0));
            onLabel = this.normalizeStateLabel(ZoomDevice.getStringFromRawParameterValueAndMap(effectIDMap, labelEffectID, parameterNumber, 1));
          }
          if (offLabel.length === 0)
            offLabel = "OFF";
          if (onLabel.length === 0)
            onLabel = "ON";

          let currentLabel = rawValue > 0 ? onLabel : offLabel;
          this.renderSwitchCell(valueCell, currentLabel, rawValue > 0);
          valueCell.dataset.switchRaw = rawValue.toString();
          valueCell.dataset.switchOffLabel = offLabel;
          valueCell.dataset.switchOnLabel = onLabel;
          valueCell.contentEditable = "false";
          valueCell.tabIndex = 0;
          this.updateBackgroundSizeIfChanged(valueCell, "0%");
        }
        else {
          delete valueCell.dataset.switchRaw;
          delete valueCell.dataset.switchOffLabel;
          delete valueCell.dataset.switchOnLabel;
          valueCell.removeAttribute("tabindex");
          valueCell.contentEditable = supportsContentEditablePlaintextOnly() ? "plaintext-only" : "true";
          valueCell.classList.remove("parameterSwitchOn");
          if (valueCell.childElementCount > 0)
            valueCell.replaceChildren(document.createTextNode(valueString));
          if (effectID !== -1) {
            let percentage = maxValue === -1 ? 0 : (rawValue / maxValue) * 100;
            this.updateBackgroundSizeIfChanged(valueCell, percentage.toFixed(0).toString() + "%");
          }
          else {
            this.updateBackgroundSizeIfChanged(valueCell, "0%");
          }
        }
      }
      else {
        this.updateTextContentIfChanged(nameCell, " ");
        nameCell.classList.remove("parameterSwitchNameCell");
        this.updateTextContentIfChanged(valueCell, " ");
        valueCell.id = "";
        valueCell.classList.remove("parameterSwitchCell");
        valueCell.classList.remove("parameterSwitchOn");
        delete valueCell.dataset.switchRaw;
        delete valueCell.dataset.switchOffLabel;
        delete valueCell.dataset.switchOnLabel;
        valueCell.removeAttribute("tabindex");
        valueCell.contentEditable = supportsContentEditablePlaintextOnly() ? "plaintext-only" : "true";
        if (valueCell.childElementCount > 0)
          valueCell.replaceChildren(document.createTextNode(" "));
        this.updateBackgroundSizeIfChanged(valueCell, "0%");
        this.updateFontWeightIfChanged(valueCell, "normal");
      }
    }
  }

  public update(device: ZoomDevice, screenCollection: ZoomScreenCollection | undefined, patch: ZoomPatch | undefined, patchNumberText: string,
    previousScreenCollection: ZoomScreenCollection | undefined, previousPatch: ZoomPatch | undefined): void
  {
    this.updateFromMap(device.deviceName, device.effectIDMap, device.numParametersPerPage, screenCollection, patch, patchNumberText,
      previousScreenCollection, previousPatch);
  }

  public updateFromMap(pedalName: string, effectIDMap: EffectIDMap | undefined, numParametersPerPage: number, screenCollection: ZoomScreenCollection | undefined, patch: ZoomPatch | undefined,
    patchNumberText: string, previousScreenCollection: ZoomScreenCollection | undefined, previousPatch: ZoomPatch | undefined): void
  {
    shouldLog(LogLevel.Info) && console.log(`ZoomPatchEditor.update() - ${debugCounter++}`);

    this.cachedPedalName = pedalName;
    this.cachedEffectIDMap = effectIDMap;
    this.cachedNumParametersPerPage = numParametersPerPage;
    this.cachedScreenCollection = screenCollection;
    this.cachedPatch = patch;
    this.cachedPreviousScreenCollection = previousScreenCollection;
    this.cachedPreviousPatch = previousPatch;

    if (patch !== undefined) {
      this.updateTextContentIfChanged(this.patchNumberCell, patchNumberText);
      this.updateTextContentIfChanged(this.patchNameCell, patch.nameTrimmed, true);
      this.updateTextContentIfChanged(this.patchTempoCell, patch.tempo.toString().padStart(3, "0"), true);
      this.updateTextContentIfChanged(this.patchDescriptionCell, patch.descriptionEnglishTrimmed ? patch.descriptionEnglishTrimmed : "", true);
    }

    if (screenCollection === undefined || patch === undefined)
      return;

    let numScreens = screenCollection.screens.length;
    this.visibleEffectSlots = this.getVisibleEffectSlots(screenCollection, patch).slice(0, this.maxEffectSlots);
    this.ensureEffectCellCount(this.visibleEffectSlots.length);

    let patchIdentity = this.getPatchIdentity(patch, patchNumberText);
    if (this.lastPatchIdentity !== patchIdentity || this.selectedEffectSlot === undefined || !this.visibleEffectSlots.includes(this.selectedEffectSlot)) {
      this.selectedEffectSlot = this.visibleEffectSlots.length > 0 ? this.visibleEffectSlots[0] : undefined;
      this.lastPatchIdentity = patchIdentity;
    }

    for (let effectColumn = 0; effectColumn < this.visibleEffectSlots.length; effectColumn++) {
      let cellWithEffectTable = this.effectsRow.children[effectColumn] as HTMLTableCellElement;
      let effectSlot = this.visibleEffectSlots[effectColumn];
      let screen = screenCollection.screens[effectSlot];
      let effectTable = cellWithEffectTable.firstElementChild as HTMLTableElement | null;
      if (!(effectTable instanceof HTMLTableElement)) {
        effectTable = this.createEffectCard();
        cellWithEffectTable.appendChild(effectTable);
      }

      effectTable.dataset.effectSlot = effectSlot.toString();

      let effectOnOffButton = effectTable.querySelector(".effectOnOffButton") as HTMLButtonElement;
      let effectNameLabel = effectTable.querySelector(".editEffectTableEffectName") as HTMLSpanElement;
      let effectSelectButton = effectTable.querySelector(".effectSelectButton") as HTMLButtonElement;
      let effectAddLeftButton = effectTable.querySelector(".effectAddLeftButton") as HTMLButtonElement;
      let effectMoveLeftButton = effectTable.querySelector(".effectMoveLeftButton") as HTMLButtonElement;
      let effectDeleteButton = effectTable.querySelector(".effectDeleteButton") as HTMLButtonElement;
      let effectMoveRightButton = effectTable.querySelector(".effectMoveRightButton") as HTMLButtonElement;
      let effectAddRightButton = effectTable.querySelector(".effectAddRightButton") as HTMLButtonElement;
      let effectLed = effectTable.querySelector(".effectLed") as HTMLButtonElement;
      let effectLedToggle = effectTable.querySelector(".effectLedToggle") as HTMLButtonElement;
      let effectImage = effectTable.querySelector(".effectPedalImage") as HTMLImageElement;
      let effectFallback = effectTable.querySelector(".effectPedalFallback") as HTMLDivElement;

      for (let button of [effectOnOffButton, effectSelectButton, effectAddLeftButton, effectMoveLeftButton, effectDeleteButton, effectMoveRightButton, effectAddRightButton, effectLedToggle]) {
        button.dataset.effectSlot = effectSlot.toString();
      }

      effectMoveRightButton.disabled = (effectSlot === 0);
      effectMoveLeftButton.disabled = (effectSlot === numScreens - 1);
      effectAddRightButton.disabled = (numScreens === patch.maxNumEffects);
      effectAddLeftButton.disabled = (numScreens === patch.maxNumEffects);

      let effectID = -1;
      let effectColor = "#3b82f6";
      let effectColorRGB = "rgb(59, 130, 246)";
      if (patch.effectSettings !== null && effectSlot < patch.effectSettings.length) {
        effectID = patch.effectSettings[effectSlot].id;
        effectColor = ZoomDevice.getColorFromEffectID(effectID, pedalName);
        let r = parseInt(effectColor.substring(1, 3), 16);
        let g = parseInt(effectColor.substring(3, 5), 16);
        let b = parseInt(effectColor.substring(5, 7), 16);
        effectColorRGB = `rgb(${this.clamp(r)}, ${this.clamp(g)}, ${this.clamp(b)})`;
      }
      effectTable.style.borderColor = effectColorRGB;

      let displayParameters = this.getDisplayParameters(screen, patch, effectSlot, effectIDMap, effectID);
      let fallbackName = displayParameters.length > 1 ? displayParameters[1].name : "Effect";
      let effectName = this.resolveEffectName(effectIDMap, effectID, fallbackName);
      let isBlankEffect = this.isBlankEffectName(effectName) || this.isBlankEffectName(fallbackName);
      this.updateTextContentIfChanged(effectNameLabel, effectName);
      let effectImageNames = this.getEffectImageNames(pedalName, effectID, effectName, fallbackName);
      this.updateEffectImage(effectImage, effectFallback, effectName, effectImageNames);
      effectTable.classList.toggle("blankEffect", isBlankEffect);
      effectTable.draggable = !isBlankEffect;
      effectOnOffButton.disabled = isBlankEffect;
      effectLedToggle.disabled = isBlankEffect;
      effectLed.classList.toggle("blank", isBlankEffect);

      let effectTableClass = "editEffectTable";
      if (this.selectedEffectSlot === effectSlot)
        effectTableClass += " editEffectSlot";
      let effectIsEnabled = true;
      if (patch.effectSettings !== null && effectSlot < patch.effectSettings.length)
        effectIsEnabled = patch.effectSettings[effectSlot].enabled;
      else if (displayParameters.length > 0)
        effectIsEnabled = displayParameters[0].valueString !== "0";
      if (isBlankEffect)
        effectIsEnabled = true;

      if (!effectIsEnabled && !isBlankEffect) {
        effectTableClass += " editEffectOff";
        effectOnOffButton.classList.remove("on");
        this.updateTextContentIfChanged(effectOnOffButton, "radio_button_unchecked");
        effectLed.classList.remove("on");
      }
      else {
        if (!isBlankEffect) {
          effectOnOffButton.classList.add("on");
          this.updateTextContentIfChanged(effectOnOffButton, "radio_button_checked");
          effectLed.classList.add("on");
        }
        else {
          effectOnOffButton.classList.remove("on");
          this.updateTextContentIfChanged(effectOnOffButton, "radio_button_unchecked");
          effectLed.classList.remove("on");
        }
      }
      effectTable.className = effectTableClass;
    }

    this.renderParameterEditor();
    this.scheduleParameterSelectionPointerPositionUpdate();
  }

  private getEffectSlotFromEvent(event: Event): number | undefined {
    let button = event.currentTarget as HTMLElement;
    if (button.dataset.effectSlot === undefined)
      return undefined;
    let effectSlot = Number.parseInt(button.dataset.effectSlot);
    if (Number.isNaN(effectSlot))
      return undefined;
    return effectSlot;
  }

  onEffectSlotOnOffButtonClick(event: MouseEvent): any
  {
    let effectSlot = this.getEffectSlotFromEvent(event);
    if (effectSlot === undefined)
      return;
    let button = event.currentTarget as HTMLButtonElement;
    if (this.effectSlotOnOffCallback !== undefined)
      this.effectSlotOnOffCallback(effectSlot, !button.classList.contains("on"));
  }

  onEffectSlotMoveButtonClick(event: MouseEvent, direction: "left" | "right"): any
  {
    let effectSlot = this.getEffectSlotFromEvent(event);
    if (effectSlot === undefined)
      return;
    if (this.effectSlotMoveCallback !== undefined)
      this.effectSlotMoveCallback(effectSlot, direction);
  }

  onEffectSlotAddButtonClick(event: MouseEvent, direction: "left" | "right"): any
  {
    let effectSlot = this.getEffectSlotFromEvent(event);
    if (effectSlot === undefined)
      return;
    if (this.effectSlotAddCallback !== undefined)
      this.effectSlotAddCallback(effectSlot, direction);
  }

  onEffectSlotDeleteButtonClick(event: MouseEvent): any
  {
    let effectSlot = this.getEffectSlotFromEvent(event);
    if (effectSlot === undefined)
      return;
    if (this.effectSlotDeleteCallback !== undefined)
      this.effectSlotDeleteCallback(effectSlot);
  }

  onEffectSlotSelectEffectButtonClick(event: MouseEvent): any
  {
    let effectSlot = this.getEffectSlotFromEvent(event);
    if (effectSlot === undefined)
      return;
    if (this.effectSlotSelectEffectCallback !== undefined)
      this.effectSlotSelectEffectCallback(effectSlot);
  }

  updateValueBar(cell: HTMLTableCellElement, rawValue: number, maxValue: number)
  {
    if (maxValue <= 0)
      return;
    let percentage = (rawValue / maxValue) * 100;
    cell.style.backgroundSize = percentage.toFixed(0).toString() + "%";
    cell.style.setProperty("--value-percent", percentage.toFixed(0));
  }
}
