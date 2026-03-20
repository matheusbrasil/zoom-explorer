// @ts-nocheck
// (c) 2024-2026 by Thomas Hammer, h@mmer.no
import { LCXLDevice } from "./LCXLDevice.js";
import { MIDIDevice } from "./MIDIDevice.js";
import { Project } from "./Project.js";
import { UndoRedoManager } from "./UndoRedoManager.js";
import { ConfirmDialog } from "./ConfirmDialog.js";
import { InfoDialog } from "./InfoDialog.js";
import { MIDIDeviceManager } from "./MIDIDeviceManager.js";
import { MIDIProxyForWebMIDIAPI } from "./MIDIProxyForWebMIDIAPI.js";
import { MIDIProxyForIPC } from "./MIDIProxyForIPC.js";
import { ZoomDevice } from "./ZoomDevice.js";
import { EffectSettings, ZoomPatch } from "./ZoomPatch.js";
import { ZoomPatchEditor } from "./ZoomPatchEditor.js";
import { ZoomPatchEditorModel } from "./ZoomPatchEditorModel.js";
import { ZoomScreen, ZoomScreenCollection, ZoomScreenParameter } from "./ZoomScreenInfo.js";
import { MessageType } from "./midiproxy.js";
import { loadDataFromFile, saveBlobToFile, removeAllEventListeners, TextInputDialog } from "./htmltools.js";
import { getChannelMessage } from "./miditools.js";
import { bytesToHexString, partialArrayStringMatch, bytesWithCharactersToString, compareBuffers, numberToHexString, sleepForAWhile, getSafeFilename, getExceptionErrorString } from "./tools.js";
import { RackDeviceHTMLView } from "./RackDeviceHTMLView.js";
import { RackDeviceModel } from "./RackDeviceModel.js";
import { ZoomDeviceModel } from "./ZoomDeviceModel.js";
import { ZoomDeviceHTMLView } from "./ZoomDeviceHTMLView.js";
import { ZoomDeviceController } from "./ZoomDeviceController.js";
import { SceneDeviceModel } from "./SceneDeviceModel.js";
import { SceneDeviceHTMLView } from "./SceneDeviceHTMLView.js";
import { SCENE_CHANNEL, SceneDeviceController } from "./SceneDeviceController.js";
import { VirtualMIDIDeviceModel } from "./VirtualMIDIDeviceModel.js";
import { VirtualMIDIDeviceHTMLView } from "./VirtualMIDIDeviceHTMLView.js";
import { VirtualMIDIDeviceController } from "./VirtualMIDIDeviceController.js";
import { SceneDeviceMIDIView } from "./SceneDeviceMIDIView.js";
import { ZoomCCMapperModel } from "./ZoomCCMapperModel.js";
import { ZoomCCMapperHTMLView } from "./ZoomCCMapperHTMLView.js";
import { ZoomCCMapperController } from "./ZoomCCMapperController.js";
import { MIDI_RECEIVE_TO_SEND, MIDI_SEND, MIDI_TIMESTAMP_TO_RECEIVE, perfmon } from "./PerformanceMonitor.js";
import { LogLevel, setLogLevel, shouldLog } from "./Logger.js";
import { addThruEffectToMap, extendMapWithMaxNumericalValueIndex, extendMSOGMapWithMS60BEffects, replaceEffectNamesInMap } from "./ZoomEffectMaps.js";
import { MIDIDeviceListHTMLView } from "./MIDIDeviceListHTMLView.js";
import { MIDIDeviceListController } from "./MIDIDeviceListController.js";
import { SettingsModel } from "./SettingsModel.js";
import { SettingsHTMLView } from "./SettingsHTMLView.js";
import { MIDIDeviceListModel } from "./MIDIDeviceListModel.js";
import { ZoomPatchConverter } from "./ZoomPatchConverter.js";
import zoomEffectIDsFullNamesMS200DPlus from "./zoom-effect-ids-full-names-ms200dp.js";
import { ZoomEffectSelector } from "./ZoomEffectSelector.js";
import zoomEffectIDsMS50GPlus from "./zoom-effect-ids-ms50gp.js";
import zoomEffectIDsMS60BPlus from "./zoom-effect-ids-ms60bp.js";
import zoomEffectIDsMS70CDRPlus from "./zoom-effect-ids-ms70cdrp.js";
import zoomEffectIDsG2FOUR from "./zoom-effect-ids-g2four.js";
import zoomEffectIDsB2FOUR from "./zoom-effect-ids-b2four.js";
import { ProgressDialog } from "./ProgressDialog.js";
import { getPatchFromSysex } from "./SymbiosisTools.js";
import { ZoomPatchList } from "./ZoomPatchList.js";
import { FileBrowser } from "./FileBrowser.js";
import { LocalFileSystem } from "./LocalFileSystem.js";
import { installTauriBridge } from "./tauri-bridge.js";
const ZoomDevices = "ZoomDevices";
const MIDIDevices = "MIDIDevices";
const LCXLDevices = "LCXLDevices";

installTauriBridge();

