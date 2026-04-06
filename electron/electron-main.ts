import { app, dialog, shell } from 'electron';
import * as path from 'path';
import { DependencyService } from './dependency-service';
import { registerIpcHandlers } from './ipc';
import { ServerManager } from './server-manager';
import { WindowManager } from './window-manager';

const isDev = !app.isPackaged;
const appRoot = path.resolve(__dirname, '..');
const PORT = 3001;
const SERVER_URL = `http://localhost:${PORT}`;
const ALLOWED_EXTERNAL_HOSTS = new Set(['github.com', 'www.github.com']);

const dependencyService = new DependencyService({ appRoot });
const serverManager = new ServerManager({ appRoot, port: PORT });

let portalStartPromise: Promise<void> | null = null;
let isHandlingSetupLaunch = false;
let windowManager: WindowManager;

function canOpenInPortal(url: string): boolean {
    return url === SERVER_URL || url.startsWith(`${SERVER_URL}/`);
}

function canOpenExternalUrl(url: string): boolean {
    try {
        const parsed = new URL(url);
        if (parsed.protocol !== 'https:') {
            return false;
        }

        return ALLOWED_EXTERNAL_HOSTS.has(parsed.hostname.toLowerCase());
    } catch {
        return false;
    }
}

async function openExternalSafely(url: string): Promise<void> {
    if (!canOpenInPortal(url) && !canOpenExternalUrl(url)) {
        throw new Error(`Blocked external URL: ${url}`);
    }

    await shell.openExternal(url);
}

windowManager = new WindowManager({
    isDev,
    serverUrl: SERVER_URL,
    openExternalSafely,
    onQuit: () => {
        serverManager.stopServer();
        windowManager.destroyTray();
        app.quit();
    },
    shouldQuitAfterSetupClosed: (): boolean => !windowManager.getMainWindow() && !portalStartPromise && !isHandlingSetupLaunch,
});

async function startServerAndShowPortal() {
    if (portalStartPromise) {
        return portalStartPromise;
    }

    portalStartPromise = (async () => {
        try {
            if (!windowManager.hasTray()) {
                windowManager.createTray();
            }

            if (!serverManager.hasServerProcess()) {
                await serverManager.startServer();
                await new Promise((resolve) => setTimeout(resolve, 2000));
            }

            windowManager.createMainWindow();
            windowManager.closeSetupWindow();
            windowManager.showMainWindow();
        } catch (error: any) {
            dialog.showErrorBox(
                'Startup Error',
                `Failed to start the video generator server.\n\n${error.message}\n\nMake sure all dependencies are installed.`,
            );
            app.quit();
            throw error;
        } finally {
            portalStartPromise = null;
        }
    })();

    return portalStartPromise;
}

async function launchAfterSetup() {
    isHandlingSetupLaunch = true;
    try {
        await startServerAndShowPortal();
        windowManager.closeSetupWindow();
    } finally {
        isHandlingSetupLaunch = false;
    }
}

async function launchApp() {
    registerIpcHandlers({
        dependencyService,
        getSetupWindow: () => windowManager.getSetupWindow(),
        openExternalSafely,
        launchAfterSetup,
    });

    const voiceEngineCheck = dependencyService.verifyVoiceEngine();
    if (!voiceEngineCheck.ok) {
        console.warn('[Electron] Voice engine check failed:', voiceEngineCheck.detail);
        const response = dialog.showMessageBoxSync({
            type: 'warning',
            title: 'Voice Engine Not Found',
            message: 'The bundled voice engine could not be verified.\n\nThe app can still launch, but installing or repairing the voice engine is recommended for the best narration quality.',
            detail: voiceEngineCheck.detail,
            buttons: ['Launch Anyway', 'Install Dependencies', 'Quit'],
            defaultId: 0,
        });

        if (response === 2) {
            app.quit();
            return;
        }

        if (response === 1) {
            windowManager.createSetupWindow();
            return;
        }
    }

    await startServerAndShowPortal();
}

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
    app.quit();
} else {
    app.on('second-instance', () => {
        if (windowManager.getMainWindow()) {
            windowManager.showMainWindow();
            return;
        }

        if (windowManager.getSetupWindow()) {
            windowManager.showSetupWindow();
        }
    });

    app.whenReady().then(launchApp);

    app.on('window-all-closed', () => {
        // Keep running in tray on Windows.
    });

    app.on('activate', () => {
        if (windowManager.getMainWindow() !== null) {
            return;
        }

        if (serverManager.hasServerProcess() || windowManager.hasTray() || dependencyService.allDependenciesReady()) {
            void startServerAndShowPortal();
            return;
        }

        if (windowManager.getSetupWindow() === null) {
            windowManager.createSetupWindow();
        }
    });

    app.on('before-quit', () => {
        serverManager.stopServer();
        windowManager.destroyTray();
    });
}
