import { contextBridge, ipcRenderer } from "electron";

const windowApi = {
  platform: process.platform,
  minimize: async (): Promise<void> => {
    await ipcRenderer.invoke("friend-maker-window:minimize");
  },
  toggleMaximize: async (): Promise<boolean> => {
    return Boolean(await ipcRenderer.invoke("friend-maker-window:toggle-maximize"));
  },
  close: async (): Promise<void> => {
    await ipcRenderer.invoke("friend-maker-window:close");
  },
};

contextBridge.exposeInMainWorld("friendMakerWindow", windowApi);