let patchSelectorSyncing = false;
let patchSelectorUIInitialized = false;
async function downloadJSONResource(filename) {
    if (filename.toLowerCase().endsWith(".json") && window.zoomExplorerAPI !== undefined && window.zoomExplorerAPI.readAppFile !== undefined) {
        try {
            let fileData = await window.zoomExplorerAPI.readAppFile(filename);
            return JSON.parse(fileData);
        }
        catch (error) {
            let errorString = getExceptionErrorString(error);
            shouldLog(LogLevel.Warning) && console.warn(`IPC app file read failed for "${filename}", falling back to fetch: ${errorString}`);
        }
    }
    try {
        let response = await fetch(`${filename}`);
        if (!response.ok) {
            let logFunction = filename.toLowerCase().endsWith(".rack") ? console.warn : console.error;
            shouldLog(filename.toLowerCase().endsWith(".rack") ? LogLevel.Warning : LogLevel.Error) && logFunction(`Fetching file ${filename} failed with HTTP error ${response.status}`);
            return undefined;
        }
        return await response.json();
    }
    catch (error) {
        let errorString = getExceptionErrorString(error);
        let isRackResource = filename.toLowerCase().endsWith(".rack");
        let logFunction = isRackResource ? console.warn : console.error;
        shouldLog(isRackResource ? LogLevel.Warning : LogLevel.Error) && logFunction(`Failed loading JSON resource "${filename}": ${errorString}`);
        return undefined;
    }
}
async function downloadEffectMaps(prefix = "") {
    let startTime = performance.now();
    let timeSpent = performance.now() - startTime;
    if (prefix === "")
        prefix = ".";
    if (!prefix.endsWith("/"))
        prefix = prefix + "/";
    let obj = await downloadJSONResource(`${prefix}zoom-effect-mappings-ms50gp.json`);
    if (obj === undefined)
        throw new Error(`Failed to load effect map ${prefix}zoom-effect-mappings-ms50gp.json`);
    shouldLog(LogLevel.Info) && console.log(`Downloading took  ${((performance.now() - startTime) / 1000).toFixed(3)} seconds ***`);
    let mapForMS50GPlus = new Map(Object.entries(obj).map(([key, value]) => [parseInt(key, 16), value]));
    shouldLog(LogLevel.Info) && console.log(`mapForMS50GPlus.size = ${mapForMS50GPlus.size}`);
    startTime = performance.now();
    obj = await downloadJSONResource(`${prefix}zoom-effect-mappings-ms70cdrp.json`);
    if (obj === undefined)
        throw new Error(`Failed to load effect map ${prefix}zoom-effect-mappings-ms70cdrp.json`);
    shouldLog(LogLevel.Info) && console.log(`Downloading took  ${((performance.now() - startTime) / 1000).toFixed(3)} seconds ***`);
    let mapForMS70CDRPlus = new Map(Object.entries(obj).map(([key, value]) => [parseInt(key, 16), value]));
    shouldLog(LogLevel.Info) && console.log(`mapForMS70CDRPlus.size = ${mapForMS70CDRPlus.size}`);
    startTime = performance.now();
    obj = await downloadJSONResource(`${prefix}zoom-effect-mappings-ms60bp.json`);
    if (obj === undefined)
        throw new Error(`Failed to load effect map ${prefix}zoom-effect-mappings-ms60bp.json`);
    shouldLog(LogLevel.Info) && console.log(`Downloading took  ${((performance.now() - startTime) / 1000).toFixed(3)} seconds ***`);
    let mapForMS60BPlus = new Map(Object.entries(obj).map(([key, value]) => [parseInt(key, 16), value]));
    shouldLog(LogLevel.Info) && console.log(`mapForMS60BPlus.size = ${mapForMS60BPlus.size}`);
    startTime = performance.now();
    obj = await downloadJSONResource("zoom-effect-mappings-ms200dp.json");
    if (obj === undefined)
        throw new Error("Failed to load effect map zoom-effect-mappings-ms200dp.json");
    shouldLog(LogLevel.Info) && console.log(`Downloading took  ${((performance.now() - startTime) / 1000).toFixed(3)} seconds ***`);
    let mapForMS200DPlus = new Map(Object.entries(obj).map(([key, value]) => [parseInt(key, 16), value]));
    shouldLog(LogLevel.Info) && console.log(`mapForMS200DPlus.size = ${mapForMS200DPlus.size}`);
    replaceEffectNamesInMap(mapForMS200DPlus, zoomEffectIDsFullNamesMS200DPlus);
    startTime = performance.now();
    obj = await downloadJSONResource("zoom-effect-mappings-g2four.json");
    if (obj === undefined)
        throw new Error("Failed to load effect map zoom-effect-mappings-g2four.json");
    shouldLog(LogLevel.Info) && console.log(`Downloading took  ${((performance.now() - startTime) / 1000).toFixed(3)} seconds ***`);
    let mapForG2FOUR = new Map(Object.entries(obj).map(([key, value]) => [parseInt(key, 16), value]));
    shouldLog(LogLevel.Info) && console.log(`mapForG2FOUR.size = ${mapForG2FOUR.size}`);
    startTime = performance.now();
    obj = await downloadJSONResource("zoom-effect-mappings-b2four.json");
    if (obj === undefined)
        throw new Error("Failed to load effect map zoom-effect-mappings-b2four.json");
    shouldLog(LogLevel.Info) && console.log(`Downloading took  ${((performance.now() - startTime) / 1000).toFixed(3)} seconds ***`);
    let mapForB2FOUR = new Map(Object.entries(obj).map(([key, value]) => [parseInt(key, 16), value]));
    shouldLog(LogLevel.Info) && console.log(`mapForB2FOUR.size = ${mapForB2FOUR.size}`);
    startTime = performance.now();
    obj = await downloadJSONResource(`${prefix}zoom-effect-mappings-msog.json`);
    if (obj === undefined)
        throw new Error(`Failed to load effect map ${prefix}zoom-effect-mappings-msog.json`);
    shouldLog(LogLevel.Info) && console.log(`Downloading took  ${((performance.now() - startTime) / 1000).toFixed(3)} seconds ***`);
    startTime = performance.now();
    // mapForMSOG = new Map<number, EffectParameterMap>(Object.entries(obj).map(([key, value]) => [parseInt(key, 16), value as EffectParameterMap]));
    mapForMSOG = new Map(Object.entries(obj).map(([key, value]) => {
        let numericalKey = parseInt(key, 16);
        let inputValue = value;
        let map = { name: inputValue.name, screenName: inputValue.screenName, parameters: inputValue.parameters };
        if (inputValue.pedal !== undefined)
            map.pedal = new Map(Object.entries(inputValue.pedal));
        return [numericalKey, map];
    }));
    shouldLog(LogLevel.Info) && console.log(`mapForMSOG.size = ${mapForMSOG.size}`);
    extendMSOGMapWithMS60BEffects(mapForMSOG);
    shouldLog(LogLevel.Info) && console.log(`mapForMSOG.size (after extending with MS-60B IDs) = ${mapForMSOG.size}`);
    // merge maps
    mapForMS50GPlusAndMS70CDRPlus = new Map(mapForMS50GPlus);
    mapForMS70CDRPlus.forEach((value, key) => {
        mapForMS50GPlusAndMS70CDRPlus.set(key, value);
    });
    addThruEffectToMap(mapForMS50GPlusAndMS70CDRPlus);
    addThruEffectToMap(mapForMS60BPlus);
    addThruEffectToMap(mapForMS200DPlus);
    addThruEffectToMap(mapForG2FOUR);
    addThruEffectToMap(mapForB2FOUR);
    extendMapWithMaxNumericalValueIndex(mapForMSOG);
    extendMapWithMaxNumericalValueIndex(mapForMS50GPlusAndMS70CDRPlus);
    extendMapWithMaxNumericalValueIndex(mapForMS60BPlus);
    extendMapWithMaxNumericalValueIndex(mapForMS200DPlus);
    extendMapWithMaxNumericalValueIndex(mapForG2FOUR);
    extendMapWithMaxNumericalValueIndex(mapForB2FOUR);
    ZoomDevice.setEffectIDMap(["MS-50G", "MS-60B", "MS-70CDR"], mapForMSOG);
    ZoomDevice.setEffectIDMap(["MS-50G+", "MS-70CDR+"], mapForMS50GPlusAndMS70CDRPlus);
    ZoomDevice.setEffectIDMap(["MS-60B+"], mapForMS60BPlus);
    ZoomDevice.setEffectIDMap(["MS-200D+"], mapForMS200DPlus);
    ZoomDevice.setEffectIDMap(["G2/G2X FOUR"], mapForG2FOUR);
    ZoomDevice.setEffectIDMap(["B2 FOUR"], mapForB2FOUR);
    // ZoomDevice.setEffectIDMap(mapForMS70CDRPlus);
    // mapForMSOG.forEach( (effect, key) => {
    //   for (let i=0; i<effect.parameters.length; i++) {
    //     let parameter = effect.parameters[i];
    //     if (parameter.max > 126) {
    //       shouldLog(LogLevel.Info) && console.log(`${effect.name.padEnd(15, " ")} parameter ${i.toString().padEnd(5, " ")} ${parameter.name.padEnd(10, " ")} with max value ${parameter.max}`);
    //     }
    //   }
    // });
    // let bits = 0;
    // mapForMS50GPlus.forEach( (effect, key) => {
    //   bits |= key;
    // });
    // shouldLog(LogLevel.Info) && console.log(`Bits for MS-50G+ : ${bits.toString(2).padStart(32, "0")}`);
    // bits = 0;
    // mapForMS70CDRPlus.forEach( (effect, key) => {
    //   bits |= key;
    // });
    // shouldLog(LogLevel.Info) && console.log(`Bits for MS-70CDR+ : ${bits.toString(2).padStart(32, "0")}`);
    // bits = 0;
    // mapForMS60BPlus.forEach( (effect, key) => {
    //   bits |= key;
    // });
    // shouldLog(LogLevel.Info) && console.log(`Bits for MS-60B+ : ${bits.toString(2).padStart(32, "0")}`);
    // bits = 0;
    // mapForMS200DPlus.forEach( (effect, key) => {
    //   bits |= key;
    // });
    // shouldLog(LogLevel.Info) && console.log(`Bits for MS-200D+ : ${bits.toString(2).padStart(32, "0")}`);
    // bits = 0;
    // mapForG2FOUR.forEach( (effect, key) => {
    //   bits |= key;
    // });
    // shouldLog(LogLevel.Info) && console.log(`Bits for G2/G2X FOUR : ${bits.toString(2).padStart(32, "0")}`);
    // bits = 0;
    // mapForMSOG.forEach( (effect, key) => {
    //   // if (key & 0b00000000111100000000000000000000)
    //   //   shouldLog(LogLevel.Info) && console.log(`MSOG effect ${effect.name} with ID ${key.toString(16).padStart(8, "0")}, pedal: ${JSON.stringify(effect.pedal)}`);
    //   bits |= key;
    // });
    // shouldLog(LogLevel.Info) && console.log(`Bits for MSOG: ${bits.toString(2).padStart(32, "0")}`);
    // Bits for MS-50G+ and MS-70CDR+ : 00001111 00000000 00001111 11111111
    // Bits for MS-50G+ :               00001111 00000000 00001111 11111111
    // Bits for MS-70CDR+ :             00001111 00000000 00001111 11111111
    // Bits for MS-60B+ :               00001111 00000000 00001111 11111000
    // Bits for MS-200D+ :              00011111 00000000 00001111 11111111
    // Bits for G2/G2X FOUR :           00001111 00000000 00001111 11110000
    // Bits for MSOG:                   00001111 01110000 00000011 11111111
    // From 2024-09-29, before I added the extendMSOGMapWithMS60BEffects() function
    // Bits for MSOG:                   00001111 00000000 00000011 11111111
    // mapForMSOG.forEach( (value, key) => {
    //   if (parameterMap.has(key) === true) {
    //     shouldLog(LogLevel.Warning) && console.warn(`Warning: Overriding effect ${parameterMap.get(key)!.name} for with MSOG effect "${value.name}" 0x${key.toString(16).padStart(8, "0")}`);
    //   }
    //   parameterMap.set(key, value);
    // })
    // shouldLog(LogLevel.Info) && console.log(`parameterMap.size = ${mapForMS50GPlusAndMS70CDRPlus.size}`);
    // Log effects with same IDs and same effect names
    // let allMapsFromID = new Map<number, Map<string, string>>(); // Map<ID, Map<PedalName, EffectName>>
    // let allMapsFromEffectName = new Map<string, Map<string, number>>(); // Map<EffectName, Map<PedalName, ID>>
    // populateAllEffectsList(mapForMSOG, "MSOG");
    // // populateAllEffectsList(mapForMS50GPlusAndMS70CDRPlus, "MS-50G+ and MS-70CDR+");
    // populateAllEffectsList(mapForMS50GPlus, "MS-50G+");
    // populateAllEffectsList(mapForMS70CDRPlus, "MS-70CDR+");
    // populateAllEffectsList(mapForMS60BPlus, "MS-60B+");
    // populateAllEffectsList(mapForMS200DPlus, "MS-200D+");
    // populateAllEffectsList(mapForG2FOUR, "G2/G2X FOUR");
    // function populateAllEffectsList(mapForEffect: EffectIDMap, pedalName: string) {
    //   mapForEffect.forEach((effect, id) => {
    //     let pedalAndEffect = allMapsFromID.get(id);
    //     if (pedalAndEffect === undefined) {
    //       pedalAndEffect = new Map<string, string>();
    //       allMapsFromID.set(id, pedalAndEffect);
    //     }
    //     pedalAndEffect.set(pedalName, effect.name);
    //     let effectNameMap = allMapsFromEffectName.get(effect.name);
    //     if (effectNameMap === undefined) {
    //       effectNameMap = new Map<string, number>();
    //       allMapsFromEffectName.set(effect.name, effectNameMap);
    //     }
    //     effectNameMap.set(pedalName, id);
    //   });
    // }
    // allMapsFromID.forEach((pedalAndEffect, id) => {
    //   let effectNames = "";
    //   for (let pedalName of ["MSOG", "G2/G2X FOUR", "MS-50G+", "MS-70CDR+", "MS-60B+", "MS-200D+"]) {
    //     effectNames += effectNames.length === 0 ? "" : ",";
    //     effectNames += pedalAndEffect.has(pedalName) ? pedalAndEffect.get(pedalName) : " ";
    //   }
    //   shouldLog(LogLevel.Info) && console.log(`${id.toString(16).padStart(8, "0")}, ${effectNames}`);
    // });
    // // Also sort list of effect name, to see if there are any common bit patterns between them
    // allMapsFromEffectName.forEach((idMap, effectName) => {
    //   let ids = "";
    //   for (let pedalName of ["MSOG", "G2/G2X FOUR", "MS-50G+", "MS-70CDR+", "MS-60B+", "MS-200D+"]) {
    //     ids += ids.length === 0 ? "" : ",";
    //     ids += idMap.has(pedalName) ? idMap.get(pedalName)!.toString(16).padStart(8, "0") : " ";
    //   }
    //   shouldLog(LogLevel.Info) && console.log(`${effectName}, ${ids}`);
    // });
}
/* Consider moving functions above this line into utility functions in ZoomExplorer */
// function updateMIDIDevicesTable(devices: IManagedMIDIDevice[]) {
//   let midiDevicesTable: HTMLTableElement = document.getElementById("midiDevicesTable") as HTMLTableElement;
//   while (midiDevicesTable.rows.length > 1)
//     midiDevicesTable.deleteRow(midiDevicesTable.rows.length - 1);
//   for (let index = 0; index < devices.length; index++) {
//     let info = devices[index].deviceInfo;
//     let version = info.manufacturerID[0] === 0x52 ? ZoomDevice.getZoomVersionNumber(info.versionNumber).toString() : bytesToHexString(info.versionNumber, " ");
//     let row = midiDevicesTable.insertRow(-1);
//     let c;
//     c = row.insertCell(-1); c.innerHTML = info.deviceName;
//     c = row.insertCell(-1); c.innerHTML = info.inputName;
//     c = row.insertCell(-1); c.innerHTML = info.outputName;
//     c = row.insertCell(-1); c.innerHTML = info.manufacturerName;
//     c = row.insertCell(-1); c.innerHTML = bytesToHexString(info.familyCode, " ");
//     c = row.insertCell(-1); c.innerHTML = bytesToHexString(info.modelNumber, " ");
//     c = row.insertCell(-1); c.innerHTML = version;
//     c = row.insertCell(-1); c.innerHTML = ""
//     shouldLog(LogLevel.Info) && console.log(`  ${index + 1}: ${info.deviceName.padEnd(8)} OS v ${version} - input: ${info.inputName.padEnd(20)} output: ${info.outputName}`);
//   }
// }
// function updateMIDIDevicesTableActivity(devices: IManagedMIDIDevice[], deviceHandle: DeviceID, message: Uint8Array) 
// {
//   if (performanceMode)
//     return;
//   let midiDevicesTable: HTMLTableElement = document.getElementById("midiDevicesTable") as HTMLTableElement;
// }
function updateMIDIMappingsTable(devices) {
    // virtualMIDIDeviceController.updateMIDIMappingsTable(devices);
}
function initializeModernEditorLayout() {
    const hideSelectors = [".titleContainer", ".subtitle", "#contact", "#settingsContainer", "#midiDeviceList", "#zoomCCMapper", "#midiMappers", "#rackDevices", "#sidebar", "#fileBrowserSidebar"];
    for (let selector of hideSelectors) {
        let elements = document.querySelectorAll(selector);
        for (let element of elements) {
            if (element instanceof HTMLElement)
                element.style.display = "none";
        }
    }
    let patchListHeader = document.getElementById("patchListCollapsibleButton");
    if (patchListHeader !== null && patchListHeader.parentElement !== null)
        patchListHeader.parentElement.style.display = "none";
    let patchEditorHeader = document.getElementById("patchEditorCollapsibleButton");
    if (patchEditorHeader !== null)
        patchEditorHeader.style.display = "none";
}
function getVisibleEditPatchTable(container: HTMLElement): HTMLTableElement | undefined {
    let tables = container.querySelectorAll(".editPatchTable");
    for (let table of tables) {
        if (!(table instanceof HTMLTableElement))
            continue;
        if (table.getClientRects().length === 0)
            continue;
        let style = window.getComputedStyle(table);
        if (style.display === "none" || style.visibility === "hidden")
            continue;
        return table;
    }
    return undefined;
}
function clearViewportFitState(container: HTMLElement, table: HTMLTableElement | undefined) {
    document.body.classList.remove("viewport-fit-mode");
    container.classList.remove("viewport-fit-active");
    container.style.height = "";
    container.style.minHeight = "";
    if (table !== undefined) {
        table.classList.remove("viewport-fit-target");
        table.style.transform = "";
        table.style.transformOrigin = "";
    }
}
function applyViewportFitScale() {
    let container = document.getElementById("patchEditors");
    if (!(container instanceof HTMLElement))
        return;
    let table = getVisibleEditPatchTable(container);
    if (table === undefined) {
        clearViewportFitState(container, undefined);
        return;
    }
    // On mobile/narrow screens we rely on responsive CSS, not transform scaling.
    // Scaling here shrinks the editor into a framed desktop-like rectangle.
    let disableViewportFitScale = document.body.classList.contains("mobile-ui-mode") || window.matchMedia("(max-width: 980px)").matches || window.matchMedia("(orientation: landscape) and (max-height: 560px)").matches;
    if (disableViewportFitScale) {
        clearViewportFitState(container, table);
        return;
    }
    table.classList.remove("viewport-fit-target");
    table.style.transform = "none";
    table.style.transformOrigin = "top left";
    
    // Force no-wrap on parameter rows to measure natural (unwrapped) width
    let parameterRows = table.querySelectorAll(".parameterValueRow, .parameterNameRow");
    let originalFlexWraps = new Map<Element, string>();
    for (let row of parameterRows) {
        if (row instanceof HTMLElement) {
            originalFlexWraps.set(row, row.style.flexWrap);
            row.style.flexWrap = "nowrap";
        }
    }
    
    let containerRect = container.getBoundingClientRect();
    let naturalWidth = Math.max(table.scrollWidth, Math.round(table.getBoundingClientRect().width));
    let naturalHeight = Math.max(table.scrollHeight, Math.round(table.getBoundingClientRect().height));
    
    // Restore original flex-wrap
    for (let [row, originalWrap] of originalFlexWraps) {
        if (row instanceof HTMLElement) {
            row.style.flexWrap = originalWrap;
        }
    }
    
    if (naturalWidth <= 0 || naturalHeight <= 0) {
        clearViewportFitState(container, table);
        return;
    }
    let availableWidth = Math.max(320, window.innerWidth - 10);
    let availableHeight = Math.max(220, window.innerHeight - Math.max(0, Math.floor(containerRect.top)) - 8);
    let scaleX = availableWidth / naturalWidth;
    let scaleY = availableHeight / naturalHeight;
    let scale = Math.min(1, scaleX, scaleY);
    if (scale >= 0.995) {
        clearViewportFitState(container, table);
        return;
    }
    container.classList.add("viewport-fit-active");
    document.body.classList.add("viewport-fit-mode");
    table.classList.add("viewport-fit-target");
    // Center the scaled content horizontally so empty space is distributed equally on both sides
    // rather than accumulating on the right (which would look like a "left-side rectangle").
    table.style.transformOrigin = "top center";
    table.style.transform = `scale(${scale})`;
    let fittedHeight = Math.ceil(naturalHeight * scale);
    container.style.height = `${fittedHeight}px`;
    container.style.minHeight = `${fittedHeight}px`;
}
let scheduleViewportFitScaleHandle = 0;
function scheduleViewportFitScale() {
    if (scheduleViewportFitScaleHandle !== 0)
        cancelAnimationFrame(scheduleViewportFitScaleHandle);
    scheduleViewportFitScaleHandle = requestAnimationFrame(() => {
        scheduleViewportFitScaleHandle = 0;
        applyViewportFitScale();
    });
}
function closePatchSelectorMenu() {
    let dialog = document.getElementById("patchSelectorMenu");
    let button = document.getElementById("patchSelectorButton");
    if (dialog instanceof HTMLDialogElement && dialog.open)
        dialog.close();
    if (button instanceof HTMLButtonElement)
        button.setAttribute("aria-expanded", "false");
}
function updatePatchSelectorButtonLabel() {
    let button = document.getElementById("patchSelectorButton");
    if (button instanceof HTMLButtonElement)
        button.title = "Select patch";
}
function rebuildPatchSelectorMenu() {
    let dropdown = document.getElementById("patchSelectorDropdown");
    let dialog = document.getElementById("patchSelectorMenu");
    let list = dialog instanceof HTMLDialogElement ? dialog.querySelector(".patchSelectorList") : null;
    if (!(dropdown instanceof HTMLSelectElement) || !(list instanceof HTMLElement))
        return;
    while (list.firstChild !== null)
        list.removeChild(list.firstChild);
    for (let i = 0; i < dropdown.options.length; i++) {
        let option = dropdown.options[i];
        let itemButton = document.createElement("button");
        itemButton.className = "patchSelectorMenuItem";
        itemButton.type = "button";
        itemButton.dataset.value = option.value;
        itemButton.textContent = option.text;
        if (dropdown.value === option.value)
            itemButton.classList.add("selected");
        itemButton.addEventListener("click", () => {
            dropdown.value = option.value;
            dropdown.dispatchEvent(new Event("change"));
            closePatchSelectorMenu();
        });
        list.appendChild(itemButton);
    }
}
function alignPatchSelectorMenuToCurrentSelection() {
    let dropdown = document.getElementById("patchSelectorDropdown");
    let dialog = document.getElementById("patchSelectorMenu");
    let list = dialog instanceof HTMLDialogElement ? dialog.querySelector(".patchSelectorList") : null;
    if (!(dropdown instanceof HTMLSelectElement) || !(list instanceof HTMLElement))
        return;
    let selectedItem: HTMLButtonElement | undefined = undefined;
    let menuItems = list.querySelectorAll(".patchSelectorMenuItem");
    for (let item of menuItems) {
        if (!(item instanceof HTMLButtonElement))
            continue;
        let isSelected = item.dataset.value === dropdown.value;
        item.classList.toggle("selected", isSelected);
        if (isSelected)
            selectedItem = item;
    }
    if (selectedItem !== undefined)
        selectedItem.scrollIntoView({ block: "nearest" });
}
function initPatchSelectorUI() {
    let button = document.getElementById("patchSelectorButton");
    let mobileMenuButton = document.getElementById("mobileMenuButton");
    let dialog = document.getElementById("patchSelectorMenu");
    if (!(button instanceof HTMLButtonElement) || !(dialog instanceof HTMLDialogElement))
        return;
    let openPatchSelector = () => {
        if (dialog.open) {
            closePatchSelectorMenu();
            return;
        }
        rebuildPatchSelectorMenu();
        dialog.showModal();
        button.setAttribute("aria-expanded", "true");
        requestAnimationFrame(() => alignPatchSelectorMenuToCurrentSelection());
    };
    // Wire close button inside the dialog
    let closeBtn = dialog.querySelector(".patchSelectorCloseButton");
    if (closeBtn instanceof HTMLButtonElement)
        closeBtn.addEventListener("click", () => closePatchSelectorMenu());
    // Close when clicking the backdrop (outside the panel)
    dialog.addEventListener("click", (event) => {
        if (event.target === dialog)
            closePatchSelectorMenu();
    });
    dialog.addEventListener("cancel", () => closePatchSelectorMenu());
    button.onclick = null;
    button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        openPatchSelector();
    });
    if (mobileMenuButton instanceof HTMLButtonElement) {
        mobileMenuButton.onclick = null;
        mobileMenuButton.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopPropagation();
            openPatchSelector();
        });
    }
    if (!patchSelectorUIInitialized)
        patchSelectorUIInitialized = true;
    rebuildPatchSelectorMenu();
    alignPatchSelectorMenuToCurrentSelection();
    updatePatchSelectorButtonLabel();
}
function updatePatchSelectorOptions(zoomDevice) {
    let dropdown = document.getElementById("patchSelectorDropdown");
    if (!(dropdown instanceof HTMLSelectElement))
        return;
    patchSelectorSyncing = true;
    while (dropdown.options.length > 0)
        dropdown.remove(0);
    for (let i = 0; i < zoomDevice.patchList.length; i++) {
        let patch = zoomDevice.patchList[i];
        let patchName = patch.nameTrimmed && patch.nameTrimmed.length > 0 ? patch.nameTrimmed : `Patch ${(i + 1).toString().padStart(3, "0")}`;
        if (currentZoomPatch !== undefined && i === patchList.currentlySelectedMemorySlot) {
            patchName = currentZoomPatch.nameTrimmed;
        }
        let option = document.createElement("option");
        option.value = i.toString();
        option.text = `${(i + 1).toString().padStart(3, "0")} - ${patchName}`;
        option.dataset.patchName = patchName;
        dropdown.add(option);
    }
    let selectedSlot = patchList.currentlySelectedMemorySlot;
    if ((selectedSlot < 0 || selectedSlot >= dropdown.options.length) && zoomDevice.currentMemorySlotNumber !== undefined) {
        let currentSlot = zoomDevice.currentMemorySlotNumber;
        if (currentSlot >= 0 && currentSlot < dropdown.options.length)
            selectedSlot = currentSlot;
    }
    if (selectedSlot >= 0 && selectedSlot < dropdown.options.length)
        dropdown.value = selectedSlot.toString();
    patchSelectorSyncing = false;
    rebuildPatchSelectorMenu();
    updatePatchSelectorButtonLabel();
}
function updatePatchSelectorSelection(memorySlot) {
    let dropdown = document.getElementById("patchSelectorDropdown");
    if (!(dropdown instanceof HTMLSelectElement))
        return;
    if (memorySlot < 0 || memorySlot >= dropdown.options.length)
        return;
    patchSelectorSyncing = true;
    dropdown.value = memorySlot.toString();
    patchSelectorSyncing = false;
    rebuildPatchSelectorMenu();
    updatePatchSelectorButtonLabel();
}
function initPatchSelectorDropdown(zoomDevice) {
    let dropdown = document.getElementById("patchSelectorDropdown");
    if (!(dropdown instanceof HTMLSelectElement))
        return;
    dropdown = removeAllEventListeners(dropdown);
    if (!(dropdown instanceof HTMLSelectElement))
        return;
    dropdown.addEventListener("change", () => {
        if (patchSelectorSyncing || currentZoomDevice === undefined)
            return;
        let memorySlot = Number.parseInt(dropdown.value);
        if (Number.isNaN(memorySlot))
            return;
        patchList.currentlySelectedMemorySlot = memorySlot;
        currentZoomPatchToConvert = undefined;
        loadedPatchEditor.hide();
        currentZoomDevice.setCurrentMemorySlot(memorySlot);
        updatePatchSelectorButtonLabel();
    });
    initPatchSelectorUI();
    updatePatchSelectorOptions(zoomDevice);
}
function initPatchesTable(zoomDevice) {
    if (zoomDevice !== currentZoomDevice)
        shouldLog(LogLevel.Error) && console.error(`initPatchesTable() called for ZoomDevice "${zoomDevice.deviceName}" that is not currentZoomDevice "${currentZoomDevice.deviceName}".`);
    let patchListUndoRedoManager = undoRedoManagers.get("patchlist_" + zoomDevice.deviceName);
    if (patchListUndoRedoManager === undefined) {
        shouldLog(LogLevel.Error) && console.error(`initPatchesTable() called for ZoomDevice "${zoomDevice.deviceName}" but no undoRedoManager found for patchlist.`);
        return;
    }
    patchList.initPatchesTable(zoomDevice, patchListUndoRedoManager);
    initPatchSelectorDropdown(zoomDevice);
}
async function updatePatchesTable(zoomDevice) {
    if (zoomDevice !== currentZoomDevice)
        shouldLog(LogLevel.Error) && console.error(`updatePatchesTable() called for ZoomDevice "${zoomDevice.deviceName}" that is not currentZoomDevice "${currentZoomDevice.deviceName}".`);
    patchList.updatePatchesTable(zoomDevice);
    updatePatchSelectorOptions(zoomDevice);
    // if (fileBrowser !== undefined)
    // {
    //   let patchListRoot = fileBrowser.getItemByPath("/Patchlist");
    //   if (patchListRoot !== undefined)
    //   {
    //     fileBrowser.removeAllItemsBelow(patchListRoot);
    //     for (let i = 0; i < zoomDevice.patchList.length; i++) {
    //       let patch = zoomDevice.patchList[i];
    //       let item: FileBrowserItem = {
    //         name: `${(i + 1).toString().padStart(3, "0")} ${patch.nameTrimmed}`,
    //         type: "file",
    //         path: `/Patchlist/${(i + 1).toString().padStart(3, "0")} ${patch.nameTrimmed}`,
    //         modified: new Date(Date.now())
    //       }
    //       fileBrowser.addItemsBelow(patchListRoot, [item]);
    //     }
    //   }
    // }
}
// function updatePatchInfoTable(patch: ZoomPatch)
// {
//   if (lastSelected === null)
//     return;
//   let patchNumber1based = getPatchNumber(lastSelected);
//   let patchTable = document.getElementById("editPatchTableID") as HTMLTableElement; 
//   let headerCell = patchTable.rows[0].cells[0];
//   let patchNameString = "";
//   if (patch.name !== null) // fixme: use patch class method instead
//     patchNameString = patch.name.trim().replace(/[ ]{2,}/gi," "); // trim spaces at start and end, as well as double spaces
//   headerCell.innerHTML = `Patch ${patchNumber1based.toString().padStart(2, "0")}: ${patchNameString}`;
// }
async function uploadPatchToSelectedMemorySlot(patch, zoomDevice, askForConfirmation = true) {
    if (zoomDevice !== currentZoomDevice)
        shouldLog(LogLevel.Warning) && console.warn(`uploadPatchToMemorySlot() called for ZoomDevice "${zoomDevice.deviceName}" that is not currentZoomDevice "${currentZoomDevice.deviceName}".`);
    if (patch.PTCF === null && patch.MSOG === null) {
        shouldLog(LogLevel.Error) && console.error(`patch.PTCF === null && patch.MSOG === null for ZoomDevice "${zoomDevice.deviceName}".`);
        return false;
    }
    let memorySlot = patchList.currentlySelectedMemorySlot;
    if (memorySlot === -1) {
        shouldLog(LogLevel.Error) && console.error("Cannot upload patch to memory slot since no memory slot was selected");
        return false;
    }
    let nameForPatchInSlot = "";
    if (memorySlot < zoomDevice.patchList.length) {
        nameForPatchInSlot = zoomDevice.patchList[memorySlot].nameTrimmed ?? nameForPatchInSlot;
        nameForPatchInSlot = `"${nameForPatchInSlot}"`;
    }
    let result = true;
    if (nameForPatchInSlot !== `"Empty"` && askForConfirmation)
        result = await confirmDialog.getUserConfirmation(`Are you sure you want to overwrite patch number ${memorySlot + 1} ${nameForPatchInSlot} ?`);
    if (!result)
        return false;
    await zoomDevice.uploadPatchToMemorySlot(patch, memorySlot, true);
    await updatePatchesTable(zoomDevice);
    // Commented out line below because it would hide the loadedPatchEditor when handleMemorySlotChanged() is called
    // See comment below regarding this
    zoomDevice.setCurrentMemorySlot(memorySlot, true); // makes sure the uploaded patch is also "current patch" on the pedal
    // FIXME 2025-07-20: Is this needed?
    // if (lastSelected !== null)
    //   togglePatchesTablePatch(lastSelected, false); 
    // let selected = getCellForMemorySlot(zoomDevice, "patchesTable", memorySlot);
    // if (selected !==undefined && zoomDevice.patchList.length > 0) {
    //   if (lastSelected != null)
    //     togglePatchesTablePatch(lastSelected, false);    
    //   togglePatchesTablePatch(selected, true);
    //   lastSelected = selected;
    // }
    currentZoomPatch = zoomDevice.patchList[memorySlot].clone();
    // The following 3 lines are needed to make sure the screens are updated for MSOG pedals, since we've commented out the 
    // call to zoomDevice.setCurrentMemorySlot() above
    // FIXME: This design is fragile. Should be made more robust.
    // muteScreenUpdate = true;
    // await zoomDevice.updateScreens(); // fails because zoomDevice.currentPatch hasn't been updated yet
    // muteScreenUpdate = false;
    getScreenCollectionAndUpdateEditPatchTable(zoomDevice);
    return true;
}
function initPatchTable(zoomDevice) {
    if (zoomDevice !== currentZoomDevice)
        shouldLog(LogLevel.Error) && console.error(`initPatchTable() called for ZoomDevice "${zoomDevice.deviceName}" that is not currentZoomDevice "${currentZoomDevice.deviceName}".`);
    let editPatchTable = document.getElementById("editPatchTableID");
    let titleButton = editPatchTable.parentElement?.parentElement?.children[0].children[1];
    titleButton.childNodes[0].nodeValue = "Patch Editor  " + zoomDevice.deviceName;
    let content = editPatchTable.parentElement?.parentElement?.children[1];
    let onOffButton = editPatchTable.parentElement?.parentElement?.children[0].children[0];
    onOffButton.classList.toggle("on", patchEditorModel.on);
    for (let child of content.children) {
        child.classList.toggle("on", patchEditorModel.on);
    }
    titleButton.classList.toggle("on", patchEditorModel.on);
    onOffButton.addEventListener("click", (event) => {
        patchEditorModel.on = !patchEditorModel.on;
        onOffButton.classList.toggle("on", patchEditorModel.on);
        for (let child of content.children) {
            child.classList.toggle("on", patchEditorModel.on);
        }
        titleButton.classList.toggle("on", patchEditorModel.on);
        storePatchEditorToLocalStorage();
    });
    let bindActionButtonClick = (buttonID, listener) => {
        let buttons = getPatchActionButtons(buttonID);
        for (let button of buttons) {
            let resetButton = removeAllEventListeners(button);
            resetButton.addEventListener("click", listener);
        }
    };
    let refreshPatchListsAfterImport = async () => {
        await updatePatchesTable(zoomDevice);
        updatePatchSelectorSelection(patchList.currentlySelectedMemorySlot);
        alignPatchSelectorMenuToCurrentSelection();
    };
    bindActionButtonClick("undoEditPatchButton", async (event) => {
        if (currentZoomPatch === undefined) {
            shouldLog(LogLevel.Error) && console.error("Can't undo edit since no patch is selected. currentPatch == null.");
            return;
        }
        let undoRedoManager = getCurrentUndoRedoManager();
        if (undoRedoManager === undefined) {
            return;
        }
        await undoRedoManager.undo();
    });
    bindActionButtonClick("redoEditPatchButton", async (event) => {
        if (currentZoomPatch === undefined) {
            shouldLog(LogLevel.Error) && console.error("Can't redo edit since no patch is selected. currentPatch == null.");
            return;
        }
        let undoRedoManager = getCurrentUndoRedoManager();
        if (undoRedoManager === undefined) {
            return;
        }
        await undoRedoManager.redo();
    });
    bindActionButtonClick("syncPatchToPedalButton", async (event) => {
        if (currentZoomPatch === undefined) {
            shouldLog(LogLevel.Error) && console.error("Can't sync current patch to pedal since no patch is selected. currentPatch == null.");
            return;
        }
        let patchWasSaved = await uploadPatchToSelectedMemorySlot(currentZoomPatch, zoomDevice, false);
        if (patchWasSaved)
            setPatchNotDirty(true);
    });
    bindActionButtonClick("deleteCurrentPatchButton", async (event) => {
        // Reuse legacy patch list delete flow (undo/redo and empty-patch upload semantics).
        let selectedSlots = patchList.selectedMemorySlots;
        if (selectedSlots.length === 0) {
            let currentSlot = zoomDevice.currentMemorySlot;
            if (currentSlot >= 0) {
                patchList.currentlySelectedMemorySlot = currentSlot;
            }
        }
        await patchList.deletePatches(zoomDevice);
        // Keep selector/table text synchronized with the newly deleted patch content.
        await updatePatchesTable(zoomDevice);
        updatePatchSelectorSelection(patchList.currentlySelectedMemorySlot);
        alignPatchSelectorMenuToCurrentSelection();
    });
    bindActionButtonClick("savePatchToDiskButton", async (event) => {
        if (currentZoomPatch === undefined) {
            shouldLog(LogLevel.Error) && console.error("Can't save current patch to file since no patch is selected. currentPatch == null.");
            return;
        }
        let [fileEnding, shortFileEnding, fileDescription] = zoomDevice.getSuggestedFileEndingForPatch();
        let suggestedName = currentZoomPatch.name !== null ? getSafeFilename(currentZoomPatch.name).trim().replace(/[ ]{2,}/gi, " ") + "." + fileEnding : `patch.${fileEnding}`;
        if (currentZoomPatch.ptcfChunk !== null && currentZoomPatch.ptcfChunk.length > 0) {
            let previousChunk = currentZoomPatch.ptcfChunk;
            currentZoomPatch.buildPTCFChunk(zoomDevice.ptcfNameLength);
            compareBuffers(currentZoomPatch.ptcfChunk, previousChunk);
            const blob = new Blob([currentZoomPatch.ptcfChunk]);
            await saveBlobToFile(blob, suggestedName, shortFileEnding, fileDescription);
        }
        else if (currentZoomPatch.msogDataBuffer !== null && currentZoomPatch.msogDataBuffer.length > 0) {
            let sysex = zoomDevice.getSysexForCurrentPatch(currentZoomPatch);
            if (sysex === undefined) {
                shouldLog(LogLevel.Warning) && console.warn(`getSysexForCurrentPatch() failed for patch "${currentZoomPatch.name}"`);
                return;
            }
            let sysexString = bytesToHexString(sysex).toLowerCase();
            const blob = new Blob([sysexString]);
            await saveBlobToFile(blob, suggestedName, fileEnding, fileDescription);
        }
    });
    bindActionButtonClick("loadPatchFromDiskButton", async (event) => {
        let [fileEnding, shortFileEnding, fileDescription] = zoomDevice.getSuggestedFileEndingForPatch();
        let data;
        let filename;
        let patch = undefined;
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
        [data, filename] = await loadDataFromFile(fileEndings, fileDescriptions);
        if (data === undefined || filename === undefined)
            return;
        currentZoomPatchToConvert = undefined;
        if (partialArrayStringMatch(data, "PTCF")) {
            patch = ZoomPatch.fromPatchData(data);
            if (patch !== undefined) {
                currentZoomPatchToConvert = undefined;
                loadedPatchEditor.hide();
                let patchWasUploaded = await uploadPatchToSelectedMemorySlot(patch, zoomDevice);
                if (patchWasUploaded)
                    await refreshPatchListsAfterImport();
            }
        }
        else {
            let sysexString = bytesWithCharactersToString(data);
            if (sysexString.length !== 0) {
                patch = await loadFromSysex(sysexString, zoomDevice);
                if (patch === undefined) {
                    currentZoomPatchToConvert = undefined;
                    loadedPatchEditor.hide();
                }
                else {
                    await refreshPatchListsAfterImport();
                }
            }
        }
    });
    bindActionButtonClick("loadPatchFromTextButton", async (event) => {
        let patch = undefined;
        currentZoomPatchToConvert = undefined;
        let sysexString = await textInputDialog.getUserText("Sysex text", "", "Load");
        if (sysexString.length !== 0) {
            patch = await loadFromSysex(sysexString, zoomDevice);
            if (patch === undefined) {
                currentZoomPatchToConvert = undefined;
                loadedPatchEditor.hide();
            }
            else {
                await refreshPatchListsAfterImport();
            }
        }
    });
}
async function loadFromSysex(sysexString, zoomDevice, filename = "") {
    let patch = getPatchFromSysex(sysexString, zoomDevice, filename);
    // Check if patch should be converted from MSOG to MS+
    if (patch !== undefined && patch.MSOG !== null && (zoomDevice.deviceName.includes("MS-70CDR+") ||
        zoomDevice.deviceName.includes("MS-50G+")) && mapForMSOG !== undefined) {
        currentZoomPatchToConvert = patch;
        shouldLog(LogLevel.Info) && console.log(`Converting patch "${patch.name}" from MS to MS+`);
        let [convertedPatch, unmappedSlotParameterList] = zoomPatchConverter.convert(patch);
        if (convertedPatch === undefined) {
            shouldLog(LogLevel.Warning) && console.warn(`Conversion failed for patch "${patch.name}"`);
        }
        else {
            shouldLog(LogLevel.Info) && console.log(`Conversion succeeded for patch "${patch.name}"`);
        }
        patch = convertedPatch;
        if (patch !== undefined) {
            let patchWasUploaded = await uploadPatchToSelectedMemorySlot(patch, zoomDevice);
            if (patchWasUploaded && currentZoomPatchToConvert !== undefined) {
                initConvertedPatchEditor(zoomDevice);
                updateEditorsForConvertedPatch(patch, unmappedSlotParameterList, zoomDevice);
            }
        }
    }
    else {
        // No conversion, just upload patch
        if (patch !== undefined) {
            await uploadPatchToSelectedMemorySlot(patch, zoomDevice);
        }
    }
    return patch;
}
let muteScreenUpdate = false; // not the prettiest of designs...
function initConvertedPatchEditor(zoomDevice) {
    if (currentZoomPatchToConvert === undefined) {
        shouldLog(LogLevel.Error) && console.error("currentZoomPatchToConvert is undefined in initConvertdPatchEditor");
        return;
    }
    if (mapForMSOG === undefined) {
        shouldLog(LogLevel.Error) && console.error("mapForMSOG is undefined in initConvertdPatchEditor");
        return;
    }
    let screens = ZoomScreenCollection.fromPatchAndMappings(currentZoomPatchToConvert, mapForMSOG);
    loadedPatchEditor.updateFromMap("MS-70CDR", mapForMSOG, 3, screens, currentZoomPatchToConvert, "MS-OG Patch:", undefined, undefined);
    loadedPatchEditor.show();
    loadedPatchEditor.setTextEditedCallback((event, type, initialValueString) => {
        return handlePatchEdited(currentZoomPatchToConvert, zoomDevice, mapForMSOG, event, type, initialValueString);
    });
    loadedPatchEditor.setMouseMovedCallback((cell, initialValueString, x, y) => {
        handleMouseMoved(currentZoomPatchToConvert, zoomDevice, mapForMSOG, cell, initialValueString, x, y);
    });
    loadedPatchEditor.setMouseUpCallback((cell, initialValueString, x, y) => {
        handleMouseUp(currentZoomPatchToConvert, zoomDevice, mapForMSOG, cell, initialValueString, x, y);
    });
    loadedPatchEditor.setEffectSlotOnOffCallback((effectSlot, on) => {
        handleEffectSlotOnOff(currentZoomPatchToConvert, zoomDevice, mapForMSOG, effectSlot, on);
    });
    loadedPatchEditor.setEffectSlotMoveCallback((effectSlot, direction) => {
        handleEffectSlotMove(currentZoomPatchToConvert, zoomDevice, mapForMSOG, effectSlot, direction);
    });
    loadedPatchEditor.setEffectSlotAddCallback((effectSlot, direction) => {
        handleEffectSlotAdd(currentZoomPatchToConvert, zoomDevice, mapForMSOG, effectSlot, direction);
    });
    loadedPatchEditor.setEffectSlotDeleteCallback((effectSlot) => {
        handleEffectSlotDelete(currentZoomPatchToConvert, zoomDevice, mapForMSOG, effectSlot);
    });
    loadedPatchEditor.setEffectSlotSelectEffectCallback((effectSlot) => {
        handleEffectSlotSelectEffect(currentZoomPatchToConvert, zoomDevice, mapForMSOG, effectSlot);
    });
    loadedPatchEditor.setEffectSlotSelectCallback((effectSlot) => {
        if (currentZoomPatchToConvert !== undefined)
            currentZoomPatchToConvert.currentEffectSlot = effectSlot;
        loadedPatchEditor.updateEffectSlotFrame(effectSlot);
    });
    zoomEffectSelector = new ZoomEffectSelector();
    let effectSelectors = document.getElementById("effectSelectors");
    effectSelectors.append(zoomEffectSelector.htmlElement);
    let effectLists = new Map();
    effectLists.set("MS-50G+", zoomEffectIDsMS50GPlus);
    effectLists.set("MS-60B+", zoomEffectIDsMS60BPlus);
    effectLists.set("MS-70CDR+", zoomEffectIDsMS70CDRPlus);
    effectLists.set("G2/G2X FOUR", zoomEffectIDsG2FOUR);
    effectLists.set("B2 FOUR", zoomEffectIDsB2FOUR);
    let zoomEffectIDsFullNamesMS200DPlusWithout1D = new Map();
    for (let [key, value] of zoomEffectIDsFullNamesMS200DPlus.entries())
        if (key < 0x1D000000)
            zoomEffectIDsFullNamesMS200DPlusWithout1D.set(key, value.toLowerCase().replace(/(^\w{1})|(\s+\w{1})/g, letter => letter.toUpperCase()));
    effectLists.set("MS-200D+", zoomEffectIDsFullNamesMS200DPlusWithout1D);
    effectLists.set("MS-50G", buildEffectIDList("MS-50G"));
    effectLists.set("MS-60B", buildEffectIDList("MS-60B"));
    effectLists.set("MS-70CDR", buildEffectIDList("MS-70CDR"));
    zoomEffectSelector.setHeading("Amps and Effects");
    let pedalName = zoomDevice?.deviceInfo?.deviceName ?? zoomDevice?.deviceName ?? "";
    zoomEffectSelector.setEffectList(effectLists, pedalName);
}
function buildEffectIDList(pedalName) {
    let zoomEffectIDList = new Map();
    let effectMap = ZoomDevice.getEffectIDMapForDevice(pedalName);
    if (effectMap === undefined) {
        shouldLog(LogLevel.Error) && console.error("No effect ID map found for device ${pedalName}");
    }
    else {
        for (let [effectID, parameterMap] of effectMap) {
            if (parameterMap.pedal !== undefined && parameterMap.pedal.has(pedalName) && pedalName !== "THRU")
                zoomEffectIDList.set(effectID, parameterMap.name);
        }
    }
    return zoomEffectIDList;
}
function getScreenCollectionAndUpdateEditPatchTable(zoomDevice) {
    if (muteScreenUpdate)
        return;
    if (zoomDevice !== currentZoomDevice)
        shouldLog(LogLevel.Error) && console.error(`getScreenCollectionAndUpdateEditPatchTable() called for ZoomDevice "${zoomDevice.deviceName}" that is not currentZoomDevice "${currentZoomDevice.deviceName}".`);
    let screenCollection = zoomDevice.currentScreenCollection;
    if (screenCollection === undefined && currentZoomPatch !== undefined && zoomDevice.effectIDMap !== undefined) {
        // FIXME: Not the most robust of designs... Depends on mapping being loaded and existing for that pedal.
        // screenCollection = ZoomScreenCollection.fromPatchAndMappings(currentZoomPatch, zoomDevice.effectIDMap);
        muteScreenUpdate = true;
        zoomDevice.updateScreens();
        muteScreenUpdate = false;
        screenCollection = zoomDevice.currentScreenCollection;
    }
    if (screenCollection === undefined)
        zoomDevice.updateScreens();
    if (screenCollection === undefined)
        shouldLog(LogLevel.Warning) && console.warn("zoomDevice.screenCollection === undefined");
    let compare = previousEditScreenCollection;
    // Note: should probably take patch equality into consideration...
    if (screenCollection !== undefined && screenCollection.equals(previousEditScreenCollection))
        compare = lastChangedEditScreenCollection;
    let patchNumbertext = (patchList.currentlySelectedMemorySlot + 1).toString().padStart(3, "0");
    if (patchEditorModel.on)
        patchEditor.update(zoomDevice, screenCollection, currentZoomPatch, patchNumbertext, compare, previousEditPatch);
    previousEditScreenCollection = screenCollection;
    previousEditPatch = currentZoomPatch;
    if (currentLCXLDevice !== undefined && currentZoomPatch !== undefined)
        updateLCXLColors(currentLCXLDevice, zoomDevice, currentZoomPatch);
}
async function handleMemorySlotChanged(zoomDevice, memorySlot) {
    if (zoomDevice !== currentZoomDevice)
        return;
    shouldLog(LogLevel.Info) && console.log(`Memory slot changed: ${memorySlot}  (0x${bytesToHexString([memorySlot])})`);
    setPatchNotDirty();
    let undoRedoManager = getCurrentUndoRedoManager();
    if (undoRedoManager === undefined) {
        return;
    }
    undoRedoManager.clear();
    previousEditScreenCollection = undefined;
    lastChangedEditScreenCollection = undefined;
    let lastMemorySlot = patchList.currentlySelectedMemorySlot;
    patchList.currentlySelectedMemorySlot = memorySlot;
    currentZoomPatch = zoomDevice.patchList[memorySlot].clone();
    if (lastMemorySlot !== memorySlot) {
        currentZoomPatchToConvert = undefined;
        loadedPatchEditor.hide();
    }
    // Note 2025-07-30: Added this back. ZoomPatchList currentlySelectedMemorySlot setter doesn't emit CurrentMemorySlotChangedEvent anymore.
    getScreenCollectionAndUpdateEditPatchTable(zoomDevice);
    // FIXME 2025-07-20: This shouldn't be needed anymore. Handled in zoomPatchList.currentMemorySlotChangedListener.
    // let selected = getCellForMemorySlot(zoomDevice, "patchesTable", memorySlot);
    // let lastMemorySlot = -1;
    // if (lastSelected !== null && lastSelected.dataset.memorySlot !== undefined)
    //   lastMemorySlot = parseInt(lastSelected.dataset.memorySlot);
    // if (memorySlot !== lastMemorySlot) {
    //   currentZoomPatchToConvert = undefined;
    //   loadedPatchEditor.hide();
    // }
    // if (selected !==undefined && zoomDevice.patchList.length > 0) {
    //   if (lastSelected != null)
    //     togglePatchesTablePatch(lastSelected, false);    
    //   togglePatchesTablePatch(selected, true);
    //   lastSelected = selected;
    // currentZoomPatch = zoomDevice.patchList[memorySlot].clone();
    // // MSOG pedals doesn't call handleScreenChanged, so we need to update patch name here
    // // This means that for MS Plus pedals, we update screens twice
    // getScreenCollectionAndUpdateEditPatchTable(zoomDevice);
}
async function handleScreenChanged(zoomDevice) {
    if (zoomDevice !== currentZoomDevice)
        return;
    shouldLog(LogLevel.Info) && console.log(`Screen changed - updating screens/patch editor for now, but we need to handle effect deletions/additions later on (for editor), and program changes, see autoUpdateScreens in ZoomDevice`);
    getScreenCollectionAndUpdateEditPatchTable(zoomDevice);
}
function handleCurrentPatchChanged(zoomDevice) {
    if (zoomDevice !== currentZoomDevice)
        return;
    shouldLog(LogLevel.Info) && console.log(`Current patch changed (patch dump received)`);
    // patchIsDirty(false);
    if (currentZoomPatch === undefined || zoomDevice.currentPatch === undefined)
        return;
    if (currentZoomPatch.name !== zoomDevice.currentPatch.name) {
        setPatchParameter(currentZoomPatch, zoomDevice, zoomDevice.effectIDMap, "name", zoomDevice.currentPatch.name, "", "", false);
    }
    // Detect effect slot changes, like browsing, adding, deleting, rearranging effects
    let effectSettingsChanged = false;
    if (currentZoomPatch.effectSettings !== null && zoomDevice.currentPatch.effectSettings !== null) {
        if (currentZoomPatch.effectSettings.length !== zoomDevice.currentPatch.effectSettings.length) {
            shouldLog(LogLevel.Info) && console.log(`Effect added or removed. effectSettings.length ${currentZoomPatch.effectSettings.length} !== zoomDevice.currentPatch.effectSettings.length ${zoomDevice.currentPatch.effectSettings.length}`);
            currentZoomPatch = zoomDevice.currentPatch.clone();
            effectSettingsChanged = true;
            currentZoomPatchToConvert = undefined;
            loadedPatchEditor.hide();
            // FIXME: Should probably just surgically add the new effect to currentZoomPatch
            if (currentLCXLDevice)
                updateLCXLColors(currentLCXLDevice, zoomDevice, currentZoomPatch);
        }
        else {
            for (let effectSlot = 0; effectSlot < currentZoomPatch.effectSettings.length; effectSlot++) {
                if (currentZoomPatch.effectSettings[effectSlot].id !== zoomDevice.currentPatch.effectSettings[effectSlot].id) {
                    shouldLog(LogLevel.Info) && console.log(`Effect changed in slot ${effectSlot}. currentZoomPatch.effectSettings[${effectSlot}].id ${numberToHexString(currentZoomPatch.effectSettings[effectSlot].id)} -> zoomDevice.currentPatch.effectSettings[${effectSlot}].id ${numberToHexString(zoomDevice.currentPatch.effectSettings[effectSlot].id)}`);
                    currentZoomPatch.effectSettings[effectSlot].setFrom(zoomDevice.currentPatch.effectSettings[effectSlot]);
                    effectSettingsChanged = true;
                }
            }
        }
    }
    if (effectSettingsChanged) {
        shouldLog(LogLevel.Warning) && console.warn(`Experimental: Effect settings changed. Updating screens/patch editor. Added this as warning to monitor this.` +
            `Should probably not happen often, during edits on pedal. We should detect edits through other mechanisms. This is expected to happen when loading rack presets.`);
        getScreenCollectionAndUpdateEditPatchTable(zoomDevice);
    }
    // FIXME: Handle other updates here as well, like tempo, parameter edits, etc
    // currentZoomPatch = zoomDevice.currentPatch !== undefined ? zoomDevice.currentPatch.clone() : undefined; // a bit unsure if it's correct to use currentZoomPatch for this.... See other uses in this file.
    // previousEditPatch = currentZoomPatch;
    // getScreenCollectionAndUpdateEditPatchTable(zoomDevice);
}
function handleEffectParameterChanged(zoomDevice, effectSlot, paramNumber, paramValue) {
    if (zoomDevice !== currentZoomDevice)
        return;
    // Effect parameters have changed on the pedal, and has been written to zoomDevcice.currentPatch
    if (currentZoomPatch !== undefined && currentZoomPatch.effectSettings !== null && effectSlot < currentZoomPatch.effectSettings.length) {
        if (paramNumber == 0) {
            // Effect slot on/off
            currentZoomPatch.effectSettings[effectSlot].enabled = paramValue === 1;
        }
        else if (paramNumber >= 2 && paramNumber - 2 < currentZoomPatch.effectSettings[effectSlot].parameters.length) {
            let parameterIndex = paramNumber - 2;
            currentZoomPatch.effectSettings[effectSlot].parameters[parameterIndex] = paramValue;
        }
    }
    // device will emit a screenChanged event as well, where we will update the editor
    // FIXME: Consider if it's faster to do the update here instead, where we know exactly what has changed, so
    // we don't have to update the whole editor ....
}
function handlePatchChanged(zoomDevice, memorySlot) {
    if (zoomDevice !== currentZoomDevice)
        return;
    shouldLog(LogLevel.Info) && console.log(`Patch changed for memory slot ${memorySlot}`);
    setPatchNotDirty();
    updatePatchesTable(zoomDevice);
}
function handleTempoChanged(zoomDevice, tempo) {
    if (zoomDevice !== currentZoomDevice)
        return;
    if (currentZoomPatch !== undefined && zoomDevice.currentPatch !== undefined) {
        setPatchParameter(currentZoomPatch, zoomDevice, zoomDevice.effectIDMap, "tempo", tempo, "", "", false);
        getScreenCollectionAndUpdateEditPatchTable(zoomDevice);
    }
}
function handleEffectSlotChanged(zoomDevice, effectSlot) {
    if (zoomDevice !== currentZoomDevice)
        return;
    if (currentZoomPatch !== undefined && zoomDevice.currentPatch !== undefined) {
        currentZoomPatch.currentEffectSlot = zoomDevice.currentPatch.currentEffectSlot;
        patchEditor.updateEffectSlotFrame(effectSlot);
        if (currentLCXLDevice)
            updateLCXLColors(currentLCXLDevice, zoomDevice, currentZoomPatch);
    }
}
function checkIfPatchAndDeviceMatches(zoomDevice, zoomPatch) {
    return zoomDevice !== undefined && zoomPatch !== undefined && zoomDevice.currentPatch !== undefined &&
        zoomPatch.MSOG === zoomDevice.currentPatch.MSOG && zoomPatch.PTCF === zoomDevice.currentPatch.PTCF;
}
const BPM_TEMPO_MIN = 40;
const BPM_TEMPO_MAX = 250;
function clampTempoFromBPMParameter(value) {
    let tempo = Math.round(value);
    if (Number.isNaN(tempo))
        tempo = BPM_TEMPO_MIN;
    return Math.max(BPM_TEMPO_MIN, Math.min(BPM_TEMPO_MAX, tempo));
}
function isBPMLinkedEffectSlot(zoomPatch, effectSlot) {
    if (zoomPatch === undefined || effectSlot === undefined)
        return false;
    if (zoomPatch.prm2BPMSlot !== null && zoomPatch.prm2BPMSlot !== undefined) {
        return ((zoomPatch.prm2BPMSlot >> effectSlot) & 1) === 1;
    }
    if (zoomPatch.effectSettings === null || effectSlot >= zoomPatch.effectSettings.length)
        return false;
    let effectID = zoomPatch.effectSettings[effectSlot].id;
    return effectID === 0x07000ff0 || effectID === 0x09000ff0 || effectID === 0x1c000010;
}
function isBPMTempoParameter(zoomPatch, effectSlot, parameterNumber) {
    return parameterNumber === 2 && isBPMLinkedEffectSlot(zoomPatch, effectSlot);
}
function handlePatchEdited(zoomPatch, zoomDevice, effectIDMap, event, type, initialValueString) {
    if (zoomDevice !== undefined && zoomDevice !== currentZoomDevice)
        shouldLog(LogLevel.Error) && console.error(`handlePatchEdited() called for ZoomDevice "${zoomDevice.deviceName}" that is not currentZoomDevice "${currentZoomDevice.deviceName}".`);
    let patchAndDeviceMatches = checkIfPatchAndDeviceMatches(zoomDevice, zoomPatch);
    shouldLog(LogLevel.Info) && console.log(`Patch edited event is "${event}`);
    if (event.target === null)
        return false;
    if (zoomPatch === undefined) {
        shouldLog(LogLevel.Error) && console.error("Attempting to edit patch when zoomPatch is undefined");
        return false;
    }
    let cell = event.target;
    let [effectSlot, parameterNumber] = patchEditor.getEffectAndParameterNumber(cell.id);
    shouldLog(LogLevel.Info) && console.log(`type = ${type}, cell.id = ${cell.id}, effectSlot = ${effectSlot}, parameterNumber = ${parameterNumber}`);
    if (cell.id === "editPatchTableNameID") {
        if (type === "focus") {
            shouldLog(LogLevel.Info) && console.log("focus");
            cell.innerText = zoomPatch.name !== null ? zoomPatch.name.replace(/ +$/, "") : ""; // use the full name, but remove spaces at the end
        }
        else if (type === "blur") {
            shouldLog(LogLevel.Info) && console.log(`blur - cell.innerText = ${cell.innerText}`);
            if (zoomPatch !== undefined && cell.innerText !== initialValueString) {
                setPatchParameter(zoomPatch, zoomDevice, effectIDMap, "name", cell.innerText, "name");
                cell.innerText = zoomPatch.nameTrimmed;
                if (zoomDevice !== undefined)
                    updatePatchSelectorOptions(zoomDevice);
            }
        }
        else if (type === "input") {
            // shouldLog(LogLevel.Info) && console.log(`Name changed to "${cell.innerText}`);
            // if (currentZoomPatch !== undefined) {
            //   currentZoomPatch.name = cell.innerText;
            //   currentZoomPatch.updatePatchPropertiesFromDerivedProperties();
            // }
        }
    }
    else if (cell.classList.contains("editPatchTableDescription") && type === "blur") {
        setPatchParameter(zoomPatch, zoomDevice, effectIDMap, "descriptionEnglish", cell.innerText, "description");
    }
    else if (cell.classList.contains("editPatchTableTempoValue") && type === "focus") {
        // cell.innerText = currentZoomPatch.tempo.toString().padStart(3, "0");
    }
    else if (cell.classList.contains("editPatchTableTempoValue") && type === "blur") {
        setPatchParameter(zoomPatch, zoomDevice, effectIDMap, "tempo", Number.parseInt(cell.innerText), "tempo");
        // cell.innerText = currentZoomPatch.tempo.toString().padStart(3, "0") + " bpm";
    }
    else if (cell.classList.contains("editPatchTableTempoValue") && type === "key") {
        if (event instanceof KeyboardEvent && event.key === "ArrowUp") {
            cell.innerText = (Number.parseInt(cell.innerText) + 1).toString().padStart(3, "0");
            setPatchParameter(zoomPatch, zoomDevice, effectIDMap, "tempo", Number.parseInt(cell.innerText), "tempo");
        }
        else if (event instanceof KeyboardEvent && event.key === "ArrowDown") {
            cell.innerText = (Number.parseInt(cell.innerText) - 1).toString().padStart(3, "0");
            setPatchParameter(zoomPatch, zoomDevice, effectIDMap, "tempo", Number.parseInt(cell.innerText), "tempo");
        }
    }
    else if (effectSlot !== undefined && parameterNumber !== undefined) {
        if (zoomPatch !== undefined && zoomPatch.effectSettings !== null && effectSlot < zoomPatch.effectSettings.length) {
            if (isBPMTempoParameter(zoomPatch, effectSlot, parameterNumber)) {
                let updateParameter = false;
                let rawValue = clampTempoFromBPMParameter(Number.parseInt(cell.innerText));
                if (type === "focus") {
                    if (zoomPatch.currentEffectSlot !== effectSlot) {
                        zoomPatch.currentEffectSlot = effectSlot;
                        if (patchAndDeviceMatches)
                            zoomDevice?.setCurrentEffectSlot(effectSlot);
                        patchEditor.updateEffectSlotFrame(effectSlot);
                        if (patchAndDeviceMatches && currentLCXLDevice && zoomDevice !== undefined)
                            updateLCXLColors(currentLCXLDevice, zoomDevice, zoomPatch);
                    }
                }
                else if (type === "blur") {
                    updateParameter = true;
                }
                else if (type === "key" && event instanceof KeyboardEvent) {
                    updateParameter = false;
                    rawValue = clampTempoFromBPMParameter(zoomPatch.tempo);
                    if (event.key === "ArrowUp") {
                        rawValue = clampTempoFromBPMParameter(rawValue + 1);
                        updateParameter = true;
                    }
                    else if (event.key === "ArrowDown") {
                        rawValue = clampTempoFromBPMParameter(rawValue - 1);
                        updateParameter = true;
                    }
                    else if (event.key === "PageUp") {
                        rawValue = clampTempoFromBPMParameter(rawValue + 10);
                        updateParameter = true;
                    }
                    else if (event.key === "PageDown") {
                        rawValue = clampTempoFromBPMParameter(rawValue - 10);
                        updateParameter = true;
                    }
                }
                if (updateParameter && rawValue !== zoomPatch.tempo) {
                    let valueString = rawValue.toString().padStart(3, "0");
                    cell.innerHTML = valueString;
                    patchEditor.updateValueBar(cell, rawValue, BPM_TEMPO_MAX, BPM_TEMPO_MIN);
                    setPatchParameter(zoomPatch, zoomDevice, effectIDMap, "tempo", rawValue, "tempo");
                    patchEditor.updateTempo(rawValue);
                }
                updateDirtyState(initialValueString !== cell.innerText);
                return true;
            }
            let effectID = -1;
            effectID = zoomPatch.effectSettings[effectSlot].id;
            let valueString = cell.innerText;
            let [rawValue, maxValue] = ZoomDevice.getRawParameterValueFromStringAndMap(effectIDMap, effectID, parameterNumber, valueString);
            if (maxValue === -1 || rawValue < 0 || rawValue > maxValue) {
                return false; // mapped parameter not found, cancel edit
            }
            let updateParameter;
            if (type === "focus") {
                if (zoomPatch.currentEffectSlot !== effectSlot) {
                    zoomPatch.currentEffectSlot = effectSlot;
                    if (patchAndDeviceMatches)
                        zoomDevice?.setCurrentEffectSlot(effectSlot);
                    patchEditor.updateEffectSlotFrame(effectSlot);
                    if (patchAndDeviceMatches && currentLCXLDevice && zoomDevice !== undefined)
                        updateLCXLColors(currentLCXLDevice, zoomDevice, zoomPatch);
                }
            }
            else if (type === "blur") {
                updateParameter = true;
            }
            else if (type === "key" && event instanceof KeyboardEvent) {
                updateParameter = false;
                if (event.key === "ArrowUp") {
                    rawValue = Math.min(maxValue, rawValue + 1);
                    updateParameter = true;
                }
                else if (event.key === "ArrowDown") {
                    rawValue = Math.max(0, rawValue - 1);
                    updateParameter = true;
                }
                else if (event.key === "PageUp") {
                    rawValue = Math.min(maxValue, rawValue + 10);
                    updateParameter = true;
                }
                else if (event.key === "PageDown") {
                    rawValue = Math.max(0, rawValue - 10);
                    updateParameter = true;
                }
                else if (event.key === "Tab") {
                    let newParameterNumber = Math.min(zoomPatch.effectSettings[effectSlot].parameters.length - 1, Math.max(0, parameterNumber + (event.shiftKey ? -1 : 1)));
                    let cell = patchEditor.getCell(effectSlot, newParameterNumber);
                    if (cell !== undefined) {
                        cell.focus();
                    }
                }
            }
            if (updateParameter) {
                if (zoomPatch.currentEffectSlot !== effectSlot) {
                    zoomPatch.currentEffectSlot = effectSlot;
                    if (patchAndDeviceMatches) {
                        zoomDevice?.setCurrentEffectSlot(effectSlot);
                        patchEditor.updateEffectSlotFrame(effectSlot);
                        if (currentLCXLDevice && zoomDevice !== undefined)
                            updateLCXLColors(currentLCXLDevice, zoomDevice, zoomPatch);
                    }
                }
                if (parameterNumber === undefined) {
                    shouldLog(LogLevel.Error) && console.error(`Parameter number is undefined for cell.id = ${cell.id}`);
                    return false;
                }
                let parameterIndex = parameterNumber - 2;
                if (rawValue !== zoomPatch.effectSettings[effectSlot].parameters[parameterIndex]) {
                    let valueString = ZoomDevice.getStringFromRawParameterValueAndMap(effectIDMap, effectID, parameterNumber, rawValue);
                    cell.innerHTML = valueString;
                    setPatchEffectParameter(zoomDevice, zoomPatch, effectSlot, parameterNumber, rawValue);
                }
            }
        }
    }
    updateDirtyState(initialValueString !== cell.innerText);
    return true;
}
function handleMouseMoved(zoomPatch, zoomDevice, effectIDMap, cell, initialValueString, x, y) {
    if (zoomDevice !== undefined && zoomDevice !== currentZoomDevice)
        shouldLog(LogLevel.Error) && console.error(`handleMouseMoved() called for ZoomDevice "${zoomDevice.deviceName}" that is not currentZoomDevice "${currentZoomDevice.deviceName}".`);
    if (zoomPatch === undefined) {
        shouldLog(LogLevel.Error) && console.error("Attempting to edit patch when zoomPatch is undefined");
        return;
    }
    let [effectSlot, parameterNumber] = patchEditor.getEffectAndParameterNumber(cell.id);
    // shouldLog(LogLevel.Info) && console.log(`Mouse move (${x}, ${y}) for cell.id = ${cell.id}, effectSlot = ${effectSlot}, parameterNumber = ${parameterNumber}`);
    if (effectSlot !== undefined && parameterNumber !== undefined && zoomPatch !== undefined &&
        zoomPatch.effectSettings !== null && effectSlot < zoomPatch.effectSettings.length) {
        if (isBPMTempoParameter(zoomPatch, effectSlot, parameterNumber)) {
            let currentRawValue = clampTempoFromBPMParameter(Number.parseInt(cell.innerText));
            let initialRawValue = clampTempoFromBPMParameter(Number.parseInt(initialValueString));
            let newRawValue = clampTempoFromBPMParameter(calculateNewRawValue(x, y, BPM_TEMPO_MAX, initialRawValue));
            if (newRawValue !== currentRawValue) {
                let newValueString = newRawValue.toString().padStart(3, "0");
                cell.innerHTML = newValueString;
                patchEditor.updateValueBar(cell, newRawValue, BPM_TEMPO_MAX, BPM_TEMPO_MIN);
                shouldLog(LogLevel.Info) && console.log(`Changing BPM-linked tempo for cell.id = ${cell.id} from ${currentRawValue} to ${newRawValue}`);
                setPatchParameter(zoomPatch, zoomDevice, effectIDMap, "tempo", newRawValue, "tempo", "", true, true, false, true);
                patchEditor.updateTempo(newRawValue);
            }
            return;
        }
        let effectID = -1;
        effectID = zoomPatch.effectSettings[effectSlot].id;
        let currentValueString = cell.innerText;
        let [currentRawValue, maxValue] = ZoomDevice.getRawParameterValueFromStringAndMap(effectIDMap, effectID, parameterNumber, currentValueString);
        let initialRawValue;
        [initialRawValue, maxValue] = ZoomDevice.getRawParameterValueFromStringAndMap(effectIDMap, effectID, parameterNumber, initialValueString);
        if (maxValue === -1 || initialRawValue < 0 || initialRawValue > maxValue) {
            return; // mapped parameter not found, cancel edit
        }
        let newRawValue = calculateNewRawValue(x, y, maxValue, initialRawValue);
        if (newRawValue !== currentRawValue) {
            let newValueString = ZoomDevice.getStringFromRawParameterValueAndMap(effectIDMap, effectID, parameterNumber, newRawValue);
            cell.innerHTML = newValueString;
            patchEditor.updateValueBar(cell, newRawValue, maxValue);
            shouldLog(LogLevel.Info) && console.log(`Changing value for cell.id = ${cell.id} from ${currentValueString} (${currentRawValue}) to ${newValueString} (${newRawValue})`);
            setPatchEffectParameter(zoomDevice, zoomPatch, effectSlot, parameterNumber, newRawValue, currentRawValue, false, true);
        }
    }
}
function calculateNewRawValue(x, y, maxValue, initialRawValue) {
    // let angle = Math.atan2(y, x);
    // angle = Number.isNaN(angle) ? 0 : angle;
    // let sign = angle > - Math.PI/4 && angle < Math.PI*3/4 ? 1 : -1;
    // let sign = x >= 0 ? 1 : -1;
    // let distance = 0.1 * Math.sqrt(x*x + y*y) * sign;
    let deadZone = 7;
    if (Math.abs(y) < deadZone)
        return initialRawValue; // mouse is too close to initial position, cancel edit
    y = (Math.abs(y) - deadZone) * Math.sign(y);
    let scale = maxValue <= 25 ? 0.12 : maxValue <= 50 ? 0.25 : maxValue <= 100 ? 0.5 : maxValue <= 150 ? 0.7 : 1;
    let distance = scale * y;
    let newRawValue = Math.round(Math.max(0, Math.min(maxValue, initialRawValue + distance)));
    return newRawValue;
}
function handleMouseUp(zoomPatch, zoomDevice, effectIDMap, cell, initialValueString, x, y) {
    if (zoomDevice !== undefined && zoomDevice !== currentZoomDevice)
        shouldLog(LogLevel.Error) && console.error(`handleMouseUp() called for ZoomDevice "${zoomDevice.deviceName}" that is not currentZoomDevice "${currentZoomDevice.deviceName}".`);
    if (zoomPatch === undefined) {
        shouldLog(LogLevel.Error) && console.error("Attempting to edit patch when zoomPatch is undefined");
        return;
    }
    let [effectSlot, parameterNumber] = patchEditor.getEffectAndParameterNumber(cell.id);
    // shouldLog(LogLevel.Info) && console.log(`Mouse up (${x}, ${y}) for cell.id = ${cell.id}, effectSlot = ${effectSlot}, parameterNumber = ${parameterNumber}`);
    if (effectSlot !== undefined && parameterNumber !== undefined && zoomPatch !== undefined &&
        zoomPatch.effectSettings !== null && effectSlot < zoomPatch.effectSettings.length) {
        if (isBPMTempoParameter(zoomPatch, effectSlot, parameterNumber)) {
            let initialRawValue = clampTempoFromBPMParameter(Number.parseInt(initialValueString));
            let newRawValue = clampTempoFromBPMParameter(calculateNewRawValue(x, y, BPM_TEMPO_MAX, initialRawValue));
            if (newRawValue !== initialRawValue) {
                let newValueString = newRawValue.toString().padStart(3, "0");
                cell.innerHTML = newValueString;
                patchEditor.updateValueBar(cell, newRawValue, BPM_TEMPO_MAX, BPM_TEMPO_MIN);
                shouldLog(LogLevel.Info) && console.log(`Changing BPM-linked tempo for cell.id = ${cell.id} from ${initialRawValue} to ${newRawValue} and storing undo state`);
                setPatchParameter(zoomPatch, zoomDevice, effectIDMap, "tempo", newRawValue, "tempo", "", true, true, true, false);
                patchEditor.updateTempo(newRawValue);
                updateDirtyState(true);
            }
            return;
        }
        let effectID = -1;
        effectID = zoomPatch.effectSettings[effectSlot].id;
        let currentValueString = cell.innerText;
        let [initialRawValue, maxValue] = ZoomDevice.getRawParameterValueFromStringAndMap(effectIDMap, effectID, parameterNumber, initialValueString);
        if (maxValue === -1 || initialRawValue < 0 || initialRawValue > maxValue) {
            return; // mapped parameter not found, cancel edit
        }
        let newRawValue = calculateNewRawValue(x, y, maxValue, initialRawValue);
        if (newRawValue !== initialRawValue) {
            let newValueString = ZoomDevice.getStringFromRawParameterValueAndMap(effectIDMap, effectID, parameterNumber, newRawValue);
            cell.innerHTML = newValueString;
            patchEditor.updateValueBar(cell, newRawValue, maxValue);
            shouldLog(LogLevel.Info) && console.log(`Changing value for cell.id = ${cell.id} from ${currentValueString} (${initialRawValue}) to ${newValueString} (${newRawValue}) and storing undo state`);
            setPatchEffectParameter(zoomDevice, zoomPatch, effectSlot, parameterNumber, newRawValue, initialRawValue, true);
            updateDirtyState(true);
        }
    }
}
function handleEffectSlotOnOff(zoomPatch, zoomDevice, effectIDMap, effectSlot, on) {
    if (zoomDevice !== undefined && zoomDevice !== currentZoomDevice)
        shouldLog(LogLevel.Error) && console.error(`handleEffectSlotOnOff() called for ZoomDevice "${zoomDevice.deviceName}" that is not currentZoomDevice "${currentZoomDevice.deviceName}".`);
    if (zoomPatch === undefined) {
        shouldLog(LogLevel.Error) && console.error("Attempting to edit patch when zoomPatch is undefined");
        return;
    }
    if (zoomPatch.effectSettings !== null && effectSlot < zoomPatch.effectSettings.length) {
        shouldLog(LogLevel.Info) && console.log(`Changing on/off state for effect slot ${effectSlot} to ${on}`);
        setPatchEffectOnOff(zoomPatch, zoomDevice, effectSlot, on);
        updateDirtyState(true);
    }
}
function setPatchEffectOnOff(zoomPatch, zoomDevice, effectSlot, on, forceStoreUndo = false, skipStoreUndo = false) {
    if (zoomDevice !== undefined && zoomDevice !== currentZoomDevice)
        shouldLog(LogLevel.Error) && console.error(`setPatchEffectOnOff() called for ZoomDevice "${zoomDevice.deviceName}" that is not currentZoomDevice "${currentZoomDevice.deviceName}".`);
    if (zoomPatch === undefined) {
        shouldLog(LogLevel.Error) && console.error("Attempting to edit patch when zoomPatch is undefined");
        return;
    }
    if (zoomPatch.effectSettings === null || effectSlot >= zoomPatch.effectSettings.length)
        return;
    let previousValue = zoomPatch.effectSettings[effectSlot].enabled;
    let parameterValue = on ? 1 : 0;
    let parameterNumber = 0;
    let valueChanged = false;
    if (on !== previousValue) {
        zoomPatch.effectSettings[effectSlot].enabled = on;
        if (zoomDevice !== undefined)
            zoomDevice.setEffectParameterForCurrentPatch(effectSlot, parameterNumber, parameterValue);
        valueChanged = true;
    }
    if ((!valueChanged && !forceStoreUndo) || skipStoreUndo)
        return;
    // Everything below this line is related to undo/redo
    let patchAndDeviceMatches = checkIfPatchAndDeviceMatches(zoomDevice, zoomPatch);
    if (zoomDevice === undefined || !patchAndDeviceMatches)
        return; // no undo/redo for effect editor if it's not connected to a device
    let [effectName, numParameters] = ZoomDevice.getEffectNameAndNumParameters(zoomDevice.effectIDMap, zoomPatch.effectSettings[effectSlot].id);
    let [parameterName, maxValue] = ZoomDevice.getParameterNameAndMaxValue(zoomDevice.effectIDMap, zoomPatch.effectSettings[effectSlot].id, parameterNumber);
    let parameterValueString = zoomDevice.getStringFromRawParameterValue(zoomPatch.effectSettings[effectSlot].id, parameterNumber, parameterValue);
    let actionDescription = `${parameterName} = ${parameterValueString} for effect ${effectSlot + 1} ${effectName}`;
    let undoRedoManager = getCurrentUndoRedoManager();
    if (undoRedoManager === undefined) {
        return;
    }
    undoRedoManager.addAction(async () => {
        // Redo action 
        if (zoomPatch.effectSettings === null || effectSlot >= zoomPatch.effectSettings.length) {
            shouldLog(LogLevel.Warning) && console.warn("setPatchEffectParameter: zoomPatch.effectSettings === null || effectSlot >= zoomPatch.effectSettings.length");
            return;
        }
        zoomPatch.effectSettings[effectSlot].enabled = on;
        zoomDevice.setEffectParameterForCurrentPatch(effectSlot, parameterNumber, parameterValue);
        getScreenCollectionAndUpdateEditPatchTable(zoomDevice);
    }, async () => {
        // Undo action
        if (zoomPatch.effectSettings === null || effectSlot >= zoomPatch.effectSettings.length) {
            shouldLog(LogLevel.Warning) && console.warn("setPatchEffectParameter: zoomPatch.effectSettings === null || effectSlot >= zoomPatch.effectSettings.length");
            return;
        }
        zoomPatch.effectSettings[effectSlot].enabled = previousValue;
        let previousValueAsNumber = previousValue ? 1 : 0;
        zoomDevice.setEffectParameterForCurrentPatch(effectSlot, parameterNumber, previousValueAsNumber);
        getScreenCollectionAndUpdateEditPatchTable(zoomDevice);
    }, actionDescription);
}
function handleEffectSlotDelete(zoomPatch, zoomDevice, effectIDMap, effectSlot) {
    if (zoomDevice !== undefined && zoomDevice !== currentZoomDevice)
        shouldLog(LogLevel.Error) && console.error(`handleEffectSlotDelete() called for ZoomDevice "${zoomDevice.deviceName}" that is not currentZoomDevice "${currentZoomDevice.deviceName}".`);
    if (zoomPatch === undefined) {
        shouldLog(LogLevel.Error) && console.error("Attempting to edit patch when zoomPatch is undefined");
        return;
    }
    if (zoomPatch.effectSettings !== null && effectSlot < zoomPatch.effectSettings.length) {
        shouldLog(LogLevel.Info) && console.log(`Deleting effect slot ${effectSlot}`);
        deleteEffectInSlot(zoomDevice, zoomPatch, effectSlot);
        updateDirtyState(true);
    }
}
function deleteEffectInSlot(zoomDevice, zoomPatch, effectSlot, forceStoreUndo = false, skipStoreUndo = false) {
    if (zoomDevice !== undefined && zoomDevice !== currentZoomDevice) {
        shouldLog(LogLevel.Error) && console.error(`deleteEffectInSlot() called for ZoomDevice "${zoomDevice.deviceName}" that is not currentZoomDevice "${currentZoomDevice.deviceName}".`);
        return;
    }
    if (zoomPatch.effectSettings === null || effectSlot >= zoomPatch.effectSettings.length)
        return;
    let patchAndDeviceMatches = checkIfPatchAndDeviceMatches(zoomDevice, zoomPatch);
    // let previousEffectSettings = EffectSettings.from(zoomPatch.effectSettings[effectSlot]); 
    let previousEffectSettings = zoomPatch.effectSettings[effectSlot].clone(); // because we change id to 0 in ZoomPatch.deleteEffectInSlot()
    let previousScreen = undefined;
    if (zoomDevice !== undefined && patchAndDeviceMatches) {
        previousScreen = zoomDevice.currentScreenCollection?.screens[effectSlot];
        if (previousScreen !== undefined)
            previousScreen = previousScreen.clone();
        if (previousScreen === undefined)
            shouldLog(LogLevel.Warning) && console.warn(`screenCollection undefined or screen ${effectSlot} missing from screenCollection for patch "${zoomPatch.name}"`);
    }
    // Store effect slot and existing parameters in that slot, incl id and enabled
    zoomPatch.deleteEffectInSlot(effectSlot);
    if (patchAndDeviceMatches) {
        zoomDevice?.deleteScreenForEffectInSlot(effectSlot);
        zoomDevice?.uploadPatchToCurrentPatch(zoomPatch);
    }
    let valueChanged = true;
    if ((!valueChanged && !forceStoreUndo) || skipStoreUndo)
        return;
    // Everything below this line is related to undo/redo
    if (zoomDevice === undefined || !patchAndDeviceMatches)
        return; // no undo/redo for effect editor if it's not connected to a device
    let actionDescription = `Delete effect in slot ${effectSlot}`;
    let undoRedoManager = getCurrentUndoRedoManager();
    if (undoRedoManager === undefined) {
        return;
    }
    undoRedoManager.addAction(async () => {
        // Redo action 
        if (zoomPatch.effectSettings === null || effectSlot >= zoomPatch.effectSettings.length) {
            shouldLog(LogLevel.Warning) && console.warn("setPatchEffectParameter: zoomPatch.effectSettings === null || effectSlot >= zoomPatch.effectSettings.length");
            return;
        }
        zoomPatch.deleteEffectInSlot(effectSlot);
        zoomDevice.deleteScreenForEffectInSlot(effectSlot);
        zoomDevice.uploadPatchToCurrentPatch(zoomPatch);
        getScreenCollectionAndUpdateEditPatchTable(zoomDevice);
    }, async () => {
        // Undo action
        if (zoomPatch.effectSettings === null || effectSlot > zoomPatch.effectSettings.length) {
            shouldLog(LogLevel.Warning) && console.warn("setPatchEffectParameter: zoomPatch.effectSettings === null || effectSlot >= zoomPatch.effectSettings.length");
            return;
        }
        zoomPatch.addEffectInSlot(effectSlot, previousEffectSettings.clone());
        if (previousScreen !== undefined)
            zoomDevice.addScreenForEffectInSlot(effectSlot, previousScreen.clone());
        else
            shouldLog(LogLevel.Warning) && console.warn(`screenCollection undefined or screen ${effectSlot} missing from screenCollection for patch "${zoomPatch.name}" when attempting to undo delete`);
        zoomDevice.uploadPatchToCurrentPatch(zoomPatch);
        getScreenCollectionAndUpdateEditPatchTable(zoomDevice);
    }, actionDescription);
}
function handleEffectSlotMove(zoomPatch, zoomDevice, effectIDMap, effectSlot, direction) {
    if (zoomDevice !== undefined && zoomDevice !== currentZoomDevice)
        shouldLog(LogLevel.Error) && console.error(`handleEffectSlotMove() called for ZoomDevice "${zoomDevice.deviceName}" that is not currentZoomDevice "${currentZoomDevice.deviceName}".`);
    if (zoomPatch === undefined) {
        shouldLog(LogLevel.Error) && console.error("Attempting to edit patch when zoomPatch is undefined");
        return;
    }
    if (zoomPatch.effectSettings !== null && effectSlot < zoomPatch.effectSettings.length) {
        shouldLog(LogLevel.Info) && console.log(`Moving effect in slot ${effectSlot} ${direction}`);
        moveEffectInSlot(zoomDevice, zoomPatch, effectSlot, direction);
        updateDirtyState(true);
    }
}
function moveEffectInSlot(zoomDevice, zoomPatch, effectSlot, direction, forceStoreUndo = false, skipStoreUndo = false) {
    if (zoomDevice !== undefined && zoomDevice !== currentZoomDevice) {
        shouldLog(LogLevel.Error) && console.error(`moveEffectInSlot() called for ZoomDevice "${zoomDevice.deviceName}" that is not currentZoomDevice "${currentZoomDevice.deviceName}"`);
        return;
    }
    if (zoomPatch.effectSettings === null) {
        shouldLog(LogLevel.Error) && console.error(`moveEffectInSlot() called for ZoomPatch "${zoomPatch.name}" with zoomPatch.effectSettings === null`);
        return;
    }
    if (effectSlot === 0 && direction === "right") {
        shouldLog(LogLevel.Error) && console.error(`Cannot move effect in effectSlot ${effectSlot} (the rightmost slot) to the right`);
        return;
    }
    if (effectSlot === zoomPatch.effectSettings.length - 1 && direction === "left") {
        shouldLog(LogLevel.Error) && console.error(`Cannot move effect in effectSlot ${effectSlot} (the leftmost slot) to the left`);
        return;
    }
    let patchAndDeviceMatches = checkIfPatchAndDeviceMatches(zoomDevice, zoomPatch);
    let destinationEffectSlot = direction === "left" ? effectSlot + 1 : effectSlot - 1;
    // Store effect slot and existing parameters in that slot, incl id and enabled
    zoomPatch.swapEffectsInSlots(effectSlot, destinationEffectSlot);
    if (zoomDevice !== undefined && patchAndDeviceMatches) {
        zoomDevice.swapScreensForEffectSlots(effectSlot, destinationEffectSlot);
        zoomDevice.uploadPatchToCurrentPatch(zoomPatch);
    }
    let valueChanged = true;
    if ((!valueChanged && !forceStoreUndo) || skipStoreUndo || !patchAndDeviceMatches)
        return;
    // Everything below this line is related to undo/redo
    let actionDescription = `Move effect in slot ${effectSlot} ${direction}`;
    let undoRedoManager = getCurrentUndoRedoManager();
    if (undoRedoManager === undefined) {
        return;
    }
    undoRedoManager.addAction(async () => {
        // Redo action 
        if (zoomPatch.effectSettings === null) {
            shouldLog(LogLevel.Error) && console.error("setPatchEffectParameter: zoomPatch.effectSettings === null");
            return;
        }
        if (effectSlot >= zoomPatch.effectSettings.length) {
            shouldLog(LogLevel.Error) && console.error(`effectSlot (${effectSlot}) >= zoomPatch.effectSettings.length (${zoomPatch.effectSettings.length})`);
            return;
        }
        if (destinationEffectSlot >= zoomPatch.effectSettings.length) {
            shouldLog(LogLevel.Error) && console.error(`destinationEffectSlot (${destinationEffectSlot}) >= zoomPatch.effectSettings.length (${zoomPatch.effectSettings.length})`);
            return;
        }
        zoomPatch.swapEffectsInSlots(effectSlot, destinationEffectSlot);
        if (zoomDevice !== undefined) {
            zoomDevice.swapScreensForEffectSlots(effectSlot, destinationEffectSlot);
            zoomDevice.uploadPatchToCurrentPatch(zoomPatch);
            getScreenCollectionAndUpdateEditPatchTable(zoomDevice);
        }
    }, async () => {
        // Undo action
        if (zoomPatch.effectSettings === null) {
            shouldLog(LogLevel.Error) && console.error("setPatchEffectParameter: zoomPatch.effectSettings === null");
            return;
        }
        if (effectSlot >= zoomPatch.effectSettings.length) {
            shouldLog(LogLevel.Error) && console.error(`effectSlot (${effectSlot}) >= zoomPatch.effectSettings.length (${zoomPatch.effectSettings.length})`);
            return;
        }
        if (destinationEffectSlot >= zoomPatch.effectSettings.length) {
            shouldLog(LogLevel.Error) && console.error(`destinationEffectSlot (${destinationEffectSlot}) >= zoomPatch.effectSettings.length (${zoomPatch.effectSettings.length})`);
            return;
        }
        zoomPatch.swapEffectsInSlots(effectSlot, destinationEffectSlot);
        if (zoomDevice !== undefined) {
            zoomDevice.swapScreensForEffectSlots(effectSlot, destinationEffectSlot);
            zoomDevice.uploadPatchToCurrentPatch(zoomPatch);
            getScreenCollectionAndUpdateEditPatchTable(zoomDevice);
        }
    }, actionDescription);
}
function handleEffectSlotAdd(zoomPatch, zoomDevice, effectIDMap, effectSlot, direction) {
    if (zoomDevice !== undefined && zoomDevice !== currentZoomDevice)
        shouldLog(LogLevel.Error) && console.error(`handleEffectSlotAdd() called for ZoomDevice "${zoomDevice.deviceName}" that is not currentZoomDevice "${currentZoomDevice.deviceName}".`);
    if (zoomPatch === undefined) {
        shouldLog(LogLevel.Error) && console.error("Attempting to edit patch when zoomPatch is undefined");
        return;
    }
    if (zoomPatch.effectSettings !== null && effectSlot < zoomPatch.effectSettings.length) {
        if (effectSlot === zoomPatch.maxNumEffects - 1 && direction === "left") {
            shouldLog(LogLevel.Error) && console.error(`Cannot add effect to the left of effectSlot ${effectSlot} (the leftmost slot)`);
            return;
        }
        shouldLog(LogLevel.Info) && console.log(`Adding effect ${direction} of slot ${effectSlot}`);
        effectSlot += direction === "left" ? 1 : 0;
        addEffectSlot(zoomDevice, zoomPatch, effectSlot);
        updateDirtyState(true);
    }
}
function addEffectSlot(zoomDevice, zoomPatch, effectSlot, forceStoreUndo = false, skipStoreUndo = false) {
    if (zoomDevice !== undefined && zoomDevice !== currentZoomDevice) {
        shouldLog(LogLevel.Error) && console.error(`addEffectSlot() called for ZoomDevice "${zoomDevice.deviceName}" that is not currentZoomDevice "${currentZoomDevice.deviceName}"`);
        return;
    }
    if (zoomPatch.effectSettings === null) {
        shouldLog(LogLevel.Error) && console.error(`addEffectSlotSlot() called for ZoomPatch "${zoomPatch.name}" with zoomPatch.effectSettings === null`);
        return;
    }
    let patchAndDeviceMatches = checkIfPatchAndDeviceMatches(zoomDevice, zoomPatch);
    let effectSettings = new EffectSettings();
    effectSettings.id = 0; // THRU
    effectSettings.enabled = true;
    zoomPatch.addEffectInSlot(effectSlot, effectSettings);
    if (zoomDevice !== undefined && patchAndDeviceMatches) {
        let screen = new ZoomScreen();
        let parameter = new ZoomScreenParameter();
        parameter.name = "OnOff";
        parameter.valueString = "1";
        screen.parameters.push(parameter);
        parameter = new ZoomScreenParameter();
        parameter.name = "THRU";
        parameter.valueString = "THRU";
        screen.parameters.push(parameter);
        zoomDevice.addScreenForEffectInSlot(effectSlot, screen);
        zoomDevice.uploadPatchToCurrentPatch(zoomPatch);
    }
    let valueChanged = true;
    if ((!valueChanged && !forceStoreUndo) || skipStoreUndo || !patchAndDeviceMatches)
        return;
    // Everything below this line is related to undo/redo
    let actionDescription = `Add effect to slot ${effectSlot}`;
    let undoRedoManager = getCurrentUndoRedoManager();
    if (undoRedoManager === undefined) {
        return;
    }
    undoRedoManager.addAction(async () => {
        // Redo action 
        if (zoomPatch.effectSettings === null) {
            shouldLog(LogLevel.Error) && console.error("setPatchEffectParameter: zoomPatch.effectSettings === null");
            return;
        }
        let effectSettings = new EffectSettings();
        effectSettings.id = 0; // THRU
        effectSettings.enabled = true;
        zoomPatch.addEffectInSlot(effectSlot, effectSettings);
        if (zoomDevice !== undefined && patchAndDeviceMatches) {
            let screen = new ZoomScreen();
            let parameter = new ZoomScreenParameter();
            parameter.name = "OnOff";
            parameter.valueString = "1";
            screen.parameters.push(parameter);
            parameter = new ZoomScreenParameter();
            parameter.name = "THRU";
            parameter.valueString = "THRU";
            screen.parameters.push(parameter);
            zoomDevice.addScreenForEffectInSlot(effectSlot, screen);
            zoomDevice.uploadPatchToCurrentPatch(zoomPatch);
            getScreenCollectionAndUpdateEditPatchTable(zoomDevice);
        }
    }, async () => {
        // Undo action
        if (zoomPatch.effectSettings === null) {
            shouldLog(LogLevel.Error) && console.error("setPatchEffectParameter: zoomPatch.effectSettings === null");
            return;
        }
        if (effectSlot >= zoomPatch.effectSettings.length) {
            shouldLog(LogLevel.Error) && console.error(`effectSlot (${effectSlot}) >= zoomPatch.effectSettings.length (${zoomPatch.effectSettings.length})`);
            return;
        }
        zoomPatch.deleteEffectInSlot(effectSlot);
        if (zoomDevice !== undefined) {
            zoomDevice.deleteScreenForEffectInSlot(effectSlot);
            zoomDevice.uploadPatchToCurrentPatch(zoomPatch);
            getScreenCollectionAndUpdateEditPatchTable(zoomDevice);
        }
    }, actionDescription);
}
function handleEffectSlotSelectEffect(zoomPatch, zoomDevice, effectIDMap, effectSlot) {
    if (zoomDevice !== undefined && zoomDevice !== currentZoomDevice)
        shouldLog(LogLevel.Error) && console.error(`handleEffectSlotAdd() called for ZoomDevice "${zoomDevice.deviceName}" that is not currentZoomDevice "${currentZoomDevice.deviceName}".`);
    if (zoomPatch === undefined) {
        shouldLog(LogLevel.Error) && console.error("Attempting to edit patch when zoomPatch is undefined");
        return;
    }
    if (zoomPatch.effectSettings !== null && effectSlot < zoomPatch.effectSettings.length) {
        shouldLog(LogLevel.Info) && console.log(`Selecting effect in slot ${effectSlot}`);
        let pedalName = zoomDevice?.deviceInfo?.deviceName ?? zoomDevice?.deviceName ?? "MS-70CDR";
        zoomEffectSelector.getEffect(zoomPatch.effectSettings[effectSlot].id, pedalName).then(([effectID, effectName, pedalName]) => {
            shouldLog(LogLevel.Info) && console.log(`User selected effectID: ${effectID}, effectName: ${effectName}, pedalName: ${pedalName}`);
            if (effectID !== -1) {
                if (zoomPatch.effectSettings === null) {
                    shouldLog(LogLevel.Error) && console.error("zoomPatch.effectSettings is null");
                    return;
                }
                if (effectIDMap === undefined) {
                    shouldLog(LogLevel.Error) && console.error("effectIDMap is undefined");
                    return;
                }
                changeEffectInSlot(zoomDevice, zoomPatch, effectIDMap, effectSlot, effectID);
                updateDirtyState(true);
            }
        });
    }
}
function changeEffectInSlot(zoomDevice, zoomPatch, effectIDMap, effectSlot, effectID, forceStoreUndo = false, skipStoreUndo = false) {
    if (zoomDevice !== undefined && zoomDevice !== currentZoomDevice) {
        shouldLog(LogLevel.Error) && console.error(`addEffectSlot() called for ZoomDevice "${zoomDevice.deviceName}" that is not currentZoomDevice "${currentZoomDevice.deviceName}"`);
        return;
    }
    if (zoomPatch.effectSettings === null) {
        shouldLog(LogLevel.Error) && console.error(`addEffectSlotSlot() called for ZoomPatch "${zoomPatch.name}" with zoomPatch.effectSettings === null`);
        return;
    }
    let patchAndDeviceMatches = checkIfPatchAndDeviceMatches(zoomDevice, zoomPatch);
    let effectSettings = zoomPatch.effectSettings[effectSlot];
    let previousEffectID = effectSettings.id;
    let previousEffectMap = effectIDMap.get(previousEffectID);
    effectSettings.id = effectID;
    ZoomDevice.setDefaultsForEffect(effectSettings, effectIDMap);
    zoomPatch.changeEffectInSlot(effectSlot, effectSettings);
    let effectMap = effectIDMap.get(effectSettings.id);
    if (effectMap === undefined) {
        shouldLog(LogLevel.Error) && console.error(`Unable to find mapping for effect id ${numberToHexString(effectSettings.id)} in effectSlot ${effectSlot} in patch ${zoomPatch.name}`);
        return;
    }
    if (zoomDevice !== undefined && patchAndDeviceMatches) {
        zoomDevice.updateScreenForEffectInSlot(effectSlot, effectMap, effectSettings);
        zoomDevice.uploadPatchToCurrentPatch(zoomPatch);
    }
    let valueChanged = true;
    if ((!valueChanged && !forceStoreUndo) || skipStoreUndo || !patchAndDeviceMatches)
        return;
    // Everything below this line is related to undo/redo
    let actionDescription = `Change effect in slot ${effectSlot} to ${effectMap.name}`;
    let undoRedoManager = getCurrentUndoRedoManager();
    if (undoRedoManager === undefined) {
        return;
    }
    undoRedoManager.addAction(async () => {
        // Redo action 
        if (zoomPatch.effectSettings === null) {
            shouldLog(LogLevel.Error) && console.error("setPatchEffectParameter: zoomPatch.effectSettings === null");
            return;
        }
        let effectSettings = zoomPatch.effectSettings[effectSlot];
        effectSettings.id = effectID;
        ZoomDevice.setDefaultsForEffect(effectSettings, effectIDMap);
        zoomPatch.changeEffectInSlot(effectSlot, effectSettings);
        if (zoomDevice !== undefined) {
            zoomDevice.updateScreenForEffectInSlot(effectSlot, effectMap, effectSettings);
            zoomDevice.uploadPatchToCurrentPatch(zoomPatch);
            getScreenCollectionAndUpdateEditPatchTable(zoomDevice);
        }
    }, async () => {
        // Undo action
        if (zoomPatch.effectSettings === null) {
            shouldLog(LogLevel.Error) && console.error("setPatchEffectParameter: zoomPatch.effectSettings === null");
            return;
        }
        if (effectSlot >= zoomPatch.effectSettings.length) {
            shouldLog(LogLevel.Error) && console.error(`effectSlot (${effectSlot}) >= zoomPatch.effectSettings.length (${zoomPatch.effectSettings.length})`);
            return;
        }
        let effectSettings = zoomPatch.effectSettings[effectSlot];
        effectSettings.id = previousEffectID;
        ZoomDevice.setDefaultsForEffect(effectSettings, effectIDMap);
        zoomPatch.changeEffectInSlot(effectSlot, effectSettings);
        if (zoomDevice !== undefined) {
            if (previousEffectMap !== undefined) {
                zoomDevice.updateScreenForEffectInSlot(effectSlot, previousEffectMap, effectSettings);
            }
            zoomDevice.uploadPatchToCurrentPatch(zoomPatch);
            getScreenCollectionAndUpdateEditPatchTable(zoomDevice);
        }
    }, actionDescription);
}
function setPatchEffectParameter(zoomDevice, zoomPatch, effectSlot, parameterNumber, parameterValue, previousValue = -1, forceStoreUndo = false, skipStoreUndo = false) {
    if (zoomDevice !== undefined && zoomDevice !== currentZoomDevice)
        shouldLog(LogLevel.Error) && console.error(`setPatchEffectParameter() called for ZoomDevice "${zoomDevice.deviceName}" that is not currentZoomDevice "${currentZoomDevice.deviceName}".`);
    if (zoomPatch.effectSettings === null || effectSlot >= zoomPatch.effectSettings.length)
        return;
    if (parameterNumber < 2) {
        shouldLog(LogLevel.Error) && console.error(`parameterNumber ${parameterNumber} < 2. This function should not be used to set effect on/off state or effect id.`);
        return;
    }
    let patchAndDeviceMatches = checkIfPatchAndDeviceMatches(zoomDevice, zoomPatch);
    let parameterIndex = parameterNumber - 2;
    if (previousValue === -1)
        previousValue = zoomPatch.effectSettings[effectSlot].parameters[parameterIndex];
    let valueChanged = false;
    if (parameterValue !== zoomPatch.effectSettings[effectSlot].parameters[parameterIndex]) {
        zoomPatch.effectSettings[effectSlot].parameters[parameterIndex] = parameterValue;
        zoomPatch.updatePatchPropertiesFromDerivedProperties();
        if (patchAndDeviceMatches)
            zoomDevice?.setEffectParameterForCurrentPatch(effectSlot, parameterNumber, parameterValue);
        valueChanged = true;
    }
    if (currentZoomPatchToConvert !== undefined && !patchAndDeviceMatches) {
        convertPatchAndUpdateEditors(zoomDevice, currentZoomPatchToConvert);
    }
    if ((!valueChanged && !forceStoreUndo) || skipStoreUndo)
        return;
    // Everything below this line is related to undo/redo
    if (zoomDevice === undefined || !patchAndDeviceMatches)
        return; // No undo/redo if zoomDevice is undefined
    let [effectName, numParameters] = ZoomDevice.getEffectNameAndNumParameters(zoomDevice.effectIDMap, zoomPatch.effectSettings[effectSlot].id);
    let [parameterName, maxValue] = ZoomDevice.getParameterNameAndMaxValue(zoomDevice.effectIDMap, zoomPatch.effectSettings[effectSlot].id, parameterNumber);
    let parameterValueString = zoomDevice.getStringFromRawParameterValue(zoomPatch.effectSettings[effectSlot].id, parameterNumber, parameterValue);
    let actionDescription = `${parameterName} = ${parameterValueString} for effect ${effectSlot + 1} ${effectName}`;
    let undoRedoManager = getCurrentUndoRedoManager();
    if (undoRedoManager === undefined) {
        return;
    }
    undoRedoManager.addAction(async () => {
        // Redo action 
        if (zoomPatch.effectSettings === null || effectSlot >= zoomPatch.effectSettings.length) {
            shouldLog(LogLevel.Warning) && console.warn("setPatchEffectParameter: zoomPatch.effectSettings === null || effectSlot >= zoomPatch.effectSettings.length");
            return;
        }
        zoomPatch.effectSettings[effectSlot].parameters[parameterIndex] = parameterValue;
        zoomDevice.setEffectParameterForCurrentPatch(effectSlot, parameterNumber, parameterValue);
        getScreenCollectionAndUpdateEditPatchTable(zoomDevice);
    }, async () => {
        // Undo action
        if (zoomPatch.effectSettings === null || effectSlot >= zoomPatch.effectSettings.length) {
            shouldLog(LogLevel.Warning) && console.warn("setPatchEffectParameter: zoomPatch.effectSettings === null || effectSlot >= zoomPatch.effectSettings.length");
            return;
        }
        zoomPatch.effectSettings[effectSlot].parameters[parameterIndex] = previousValue;
        zoomDevice.setEffectParameterForCurrentPatch(effectSlot, parameterNumber, previousValue);
        getScreenCollectionAndUpdateEditPatchTable(zoomDevice);
    }, actionDescription);
}
function setPatchParameter(zoomPatch, zoomDevice, effectIDMap, key, value, keyFriendlyName = "", valueString = "", syncToCurrentPatchOnPedalImmediately = true, syncToCurrentPatchOnPedalOnUndoAndRedo = true, forceStoreUndo = false, skipStoreUndo = false) {
    if (zoomDevice !== currentZoomDevice && zoomDevice !== undefined)
        shouldLog(LogLevel.Error) && console.error(`setPatchParameter() called for ZoomDevice "${zoomDevice.deviceName}" that is not currentZoomDevice "${currentZoomDevice.deviceName}".`);
    let patchAndDeviceMatches = checkIfPatchAndDeviceMatches(zoomDevice, zoomPatch);
    if (keyFriendlyName.length === 0)
        keyFriendlyName = key.toString();
    // if (valueString.length === 0)
    //   valueString = (typeof value === "object" && value !== null && typeof value.toString === "function") ? value.toString() : String(value);
    // let previousValue: T = (zoomPatch[key] as T); 
    let previousValue = undefined;
    previousValue = getValue(zoomPatch, key, value);
    // let previousValueString = valueString;
    // [effectSlot, "enabled", value]
    // [effectSlot, "id", value]
    // [effectSlot, "parameters", parameterNumber, value]
    let [actionDescription, valueChanged] = setValue(zoomPatch, effectIDMap, key, value, keyFriendlyName);
    if ((!valueChanged && !forceStoreUndo) || skipStoreUndo || !patchAndDeviceMatches)
        return;
    // Everything below this line is related to undo/redo
    zoomPatch.updatePatchPropertiesFromDerivedProperties();
    if (syncToCurrentPatchOnPedalImmediately && patchAndDeviceMatches)
        zoomDevice?.uploadPatchToCurrentPatch(zoomPatch);
    let undoRedoManager = getCurrentUndoRedoManager();
    if (undoRedoManager === undefined) {
        return;
    }
    undoRedoManager.addAction(async () => {
        // Redo action 
        setValue(zoomPatch, effectIDMap, key, value, keyFriendlyName);
        zoomPatch.updatePatchPropertiesFromDerivedProperties();
        if (syncToCurrentPatchOnPedalOnUndoAndRedo && zoomDevice !== undefined)
            zoomDevice.uploadPatchToCurrentPatch(zoomPatch);
        if (zoomDevice !== undefined)
            getScreenCollectionAndUpdateEditPatchTable(zoomDevice);
    }, async () => {
        // Undo action
        setValue(zoomPatch, effectIDMap, key, previousValue, keyFriendlyName);
        zoomPatch.updatePatchPropertiesFromDerivedProperties();
        if (syncToCurrentPatchOnPedalOnUndoAndRedo && zoomDevice !== undefined)
            zoomDevice.uploadPatchToCurrentPatch(zoomPatch);
        if (zoomDevice !== undefined)
            getScreenCollectionAndUpdateEditPatchTable(zoomDevice);
    }, actionDescription);
    function getValue(zoomPatch, key, value) {
        // [effectSlot, "enabled", value]
        // [effectSlot, "id", value]
        // [effectSlot, "parameters", parameterNumber, value]
        if (key === "effectSettings" && value instanceof Array && value.length >= 3 && zoomPatch.effectSettings !== null) {
            let effectSlot = value[0];
            let effectSettingsKey = value[1];
            if (effectSettingsKey === "enabled") {
                return [effectSlot, "enabled", zoomPatch.effectSettings[effectSlot].enabled];
            }
            else if (effectSettingsKey === "id") {
                return [effectSlot, "id", zoomPatch.effectSettings[effectSlot].id];
            }
            else if (effectSettingsKey === "parameters") {
                let parameterNumber = value[2];
                let parameterIndex = parameterNumber - 2;
                return [effectSlot, "parameters", parameterNumber, zoomPatch.effectSettings[effectSlot].parameters[parameterIndex]];
            }
        }
        return zoomPatch[key];
    }
    function setValue(zoomPatch, effectIDMap, key, value, keyFriendlyName) {
        let actionDescription = "";
        let valueChanged = false;
        if (key === "effectSettings" && value instanceof Array && value.length >= 3 && zoomPatch.effectSettings !== null) {
            let effectSlot = value[0];
            let effectSettingsKey = value[1];
            if (effectSettingsKey === "enabled") {
                let enabled = value[2] !== 0;
                let [effectName, numParameters] = ZoomDevice.getEffectNameAndNumParameters(effectIDMap, zoomPatch.effectSettings[effectSlot].id);
                actionDescription = `${enabled ? "Enable" : "Disable"} effect ${effectName} in slot ${effectSlot + 1}`;
                if (enabled !== zoomPatch.effectSettings[effectSlot].enabled) {
                    zoomPatch.effectSettings[effectSlot].enabled = enabled;
                    valueChanged = true;
                }
            }
            else if (effectSettingsKey === "id") {
                let [oldEffectName, oldNumParameters] = ZoomDevice.getEffectNameAndNumParameters(effectIDMap, zoomPatch.effectSettings[effectSlot].id);
                let id = value[2];
                let [newEffectName, newNumParameters] = ZoomDevice.getEffectNameAndNumParameters(effectIDMap, zoomPatch.effectSettings[effectSlot].id);
                actionDescription = `Change effect in slot ${effectSlot + 1} from ${oldEffectName} to ${newEffectName}`;
                if (id !== zoomPatch.effectSettings[effectSlot].id) {
                    zoomPatch.effectSettings[effectSlot].id = id;
                    valueChanged = true;
                }
            }
            else if (effectSettingsKey === "parameters") {
                let [effectName, numParameters] = ZoomDevice.getEffectNameAndNumParameters(effectIDMap, zoomPatch.effectSettings[effectSlot].id);
                let parameterNumber = value[2];
                let parameterIndex = parameterNumber - 2;
                let parameterValue = value[3];
                let [parameterName, maxValue] = ZoomDevice.getParameterNameAndMaxValue(effectIDMap, zoomPatch.effectSettings[effectSlot].id, parameterNumber);
                let parameterValueString = ZoomDevice.getStringFromRawParameterValueAndMap(effectIDMap, zoomPatch.effectSettings[effectSlot].id, parameterNumber, parameterValue);
                actionDescription = `${parameterName} = ${parameterValueString} for effect ${effectSlot + 1} ${effectName}`;
                if (parameterValue !== zoomPatch.effectSettings[effectSlot].parameters[parameterIndex]) {
                    zoomPatch.effectSettings[effectSlot].parameters[parameterIndex] = parameterValue;
                    valueChanged = true;
                }
            }
        }
        else {
            // Set basic parameter
            actionDescription = `Set patch ${keyFriendlyName} to ${value}`;
            let oldValue = zoomPatch[key];
            if (oldValue !== value) {
                zoomPatch[key] = value;
                zoomPatch.updatePatchPropertiesFromDerivedProperties();
                valueChanged = true;
            }
        }
        if (currentZoomPatchToConvert !== undefined && !patchAndDeviceMatches) {
            convertPatchAndUpdateEditors(zoomDevice, currentZoomPatchToConvert);
        }
        return [actionDescription, valueChanged];
    }
}
function hidePatchStatusIndicator() {
    let indicator = document.getElementById("patchDirtyIndicator");
    if (indicator !== null) {
        indicator.textContent = "";
        indicator.classList.remove("visible-saved", "visible-modified");
    }
}
function showPatchStatusIndicator(text: string, modified: boolean, autoHide = false) {
    let indicator = document.getElementById("patchDirtyIndicator");
    if (indicator === null)
        return;
    indicator.textContent = text;
    indicator.classList.remove("visible-saved", "visible-modified");
    indicator.classList.add(modified ? "visible-modified" : "visible-saved");
    if (patchStatusHideTimer !== undefined) {
        clearTimeout(patchStatusHideTimer);
        patchStatusHideTimer = undefined;
    }
    if (autoHide) {
        patchStatusHideTimer = setTimeout(() => {
            hidePatchStatusIndicator();
            patchStatusHideTimer = undefined;
        }, PATCH_STATUS_HIDE_DELAY_MS);
    }
}
function updateDirtyState(localDirtyState, force = false, showSavedTransient = false) {
    patchIsDirty = force ? localDirtyState : localDirtyState || patchIsDirty;
    for (let button of getPatchActionButtons("syncPatchToPedalButton"))
        button.disabled = !patchIsDirty;
    if (patchIsDirty) {
        showPatchStatusIndicator("Modified", true, false);
    }
    else if (showSavedTransient) {
        showPatchStatusIndicator("Saved", false, true);
    }
    else {
        hidePatchStatusIndicator();
    }
}
function setPatchNotDirty(showSavedTransient = false) {
    updateDirtyState(false, true, showSavedTransient);
}
function getCurrentUndoRedoManager() {
    if (currentZoomDevice === undefined) {
        shouldLog(LogLevel.Error) && console.error("getCurrentUndoRedoManager() called when currentZoomDevice == null.");
        return undefined;
    }
    let currentUndoRedoManager = undoRedoManagers.get(currentZoomDevice.deviceName);
    if (currentUndoRedoManager === undefined) {
        shouldLog(LogLevel.Error) && console.error(`No undoRedoManager found for device ${currentZoomDevice.deviceName}`);
        return undefined;
    }
    return currentUndoRedoManager;
}
function undoRedoStateChanged(undoRedoManager, undoAvailable, undoDescription, redoAvailable, redoDescription) {
    let currentUndoRedoManager = getCurrentUndoRedoManager();
    if (currentUndoRedoManager !== undoRedoManager) {
        shouldLog(LogLevel.Error) && console.error(`undoRedoStateChanged() called for undoRedoManager ${undoRedoManager} that is not currentUndoRedoManager ${currentUndoRedoManager}.`);
        return;
    }
    for (let undoButton of getPatchActionButtons("undoEditPatchButton")) {
        undoButton.style.visibility = undoAvailable ? "visible" : "hidden";
        undoButton.disabled = !undoAvailable;
        undoButton.setAttribute("tooltip", undoDescription.length > 0 ? "Undo: " + undoDescription : "Nothing to undo");
    }
    for (let redoButton of getPatchActionButtons("redoEditPatchButton")) {
        redoButton.style.visibility = redoAvailable ? "visible" : "hidden";
        redoButton.disabled = !redoAvailable;
        redoButton.setAttribute("tooltip", redoDescription.length > 0 ? "Redo: " + redoDescription : "Nothing to redo");
    }
}
let patchActionButtonsCache = new Map();
function getPatchActionButtons(buttonID) {
    let cachedButtons = patchActionButtonsCache.get(buttonID);
    if (cachedButtons !== undefined && cachedButtons.length > 0 && cachedButtons.every((button) => button.isConnected)) {
        return cachedButtons;
    }
    let buttons = Array.from(document.querySelectorAll(`button#${buttonID}`)).filter((button) => button instanceof HTMLButtonElement);
    patchActionButtonsCache.set(buttonID, buttons);
    return buttons;
}
function convertPatchAndUpdateEditors(zoomDevice, patch) {
    // Update the main patch editor with the converted patch
    shouldLog(LogLevel.Info) && console.log(`Converting patch "${patch.name}" from MS to MS+`);
    let [convertedPatch, unmappedSlotParameterList] = zoomPatchConverter.convert(patch);
    if (convertedPatch === undefined) {
        shouldLog(LogLevel.Warning) && console.warn(`Conversion failed for patch "${patch.name}"`);
    }
    else {
        shouldLog(LogLevel.Info) && console.log(`Conversion succeeded for patch "${patch.name}"`);
        updateEditorsForConvertedPatch(convertedPatch, unmappedSlotParameterList, zoomDevice);
    }
    return convertedPatch;
}
function updateEditorsForConvertedPatch(convertedPatch, unmappedSlotParameterList, zoomDevice) {
    if (mapForMS50GPlusAndMS70CDRPlus !== undefined) {
        let convertedPatchScreens = ZoomScreenCollection.fromPatchAndMappings(convertedPatch, mapForMS50GPlusAndMS70CDRPlus);
        if (zoomDevice === undefined) // if zoomDevices !== undefined, editor will be updated below in sendUpdatedPatchAsParameters()
            patchEditor.updateFromMap("MS-70CDR+", mapForMS50GPlusAndMS70CDRPlus, 4, convertedPatchScreens, convertedPatch, "MS-70CDR+ patch:", undefined, undefined);
        loadedPatchEditor.clearAllCellHighlights();
        loadedPatchEditor.addCellHighlights(unmappedSlotParameterList);
    }
    if (zoomDevice !== undefined)
        sendUpdatedPatchAsParameters(zoomDevice, convertedPatch);
}
function sendUpdatedPatchAsParameters(zoomDevice, zoomPatch) {
    if (zoomDevice.deviceName.includes("MS-50G+") && zoomDevice.deviceName.includes("MS-70CDR+")) {
        shouldLog(LogLevel.Warning) && console.warn(`sendUpdatedPatchAsParameters() called for device ${zoomDevice.deviceName} that is not MS-50G+ or MS-70CDR+.`);
    }
    if (zoomDevice.currentPatch === undefined) {
        shouldLog(LogLevel.Error) && console.error(`sendUpdatedPatchAsParameters() called when currentPatch is undefined for device ${zoomDevice.deviceName}.`);
        return;
    }
    if (zoomDevice.currentPatch.effectSettings === null) {
        shouldLog(LogLevel.Error) && console.error(`sendUpdatedPatchAsParameters() called when currentPatch.effectSettings is null for device ${zoomDevice.deviceName}.`);
        return;
    }
    if (zoomPatch.effectSettings === null) {
        shouldLog(LogLevel.Error) && console.error(`sendUpdatedPatchAsParameters() called when zoomPatch.effectSettings is null for device ${zoomDevice.deviceName}.`);
        return;
    }
    if (zoomPatch.effectSettings.length !== zoomDevice.currentPatch.effectSettings.length) {
        // The number of effect slots in use differs
        shouldLog(LogLevel.Warning) && console.warn(`sendUpdatedPatchAsParameters() called when zoomPatch.effectSettings.length !== currentPatch.effectSettings.length for device ${zoomDevice.deviceName}. Uploading complete patch.`);
        currentZoomPatch = zoomPatch;
        zoomDevice.uploadPatchToCurrentPatch(zoomPatch);
        getScreenCollectionAndUpdateEditPatchTable(zoomDevice);
        return;
    }
    if (zoomPatch.name !== zoomDevice.currentPatch.name) {
        shouldLog(LogLevel.Info) && console.log(`Patch name changed from "${zoomDevice.currentPatch.name}" to "${zoomPatch.name}". Uploading complete patch "${zoomPatch.name}" to device ${zoomDevice.deviceName}.`);
        currentZoomPatch = zoomPatch;
        zoomDevice.uploadPatchToCurrentPatch(zoomPatch);
        getScreenCollectionAndUpdateEditPatchTable(zoomDevice);
        return;
    }
    if (zoomPatch.tempo !== zoomDevice.currentPatch.tempo) {
        shouldLog(LogLevel.Info) && console.log(`Patch tempo changed from "${zoomDevice.currentPatch.tempo}" to "${zoomPatch.tempo}". Uploading complete patch "${zoomPatch.name}" to device ${zoomDevice.deviceName}.`);
        currentZoomPatch = zoomPatch;
        zoomDevice.uploadPatchToCurrentPatch(zoomPatch);
        getScreenCollectionAndUpdateEditPatchTable(zoomDevice);
        return;
    }
    let effectIDChanged = false;
    for (let effectSlot = 0; effectSlot < zoomPatch.effectSettings.length; effectSlot++) {
        let newPatchEffect = zoomPatch.effectSettings[effectSlot];
        let currentPatchEffect = zoomDevice.currentPatch.effectSettings[effectSlot];
        if (newPatchEffect.id !== currentPatchEffect.id) {
            effectIDChanged = true;
            break;
        }
    }
    if (effectIDChanged) {
        shouldLog(LogLevel.Info) && console.log(`Effect id changed. Uploading complete patch "${zoomPatch.name}" to device ${zoomDevice.deviceName}.`);
        currentZoomPatch = zoomPatch;
        zoomDevice.uploadPatchToCurrentPatch(zoomPatch);
        getScreenCollectionAndUpdateEditPatchTable(zoomDevice);
        return;
    }
    for (let effectSlot = 0; effectSlot < zoomPatch.effectSettings.length; effectSlot++) {
        let newPatchEffect = zoomPatch.effectSettings[effectSlot];
        let currentPatchEffect = zoomDevice.currentPatch.effectSettings[effectSlot];
        // // Change effect ID if needed
        // if (newPatchEffect.id !== currentPatchEffect.id) {
        //   shouldLog(LogLevel.Info) && console.log(`Updating effect ID for effect slot ${effectSlot} `+
        //     `from ${currentPatchEffect.id.toString(16).padStart(8, "0")} to ${newPatchEffect.id.toString(16).padStart(8, "0")}`);
        //   zoomDevice.setEffectParameterForCurrentPatch(effectSlot, 1, newPatchEffect.id);
        // }
        if (newPatchEffect.enabled !== currentPatchEffect.enabled) {
            if (currentZoomPatch !== undefined && currentZoomPatch.effectSettings !== null)
                currentZoomPatch.effectSettings[effectSlot].enabled = newPatchEffect.enabled;
            zoomDevice.setEffectParameterForCurrentPatch(effectSlot, 0, newPatchEffect.enabled ? 1 : 0);
        }
        if (newPatchEffect.parameters.length > currentPatchEffect.parameters.length) {
            shouldLog(LogLevel.Error) && console.error(`sendUpdatedPatchAsParameters() called when newPatchEffect.parameters.length > currentPatchEffect.parameters.length ` +
                `for device ${zoomDevice.deviceName}. This should never happen. Investigate.`);
            continue;
        }
        for (let parameterIndex = 0; parameterIndex < newPatchEffect.parameters.length; parameterIndex++) {
            let parameterNumber = parameterIndex + 2;
            if (newPatchEffect.parameters[parameterIndex] !== currentPatchEffect.parameters[parameterIndex]) {
                if (currentZoomPatch !== undefined && currentZoomPatch.effectSettings !== null)
                    currentZoomPatch.effectSettings[effectSlot].parameters[parameterIndex] = newPatchEffect.parameters[parameterIndex];
                shouldLog(LogLevel.Info) && console.log(`Updating parameter ${parameterIndex} for effect slot ${effectSlot} ` +
                    `from ${currentPatchEffect.parameters[parameterIndex]} to ${newPatchEffect.parameters[parameterIndex]}`);
                zoomDevice.setEffectParameterForCurrentPatch(effectSlot, parameterNumber, newPatchEffect.parameters[parameterIndex]);
            }
        }
    }
}
function handleMIDIData(device, data) {
    let [messageType, channel, data1, data2] = getChannelMessage(data);
    if (messageType !== MessageType.Clock)
        shouldLog(LogLevel.Info) && console.log(`Received MIDI Data - type: ${MessageType[messageType]}` +
            (channel < 0 ? "" : `,  channel: ${channel}, data1: ${data1}, data2: ${data2}`));
    // shouldLog(LogLevel.Info) && console.log(`Received MIDI Data: ${bytesToHexString(data, " ")}`);
    // muteTestKnobListener = true;
    // testKnob.rawValue = data2;
    // muteTestKnobListener = false;
}
function handleMIDIDataFromLCXL(device, data) {
    let lcxlDevice = device;
    let [messageType, channel, data1, data2] = getChannelMessage(data);
    shouldLog(LogLevel.Info) && console.log(`Received MIDI Data from LCXL - type: ${MessageType[messageType]},  channel: ${channel}, data1: ${data1}, data2: ${data2}`);
}
function updateLCXLColors(lcxlDevice, zoomDevice, zoomPatch) {
    if (muteLCXLForEdit)
        return;
    if (zoomPatch.effectSettings === null)
        return;
    lcxlDevice.clearAllColors(8);
    for (let effectSlot = 0; effectSlot < zoomDevice.maxNumEffects; effectSlot++) {
        if (effectSlot >= zoomPatch.effectSettings.length) {
            lcxlDevice.sendColor(8, 24 + zoomDevice.maxNumEffects - 1 - effectSlot, 2, 1);
            continue;
        }
        let effectSettings = zoomPatch.effectSettings[effectSlot];
        let intensity = effectSettings.enabled ? 3 : 1;
        let red = effectSlot === zoomPatch.currentEffectSlot ? intensity : 0;
        let green = effectSlot !== zoomPatch.currentEffectSlot ? intensity : 0;
        lcxlDevice.sendColor(8, 24 + zoomDevice.maxNumEffects - 1 - effectSlot, red, green);
    }
    let screenCollection = zoomDevice.currentScreenCollection;
    if (screenCollection === undefined && currentZoomPatch !== undefined && zoomDevice.effectIDMap !== undefined) {
        // FIXME: Not the most robust of designs... Depends on mapping being loaded and existing for that pedal.
        screenCollection = ZoomScreenCollection.fromPatchAndMappings(currentZoomPatch, zoomDevice.effectIDMap);
    }
    if (screenCollection === undefined)
        return;
    let effectSettings = zoomPatch.effectSettings[zoomPatch.currentEffectSlot];
    let screen = screenCollection.screens[zoomPatch.currentEffectSlot];
    for (let parameterNumber = 2; parameterNumber < screen.parameters.length; parameterNumber++) {
        let parameterIndex = parameterNumber - 2;
        let column = parameterIndex % zoomDevice.numParametersPerPage;
        let row = Math.floor(parameterIndex / zoomDevice.numParametersPerPage);
        lcxlDevice.sendColor(8, row * 8 + column, 1, 0);
    }
}
async function waitForWebMIDI(reconnectTimeoutMilliseconds) {
    if (toplevelContentDiv !== null)
        toplevelContentDiv.style.display = "none";
    setStartupLoadingState("Loading", "Initializing MIDI backend...");
    let hasWebMIDI = false;
    let attemptCounter = 0;
    let lastEnableError = "";
    while (!hasWebMIDI) {
        attemptCounter++;
        hasWebMIDI = await midi.enable().catch((reason) => {
            lastEnableError = getExceptionErrorString(reason);
            console.error(`Failed to enable MIDI backend (attempt ${attemptCounter}): ${lastEnableError}`);
            return false;
        });
        if (!hasWebMIDI) {
            let suffix = lastEnableError.length > 0 ? ` Last error: ${lastEnableError}` : "";
            setStartupLoadingState("Loading", `Waiting for MIDI backend to initialize (attempt ${attemptCounter}).${suffix}`);
            await sleepForAWhile(reconnectTimeoutMilliseconds);
        }
    }
    shouldLog(LogLevel.Info) && console.log(`MIDI backend enabled. Inputs=${midi.inputs.size}, outputs=${midi.outputs.size}`);
    setStartupLoadingState("Loading", "MIDI backend ready.");
}
async function waitForZoomDevices(timeoutMilliseconds) {
    if (toplevelContentDiv !== null)
        toplevelContentDiv.style.display = "none";
    setStartupLoadingState("Waiting for Zoom pedal connection", "Please connect a Zoom MS or MS+ pedal.");
    let zoomDevices = [];
    let retryCounter = 0;
    let warnedAboutUnclassifiedZoom = false;
    while (zoomDevices.length === 0) {
        zoomDevices = deviceManager.getDevices(ZoomDevices);
        if (zoomDevices.length === 0) {
            let midiDevices = deviceManager.getDevices(MIDIDevices);
            if (!warnedAboutUnclassifiedZoom && midiDevices.length > 0) {
                let possibleZoomNames = midiDevices
                    .map((d) => `${d.deviceInfo.inputName} ${d.deviceInfo.outputName}`.trim())
                    .filter((name) => /zoom|ms\s*plus|ms-\d+/i.test(name));
                if (possibleZoomNames.length > 0) {
                    warnedAboutUnclassifiedZoom = true;
                    shouldLog(LogLevel.Warning) && console.warn(`MIDI devices detected but not classified as Zoom yet: ${possibleZoomNames.join(" | ")}`);
                    setStartupLoadingState("Waiting for Zoom pedal connection", "Zoom MIDI device detected, but identity/classification is still pending.");
                }
            }
            retryCounter++;
            let inputNames = [...midi.inputs.values()].map((input) => input.name);
            let outputNames = [...midi.outputs.values()].map((output) => output.name);
            let detectedNames = [...new Set([...inputNames, ...outputNames])];
            if (retryCounter % 5 === 0) {
                shouldLog(LogLevel.Warning) && console.warn(`Still waiting for Zoom classification (attempt ${retryCounter}). Inputs=${inputNames.length}, outputs=${outputNames.length}${detectedNames.length > 0 ? `, names: ${detectedNames.join(" | ")}` : ""}`);
                await deviceManager.updateMIDIDeviceList().catch((error) => {
                    shouldLog(LogLevel.Warning) && console.warn(`Retrying MIDI device list update failed: ${String(error)}`);
                });
            }
            setStartupLoadingState("Waiting for Zoom pedal connection", `Attempt ${retryCounter}.` +
                `${detectedNames.length > 0 ? ` Detected MIDI ports: ${detectedNames.join(" | ")}` : " No MIDI ports detected yet."}`);
            await sleepForAWhile(timeoutMilliseconds);
        }
    }
    setStartupLoadingState("Loading", `Zoom pedal detected: ${zoomDevices[0].deviceName}`);
    // We wait with enabling the midiDeviceListView untill all devices have been loaded, otherwise
    // we might get error "Unable to get index for device" in MIDIDeviceListHTMLView.updateMIDIDevicesTableActivity
    midiDeviceListView.enabled = !performanceMode;
    let openZoomDevice = zoomDevices.find((d) => d.isOpen);
    if (openZoomDevice === undefined && zoomDevices.length > 0) {
        shouldLog(LogLevel.Warning) && console.warn(`Zoom device detected but not open yet. Auto-opening "${zoomDevices[0].deviceName}"`);
        setStartupLoadingState("Loading", `Connecting to ${zoomDevices[0].deviceName}...`);
        await handleZoomDeviceOn(deviceManager, zoomDevices[0]);
    }
    if (currentZoomDevice !== undefined) {
        if (toplevelContentDiv !== null)
            toplevelContentDiv.style.display = "block";
        hideStartupLoadingOverlay();
    }
    // When device connected and on, display will be set to "block", see handleZoomDeviceOn()
    // toplevelContentDiv.style.display = "block";
    // shouldLog(LogLevel.Info) && console.log("MIDI Device list:");
    // let midiDeviceList = deviceManager.midiDeviceList;
    // for (let i=0; i<midiDeviceList.length; i++)
    // {
    //   let device = midiDeviceList[i];
    //   shouldLog(LogLevel.Info) && console.log(`  ${JSON.stringify(device)}`)
    // }
    // let lcxlDevices = deviceManager.getDevices(LCXLDevices) as LCXLDevice[];
    // let midiDevices = deviceManager.getDevices(MIDIDevices) as MIDIDevice[];
    // let allDevices: IManagedMIDIDevice[] = [...zoomDevices, ...lcxlDevices, ...midiDevices]; 
    // updateMIDIDevicesTable(allDevices);
    // updateMIDIMappingsTable(allDevices);
    // if (lcxlDevices.length > 0) {
    //   shouldLog(LogLevel.Info) && console.log(`Found ${lcxlDevices.length} LCXL devices`);
    //   currentLCXLDevice = lcxlDevices[0];
    //   await updateStateWithNewLCXLDevice(currentLCXLDevice);
    //   for (let i = 0; i< lcxlDevices.length; i++) {
    //     let device = lcxlDevices[i];
    //     shouldLog(LogLevel.Info) && console.log(`  ${JSON.stringify(device)}`);
    //   }
    // }
    // if (currentZoomDevice !== zoomDevices[0]) {
    //   currentZoomDevice = zoomDevices[0];  
    //   await updateStateWithNewZoomDevice(currentZoomDevice);
    // }
    // if (midiDevices.length > 0) {
    //   shouldLog(LogLevel.Info) && console.log(`Found ${midiDevices.length} MIDI devices`);
    //   for (let i = 0; i< midiDevices.length; i++) {
    //     let device = midiDevices[i];
    //     shouldLog(LogLevel.Info) && console.log(`  ${JSON.stringify(device)}`);
    //     if (!device.isOpen) {
    //       await device.open();
    //       device.removeAllListeners();
    //       device.addListener(handleMIDIData);
    //     }
    //   }
    // }
}
// let muteTestKnobListener = false;
// function testKnobListener(device: MIDIDevice, rawValue: number): void 
// {
//   if (!muteTestKnobListener)
//     device.sendCC(0, 20, rawValue);
// }
async function handleDisconnect(deviceManager, device, key) {
    shouldLog(LogLevel.Info) && console.log(`Device disconnected ${device.deviceName} (${device.deviceInfo.inputName}, ${device.deviceInfo.outputName})`);
    if (key === ZoomDevices) {
        setTimeout(async () => {
            initializedZoomDevices.delete(device.deviceName);
            let zoomDevices = deviceManager.getDevices(ZoomDevices);
            let lcxlDevices = deviceManager.getDevices(LCXLDevices);
            let midiDevices = deviceManager.getDevices(MIDIDevices);
            let allDevices = [...zoomDevices, ...lcxlDevices, ...midiDevices];
            // midiDeviceListView.updateMIDIDevicesTableDeprecated(allDevices);
            updateMIDIMappingsTable(allDevices);
            undoRedoManagers.delete(device.deviceName);
            undoRedoManagers.delete("patchlist_" + device.deviceName);
            // if (currentZoomDevice !== undefined && device.deviceInfo.inputID === currentZoomDevice.deviceInfo.inputID && zoomDevices.length === 0) {
            if (zoomDevices.length === 0) {
                currentZoomDevice = undefined;
                shouldLog(LogLevel.Info) && console.log(`No more zoom devices connected. Waiting for new zoom device to be connected.`);
                await waitForZoomDevices(reconnectTimeoutMilliseconds);
            }
            else {
                await handleZoomDeviceOff(deviceManager, device);
            }
        });
    }
    else if (key === LCXLDevices) {
        setTimeout(async () => {
            await handleLCXLDeviceOff(deviceManager, device);
        });
    }
    else if (key === MIDIDevices) {
        setTimeout(async () => {
            await handleMIDIDeviceOff(deviceManager, device);
        });
    }
}
async function handleZoomDeviceOff(deviceManager, zoomDeviceOff) {
    initializedZoomDevices.delete(zoomDeviceOff.deviceName);
    if (currentZoomDevice !== undefined && zoomDeviceOff.deviceInfo.inputID === currentZoomDevice.deviceInfo.inputID) {
        let zoomDevices = deviceManager.getDevices(ZoomDevices);
        let zoomDevice = zoomDevices.find(zoomDevice => zoomDevice.isOpen);
        if (zoomDevice !== undefined) {
            let newCurrentZoomDevice = zoomDevice;
            await updateStateWithNewCurrentZoomDevice(newCurrentZoomDevice);
        }
        else {
            currentZoomDevice = undefined;
            toplevelContentDiv.style.display = "none";
        }
    }
}
async function handleLCXLDeviceOff(deviceManager, lcxlDeviceOff) {
    if (currentLCXLDevice !== undefined && lcxlDeviceOff.deviceInfo.inputID === currentLCXLDevice.deviceInfo.inputID) {
        let lcxlDevices = deviceManager.getDevices(LCXLDevices);
        currentLCXLDevice = lcxlDevices[0];
        //await updateStateWithNewCurrentLCXLDevice(newCurrentLCXLDevice); 
    }
}
async function handleMIDIDeviceOff(deviceManager, midiDeviceOff) {
    // Redo mappings from local storage
    updateMappingsFromLocalStorage();
}
function handleConnect(deviceManager, device, key) {
    shouldLog(LogLevel.Info) && console.log(`Device connected ${device.deviceName} (${device.deviceInfo.inputName}, ${device.deviceInfo.outputName})`);
    setTimeout(async () => {
        try {
            let properties = midiDeviceListModel.deviceProperties.get(device.deviceName);
            let deviceShouldBeOn = properties !== undefined ? properties.deviceOn : true; // default ON for first-time discovery before UI model is populated
            if (properties === undefined) {
                shouldLog(LogLevel.Info) && console.log(`No UI device properties found yet for "${device.deviceName}". Defaulting to On=true for initial connection.`);
            }
            else if (!deviceShouldBeOn) {
                console.warn(`Device "${device.deviceName}" is marked Off in MIDI Devices list. Skipping auto-open.`);
            }
            let zoomDevices = deviceManager.getDevices(ZoomDevices);
            let lcxlDevices = deviceManager.getDevices(LCXLDevices);
            let midiDevices = deviceManager.getDevices(MIDIDevices);
            let allDevices = [...zoomDevices, ...lcxlDevices, ...midiDevices];
            // midiDeviceListView.updateMIDIDevicesTableDeprecated(allDevices);
            updateMIDIMappingsTable(allDevices);
            if (device instanceof ZoomDevice) {
                if (!undoRedoManagers.has(device.deviceName)) {
                    let undoRedoManager = new UndoRedoManager();
                    undoRedoManagers.set(device.deviceName, undoRedoManager);
                    undoRedoManager.addStateChangedListener(undoRedoStateChanged);
                }
                if (!undoRedoManagers.has("patchlist_" + device.deviceName)) {
                    let undoRedoManager = new UndoRedoManager();
                    undoRedoManagers.set("patchlist_" + device.deviceName, undoRedoManager);
                }
                if (deviceShouldBeOn)
                    await handleZoomDeviceOn(deviceManager, device);
            }
            else if (device instanceof LCXLDevice) {
                if (deviceShouldBeOn)
                    await handleLCXLDeviceOn(deviceManager, device);
            }
            else if (device instanceof MIDIDevice) {
                if (deviceShouldBeOn)
                    await handleMIDIDeviceOn(deviceManager, device);
            }
            if (zoomCCMapper !== null && device.deviceName === zoomCCMapperModel.inputDevice) {
                zoomCCMapperController.updateInputDevice();
            }
            // shouldLog(LogLevel.Info) && console.log("MIDI Device list:");
            // let midiDeviceList = deviceManager.midiDeviceList;
            // for (let i=0; i<midiDeviceList.length; i++)
            // {
            //   let device = midiDeviceList[i];
            //   shouldLog(LogLevel.Info) && console.log(`  ${JSON.stringify(device)}`)
            // }
        }
        catch (error) {
            console.error(`Failed while handling connected device "${device?.deviceName ?? "unknown"}":`, error);
        }
    });
}
async function handleZoomDeviceOn(deviceManager, zoomDevice) {
    setStartupLoadingState("Loading", `Syncing ${zoomDevice.deviceName}...`);
    await openAndSyncNewZoomDevice(zoomDevice);
    if (currentZoomDevice === undefined) {
        if (toplevelContentDiv !== null)
            toplevelContentDiv.style.display = "block";
        await updateStateWithNewCurrentZoomDevice(zoomDevice);
    }
    if (toplevelContentDiv !== null)
        toplevelContentDiv.style.display = "block";
    hideStartupLoadingOverlay();
}
async function handleLCXLDeviceOn(deviceManager, lcxlDevice) {
    await lcxlDevice.open();
    if (currentLCXLDevice === undefined) {
        await updateStateWithNewLCXLDevice(lcxlDevice);
    }
}
async function handleMIDIDeviceOn(deviceManager, midiDevice) {
    await midiDevice.open();
    midiDevice.removeAllListeners();
    midiDevice.addListener(handleMIDIData);
    updateMappingsFromLocalStorage();
}
async function openAndSyncNewZoomDevice(zoomDevice) {
    let shouldInitialize = !initializedZoomDevices.has(zoomDevice.deviceName);
    if (!zoomDevice.isOpen) {
        await zoomDevice.open();
        shouldInitialize = true;
    }
    if (!shouldInitialize) {
        return;
    }
    initializedZoomDevices.add(zoomDevice.deviceName);
    try {
        zoomDevice.parameterEditEnable();
        zoomDevice.addMemorySlotChangedListener(handleMemorySlotChanged);
        zoomDevice.autoUpdateScreens = true;
        zoomDevice.addScreenChangedListener(handleScreenChanged);
        zoomDevice.autoRequestCurrentPatch = true;
        zoomDevice.addCurrentPatchChangedListener(handleCurrentPatchChanged);
        zoomDevice.addPatchChangedListener(handlePatchChanged);
        zoomDevice.addEffectParameterChangedListener(handleEffectParameterChanged);
        zoomDevice.autoRequestProgramChange = true;
        zoomDevice.addTempoChangedListener(handleTempoChanged);
        zoomDevice.addEffectSlotChangedListener(handleEffectSlotChanged);
        await zoomDevice.updatePatchListFromPedal();
    }
    catch (error) {
        initializedZoomDevices.delete(zoomDevice.deviceName);
        throw error;
    }
}
async function updateStateWithNewCurrentZoomDevice(zoomDevice) {
    currentZoomDevice = zoomDevice;
    midiDeviceListModel.selectedDeviceName = currentZoomDevice.deviceName;
    shouldLog(LogLevel.Info) && console.log(`Updating state with new zoom device ${currentZoomDevice.deviceName}`);
    // await zoomDevice.open();
    // await syncNewZoomDevice(zoomDevice);
    patchEditor.setTextEditedCallback((event, type, initialValueString) => {
        return handlePatchEdited(currentZoomPatch, zoomDevice, zoomDevice.effectIDMap, event, type, initialValueString);
    });
    patchEditor.setMouseMovedCallback((cell, initialValueString, x, y) => {
        handleMouseMoved(currentZoomPatch, zoomDevice, zoomDevice.effectIDMap, cell, initialValueString, x, y);
    });
    patchEditor.setMouseUpCallback((cell, initialValueString, x, y) => {
        handleMouseUp(currentZoomPatch, zoomDevice, zoomDevice.effectIDMap, cell, initialValueString, x, y);
    });
    patchEditor.setEffectSlotOnOffCallback((effectSlot, on) => {
        handleEffectSlotOnOff(currentZoomPatch, zoomDevice, zoomDevice.effectIDMap, effectSlot, on);
    });
    patchEditor.setEffectSlotDeleteCallback((effectSlot) => {
        handleEffectSlotDelete(currentZoomPatch, zoomDevice, zoomDevice.effectIDMap, effectSlot);
    });
    patchEditor.setEffectSlotMoveCallback((effectSlot, direction) => {
        handleEffectSlotMove(currentZoomPatch, zoomDevice, zoomDevice.effectIDMap, effectSlot, direction);
    });
    patchEditor.setEffectSlotAddCallback((effectSlot, direction) => {
        handleEffectSlotAdd(currentZoomPatch, zoomDevice, zoomDevice.effectIDMap, effectSlot, direction);
    });
    patchEditor.setEffectSlotSelectEffectCallback((effectSlot) => {
        handleEffectSlotSelectEffect(currentZoomPatch, zoomDevice, zoomDevice.effectIDMap, effectSlot);
    });
    let undoRedoManager = getCurrentUndoRedoManager();
    if (undoRedoManager !== undefined) {
        undoRedoStateChanged(undoRedoManager, undoRedoManager.undoAvailable, undoRedoManager.undoDescription, undoRedoManager.redoAvailable, undoRedoManager.redoDescription);
    }
    initPatchTable(zoomDevice);
    initPatchesTable(zoomDevice);
    await updatePatchesTable(zoomDevice);
    // Select the current memory slot in the patches table
    let currentMemorySlot = await zoomDevice.getCurrentMemorySlotNumber();
    if (currentMemorySlot !== undefined) {
        patchList.currentlySelectedMemorySlot = currentMemorySlot;
        updatePatchSelectorSelection(currentMemorySlot);
        // currentZoomPatch = zoomDevice.patchList[currentMemorySlot].clone();
        if (zoomDevice.currentPatch === undefined) {
            shouldLog(LogLevel.Warning) && console.warn(`zoomDevice.currentPatch is undefined. using patch in currentMemorySlot (${currentMemorySlot}) instead`);
            currentZoomPatch = zoomDevice.patchList[currentMemorySlot].clone();
        }
        else {
            currentZoomPatch = zoomDevice.currentPatch.clone();
        }
        currentZoomPatchToConvert = undefined;
        loadedPatchEditor.hide();
        if (currentLCXLDevice !== undefined)
            updateLCXLColors(currentLCXLDevice, zoomDevice, currentZoomPatch);
    }
    getScreenCollectionAndUpdateEditPatchTable(zoomDevice);
    if (rackDevices) {
        rackModel.removeAllDevices();
        rackView.removeAllDevices();
        sceneDeviceModel = new SceneDeviceModel();
        sceneDeviceModel.name = "Scenes";
        sceneDeviceHTMLView = new SceneDeviceHTMLView(sceneDeviceModel);
        sceneDeviceHTMLView.enabled = !performanceMode;
        sceneDeviceController = new SceneDeviceController(sceneDeviceHTMLView, sceneDeviceModel, rackModel);
        sceneDeviceMIDIView = new SceneDeviceMIDIView(sceneDeviceModel, (state) => {
            let [channel, note, cc] = virtualMIDIDeviceModel.getSourceNoteOrCCFromDestinationState(SCENE_CHANNEL, state);
            return [channel, note, cc];
        }, (parameter) => {
            let [channel, parameterNumber] = virtualMIDIDeviceModel.getSourceCCFromDestinationParameter(SCENE_CHANNEL, parameter);
            return [channel, parameterNumber];
        });
        if (currentLCXLDevice !== undefined)
            sceneDeviceMIDIView.setLCXLDevice(currentLCXLDevice);
        rackModel.addDevice(sceneDeviceModel);
        rackView.addDevice(sceneDeviceHTMLView);
    }
    if (rackDevices) {
        let zoomDeviceModel = new ZoomDeviceModel();
        zoomDeviceModel.name = zoomDevice.deviceName;
        zoomDeviceController = new ZoomDeviceController(zoomDeviceModel, zoomDevice);
        zoomDeviceView = new ZoomDeviceHTMLView(zoomDeviceModel, ZoomDevice.getColorFromPedalName(zoomDevice.deviceName));
        if (zoomEffectSelector !== undefined)
            zoomDeviceView.setZoomEffectSelector(zoomEffectSelector);
        if (performanceMode)
            zoomDeviceView.enabled = false;
        rackModel.addDevice(zoomDeviceModel);
        rackView.addDevice(zoomDeviceView);
        if (sceneDeviceController !== undefined)
            sceneDeviceController.storeDefaultScene();
    }
    updateMappingsFromLocalStorage();
    if (performanceMode) {
        zoomDevice.autoUpdateScreens = false;
    }
}
async function updateStateWithNewLCXLDevice(lcxlDevice) {
    lcxlDevice.removeAllListeners();
    lcxlDevice.addListener(handleMIDIDataFromLCXL);
    lcxlDevice.clearAllColors(8);
    currentLCXLDevice = lcxlDevice;
    updateMappingsFromLocalStorage();
    if (sceneDeviceMIDIView !== undefined)
        sceneDeviceMIDIView.setLCXLDevice(currentLCXLDevice);
}
function enableCollapsibleElements() {
    let coll = document.getElementsByClassName("collapsible");
    for (let i = 0; i < coll.length; i++) {
        coll[i].addEventListener("click", (event) => {
            if (event.target === null || event.target instanceof HTMLButtonElement)
                return;
            let element = event.target;
            element = collapseElement(element);
            storeMinimizedStatesToLocalStorage();
        });
    }
    restoreMinimizedStatesFromLocalStorage();
}
function collapseElement(element, minimized) {
    if (element.classList.contains("ignoreCollapse"))
        return element;
    while (!element.classList.contains("collapsible")) {
        element = element.parentElement;
    }
    if (minimized === undefined)
        element.classList.toggle("active");
    else
        element.classList.toggle("active", minimized);
    let content = element.nextElementSibling;
    let header = content.previousElementSibling;
    let parent = element.parentElement;
    if (element.classList.contains("active")) {
        parent.style.setProperty("width", header.clientWidth + "px");
        parent.style.setProperty("height", header.clientHeight + "px");
        parent.style.setProperty("overflow", "hidden");
    }
    else {
        parent.style.setProperty("overflow", "visible");
        parent.style.height = "";
        parent.style.width = "";
    }
    return element;
}
function storeMinimizedStatesToLocalStorage() {
    let collapsibleElements = document.getElementsByClassName("collapsible");
    let minimizedStates = {};
    for (let element of collapsibleElements) {
        let elementID = element.id.replace("CollapsibleButton", "");
        minimizedStates[elementID] = element.classList.contains("active");
    }
    localStorage.setItem("minimizedStates", JSON.stringify(minimizedStates));
}
function restoreMinimizedStatesFromLocalStorage() {
    let minimizedStates = JSON.parse(localStorage.getItem("minimizedStates") || "{}");
    let collapsibleElements = document.getElementsByClassName("collapsible");
    for (let element of collapsibleElements) {
        let elementID = element.id.replace("CollapsibleButton", "");
        let minimized = minimizedStates[elementID];
        if (minimized !== undefined)
            collapseElement(element, minimized);
    }
}
function updateMIDIDeviceListFromLocalStorage() {
    let model = localStorage.getItem("midiDeviceListModel");
    if (model !== null) {
        midiDeviceListModel.setFromJSON(model);
    }
}
async function selectedDeviceChanged(model, deviceName) {
    localStorage.setItem("midiDeviceListModel", model.storeToJSON());
    let [device, key] = deviceManager.getDeviceFromName(deviceName);
    if (device === undefined)
        return;
    if (device instanceof ZoomDevice) {
        if (device.isOpen) {
            await updateStateWithNewCurrentZoomDevice(device);
        }
    }
}
function showActivityChanged(model, showActivity) {
    localStorage.setItem("midiDeviceListModel", model.storeToJSON());
}
function devicePropertiesChanged(model, deviceName, properties, operation) {
    localStorage.setItem("midiDeviceListModel", model.storeToJSON());
    let [device, key] = deviceManager.getDeviceFromName(deviceName);
    if (device === undefined) {
        shouldLog(LogLevel.Info) && console.log(`Could not find device with name ${deviceName}. Skipping mute state updates`);
        return;
    }
    device.setMuteState(MessageType.Clock, properties.filterMuteClock);
    device.setMuteState(MessageType.CC, properties.filterMuteCC);
    device.setMuteState(MessageType.NoteOn, properties.filterMuteNote);
    device.setMuteState(MessageType.NoteOff, properties.filterMuteNote);
}
function deviceOnChanged(model, deviceName, on) {
    localStorage.setItem("midiDeviceListModel", model.storeToJSON());
    let [device, key] = deviceManager.getDeviceFromName(deviceName);
    if (device === undefined) {
        shouldLog(LogLevel.Error) && console.error("Could not find device with name " + deviceName);
        return;
    }
    if (device instanceof ZoomDevice) {
        let zoomDevice = device;
        if (zoomDevice.isOpen && !on) {
            zoomDevice.close();
            handleZoomDeviceOff(deviceManager, zoomDevice);
        }
        else if (!zoomDevice.isOpen && on) {
            setTimeout(async () => {
                await handleZoomDeviceOn(deviceManager, zoomDevice);
            });
        }
    }
    else if (device instanceof LCXLDevice) {
        let lcxlDevice = device;
        if (lcxlDevice.isOpen && !on) {
            lcxlDevice.close();
            handleLCXLDeviceOff(deviceManager, lcxlDevice);
        }
    }
    else if (device instanceof MIDIDevice) {
        let midiDevice = device;
        if (midiDevice.isOpen && !on) {
            midiDevice.close();
            handleMIDIDeviceOff(deviceManager, midiDevice);
        }
    }
}
let mappingUpdateSucceeded = false;
function updateMappingsFromLocalStorage() {
    // if (mappingUpdateSucceeded) {
    //   shouldLog(LogLevel.Info) && console.log("Mappings have already been sccessfully set from local storage, not updating again");
    //   return;
    // }
    let mappingsJSON = localStorage.getItem("mappings");
    if (mappingsJSON === null) {
        shouldLog(LogLevel.Info) && console.log("No mappings found in local storage, not updating");
        return;
    }
    if (virtualMIDIDeviceController !== undefined) {
        mappingUpdateSucceeded = virtualMIDIDeviceController.setMappingFromJSON(mappingsJSON);
    }
    if (mappingUpdateSucceeded) {
        shouldLog(LogLevel.Info) && console.log("Mappings successfully updated from local storage");
    }
    else {
        shouldLog(LogLevel.Info) && console.log("Failed to update mappings from local storage. Will try again for the next MIDI device connected");
    }
}
function updateZoomCCMapperFromLocalStorage() {
    if (zoomCCMapper === null)
        return;
    // let zoomCCMapperInputDevice = localStorage.getItem("zoomCCMapperInputDevice");
    // if (zoomCCMapperInputDevice !== null) {
    //   zoomCCMapperModel.inputDevice = zoomCCMapperInputDevice;
    // }
    let model = localStorage.getItem("zoomCCMapperModel");
    if (model !== null) {
        zoomCCMapperModel.setFromJSON(JSON.parse(model));
    }
}
function updatePatchEditorFromLocalStorage() {
    if (patchEditor === null)
        return;
    let model = localStorage.getItem("zoomPatchEditorModel");
    if (model !== null) {
        patchEditorModel.setFromJSON(JSON.parse(model));
    }
    else {
        patchEditorModel.on = true;
    }
}
function storePatchEditorToLocalStorage() {
    localStorage.setItem("zoomPatchEditorModel", patchEditorModel.storeToJSON());
}
function handleIsMappingChanged(controller, isMapping) {
    if (!isMapping) {
        let json = controller.model.storeMapToJSON();
        shouldLog(LogLevel.Info) && console.log(`VirtualMIDIDeviceController: JSON: ${json}`);
        localStorage.setItem("mappings", json);
        if (sceneDeviceMIDIView !== undefined) {
            sceneDeviceMIDIView.clearColors();
            sceneDeviceMIDIView.updateColors();
        }
    }
}
function handleZoomCCMapperOnOffChanged(model, on) {
    let mapperModel = model;
    localStorage.setItem("zoomCCMapperModel", mapperModel.storeToJSON());
}
function handleZoomCCMapperInputDeviceChanged(mapperModel, name) {
    // localStorage.setItem("zoomCCMapperInputDevice", name);
    localStorage.setItem("zoomCCMapperModel", mapperModel.storeToJSON());
}
function handleZoomCCMapperOutputDeviceChannelChanged(mapperModel, outputDeviceName, channel, operation) {
    // localStorage.setItem("zoomCCMapperInputDevice", name);
    localStorage.setItem("zoomCCMapperModel", mapperModel.storeToJSON());
}
function saveRack(model, shiftKey = false) {
    shouldLog(LogLevel.Info) && console.log(`Saving rack ${model.name}`);
    zoomDeviceController?.storePatchToModelAsSysex();
    let rackAsJSON = model.toJSON();
    if (shiftKey) {
        let rackAsJSONString = JSON.stringify(rackAsJSON);
        const blob = new Blob([rackAsJSONString]);
        let suggestedName = `${model.name}.rack`;
        let fileEnding = "rack";
        let fileDescription = "Rack JSON";
        setTimeout(async () => {
            await saveBlobToFile(blob, suggestedName, fileEnding, fileDescription);
        });
    }
    else {
        let fileName = `${model.name}.rack`;
        let pathWithExtension = `/Rack Presets/Local Playground/${fileName}`;
        // let selectedFileBrowserItem = fileBrowser?.selectedDirectory;
        // if (selectedFileBrowserItem !== undefined && selectedFileBrowserItem.type === "folder") {
        //   pathWithExtension = `${selectedFileBrowserItem.path}/${fileName}`;
        // }
        // else {
        //   pathWithExtension = `/Rack Presets/${fileName}`;
        // }
        saveRackToLocalFileSystem(pathWithExtension, rackAsJSON);
        // if (fileBrowser !== undefined) {
        //   fileBrowser.saveFile(pathWithExtension);
        // let existingFile = fileBrowser.getItemByPath(path);
        // if (existingFile !== undefined) {
        //   existingFile.modified = new Date(Date.now());
        // }
        // else {
        //   let parent = fileBrowser.getItemByPath("/Rack Presets");
        //   if (parent !== undefined) {
        //     let item: FileBrowserItem = {
        //       name: `${model.name}`,
        //       type: "file",
        //       path: path,
        //       modified: new Date(Date.now())
        //     }
        //     fileBrowser.addItemsBelow(parent, [item]);
        //   }
        // }
        // }
    }
}
function saveRackToLocalFileSystem(path, rackAsJSON) {
    localFileSystem.saveFile(path, rackAsJSON);
    if (fileBrowser !== undefined) {
        fileBrowser.saveFile(path);
    }
}
function loadRack(name) {
    if (sceneDeviceController === undefined) {
        shouldLog(LogLevel.Error) && console.error("sceneDeviceController undefined, cannot update scene models from parameter lock addresses");
        return;
    }
    if (zoomDeviceController === undefined) {
        shouldLog(LogLevel.Error) && console.error("zoomDeviceController undefined, cannot update model from patch");
        return;
    }
    if (zoomDeviceView === undefined) {
        shouldLog(LogLevel.Error) && console.error("zoomDeviceView undefined, cannot update view from patch");
        return;
    }
    let json = localFileSystem.loadFile(`${name}`);
    if (json !== null) {
        rackModel.setFromJSON(json);
        zoomDeviceController.updateModelFromPatch();
        sceneDeviceController.updateSceneModelsFromParameterLockAddresses();
        sceneDeviceController.storeDefaultScene(); // wi-l set defaultScene to snapshot of rack
        sceneDeviceController.storeCurrentPatchScene(); // will set currentPatchScene to snapshot of rack
        // zoomDeviceView.updateView(); // fixme: should be updated using a listener in ZoomDeviceView instead, perhaps using channelInfoHasBeenUpdated / channelInfoChangedEvent
    }
}
function deleteFileFromLocalFileSystem(path) {
    localFileSystem.deleteFile(path);
    if (fileBrowser !== undefined) {
        fileBrowser.deleteFile(path);
    }
}
function updateFileBrowserWithLocalFileSystem() {
    function addItemsBelow(localFileSystemParent, fileBrowserParent) {
        for (let localFileSystemChild of localFileSystemParent.children ?? []) {
            let fileBrowserChild = {
                name: localFileSystemChild.name,
                type: localFileSystemChild.type,
                path: `${fileBrowserParent.path}/${localFileSystemChild.name}`,
                modified: typeof (localFileSystemChild.modified) === "string" ? new Date(localFileSystemChild.modified) : localFileSystemChild.modified
            };
            if (localFileSystemChild.type === "folder") {
                fileBrowserChild.children = [];
            }
            fileBrowserChild = fileBrowser?.addItemBelow(fileBrowserParent, fileBrowserChild);
            if (fileBrowserChild === undefined)
                continue; // unable to add item
            if (localFileSystemChild.type === "folder") {
                addItemsBelow(localFileSystemChild, fileBrowserChild);
            }
        }
    }
    if (fileBrowser !== undefined) {
        for (let localFileSystemChild of localFileSystem.root.children ?? []) {
            let fileBrowserParent = {
                name: localFileSystemChild.name,
                type: localFileSystemChild.type,
                path: `/${localFileSystemChild.name}`,
                modified: typeof (localFileSystemChild.modified) === "string" ? new Date(localFileSystemChild.modified) : localFileSystemChild.modified
            };
            fileBrowserParent = fileBrowser.addRootItem(fileBrowserParent);
            if (localFileSystemChild.type === "folder") {
                addItemsBelow(localFileSystemChild, fileBrowserParent);
            }
        }
    }
}
async function downoadDemoRackPresets(prefix = "") {
    if (prefix === "")
        prefix = ".";
    if (!prefix.endsWith("/"))
        prefix = prefix + "/";
    let demoRackPresets = ["/Rack Presets/Performance Effects for MS-70CDR+/Mind the Gap.rack",
        "/Rack Presets/Performance Effects for MS-70CDR+/Beateffector.rack",
        "/Rack Presets/Performance Effects for MS-70CDR/Filter Crush MS-70CDR.rack",
    ];
    for (let path of demoRackPresets) {
        let preset = localFileSystem.loadFile(path);
        if (preset !== null) {
            shouldLog(LogLevel.Info) && console.log(`Demo rack preset "${path}" already exists, download will overwrite local file`);
        }
        let remotePath = `${prefix}files${path}`;
        let json = await downloadJSONResource(remotePath);
        if (json === undefined) {
            shouldLog(LogLevel.Warning) && console.warn(`Failed to download demo rack preset "${path}"`);
        }
        else {
            shouldLog(LogLevel.Info) && console.log(`Downloaded demo rack preset "${path}"`);
            shouldLog(LogLevel.Info) && console.log(json);
            saveRackToLocalFileSystem(path, json);
        }
    }
}
function storeSettings() {
    let json = settingsModel.storeToJSON();
    localStorage.setItem("settings", json);
}
function updateFromSettings() {
    if (settingsModel.logging) {
        setLogLevel(LogLevel.All);
    }
    else {
        setLogLevel(LogLevel.Warning | LogLevel.Error);
    }
    if (settingsModel.performanceStatistics) {
        perfmonLabel.style.display = "block";
    }
    else {
        perfmonLabel.style.display = "none";
    }
    performanceMode = settingsModel.performanceMode;
    updatePerformanceMode();
    updateExperimentalPlayground();
}
function updateExperimentalPlayground() {
    if (rackDevices) {
        rackDevices.style.display = settingsModel.experimentalPlayground ? "block" : "none";
        rackModel.deviceIsOn = settingsModel.experimentalPlayground;
    }
    if (sidebar) {
        sidebar.style.display = settingsModel.experimentalPlayground ? "block" : "none";
    }
    if (midiMappers) {
        midiMappers.style.display = settingsModel.experimentalPlayground ? "block" : "none";
        virtualMIDIDeviceModel.deviceIsOn = settingsModel.experimentalPlayground;
    }
}
function updatePerformanceMode() {
    let zoomDevices = deviceManager.getDevices(ZoomDevices);
    for (let zoomDevice of zoomDevices) {
        zoomDevice.autoUpdateScreens = !performanceMode;
        zoomDevice.autoRequestProgramChange = !performanceMode;
    }
    if (zoomDeviceView !== undefined)
        zoomDeviceView.enabled = !performanceMode;
    midiDeviceListView.enabled = !performanceMode;
    if (zoomCCMapper !== null)
        zoomCCMapperView.enabled = !performanceMode;
    if (sceneDeviceHTMLView !== undefined)
        sceneDeviceHTMLView.enabled = !performanceMode;
}
async function start(reconnectTimeoutMilliseconds) {
    setStartupLoadingState("Loading", "Loading effect maps...");
    await downloadEffectMaps();
    if (window.zoomExplorerAPI === undefined) {
        setStartupLoadingState("Loading", "Loading local demo presets...");
        await downoadDemoRackPresets();
    }
    setStartupLoadingState("Loading", "Preparing effect selector...");
    zoomEffectSelector = new ZoomEffectSelector();
    let effectSelectors = document.getElementById("effectSelectors");
    effectSelectors.append(zoomEffectSelector.htmlElement);
    let effectLists = new Map();
    effectLists.set("MS-50G+", zoomEffectIDsMS50GPlus);
    effectLists.set("MS-60B+", zoomEffectIDsMS60BPlus);
    effectLists.set("MS-70CDR+", zoomEffectIDsMS70CDRPlus);
    effectLists.set("G2/G2X FOUR", zoomEffectIDsG2FOUR);
    effectLists.set("B2 FOUR", zoomEffectIDsB2FOUR);
    let zoomEffectIDsFullNamesMS200DPlusWithout1D = new Map();
    for (let [key, value] of zoomEffectIDsFullNamesMS200DPlus.entries())
        if (key < 0x1D000000)
            zoomEffectIDsFullNamesMS200DPlusWithout1D.set(key, value.toLowerCase().replace(/(^\w{1})|(\s+\w{1})/g, letter => letter.toUpperCase()));
    effectLists.set("MS-200D+", zoomEffectIDsFullNamesMS200DPlusWithout1D);
    effectLists.set("MS-50G", buildEffectIDList("MS-50G"));
    effectLists.set("MS-60B", buildEffectIDList("MS-60B"));
    effectLists.set("MS-70CDR", buildEffectIDList("MS-70CDR"));
    zoomEffectSelector.setHeading("Amps and Effects");
    zoomEffectSelector.setEffectList(effectLists);
    let zoomDevices = [];
    setStartupLoadingState("Loading", "Starting MIDI subsystem...");
    await waitForWebMIDI(reconnectTimeoutMilliseconds);
    if (midiMappers) {
        virtualMIDIDeviceController = new VirtualMIDIDeviceController(virtualMIDIDeviceModel, virtualMIDIDeviceView, midi, deviceManager);
        virtualMIDIDeviceView.updateDestinatons();
        virtualMIDIDeviceController.addIsMappingChangedListener(handleIsMappingChanged);
        virtualMIDIDeviceController.setMappingFilter((device) => !ZoomDevice.isDeviceType(device));
    }
    if (zoomCCMapper !== null) {
        zoomCCMapperModel.addOnOffChangedListener(handleZoomCCMapperOnOffChanged);
        zoomCCMapperModel.addInputDeviceChangedListener(handleZoomCCMapperInputDeviceChanged);
        zoomCCMapperModel.addOutputDeviceChannelChangedListener(handleZoomCCMapperOutputDeviceChannelChanged);
    }
    setStartupLoadingState("Loading", "Scanning MIDI devices...");
    await deviceManager.updateMIDIDeviceList();
    await waitForZoomDevices(reconnectTimeoutMilliseconds);
}
async function perftest() {
    await sleepForAWhile(4000);
    let ops = 100000;
    let kops = ops / 1000;
    let startTime = performance.now();
    let len = 0;
    let converted;
    let str = "\uD834\uDD60 x10";
    for (let i = 0; i < ops; i++) {
        converted = ZoomPatch.noteUTF16ToHtmlSlow(str);
        len += converted.length;
    }
    let endTime = performance.now();
    console.log(`noteUTF16ToHtmlSlow() msec/kops: ${(endTime - startTime) / kops} - Elapsed time: ${endTime - startTime} ms - len: ${len}`);
    startTime = performance.now();
    len = 0;
    for (let i = 0; i < ops; i++) {
        converted = str.replace(/\uD834\uDD62/g, "&#119138;").replace(/\uD834\uDD61/g, "&#119137;").replace(/\uD834\uDD60/g, "&#119136;").replace(/\uD834\uDD5F/g, "&#119135;").replace(/\uD834\uDD5E/g, "&#119134;");
        len += converted.length;
    }
    endTime = performance.now();
    console.log(`replace regexp        msec/kops: ${(endTime - startTime) / kops} - Elapsed time: ${endTime - startTime} ms - len: ${len}`);
    startTime = performance.now();
    len = 0;
    for (let i = 0; i < ops; i++) {
        converted = str;
        len += converted.length;
    }
    endTime = performance.now();
    console.log(`no conversion         msec/kops: ${(endTime - startTime) / kops} - Elapsed time: ${endTime - startTime} ms - len: ${len}`);
    startTime = performance.now();
    len = 0;
    for (let i = 0; i < ops; i++) {
        converted = str.replace("\uD834\uDD62", "&#119138;").replace("\uD834\uDD61", "&#119137;").replace("uD834\uDD60", "&#119136;").replace("uD834\uDD5F", "&#119135;").replace("uD834\uDD5E", "&#119134;");
        len += converted.length;
    }
    endTime = performance.now();
    console.log(`replace str           msec/kops: ${(endTime - startTime) / kops} - Elapsed time: ${endTime - startTime} ms - len: ${len}`);
    startTime = performance.now();
    len = 0;
    for (let i = 0; i < ops; i++) {
        converted = str.replaceAll("\uD834\uDD62", "&#119138;").replaceAll("\uD834\uDD61", "&#119137;").replaceAll("uD834\uDD60", "&#119136;").replaceAll("uD834\uDD5F", "&#119135;").replaceAll("uD834\uDD5E", "&#119134;");
        len += converted.length;
    }
    endTime = performance.now();
    console.log(`replaceAll str        msec/kops: ${(endTime - startTime) / kops} - Elapsed time: ${endTime - startTime} ms - len: ${len}`);
    startTime = performance.now();
    len = 0;
    for (let i = 0; i < ops; i++) {
        converted = ZoomPatch.noteUTF16ToHtml(str);
        len += converted.length;
    }
    endTime = performance.now();
    console.log(`optimized             msec/kops: ${(endTime - startTime) / kops} - Elapsed time: ${endTime - startTime} ms - len: ${len}`);
    startTime = performance.now();
    len = 0;
    for (let i = 0; i < ops; i++) {
        converted = ZoomPatch.noteUTF16ToHtml(str);
        if (ZoomPatch.isNoteHtml(converted))
            len++;
        len += converted.length;
    }
    endTime = performance.now();
    console.log(`optimized  +          msec/kops: ${(endTime - startTime) / kops} - Elapsed time: ${endTime - startTime} ms - len: ${len}`);
    startTime = performance.now();
    len = 0;
    for (let i = 0; i < ops; i++) {
        converted = ZoomPatch.noteUTF16ToHtml(str);
        if (converted.length != str.length)
            len++;
        len += converted.length;
    }
    endTime = performance.now();
    console.log(`optimized  +          msec/kops: ${(endTime - startTime) / kops} - Elapsed time: ${endTime - startTime} ms - len: ${len}`);
    startTime = performance.now();
    len = 0;
    for (let i = 0; i < ops; i++) {
        converted = ZoomPatch.noteUTF16ToHtmlSlow(str);
        len += converted.length;
    }
    endTime = performance.now();
    console.log(`noteUTF16ToHtmlSlow() msec/kops: ${(endTime - startTime) / kops} - Elapsed time: ${endTime - startTime} ms - len: ${len}`);
}
function createMIDIProxy() {
    if (window.zoomExplorerAPI !== undefined) {
        return new MIDIProxyForIPC(window.zoomExplorerAPI);
    }
    return new MIDIProxyForWebMIDIAPI();
}
// Startup code
let settingsModel = new SettingsModel();
let json = localStorage.getItem("settings");
if (json !== null) {
    settingsModel.loadFromJSON(json);
}
if (settingsModel.logging) {
    setLogLevel(LogLevel.All);
}
else {
    setLogLevel(LogLevel.Warning | LogLevel.Error);
}
let performanceMode = false;
//setLogLevel(LogLevel.Warning);
let previousEditScreenCollection = undefined;
let lastChangedEditScreenCollection = undefined;
let previousEditPatch = new ZoomPatch();
let confirmDialog = new ConfirmDialog("confirmDialog", "confirmLabel", "confirmButton", "cancelButton");
let textInputDialog = new TextInputDialog("textInputDialog", "textInputLabel", "textInput", "textInputConfirmButton");
let infoDialog = new InfoDialog("infoDialog", "infoLabel");
let progressDialog = new ProgressDialog();
let toplevelContentDiv = document.getElementById("content");
let mainLayout = document.getElementById("mainLayout");
function createStartupLoadingOverlay() {
    let overlay = document.getElementById("startupLoadingOverlay");
    if (!(overlay instanceof HTMLDivElement)) {
        overlay = document.createElement("div");
        overlay.id = "startupLoadingOverlay";
        overlay.classList.add("visible");
        overlay.innerHTML = `
      <div class="startupLoadingCard">
        <div class="startupLoadingSpinner" aria-hidden="true"></div>
        <div class="startupLoadingTitle">Loading</div>
        <div class="startupLoadingDetail">Starting Zoom Explorer...</div>
      </div>
    `;
        document.body.appendChild(overlay);
    }
    else if (overlay.querySelector(".startupLoadingCard") === null) {
        overlay.innerHTML = `
      <div class="startupLoadingCard">
        <div class="startupLoadingSpinner" aria-hidden="true"></div>
        <div class="startupLoadingTitle">Loading</div>
        <div class="startupLoadingDetail">Starting Zoom Explorer...</div>
      </div>
    `;
    }
    let titleElement = overlay.querySelector(".startupLoadingTitle");
    let detailElement = overlay.querySelector(".startupLoadingDetail");
    return {
        overlay,
        title: titleElement instanceof HTMLDivElement ? titleElement : undefined,
        detail: detailElement instanceof HTMLDivElement ? detailElement : undefined
    };
}
let startupLoadingOverlay = createStartupLoadingOverlay();
function setStartupLoadingState(title, detail = "") {
    document.body.classList.add("startup-pending");
    startupLoadingOverlay.overlay.classList.add("visible");
    if (startupLoadingOverlay.title !== undefined)
        startupLoadingOverlay.title.textContent = title;
    if (startupLoadingOverlay.detail !== undefined)
        startupLoadingOverlay.detail.textContent = detail;
}
function hideStartupLoadingOverlay() {
    startupLoadingOverlay.overlay.classList.remove("visible");
    document.body.classList.remove("startup-pending");
}
if (toplevelContentDiv !== null)
    toplevelContentDiv.style.display = "none";
