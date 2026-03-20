import { MidiMessageEventDTO, ZoomExplorerAPI } from "./shared/api-contract.js";

type TauriEvent = { payload: unknown };
type UnlistenFn = () => void;

type TauriInvoke = <T>(command: string, args?: Record<string, unknown>) => Promise<T>;

type TauriApi = {
  core?: {
    invoke?: TauriInvoke;
  };
  event?: {
    listen?: (event: string, handler: (event: TauriEvent) => void) => Promise<UnlistenFn>;
  };
  app?: {
    getVersion?: () => Promise<string>;
  };
};

declare global {
  interface Window {
    __TAURI__?: TauriApi;
  }
}

function toMidiMessagePayload(payload: unknown): MidiMessageEventDTO {
  const dto = payload as Partial<MidiMessageEventDTO>;
  return {
    inPortId: typeof dto.inPortId === "string" ? dto.inPortId : "",
    data: Array.isArray(dto.data) ? dto.data.filter((value): value is number => typeof value === "number") : [],
    timeStamp: typeof dto.timeStamp === "number" ? dto.timeStamp : Date.now(),
  };
}

export function installTauriBridge(): void {
  if (window.zoomExplorerAPI !== undefined) {
    return;
  }

  const tauri = window.__TAURI__;
  const invoke = tauri?.core?.invoke;
  if (typeof invoke !== "function") {
    return;
  }

  const listen = tauri?.event?.listen;

  const api: ZoomExplorerAPI = {
    listMidiPorts: () => invoke("list_midi_ports"),
    openInput: (inPortId: string) => invoke("open_input", { inPortId }),
    closeInput: (inPortId: string) => invoke("close_input", { inPortId }),
    openOutput: (outPortId: string) => invoke("open_output", { outPortId }),
    closeOutput: (outPortId: string) => invoke("close_output", { outPortId }),
    connectMidi: ({ inPortId, outPortId }: { inPortId: string; outPortId: string }) => {
      return invoke("connect_midi", { params: { inPortId, outPortId } });
    },
    disconnectMidi: () => invoke("disconnect_midi"),
    sendMidiMessage: ({ outPortId, message }: { outPortId: string; message: number[] }) => {
      return invoke("send_midi_message", { params: { outPortId, message } });
    },
    sendSysex: ({ outPortId, sysex }: { outPortId: string; sysex: number[] }) => {
      return invoke("send_sysex", { params: { outPortId, sysex } });
    },
    onMidiMessage: (callback: (payload: MidiMessageEventDTO) => void): (() => void) => {
      if (typeof listen !== "function") {
        return () => undefined;
      }

      let disposed = false;
      let removeListener: UnlistenFn | undefined;

      void listen("midi_message", (event) => {
        callback(toMidiMessagePayload(event.payload));
      })
        .then((unlisten) => {
          if (disposed) {
            unlisten();
            return;
          }
          removeListener = unlisten;
        })
        .catch((error) => {
          console.warn(`Unable to subscribe to midi_message: ${String(error)}`);
        });

      return () => {
        disposed = true;
        if (removeListener !== undefined) {
          removeListener();
        }
      };
    },
    onMidiPortsChanged: (callback: () => void): (() => void) => {
      if (typeof listen !== "function") {
        return () => undefined;
      }

      let disposed = false;
      let removeListener: UnlistenFn | undefined;

      void listen("midi_ports_changed", () => {
        callback();
      })
        .then((unlisten) => {
          if (disposed) {
            unlisten();
            return;
          }
          removeListener = unlisten;
        })
        .catch((error) => {
          console.warn(`Unable to subscribe to midi_ports_changed: ${String(error)}`);
        });

      return () => {
        disposed = true;
        if (removeListener !== undefined) {
          removeListener();
        }
      };
    },
    getSettings: () => invoke("get_settings"),
    setSettings: (settings: Record<string, unknown>) => invoke("set_settings", { settings }),
    readAppFile: (relativePath: string) => invoke("read_app_file", { relativePath }),
    readAppBinary: (relativePath: string) => invoke("read_app_binary", { relativePath }),
    getAppVersion: async () => {
      if (typeof tauri?.app?.getVersion === "function") {
        return tauri.app.getVersion();
      }
      return invoke("get_app_version");
    },
    relaunchApp: () => invoke("relaunch_app"),
    getPlatformCapabilities: () => invoke("get_platform_capabilities"),
  };

  window.zoomExplorerAPI = api;
}
