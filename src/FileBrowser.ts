// @ts-nocheck
/**
 * FileBrowser - A virtual file browser component that displays hierarchical folder and file structures
 *
 * Similar to ZoomPatchList.ts, this class creates its own HTML structure and manages user interactions.
 */
import { htmlToElement } from "./htmltools.js";
import { shouldLog, LogLevel } from "./Logger.js";
export class FileBrowser {
    _container = document.createElement("div"); // dummy
    _treeContainer = document.createElement("div"); // dummy
    _currentPath = '/';
    _rootItems = [];
    _selectedItem = undefined;
    _dragOverElement = null;
    // Event listeners
    _fileSelectedListeners = [];
    _fileDoubleClickListeners = [];
    _folderExpandListeners = [];
    _fileDropListeners = [];
    _fileDeleteListeners = [];
    constructor() {
        this.createView();
        this.setupEventHandlers();
    }
    get viewElement() {
        return this._container;
    }
    get currentPath() {
        return this._currentPath;
    }
    get selectedItem() {
        return this._selectedItem;
    }
    /**
     * Get the selected directory or parent directory of the selected file.
     * @returns The selected directory or parent directory of the selected file, or undefined if the selected item is not a file or the parent directory is not a folder.
     */
    get selectedDirectory() {
        let selectedItem = this.selectedItem;
        if (selectedItem === undefined || selectedItem.type === "folder")
            return selectedItem;
        let pathList = selectedItem.path.split("/");
        pathList.pop();
        let parentPath = pathList.join("/");
        let parentItem = this.getItemByPath(parentPath);
        if (parentItem === undefined || parentItem.type === "folder")
            return parentItem;
        return undefined;
    }
    /**
     * Clear the file browser, removing all items and resetting state.
     */
    clear() {
        this._rootItems = [];
        this._selectedItem = undefined;
        this._currentPath = '/';
        this._treeContainer.innerHTML = '';
    }
    /**
     * Set the root items to display in the file browser
     */
    setRootItems(items) {
        this._rootItems = items;
        this.refresh();
    }
    /**
     * Add a single root item, provided the path is not already in the tree
     * @param item The item to add as a root item
     * @returns The added item, or the existing item if it already exists
     */
    addRootItem(item) {
        let existingItem = this._rootItems.find(i => i.path === item.path);
        if (existingItem !== undefined) {
            return existingItem;
        }
        this._rootItems.push(item);
        this.refresh();
        return item;
    }
    /**
     * Add items as children below a given FileSystemItem (folder).
     * If the item is not a folder, this does nothing.
     * If the item already exists, it is updated with the new modified date.
     * @param parent The parent FileSystemItem (must be a folder)
     * @param items The items to add as children
     * @returns The added item, or the existing item if it already exists
     */
    addItemBelow(parent, item) {
        if (parent.type !== 'folder') {
            shouldLog(LogLevel.Error) && console.error(`FileBrowser: addItemBelow: Parent is not a folder: ${parent.path}`);
            return undefined;
        }
        if (!parent.children)
            parent.children = [];
        let existingItem = parent.children.find(i => i.path === item.path);
        if (existingItem === undefined) {
            parent.children.push(item);
        }
        else {
            existingItem.modified = item.modified;
        }
        this.refresh();
        return existingItem;
    }
    /**
     * Remove all child items below a given FileSystemItem (folder).
     * If the item is not a folder, this does nothing.
     * @param parent The parent FileSystemItem (must be a folder)
     */
    removeAllItemsBelow(parent) {
        if (parent.type !== 'folder')
            return;
        if (parent.children) {
            parent.children = [];
            this.refresh();
        }
    }
    /**
     * Create a folder at the given path, creating all parent folders if they don't exist
     * @param path
     * @returns The created folder item, or undefined if the path is invalid
     */
    createFolder(path) {
        if (!path.startsWith('/')) {
            shouldLog(LogLevel.Error) && console.error(`FileBrowser: createFolder: path does not start with '/'`);
            return undefined;
        }
        let pathList = path.split("/");
        let parent = this._rootItems.find(item => item.name === pathList[1] && item.type === "folder");
        if (parent === undefined) {
            parent = {
                name: pathList[1],
                type: "folder",
                path: `/${pathList[1]}`,
                modified: new Date(Date.now()),
                children: []
            };
            this._rootItems.push(parent);
        }
        for (let i = 2; i < pathList.length - 1; i++) {
            let child = parent.children?.find(item => item.name === pathList[i] && item.type === "folder");
            if (child === undefined) {
                child = {
                    name: pathList[i],
                    type: "folder",
                    path: pathList.slice(0, i + 1).join("/"),
                    modified: new Date(Date.now()),
                    children: []
                };
                parent.children?.push(child);
            }
            parent = child;
        }
        let existingFolder = parent.children?.find(item => item.name === pathList[pathList.length - 1] && item.type === "folder");
        if (existingFolder !== undefined) {
            existingFolder.modified = new Date(Date.now());
        }
        else {
            let existingFolder = {
                name: pathList[pathList.length - 1],
                type: "folder",
                path: path,
                modified: new Date(Date.now()),
                children: []
            };
            parent.children?.push(existingFolder);
        }
        this.refresh();
        return existingFolder;
    }
    /**
     * Save a file (add file item (and parents) to list if it doesn't already exist, update the modified date)
     * @param path The absolute path to the file.
     */
    saveFile(path) {
        if (!path.startsWith('/'))
            return;
        let pathList = path.split("/");
        let parent = this._rootItems.find(item => item.name === pathList[1] && item.type === "folder");
        if (parent === undefined) {
            parent = {
                name: pathList[1],
                type: "folder",
                path: `/${pathList[1]}`,
                modified: new Date(Date.now()),
                children: []
            };
            this._rootItems.push(parent);
        }
        for (let i = 2; i < pathList.length - 1; i++) {
            let child = parent.children?.find(item => item.name === pathList[i] && item.type === "folder");
            if (child === undefined) {
                child = {
                    name: pathList[i],
                    type: "folder",
                    path: pathList.slice(0, i + 1).join("/"),
                    modified: new Date(Date.now()),
                    children: []
                };
                parent.children?.push(child);
            }
            parent = child;
        }
        let existingFile = parent.children?.find(item => item.name === pathList[pathList.length - 1] && item.type === "file");
        if (existingFile !== undefined) {
            existingFile.modified = new Date(Date.now());
        }
        else {
            let item = {
                name: pathList[pathList.length - 1],
                type: "file",
                path: path,
                modified: new Date(Date.now())
            };
            parent.children?.push(item);
        }
        this.refresh();
    }
    /**
     * Delete a file or folder (if empty) from the file browser tree
     * @param path The absolute path to the file to delete
     */
    deleteFile(path) {
        if (!path.startsWith('/'))
            return;
        let pathList = path.split("/");
        let parent;
        // Find the root folder
        parent = this._rootItems.find(item => item.name === pathList[1] && item.type === "folder");
        if (parent === undefined) {
            return; // Root folder doesn't exist
        }
        // Navigate to the parent folder containing the file
        for (let i = 2; i < pathList.length - 1; i++) {
            let child = parent.children?.find(item => item.name === pathList[i] && item.type === "folder");
            if (child === undefined) {
                return; // Parent folder doesn't exist
            }
            parent = child;
        }
        // Remove the file from the parent's children
        if (parent.children) {
            const fileName = pathList[pathList.length - 1];
            const index = parent.children.findIndex(item => item.name === fileName && (item.type === "file" || (item.type === "folder" && item.children?.length === 0)));
            if (index !== -1) {
                // If the deleted file is currently selected, clear the selection
                if (this._selectedItem && this._selectedItem.path === path) {
                    this._selectedItem = undefined;
                }
                parent.children.splice(index, 1);
                this.refresh();
            }
        }
    }
    /**
     * Refresh the file browser display
     */
    refresh() {
        // Clear any drag-over highlight when refreshing
        this.clearDragOverHighlight();
        this._treeContainer.innerHTML = '';
        this.renderItems(this._rootItems, this._treeContainer, 0);
    }
    /**
     * Navigate to a specific path
     */
    navigateTo(path) {
        this._currentPath = path;
    }
    /**
     * Expand or collapse a folder
     */
    toggleFolder(item) {
        if (item.type !== 'folder')
            return;
        item.expanded = !item.expanded;
        this.refresh();
        this.emitFolderExpandEvent(item, item.expanded);
    }
    /**
     * Get a FileSystemItem by its path.
     * @param path The absolute path to search for.
     * @returns The FileSystemItem if found, otherwise undefined.
     */
    getItemByPath(path) {
        if (!path.startsWith('/'))
            return undefined;
        // Helper function to recursively search for the item
        function find(items) {
            for (const item of items) {
                if (item.path === path) {
                    return item;
                }
                if (item.type === 'folder' && item.children && path.startsWith(item.path + '/')) {
                    const found = find(item.children);
                    if (found)
                        return found;
                }
            }
            return undefined;
        }
        return find(this._rootItems);
    }
    /**
     * Select a file or folder
     */
    selectItem(item) {
        // Clear previous selection
        const previousSelected = this._container.querySelector('.file-browser-item-selected');
        if (previousSelected) {
            previousSelected.classList.remove('file-browser-item-selected');
        }
        this._selectedItem = item;
        // Find and highlight the new selection
        const itemElements = this._container.querySelectorAll('.file-browser-item');
        for (const element of itemElements) {
            if (element.dataset.path === item.path) {
                element.classList.add('file-browser-item-selected');
                break;
            }
        }
        // Focus the container so it can receive keyboard events
        this._container.focus();
        this.emitFileSelectedEvent(item);
    }
    /**
     * Create the HTML structure for the file browser
     */
    createView() {
        const html = `
      <div class="file-browser-container collapsibleContent">
        <div class="file-browser-tree">
        </div>
      </div>
    `;
        this._container = htmlToElement(html);
        this._treeContainer = this._container.querySelector('.file-browser-tree');
    }
    /**
     * Set up event handlers for the file browser
     */
    setupEventHandlers() {
        // Tree item handlers will be set up in renderItems
        // Keyboard handler for Delete key
        this._container.addEventListener('keydown', (e) => {
            // Only handle Delete key
            if (e.key === 'Delete' || e.key === 'Del') {
                if (this._selectedItem) {
                    e.preventDefault();
                    e.stopPropagation();
                    this.emitFileDeleteEvent(this._selectedItem);
                }
            }
        });
        // Make the container focusable so it can receive keyboard events
        this._container.setAttribute('tabindex', '0');
        // Drag and drop handlers for file dropping from Windows Explorer
        this._container.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.stopPropagation();
            // Find the folder item at the current position
            const dropTarget = this.findFolderAtPosition(e.clientX, e.clientY);
            // Determine which element should be highlighted
            let targetElement = null;
            if (dropTarget && dropTarget.type === 'folder') {
                targetElement = this.findElementByPath(dropTarget.path);
            }
            // Only update if we need to change the highlighted element
            if (targetElement !== this._dragOverElement) {
                // Clear previous highlight
                this.clearDragOverHighlight();
                // Highlight the new folder if it's a valid drop target
                if (targetElement) {
                    targetElement.classList.add('file-browser-item-drag-over');
                    this._dragOverElement = targetElement;
                }
            }
            // Allow drop by setting dropEffect
            if (e.dataTransfer) {
                e.dataTransfer.dropEffect = dropTarget && dropTarget.type === 'folder' ? 'copy' : 'none';
            }
        });
        this._container.addEventListener('dragenter', (e) => {
            e.preventDefault();
            e.stopPropagation();
        });
        this._container.addEventListener('dragleave', (e) => {
            e.preventDefault();
            e.stopPropagation();
            // Clear highlight when leaving the container
            this.clearDragOverHighlight();
        });
        this._container.addEventListener('drop', (e) => {
            e.preventDefault();
            e.stopPropagation();
            // Clear the drag-over highlight
            this.clearDragOverHighlight();
            if (!e.dataTransfer || !e.dataTransfer.files || e.dataTransfer.files.length === 0) {
                return;
            }
            // Get the file being dropped
            const file = e.dataTransfer.files[0];
            const fileName = file.name;
            const reader = new FileReader();
            let fileBytes = undefined;
            reader.onload = (event) => {
                const arrayBuffer = event.target?.result;
                if (arrayBuffer instanceof ArrayBuffer) {
                    fileBytes = new Uint8Array(arrayBuffer);
                }
                // Find which folder item the file was dropped on
                const dropTarget = this.findFolderAtPosition(e.clientX, e.clientY);
                if (dropTarget && dropTarget.type === 'folder') {
                    // Emit the file drop event
                    this.emitFileDropEvent(fileName, fileBytes, dropTarget);
                }
                else {
                    // If no specific folder found, try to find the currently selected folder
                    // or use root as fallback
                    if (this._selectedItem && this._selectedItem.type === 'folder') {
                        this.emitFileDropEvent(fileName, fileBytes, this._selectedItem);
                    }
                    else {
                        // Could not determine a valid folder, so we don't emit the event
                        if (shouldLog(LogLevel.Debug)) {
                            console.debug('FileBrowser: File dropped but no valid folder target found');
                        }
                    }
                }
            };
            reader.readAsArrayBuffer(file);
        });
    }
    /**
     * Find the folder item at the given screen coordinates
     * @param x Screen X coordinate
     * @param y Screen Y coordinate
     * @returns The FileBrowserItem at the position, or null if not found
     */
    findFolderAtPosition(x, y) {
        // Use elementFromPoint to find the element at the drop position
        const elementAtPoint = document.elementFromPoint(x, y);
        if (!elementAtPoint) {
            return null;
        }
        // Find the closest file-browser-item element
        let currentElement = elementAtPoint;
        while (currentElement && !currentElement.classList.contains('file-browser-item')) {
            currentElement = currentElement.parentElement;
        }
        if (!currentElement) {
            return null;
        }
        // Get the path from the element's data attribute
        const path = currentElement.dataset.path;
        if (!path) {
            return null;
        }
        // Find the item by path
        const item = this.getItemByPath(path);
        // If the item is a folder, return it
        // If it's a file, try to find its parent folder
        if (item && item.type === 'folder') {
            return item;
        }
        else if (item && item.type === 'file') {
            // For files, find the parent folder by removing the file name from the path
            const parentPath = path.substring(0, path.lastIndexOf('/'));
            if (parentPath) {
                const parentItem = this.getItemByPath(parentPath);
                if (parentItem && parentItem.type === 'folder') {
                    return parentItem;
                }
            }
        }
        return null;
    }
    /**
     * Find the DOM element for a given path
     * @param path The path of the item to find
     * @returns The HTMLElement if found, otherwise null
     */
    findElementByPath(path) {
        const itemElements = this._container.querySelectorAll('.file-browser-item');
        for (const element of itemElements) {
            if (element.dataset.path === path) {
                return element;
            }
        }
        return null;
    }
    /**
     * Clear the drag-over highlight from any previously highlighted element
     */
    clearDragOverHighlight() {
        if (this._dragOverElement) {
            this._dragOverElement.classList.remove('file-browser-item-drag-over');
            this._dragOverElement = null;
        }
    }
    /**
     * Render file system items recursively
     */
    renderItems(items, container, level) {
        for (const item of items) {
            const itemElement = this.createItemElement(item, level);
            container.appendChild(itemElement);
            // If it's an expanded folder with children, render them
            if (item.type === 'folder' && item.expanded && item.children) {
                const childContainer = document.createElement('div');
                childContainer.className = 'file-browser-children';
                this.renderItems(item.children, childContainer, level + 1);
                container.appendChild(childContainer);
            }
        }
    }
    /**
     * Create a single item element
     */
    createItemElement(item, level) {
        const isFolder = item.type === 'folder';
        const hasChildren = isFolder && item.children && item.children.length > 0;
        const isExpanded = item.expanded || false;
        const itemHtml = `
      <div class="file-browser-item" 
           data-path="${item.path}" 
           data-type="${item.type}"
           style="padding-left: ${level * 8 + 8}px">
        <div class="file-browser-item-content">
          ${hasChildren ? `
            <button class="file-browser-expand-button" data-path="${item.path}">
              <span class="material-symbols-outlined">
                ${isExpanded ? 'keyboard_arrow_down' : 'keyboard_arrow_right'}
              </span>
            </button>
          ` : '<span class="file-browser-expand-spacer"></span>'}
          
          <span class="file-browser-icon material-symbols-outlined">
            ${isFolder ? (isExpanded ? 'folder_open' : 'folder') : 'description'}
          </span>
          
          <span class="file-browser-name">${item.name}</span>
          
          ${item.modified ? `
            <span class="file-browser-modified">${this.formatDate(item.modified)}</span>
          ` : ''}
        </div>
      </div>
    `;
        const element = htmlToElement(itemHtml);
        // Add event listeners
        const expandButton = element.querySelector('.file-browser-expand-button');
        if (expandButton) {
            expandButton.addEventListener('click', (e) => {
                e.stopPropagation();
                this.toggleFolder(item);
            });
        }
        const itemContent = element.querySelector('.file-browser-item-content');
        itemContent.addEventListener('click', () => {
            this.selectItem(item);
        });
        itemContent.addEventListener('dblclick', () => {
            if (item.type === 'folder') {
                this.toggleFolder(item);
            }
            this.emitFileDoubleClickEvent(item);
        });
        return element;
    }
    /**
     * Format date for display
     */
    formatDate(date) {
        return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    // Event listener management
    addFileSelectedListener(listener) {
        this._fileSelectedListeners.push(listener);
    }
    removeFileSelectedListener(listener) {
        this._fileSelectedListeners = this._fileSelectedListeners.filter(l => l !== listener);
    }
    addFileDoubleClickListener(listener) {
        this._fileDoubleClickListeners.push(listener);
    }
    removeFileDoubleClickListener(listener) {
        this._fileDoubleClickListeners = this._fileDoubleClickListeners.filter(l => l !== listener);
    }
    addFolderExpandListener(listener) {
        this._folderExpandListeners.push(listener);
    }
    removeFolderExpandListener(listener) {
        this._folderExpandListeners = this._folderExpandListeners.filter(l => l !== listener);
    }
    addFileDropListener(listener) {
        this._fileDropListeners.push(listener);
    }
    removeFileDropListener(listener) {
        this._fileDropListeners = this._fileDropListeners.filter(l => l !== listener);
    }
    addFileDeleteListener(listener) {
        this._fileDeleteListeners.push(listener);
    }
    removeFileDeleteListener(listener) {
        this._fileDeleteListeners = this._fileDeleteListeners.filter(l => l !== listener);
    }
    emitFileSelectedEvent(item) {
        for (const listener of this._fileSelectedListeners) {
            listener(item);
        }
    }
    emitFileDoubleClickEvent(item) {
        for (const listener of this._fileDoubleClickListeners) {
            listener(item);
        }
    }
    emitFolderExpandEvent(item, expanded) {
        for (const listener of this._folderExpandListeners) {
            listener(item, expanded);
        }
    }
    emitFileDropEvent(fileName, fileBytes, folder) {
        for (const listener of this._fileDropListeners) {
            listener(fileName, fileBytes, folder);
        }
    }
    emitFileDeleteEvent(item) {
        for (const listener of this._fileDeleteListeners) {
            listener(item);
        }
    }
}

