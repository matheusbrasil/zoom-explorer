// @ts-nocheck
export class LocalFileSystem {
    root;
    constructor(rootName) {
        this.root = {
            name: rootName,
            type: "folder",
            children: [],
        };
        let data = localStorage.getItem(rootName);
        if (data === null) {
            localStorage.setItem(this.root.name, JSON.stringify(this.root));
        }
        else {
            this.root = JSON.parse(data);
        }
    }
    saveFile(path, content) {
        if (!path.startsWith('/'))
            return;
        let pathList = path.split("/");
        let parent = this.root;
        for (let i = 1; i < pathList.length - 1; i++) {
            let child = parent.children?.find(c => c.name === pathList[i] && c.type === "folder");
            if (child === undefined) {
                child = { name: pathList[i], type: "folder", modified: new Date(Date.now()), children: [] };
                parent.children?.push(child);
            }
            parent = child;
        }
        let existingChild = parent.children?.find(c => c.name === pathList[pathList.length - 1] && c.type === "file");
        if (existingChild !== undefined) {
            existingChild.content = content;
            existingChild.modified = new Date(Date.now());
        }
        else {
            parent.children?.push({ name: pathList[pathList.length - 1], type: "file", content: content, modified: new Date(Date.now()) });
        }
        localStorage.setItem(this.root.name, JSON.stringify(this.root));
    }
    loadFile(path) {
        let pathList = path.split("/");
        let parent = this.root;
        for (let i = 1; i < pathList.length - 1; i++) {
            let child = parent.children?.find(c => c.name === pathList[i]);
            if (child === undefined) {
                return null;
            }
            parent = child;
        }
        return parent.children?.find(c => c.name === pathList[pathList.length - 1])?.content ?? null;
    }
    /**
     * Delete a file or folder (if empty)from the local file system
     * @param path The absolute path to the file or folder to delete
     * @returns
     */
    deleteFile(path) {
        if (!path.startsWith('/'))
            return;
        let pathList = path.split("/");
        let parent = this.root;
        // Navigate to the parent folder
        for (let i = 1; i < pathList.length - 1; i++) {
            let child = parent.children?.find(c => c.name === pathList[i] && c.type === "folder");
            if (child === undefined) {
                return; // Parent folder doesn't exist
            }
            parent = child;
        }
        // Find and remove the file from the parent's children
        if (parent.children) {
            const fileName = pathList[pathList.length - 1];
            const index = parent.children.findIndex(c => c.name === fileName && (c.type === "file" || (c.type === "folder" && c.children?.length === 0)));
            if (index !== -1) {
                parent.children.splice(index, 1);
                localStorage.setItem(this.root.name, JSON.stringify(this.root));
            }
        }
    }
}

