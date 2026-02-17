// @ts-nocheck
import { getFormattedDate, getPatchFromSysex, moveFileToDirectory, patchBuffersAreEqual } from "./SymbiosisTools.js";
import { htmlToElement, removeAllEventListeners } from "./htmltools.js";
import { shouldLog, LogLevel } from "./Logger.js";
import { bytesToHexString, bytesWithCharactersToString, getExceptionErrorString, getSafeFilename, partialArrayStringMatch } from "./tools.js";
import { ZoomDevice } from "./ZoomDevice.js";
import { ZoomPatch } from "./ZoomPatch.js";
import { ZoomPatchConverter } from "./ZoomPatchConverter.js";
export class ZoomPatchList {
    _patchListContainer = document.createElement("div"); // dummy
    _patchListHeader = document.createElement("div"); // dummy
    _patchesTable = document.createElement("table"); // dummy
    _backupPatchesToDiskButton = document.createElement("button"); // dummy
    _restorePatchesFromDiskButton = document.createElement("button"); // dummy
    _loadPatchesFromDiskButton = document.createElement("button"); // dummy
    _savePatchesToDiskButton = document.createElement("button"); // dummy
    _deletePatchesButton = document.createElement("button"); // dummy
    _cutPatchesButton = document.createElement("button"); // dummy
    _copyPatchesButton = document.createElement("button"); // dummy
    _pastePatchesButton = document.createElement("button"); // dummy
    _undoEditPatchListButton = document.createElement("button"); // dummy
    _redoEditPatchListButton = document.createElement("button"); // dummy
    _progressDialog;
    _confirmDialog;
    _currentMemorySlotChangedListeners = [];
    _currentPatchUpdatedListeners = [];
    _zoomDevice = undefined;
    _undoRedoManager = undefined;
    _lastSelected = null;
    _lastClickedCell = null;
    _patchCopyList = [];
    _patchCopyListIsCut = false; // true if user clicked "Cut", false if user clicked "Copy"
    _zoomPatchConverter = new ZoomPatchConverter();
    constructor(progressDialog, confirmDialog) {
        this._progressDialog = progressDialog;
        this._confirmDialog = confirmDialog;
        this.createView();
        this.undoRedoStateChanged = this.undoRedoStateChanged.bind(this);
    }
    get viewElement() {
        return this._patchListContainer;
    }
    createView() {
        let html;
        html = `
      <div class="patchListContainer collapsibleContent">
      </div>
    `;
        this._patchListContainer = htmlToElement(html);
        html = `
      <div class="patchListHeader">
          <button class="loadSaveButtons" tooltip="Backup all patch to disk"><span class="material-symbols-outlined">save</span><br/>Backup</button>
          <button id="restorePatchesFromDiskButton" class="loadSaveButtons" tooltip="Restore backup of all patches from disk"><span class="material-symbols-outlined">file_open</span><br/>Restore</button>
          <button id="loadPatchesFromDiskButton" class="loadSaveButtons" tooltip="Load patch(es) from file and save to selected memory slot on pedal"><span class="material-symbols-outlined">file_open</span><br/>Load</button>
          <button id="savePatchesToDiskButton" class="loadSaveButtons" tooltip="Save selected patch(es) to file"><span class="material-symbols-outlined">save</span><br/>Save</button>
          <button id="deletePatchesButton" class="loadSaveButtons" tooltip="Delete selected patch(es)"><span class="material-symbols-outlined">delete</span><br/>Delete</button>
          <button id="cutPatchesButton" class="loadSaveButtons" tooltip="Cut selected patch(es) - Paste will swap patches"><span class="material-symbols-outlined">cut</span><br/>Cut</button>
          <button id="copyPatchesButton" class="loadSaveButtons" tooltip="Copy selected patch(es) - Paste will overwrite patches"><span class="material-symbols-outlined">content_copy</span><br/>Copy</button>
          <button id="pastePatchesButton" class="loadSaveButtons" tooltip="Paste patch(es)"><span class="material-symbols-outlined">content_paste</span><br/>Paste</button>
          <button id="undoEditPatchListButton" class="loadSaveButtons" disabled><span class="material-symbols-outlined">undo</span><br/>Undo</button>
          <button id="redoEditPatchListButton" class="loadSaveButtons" disabled><span class="material-symbols-outlined">redo</span><br/>Redo</button>
      </div>
    `;
        this._patchListHeader = htmlToElement(html);
        this._patchListContainer.appendChild(this._patchListHeader);
        this._backupPatchesToDiskButton = this._patchListHeader.children[0];
        this._restorePatchesFromDiskButton = this._patchListHeader.children[1];
        this._loadPatchesFromDiskButton = this._patchListHeader.children[2];
        this._savePatchesToDiskButton = this._patchListHeader.children[3];
        this._deletePatchesButton = this._patchListHeader.children[4];
        this._cutPatchesButton = this._patchListHeader.children[5];
        this._copyPatchesButton = this._patchListHeader.children[6];
        this._pastePatchesButton = this._patchListHeader.children[7];
        this._undoEditPatchListButton = this._patchListHeader.children[8];
        this._redoEditPatchListButton = this._patchListHeader.children[9];
        this._patchesTable = htmlToElement(`
      <table id="patchesTable">
        <tr>
            <th>#</th>
            <th>Name</th>
            <th>#</th>
            <th>Name</th>
            <th>#</th>
            <th>Name</th>
            <th>#</th>
            <th>Name</th>
            <th>#</th>
            <th>Name</th>
        </tr>
      </table>
    `);
        this._patchListContainer.appendChild(this._patchesTable);
        return this._patchListContainer;
    }
    /**
     * Initialize the patches table for the given zoom device.
     * @param zoomDevice The zoom device to initialize the patches table for.
     */
    initPatchesTable(zoomDevice, undoRedoManager) {
        this._zoomDevice = zoomDevice;
        this._undoRedoManager = undoRedoManager;
        this._undoRedoManager.removeStateChangedListener(this.undoRedoStateChanged); // make sure we don't have multiple listeners to the same undoRedoManager
        this._undoRedoManager.addStateChangedListener(this.undoRedoStateChanged);
        this.undoRedoStateChanged(undoRedoManager, undoRedoManager.undoAvailable, undoRedoManager.undoDescription, undoRedoManager.redoAvailable, undoRedoManager.redoDescription);
        this._pastePatchesButton.disabled = true;
        this._patchCopyList = [];
        this.updatePasteButtonTooltip();
        let titleButton;
        if (this._patchesTable.parentElement?.children[0] instanceof HTMLButtonElement) {
            titleButton = this._patchesTable.parentElement?.children[0];
        }
        else {
            let parent = this._patchesTable.parentElement;
            while (parent !== null && parent.parentElement !== null && !(parent.children[0] instanceof HTMLButtonElement)) {
                parent = parent.parentElement;
            }
            if (parent === null || !(parent.children[0] instanceof HTMLButtonElement)) {
                shouldLog(LogLevel.Error) && console.error(`initPatchesTable() called for ZoomDevice "${zoomDevice.deviceName}" but no title button found.`);
                return;
            }
            titleButton = parent.children[0];
            this._backupPatchesToDiskButton = removeAllEventListeners(this._backupPatchesToDiskButton);
            this._backupPatchesToDiskButton.addEventListener("click", async (event) => {
                await this.backupPatchesToDirectory(zoomDevice);
            });
            this._restorePatchesFromDiskButton = removeAllEventListeners(this._restorePatchesFromDiskButton);
            this._restorePatchesFromDiskButton.addEventListener("click", async (event) => {
                await this.restorePatchesFromDirectory(zoomDevice);
            });
            this._savePatchesToDiskButton = removeAllEventListeners(this._savePatchesToDiskButton);
            this._savePatchesToDiskButton.addEventListener("click", async (event) => {
                await this.savePatchesToDirectory(zoomDevice);
            });
            this._loadPatchesFromDiskButton = removeAllEventListeners(this._loadPatchesFromDiskButton);
            this._loadPatchesFromDiskButton.addEventListener("click", async (event) => {
                await this.loadPatchesFromDirectory(zoomDevice);
            });
            this._deletePatchesButton = removeAllEventListeners(this._deletePatchesButton);
            this._deletePatchesButton.addEventListener("click", async (event) => {
                await this.deletePatches(zoomDevice);
            });
            this._cutPatchesButton = removeAllEventListeners(this._cutPatchesButton);
            this._cutPatchesButton.addEventListener("click", async (event) => {
                await this.cutPatches(zoomDevice);
            });
            this._copyPatchesButton = removeAllEventListeners(this._copyPatchesButton);
            this._copyPatchesButton.addEventListener("click", async (event) => {
                await this.copyPatches(zoomDevice);
            });
            this._pastePatchesButton = removeAllEventListeners(this._pastePatchesButton);
            this._pastePatchesButton.addEventListener("click", async (event) => {
                await this.pastePatches(zoomDevice);
            });
            this._undoEditPatchListButton = removeAllEventListeners(this._undoEditPatchListButton);
            this._undoEditPatchListButton.addEventListener("click", async (event) => {
                await this.undoEditPatchList(zoomDevice);
            });
            this._redoEditPatchListButton = removeAllEventListeners(this._redoEditPatchListButton);
            this._redoEditPatchListButton.addEventListener("click", async (event) => {
                await this.redoEditPatchList(zoomDevice);
            });
        }
        titleButton.childNodes[0].nodeValue = "Patch List  " + zoomDevice.deviceName;
        this._patchesTable = removeAllEventListeners(this._patchesTable);
        this._patchesTable.addEventListener("click", async (event) => {
            this.handlePatchesTableClick(event, zoomDevice);
        });
    }
    /**
     * Update the patches table for the given zoom device.
     * @param zoomDevice The zoom device to update the patches table for.
     */
    async updatePatchesTable(zoomDevice) {
        let headerRow = this._patchesTable.rows[0];
        let numColumns = headerRow.cells.length / 2;
        let numPatchesPerRow = Math.ceil(zoomDevice.patchList.length / numColumns);
        while (this._patchesTable.rows.length > numPatchesPerRow) {
            this._patchesTable.deleteRow(this._patchesTable.rows.length - 1);
        }
        for (let r = this._patchesTable.rows.length - 1; r < numPatchesPerRow; r++) {
            let row = this._patchesTable.insertRow(-1);
            for (let c = 0; c < numColumns * 2; c++) {
                let cell = row.insertCell(-1);
            }
        }
        let row;
        let bodyCell;
        for (let i = 0; i < zoomDevice.patchList.length; i++) {
            let patch = zoomDevice.patchList[i];
            row = this._patchesTable.rows[1 + i % numPatchesPerRow];
            bodyCell = row.cells[Math.floor(i / numPatchesPerRow) * 2];
            bodyCell.innerHTML = `${i + 1}`;
            bodyCell.dataset.memorySlot = `${i}`;
            bodyCell.classList.remove("highlight");
            bodyCell = row.cells[Math.floor(i / numPatchesPerRow) * 2 + 1];
            let name = patch.nameTrimmed;
            bodyCell.innerHTML = `${name}`;
            bodyCell.dataset.memorySlot = `${i}`;
            bodyCell.classList.remove("highlight");
        }
    }
    get currentlySelectedMemorySlot() {
        if (this._lastSelected === null)
            return -1;
        return this.getMemorySlotFromCell(this._lastSelected);
    }
    set currentlySelectedMemorySlot(memorySlot) {
        let previousMemorySlot = this.currentlySelectedMemorySlot;
        if (this._lastSelected !== null && this.getMemorySlotFromCell(this._lastSelected) < this.numberOfPatches)
            this.togglePatchesTablePatch(this._lastSelected, false);
        this._lastSelected = this.getCellFromMemorySlot(memorySlot);
        this.togglePatchesTablePatch(this._lastSelected, true);
        // if (previousMemorySlot !== memorySlot)
        //   this.emitCurrentMemorySlotChangedEvent(this, previousMemorySlot, memorySlot);
    }
    get zoomDevice() {
        return this._zoomDevice;
    }
    get numberOfPatches() {
        let rows = this._patchesTable.rows.length - 1; // Don't include header row
        let numColumns = rows > 0 ? this._patchesTable.rows[0].cells.length / 2 : 0;
        return rows * numColumns;
    }
    /**
     * Get the currently selected (highlighted) memory slots.
     * @returns An array of selected memory slots
     */
    get selectedMemorySlots() {
        let numRows = this._patchesTable.rows.length - 1; // Don't include header row
        let numColumns = this._patchesTable.rows[0].cells.length / 2;
        let numPatches = numRows * numColumns;
        const selectedSlots = [];
        for (let i = 0; i < numPatches; i++) {
            let cell = this.getCellFromMemorySlot(i);
            if (cell.classList.contains("highlight")) {
                selectedSlots.push(i);
            }
        }
        return selectedSlots;
    }
    addCurrentMemorySlotChangedListener(listener) {
        this._currentMemorySlotChangedListeners.push(listener);
    }
    removeCurrentMemorySlotChangedListener(listener) {
        this._currentMemorySlotChangedListeners = this._currentMemorySlotChangedListeners.filter(l => l !== listener);
    }
    removeAllCurrentMemorySlotChangedListeners() {
        this._currentMemorySlotChangedListeners = [];
    }
    undoRedoStateChanged(undoRedoManager, undoAvailable, undoDescription, redoAvailable, redoDescription) {
        if (this._undoRedoManager !== undoRedoManager) {
            shouldLog(LogLevel.Error) && console.error(`undoRedoStateChanged() called for undoRedoManager ${undoRedoManager} that is not this._undoRedoManager ${this._undoRedoManager}.`);
            return;
        }
        this._undoEditPatchListButton.disabled = !undoAvailable;
        this._undoEditPatchListButton.setAttribute("tooltip", undoDescription.length > 0 ? "Undo: " + undoDescription : "Nothing to undo");
        this._redoEditPatchListButton.disabled = !redoAvailable;
        this._redoEditPatchListButton.setAttribute("tooltip", redoDescription.length > 0 ? "Redo: " + redoDescription : "Nothing to redo");
    }
    handlePatchesTableClick(event, zoomDevice) {
        if (event.target == null)
            return;
        let cell = event.target;
        if (event.ctrlKey && !event.shiftKey) {
            this.togglePatchesTablePatch(cell, !cell.classList.contains("highlight"));
            this._lastClickedCell = cell;
        }
        else if (event.shiftKey && this._lastClickedCell !== null) {
            let lastClickedMemorySlot = this.getMemorySlotFromCell(this._lastClickedCell);
            let clickedMemorySlot = this.getMemorySlotFromCell(cell);
            for (let memorySlot = Math.min(lastClickedMemorySlot, clickedMemorySlot); memorySlot <= Math.max(lastClickedMemorySlot, clickedMemorySlot); memorySlot++) {
                let betweenCell = this.getCellFromMemorySlot(memorySlot);
                this.togglePatchesTablePatch(betweenCell, true);
            }
            this._lastClickedCell = cell;
        }
        else {
            if (this._lastSelected != null)
                this.clearAllHighlights();
            this.togglePatchesTablePatch(cell, true);
            let lastMemorySlot = -1;
            if (this._lastSelected !== null)
                lastMemorySlot = this.getMemorySlotFromCell(this._lastSelected);
            let memorySlot = -1;
            if (cell !== null)
                memorySlot = this.getMemorySlotFromCell(cell);
            this._lastSelected = cell;
            this._lastClickedCell = cell;
            zoomDevice.setCurrentMemorySlot(memorySlot);
            if (memorySlot !== lastMemorySlot)
                this.emitCurrentMemorySlotChangedEvent(this, lastMemorySlot, memorySlot);
        }
    }
    clearAllHighlights() {
        for (let cell of this._patchesTable.querySelectorAll(".highlight")) {
            cell.classList.remove("highlight");
        }
    }
    emitCurrentMemorySlotChangedEvent(patchList, previousMemorySlot, currentMemorySlot) {
        for (let listener of this._currentMemorySlotChangedListeners) {
            listener(patchList, previousMemorySlot, currentMemorySlot);
        }
    }
    addCurrentPatchUpdatedListener(listener) {
        this._currentPatchUpdatedListeners.push(listener);
    }
    removeCurrentPatchUpdatedListener(listener) {
        this._currentPatchUpdatedListeners = this._currentPatchUpdatedListeners.filter(l => l !== listener);
    }
    removeAllCurrentPatchUpdatedListeners() {
        this._currentPatchUpdatedListeners = [];
    }
    emitCurrentPatchUpdatedEvent(patchList) {
        for (let listener of this._currentPatchUpdatedListeners) {
            listener(patchList);
        }
    }
    async backupPatchesToDirectory(zoomDevice) {
        shouldLog(LogLevel.Info) && console.log("*** backupPatchesToDirectory() called - check for multiple calls if initPatchesTable() is called multiple times");
        const updateProgressBar = (patchNumber, suggestedName = "") => {
            let summaryText = `${numSaved.toString()} patch${numSaved == 1 ? "" : "es"} saved to directory "${dirHandle.name}"`;
            if (numSkipped > 0)
                summaryText += `<br/>${numSkipped.toString()} patch${numSkipped == 1 ? "" : "es"} skipped because patch in directory is the same as on pedal`;
            if (numErrors > 0)
                summaryText += `<br/>${numErrors.toString()} patch${numErrors == 1 ? "" : "es"} not written to directory due to write errors: ${errorText}`;
            this._progressDialog.setProgress(patchNumber / patchList.length * 100, suggestedName, summaryText);
        };
        // See: https://developer.chrome.com/docs/capabilities/web-apis/file-system-access
        const dirHandle = await window.showDirectoryPicker({ id: "backupPatches", mode: "readwrite" });
        await this.verifyDirectoryPermissions(dirHandle, true); // probably doesn't need this, since I request readwrite permissions above
        // for await (const [key, value] of dirHandle.entries()) {
        //   console.log(`key: ${key}, name: ${value.name}, kind: ${value.kind}`);
        // }
        let [fileEnding, shortFileEnding, fileDescription] = zoomDevice.getSuggestedFileEndingForPatch();
        let patchList = zoomDevice.patchList;
        this._progressDialog.show(`Backup of all patches from device "${zoomDevice.deviceName}" to directory "${dirHandle.name}" in progress...`);
        let errorText = "";
        const fileNameAndEndingRegExp = new RegExp(`^(.*)\.(${fileEnding})$`);
        let patchOnPedalIsTheSameAsOnDisk = false;
        let numSaved = 0;
        let numSkipped = 0;
        let numErrors = 0;
        for (let patchIndex = 0; patchIndex < patchList.length && !this._progressDialog.userCancelled; patchIndex++) {
            let patch = patchList[patchIndex];
            let patchNumber = patchIndex + 1;
            let trimmedPatchName = getSafeFilename(patch.name).trim().replace(/[ ]{2,}/gi, " ");
            let suggestedName = patchNumber.toString().padStart(3, "0") + " " + (patch.name !== null ? trimmedPatchName + "." + fileEnding : `patch.${fileEnding}`);
            patchOnPedalIsTheSameAsOnDisk = false;
            // Check if a file exists with the three-digit patch index and move it to "Previous versions" if it exists
            // If it does, check if the patch on the pedal is the same as the patch on disk
            let patchNumberStr = patchNumber.toString().padStart(3, "0");
            let existingFilePattern = new RegExp(`^${patchNumberStr} .+${fileEnding}$`);
            let previousVersionsDirHandle = undefined;
            for await (const [key, value] of dirHandle.entries()) {
                if (value.kind === "file" && existingFilePattern.test(value.name)) {
                    try {
                        let existingFileHandle = await dirHandle.getFileHandle(value.name);
                        let existingFile = await existingFileHandle.getFile();
                        const existingFileBuffer = await existingFile.arrayBuffer();
                        const existingFileData = new Uint8Array(existingFileBuffer);
                        if (patchBuffersAreEqual(patch, existingFileData, zoomDevice)) {
                            patchOnPedalIsTheSameAsOnDisk = true;
                            continue;
                        }
                        // Patch on disk and patch on pedals differ, but share the same patch number, so we need to move the existing file to "Previous versions" directory
                        let formattedDate = getFormattedDate(existingFile.lastModified);
                        // Insert the timestamp before the file ending
                        // e.g. "001 PatchName.70cdrp.zptc" -> "001 PatchName 20240607 153012.70cdrp.zptc"
                        let fileNameParts = value.name.match(fileNameAndEndingRegExp);
                        let newFileName;
                        if (fileNameParts) {
                            newFileName = `${fileNameParts[1]} ${formattedDate}.${fileNameParts[2]}`;
                        }
                        else {
                            // fallback if no extension
                            newFileName = `${value.name} ${formattedDate}`;
                        }
                        if (previousVersionsDirHandle === undefined) {
                            try {
                                previousVersionsDirHandle = await dirHandle.getDirectoryHandle("Previous versions", { create: true });
                            }
                            catch (error) {
                                shouldLog(LogLevel.Warning) && console.warn(`Error creating "Previous versions" directory in "${dirHandle.name}": ${getExceptionErrorString(error)}`);
                            }
                        }
                        if (previousVersionsDirHandle !== undefined) {
                            await moveFileToDirectory(dirHandle, existingFile, previousVersionsDirHandle, newFileName);
                        }
                    }
                    catch (error) {
                        shouldLog(LogLevel.Warning) && console.warn(`Error moving existing file "${value.name}" to "Previous versions" directory: ${getExceptionErrorString(error)}`);
                    }
                }
            }
            // Any existing files with the same patch number have been moved to "Previous versions" directory
            if (patchOnPedalIsTheSameAsOnDisk) {
                shouldLog(LogLevel.Info) && console.log(`Patch ${patchNumber.toString().padStart(3, "0")} "${patch.name}" on pedal is the same as on disk, skipping backup`);
                numSkipped++;
                updateProgressBar(patchNumber, suggestedName);
                continue;
            }
            shouldLog(LogLevel.Info) && console.log(`Patch ${patchNumber.toString().padStart(3, "0")} "${patch.name}" backing up to "${dirHandle.name}/${suggestedName}"`);
            let fileHandle;
            try {
                fileHandle = await dirHandle.getFileHandle(suggestedName, { create: true });
            }
            catch (error) {
                shouldLog(LogLevel.Error) && console.error(`Error creating file "${suggestedName}" in directory "${dirHandle.name}" for patch ${patchNumber.toString().padStart(3, "0")} "${patch.name}": ${getExceptionErrorString(error)}`);
                numErrors++;
                errorText = errorText + (errorText.length > 0 ? ", " : "") + suggestedName;
                updateProgressBar(patchNumber, suggestedName);
                continue;
            }
            let success = true;
            success = await this.savePatchToFile(patch, zoomDevice, fileHandle);
            if (!success) {
                errorText = errorText + (errorText.length > 0 ? ", " : "") + suggestedName;
                numErrors++;
                updateProgressBar(patchNumber, suggestedName);
                continue;
            }
            numSaved++;
            updateProgressBar(patchNumber, suggestedName);
        }
        updateProgressBar(patchList.length);
        this._progressDialog.setText(`Backup of patches from pedal "${zoomDevice.deviceName}" to directory "${dirHandle.name}" completed`);
    }
    async verifyDirectoryPermissions(directoryHandle, includeWrite = false) {
        const options = {};
        if (includeWrite)
            options.mode = 'readwrite';
        if ((await directoryHandle.queryPermission(options)) === "granted")
            return true;
        if ((await directoryHandle.requestPermission(options)) === "granted")
            return true;
        return false;
    }
    async savePatchToFile(patch, zoomDevice, fileHandle) {
        let blob = undefined;
        if (patch.ptcfChunk !== null && patch.ptcfChunk.length > 0) {
            blob = new Blob([patch.ptcfChunk]);
        }
        else if (patch.msogDataBuffer !== null && patch.msogDataBuffer.length > 0) {
            let sysex = zoomDevice.getSysexForCurrentPatch(patch);
            if (sysex === undefined) {
                shouldLog(LogLevel.Warning) && console.warn(`getSysexForCurrentPatch() failed for patch "${patch.name}"`);
            }
            else {
                let sysexString = bytesToHexString(sysex).toLowerCase();
                blob = new Blob([sysexString]);
            }
        }
        else {
            shouldLog(LogLevel.Warning) && console.warn(`Patch "${patch.name}" is not in PTCF or MSOG format.`);
        }
        if (blob !== undefined) {
            const writableStream = await fileHandle.createWritable();
            await writableStream.write(blob);
            await writableStream.close();
        }
        return blob !== undefined;
    }
    async restorePatchesFromDirectory(zoomDevice) {
        const updateProgressBar = (patchNumber, fileName = "") => {
            let summaryText = `${numLoaded.toString()} patch${numLoaded == 1 ? "" : "es"} restored from directory "${dirHandle.name}"`;
            if (numSkipped > 0)
                summaryText += `<br/>${numSkipped.toString()} patch${numSkipped == 1 ? "" : "es"} skipped because patch in directory is the same as on pedal`;
            if (numMissing > 0)
                summaryText += `<br/>${numMissing.toString()} patch${numMissing == 1 ? "" : "es"} missing from directory`;
            if (numErrors > 0)
                summaryText += `<br/>${numErrors.toString()} patch${numErrors == 1 ? "" : "es"} not loaded from directory due to read errors: ${errorText}`;
            this._progressDialog.setProgress(patchNumber / patchList.length * 100, fileName, summaryText);
        };
        let lastSelectedMemorySlot = this.currentlySelectedMemorySlot;
        const dirHandle = await window.showDirectoryPicker({ id: "backupPatches", mode: "read" });
        await this.verifyDirectoryPermissions(dirHandle, false); // probably doesn't need this, since I request read permissions above
        let patchList = zoomDevice.patchList;
        this._progressDialog.show(`Restoring of all patches from directory "${dirHandle.name}" to device "${zoomDevice.deviceName}" in progress...`);
        let errorText = "";
        let numLoaded = 0;
        let numSkipped = 0;
        let numMissing = 0;
        let numErrors = 0;
        let existingFileData = undefined;
        let existingFileName = "";
        let filesMap = await this.getMapOfFilesWithPotentiallyMatchingFiles(zoomDevice, dirHandle);
        for (let patchIndex = 0; patchIndex < patchList.length && !this._progressDialog.userCancelled; patchIndex++) {
            let patchOnPedalIsTheSameAsOnDisk = false;
            let patchNumber = patchIndex + 1;
            let patchNumberStr = patchNumber.toString().padStart(3, "0");
            let fileName = filesMap.get(patchIndex);
            // Check if we have a file that matches
            if (fileName === undefined) {
                console.log(`patchIndex: ${patchIndex}, patchNumber: ${patchNumber}, patchNumberStr: ${patchNumberStr}, skipping since no file found`);
                numMissing++;
                updateProgressBar(patchIndex, `patch ${patchNumber}`);
                continue;
            }
            // Check if patch in pedal is the same as on disk
            let patch = patchList[patchIndex];
            try {
                let existingFileHandle = await dirHandle.getFileHandle(fileName);
                let existingFile = await existingFileHandle.getFile();
                existingFileName = existingFileHandle.name;
                const existingFileBuffer = await existingFile.arrayBuffer();
                existingFileData = new Uint8Array(existingFileBuffer);
                if (patchBuffersAreEqual(patch, existingFileData, zoomDevice)) {
                    patchOnPedalIsTheSameAsOnDisk = true;
                }
            }
            catch (error) {
                shouldLog(LogLevel.Warning) && console.warn(`Error reading file "${fileName}" from directory "${dirHandle.name}": ${getExceptionErrorString(error)}`);
                numErrors++;
                errorText = errorText + (errorText.length > 0 ? ", " : "") + fileName;
                updateProgressBar(patchNumber, existingFileName);
                continue;
            }
            if (patchOnPedalIsTheSameAsOnDisk) {
                shouldLog(LogLevel.Info) && console.log(`Patch ${patchNumber.toString().padStart(3, "0")} "${patch.name}" on pedal is the same as file "${dirHandle.name}/${existingFileName}", skipping restore`);
                numSkipped++;
                updateProgressBar(patchNumber, existingFileName);
                continue;
            }
            let patchFromFile = undefined;
            if (partialArrayStringMatch(existingFileData, "PTCF")) {
                patchFromFile = ZoomPatch.fromPatchData(existingFileData);
            }
            else {
                let sysexString = bytesWithCharactersToString(existingFileData);
                if (sysexString.length !== 0) {
                    patchFromFile = getPatchFromSysex(sysexString, zoomDevice, existingFileName);
                }
            }
            if (patchFromFile === undefined) {
                shouldLog(LogLevel.Error) && console.error(`patchFromFile === undefined for patch file "${existingFileName}", ZoomDevice "${zoomDevice.deviceName}".`);
                numErrors++;
                errorText = errorText + (errorText.length > 0 ? ", " : "") + existingFileName;
                updateProgressBar(patchNumber, existingFileName);
                continue;
            }
            if (patchFromFile.PTCF === null && patchFromFile.MSOG === null) {
                shouldLog(LogLevel.Error) && console.error(`patch.PTCF === null && patch.MSOG === null for patch file "${existingFileName}".`);
                numErrors++;
                errorText = errorText + (errorText.length > 0 ? ", " : "") + existingFileName;
                updateProgressBar(patchNumber, existingFileName);
                continue;
            }
            shouldLog(LogLevel.Info) && console.log(`Patch ${patchNumber.toString().padStart(3, "0")} "${patch.name}" restoring from "${dirHandle.name}/${existingFileName}"`);
            let success = await zoomDevice.uploadPatchToMemorySlot(patchFromFile, patchIndex, true);
            if (!success) {
                numErrors++;
                errorText = errorText + (errorText.length > 0 ? ", " : "") + existingFileName;
                updateProgressBar(patchNumber, existingFileName);
                continue;
            }
            numLoaded++;
            updateProgressBar(patchNumber, existingFileName);
        }
        await this.updatePatchesTable(zoomDevice);
        if (lastSelectedMemorySlot !== -1) {
            zoomDevice.setCurrentMemorySlot(lastSelectedMemorySlot, true); // makes sure the uploaded patch is also "current patch" on the pedal
            this.emitCurrentPatchUpdatedEvent(this);
        }
        updateProgressBar(patchList.length);
        this._progressDialog.setText(`Restoring of patches from directory "${dirHandle.name}" to pedal "${zoomDevice.deviceName}" completed`);
    }
    async getMapOfFilesWithPotentiallyMatchingFiles(zoomDevice, dirHandle) {
        let filesMap = new Map(); // The index to filesMap is the patchIndex (0-based patch number)
        let patchList = zoomDevice.patchList;
        let [fileEnding, shortFileEnding, fileDescription] = zoomDevice.getSuggestedFileEndingForPatch();
        const threeDigitFileRegex = RegExp(`^(\\d{3}) .+${fileEnding}$`);
        for await (const value of dirHandle.values()) {
            if (value.kind === "file" && threeDigitFileRegex.test(value.name)) {
                let fileName = value.name;
                const match = value.name.match(threeDigitFileRegex);
                if (match) {
                    let patchNumber = parseInt(match[1]); // Note: patchNumber is 1-based
                    if (isNaN(patchNumber)) {
                        shouldLog(LogLevel.Warning) && console.warn(`Invalid patch number in file name "${fileName}". Ignoring file.`);
                        continue;
                    }
                    let patchIndex = patchNumber - 1;
                    if (patchIndex < 0 || patchIndex >= patchList.length) {
                        shouldLog(LogLevel.Warning) && console.warn(`Patch number ${patchNumber} is out of range for file "${fileName}". Ignoring file.`);
                        continue;
                    }
                    if (filesMap.has(patchIndex)) {
                        shouldLog(LogLevel.Warning) && console.warn(`Another file with patch number ${patchNumber} already exists for file "${fileName}". Ignoring file.`);
                        continue;
                    }
                    filesMap.set(patchIndex, fileName);
                }
            }
        }
        return filesMap;
    }
    async savePatchesToDirectory(zoomDevice) {
        const updateProgressBar = (patchNumber, suggestedName = "") => {
            let summaryText = `${numSaved.toString()} patch${numSaved == 1 ? "" : "es"} saved to directory "${dirHandle.name}"`;
            if (numSkipped > 0)
                summaryText += `<br/>${numSkipped.toString()} patch${numSkipped == 1 ? "" : "es"} skipped because patch in directory is the same as on pedal`;
            if (numErrors > 0)
                summaryText += `<br/>${numErrors.toString()} patch${numErrors == 1 ? "" : "es"} not written to directory due to write errors: ${errorText}`;
            this._progressDialog.setProgress(patchNumber / patchList.length * 100, suggestedName, summaryText);
        };
        let dirHandle = await window.showDirectoryPicker({ id: "loadSavePatches", mode: "readwrite" });
        await this.verifyDirectoryPermissions(dirHandle, true);
        let selectedSlots = this.selectedMemorySlots;
        let [fileEnding, shortFileEnding, fileDescription] = zoomDevice.getSuggestedFileEndingForPatch();
        let patchList = zoomDevice.patchList;
        this._progressDialog.show(`Saving ${selectedSlots.length} patch${selectedSlots.length == 1 ? "" : "es"} from device "${zoomDevice.deviceName}" to directory "${dirHandle.name}"`);
        let errorText = "";
        const fileNameAndEndingRegExp = new RegExp(`^(.*)\.(${fileEnding})$`);
        let patchOnPedalIsTheSameAsOnDisk = false;
        let numSaved = 0;
        let numSkipped = 0;
        let numErrors = 0;
        for (let patchIndex of selectedSlots) {
            let patch = patchList[patchIndex];
            let patchNumber = patchIndex + 1;
            let trimmedPatchName = getSafeFilename(patch.name).trim().replace(/[ ]{2,}/gi, " ");
            let suggestedName = patchNumber.toString().padStart(3, "0") + " " + (patch.name !== null ? trimmedPatchName + "." + fileEnding : `patch.${fileEnding}`);
            patchOnPedalIsTheSameAsOnDisk = false;
            // Check if a file exists with the same filename.
            // If it does exist, check if the patch on the pedal is the same as the patch on disk.
            // If it exists and the patch is not the same,  move the existing file to the "Previous versions" directory.
            let previousVersionsDirHandle = undefined;
            for await (const [key, value] of dirHandle.entries()) {
                if (value.kind === "file" && suggestedName.toLowerCase() === value.name.toLowerCase()) {
                    try {
                        let existingFileHandle = await dirHandle.getFileHandle(value.name);
                        let existingFile = await existingFileHandle.getFile();
                        const existingFileBuffer = await existingFile.arrayBuffer();
                        const existingFileData = new Uint8Array(existingFileBuffer);
                        if (patchBuffersAreEqual(patch, existingFileData, zoomDevice)) {
                            patchOnPedalIsTheSameAsOnDisk = true;
                            continue;
                        }
                        // Patch on disk and patch on pedals differ, but share the same patch number, so we need to move the existing file to "Previous versions" directory
                        let formattedDate = getFormattedDate(existingFile.lastModified);
                        // Insert the timestamp before the file ending
                        // e.g. "001 PatchName.70cdrp.zptc" -> "001 PatchName 20240607 153012.70cdrp.zptc"
                        let fileNameParts = value.name.match(fileNameAndEndingRegExp);
                        let newFileName;
                        if (fileNameParts) {
                            newFileName = `${fileNameParts[1]} ${formattedDate}.${fileNameParts[2]}`;
                        }
                        else {
                            // fallback if no extension
                            newFileName = `${value.name} ${formattedDate}`;
                        }
                        if (previousVersionsDirHandle === undefined) {
                            try {
                                previousVersionsDirHandle = await dirHandle.getDirectoryHandle("Previous versions", { create: true });
                            }
                            catch (error) {
                                shouldLog(LogLevel.Warning) && console.warn(`Error creating "Previous versions" directory in "${dirHandle.name}": ${getExceptionErrorString(error)}`);
                            }
                        }
                        if (previousVersionsDirHandle !== undefined) {
                            await moveFileToDirectory(dirHandle, existingFile, previousVersionsDirHandle, newFileName);
                        }
                    }
                    catch (error) {
                        shouldLog(LogLevel.Warning) && console.warn(`Error moving existing file "${value.name}" to "Previous versions" directory: ${getExceptionErrorString(error)}`);
                    }
                }
            }
            // Any existing files with the same patch number have been moved to "Previous versions" directory
            if (patchOnPedalIsTheSameAsOnDisk) {
                shouldLog(LogLevel.Info) && console.log(`Patch ${patchNumber.toString().padStart(3, "0")} "${patch.name}" on pedal is the same as on disk, skipping save`);
                numSkipped++;
                updateProgressBar(patchNumber, suggestedName);
                continue;
            }
            shouldLog(LogLevel.Info) && console.log(`Patch ${patchNumber.toString().padStart(3, "0")} "${patch.name}" saving to "${dirHandle.name}/${suggestedName}"`);
            let fileHandle;
            try {
                fileHandle = await dirHandle.getFileHandle(suggestedName, { create: true });
            }
            catch (error) {
                shouldLog(LogLevel.Error) && console.error(`Error creating file "${suggestedName}" in directory "${dirHandle.name}" for patch ${patchNumber.toString().padStart(3, "0")} "${patch.name}": ${getExceptionErrorString(error)}`);
                numErrors++;
                errorText = errorText + (errorText.length > 0 ? ", " : "") + suggestedName;
                updateProgressBar(patchNumber, suggestedName);
                continue;
            }
            let success = true;
            success = await this.savePatchToFile(patch, zoomDevice, fileHandle);
            if (!success) {
                errorText = errorText + (errorText.length > 0 ? ", " : "") + suggestedName;
                numErrors++;
                updateProgressBar(patchNumber, suggestedName);
                continue;
            }
            numSaved++;
            updateProgressBar(patchNumber, suggestedName);
        }
        updateProgressBar(patchList.length);
        this._progressDialog.setText(`Done saving ${numSaved.toString()} patch${numSaved == 1 ? "" : "es"} from pedal "${zoomDevice.deviceName}" to directory "${dirHandle.name}"`);
    }
    async loadPatchesFromDirectory(zoomDevice) {
        const updateProgressBar = (patchNumber, fileName = "") => {
            let summaryText = `${numLoaded.toString()} patch${numLoaded == 1 ? "" : "es"} loaded from disk`;
            if (numSkipped > 0)
                summaryText += `<br/>${numSkipped.toString()} patch${numSkipped == 1 ? "" : "es"} skipped because patch is the same as on pedal`;
            if (numErrors > 0)
                summaryText += `<br/>${numErrors.toString()} patch${numErrors == 1 ? "" : "es"} not loaded due to read errors: ${errorText}`;
            this._progressDialog.setProgress(patchNumber / patchList.length * 100, fileName, summaryText);
        };
        let errorText = "";
        let numLoaded = 0;
        let numSkipped = 0;
        let numErrors = 0;
        let [fileEnding, shortFileEnding, fileDescription] = zoomDevice.getSuggestedFileEndingForPatch();
        let filename = undefined;
        let fileEndings = [shortFileEnding];
        let fileDescriptions = [fileDescription];
        if (zoomDevice.deviceName.includes("MS-70CDR+")) {
            fileEndings = [];
            fileDescriptions = [];
            fileEndings.push(`${shortFileEnding},70cdr`);
            fileDescriptions.push("MS-70CDR+ and MS-70CDR patch file");
            fileEndings.push(shortFileEnding);
            fileDescriptions.push(fileDescription);
            fileEndings.push("70cdr");
            fileDescriptions.push("MS-70CDR patch file");
        }
        let types = [];
        for (let i = 0; i < fileEndings.length; i++) {
            let endingsString = fileEndings[i];
            endingsString.split(",").map(value => "." + value);
            types.push({
                description: fileDescriptions[i],
                accept: { "application/octet-stream": fileEndings[i].split(",").map(value => "." + value) }
            });
        }
        let fileHandles = [];
        try {
            fileHandles = await window.showOpenFilePicker({
                types: types,
                id: "loadSavePatches",
                multiple: true
            });
        }
        catch (error) {
            shouldLog(LogLevel.Error) && console.error(`Error reading file "${filename}": ${getExceptionErrorString(error)}`);
            return;
        }
        if (fileHandles.length === 0) {
            return;
        }
        let numFiles = fileHandles.length;
        let patchIndex = this.currentlySelectedMemorySlot;
        if (patchIndex + numFiles - 1 >= this.numberOfPatches) {
            this._confirmDialog.showInfo(`There's not enough room to load ${numFiles} patches on the pedal starting from patch ${patchIndex + 1}.`);
            return;
        }
        let lastSelectedMemorySlot = this.currentlySelectedMemorySlot;
        let rememberLastSelectedMemorySlot = this.currentlySelectedMemorySlot;
        let rememberPatchList = []; // will be filled with patches in slots that will be overwritten
        let rememberLoadedPatchList = []; // will be filled with loaded patches
        fileHandles = fileHandles.sort((a, b) => a.name.localeCompare(b.name));
        let data;
        let patch = undefined;
        let existingFileData = undefined;
        let existingFileName = "";
        let patchList = zoomDevice.patchList;
        this._progressDialog.show(`Loading patch${fileHandles.length == 1 ? "" : "es"} from disk to device "${zoomDevice.deviceName}"`);
        for (const fileHandle of fileHandles) {
            let patchNumber = patchIndex + 1;
            let patchNumberStr = patchNumber.toString().padStart(3, "0");
            existingFileName = fileHandle.name;
            let patchOnPedalIsTheSameAsOnDisk = false;
            console.log(`Memory slot ${patchNumberStr}: ${existingFileName}`);
            // Check if patch in pedal is the same as on disk
            let patch = patchList[patchIndex];
            try {
                let existingFile = await fileHandle.getFile();
                const existingFileBuffer = await existingFile.arrayBuffer();
                existingFileData = new Uint8Array(existingFileBuffer);
                if (patchBuffersAreEqual(patch, existingFileData, zoomDevice)) {
                    patchOnPedalIsTheSameAsOnDisk = true;
                }
            }
            catch (error) {
                shouldLog(LogLevel.Warning) && console.warn(`Error reading file "${existingFileName}": ${getExceptionErrorString(error)}`);
                numErrors++;
                errorText = errorText + (errorText.length > 0 ? ", " : "") + existingFileName;
                updateProgressBar(patchNumber, existingFileName);
                patchIndex++;
                continue;
            }
            if (patchOnPedalIsTheSameAsOnDisk) {
                shouldLog(LogLevel.Info) && console.log(`Patch ${patchNumber.toString().padStart(3, "0")} "${patch.name}" on pedal is the same as file "${existingFileName}", skipping`);
                numSkipped++;
                updateProgressBar(patchNumber, existingFileName);
                patchIndex++;
                continue;
            }
            let patchFromFile = undefined;
            if (partialArrayStringMatch(existingFileData, "PTCF")) {
                patchFromFile = ZoomPatch.fromPatchData(existingFileData);
            }
            else {
                let sysexString = bytesWithCharactersToString(existingFileData);
                if (sysexString.length !== 0) {
                    patchFromFile = getPatchFromSysex(sysexString, zoomDevice, existingFileName);
                    // Check if patch should be converted from MSOG to MS+
                    let mapForMSOG = ZoomDevice.getEffectIDMapForDevice("MS-70CDR");
                    if (patchFromFile !== undefined && patchFromFile.MSOG !== null && mapForMSOG !== undefined && zoomDevice.deviceName.includes("MS-70CDR+")) {
                        shouldLog(LogLevel.Info) && console.log(`Converting patch "${patchFromFile.name}" from MS to MS+`);
                        let [convertedPatch, unmappedSlotParameterList] = this._zoomPatchConverter.convert(patchFromFile);
                        if (convertedPatch === undefined) {
                            shouldLog(LogLevel.Warning) && console.warn(`Conversion failed for patch "${patchFromFile.name}"`);
                        }
                        else {
                            shouldLog(LogLevel.Info) && console.log(`Conversion succeeded for patch "${patchFromFile.name}"`);
                        }
                        patchFromFile = convertedPatch;
                    }
                }
            }
            if (patchFromFile === undefined) {
                shouldLog(LogLevel.Error) && console.error(`patchFromFile === undefined for patch file "${existingFileName}", ZoomDevice "${zoomDevice.deviceName}".`);
                numErrors++;
                errorText = errorText + (errorText.length > 0 ? ", " : "") + existingFileName;
                updateProgressBar(patchNumber, existingFileName);
                patchIndex++;
                continue;
            }
            if (patchFromFile.PTCF === null && patchFromFile.MSOG === null) {
                shouldLog(LogLevel.Error) && console.error(`patch.PTCF === null && patch.MSOG === null for patch file "${existingFileName}".`);
                numErrors++;
                errorText = errorText + (errorText.length > 0 ? ", " : "") + existingFileName;
                updateProgressBar(patchNumber, existingFileName);
                patchIndex++;
                continue;
            }
            let rememberPatch = patchList[patchIndex].clone();
            shouldLog(LogLevel.Info) && console.log(`Patch ${patchNumber.toString().padStart(3, "0")} loading from "${existingFileName}"`);
            let success = await zoomDevice.uploadPatchToMemorySlot(patchFromFile, patchIndex, true);
            if (!success) {
                numErrors++;
                errorText = errorText + (errorText.length > 0 ? ", " : "") + existingFileName;
                updateProgressBar(patchNumber, existingFileName);
                patchIndex++;
                continue;
            }
            rememberLoadedPatchList[patchIndex] = patchFromFile.clone();
            rememberPatchList[patchIndex] = rememberPatch;
            numLoaded++;
            updateProgressBar(patchNumber, existingFileName);
            patchIndex++;
        }
        await this.updatePatchesTable(zoomDevice);
        if (lastSelectedMemorySlot !== -1) {
            zoomDevice.setCurrentMemorySlot(lastSelectedMemorySlot, true); // makes sure the uploaded patch is also "current patch" on the pedal
            this.emitCurrentPatchUpdatedEvent(this);
        }
        updateProgressBar(patchList.length);
        this._progressDialog.setText(`Loading of patches from disk to pedal "${zoomDevice.deviceName}" completed`);
        // Everything below this line is related to undo/redo
        if (this._undoRedoManager === undefined) {
            shouldLog(LogLevel.Error) && console.error(`deletePatches() called but no undoRedoManager found for patchlist.`);
            return;
        }
        let actionDescription = `Load ${rememberLoadedPatchList.length} patch${rememberLoadedPatchList.length == 1 ? "" : "es"}`;
        this._undoRedoManager.addAction(async () => {
            // Redo action 
            let lastSelectedMemorySlot = rememberLastSelectedMemorySlot;
            for (let memorySlot = 0; memorySlot < rememberLoadedPatchList.length; memorySlot++) {
                let patch = rememberLoadedPatchList[memorySlot];
                if (patch === undefined)
                    continue;
                let success = await zoomDevice.uploadPatchToMemorySlot(patch, memorySlot, true);
                if (!success) {
                    shouldLog(LogLevel.Error) && console.error(`Failed to upload empty patch to memory slot ${memorySlot} on pedal "${zoomDevice.deviceName}".`);
                }
            }
            await this.updatePatchesTable(zoomDevice);
            if (lastSelectedMemorySlot !== -1) {
                zoomDevice.setCurrentMemorySlot(lastSelectedMemorySlot, true); // makes sure the uploaded patch is also "current patch" on the pedal
                this.emitCurrentPatchUpdatedEvent(this);
            }
        }, async () => {
            // Undo action
            let lastSelectedMemorySlot = rememberLastSelectedMemorySlot;
            for (let memorySlot = 0; memorySlot < rememberLoadedPatchList.length; memorySlot++) {
                let patch = rememberPatchList[memorySlot];
                if (patch === undefined)
                    continue;
                let success = await zoomDevice.uploadPatchToMemorySlot(patch, memorySlot, true);
                if (!success) {
                    shouldLog(LogLevel.Error) && console.error(`Failed to upload empty patch to memory slot ${memorySlot} on pedal "${zoomDevice.deviceName}".`);
                }
            }
            await this.updatePatchesTable(zoomDevice);
            if (lastSelectedMemorySlot !== -1) {
                zoomDevice.setCurrentMemorySlot(lastSelectedMemorySlot, true); // makes sure the uploaded patch is also "current patch" on the pedal
                this.emitCurrentPatchUpdatedEvent(this);
            }
        }, actionDescription);
    }
    async deletePatches(zoomDevice) {
        let rememberLastSelectedMemorySlot = this.currentlySelectedMemorySlot;
        let rememberSelectedSlots = Array.from(this.selectedMemorySlots);
        // Only remember relevant patches
        let rememberPatchList = [];
        for (let i = 0; i < this.selectedMemorySlots.length; i++) {
            let memorySlot = this.selectedMemorySlots[i];
            rememberPatchList[memorySlot] = zoomDevice.patchList[memorySlot].clone();
        }
        let lastSelectedMemorySlot = this.currentlySelectedMemorySlot;
        let selectedSlots = this.selectedMemorySlots;
        for (let memorySlot of selectedSlots) {
            let patch;
            if (zoomDevice.patchList[memorySlot].PTCF !== null) {
                patch = ZoomPatch.createEmptyPTCFPatch(zoomDevice.ptcfNameLength);
            }
            else {
                patch = ZoomPatch.createEmptyMSOGPatch();
            }
            let success = await zoomDevice.uploadPatchToMemorySlot(patch, memorySlot, true);
            if (!success) {
                shouldLog(LogLevel.Error) && console.error(`Failed to upload empty patch to memory slot ${memorySlot} on pedal "${zoomDevice.deviceName}".`);
            }
        }
        await this.updatePatchesTable(zoomDevice);
        if (lastSelectedMemorySlot !== -1) {
            zoomDevice.setCurrentMemorySlot(lastSelectedMemorySlot, true); // makes sure the uploaded patch is also "current patch" on the pedal
            this.emitCurrentPatchUpdatedEvent(this);
        }
        // Everything below this line is related to undo/redo
        if (this._undoRedoManager === undefined) {
            shouldLog(LogLevel.Error) && console.error(`deletePatches() called but no undoRedoManager found for patchlist.`);
            return;
        }
        let actionDescription = `Delete ${rememberSelectedSlots.length} patch${rememberSelectedSlots.length == 1 ? "" : "es"}`;
        this._undoRedoManager.addAction(async () => {
            // Redo action 
            let lastSelectedMemorySlot = rememberLastSelectedMemorySlot;
            let selectedSlots = rememberSelectedSlots;
            for (let memorySlot of selectedSlots) {
                let patch;
                if (zoomDevice.patchList[memorySlot].PTCF !== null) {
                    patch = ZoomPatch.createEmptyPTCFPatch(zoomDevice.ptcfNameLength);
                }
                else {
                    patch = ZoomPatch.createEmptyMSOGPatch();
                }
                let success = await zoomDevice.uploadPatchToMemorySlot(patch, memorySlot, true);
                if (!success) {
                    shouldLog(LogLevel.Error) && console.error(`Failed to upload empty patch to memory slot ${memorySlot} on pedal "${zoomDevice.deviceName}".`);
                }
            }
            await this.updatePatchesTable(zoomDevice);
            if (lastSelectedMemorySlot !== -1) {
                zoomDevice.setCurrentMemorySlot(lastSelectedMemorySlot, true); // makes sure the uploaded patch is also "current patch" on the pedal
                this.emitCurrentPatchUpdatedEvent(this);
            }
        }, async () => {
            // Undo action
            let lastSelectedMemorySlot = rememberLastSelectedMemorySlot;
            let selectedSlots = rememberSelectedSlots;
            for (let memorySlot of selectedSlots) {
                let patch = rememberPatchList[memorySlot];
                let success = await zoomDevice.uploadPatchToMemorySlot(patch, memorySlot, true);
                if (!success) {
                    shouldLog(LogLevel.Error) && console.error(`Failed to upload empty patch to memory slot ${memorySlot} on pedal "${zoomDevice.deviceName}".`);
                }
            }
            await this.updatePatchesTable(zoomDevice);
            if (lastSelectedMemorySlot !== -1) {
                zoomDevice.setCurrentMemorySlot(lastSelectedMemorySlot, true); // makes sure the uploaded patch is also "current patch" on the pedal
                this.emitCurrentPatchUpdatedEvent(this);
            }
        }, actionDescription);
    }
    async cutPatches(zoomDevice) {
        let selectedSlots = this.selectedMemorySlots;
        if (selectedSlots.length === 0) {
            this._confirmDialog.showInfo("No patches selected to cut.");
            return;
        }
        this._patchCopyListIsCut = true;
        this._patchCopyList = [];
        for (let memorySlot of selectedSlots) {
            let patch = zoomDevice.patchList[memorySlot].clone();
            this._patchCopyList.push([memorySlot, patch]);
        }
        this._pastePatchesButton.disabled = false;
        this.updatePasteButtonTooltip();
    }
    async copyPatches(zoomDevice) {
        let selectedSlots = this.selectedMemorySlots;
        if (selectedSlots.length === 0) {
            this._confirmDialog.showInfo("No patches selected to copy.");
            return;
        }
        this._patchCopyListIsCut = false;
        this._patchCopyList = [];
        for (let memorySlot of selectedSlots) {
            let patch = zoomDevice.patchList[memorySlot].clone();
            this._patchCopyList.push([memorySlot, patch]);
        }
        this._pastePatchesButton.disabled = false;
        this.updatePasteButtonTooltip();
    }
    async pastePatches(zoomDevice) {
        let destinationMemorySlot = this.selectedMemorySlots[0];
        // The remember* variables are for undo/redo only
        let rememberLastSelectedMemorySlot = this.currentlySelectedMemorySlot;
        let rememberSelectedSlots = Array.from(this.selectedMemorySlots);
        let rememberPatchCopyListIsCut = this._patchCopyListIsCut;
        let rememberPatchCopyList = this._patchCopyList.map(slotAndPatch => [slotAndPatch[0], slotAndPatch[1].clone()]);
        // Only remember relevant patches
        let rememberPatchList = [];
        for (let slot = destinationMemorySlot; slot < destinationMemorySlot + this._patchCopyList.length; slot++) {
            rememberPatchList[slot] = zoomDevice.patchList[slot].clone();
        }
        for (let [memorySlot, patch] of this._patchCopyList) {
            if (rememberPatchList[memorySlot] === undefined) {
                rememberPatchList[memorySlot] = patch.clone();
            }
        }
        if (this._patchCopyList.length === 0) {
            this._confirmDialog.showInfo("No patches selected to paste.");
            return;
        }
        let selectedSlots = this.selectedMemorySlots;
        if (selectedSlots.length !== 1) {
            this._confirmDialog.showInfo("Cannot paste to multiple dispersed memory slots. Please select only one memory slot to paste to. Multiple patches will be patched to that memory slots and the slots following it.");
            return;
        }
        let lastSelectedMemorySlot = this.currentlySelectedMemorySlot;
        let patchList = zoomDevice.patchList;
        let patchCopyList = this._patchCopyList;
        let patchCopyListIsCut = this._patchCopyListIsCut;
        if (patchCopyListIsCut) {
            // Swap existing patches in destination slot(s) with copied patches in the memorySlots they were copied from.
            // Make sure no patches are deleted from the pedal, even if the source and destination ranges overlap partially.
            await this.pasteAfterCut(patchCopyList, destinationMemorySlot, patchList, zoomDevice);
            this._patchCopyList = [];
            this._pastePatchesButton.disabled = true;
        }
        else {
            // Overwrite existing patches in destination slot(s). Keep copied patches in the memorySlots they were copied from.
            for (let [memorySlot, patch] of patchCopyList) {
                let success = await zoomDevice.uploadPatchToMemorySlot(patch, destinationMemorySlot, true);
                if (!success) {
                    shouldLog(LogLevel.Error) && console.error(`Failed to upload patch to memory slot ${destinationMemorySlot} on pedal "${zoomDevice.deviceName}".`);
                }
                destinationMemorySlot++;
            }
        }
        await this.updatePatchesTable(zoomDevice);
        if (lastSelectedMemorySlot !== -1) {
            zoomDevice.setCurrentMemorySlot(lastSelectedMemorySlot, true); // makes sure the uploaded patch is also "current patch" on the pedal
            this.emitCurrentPatchUpdatedEvent(this);
        }
        this.updatePasteButtonTooltip();
        // Everything below this line is related to undo/redo
        if (this._undoRedoManager === undefined) {
            shouldLog(LogLevel.Error) && console.error(`deletePatches() called but no undoRedoManager found for patchlist.`);
            return;
        }
        let overwriteOrSwap = rememberPatchCopyListIsCut ? "swap" : "overwrite";
        let actionDescription = `Paste (${overwriteOrSwap}) ${rememberPatchCopyList.length} patch${rememberPatchCopyList.length == 1 ? "" : "es"}`;
        this._undoRedoManager.addAction(async () => {
            // Redo action 
            let lastSelectedMemorySlot = rememberLastSelectedMemorySlot;
            let selectedSlots = rememberSelectedSlots;
            let patchList = rememberPatchList;
            let patchCopyList = rememberPatchCopyList;
            let patchCopyListIsCut = rememberPatchCopyListIsCut;
            let destinationMemorySlot = selectedSlots[0];
            if (patchCopyListIsCut) {
                // Swap existing patches in destination slot(s) with copied patches in the memorySlots they were copied from.
                await this.pasteAfterCut(patchCopyList, destinationMemorySlot, patchList, zoomDevice);
                this._patchCopyList = [];
                this._pastePatchesButton.disabled = true;
            }
            else {
                // Overwrite existing patches in destination slot(s). Keep copied patches in the memorySlots they were copied from.
                let destinationMemorySlot = selectedSlots[0];
                for (let [memorySlot, patch] of patchCopyList) {
                    let success = await zoomDevice.uploadPatchToMemorySlot(patch, destinationMemorySlot, true);
                    if (!success) {
                        shouldLog(LogLevel.Error) && console.error(`Failed to upload patch to memory slot ${destinationMemorySlot} on pedal "${zoomDevice.deviceName}".`);
                    }
                    destinationMemorySlot++;
                }
            }
            await this.updatePatchesTable(zoomDevice);
            if (lastSelectedMemorySlot !== -1) {
                zoomDevice.setCurrentMemorySlot(lastSelectedMemorySlot, true); // makes sure the uploaded patch is also "current patch" on the pedal
                this.emitCurrentPatchUpdatedEvent(this);
            }
            this.updatePasteButtonTooltip();
        }, async () => {
            // Undo action
            let lastSelectedMemorySlot = rememberLastSelectedMemorySlot;
            let selectedSlots = rememberSelectedSlots;
            let patchList = rememberPatchList;
            let patchCopyList = rememberPatchCopyList;
            let patchCopyListIsCut = rememberPatchCopyListIsCut;
            if (patchCopyListIsCut) {
                // Swap existing patches in destination slot(s) with copied patches in the memorySlots they were copied from.
                let destinationMemorySlot = selectedSlots[0];
                await this.pasteAfterCut(patchCopyList, destinationMemorySlot, patchList, zoomDevice, true);
                this._patchCopyList = [];
                this._pastePatchesButton.disabled = true;
            }
            else {
                // Overwrite existing patches in destination slot(s). Keep copied patches in the memorySlots they were copied from.
                let destinationMemorySlot = selectedSlots[0];
                for (let [memorySlot, patch] of patchCopyList) {
                    // in undo action, patch is read from the patchList instead of the patchCopyList
                    patch = patchList[destinationMemorySlot];
                    let success = await zoomDevice.uploadPatchToMemorySlot(patch, destinationMemorySlot, true);
                    if (!success) {
                        shouldLog(LogLevel.Error) && console.error(`Failed to upload patch to memory slot ${destinationMemorySlot} on pedal "${zoomDevice.deviceName}".`);
                    }
                    destinationMemorySlot++;
                }
            }
            await this.updatePatchesTable(zoomDevice);
            if (lastSelectedMemorySlot !== -1) {
                zoomDevice.setCurrentMemorySlot(lastSelectedMemorySlot, true); // makes sure the uploaded patch is also "current patch" on the pedal
                this.emitCurrentPatchUpdatedEvent(this);
            }
            this.updatePasteButtonTooltip();
        }, actionDescription);
    }
    updatePasteButtonTooltip() {
        if (this._patchCopyList.length === 0) {
            this._pastePatchesButton.setAttribute("tooltip", "Paste patch(es)");
        }
        else {
            let overwriteOrSwap = this._patchCopyListIsCut ? "swap" : "overwrite";
            this._pastePatchesButton.setAttribute("tooltip", `Paste (${overwriteOrSwap}) ${this._patchCopyList.length} patch${this._patchCopyList.length == 1 ? "" : "es"}`);
        }
    }
    async pasteAfterCut(patchCopyList, destinationMemorySlot, patchList, zoomDevice, undo = false) {
        // Copy existing patches, and keep track of non-overlapping ranges in source and destination slots
        let existingPatches = [];
        let availableSourceSlots = [];
        for (let [slot, patch] of patchCopyList) {
            if (slot < destinationMemorySlot || slot >= destinationMemorySlot + patchCopyList.length) {
                availableSourceSlots.push(slot);
                existingPatches[slot] = patchList[slot].clone();
                console.log(`Available source slot: ${slot}`);
            }
        }
        let availableDestinationSlots = [];
        for (let slot = destinationMemorySlot; slot < destinationMemorySlot + patchCopyList.length; slot++) {
            if (patchCopyList.find(slotAndPatch => slotAndPatch[0] === slot) === undefined) {
                availableDestinationSlots.push(slot);
                existingPatches[slot] = patchList[slot].clone();
                console.log(`Available destination slot: ${slot}`);
            }
        }
        // Copy and overwrite existing patches
        for (let [memorySlot, patch] of patchCopyList) {
            if (!undo) {
                let success = await zoomDevice.uploadPatchToMemorySlot(patch, destinationMemorySlot, true);
                if (!success) {
                    shouldLog(LogLevel.Error) && console.error(`Failed to upload patch to memory slot ${destinationMemorySlot} on pedal "${zoomDevice.deviceName}".`);
                }
            }
            else {
                let patch = patchList[memorySlot];
                let success = await zoomDevice.uploadPatchToMemorySlot(patch, memorySlot, true);
                if (!success) {
                    shouldLog(LogLevel.Error) && console.error(`Failed to upload patch to memory slot ${memorySlot} on pedal "${zoomDevice.deviceName}".`);
                }
            }
            destinationMemorySlot++;
        }
        // Move patches in non-overlapping memory slots, making sure no patches are deleted from the pedal
        if (availableSourceSlots.length !== availableDestinationSlots.length) {
            shouldLog(LogLevel.Error) && console.error(`Available source slots and destination slots have different lengths (${availableSourceSlots.length} !== ${availableDestinationSlots.length}). This should not happen.`);
        }
        else {
            for (let i = 0; i < availableSourceSlots.length; i++) {
                let sourceSlot = availableSourceSlots[i];
                let destinationSlot = availableDestinationSlots[i];
                if (!undo) {
                    let patch = existingPatches[destinationSlot];
                    let success = await zoomDevice.uploadPatchToMemorySlot(patch, sourceSlot, true);
                    if (!success) {
                        shouldLog(LogLevel.Error) && console.error(`Failed to upload patch to memory slot ${sourceSlot} on pedal "${zoomDevice.deviceName}".`);
                    }
                }
                else {
                    let patch = patchList[destinationSlot];
                    let success = await zoomDevice.uploadPatchToMemorySlot(patch, destinationSlot, true);
                    if (!success) {
                        shouldLog(LogLevel.Error) && console.error(`Failed to upload patch to memory slot ${destinationSlot} on pedal "${zoomDevice.deviceName}".`);
                    }
                }
            }
        }
    }
    async undoEditPatchList(zoomDevice) {
        if (this._undoRedoManager === undefined) {
            shouldLog(LogLevel.Error) && console.error(`undoEditPatchList() called but no undoRedoManager found for patchlist.`);
            return;
        }
        this._undoRedoManager.undo();
    }
    async redoEditPatchList(zoomDevice) {
        if (this._undoRedoManager === undefined) {
            shouldLog(LogLevel.Error) && console.error(`redoEditPatchList() called but no undoRedoManager found for patchlist.`);
            return;
        }
        this._undoRedoManager.redo();
    }
    togglePatchesTablePatch(cell, highlight) {
        let memorySlot = this.getMemorySlotFromCell(cell);
        if (memorySlot === -1)
            return;
        if (memorySlot >= this.numberOfPatches) {
            shouldLog(LogLevel.Error) && console.error(`togglePatchesTablePatch() called for cell with memory slot"${cell.dataset.memorySlot}" but total number of patches in list is ${this.numberOfPatches}.`);
            return;
        }
        let row = cell.parentElement;
        if (row === null)
            return;
        let numRows = this._patchesTable.rows.length - 1; // Don't include header row
        let rowNumber = 1 + (memorySlot % numRows); // Add back the header row
        let columnNumber = 2 * Math.floor(memorySlot / numRows);
        let numberCell = this._patchesTable.rows[rowNumber].cells[columnNumber];
        let nameCell = this._patchesTable.rows[rowNumber].cells[columnNumber + 1];
        if (numberCell === undefined || nameCell === undefined) {
            shouldLog(LogLevel.Error) && console.error(`togglePatchesTablePatch() called for cell with memory slot"${cell.dataset.memorySlot}" -> numberCell or nameCell is undefined.`);
        }
        numberCell.classList.toggle("highlight", highlight);
        nameCell.classList.toggle("highlight", highlight);
        this._lastClickedCell = cell;
    }
    /**
     * @param cell - The cell to get the memory slot from.
     * @returns The zero-based memory slot number, or -1 if the cell does not have a memory slot.
     */
    getMemorySlotFromCell(cell) {
        if (cell.dataset.memorySlot === undefined)
            return -1;
        let cellNumber = parseInt(cell.dataset.memorySlot);
        if (Number.isNaN(cellNumber))
            return -1;
        return cellNumber;
    }
    getCellFromMemorySlot(memorySlot) {
        let numRows = this._patchesTable.rows.length - 1; // Don't include header row
        let rowNumber = 1 + (memorySlot % numRows); // Add back the header row
        let columnNumber = 2 * Math.floor(memorySlot / numRows);
        let cell = this._patchesTable.rows[rowNumber].cells[columnNumber];
        return cell;
    }
}

