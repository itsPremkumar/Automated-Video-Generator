import { app, ipcMain } from 'electron';
import { DependencyService } from './dependency-service';

type RegisterIpcHandlersOptions = {
    dependencyService: DependencyService;
    getSetupWindow: () => Electron.BrowserWindow | null;
    openExternalSafely: (url: string) => Promise<void>;
    launchAfterSetup: () => Promise<void>;
};

let ipcHandlersRegistered = false;

export function registerIpcHandlers(options: RegisterIpcHandlersOptions) {
    if (ipcHandlersRegistered) {
        return;
    }

    ipcHandlersRegistered = true;

    ipcMain.handle('check-dependencies', () => options.dependencyService.checkAllDependencies());
    ipcMain.handle('install-dependency', async (_event, name: string) => options.dependencyService.installDependency(options.getSetupWindow(), name));
    ipcMain.handle('install-all-dependencies', async () => {
        await options.dependencyService.installAllDependencies(options.getSetupWindow());
        return options.dependencyService.checkAllDependencies();
    });
    ipcMain.handle('open-external', async (_event, url: string) => options.openExternalSafely(url));
    ipcMain.handle('get-app-version', () => app.getVersion());
    ipcMain.handle('launch-after-setup', async () => {
        await options.launchAfterSetup();
        return { ok: true };
    });
    ipcMain.handle('skip-setup', async () => {
        await options.launchAfterSetup();
        return { ok: true };
    });
}
