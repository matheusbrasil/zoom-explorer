function getElementByIdOrThrow<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (element === null) {
    throw new Error(`Element with id "${id}" not found`);
  }
  return element as T;
}

export class InfoDialog {
  private readonly infoDialog: HTMLDialogElement;
  private readonly infoLabel: HTMLLabelElement;
  private readonly confirmButton: HTMLButtonElement | undefined;

  public constructor(dialogID: string, labelID: string, buttonID = "") {
    this.infoDialog = getElementByIdOrThrow<HTMLDialogElement>(dialogID);
    this.infoLabel = getElementByIdOrThrow<HTMLLabelElement>(labelID);
    this.confirmButton = buttonID === "" ? undefined : getElementByIdOrThrow<HTMLButtonElement>(buttonID);

    if (this.confirmButton !== undefined) {
      this.confirmButton.hidden = false;
      this.confirmButton.addEventListener("click", (event: MouseEvent) => {
        event.preventDefault();
        this.infoDialog.close("ok");
      });
    }
  }

  public show(text: string): void {
    this.infoLabel.textContent = text;
    if (!this.infoDialog.open) {
      this.infoDialog.showModal();
    }
  }

  public close(): void {
    this.infoDialog.close();
  }
}
