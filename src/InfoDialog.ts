// @ts-nocheck
export class InfoDialog {
    infoDialog;
    infoLabel;
    confirmButton;
    constructor(dialogID, labelID, buttonID = "") {
        this.infoDialog = document.getElementById(dialogID);
        this.infoLabel = document.getElementById(labelID);
        if (buttonID !== "") {
            this.confirmButton = document.getElementById(buttonID);
            this.confirmButton.hidden = false;
            this.confirmButton.addEventListener("click", (event) => {
                event.preventDefault(); // 
                this.infoDialog.close("ok");
            });
        }
        else
            this.confirmButton = undefined;
    }
    show(text) {
        this.infoLabel.textContent = text;
        this.infoDialog.showModal();
    }
    close() {
        this.infoDialog.close();
    }
}