setStartupLoadingState("Loading", "Starting Zoom Explorer...");
// let knob = new Knob(25, 0, 127, (valueString: string) => Number.parseFloat(valueString), (rawValue: number) => rawValue.toFixed(0));
// let knobView = new KnobView(knob, true);
// toplevelContentDiv.appendChild(knobView.element); // should we inherit from HTMLElement/Div instead ?
// let testKnob = new Knob(25, 0, 4000, (valueString: string) => Number.parseFloat(valueString), (rawValue: number) => rawValue.toFixed(0));
// let testKnobView = new KnobView(testKnob, true);
// toplevelContentDiv.appendChild(testKnobView.element);
let rackDevices = document.getElementById("rackDevices");
let rackModel = new RackDeviceModel();
rackModel.name = "New Rack";
let rackView = new RackDeviceHTMLView(rackModel, "#FFFFFF", true, true, true);
rackView.addSaveButtonClickedListener((view, shiftKey) => {
    saveRack(view.model, shiftKey);
});
if (rackDevices)
    rackDevices.appendChild(rackView.viewElement);
let midiMappers = document.getElementById("midiMappers");
let virtualMIDIDeviceModel = new VirtualMIDIDeviceModel();
let virtualMIDIDeviceView = new VirtualMIDIDeviceHTMLView(virtualMIDIDeviceModel, true);
let virtualMIDIDeviceController;
if (midiMappers)
    midiMappers.appendChild(virtualMIDIDeviceView.viewElement);
