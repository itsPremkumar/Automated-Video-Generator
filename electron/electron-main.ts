import { app, dialog, shell } from 'electron';
import { execSync } from 'child_process';
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

console.log('[Electron] ============================================');
console.log('[Electron] Automated Video Generator Desktop App');
console.log('[Electron] ============================================');
console.log('[Electron] isDev:', isDev);
console.log('[Electron] appRoot:', appRoot);
console.log('[Electron] __dirname:', __dirname);
console.log('[Electron] process.execPath:', process.execPath);
console.log('[Electron] process.resourcesPath:', process.resourcesPath || '(not set)');
console.log('[Electron] process.platform:', process.platform);
console.log('[Electron] process.arch:', process.arch);
console.log('[Electron] Electron version:', process.versions.electron);
console.log('[Electron] Node.js version:', process.versions.node);
console.log('[Electron] Chrome version:', process.versions.chrome);
console.log('[Electron] PORT:', PORT, '| SERVER_URL:', SERVER_URL);
console.log('[Electron] ============================================');

const dependencyService = new DependencyService({ appRoot });

let portalStartPromise: Promise<void> | null = null;
let isHandlingSetupLaunch = false;
let windowManager: WindowManager;
let serverManager: ServerManager;

// ─── Zombie Process Cleanup ────────────────────────────────────────

/**
 * Kill any zombie node processes that are still listening on PORT.
 * This prevents EADDRINUSE when restarting after a crash.
 */
function killZombieProcessesOnPort(port: number): void {
    const tag = '[Electron:killZombies]';

    if (process.platform !== 'win32') {
        return;
    }

    console.log(tag, `Checking for zombie processes on port ${port}...`);

    try {
        const result = execSync(`netstat -aon | findstr :${port} | findstr LISTENING`, {
            encoding: 'utf8',
            stdio: ['pipe', 'pipe', 'pipe'],
            windowsHide: true,
            timeout: 5000,
        }).trim();

        if (!result) {
            console.log(tag, 'No processes found on port', port);
            return;
        }

        // Parse PIDs from netstat output
        const pids = new Set<number>();
        for (const line of result.split('\n')) {
            const parts = line.trim().split(/\s+/);
            const pid = parseInt(parts[parts.length - 1], 10);
            if (pid > 0 && pid !== process.pid) {
                pids.add(pid);
            }
        }

        if (pids.size === 0) {
            console.log(tag, 'No foreign PIDs to kill');
            return;
        }

        console.log(tag, 'Found zombie PIDs on port', port, ':', Array.from(pids));

        for (const pid of pids) {
            try {
                execSync(`taskkill /F /T /PID ${pid}`, {
                    stdio: 'pipe',
                    windowsHide: true,
                    timeout: 5000,
                });
                console.log(tag, '✓ Killed zombie PID:', pid);
            } catch (killError: any) {
                console.warn(tag, 'Failed to kill PID', pid, ':', killError.message);
            }
        }

        // Wait for port to be released
        console.log(tag, 'Waiting 1s for port to release...');
    } catch (error: any) {
        // netstat returned no results (no process on port) — this is fine
        if (error.status === 1) {
            console.log(tag, 'No processes found on port', port, '(clean)');
            return;
        }
        console.warn(tag, 'Failed to check for zombie processes:', error.message);
    }
}

// ─── URL Safety ────────────────────────────────────────────────────

function canOpenInPortal(url: string): boolean {
    return url === SERVER_URL || url.startsWith(`${SERVER_URL}/`);
}

function canOpenExternalUrl(url: string): boolean {
    try {
        const parsed = new URL(url);
        if (parsed.protocol !== 'https:') {
            console.log('[Electron:canOpenExternalUrl] Blocked non-HTTPS URL:', url);
            return false;
        }

        const allowed = ALLOWED_EXTERNAL_HOSTS.has(parsed.hostname.toLowerCase());
        if (!allowed) {
            console.log('[Electron:canOpenExternalUrl] Blocked non-allowlisted host:', parsed.hostname);
        }
        return allowed;
    } catch (error: any) {
        console.warn('[Electron:canOpenExternalUrl] Invalid URL:', url, '| Error:', error.message);
        return false;
    }
}

