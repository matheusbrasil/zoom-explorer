import { htmlToElement, supportsContentEditablePlaintextOnly } from "./htmltools.js";
import { EffectIDMap, EffectParameterMap, ZoomDevice } from "./ZoomDevice.js";
import { ZoomPatch } from "./ZoomPatch.js";
import { ZoomScreen, ZoomScreenCollection } from "./ZoomScreenInfo.js";
import zoomEffectIDsMS60BPlus from "./zoom-effect-ids-ms60bp.js";
import zoomEffectIDsMS50GPlus from "./zoom-effect-ids-ms50gp.js";
import zoomEffectIDsMS70CDRPlus from "./zoom-effect-ids-ms70cdrp.js";
import zoomEffectIDsG2FOUR from "./zoom-effect-ids-g2four.js";
import zoomEffectIDsB2FOUR from "./zoom-effect-ids-b2four.js";

export type EditPatchTextEditedListenerType = (event: Event, type: string, initialValueString: string) => boolean;
export type EditPatchMouseEventListenerType = (cell: HTMLTableCellElement, initialValueString: string, x: number, y: number) => void;
export type EditPatchEffectSlotOnOffListenerType = (effectSlot: number, on: boolean) => void;
export type EditPatchEffectSlotDeleteListenerType = (effectSlot: number) => void;
export type EditPatchEffectSlotMoveListenerType = (effectSlot: number, direction: "left" | "right") => void;
export type EditPatchEffectSlotAddListenerType = (effectSlot: number, direction: "left" | "right") => void;
export type EditPatchEffectSlotSelectEffectListenerType = (effectSlot: number) => void;
export type EditPatchEffectSlotSelectListenerType = (effectSlot: number) => void;

export class ZoomPatchEditor
{
  private static readonly BPM_TEMPO_MIN = 40;
  private static readonly BPM_TEMPO_MAX = 250;
  private parameterSelectionPointerUpdatePending = false;
  private parameterEditorHasVisibleParameters = false;
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
  private patchNumberText: HTMLSpanElement;
  private patchNameCell: HTMLTableCellElement;
  private patchNameText: HTMLElement;
  private patchTempoCell: HTMLTableCellElement;
  private patchDescriptionCell: HTMLTableCellElement;

  private currentMouseMoveCell: HTMLTableCellElement | undefined = undefined;
  private initialMouseMoveCellText = "";
  private mouseDownX = 0;
  private mouseDownY = 0;

  private draggedEffectSlot: number | undefined = undefined;

  // Mobile touch drag-and-drop state
  private touchDragSourceSlot: number | undefined = undefined;
  private touchDragTargetSlot: number | undefined = undefined;
  private touchDragActive = false;
  private touchDragGhost: HTMLElement | undefined = undefined;
  private touchDragStartX = 0;
  private touchDragStartY = 0;
  private touchDragLongPressTimer: ReturnType<typeof setTimeout> | undefined = undefined;
  private selectedEffectSlot: number | undefined = undefined;
  private lastPatchIdentity = "";
  private visibleEffectSlots: number[] = [];
  private effectImageCandidatesCache = new Map<string, string[]>();
  private effectImageRelativeCandidatesCache = new Map<string, string[]>();
  private resolvedEffectImageSrcCache = new Map<string, string>();
  private missingEffectImageCandidates = new Set<string>();

  private cachedPedalName = "";
  private cachedEffectIDMap: EffectIDMap | undefined = undefined;
  private cachedNumParametersPerPage = 4;
  private cachedScreenCollection: ZoomScreenCollection | undefined = undefined;
  private cachedPatch: ZoomPatch | undefined = undefined;
  private cachedPreviousScreenCollection: ZoomScreenCollection | undefined = undefined;
  private cachedPreviousPatch: ZoomPatch | undefined = undefined;

  private isMobileUIMode(): boolean {
    return document.body.classList.contains("mobile-ui-mode");
  }

  private isPortraitMobileUIMode(): boolean {
    return this.isMobileUIMode() && window.matchMedia("(orientation: portrait) and (max-width: 430px)").matches;
  }

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
    const patchNumberText = this.patchEditorTable.querySelector(".editPatchTableNumberText");
    const patchNameCell = this.patchEditorTable.querySelector(".editPatchTableName");
    const patchNameText = this.patchEditorTable.querySelector(".editPatchNameText");
    const patchTempoCell = this.patchEditorTable.querySelector(".editPatchTableTempoValue");
    const patchDescriptionCell = this.patchEditorTable.querySelector(".editPatchTableDescription");