virtualMIDIDeviceModel.addStateChangedListener((device, channel, stateNumber, stateValue, timeStamp) => {
    shouldLog(LogLevel.Info) && console.log(`State changed in virtual device for channel ${channel}, stateNumber ${stateNumber}, stateValue ${stateValue}`);
    sceneDeviceModel.setState(channel, stateNumber, stateValue, timeStamp);
});
virtualMIDIDeviceModel.addParameterChangedListener((device, channel, parameterNumber, parameterValue) => {
    shouldLog(LogLevel.Info) && console.log(`Parameter changed in virtual device for channel ${channel}, parameterNumber ${parameterNumber}, parameterValue ${parameterValue}`);
    sceneDeviceModel.setParameter(channel, parameterNumber, parameterValue);
});
// let zoomDeviceModel = new ZoomDeviceModel();
// zoomDeviceModel.setSlotNames(["SpringRev", "LoopRoll"]);
// let zoomDeviceView = new ZoomDeviceHTMLView(zoomDeviceModel, "Zoom MS-50G+");
// rackView.addDevice(zoomDeviceView);
let zoomDeviceController = undefined;
let zoomDeviceView = undefined;
let sceneDeviceController = undefined;
let sceneDeviceHTMLView = undefined;
let sceneDeviceMIDIView = undefined;
let sceneDeviceModel;
let midi = createMIDIProxy();
let deviceManager = new MIDIDeviceManager(midi);
deviceManager.addFactoryFunction(ZoomDevices, (device) => ZoomDevice.isDeviceType(device), // only accept Zoom devices
(midi, midiDevice) => new ZoomDevice(midi, midiDevice));
deviceManager.addFactoryFunction(LCXLDevices, (device) => LCXLDevice.isDeviceType(device), // only accept LCXL devices
(midi, midiDevice) => new LCXLDevice(midi, midiDevice));
deviceManager.addFactoryFunction(MIDIDevices, (device) => MIDIDevice.isDeviceType(device), // accept any device
(midi, midiDevice) => new MIDIDevice(midi, midiDevice));
deviceManager.addDisconnectListener(handleDisconnect);
deviceManager.addConnectListener(handleConnect);
let midiDeviceList = document.getElementById("midiDeviceList");
let midiDeviceListModel = new MIDIDeviceListModel();
updateMIDIDeviceListFromLocalStorage();
midiDeviceListModel.addShowActivityChangedListener(showActivityChanged);
midiDeviceListModel.addDevicePropertiesChangedListener(devicePropertiesChanged);
midiDeviceListModel.addDeviceOnChangedListener(deviceOnChanged);
midiDeviceListModel.addSelectedDeviceChangedListener(async (model, deviceName) => selectedDeviceChanged(model, deviceName));
let midiDeviceListView = new MIDIDeviceListHTMLView(midiDeviceListModel);
midiDeviceList.appendChild(midiDeviceListView.viewElement);
let midiDeviceListController = new MIDIDeviceListController(midiDeviceListModel, midiDeviceListView, midi, deviceManager);
let zoomEffectSelector = undefined;
let zoomPatchConverter = new ZoomPatchConverter();
let currentZoomPatchToConvert = undefined;
let mapForMSOG = undefined;
let mapForMS50GPlusAndMS70CDRPlus = undefined;
let zoomCCMapper = document.getElementById("zoomCCMapper");
let zoomCCMapperModel;
let zoomCCMapperView;
let zoomCCMapperController;
if (zoomCCMapper !== null) {
    zoomCCMapperModel = new ZoomCCMapperModel();
    updateZoomCCMapperFromLocalStorage();
    zoomCCMapperView = new ZoomCCMapperHTMLView(zoomCCMapperModel);
    zoomCCMapper.appendChild(zoomCCMapperView.viewElement);
    zoomCCMapperController = new ZoomCCMapperController(zoomCCMapperModel, zoomCCMapperView, deviceManager);
    if (performanceMode)
        zoomCCMapperView.enabled = false;
}
let currentZoomDevice = undefined;
let currentLCXLDevice = undefined;
let currentZoomPatch = undefined;
let initializedZoomDevices = new Set();
// Maps from device name to UndoRedoManager
let undoRedoManagers = new Map();
let patchEditorModel = new ZoomPatchEditorModel(); // currently only used for on/off state
let patchEditor = new ZoomPatchEditor("editPatchTableID");
let patchEditors = document.getElementById("patchEditors");
let loadedPatchEditor = new ZoomPatchEditor();
patchEditors.insertBefore(loadedPatchEditor.htmlElement, patchEditors.firstChild);
loadedPatchEditor.hide();
updatePatchEditorFromLocalStorage();
let patchLists = document.getElementById("patchLists");
let patchList = new ZoomPatchList(progressDialog, confirmDialog);
patchList.addCurrentMemorySlotChangedListener((patchList, previousMemorySlot, currentMemorySlot) => {
    currentZoomPatchToConvert = undefined;
    loadedPatchEditor.hide();
    updatePatchSelectorSelection(currentMemorySlot);
    if (patchList.zoomDevice !== undefined) {
        currentZoomPatch = patchList.zoomDevice.patchList[currentMemorySlot].clone();
        // MSOG pedals doesn't call handleScreenChanged, so we need to update patch name here
        // This means that for MS Plus pedals, we update screens twice
        getScreenCollectionAndUpdateEditPatchTable(patchList.zoomDevice);
    }
    shouldLog(LogLevel.Info) && console.log(`Current memory slot changed: ${currentMemorySlot}`);
});
patchList.addCurrentPatchUpdatedListener((patchList) => {
    if (patchList.zoomDevice !== undefined) {
        currentZoomPatch = patchList.zoomDevice.patchList[patchList.currentlySelectedMemorySlot].clone();
        getScreenCollectionAndUpdateEditPatchTable(patchList.zoomDevice);
    }
    shouldLog(LogLevel.Info) && console.log(`Patches restored`);
});
patchLists.appendChild(patchList.viewElement);
initializeModernEditorLayout();
const mobileUILayoutQuery = window.matchMedia("(orientation: portrait) and (max-width: 430px)");
function applyAdaptiveUILayoutMode() {
    document.body.classList.toggle("mobile-ui-mode", mobileUILayoutQuery.matches);
}
applyAdaptiveUILayoutMode();
if (mobileUILayoutQuery.addEventListener !== undefined)
    mobileUILayoutQuery.addEventListener("change", applyAdaptiveUILayoutMode);
