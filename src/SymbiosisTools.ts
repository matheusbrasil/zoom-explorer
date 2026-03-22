import { LogLevel, shouldLog } from "./Logger.js";
import { isSysex } from "./miditools.js";
import { bytesToHexString, compareBuffers, hexStringToUint8Array } from "./tools.js";
import { ZoomDevice } from "./ZoomDevice.js";
import { ZoomPatch } from "./ZoomPatch.js";

export async function moveFileToDirectory(
  sourceDirHandle: FileSystemDirectoryHandle,
  file: File,
  targetDirHandle: FileSystemDirectoryHandle,
  newFileName = "",
): Promise<void> {
  const targetFileName = newFileName.length === 0 ? file.name : newFileName;
  const newFileHandle = await targetDirHandle.getFileHandle(targetFileName, { create: true });
  const writableStream = await newFileHandle.createWritable();
  await writableStream.write(file);
  await writableStream.close();
  await sourceDirHandle.removeEntry(file.name);
}

export function getFormattedDate(lastModified: number): string {
  const date = new Date(lastModified);
  const pad = (value: number): string => value.toString().padStart(2, "0");

  return (
    date.getFullYear().toString() +
    pad(date.getMonth() + 1) +
    pad(date.getDate()) +
    " " +
    pad(date.getHours()) +
    pad(date.getMinutes()) +
    pad(date.getSeconds())
  );
}

export function patchBuffersAreEqual(patch: ZoomPatch, otherBuffer: Uint8Array, zoomDevice: ZoomDevice): boolean {
  let patchData: Uint8Array | undefined;

  if (patch.ptcfChunk !== null && patch.ptcfChunk.length > 0) {
    patchData = patch.ptcfChunk;
  } else if (patch.msogDataBuffer !== null && patch.msogDataBuffer.length > 0) {
    const sysex = zoomDevice.getSysexForCurrentPatch(patch);
    if (sysex === undefined) {
      shouldLog(LogLevel.Warning) && console.warn(`getSysexForCurrentPatch() failed for patch "${patch.name}"`);
    } else {
      patchData = new TextEncoder().encode(bytesToHexString(sysex).toLowerCase());
    }
  } else {
    shouldLog(LogLevel.Warning) && console.warn(`Patch "${patch.name}" is not in PTCF or MSOG format.`);
  }

  return patchData !== undefined && compareBuffers(otherBuffer, patchData);
}

export function getPatchFromSysex(sysexString: string, zoomDevice: ZoomDevice, filename = ""): ZoomPatch | undefined {
  const convertedData = hexStringToUint8Array(sysexString);
  const sourceString = filename.length > 0 ? `file "${filename}"` : "buffer";

  if (!isSysex(convertedData)) {
    shouldLog(LogLevel.Error) && console.error(`Unknown file format in ${sourceString}`);
    return undefined;
  }

  if (convertedData[1] !== 0x52) {
    shouldLog(LogLevel.Error) &&
      console.error(`Sysex ${sourceString} is not for a Zoom device, device ID: ${bytesToHexString([convertedData[1]])}`);
    return undefined;
  }

  if (convertedData.length < 5 || convertedData[3] !== zoomDevice.deviceInfo.familyCode[0]) {
    shouldLog(LogLevel.Info) &&
      console.log(
        `Sysex ${sourceString} is for Zoom device ID ${bytesToHexString([convertedData[3]])}, ` +
          `but attached device has device ID: ${bytesToHexString([zoomDevice.deviceInfo.familyCode[0]])}. Attempting to load patch anyway.`,
      );
  }

  const [patchData] = ZoomDevice.sysexToPatchData(convertedData);
  return patchData !== undefined ? ZoomPatch.fromPatchData(patchData) : undefined;
}
