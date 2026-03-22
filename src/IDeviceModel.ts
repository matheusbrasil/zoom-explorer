export const IGNORE_INSTRUMENT = -1;
export const IGNORE_CHANNEL_ENABLED = true;
export const IGNORE_PARAMETER_NUMBER = -1;
export const IGNORE_PARAMETER_VALUE = -1;

export type ParameterInfo = [name: string, min: number, max: number];

export class ChannelInfo {
  public name = "";
  public color = "";
  public enabled = true;
  public parameterValues = new Map<number, number>();
  public parameterInfo = new Map<number, ParameterInfo>();
  public stateNames = new Map<number, string>();
  public instrumentNumber = IGNORE_INSTRUMENT;

  public clear(): void {
    this.name = "";
    this.color = "";
    this.enabled = true;
    this.parameterValues.clear();
    this.parameterInfo.clear();
    this.stateNames.clear();
    this.instrumentNumber = IGNORE_INSTRUMENT;
  }
}
