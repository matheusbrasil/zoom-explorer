import { LogLevel, shouldLog } from "./Logger.js";

type MIDIFilter = boolean[];
type MIDIFilterHandler = (result: MIDIFilter) => void;

function getElementByIdOrThrow<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (element === null) {
    throw new Error(`Element with id "${id}" not found`);
  }
  return element as T;
}

export class MIDIFilterDialog {
  private readonly dialog: HTMLDialogElement;
  private confirmEvent: MIDIFilterHandler;

  public constructor(dialogID: string) {
    this.dialog = getElementByIdOrThrow<HTMLDialogElement>(dialogID);
    const button = this.dialog.querySelector<HTMLButtonElement>("button");
    if (button === null) {
      throw new Error(`Dialog "${dialogID}" is missing its confirm button`);
    }

    button.addEventListener("click", (event: MouseEvent) => {
      event.preventDefault();
      this.dialog.close("ok");
      this.confirmEvent(this.readFilterValues());
    });

    this.confirmEvent = (result: MIDIFilter) => {
      shouldLog(LogLevel.Info) && console.log(`Confirm event result: ${result}`);
    };
  }

  public show(): void {
    this.dialog.showModal();
  }

  public close(): void {
    this.dialog.close();
  }

  public async getFilterSettings(filter: MIDIFilter): Promise<MIDIFilter> {
    return new Promise<MIDIFilter>((resolve) => {
      const checkBoxes = this.getCheckBoxes();
      for (let index = 0; index < checkBoxes.length; index++) {
        checkBoxes[index].checked = filter[index] ?? false;
      }

      this.confirmEvent = (result: MIDIFilter) => {
        resolve(result);
      };
      this.dialog.showModal();
    });
  }

  private getCheckBoxes(): NodeListOf<HTMLInputElement> {
    return this.dialog.querySelectorAll<HTMLInputElement>("input[type=checkbox]");
  }

  private readFilterValues(): MIDIFilter {
    const filter: MIDIFilter = [];
    const checkBoxes = this.getCheckBoxes();
    for (const checkBox of checkBoxes) {
      filter.push(checkBox.checked);
    }
    return filter;
  }
}
