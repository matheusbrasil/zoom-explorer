import { LogLevel, shouldLog } from "./Logger.js";

type ConfirmDialogHandler = (result: boolean) => void;

function getElementByIdOrThrow<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (element === null) {
    throw new Error(`Element with id "${id}" not found`);
  }
  return element as T;
}

export class ConfirmDialog {
  private readonly confirmDialog: HTMLDialogElement;
  private readonly confirmLabel: HTMLLabelElement;
  private readonly confirmButton: HTMLButtonElement;
  private readonly cancelButton: HTMLButtonElement;
  private confirmEvent: ConfirmDialogHandler;

  public constructor(dialogID: string, labelID: string, buttonID: string, cancelButtonID: string) {
    this.confirmDialog = getElementByIdOrThrow<HTMLDialogElement>(dialogID);
    this.confirmLabel = getElementByIdOrThrow<HTMLLabelElement>(labelID);
    this.confirmButton = getElementByIdOrThrow<HTMLButtonElement>(buttonID);
    this.cancelButton = getElementByIdOrThrow<HTMLButtonElement>(cancelButtonID);
    this.confirmEvent = (result: boolean) => {
      shouldLog(LogLevel.Info) && console.log(`Confirm event result: ${result}`);
    };

    this.confirmButton.addEventListener("click", (event: MouseEvent) => {
      event.preventDefault();
      this.confirmDialog.close("ok");
    });

    this.confirmDialog.addEventListener("close", () => {
      this.confirmEvent(this.confirmDialog.returnValue === "ok");
    });
  }

  public async getUserConfirmation(text: string): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      this.cancelButton.hidden = false;
      this.confirmButton.textContent = "Yes";
      this.confirmLabel.innerHTML = text;
      this.confirmEvent = (result: boolean) => {
        resolve(result);
      };
      this.confirmDialog.showModal();
    });
  }

  public async showInfo(text: string): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      this.cancelButton.hidden = true;
      this.confirmButton.textContent = "OK";
      this.confirmLabel.innerHTML = text;
      this.confirmEvent = (result: boolean) => {
        resolve(result);
      };
      this.confirmDialog.showModal();
    });
  }
}
