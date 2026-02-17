// @ts-nocheck
import { shouldLog, LogLevel } from "./Logger.js";
export class ConfirmDialog {
    confirmDialog;
    confirmLabel;
    confirmButton;
    cancelButton;
    confirmEvent;
    constructor(dialogID, labelID, buttonID, cancelButtonID) {
        this.confirmDialog = document.getElementById(dialogID);
        this.confirmLabel = document.getElementById(labelID);
        this.confirmButton = document.getElementById(buttonID);
        this.cancelButton = document.getElementById(cancelButtonID);
        // Clear old event listeners
        // let clonedButton = this.confirmButton.cloneNode(true) as HTMLButtonElement;
        // this.confirmButton.parentNode?.replaceChild(clonedButton, this.confirmButton);
        // this.confirmButton = clonedButton;
        // let clonedDialog = this.confirmDialog.cloneNode(true) as HTMLDialogElement;
        // this.confirmDialog.parentNode?.replaceChild(clonedDialog, this.confirmDialog);
        // this.confirmDialog = clonedDialog;
        this.confirmButton.addEventListener("click", (event) => {
            event.preventDefault();
            this.confirmDialog.close("ok");
            this.confirmEvent(true);
        });
        this.confirmEvent = (result) => {
            shouldLog(LogLevel.Info) && console.log("Confirm event result: " + result);
        };
        this.confirmDialog.addEventListener("close", (e) => {
            this.confirmEvent(false);
        });
    }
    async getUserConfirmation(text) {
        return new Promise((resolve, reject) => {
            this.cancelButton.hidden = false;
            this.confirmButton.textContent = "Yes";
            this.confirmLabel.innerHTML = text;
            this.confirmEvent = async (result) => {
                resolve(result);
            };
            this.confirmDialog.showModal();
        });
    }
    async showInfo(text) {
        return new Promise((resolve, reject) => {
            this.cancelButton.hidden = true;
            this.confirmButton.textContent = "OK";
            this.confirmLabel.innerHTML = text;
            this.confirmEvent = async (result) => {
                resolve(result);
            };
            this.confirmDialog.showModal();
        });
    }
}

