// Exposes window.knappchat to the page. The main process checks which page
// is calling, so the remote site only gets hotkey access and the local setup
// page only gets server-URL access.
import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron";

contextBridge.exposeInMainWorld("knappchat", {
  version: 1,
  platform: process.platform,

  getHotkeys: () => ipcRenderer.invoke("knappchat:get-hotkeys"),
  recordHotkey: () => ipcRenderer.invoke("knappchat:record-hotkey"),
  cancelRecording: () => ipcRenderer.invoke("knappchat:cancel-recording"),
  setHotkey: (kind: unknown, binding: unknown) =>
    ipcRenderer.invoke("knappchat:set-hotkey", kind, binding),
  onHotkey: (callback: (event: string) => void) => {
    const listener = (_e: IpcRendererEvent, event: string) => callback(event);
    ipcRenderer.on("knappchat:hotkey", listener);
    return () => {
      ipcRenderer.removeListener("knappchat:hotkey", listener);
    };
  },

  getServerUrl: () => ipcRenderer.invoke("knappchat:get-server"),
  setServerUrl: (url: unknown) => ipcRenderer.invoke("knappchat:set-server", url),
});
