import { app, ipcMain } from 'electron';
import { DependencyService } from './dependency-service';
import { DebugInfo, RendererDebugPayload } from './debug-runtime';

type RegisterIpcHandlersOptions = {
    dependencyService: DependencyService;
    getDebugInfo: () => DebugInfo;
    getSetupWindow: () => Electron.BrowserWindow | null;
    launchAfterSetup: () => Promise<void>;
    openDesktopLog: () => Promise<string>;
    openDiagnosticsFolder: () => Promise<string>;
    openExternalSafely: (url: string) => Promise<void>;
    recordRendererDebugLog: (payload: RendererDebugPayload) => void;
};

let ipcHandlersRegistered = false;

function logTag(channel: string): string {
    return `[IPC:${channel}]`;
}

function serializeError(error: unknown): { error: true; message: string; stack?: string } {
    if (error instanceof Error) {
        return {
            error: true,
            message: error.message.slice(0, 1000),
            stack: error.stack?.slice(0, 2000),
        };
    }

    return {
        error: true,
        message: String(error).slice(0, 1000),
    };
}

export function registerIpcHandlers(options: RegisterIpcHandlersOptions): void {
    if (ipcHandlersRegistered) {
        console.log('[IPC] Handlers already registered - skipping');
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
        } catch (error) {
            console.error(tag, 'Failed:', error);
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
        } catch (error) {
            console.error(tag, 'Unhandled error installing', name, ':', error);
            return serializeError(error);
        }
    });

    ipcMain.handle('install-all-dependencies', async () => {
        const tag = logTag('install-all-dependencies');
        console.log(tag, 'Renderer requested install of all missing dependencies');
        try {
            await options.dependencyService.installAllDependencies(options.getSetupWindow());
            const result = options.dependencyService.checkAllDependencies();
            console.log(tag, 'Post-install check:', result.map((dep) => `${dep.name}=${dep.installed ? 'OK' : 'MISSING'}`).join(', '));
            return result;
        } catch (error) {
            console.error(tag, 'Unhandled error during install-all:', error);
            return serializeError(error);
        }
    });

    ipcMain.handle('open-external', async (_event, url: string) => {
        const tag = logTag('open-external');
        console.log(tag, 'Renderer requested open external URL:', url);
        try {
            await options.openExternalSafely(url);
            console.log(tag, 'Opened:', url);
        } catch (error) {
            console.error(tag, 'Failed to open URL:', url, '| Error:', error);
            return serializeError(error);
        }
    });

    ipcMain.handle('get-app-version', () => {
        const version = app.getVersion();
        console.log(logTag('get-app-version'), 'Returning version:', version);
        return version;
    });

    ipcMain.handle('get-debug-info', () => {
        const tag = logTag('get-debug-info');
        console.log(tag, 'Renderer requested desktop debug info');
        try {
            return options.getDebugInfo();
        } catch (error) {
            console.error(tag, 'Failed:', error);
            return serializeError(error);
        }
    });

    ipcMain.handle('open-desktop-log', async () => {
        const tag = logTag('open-desktop-log');
        console.log(tag, 'Renderer requested desktop log file');
        try {
            return await options.openDesktopLog();
        } catch (error) {
            console.error(tag, 'Failed:', error);
            return serializeError(error);
        }
    });

    ipcMain.handle('open-diagnostics-folder', async () => {
        const tag = logTag('open-diagnostics-folder');
        console.log(tag, 'Renderer requested diagnostics folder');
        try {
            return await options.openDiagnosticsFolder();
        } catch (error) {
            console.error(tag, 'Failed:', error);
            return serializeError(error);
        }
    });

    ipcMain.handle('launch-after-setup', async () => {
        const tag = logTag('launch-after-setup');
        console.log(tag, 'Renderer requested launch after setup');
        try {
            await options.launchAfterSetup();
            console.log(tag, 'Launch after setup completed');
            return { ok: true };
        } catch (error) {
            console.error(tag, 'Failed to launch after setup:', error);
            return serializeError(error);
        }
    });

    ipcMain.handle('skip-setup', async () => {
        const tag = logTag('skip-setup');
        console.log(tag, 'Renderer requested skip setup and launch');
        try {
            await options.launchAfterSetup();
            console.log(tag, 'Skip setup launch completed');
            return { ok: true };
        } catch (error) {
            console.error(tag, 'Failed to skip and launch:', error);
            return serializeError(error);
        }
    });

    ipcMain.on('renderer-debug-log', (event, payload: RendererDebugPayload) => {
        try {
            options.recordRendererDebugLog({
                ...payload,
                href: payload.href || event.sender.getURL(),
            });
        } catch (error) {
            console.error(logTag('renderer-debug-log'), 'Failed to record renderer debug log:', error);
        }
    });

    console.log('[IPC] All IPC handlers registered successfully');
}