window.addEventListener("resize", applyAdaptiveUILayoutMode);
window.addEventListener("orientationchange", applyAdaptiveUILayoutMode);
window.addEventListener("resize", scheduleViewportFitScale);
window.addEventListener("orientationchange", scheduleViewportFitScale);
if (patchEditors !== null) {
    let fitObserver = new MutationObserver(() => scheduleViewportFitScale());
    fitObserver.observe(patchEditors, {
        childList: true,
        subtree: true,
        attributes: true,
        characterData: true,
    });
}
scheduleViewportFitScale();
let patchIsDirty = false;
const PATCH_STATUS_HIDE_DELAY_MS = 7000;
let patchStatusHideTimer: ReturnType<typeof setTimeout> | undefined = undefined;
let muteLCXLForEdit = true;
// Initialize the file browser after the page loads
let fileBrowser;
const fileBrowserContainer = document.getElementById("fileBrowserContainer");
if (fileBrowserContainer) {
    fileBrowser = new FileBrowser();
    fileBrowserContainer.appendChild(fileBrowser.viewElement);
    initializeFileBrowser(fileBrowser);
}
let localFileSystem = new LocalFileSystem("drive");
updateFileBrowserWithLocalFileSystem();
// Initialize sidebar toggle functionality
const sidebarToggle = document.getElementById("sidebarToggle");
const sidebar = document.getElementById("sidebar");
if (sidebarToggle && sidebar) {
    // Start with sidebar collapsed
    sidebar.classList.add("collapsed");
    const toggleSidebar = () => {
        sidebar.classList.toggle("collapsed");
        // Update the toggle button icon
        const icon = sidebarToggle.querySelector("span");
        if (icon) {
            if (sidebar.classList.contains("collapsed")) {
                // rotation is handled in sidebar-toggle in file-browser.css
                sidebarToggle.title = "Expand sidebar (Ctrl+B)";
            }
            else {
                sidebarToggle.title = "Minimize sidebar (Ctrl+B)";
            }
        }
    };
    sidebarToggle.addEventListener("click", toggleSidebar);
    // Add keyboard shortcut (Ctrl+B) for toggling sidebar
    document.addEventListener("keydown", (e) => {
        if (e.ctrlKey && e.key === "b") {
            e.preventDefault();
            toggleSidebar();
        }
    });
}
enableCollapsibleElements();
let project = new Project();
let reconnectTimeoutMilliseconds = 2000;
let perfmonLabel = document.getElementById("perfmonLabel");
let midiSendPerf = perfmon.getCounterInfo(MIDI_SEND);
let midiReceiveToSendPerf = perfmon.getCounterInfo(MIDI_RECEIVE_TO_SEND);
let midiTimestampToReceivePerf = perfmon.getCounterInfo(MIDI_TIMESTAMP_TO_RECEIVE);
if (perfmonLabel !== null) {
    setInterval(() => {
        if (midiSendPerf.periodCount === 0)
            return;
        perfmonLabel.textContent = `Throughput: ${midiSendPerf.periodAverage.toFixed(1)} ms/msg ` +
            `(max: ${midiSendPerf.periodMax.toFixed(1)}). ` +
            `Send: ${midiSendPerf.insideAverage.toFixed(1)} ms/msg ` +
            `(max: ${midiSendPerf.insideMax.toFixed(1)}). ` +
            `Timestamp to receive: ${midiTimestampToReceivePerf.insideAverage.toFixed(2)} ms ` +
            `(max: ${midiTimestampToReceivePerf.insideMax.toFixed(2)}). ` +
            `Receive to send: ${midiReceiveToSendPerf.insideAverage.toFixed(2)} ms ` +
            `(max: ${midiReceiveToSendPerf.insideMax.toFixed(2)}).`;
        perfmon.resetCounter(MIDI_SEND);
        perfmon.resetCounter(MIDI_RECEIVE_TO_SEND);
        perfmon.resetCounter(MIDI_TIMESTAMP_TO_RECEIVE);
    }, 1000);
}
let resolution = perfmon.resolution();
if (resolution > 0.08)
    shouldLog(LogLevel.Warning) && console.warn(`Performance.now() precision: ${resolution.toFixed(5)}`);
