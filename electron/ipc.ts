import { app, ipcMain } from 'electron';
import { DependencyService } from './dependency-service';

type RegisterIpcHandlersOptions = {
    dependencyService: DependencyService;
    getSetupWindow: () => Electron.BrowserWindow | null;
    openExternalSafely: (url: string) => Promise<void>;
    launchAfterSetup: () => Promise<void>;
};

let ipcHandlersRegistered = false;

function logTag(channel: string): string {
    return `[IPC:${channel}]`;
}

function serializeError(error: any): { error: true; message: string; stack?: string } {
    const message = error?.message || String(error) || 'Unknown error';
    return {
        error: true,
        message: message.slice(0, 1000),
        stack: error?.stack?.slice(0, 2000),
    };
}

export function registerIpcHandlers(options: RegisterIpcHandlersOptions) {
    if (ipcHandlersRegistered) {
        console.log('[IPC] Handlers already registered — skipping');
        return;
    }

    ipcHandlersRegistered = true;
    console.log('[IPC] Registering all IPC handlers...');

    ipcMain.handle('check-dependencies', async () => {
        const tag = logTag('check-dependencies');
        console.log(tag, 'Renderer requested dependency check');
        try {
            const result = options.dependencyService.checkAllDependencies();
            console.log(tag, 'Returning', result.length, 'dependency statuses');
            return result;
        } catch (error: any) {
            console.error(tag, 'Failed:', error.message);
            console.error(tag, 'Stack:', error.stack);
            return serializeError(error);
        }
    });

    ipcMain.handle('install-dependency', async (_event, name: string) => {
        const tag = logTag('install-dependency');
        console.log(tag, 'Renderer requested install for:', name);
        try {
            const success = await options.dependencyService.installDependency(options.getSetupWindow(), name);
            console.log(tag, 'Install result for', name, ':', success ? 'SUCCESS' : 'FAILED');
            return success;
        } catch (error: any) {
            console.error(tag, 'Unhandled error installing', name, ':', error.message);
            console.error(tag, 'Stack:', error.stack);
            return serializeError(error);
        }
    });

    ipcMain.handle('install-all-dependencies', async () => {
        const tag = logTag('install-all-dependencies');
        console.log(tag, 'Renderer requested install of all missing dependencies');
        try {
            await options.dependencyService.installAllDependencies(options.getSetupWindow());
            const result = options.dependencyService.checkAllDependencies();
            console.log(tag, 'Post-install check:', result.map(d => `${d.name}=${d.installed ? 'OK' : 'MISSING'}`).join(', '));
            return result;
        } catch (error: any) {
            console.error(tag, 'Unhandled error during install-all:', error.message);
            console.error(tag, 'Stack:', error.stack);
            return serializeError(error);
        }
    });

    ipcMain.handle('open-external', async (_event, url: string) => {
        const tag = logTag('open-external');
        console.log(tag, 'Renderer requested open external URL:', url);
        try {
            await options.openExternalSafely(url);
            console.log(tag, '✓ Opened:', url);
        } catch (error: any) {
            console.error(tag, 'Failed to open URL:', url, '| Error:', error.message);
            return serializeError(error);
        }
    });

    ipcMain.handle('get-app-version', () => {
        const version = app.getVersion();
        console.log(logTag('get-app-version'), 'Returning version:', version);
        return version;
    });

    ipcMain.handle('launch-after-setup', async () => {
        const tag = logTag('launch-after-setup');
        console.log(tag, 'Renderer requested launch after setup');
        try {
            await options.launchAfterSetup();
            console.log(tag, '✓ Launch after setup completed');
            return { ok: true };
        } catch (error: any) {
            console.error(tag, 'Failed to launch after setup:', error.message);
            console.error(tag, 'Stack:', error.stack);
            return serializeError(error);
        }
    });

    ipcMain.handle('skip-setup', async () => {
        const tag = logTag('skip-setup');
        console.log(tag, 'Renderer requested skip setup and launch');
        try {
            await options.launchAfterSetup();
            console.log(tag, '✓ Skip setup launch completed');
            return { ok: true };
        } catch (error: any) {
            console.error(tag, 'Failed to skip and launch:', error.message);
            console.error(tag, 'Stack:', error.stack);
            return serializeError(error);
        }
    });

    console.log('[IPC] ✓ All IPC handlers registered successfully');
}