async function openExternalSafely(url: string): Promise<void> {
    if (!canOpenInPortal(url) && !canOpenExternalUrl(url)) {
        console.warn('[Electron:openExternalSafely] Blocked external URL:', url);
        throw new Error(`Blocked external URL: ${url}`);
    }

    console.log('[Electron:openExternalSafely] Opening:', url);
    await shell.openExternal(url);
}

// ─── Server Crash Recovery ─────────────────────────────────────────

function handleServerRuntimeCrash(exitCode: number | null, signal: string | null, lastLog: string): void {
    const tag = '[Electron:handleServerCrash]';
    console.error(tag, 'Server process crashed at runtime! Code:', exitCode, '| Signal:', signal);

    // Attempt auto-restart first
    void (async () => {
        console.log(tag, 'Attempting automatic server restart...');
        const restarted = await serverManager.restartServer();

        if (restarted) {
            console.log(tag, '✓ Server auto-restarted successfully');
            // Reload the main window to reconnect
            const mainWindow = windowManager.getMainWindow();
            if (mainWindow && !mainWindow.isDestroyed()) {
                console.log(tag, 'Reloading main window to reconnect...');
                mainWindow.loadURL(SERVER_URL).catch((loadErr: Error) => {
                    console.error(tag, 'Failed to reload main window:', loadErr.message);
                });
            }
            return;
        }

        // Auto-restart failed — show dialog
        console.error(tag, 'Auto-restart failed. Showing recovery dialog...');

        try {
            const response = dialog.showMessageBoxSync({
                type: 'error',
                title: 'Server Crashed',
                message: 'The backend server has stopped unexpectedly.',
                detail: `Exit code: ${exitCode}\nSignal: ${signal}\n\nThis usually happens when video generation runs out of memory or a dependency crashes.\n\nLast log:\n${lastLog.slice(-300) || '(no output)'}`,
                buttons: ['Restart Server', 'Open Setup Wizard', 'Quit'],
                defaultId: 0,
                noLink: true,
            });

            if (response === 0) {
                console.log(tag, 'User chose to restart server');
                void startServerAndShowPortal();
            } else if (response === 1) {
                console.log(tag, 'User chose setup wizard');
                windowManager.createSetupWindow();
            } else {
                console.log(tag, 'User chose to quit');
                app.quit();
            }
        } catch (dialogErr: any) {
            console.error(tag, 'Failed to show crash dialog:', dialogErr.message);
        }
    })();
}

// ─── Create Managers ───────────────────────────────────────────────

serverManager = new ServerManager({
    appRoot,
    port: PORT,
    onRuntimeCrash: handleServerRuntimeCrash,
});

windowManager = new WindowManager({
    isDev,
    serverUrl: SERVER_URL,
    openExternalSafely,
    onQuit: () => {
        console.log('[Electron] Quit requested from tray/menu');
        serverManager.stopServer();
        windowManager.destroyTray();
        app.quit();
    },
    shouldQuitAfterSetupClosed: (): boolean => {
        const shouldQuit = !windowManager.getMainWindow() && !portalStartPromise && !isHandlingSetupLaunch;
        console.log('[Electron] shouldQuitAfterSetupClosed:', shouldQuit,
            '| mainWindow:', !!windowManager.getMainWindow(),
            '| portalStartPromise:', !!portalStartPromise,
            '| isHandlingSetupLaunch:', isHandlingSetupLaunch);
        return shouldQuit;
    },
});

// ─── Startup Flow ──────────────────────────────────────────────────

