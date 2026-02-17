// @ts-nocheck
import { shouldLog, LogLevel } from "./Logger.js";
import { isSysex } from "./miditools.js";
import { bytesToHexString, compareBuffers, hexStringToUint8Array } from "./tools.js";
import { ZoomDevice } from "./ZoomDevice.js";
import { ZoomPatch } from "./ZoomPatch.js";
export async function moveFileToDirectory(sourceDirHandle, file, targetDirHandle, newFileName = "") {
    if (newFileName.length === 0)
        newFileName = file.name;
    let newFileHandle = await targetDirHandle.getFileHandle(newFileName, { create: true });
    let writableStream = await newFileHandle.createWritable();
    await writableStream.write(file);
    await writableStream.close();
    await sourceDirHandle.removeEntry(file.name);
}
export function getFormattedDate(lastModified) {
    let date = new Date(lastModified);
    let pad = (n) => n.toString().padStart(2, '0');
    let formattedDate = date.getFullYear().toString() +
        pad(date.getMonth() + 1) +
        pad(date.getDate()) + " " +
        pad(date.getHours()) +
        pad(date.getMinutes()) +
        pad(date.getSeconds());
    return formattedDate;
}
export function patchBuffersAreEqual(patch, otherBuffer, zoomDevice) {
    let patchOnPedalIsTheSameAsOnDisk = false;
    let patchData = undefined;
    if (patch.ptcfChunk !== null && patch.ptcfChunk.length > 0) {
        patchData = patch.ptcfChunk;
    }
    else if (patch.msogDataBuffer !== null && patch.msogDataBuffer.length > 0) {
        let sysex = zoomDevice.getSysexForCurrentPatch(patch);
        if (sysex === undefined) {
            shouldLog(LogLevel.Warning) && console.warn(`getSysexForCurrentPatch() failed for patch "${patch.name}"`);
        }
        else {
            patchData = new TextEncoder().encode(bytesToHexString(sysex).toLowerCase());
        }
    }
    else {
        shouldLog(LogLevel.Warning) && console.warn(`Patch "${patch.name}" is not in PTCF or MSOG format.`);
    }
    if (patchData !== undefined) {
        patchOnPedalIsTheSameAsOnDisk = compareBuffers(otherBuffer, patchData);
    }
    return patchOnPedalIsTheSameAsOnDisk;
}
export function getPatchFromSysex(sysexString, zoomDevice, filename = "") {
    let patch = undefined;
    let convertedData = hexStringToUint8Array(sysexString);
    let sourceString = filename.length > 0 ? `file "${filename}"` : "buffer";
    if (!isSysex(convertedData)) {
        shouldLog(LogLevel.Error) && console.error(`Unknown file format in ${sourceString}`);
        return undefined;
    }
    if (convertedData[1] != 0x52) {
        shouldLog(LogLevel.Error) && console.error(`Sysex ${sourceString} is not for a Zoom device, device ID: ${bytesToHexString([convertedData[1]])}`);
        return undefined;
    }
    if (convertedData.length < 5 || convertedData[3] != zoomDevice.deviceInfo.familyCode[0]) {
        shouldLog(LogLevel.Info) && console.log(`Sysex ${sourceString} is for Zoom device ID ${bytesToHexString([convertedData[3]])}, ` +
            `but attached device has device ID: ${bytesToHexString([zoomDevice.deviceInfo.familyCode[0]])}. Attempting to load patch anyway.`);
    }
    let [patchData, program, bank] = ZoomDevice.sysexToPatchData(convertedData);
    if (patchData !== undefined) {
        patch = ZoomPatch.fromPatchData(patchData);
    }
    return patch;
}

