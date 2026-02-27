export type LocalFileSystemItemType = "file" | "folder";

export interface LocalFileSystemBaseItem {
  name: string;
  type: LocalFileSystemItemType;
  modified?: Date | string;
}

export interface LocalFileSystemFile extends LocalFileSystemBaseItem {
  type: "file";
  content: string;
}

export interface LocalFileSystemFolder extends LocalFileSystemBaseItem {
  type: "folder";
  children: LocalFileSystemItem[];
}

export type LocalFileSystemItem = LocalFileSystemFile | LocalFileSystemFolder;

function isFolder(item: LocalFileSystemItem | undefined): item is LocalFileSystemFolder {
  return item !== undefined && item.type === "folder";
}

function isFile(item: LocalFileSystemItem | undefined): item is LocalFileSystemFile {
  return item !== undefined && item.type === "file";
}

export class LocalFileSystem {
  public root: LocalFileSystemFolder;

  public constructor(rootName: string) {
    this.root = {
      name: rootName,
      type: "folder",
      children: [],
    };

    const data = localStorage.getItem(rootName);
    if (data === null) {
      localStorage.setItem(this.root.name, JSON.stringify(this.root));
    } else {
      this.root = JSON.parse(data) as LocalFileSystemFolder;
    }
  }

  public saveFile(path: string, content: string): void {
    if (!path.startsWith("/")) {
      return;
    }

    const pathList = path.split("/");
    let parent = this.root;
    for (let index = 1; index < pathList.length - 1; index++) {
      let child = parent.children.find((currentChild) => currentChild.name === pathList[index] && currentChild.type === "folder");
      if (!isFolder(child)) {
        child = { name: pathList[index], type: "folder", modified: new Date(), children: [] };
        parent.children.push(child);
      }
      parent = child;
    }

    const fileName = pathList[pathList.length - 1];
    const existingChild = parent.children.find((currentChild) => currentChild.name === fileName && currentChild.type === "file");
    if (isFile(existingChild)) {
      existingChild.content = content;
      existingChild.modified = new Date();
    } else {
      parent.children.push({ name: fileName, type: "file", content, modified: new Date() });
    }

    this.persist();
  }

  public loadFile(path: string): string | null {
    const pathList = path.split("/");
    let parent: LocalFileSystemFolder = this.root;
    for (let index = 1; index < pathList.length - 1; index++) {
      const child = parent.children.find((currentChild) => currentChild.name === pathList[index]);
      if (!isFolder(child)) {
        return null;
      }
      parent = child;
    }

    const item = parent.children.find((currentChild) => currentChild.name === pathList[pathList.length - 1]);
    return isFile(item) ? item.content : null;
  }

  /**
   * Delete a file or folder (if empty)from the local file system
   * @param path The absolute path to the file or folder to delete
   */
  public deleteFile(path: string): void {
    if (!path.startsWith("/")) {
      return;
    }

    const pathList = path.split("/");
    let parent: LocalFileSystemFolder = this.root;

    for (let index = 1; index < pathList.length - 1; index++) {
      const child = parent.children.find((currentChild) => currentChild.name === pathList[index] && currentChild.type === "folder");
      if (!isFolder(child)) {
        return;
      }
      parent = child;
    }

    const fileName = pathList[pathList.length - 1];
    const itemIndex = parent.children.findIndex((currentChild) => {
      if (currentChild.name !== fileName) {
        return false;
      }

      return currentChild.type === "file" || (currentChild.type === "folder" && currentChild.children.length === 0);
    });

    if (itemIndex !== -1) {
      parent.children.splice(itemIndex, 1);
      this.persist();
    }
  }

  private persist(): void {
    localStorage.setItem(this.root.name, JSON.stringify(this.root));
  }
}