async function startServerAndShowPortal() {
    const tag = '[Electron:startServerAndShowPortal]';
    if (portalStartPromise) {
        console.log(tag, 'Portal start already in progress — returning existing promise');
        return portalStartPromise;
    }

    portalStartPromise = (async () => {
        console.log(tag, '=== Starting server and showing portal ===');
        try {
            if (!windowManager.hasTray()) {
                console.log(tag, 'Creating system tray...');
                windowManager.createTray();
            }

            if (!serverManager.hasServerProcess()) {
                console.log(tag, 'Starting backend server...');
                try {
                    await serverManager.startServer();
                } catch (serverError: any) {
                    console.error(tag, 'Server failed to start:', serverError.message);
                    // Offer to open setup wizard instead of dying
                    const response = dialog.showMessageBoxSync({
                        type: 'error',
                        title: 'Server Startup Failed',
                        message: 'The backend server could not start.',
                        detail: `${serverError.message}\n\nWould you like to open the setup wizard to check dependencies, or quit?`,
                        buttons: ['Open Setup Wizard', 'Retry', 'Quit'],
                        defaultId: 0,
                    });

                    if (response === 2) {
                        console.log(tag, 'User chose to quit after server failure');
                        app.quit();
                        throw serverError;
                    }

                    if (response === 1) {
                        console.log(tag, 'User chose to retry server start');
                        await serverManager.startServer();
                    } else {
                        console.log(tag, 'User chose setup wizard after server failure');
                        windowManager.createSetupWindow();
                        return;
                    }
                }

                console.log(tag, 'Waiting 2s for server to stabilize...');
                await new Promise((resolve) => setTimeout(resolve, 2000));
            } else {
                console.log(tag, 'Server process already running');
            }

            console.log(tag, 'Creating main window...');
            windowManager.createMainWindow();
            windowManager.closeSetupWindow();
            windowManager.showMainWindow();
            console.log(tag, '✓ Portal is ready');
        } catch (error: any) {
            console.error(tag, 'Fatal error during startup:', error.message);
            console.error(tag, 'Stack:', error.stack);

            try {
                dialog.showErrorBox(
                    'Startup Error',
                    `Failed to start the video generator server.\n\n${error.message}\n\nMake sure all dependencies are installed.\n\nCheck the console/log output for more details.`,
                );
            } catch (dialogError: any) {
                console.error(tag, 'Failed to show error dialog:', dialogError.message);
            }

            app.quit();
            throw error;
        } finally {
            portalStartPromise = null;
        }
    })();

    return portalStartPromise;
}

async function launchAfterSetup() {
    const tag = '[Electron:launchAfterSetup]';
    console.log(tag, 'Starting launch after setup...');
    isHandlingSetupLaunch = true;
    try {
        await startServerAndShowPortal();
        windowManager.closeSetupWindow();
        console.log(tag, '✓ Launch after setup complete');
    } catch (error: any) {
        console.error(tag, 'Launch after setup failed:', error.message);
        throw error;
    } finally {
        isHandlingSetupLaunch = false;
    }
}