    if (!(effectsTable instanceof HTMLTableElement) ||
      !(effectsViewport instanceof HTMLDivElement) ||
      !(parameterTable instanceof HTMLTableElement) ||
      !(parameterTitle instanceof HTMLSpanElement) ||
      !(parameterSelectionPointer instanceof HTMLDivElement) ||
      !(patchNumberCell instanceof HTMLTableCellElement) ||
      !(patchNumberText instanceof HTMLSpanElement) ||
      !(patchNameCell instanceof HTMLTableCellElement) ||
      !(patchNameText instanceof HTMLElement) ||
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
    this.patchNumberText = patchNumberText;
    this.patchNameCell = patchNameCell;
    this.patchNameText = patchNameText;
    this.patchTempoCell = patchTempoCell;
    this.patchDescriptionCell = patchDescriptionCell;

    while (this.effectsRow.lastChild)
      this.effectsRow.removeChild(this.effectsRow.lastChild);

    // Set up event listeners for patch name text (span inside the cell)
    this.patchNameText.addEventListener("input", (e) => {
        if (this.textEditedCallback !== undefined)
          this.textEditedCallback(e, "input", this.undoOnEscape);
    });
    this.patchNameText.addEventListener("focus", (e) => {
        this.undoOnEscape = this.patchNameText.innerText;
        if (this.textEditedCallback !== undefined)
          this.textEditedCallback(e, "focus", this.undoOnEscape);
    });
    this.patchNameText.addEventListener("blur", (e) => {
        if (this.textEditedCallback !== undefined) {
          let acceptEdit = this.textEditedCallback(e, "blur", this.undoOnEscape);
          if (!acceptEdit)
            this.patchNameText.innerText = this.undoOnEscape;
        }
    });
    this.patchNameText.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          this.patchNameText.blur();
        }
        else if (e.key === "Escape" || e.key === "Esc") {
          this.patchNameText.innerText = this.undoOnEscape;
          if (this.textEditedCallback !== undefined)
            this.textEditedCallback(e, "input", this.undoOnEscape);
          this.patchNameText.blur();
        }
    });
    
    // Set up event listeners for tempo and description cells
    for (let cell of [this.patchTempoCell, this.patchDescriptionCell]) {
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
      // Effect card touch drag takes priority over knob drag
      if (this.touchDragSourceSlot !== undefined) {
        if (this.touchDragActive) e.preventDefault();
        this.onEffectCardTouchMove(e);
        if (this.touchDragActive) return;
      }
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
      if (this.touchDragSourceSlot !== undefined) {
        const wasDragActive = this.touchDragActive;
        this.onEffectCardTouchEnd(e);
        if (wasDragActive) return; // drag committed; skip knob drag cleanup
      }
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

    window.addEventListener("touchcancel", () => {
      if (this.touchDragSourceSlot !== undefined)
        this.removeTouchDragState();
      let draggingCells = this.patchEditorTable.querySelectorAll(".editParameterValueCell.knobDragging");
      for (let draggingCell of draggingCells)
        draggingCell.classList.remove("knobDragging");
      this.currentMouseMoveCell = undefined;
      this.initialMouseMoveCellText = "";
    });

    this.effectsViewport.addEventListener("touchstart", (event) => this.onEffectCardTouchDragStart(event), { passive: true });

    this.effectsViewport.addEventListener("scroll", () => this.scheduleParameterSelectionPointerPositionUpdate(), { passive: true });
    window.addEventListener("resize", () => this.scheduleParameterSelectionPointerPositionUpdate());
  }

  createHTML(includeControls: boolean): HTMLTableElement
  {
    const tableID = includeControls ? ` id="editPatchTableID"` : "";
    const patchNameID = includeControls ? ` id="editPatchTableNameID"` : "";
    const patchTempoID = includeControls ? ` id="editPatchTableTempoValueID"` : "";
    const patchDescriptionID = includeControls ? ` id="editPatchTableDescriptionID"` : "";
    const patchSelectorButtonID = includeControls ? ` id="patchSelectorButton"` : "";
    const patchSelectorMenuID = includeControls ? ` id="patchSelectorMenu"` : "";
    const patchSelectorDropdownID = includeControls ? ` id="patchSelectorDropdown"` : "";
    const patchDirtyIndicatorID = includeControls ? ` id="patchDirtyIndicator"` : "";
    const deleteCurrentPatchButtonID = includeControls ? ` id="deleteCurrentPatchButton"` : "";
    const savePatchToDiskButtonID = includeControls ? ` id="savePatchToDiskButton"` : "";
    const loadPatchFromDiskButtonID = includeControls ? ` id="loadPatchFromDiskButton"` : "";
    const loadPatchFromTextButtonID = includeControls ? ` id="loadPatchFromTextButton"` : "";
    const undoEditPatchButtonID = includeControls ? ` id="undoEditPatchButton"` : "";
    const redoEditPatchButtonID = includeControls ? ` id="redoEditPatchButton"` : "";
    const syncPatchToPedalButtonID = includeControls ? ` id="syncPatchToPedalButton"` : "";
    const mobileOverflowMenuButtonID = includeControls ? ` id="mobileOverflowMenuButton"` : "";
    const mobileOverflowMenuID = includeControls ? ` id="mobileOverflowMenu"` : "";
    const mobileEffectActionMenuButtonID = includeControls ? ` id="mobileEffectActionMenuButton"` : "";
    const mobileEffectActionMenuID = includeControls ? ` id="mobileEffectActionMenu"` : "";
    const mobileEffectActionAddButtonID = includeControls ? ` id="mobileEffectActionAddButton"` : "";
    const mobileEffectActionChangeButtonID = includeControls ? ` id="mobileEffectActionChangeButton"` : "";
    const mobileEffectActionDeleteButtonID = includeControls ? ` id="mobileEffectActionDeleteButton"` : "";

    const topColSpan = includeControls ? 5 : 4;
    const fullColSpan = includeControls ? 5 : 4;
    const patchSelectorHTML = includeControls ? `
            <div class="patchSelectorGroup">
              <button${patchSelectorButtonID} class="patchSelectorButton" type="button" aria-haspopup="dialog" aria-expanded="false" title="Select patch">
                <span class="material-symbols-outlined patchSelectorIconArrow">arrow_drop_down</span>
              </button>
              <select${patchSelectorDropdownID} class="patchSelectorDropdown" tabindex="-1" aria-hidden="true">
                <option value="">Loading patches...</option>
              </select>
            </div>` : "";
    const patchSelectorDialogHTML = includeControls ? `
      <dialog${patchSelectorMenuID} class="patchSelectorDialog" aria-label="Select patch">
        <div class="patchSelectorPanel">
          <header class="patchSelectorHeader">
            <button type="button" class="patchSelectorCloseButton">
              <span class="material-symbols-outlined">arrow_back_ios_new</span>
              <span>Back</span>
            </button>
            <h2 class="patchSelectorTitle">Select Patch</h2>
          </header>
          <div class="patchSelectorList" role="listbox" aria-label="Patches"></div>
        </div>
      </dialog>` : "";
    const actionRowHTML = includeControls ? `
        <tr class="editPatchActionRow">
          <td colspan="${fullColSpan}" class="editPatchActionCell">
            <div class="patchActionButtons">
              <button class="patchActionButton" data-action="add-left"><span class="material-symbols-outlined">add_circle</span><span>Add Effect</span></button>
              <button class="patchActionButton" data-action="delete"><span class="material-symbols-outlined">delete</span><span>Delete Effect</span></button>
              <button class="patchActionButton" data-action="change"><span class="material-symbols-outlined">swap_horiz</span><span>Change Effect</span></button>
            </div>
          </td>
        </tr>` : "";

    let html = `
      <table${tableID} class="editPatchTable">
        <tr class="editPatchTopRow">
          <th class="editPatchTableNumber">
            <span class="editPatchTableNumberText">Patch 00:</span>
            <span${patchDirtyIndicatorID} class="patchDirtyIndicator"></span>
          </th>
          <th class="editPatchTableName">
            <span class="editPatchNameText" contenteditable="plaintext-only"${patchNameID}>Patch Name</span>
            ${patchSelectorHTML}
          </th>
          <th class="editPatchTableTempoValue"${patchTempoID}></th>
          <th class="editPatchTableStatus">
            <div class="topBarActions">
              <button${deleteCurrentPatchButtonID} class="topBarActionButton topBarLabeledActionButton" title="Delete selected patch(es)"><span class="material-symbols-outlined">delete</span><span class="topBarActionLabel">Delete Patch</span></button>
              <button${savePatchToDiskButtonID} class="topBarActionButton topBarLabeledActionButton" title="Export current patch"><span class="material-symbols-outlined">save</span><span class="topBarActionLabel">Export Patch</span></button>
              <button${loadPatchFromDiskButtonID} class="topBarActionButton topBarLabeledActionButton" title="Import patch from file"><span class="material-symbols-outlined">file_open</span><span class="topBarActionLabel">Import Patch</span></button>
              <button${loadPatchFromTextButtonID} class="topBarActionButton topBarLabeledActionButton" title="Import patch from text"><span class="material-symbols-outlined">article_shortcut</span><span class="topBarActionLabel">Import Patch From Text</span></button>
              <button${undoEditPatchButtonID} class="topBarActionButton topBarIconOnly" disabled title="Undo Edit"><span class="material-symbols-outlined">undo</span></button>
              <button${redoEditPatchButtonID} class="topBarActionButton topBarIconOnly" disabled title="Redo Edit"><span class="material-symbols-outlined">redo</span></button>
              <button${syncPatchToPedalButtonID} class="topBarActionButton topBarLabeledActionButton" disabled title="Save to pedal"><span class="material-symbols-outlined">publish</span><span class="topBarActionLabel">Save</span></button>
              <div class="mobileOverflowMenuWrapper">
                <button${mobileOverflowMenuButtonID} class="topBarActionButton" type="button" title="More actions"><span class="material-symbols-outlined">more_vert</span></button>
                <div${mobileOverflowMenuID} class="mobileOverflowMenu">
                  <button class="mobileOverflowMenuItem" data-target="patchSelectorButton">Select Patch</button>
                  <button class="mobileOverflowMenuItem" data-target="deleteCurrentPatchButton">Delete Patch</button>
                  <button class="mobileOverflowMenuItem" data-target="savePatchToDiskButton">Export Patch</button>
                  <button class="mobileOverflowMenuItem" data-target="loadPatchFromDiskButton">Import Patch</button>
                  <button class="mobileOverflowMenuItem" data-target="loadPatchFromTextButton">Import Patch from Text</button>
                </div>
              </div>
            </div>
          </th>
        </tr>
        <tr class="editPatchDescriptionRow">
          <th colspan="4" class="editPatchTableDescription"${patchDescriptionID}></th>
        </tr>
        ${actionRowHTML}
        <tr class="editPatchEffectsRow">
          <td colspan="4" class="editPatchEffectsCell">
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
              <div class="parameterEditorLeft">
                <label class="mobileEffectToggle">
                  <input type="checkbox" class="mobileEffectToggleInput" />
                  <span class="mobileEffectToggleTrack"></span>
                </label>
                <span class="parameterEditorEffectName">No effect selected</span>
              </div>
              <div class="parameterEditorActions">
                <button${mobileEffectActionMenuButtonID} type="button" class="mobileEffectActionButton" title="Effect actions"><span class="material-symbols-outlined">more_vert</span></button>
                <div${mobileEffectActionMenuID} class="mobileEffectActionMenu">
                  <button${mobileEffectActionAddButtonID} type="button" class="mobileEffectActionMenuItem">Add Effect</button>
                  <button${mobileEffectActionChangeButtonID} type="button" class="mobileEffectActionMenuItem">Change Effect</button>
                  <button${mobileEffectActionDeleteButtonID} type="button" class="mobileEffectActionMenuItem">Delete Effect</button>
                </div>
              </div>
            </div>
            <table class="editParameterTable">
              <tr>
                <td class="emptyParameterCell">Select an effect to edit parameters.</td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    ${patchSelectorDialogHTML}
    `;

    const wrapper = document.createElement("div");
    wrapper.innerHTML = html.trim();
    const table = wrapper.querySelector("table.editPatchTable") as HTMLTableElement;
    const dialog = wrapper.querySelector("dialog.patchSelectorDialog") as HTMLDialogElement | null;
    if (dialog !== null) {
      // Remove any pre-existing dialog to avoid duplicate IDs on re-initialization
      const stale = document.getElementById("patchSelectorMenu");
      if (stale !== null)
        stale.remove();
      document.body.appendChild(dialog);
    }
    return table;
  }

  public get htmlElement(): HTMLTableElement
  {
    return this.patchEditorTable;
  }

  hide()
  {
    this.patchEditorTable.style.setProperty("display", "none", "important");
  }

  show()
  {
    this.patchEditorTable.style.removeProperty("display");
  }

  get visible(): boolean
  {
    return this.patchEditorTable.style.display !== "none";
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
        else if (action === "add-left" && this.effectSlotAddCallback !== undefined)
          this.effectSlotAddCallback(effectSlot, "left");
        else if (action === "add-right" && this.effectSlotAddCallback !== undefined)
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
        if (cell.classList.contains("mobileControlCell"))
          return;
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
        if (cell.classList.contains("mobileControlCell"))
          return;
        if (this.textEditedCallback !== undefined)
          this.textEditedCallback(e, "input", this.undoOnEscape);
      });

      cell.addEventListener("focus", (e) => {
        if (cell.classList.contains("mobileControlCell"))
          return;
        this.undoOnEscape = cell.innerText;
        if (this.textEditedCallback !== undefined)
          this.textEditedCallback(e, "focus", this.undoOnEscape);
      });

      cell.addEventListener("blur", (e) => {
        if (cell.classList.contains("mobileControlCell"))
          return;
        if (!this.muteBlurOnEscape)
          if (this.textEditedCallback !== undefined) {
            let acceptEdit = this.textEditedCallback(e, "blur", this.undoOnEscape);
            if (!acceptEdit)
              cell.innerText = this.undoOnEscape;
          }
      });

      cell.addEventListener("mousedown", (e) => {
        if (e.button === 0) {
          if (cell.classList.contains("parameterSwitchCell") && !cell.classList.contains("mobileControlCell")) {
            e.preventDefault();
            cell.focus();
            return;
          }
          if (cell.classList.contains("editParameterValueCell")) {
            if (this.isMobileUIMode()) {
              // In mobile mode, allow native interaction with inputs/switches/selectors — do NOT preventDefault
              let targetEl = e.target as Element;
              if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement || e.target instanceof HTMLLabelElement)
                return;
              if (targetEl.closest(".mobileControlSwitchWrapper") !== null || targetEl.closest(".mobileControlSelector") !== null)
                return;
            }
            e.preventDefault();
            cell.focus();
            if (this.isMobileUIMode())
              return;
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
        if (cell.classList.contains("parameterSwitchCell") && !cell.classList.contains("mobileControlCell")) {
          e.preventDefault();
          cell.focus();
          return;
        }
        if (cell.classList.contains("editParameterValueCell") && this.isMobileUIMode()) {
          // Allow interaction with mobile control elements (slider, dropdown, switch, custom selector)
          if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement || e.target instanceof HTMLLabelElement)
            return;
          let targetEl = e.target as Element;
          // Allow touches on switch wrapper (track span, etc.) and custom selector — don't call preventDefault
          if (targetEl.closest(".mobileControlSwitchWrapper") !== null || targetEl.closest(".mobileControlSelector") !== null)
            return;
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
        // In mobile mode the switch handles its own toggle via the checkbox change event — skip cell-level keydown dispatch
        if (cell.classList.contains("mobileControlCell"))
          return;
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

      cell.addEventListener("mobile-set-raw", (e) => {
        if (this.textEditedCallback !== undefined)
          this.textEditedCallback(e as Event, "mobile-set-raw", this.undoOnEscape);
      });
    }
  }

  private scheduleParameterSelectionPointerPositionUpdate(): void
  {
    if (this.parameterSelectionPointerUpdatePending)
      return;

    this.parameterSelectionPointerUpdatePending = true;
    requestAnimationFrame(() => {
      this.parameterSelectionPointerUpdatePending = false;
      this.updateParameterSelectionPointerPosition();
    });
  }

  private updateParameterSelectionPointerPosition(): void
  {
    if (this.selectedEffectSlot === undefined) {
      this.parameterSelectionPointer.classList.remove("visible");
      return;
    }

    if (this.parameterTable.style.display === "none" || !this.parameterEditorHasVisibleParameters) {
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
              <div class="effectSelectionIndicator"></div>
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
    // Mobile portrait drag starts at the effects viewport level.

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
    effectImage.decoding = "async";
    effectImage.loading = "eager";
    effectImage.addEventListener("error", () => {
      void this.tryNextEffectImage(effectImage, effectFallback);
    });
    effectImage.addEventListener("load", () => {
      this.rememberResolvedEffectImageSource(effectImage);
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

  // ── Mobile touch drag-and-drop ─────────────────────────────────────────────

  private onEffectCardTouchDragStart(event: TouchEvent): void {
    if (!this.isPortraitMobileUIMode()) return;
    if (this.touchDragSourceSlot !== undefined) return;
    if (event.touches.length < 1) return;
    // Let button taps pass through untouched
    if ((event.target as HTMLElement).closest("button") !== null) return;
    const touch = event.touches[0];
    const sourceSlot = this.getEffectSlotAtPoint(touch.clientX, touch.clientY);
    if (sourceSlot === undefined) return;
    this.touchDragStartX = touch.clientX;
    this.touchDragStartY = touch.clientY;
    this.touchDragSourceSlot = sourceSlot;
    this.touchDragTargetSlot = this.touchDragSourceSlot;
    this.touchDragActive = false;
    // Activate drag after a long-press hold of 380ms
    this.touchDragLongPressTimer = setTimeout(() => {
      this.touchDragLongPressTimer = undefined;
      this.touchDragActive = true;
      this.createTouchDragGhost();
      if ("vibrate" in navigator) (navigator as Navigator & { vibrate(p: number): void }).vibrate(40);
    }, 380);
  }

  private getEffectCardBySlot(slot: number): HTMLTableElement | undefined {
    const selector = `.editEffectTable[data-effect-slot="${slot}"]`;
    return this.patchEditorTable.querySelector(selector) as HTMLTableElement | null ?? undefined;
  }

  private getAllEffectCards(): HTMLTableElement[] {
    return Array.from(this.patchEditorTable.querySelectorAll(".editEffectTable[data-effect-slot]"));
  }

  private getEffectSlotAtPoint(clientX: number, clientY: number): number | undefined {
    // Gather bounds for guard rails.
    let minLeft = Number.POSITIVE_INFINITY;
    let maxRight = Number.NEGATIVE_INFINITY;
    let minTop = Number.POSITIVE_INFINITY;
    let maxBottom = Number.NEGATIVE_INFINITY;
    const cards = this.getAllEffectCards();
    for (const card of cards) {
      const rect = card.getBoundingClientRect();
      minLeft = Math.min(minLeft, rect.left);
      maxRight = Math.max(maxRight, rect.right);
      minTop = Math.min(minTop, rect.top);
      maxBottom = Math.max(maxBottom, rect.bottom);
    }
    // If touch is clearly outside the pedal strip, ignore.
    if (!Number.isFinite(minLeft) || clientY < minTop - 16 || clientY > maxBottom + 16 || clientX < minLeft - 24 || clientX > maxRight + 24)
      return undefined;

    // Primary: hit-test inside card rects.
    // Multiple cards can contain the point due to visual overlap, so choose the
    // closest center instead of the first match.
    let containingSlot: number | undefined = undefined;
    let containingDistance = Number.POSITIVE_INFINITY;
    for (const card of cards) {
      if (card.dataset.effectSlot === undefined)
        continue;
      const slot = Number.parseInt(card.dataset.effectSlot);
      if (Number.isNaN(slot))
        continue;
      const rect = card.getBoundingClientRect();
      if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom)
        continue;
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const distance = Math.hypot(clientX - centerX, clientY - centerY);
      if (distance < containingDistance) {
        containingDistance = distance;
        containingSlot = slot;
      }
    }
    if (containingSlot !== undefined)
      return containingSlot;

    // Fallback: pick nearest horizontal card center (useful near edges/gaps)
    let nearestSlot: number | undefined = undefined;
    let nearestDistance = Number.POSITIVE_INFINITY;
    for (const card of cards) {
      if (card.dataset.effectSlot === undefined)
        continue;
      const slot = Number.parseInt(card.dataset.effectSlot);
      if (Number.isNaN(slot))
        continue;
      const rect = card.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const distance = Math.abs(clientX - centerX);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestSlot = slot;
      }
    }
    return nearestSlot;
  }

  private createTouchDragGhost(): void {
    if (this.touchDragSourceSlot === undefined) return;
    const sourceCard = this.getEffectCardBySlot(this.touchDragSourceSlot);
    if (sourceCard === undefined) return;
    sourceCard.classList.add("mobile-drag-source");
    const rect = sourceCard.getBoundingClientRect();
    const ghost = document.createElement("div");
    ghost.className = "mobile-drag-ghost";
    ghost.style.left = `${rect.left}px`;
    ghost.style.top = `${rect.top}px`;
    ghost.style.width = `${rect.width}px`;
    ghost.style.height = `${rect.height}px`;
    // Show the pedal image in the ghost
    const img = sourceCard.querySelector(".effectPedalImage") as HTMLImageElement | null;
    if (img !== null && img.src !== "") {
      const innerImg = document.createElement("img");
      innerImg.src = img.src;
      innerImg.style.cssText = "width:100%;height:100%;object-fit:contain;border-radius:6px;display:block;";
      ghost.appendChild(innerImg);
    }
    document.body.appendChild(ghost);
    this.touchDragGhost = ghost;
  }

  private onEffectCardTouchMove(event: TouchEvent): void {
    if (this.touchDragSourceSlot === undefined || event.touches.length < 1) return;
    const touch = event.touches[0];
    const dx = touch.clientX - this.touchDragStartX;
    const dy = touch.clientY - this.touchDragStartY;
    // Cancel long-press timer if the finger moved significantly before it fired
    if (!this.touchDragActive) {
      if ((Math.abs(dx) > 10 || Math.abs(dy) > 10) && this.touchDragLongPressTimer !== undefined) {
        clearTimeout(this.touchDragLongPressTimer);
        this.touchDragLongPressTimer = undefined;
        this.touchDragSourceSlot = undefined;
      }
      return;
    }
    // Move ghost with finger
    if (this.touchDragGhost !== undefined)
      this.touchDragGhost.style.transform = `translate(${dx}px, ${dy}px) scale(1.12)`;
    const newTarget = this.getEffectSlotAtPoint(touch.clientX, touch.clientY);
    if (newTarget !== undefined && newTarget !== this.touchDragTargetSlot) {
      // Remove highlight from old target
      if (this.touchDragTargetSlot !== undefined && this.touchDragTargetSlot !== this.touchDragSourceSlot)
        this.getEffectCardBySlot(this.touchDragTargetSlot)?.classList.remove("mobile-drag-over");
      this.touchDragTargetSlot = newTarget;
      if (newTarget !== this.touchDragSourceSlot)
        this.getEffectCardBySlot(newTarget)?.classList.add("mobile-drag-over");
    }
  }

  private onEffectCardTouchEnd(event: TouchEvent): void {
    const sourceSlot = this.touchDragSourceSlot;
    const targetSlot = this.touchDragTargetSlot;
    const wasDragActive = this.touchDragActive;
    this.removeTouchDragState();
    if (!wasDragActive) return; // was a tap — let the click event fire normally
    // Prevent the ghost touch from generating a click event
    event.preventDefault();
    if (sourceSlot === undefined || targetSlot === undefined || sourceSlot === targetSlot) return;
    if (this.effectSlotMoveCallback === undefined) return;
    let current = sourceSlot;
    while (current < targetSlot) { this.effectSlotMoveCallback(current, "left"); current++; }
    while (current > targetSlot) { this.effectSlotMoveCallback(current, "right"); current--; }
    this.selectedEffectSlot = targetSlot;
  }

  private removeTouchDragState(): void {
    if (this.touchDragLongPressTimer !== undefined) {
      clearTimeout(this.touchDragLongPressTimer);
      this.touchDragLongPressTimer = undefined;
    }
    this.touchDragGhost?.remove();
    this.touchDragGhost = undefined;
    for (const card of this.getAllEffectCards()) {
      card?.classList.remove("mobile-drag-source", "mobile-drag-over");
    }
    this.touchDragActive = false;
    this.touchDragSourceSlot = undefined;
    this.touchDragTargetSlot = undefined;
  }

  // ── End mobile touch drag-and-drop ─────────────────────────────────────────

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

    // In portrait mobile mode: if this slot is already selected, second tap opens effect selector directly
    if (this.isPortraitMobileUIMode() && this.selectedEffectSlot === effectSlot) {
      if (this.effectSlotSelectEffectCallback !== undefined)
        this.effectSlotSelectEffectCallback(effectSlot);
      return;
    }

    this.selectedEffectSlot = effectSlot;
    this.updateEffectSlotFrame(effectSlot);
    if (this.effectSlotSelectCallback !== undefined)
      this.effectSlotSelectCallback(effectSlot);
  }

  private getFallbackCatalog(pedalName: string): Map<number, string> | undefined {
    let normalized = pedalName.toUpperCase();
    if (normalized.includes("MS-60B+"))
      return zoomEffectIDsMS60BPlus;
    if (normalized.includes("MS-50G+"))
      return zoomEffectIDsMS50GPlus;
    if (normalized.includes("MS-70CDR+"))
      return zoomEffectIDsMS70CDRPlus;
    if (normalized.includes("G2 FOUR") || normalized.includes("G2X FOUR"))
      return zoomEffectIDsG2FOUR;
    if (normalized.includes("B2 FOUR") || normalized.includes("B2X FOUR"))
      return zoomEffectIDsB2FOUR;
    return undefined;
  }

  private getCatalogEffectName(pedalName: string, effectID: number): string | undefined {
    if (effectID === -1)
      return undefined;

    let catalog = this.getFallbackCatalog(pedalName);
    if (catalog === undefined)
      return undefined;

    return catalog.get(effectID) ?? catalog.get(effectID & 0xFFFFFFF0);
  }

  private resolveEffectName(effectIDMap: EffectIDMap | undefined, effectID: number, fallbackName: string, pedalName: string): string {
    let effectMap = this.resolveEffectMap(effectIDMap, effectID);
    if (effectMap !== undefined && effectMap.name.trim().length > 0)
      return effectMap.name;

    let fallbackNormalized = fallbackName.trim().toLowerCase();
    if (fallbackNormalized.length === 0 || fallbackNormalized === "effect") {
      let catalogName = this.getCatalogEffectName(pedalName, effectID);
      if (catalogName !== undefined && catalogName.trim().length > 0)
        return catalogName;
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

  private isBPMEffect(effectID: number, effectName: string): boolean
  {
    let normalizedName = effectName.trim().toLowerCase();
    if (normalizedName === "bpm")
      return true;
    return effectID === 0x07000ff0 || effectID === 0x09000ff0 || effectID === 0x1c000010;
  }

  private getDisplayParameters(screen: ZoomScreen, patch: ZoomPatch, effectSlot: number, effectIDMap: EffectIDMap | undefined, effectID: number):
    { name: string, valueString: string }[]
  {
    let parameters = screen.parameters.map(parameter => ({ name: parameter.name, valueString: parameter.valueString }));
    let effectMap = this.resolveEffectMap(effectIDMap, effectID);
    let bpmLinked = false;
    if (patch.prm2BPMSlot !== null)
      bpmLinked = ((patch.prm2BPMSlot >> effectSlot) & 1) === 1;
    if (!bpmLinked && effectMap !== undefined)
      bpmLinked = this.isBPMEffect(effectID, effectMap.name);

    if (bpmLinked) {
      if (parameters.length > 2)
        parameters = parameters.slice(0, 2);

      if (patch.effectSettings !== null && effectSlot < patch.effectSettings.length) {
        if (parameters.length === 0) {
          parameters.push({ name: "OnOff", valueString: patch.effectSettings[effectSlot].enabled ? "1" : "0" });
        }
        if (parameters.length === 1) {
          let effectName = effectMap?.name ?? parameters[1]?.name ?? "BPM";
          parameters.push({ name: effectName, valueString: effectName });
        }
        else if (parameters[1].name.trim().length === 0 || parameters[1].name === "Effect") {
          parameters[1] = { name: effectMap?.name ?? "BPM", valueString: effectMap?.name ?? "BPM" };
        }
      }

      parameters.push({ name: "Tempo", valueString: patch.tempo.toString().padStart(3, "0") });
      return parameters;
    }

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

  private isThruEffectName(name: string): boolean
  {
    return name.trim().toLowerCase() === "thru";
  }

  private getEffectImageNames(pedalName: string, effectID: number, effectName: string, fallbackName: string): string[]
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

    void pedalName;

    // Prefer deterministic code-based file names to avoid locale and spacing issues.
    if (effectID !== -1) {
      addName(effectID.toString(16).padStart(8, "0").toLowerCase());
      addName(effectID.toString(16).padStart(8, "0").toUpperCase());
      let maskedID = effectID & 0xFFFFFFF0;
      addName(maskedID.toString(16).padStart(8, "0").toLowerCase());
      addName(maskedID.toString(16).padStart(8, "0").toUpperCase());
    }

    let isBlankEffect = this.isBlankEffectName(effectName) || this.isBlankEffectName(fallbackName);
    if (isBlankEffect)
      addName("BLANK");

    return imageNames;
  }

  private isEffectCodeToken(value: string): boolean
  {
    return /^[0-9a-f]{8}$/i.test(value.trim());
  }

  private getEffectImageCandidates(effectNames: string[]): string[]
  {
    let cacheKey = effectNames.map(name => name.trim().toLowerCase()).join("|");
    let cached = this.effectImageCandidatesCache.get(cacheKey);
    if (cached !== undefined)
      return cached;

    let candidates: string[] = [];
    let seen = new Set<string>();
    let pushUrlCandidate = (relativePath: string) => {
      try {
        addCandidate(new URL(relativePath, document.baseURI).toString());
      }
      catch {
        // Keep static candidates below as fallback when URL constructor fails.
      }
    };
    let addCandidate = (candidate: string) => {
      if (seen.has(candidate))
        return;
      seen.add(candidate);
      candidates.push(candidate);
    };

    for (let effectName of effectNames) {
      let variants: string[] = [];
      let variantSeen = new Set<string>();
      let trimmedName = effectName.trim();
      if (this.isEffectCodeToken(trimmedName)) {
        let lowerCode = trimmedName.toLowerCase();
        let upperCode = trimmedName.toUpperCase();
        let encodedLower = encodeURIComponent(lowerCode);
        let encodedUpper = encodeURIComponent(upperCode);

        pushUrlCandidate(`img/effects/${encodedLower}.png`);
        pushUrlCandidate(`img/effects/${encodedUpper}.png`);
        addCandidate(`/img/effects/${encodedLower}.png`);
        addCandidate(`img/effects/${encodedLower}.png`);
        addCandidate(`./img/effects/${encodedLower}.png`);
        addCandidate(`/img/effects/${encodedUpper}.png`);
        addCandidate(`img/effects/${encodedUpper}.png`);
        addCandidate(`./img/effects/${encodedUpper}.png`);
        continue;
      }

      let normalized = effectName
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^\w\s+\-]/g, "")
        .trim();
      let addVariant = (variant: string) => {
        if (variant.length === 0)
          return;
        if (variantSeen.has(variant))
          return;
        variantSeen.add(variant);
        variants.push(variant);
      };

      addVariant(trimmedName);
      addVariant(trimmedName.replace(/\s+/g, " "));
      addVariant(trimmedName.replace(/\s*\/\s*/g, "-"));
      addVariant(trimmedName.replace(/\s*-\s*/g, "-"));
      addVariant(trimmedName.replace(/\s+/g, "-"));
      addVariant(trimmedName.replace(/\s+/g, "_"));
      addVariant(trimmedName.replace(/\s+/g, ""));
      addVariant(trimmedName.toLowerCase().replace(/\s+/g, "-"));
      addVariant(trimmedName.toLowerCase().replace(/\s+/g, "_"));
      addVariant(trimmedName.toLowerCase().replace(/\s+/g, ""));

      if (normalized.length > 0) {
        addVariant(normalized);
        addVariant(normalized.replace(/\s+/g, "-"));
        addVariant(normalized.replace(/\s+/g, "_"));
        addVariant(normalized.replace(/\s+/g, ""));
        addVariant(normalized.toLowerCase().replace(/\s+/g, "-"));
        addVariant(normalized.toLowerCase().replace(/\s+/g, "_"));
        addVariant(normalized.toLowerCase().replace(/\s+/g, ""));
      }

      for (let variant of variants) {
        let encoded = encodeURIComponent(variant);
        let encodedRelative = `img/effects/${encoded}.png`;
        let plainRelative = `img/effects/${variant}.png`;

        pushUrlCandidate(encodedRelative);
        pushUrlCandidate(plainRelative);

        addCandidate(`/img/effects/${encoded}.png`);
        addCandidate(`img/effects/${encoded}.png`);
        addCandidate(`./img/effects/${encoded}.png`);
        addCandidate(`/img/effects/${variant}.png`);
        addCandidate(`img/effects/${variant}.png`);
        addCandidate(`./img/effects/${variant}.png`);
      }
    }

    this.effectImageCandidatesCache.set(cacheKey, candidates);
    return candidates;
  }

  private getEffectImageRelativeCandidates(effectNames: string[]): string[]
  {
    let cacheKey = effectNames.map(name => name.trim().toLowerCase()).join("|");
    let cached = this.effectImageRelativeCandidatesCache.get(cacheKey);
    if (cached !== undefined)
      return cached;

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
      let trimmedName = effectName.trim();
      if (this.isEffectCodeToken(trimmedName)) {
        addCandidate(`img/effects/${trimmedName.toLowerCase()}.png`);
        addCandidate(`img/effects/${trimmedName.toUpperCase()}.png`);
        continue;
      }

      let normalized = effectName
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^\w\s+\-]/g, "")
        .trim();
      let addVariant = (variant: string) => {
        if (variant.length === 0)
          return;
        if (variantSeen.has(variant))
          return;
        variantSeen.add(variant);
        variants.push(variant);
      };

      addVariant(trimmedName);
      addVariant(trimmedName.replace(/\s+/g, " "));
      addVariant(trimmedName.replace(/\s*\/\s*/g, "-"));
      addVariant(trimmedName.replace(/\s*-\s*/g, "-"));
      addVariant(trimmedName.replace(/\s+/g, "-"));
      addVariant(trimmedName.replace(/\s+/g, "_"));
      addVariant(trimmedName.replace(/\s+/g, ""));
      addVariant(trimmedName.toLowerCase().replace(/\s+/g, "-"));
      addVariant(trimmedName.toLowerCase().replace(/\s+/g, "_"));
      addVariant(trimmedName.toLowerCase().replace(/\s+/g, ""));

      if (normalized.length > 0) {
        addVariant(normalized);
        addVariant(normalized.replace(/\s+/g, "-"));
        addVariant(normalized.replace(/\s+/g, "_"));
        addVariant(normalized.replace(/\s+/g, ""));
        addVariant(normalized.toLowerCase().replace(/\s+/g, "-"));
        addVariant(normalized.toLowerCase().replace(/\s+/g, "_"));
        addVariant(normalized.toLowerCase().replace(/\s+/g, ""));
      }

      for (let variant of variants) {
        let encoded = encodeURIComponent(variant);
        addCandidate(`img/effects/${encoded}.png`);
        addCandidate(`img/effects/${variant}.png`);
      }
    }

    this.effectImageRelativeCandidatesCache.set(cacheKey, candidates);
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

  private rememberResolvedEffectImageSource(effectImage: HTMLImageElement): void
  {
    let cacheKey = effectImage.dataset.imageCandidates;
    if (cacheKey === undefined)
      return;
    let src = effectImage.currentSrc || effectImage.src;
    if (src.length === 0)
      return;
    if (src.startsWith("data:image/svg+xml"))
      return;
    this.missingEffectImageCandidates.delete(cacheKey);
    this.resolvedEffectImageSrcCache.set(cacheKey, src);
  }

  private async tryLoadEffectImageFromAppFiles(effectImage: HTMLImageElement, effectFallback: HTMLDivElement): Promise<boolean>
  {
    let api = window.zoomExplorerAPI;
    if (api === undefined || api.readAppBinary === undefined)
      return false;

    let candidatesText = effectImage.dataset.imageRelativeCandidates;
    if (candidatesText === undefined)
      return false;

    let candidates: string[] = [];
    try {
      candidates = JSON.parse(candidatesText) as string[];
    }
    catch {
      return false;
    }

    for (let candidate of candidates) {
      try {
        let base64 = await api.readAppBinary(candidate);
        if (base64.length === 0)
          continue;
        effectImage.classList.remove("missing");
        effectFallback.classList.remove("visible");
        effectImage.src = `data:image/png;base64,${base64}`;
        return true;
      }
      catch {
        // Try next candidate path.
      }
    }

    return false;
  }

  private async tryNextEffectImage(effectImage: HTMLImageElement, effectFallback: HTMLDivElement): Promise<void>
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
    let loadedFromApi = await this.tryLoadEffectImageFromAppFiles(effectImage, effectFallback);
    if (loadedFromApi)
      return;
    this.missingEffectImageCandidates.add(candidatesText);
    this.showFallbackPedalImage(effectImage, effectFallback);
  }

  private updateEffectImage(effectImage: HTMLImageElement, effectFallback: HTMLDivElement, effectName: string, effectImageNames: string[]): void {
    let candidates = this.getEffectImageCandidates(effectImageNames);
    let relativeCandidates = this.getEffectImageRelativeCandidates(effectImageNames);
    effectFallback.textContent = effectName;
    if (candidates.length === 0) {
      this.showFallbackPedalImage(effectImage, effectFallback);
      return;
    }

    let candidatesText = JSON.stringify(candidates);
    let relativeCandidatesText = JSON.stringify(relativeCandidates);
    if (this.missingEffectImageCandidates.has(candidatesText)) {
      effectImage.dataset.imageCandidates = candidatesText;
      effectImage.dataset.imageRelativeCandidates = relativeCandidatesText;
      effectImage.dataset.imageIndex = (candidates.length - 1).toString();
      this.showFallbackPedalImage(effectImage, effectFallback);
      return;
    }

    let resolvedSrc = this.resolvedEffectImageSrcCache.get(candidatesText);
    if (resolvedSrc !== undefined) {
      effectImage.classList.remove("missing");
      effectFallback.classList.remove("visible");
      effectImage.dataset.imageCandidates = candidatesText;
      effectImage.dataset.imageRelativeCandidates = relativeCandidatesText;
      effectImage.dataset.imageIndex = "0";
      if (effectImage.src !== resolvedSrc)
        effectImage.src = resolvedSrc;
      return;
    }

    if (effectImage.dataset.imageCandidates !== candidatesText || effectImage.classList.contains("missing")) {
      effectImage.classList.remove("missing");
      effectFallback.classList.remove("visible");
      effectImage.dataset.imageCandidates = candidatesText;
      effectImage.dataset.imageRelativeCandidates = relativeCandidatesText;
      effectImage.dataset.imageIndex = "0";
      effectImage.src = candidates[0];
    }
  }

  private setParameterEditorMessage(message: string): void {
    this.parameterSelectionPointer.classList.remove("visible");
    this.parameterTable.style.display = "table";
    this.parameterEditorHasVisibleParameters = false;
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
    this.parameterEditorHasVisibleParameters = false;
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

  private renderMobileControlCell(
    valueCell: HTMLTableCellElement,
    parameterName: string,
    currentValue: string,
    rawValue: number,
    minValue: number,
    maxValue: number,
    isSwitchParameter: boolean,
    valueLabels?: string[]): void
  {
    valueCell.replaceChildren();
    valueCell.classList.add("mobileControlCell");

    let nameLabel = document.createElement("span");
    nameLabel.className = "mobileControlName";
    nameLabel.textContent = parameterName;

    let valueLabel = document.createElement("span");
    valueLabel.className = "mobileControlValue";
    valueLabel.textContent = currentValue;

    valueCell.appendChild(nameLabel);

    if (isSwitchParameter) {
      // Toggle switch for ON/OFF parameters (2 values)
      let switchWrapper = document.createElement("div");
      switchWrapper.className = "mobileControlSwitchWrapper";
      let switchInput = document.createElement("input");
      switchInput.type = "checkbox";
      switchInput.className = "mobileControlSwitchInput";
      switchInput.checked = rawValue > 0;
      let switchTrack = document.createElement("span");
      switchTrack.className = "mobileControlSwitchTrack";
      switchInput.addEventListener("change", () => {
        let nextRaw = switchInput.checked ? 1 : 0;
        valueLabel.textContent = nextRaw > 0 ? "ON" : "OFF";
        valueCell.dispatchEvent(new CustomEvent("mobile-set-raw", { bubbles: true, detail: { rawValue: nextRaw } }));
      });
      switchWrapper.appendChild(switchInput);
      switchWrapper.appendChild(switchTrack);
      valueCell.appendChild(switchWrapper);
      valueCell.appendChild(valueLabel);
    }
    else if (valueLabels !== undefined && valueLabels.length >= 3 && valueLabels.length <= 30 && !valueLabels.some((v, i) => v === i.toString())) {
      // Custom popup selector for parameters with 3+ distinct named values
      let selectorContainer = document.createElement("div");
      selectorContainer.className = "mobileControlSelector";
      let selectorValue = document.createElement("span");
      selectorValue.className = "mobileControlSelectorValue";
      selectorValue.textContent = currentValue;
      let selectorChevron = document.createElement("span");
      selectorChevron.className = "mobileControlSelectorChevron";
      selectorChevron.textContent = "▼";
      selectorContainer.appendChild(selectorValue);
      selectorContainer.appendChild(selectorChevron);

      // Create popup modal for value selection
      let createAndShowPopup = () => {
        let backdrop = document.createElement("div");
        backdrop.className = "mobileParameterPopupBackdrop";
        let popup = document.createElement("div");
        popup.className = "mobileParameterPopup";
        let popupTitle = document.createElement("div");
        popupTitle.className = "mobileParameterPopupTitle";
        popupTitle.textContent = parameterName;
        popup.appendChild(popupTitle);

        let popupList = document.createElement("div");
        popupList.className = "mobileParameterPopupList";
        for (let i = 0; i < valueLabels.length; i++) {
          let option = document.createElement("div");
          option.className = "mobileParameterPopupOption";
          if (i === rawValue) option.classList.add("selected");
          option.textContent = valueLabels[i];
          option.addEventListener("click", () => {
            valueCell.dispatchEvent(new CustomEvent("mobile-set-raw", { bubbles: true, detail: { rawValue: i } }));
            selectorValue.textContent = valueLabels[i];
            document.body.removeChild(backdrop);
          });
          popupList.appendChild(option);
        }
        popup.appendChild(popupList);
        backdrop.appendChild(popup);
        backdrop.addEventListener("click", (e) => {
          if (e.target === backdrop) document.body.removeChild(backdrop);
        });
        document.body.appendChild(backdrop);
      };

      selectorContainer.addEventListener("click", createAndShowPopup);
      valueCell.appendChild(selectorContainer);
    }
    else {
      // Slider for numeric/continuous parameters
      let slider = document.createElement("input");
      slider.type = "range";
      slider.className = "mobileControlSlider";
      let minVal = Number.isFinite(minValue) ? minValue : 0;
      let maxVal = Math.max(minVal + 1, Number.isFinite(maxValue) ? maxValue : 1);
      slider.min = minVal.toString();
      slider.max = maxVal.toString();
      slider.step = "1";
      slider.value = Math.max(minVal, Math.min(maxVal, rawValue)).toString();
      
      // Set initial fill on the CARD (not the slider) so the entire row background is the fill
      let range = Math.max(1, maxVal - minVal);
      let fillPercent = ((Number.parseInt(slider.value) - minVal) / range) * 100;
      valueCell.classList.add("mobileSliderCard");
      valueCell.style.setProperty("--slider-fill", `${fillPercent}%`);
      
      slider.addEventListener("input", () => {
        let nextRaw = Number.parseInt(slider.value);
        let percent = ((nextRaw - minVal) / range) * 100;
        valueCell.style.setProperty("--slider-fill", `${percent}%`);
        // Update value label immediately for live feedback during drag
        valueLabel.textContent = nextRaw.toString();
      });
      slider.addEventListener("change", () => {
        let nextRaw = Number.parseInt(slider.value);
        valueCell.dispatchEvent(new CustomEvent("mobile-set-raw", { bubbles: true, detail: { rawValue: nextRaw } }));
      });
      valueCell.appendChild(slider);
      valueCell.appendChild(valueLabel);
    }

    valueCell.contentEditable = "false";
    valueCell.tabIndex = 0;
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
    let effectName = this.resolveEffectName(effectIDMap, effectID, fallbackName, pedalName);
    let isBlankEffect = this.isBlankEffectName(effectName) || this.isBlankEffectName(fallbackName);
    this.parameterTitle.textContent = effectName;

    // Update mobile effect on/off toggle — hide it for blank/THRU effects
    let effectToggle = this.patchEditorTable.querySelector(".mobileEffectToggleInput") as HTMLInputElement | null;
    let effectToggleLabel = this.patchEditorTable.querySelector(".mobileEffectToggle") as HTMLElement | null;
    if (effectToggleLabel !== null) {
      if (isBlankEffect)
        effectToggleLabel.style.setProperty("display", "none", "important");
      else
        effectToggleLabel.style.removeProperty("display");
    }
    if (effectToggle !== null && patch.effectSettings !== null && effectSlot < patch.effectSettings.length) {
      let isEffectOn = patch.effectSettings[effectSlot].enabled;
      effectToggle.checked = isEffectOn;
    }

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
    this.parameterEditorHasVisibleParameters = true;

    let parameterContainer = this.patchEditorTable.querySelector(".editPatchParametersCell") as HTMLTableCellElement | null;
    let availableWidth = parameterContainer?.clientWidth ?? this.patchEditorTable.clientWidth;
    let mobileMode = this.isMobileUIMode();
    let portraitMobileMode = this.isPortraitMobileUIMode();
    let cellGap = mobileMode ? 8 : 18;
    let minCellSize = mobileMode ? 64 : 96;
    let maxCellSize = mobileMode ? 82 : 138;
    let maxColumnsFromWidth = Math.max(1, Math.floor((availableWidth + cellGap) / (minCellSize + cellGap)));
    let numColumns = Math.max(1, Math.min(numParameters, maxColumnsFromWidth));
    if (portraitMobileMode)
      numColumns = 1;
    else if (mobileMode)
      numColumns = Math.min(Math.max(numColumns, 4), numParameters);
    let fittedCellSize = Math.floor((availableWidth - ((numColumns - 1) * cellGap) - 24) / numColumns);
    fittedCellSize = Math.max(minCellSize, Math.min(maxCellSize, fittedCellSize));
    this.parameterTable.style.setProperty("--param-cell-size", `${fittedCellSize}px`);

    let numRowPairs = Math.max(Math.ceil(numParameters / numColumns), 1);

    while (this.parameterTable.firstChild !== null)
      this.parameterTable.removeChild(this.parameterTable.firstChild);

    let valueRows: HTMLTableRowElement[] = [];
    let nameRows: HTMLTableRowElement[] = [];
    let switchParameterNames = new Set<string>(["attack", "knee", "detect", "mode", "hidden", "type"]);
    
    // Only create cells for parameters that actually exist (no empty placeholders)
    for (let paramIndex = 0; paramIndex < numParameters; paramIndex++) {
      let rowIndex = Math.floor(paramIndex / numColumns);
      let columnIndex = paramIndex % numColumns;
      
      // Create row pairs only when needed
      while (valueRows.length <= rowIndex) {
        let valueRow = document.createElement("tr") as HTMLTableRowElement;
        valueRow.className = "parameterValueRow";
        let nameRow = document.createElement("tr") as HTMLTableRowElement;
        nameRow.className = "parameterNameRow";
        this.parameterTable.appendChild(valueRow);
        this.parameterTable.appendChild(nameRow);
        valueRows.push(valueRow);
        nameRows.push(nameRow);
      }
      
      let valueCell = document.createElement("td") as HTMLTableCellElement;
      valueCell.className = "editParameterValueCell";
      this.setupEventListenersForCell(valueCell);
      valueRows[rowIndex].appendChild(valueCell);

      let nameCell = document.createElement("td") as HTMLTableCellElement;
      nameCell.className = "editParameterNameCell";
      nameRows[rowIndex].appendChild(nameCell);
    }
    
    for (let cellPairNumber = 0; cellPairNumber < numParameters; cellPairNumber++) {
      let rowPairNumber = Math.floor(cellPairNumber / numColumns);
      let columnNumber = cellPairNumber % numColumns;
      let paramValueRow = valueRows[rowPairNumber];
      let paramNameRow = nameRows[rowPairNumber];

      let nameCell = paramNameRow.children[columnNumber] as HTMLTableCellElement;
      let valueCell = paramValueRow.children[columnNumber] as HTMLTableCellElement;
      valueCell.style.setProperty("--knob-color", "#1296ff");

      let parameterNumber = visibleParameterNumbers[cellPairNumber];
        let parameterName = displayParameters[parameterNumber].name;
        this.updateTextContentIfChanged(nameCell, parameterName);
        nameCell.classList.remove("parameterSwitchNameCell");
      nameCell.classList.toggle("mobileHiddenParameterName", portraitMobileMode);

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
        let effectMapForParameter = this.resolveEffectMap(effectIDMap, effectID);
        let bpmLinkedParameter = parameterNumber === 2 &&
          (((patch.prm2BPMSlot ?? 0) >> effectSlot & 1) === 1 || this.isBPMEffect(effectID, effectMapForParameter?.name ?? ""));
        if (effectID !== -1) {
          [rawValue, maxValue] = ZoomDevice.getRawParameterValueFromStringAndMap(effectIDMap, effectID, parameterNumber, valueString);
          if (maxValue === -1 && mappedEffectID !== undefined && mappedEffectID !== effectID) {
            [rawValue, maxValue] = ZoomDevice.getRawParameterValueFromStringAndMap(effectIDMap, mappedEffectID, parameterNumber, valueString);
          }
        }
        if (bpmLinkedParameter) {
          rawValue = patch.tempo;
          maxValue = ZoomPatchEditor.BPM_TEMPO_MAX;
        }

        let lowerParameterName = parameterName.trim().toLowerCase();
        let isSwitchParameter = maxValue === 1 || switchParameterNames.has(lowerParameterName) || lowerParameterName.startsWith("hidden");
        valueCell.classList.toggle("parameterSwitchCell", isSwitchParameter);
        valueCell.classList.toggle("mobileControlCell", mobileMode);
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
          if (mobileMode)
            this.renderMobileControlCell(valueCell, parameterName, currentLabel, rawValue, 0, 1, true);
          this.updateBackgroundSizeIfChanged(valueCell, "0%");
        }
        else {
          delete valueCell.dataset.switchRaw;
          delete valueCell.dataset.switchOffLabel;
          delete valueCell.dataset.switchOnLabel;
          valueCell.removeAttribute("tabindex");
          valueCell.contentEditable = supportsContentEditablePlaintextOnly() ? "plaintext-only" : "true";
          valueCell.classList.remove("parameterSwitchOn");
          if (mobileMode) {
            let paramValueLabels: string[] | undefined = undefined;
            let paramIndex = parameterNumber - 2;
            let resolvedID = mappedEffectID ?? effectID;
            if (resolvedID !== -1 && effectIDMap !== undefined) {
              let effectMap = effectIDMap.get(resolvedID);
              if (effectMap !== undefined && paramIndex >= 0 && paramIndex < effectMap.parameters.length) {
                let pvm = effectMap.parameters[paramIndex];
                if (pvm.maxNumerical === undefined && pvm.values.length >= 3)
                  paramValueLabels = pvm.values;
              }
            }
            this.renderMobileControlCell(
              valueCell,
              parameterName,
              valueString,
              rawValue,
              bpmLinkedParameter ? ZoomPatchEditor.BPM_TEMPO_MIN : 0,
              Math.max(1, maxValue),
              false,
              paramValueLabels
            );
          }
          else if (valueCell.childElementCount > 0)
            valueCell.replaceChildren(document.createTextNode(valueString));
          if (effectID !== -1) {
            let percentage = 0;
            if (maxValue !== -1) {
              if (bpmLinkedParameter) {
                let range = ZoomPatchEditor.BPM_TEMPO_MAX - ZoomPatchEditor.BPM_TEMPO_MIN;
                percentage = range <= 0 ? 0 : ((rawValue - ZoomPatchEditor.BPM_TEMPO_MIN) / range) * 100;
              }
              else {
                percentage = (rawValue / maxValue) * 100;
              }
            }
            percentage = Math.max(0, Math.min(100, percentage));
            if (!mobileMode)
              this.updateBackgroundSizeIfChanged(valueCell, percentage.toFixed(0).toString() + "%");
            else
              this.updateBackgroundSizeIfChanged(valueCell, "0%");
          }
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
    this.cachedPedalName = pedalName;
    this.cachedEffectIDMap = effectIDMap;
    this.cachedNumParametersPerPage = numParametersPerPage;
    this.cachedScreenCollection = screenCollection;
    this.cachedPatch = patch;
    this.cachedPreviousScreenCollection = previousScreenCollection;
    this.cachedPreviousPatch = previousPatch;

    if (patch !== undefined) {
      this.updateTextContentIfChanged(this.patchNumberText, patchNumberText);
      this.updateTextContentIfChanged(this.patchNameText, patch.nameTrimmed, true);
      this.patchNameText.title = patch.nameTrimmed;
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
      let effectName = this.resolveEffectName(effectIDMap, effectID, fallbackName, pedalName);
      let isBlankEffect = this.isBlankEffectName(effectName) || this.isBlankEffectName(fallbackName);
      let isThruEffect = this.isThruEffectName(effectName) || this.isThruEffectName(fallbackName);
      this.updateTextContentIfChanged(effectNameLabel, effectName);
      let effectImageNames = this.getEffectImageNames(pedalName, effectID, effectName, fallbackName);
      this.updateEffectImage(effectImage, effectFallback, effectName, effectImageNames);
      effectTable.draggable = !isBlankEffect;
      effectOnOffButton.disabled = isBlankEffect;
      effectLedToggle.disabled = isBlankEffect;
      effectAddLeftButton.disabled = effectAddLeftButton.disabled || isBlankEffect;
      effectAddRightButton.disabled = effectAddRightButton.disabled || isBlankEffect;
      effectLed.classList.toggle("blank", isBlankEffect);

      let effectTableClass = "editEffectTable";
      if (this.selectedEffectSlot === effectSlot)
        effectTableClass += " editEffectSlot";
      if (isBlankEffect)
        effectTableClass += " blankEffect";
      if (isThruEffect)
        effectTableClass += " thruEffect";
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

  updateValueBar(cell: HTMLTableCellElement, rawValue: number, maxValue: number, minValue: number = 0)
  {
    if (maxValue <= minValue)
      return;
    let percentage = ((rawValue - minValue) / (maxValue - minValue)) * 100;
    percentage = Math.max(0, Math.min(100, percentage));
    cell.style.backgroundSize = percentage.toFixed(0).toString() + "%";
    cell.style.setProperty("--value-percent", percentage.toFixed(0));
  }
}
