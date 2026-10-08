import { contextBridge, ipcRenderer } from 'electron';

/** The small surface the web app may use when it runs inside the desktop app. */
contextBridge.exposeInMainWorld('questwrightDesktop', {
  hasApiKey: (): Promise<boolean> => ipcRenderer.invoke('qw:hasKey'),
  setApiKey: (key: string | null): Promise<boolean> => ipcRenderer.invoke('qw:setKey', key),
  info: (): Promise<{ version: string; platform: string; keyEncrypted: boolean }> => ipcRenderer.invoke('qw:info'),
  openStudio: (characterJson: string, launch: boolean): Promise<string | null> => ipcRenderer.invoke('qw:openStudio', characterJson, launch),
});
