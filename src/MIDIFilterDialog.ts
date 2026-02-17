// @ts-nocheck
import { shouldLog, LogLevel } from "./Logger.js";
export class MIDIFilterDialog {
    dialog;
    confirmEvent;
    constructor(dialogID) {
        this.dialog = document.getElementById(dialogID);
        let button = this.dialog.querySelector("button");
        button.addEventListener("click", (event) => {
            event.preventDefault();
            this.dialog.close("ok");
            let filter = [];
            let checkBoxes = this.dialog.querySelectorAll("input[type=checkbox]");
            for (let i = 0; i < checkBoxes.length; i++) {
                let checkBox = checkBoxes[i];
                filter.push(checkBox.checked);
            }
            this.confirmEvent(filter);
        });
        this.confirmEvent = (result) => {
            shouldLog(LogLevel.Info) && console.log("Confirm event result: " + result);
        };
    }
    show() {
        this.dialog.showModal();
    }
    close() {
        this.dialog.close();
    }
    async getFilterSettings(filter) {
        return new Promise((resolve, reject) => {
            let checkBoxes = this.dialog.querySelectorAll("input[type=checkbox]");
            for (let i = 0; i < checkBoxes.length; i++) {
                let checkBox = checkBoxes[i];
                checkBox.checked = filter[i];
            }
            this.confirmEvent = async (result) => {
                resolve(result);
            };
            this.dialog.showModal();
        });
    }
}

