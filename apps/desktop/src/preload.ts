import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("surfaceDesktop", {
  getSettings: () => ipcRenderer.invoke("desktop:settings:get"),
  saveSettings: (input: unknown) =>
    ipcRenderer.invoke("desktop:settings:save", input),
  appInfo: () => ipcRenderer.invoke("desktop:app:info"),
  openDataDir: () => ipcRenderer.invoke("desktop:open-data"),
});
