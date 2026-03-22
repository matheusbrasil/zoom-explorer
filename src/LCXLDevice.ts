// @ts-nocheck
import { MIDIDevice } from "./MIDIDevice.js";
import { UNUSED_CC, UNUSED_NOTE } from "./VirtualMIDIDeviceModel.js";
import { LogLevel, shouldLog } from "./Logger.js";
import { hexStringToUint8Array, partialArrayMatch } from "./tools.js";
export class LCXLDevice extends MIDIDevice {
    static _noteToIndex = new Map([
        [41, 24],
        [42, 25],
        [43, 26],
        [44, 27],
        [57, 28],
        [58, 29],
        [59, 30],
        [60, 31],
        [73, 32],
        [74, 33],
        [75, 34],
        [76, 35],
        [89, 36],
        [90, 37],
        [91, 38],
        [92, 39],
        [105, 40], // Device
        [106, 41], // Mute
        [107, 42], // Solo
        [108, 43], // Record Arm
    ]);
    static NOTE_DEVICE = 105;
    static NOTE_MUTE = 106;
    static NOTE_SOLO = 107;
    static NOTE_RECORD = 108;
    static _ccToTndex = new Map([
        [13, 0],
        [14, 1],
        [15, 2],
        [16, 3],
        [17, 4],
        [18, 5],
        [19, 6],
        [20, 7],
        [29, 8],
        [30, 9],
        [31, 10],
        [32, 11],
        [33, 12],
        [34, 13],
        [35, 14],
        [36, 15],
        [49, 16],
        [50, 17],
        [51, 18],
        [52, 19],
        [53, 20],
        [54, 21],
        [55, 22],
        [56, 23],
        [104, 44], // Up
        [105, 45], // Down
        [106, 46], // Left
        [107, 47], // Right
    ]);
    static CC_UP = 104;
    static CC_DOWN = 105;
    static CC_LEFT = 106;
    static CC_RIGHT = 107;
    static AMBER_FULL = [3, 1]; // r = 3, g = 1
    static AMBER_HALF = [3, 2]; // r = 3, g = 2
    static AMBER_LOW = [2, 1]; // r = 2, g = 1
    static YELLOW_FULL = [3, 3]; // r = 3, g = 3
    static YELLOW_HALF = [2, 2]; // r = 2, g = 2
    static YELLOW_LOW = [1, 1]; // r = 1, g = 1
    static GREEN_FULL = [0, 3]; // r = 0, g = 3
    static GREEN_HALF = [0, 2]; // r = 0, g = 2
    static GREEN_LOW = [0, 1]; // r = 0, g = 1
    static RED_FULL = [3, 0]; // r = 3, g = 0
    static RED_HALF = [2, 0]; // r = 2, g = 0
    static RED_LOW = [1, 0]; // r = 1, g = 0
    static isDeviceType(device) {
        return partialArrayMatch(device.identityResponse, hexStringToUint8Array("00 20 29 61 00 00 00"), 5);
    }
    static getIndexFromNoteOrCC(noteNumber, cc) {
        // for the LCXL factory templates
        let index;
        if (noteNumber !== UNUSED_NOTE) {
            index = LCXLDevice._noteToIndex.get(noteNumber);
            if (index !== undefined)
                return index;
            shouldLog(LogLevel.Warning) && console.warn(`LCXLDevice.getIndexFromNoteOrCC() no mapping for note number ${noteNumber}`);
            return -1;
        }
        if (cc === undefined) {
            shouldLog(LogLevel.Warning) && console.warn(`LCXLDevice.getIndexFromNoteOrCC() no mapping for note number ${noteNumber} (UNUSED_NOTE)`);
            return -1;
        }
        if (cc === UNUSED_CC) {
            shouldLog(LogLevel.Warning) && console.warn(`LCXLDevice.getIndexFromNoteOrCC() no mapping for CC number ${cc} (UNUSED_CC)`);
            return -1;
        }
        index = LCXLDevice._ccToTndex.get(cc);
        if (index !== undefined)
            return index;
        shouldLog(LogLevel.Warning) && console.warn(`LCXLDevice.getIndexFromNoteOrCC() no mapping for CC number ${cc}`);
        return -1;
    }
    static getIndexFromCC(cc) {
        // for the LCXL factory templates
        let index = LCXLDevice._ccToTndex.get(cc);
        if (index === undefined) {
            shouldLog(LogLevel.Warning) && console.warn(`LCXLDevice.getIndexFromCC() no mapping for CC ${cc}`);
            return -1;
        }
        return index;
    }
    static indexIsMonochrome(index) {
        return index >= 40 && index <= 47;
    }
    /**
     * Sets the color of a LED on the LCXL
     * @param device midi device handle
     * @param template 0-7 for user template 0-7, 8-15 for factory template 0-7
     * @param index LED index number
     * @param red 0-3
     * @param green 0-3
     * @see https://fael-downloads-prod.focusrite.com/customer/prod/s3fs-public/downloads/launch-control-xl-programmers-reference-guide.pdfå+p'
     * @example LED indexes:
     * 00-07h (0-7) : Top row of knobs, left to right
     * 08-0Fh (8-15) : Middle row of knobs, left to right
     * 10-17h (16-23) : Bottom row of knobs, left to right
     * 18-1Fh (24-31) : Top row of ‘channel’ buttons, left to right
     * 20-27h (32-39) : Bottom row of ‘channel’ buttons, left to right
     * 28-2Bh (40-43) : Buttons Device, Mute, Solo, Record Arm
     * 2C-2Fh (44-47) : Buttons Up, Down, Left, Right
     */
    sendColor(template, index, red, green) {
        let value = 12 + red + (green << 4);
        this._midi.send(this.deviceInfo.outputID, new Uint8Array([0xF0, 0x00, 0x20, 0x29, 0x02, 0x11, 0x78, template, index, value, 0xF7]));
    }
    clearAllColors(template) {
        template = template & 0x0f;
        this._midi.send(this.deviceInfo.outputID, new Uint8Array([0xB0 + template, 0x00, 0x00]));
    }
}

