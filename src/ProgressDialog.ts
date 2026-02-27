import { LogLevel, shouldLog } from "./Logger.js";

type ProgressDialogHandler = (confirmed: boolean) => void;

function getElementByIdOrThrow<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (element === null) {
    throw new Error(`Element with id "${id}" not found`);
  }
  return element as T;
}

export class ProgressDialog {
  private readonly dialog: HTMLDialogElement;
  private readonly label: HTMLLabelElement;
  private readonly progressBar: HTMLDivElement;
  private readonly progressBarText: HTMLSpanElement;
  private readonly summaryLabel: HTMLLabelElement;
  private readonly confirmButton: HTMLButtonElement;
  private confirmEvent: ProgressDialogHandler;
  public userCancelled = false;

  public constructor(
    dialogID = "progressDialog",
    progressLabelID = "progressDialogLabel",
    progressBarID = "progressDialogBar",
    progressBarTextID = "progressDialogBarText",
    progressSummaryLabelID = "progressDialogSummaryLabel",
    confirmButtonID = "progressDialogConfirmButton",
  ) {
    this.dialog = getElementByIdOrThrow<HTMLDialogElement>(dialogID);
    this.label = getElementByIdOrThrow<HTMLLabelElement>(progressLabelID);
    this.progressBar = getElementByIdOrThrow<HTMLDivElement>(progressBarID);
    this.progressBarText = getElementByIdOrThrow<HTMLSpanElement>(progressBarTextID);
    this.summaryLabel = getElementByIdOrThrow<HTMLLabelElement>(progressSummaryLabelID);
    this.confirmButton = getElementByIdOrThrow<HTMLButtonElement>(confirmButtonID);
    this.confirmEvent = (result: boolean) => {
      shouldLog(LogLevel.Info) && console.log(`Confirm event result: ${result}`);
    };

    this.confirmButton.addEventListener("click", (event: MouseEvent) => {
      event.preventDefault();
      const confirmed = this.confirmButton.textContent === "OK";
      this.dialog.close(confirmed ? "ok" : "cancel");
    });

    this.dialog.addEventListener("close", () => {
      const confirmed = this.dialog.returnValue === "ok";
      this.userCancelled = !confirmed;
      this.confirmEvent(confirmed);
    });
  }

  public async show(text: string): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      this.userCancelled = false;
      this.label.textContent = text;
      this.summaryLabel.textContent = "";
      this.setProgress(0);
      this.confirmButton.textContent = "Cancel";
      this.confirmEvent = (result: boolean) => {
        resolve(result);
      };
      this.dialog.showModal();
    });
  }

  public setProgress(progress: number, text = "", summaryText = ""): void {
    const adjustedProgress = Math.max(0, Math.min(100, progress));
    this.progressBar.style.width = `${adjustedProgress}%`;
    const extraText = text.length > 0 ? ` \u00a0\u00a0${text}` : "";
    this.progressBarText.innerHTML = `${adjustedProgress.toFixed(0)}%${extraText}`;
    this.summaryLabel.innerHTML = summaryText;
    this.confirmButton.textContent = adjustedProgress >= 99.5 ? "OK" : "Cancel";
  }

  public setText(text: string): void {
    this.label.textContent = text;
  }

  public close(): void {
    this.dialog.close();
  }
}