else {
    shouldLog(LogLevel.Info) && console.log(`Performance.now() precision: ${resolution.toFixed(5)}`);
}
// perftest();
let settingsView = new SettingsHTMLView(settingsModel);
let settingsContainer = document.getElementById("settingsContainer");
settingsContainer.appendChild(settingsView.viewElement);
updateFromSettings();
midiDeviceListView.enabled = false; // will be enabled in waitForZoomDevices(), if not in performance mode
settingsModel.addPropertyChangedListener("performanceMode", (propertyName) => {
    if (settingsModel.performanceMode) {
        settingsModel.logging = false;
        settingsModel.performanceStatistics = false;
    }
    else {
        storeSettings();
        updateFromSettings();
    }
});
settingsModel.addPropertyChangedListener("logging", (propertyName) => {
    storeSettings();
    updateFromSettings();
});
settingsModel.addPropertyChangedListener("performanceStatistics", (propertyName) => {
    storeSettings();
    updateFromSettings();
});
settingsModel.addPropertyChangedListener("experimentalPlayground", (propertyName) => {
    storeSettings();
    updateFromSettings();
});
start(reconnectTimeoutMilliseconds).catch((error) => {
    let errorString = getExceptionErrorString(error);
    console.error(`Fatal startup error in Zoom Explorer: ${errorString}`);
    if (toplevelContentDiv !== null)
        toplevelContentDiv.style.display = "none";
    setStartupLoadingState("Startup failed", errorString);
    infoDialog.show(`Zoom Explorer failed to start MIDI detection. ${errorString}`);
});
// File Browser Demo
function initializeFileBrowser(fileBrowser) {
    // Create some sample data to demonstrate the file browser
    const sampleFileSystem = [
        {
            name: "Rack Presets",
            type: "folder",
            path: "/Rack Presets",
            expanded: false,
            children: [
                {
                    name: "Performance Effects for MS-70CDR+",
                    type: "folder",
                    path: "/Rack Presets/Performance Effects for MS-70CDR+",
                    expanded: false,
                    children: [],
                },
                {
                    name: "Performance Effects for MS-70CDR",
                    type: "folder",
                    path: "/Rack Presets/Performance Effects for MS-70CDR",
                    expanded: false,
                    children: [],
                },
                {
                    name: "Local Playground",
                    type: "folder",
                    path: "/Rack Presets/Local Playground",
                    expanded: false,
                    children: [],
                }
            ]
        }
        // {
        //   name: "Projects",
        //   type: "folder", 
        //   path: "/Projects",
        //   expanded: false,
        //   children: [
        //     {
        //       name: "BerlinSchool",
        //       type: "folder",
        //       path: "/Projects/BerlinSchool",
        //       expanded: false,
        //       children: [
        //         {
        //           name: "sequence1.mid",
        //           type: "file",
        //           path: "/Projects/BerlinSchool/sequence1.mid",
        //           modified: new Date(2024, 10, 28, 20, 12)
        //         }
        //       ]
        //     }
        //   ]
        // },
        // {
        //   name: "Patchlist",
        //   type: "folder",
        //   path: "/Patchlist",
        //   expanded: false,
        //   children: [
        //   ]
        // }
    ];
    fileBrowser.setRootItems(sampleFileSystem);
    // Add event listeners
    fileBrowser.addFileSelectedListener((item) => {
        shouldLog(LogLevel.Info) && console.log(`File selected: ${item.name} (${item.path})`);
    });
    fileBrowser.addFileDoubleClickListener((item) => {
        shouldLog(LogLevel.Info) && console.log(`File double-clicked: ${item.name} (${item.path})`);
        if (item.type === 'file') {
            shouldLog(LogLevel.Info) && console.log(`Opening file: "${item.name}", path: "${item.path}"`);
            if (item.path.endsWith(".rack")) {
                loadRack(item.path);
            }
        }
    });
    fileBrowser.addFolderExpandListener((item, expanded) => {
        shouldLog(LogLevel.Info) && console.log(`Folder ${item.name} ${expanded ? 'expanded' : 'collapsed'}`);
    });
    fileBrowser.addFileDropListener((fileName, fileBytes, folder) => {
        console.log(`File ${fileName} dropped on folder ${folder.path}`);
        if (fileBytes === undefined) {
            shouldLog(LogLevel.Error) && console.error(`Unable to read file ${fileName}`);
            return;
        }
        if (fileName.endsWith(".rack") && folder.path.startsWith("/Rack Presets")) {
            let rackAsJSONString = bytesWithCharactersToString(fileBytes);
            if (rackAsJSONString.length === 0) {
                shouldLog(LogLevel.Error) && console.error(`File ${fileName} is not a valid rack file`);
                return;
            }
            let rackAsJSON = JSON.parse(rackAsJSONString);
            let pathWithExtension = `${folder.path}/${fileName}`;
            saveRackToLocalFileSystem(pathWithExtension, rackAsJSON);
            console.log(rackAsJSON);
        }
    });
    fileBrowser.addFileDeleteListener((item) => {
        shouldLog(LogLevel.Info) && console.log(`Deleting file: "${item.name}", path: "${item.path}"`);
        deleteFileFromLocalFileSystem(item.path);
    });
    shouldLog(LogLevel.Info) && console.log("File browser initialized with sample data");
}
// (c) 2024-2026 by Thomas Hammer, h@mmer.no

