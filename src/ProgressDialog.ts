// @ts-nocheck
import { LogLevel, shouldLog } from "./Logger.js";
export class ProgressDialog {
    dialog;
    label;
    progressBar;
    progressBarText;
    summaryLabel;
    confirmButton;
    confirmEvent;
    userCancelled = false;
    constructor(dialogID = "progressDialog", progressLabelID = "progressDialogLabel", progressBarID = "progressDialogBar", progressBarTextID = "progressDialogBarText", progressSummaryLabelID = "progressDialogSummaryLabel", confirmButtonID = "progressDialogConfirmButton") {
        this.dialog = document.getElementById(dialogID);
        this.label = document.getElementById(progressLabelID);
        this.progressBar = document.getElementById(progressBarID);
        this.progressBarText = document.getElementById(progressBarTextID);
        this.summaryLabel = document.getElementById(progressSummaryLabelID);
        this.confirmButton = document.getElementById(confirmButtonID);
        this.confirmEvent = (result) => {
            shouldLog(LogLevel.Info) && console.log("Confirm event result: " + result);
        };
        this.dialog.addEventListener("close", (e) => {
            this.confirmEvent(false);
        });
    }
    show(text) {
        return new Promise((resolve, reject) => {
            this.userCancelled = false;
            this.label.textContent = text;
            this.summaryLabel.textContent = "";
            this.setProgress(0);
            this.confirmButton.textContent = "Cancel";
            this.confirmEvent = async (result) => {
                this.userCancelled = true;
                resolve(result);
            };
            this.dialog.showModal();
        });
    }
    setProgress(progress, text = "", summaryText = "") {
        let adjustedProgress = Math.max(0, Math.min(100, progress));
        this.progressBar.style.width = adjustedProgress + "%";
        let extraText = text.length > 0 ? ` &nbsp;&nbsp;${text}` : "";
        this.progressBarText.innerHTML = `${progress.toFixed(0)}%${extraText}`;
        this.summaryLabel.innerHTML = summaryText;
        this.confirmButton.textContent = progress >= 99.5 ? "OK" : "Cancel";
    }
    setText(text) {
        this.label.textContent = text;
    }
    close() {
        this.dialog.close();
    }
}

