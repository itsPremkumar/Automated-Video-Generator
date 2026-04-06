import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
    // Setup wizard APIs
    checkDependencies: () => ipcRenderer.invoke('check-dependencies'),
    installDependency: (name: string) => ipcRenderer.invoke('install-dependency', name),
    installAllDependencies: () => ipcRenderer.invoke('install-all-dependencies'),
    openExternal: (url: string) => ipcRenderer.invoke('open-external', url),
    launchAfterSetup: () => ipcRenderer.invoke('launch-after-setup'),
    skipSetup: () => ipcRenderer.invoke('skip-setup'),
    getAppVersion: () => ipcRenderer.invoke('get-app-version'),

    // Listen for progress updates from main process
    onInstallProgress: (callback: (event: any, data: { step: string; message: string; percent: number }) => void) => {
        ipcRenderer.on('install-progress', callback);
    },
    onSetupComplete: (callback: (event: any) => void) => {
        ipcRenderer.on('setup-complete', callback);
    },
    removeAllListeners: (channel: string) => {
        ipcRenderer.removeAllListeners(channel);
    },
});
