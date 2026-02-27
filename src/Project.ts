export class MIDIMapping {
  public device = "";
  public channel = 0;
  public ccNumber = 0;
  public min = 0;
  public max = 0;
}

export class Project {
  public name = "";
  public racks: unknown[] = [];
}
