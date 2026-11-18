import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("surfaceDesktop", {
  gmailStatus: () => ipcRenderer.invoke("desktop:gmail:status"),
  connectGmail: () => ipcRenderer.invoke("desktop:gmail:connect"),
  disconnectGmail: () => ipcRenderer.invoke("desktop:gmail:disconnect"),
  gmailDraftStatus: (id: string) =>
    ipcRenderer.invoke("desktop:gmail:draft-status", id),
  saveGmailDraft: (
    id: string,
    email: string,
    open: boolean,
    replace: boolean,
  ) => ipcRenderer.invoke("desktop:gmail:save-draft", id, email, open, replace),
  getSettings: () => ipcRenderer.invoke("desktop:settings:get"),
  saveSettings: (input: unknown) =>
    ipcRenderer.invoke("desktop:settings:save", input),
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
