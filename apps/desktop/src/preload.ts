import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("surfaceDesktop", {
  appInfo: () => ipcRenderer.invoke("desktop:app:info"),
  openDataDir: () => ipcRenderer.invoke("desktop:open-data"),
  getWindowState: () => ipcRenderer.invoke("desktop:window:get-state"),
  minimizeWindow: () => ipcRenderer.invoke("desktop:window:minimize"),
  toggleMaximize: () => ipcRenderer.invoke("desktop:window:toggle-maximize"),
  closeWindow: () => ipcRenderer.invoke("desktop:window:close"),
  onWindowState: (listener: (state: unknown) => void) => {
    const receive = (_event: unknown, state: unknown) => listener(state);
    ipcRenderer.on("desktop:window-state", receive);
    return () => {
      ipcRenderer.removeListener("desktop:window-state", receive);
    };
  },
});