async function launchApp() {
    const tag = '[Electron:launchApp]';
    console.log(tag, '=== Launching application ===');

    try {
        // Step 0: Kill any zombie processes from a previous crash
        killZombieProcessesOnPort(PORT);

        // Wait for port cleanup
        await new Promise((resolve) => setTimeout(resolve, 1000));

        registerIpcHandlers({
            dependencyService,
            getSetupWindow: () => windowManager.getSetupWindow(),
            openExternalSafely,
            launchAfterSetup,
        });

        console.log(tag, 'Verifying voice engine...');
        const voiceEngineCheck = dependencyService.verifyVoiceEngine();
        console.log(tag, 'Voice engine check result:', JSON.stringify(voiceEngineCheck));

        if (!voiceEngineCheck.ok) {
            console.warn(tag, 'Voice engine check failed:', voiceEngineCheck.detail);
            const response = dialog.showMessageBoxSync({
                type: 'warning',
                title: 'Voice Engine Not Found',
                message: 'The bundled voice engine could not be verified.\n\nThe app can still launch, but installing or repairing the voice engine is recommended for the best narration quality.',
                detail: voiceEngineCheck.detail,
                buttons: ['Launch Anyway', 'Install Dependencies', 'Quit'],
                defaultId: 0,
            });

            console.log(tag, 'User response to voice engine dialog:', response, '(0=Launch, 1=Install, 2=Quit)');

            if (response === 2) {
                console.log(tag, 'User chose to quit');
                app.quit();
                return;
            }

            if (response === 1) {
                console.log(tag, 'User chose to install dependencies — opening setup wizard');
                windowManager.createSetupWindow();
                return;
            }

            console.log(tag, 'User chose to launch anyway');
        }

        await startServerAndShowPortal();
    } catch (error: any) {
        console.error(tag, 'Fatal error in launchApp:', error.message);
        console.error(tag, 'Stack:', error.stack);

        try {
            dialog.showErrorBox(
                'Application Error',
                `An unexpected error occurred while launching the application.\n\n${error.message}\n\nPlease report this issue on GitHub.`,
            );
        } catch (dialogError: any) {
            console.error(tag, 'Failed to show error dialog:', dialogError.message);
        }

        app.quit();
    }
}

// ─── Single Instance Lock & App Lifecycle ──────────────────────────

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
    console.log('[Electron] Another instance is already running — quitting');
    app.quit();
} else {
    console.log('[Electron] Single instance lock acquired');

    app.on('second-instance', () => {
        console.log('[Electron] Second instance detected — focusing existing window');
        if (windowManager.getMainWindow()) {
            windowManager.showMainWindow();
            return;
        }

        if (windowManager.getSetupWindow()) {
            windowManager.showSetupWindow();
        }
    });

    app.whenReady().then(() => {
        console.log('[Electron] App is ready — calling launchApp()');
        launchApp();
    }).catch((error: any) => {
        console.error('[Electron] CRITICAL: app.whenReady() rejected:', error.message);
        console.error('[Electron] Stack:', error.stack);
        try {
            dialog.showErrorBox(
                'Critical Startup Error',
                `The application failed to initialize.\n\n${error.message}`,
            );
        } catch {
            // Last resort — we can't even show a dialog
        }
        app.quit();
    });

    app.on('window-all-closed', () => {
        console.log('[Electron] All windows closed — staying in tray on Windows');
        // Keep running in tray on Windows.
    });

    app.on('activate', () => {
        console.log('[Electron] App activated');
        if (windowManager.getMainWindow() !== null) {
            console.log('[Electron] Main window exists — not creating new one');
            return;
        }

        if (serverManager.hasServerProcess() || windowManager.hasTray() || dependencyService.allDependenciesReady()) {
            console.log('[Electron] Server/tray/deps ready — starting portal');
            void startServerAndShowPortal();
            return;
        }

        if (windowManager.getSetupWindow() === null) {
            console.log('[Electron] No windows and server not running — showing setup');
            windowManager.createSetupWindow();
        }
    });

    app.on('before-quit', () => {
        console.log('[Electron] before-quit event — cleaning up');
        serverManager.stopServer();
        windowManager.destroyTray();
    });

    // Global unhandled rejection handler
    process.on('unhandledRejection', (reason: any) => {
        console.error('[Electron] UNHANDLED REJECTION:', reason?.message || reason);
        console.error('[Electron] Stack:', reason?.stack);
    });

    // Global uncaught exception handler
    process.on('uncaughtException', (error: Error) => {
        console.error('[Electron] UNCAUGHT EXCEPTION:', error.message);
        console.error('[Electron] Stack:', error.stack);
        try {
            dialog.showErrorBox(
                'Unexpected Error',
                `An unexpected error occurred:\n\n${error.message}\n\nThe application will try to continue, but may be unstable.`,
            );
        } catch {
            // Best effort
        }
    });
}
