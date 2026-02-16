import { ZoomExplorerAPI } from "./ipc-types.js";

declare global {
  interface Window {
    zoomExplorerAPI?: ZoomExplorerAPI;
  }
}

export {};
