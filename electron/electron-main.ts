import { app, dialog, shell } from 'electron';
import { execSync } from 'child_process';
import * as path from 'path';
import { getDesktopLogFilePath, installDesktopLogging, writeDesktopLog } from './app-logger';
import { DebugRuntime } from './debug-runtime';
import { DependencyService } from './dependency-service';
import { registerIpcHandlers } from './ipc';
import { ServerManager } from './server-manager';
import { WindowManager } from './window-manager';

process.env.AUTOMATED_VIDEO_GENERATOR_DATA_ROOT = process.env.AUTOMATED_VIDEO_GENERATOR_DATA_ROOT?.trim() || app.getPath('userData');
installDesktopLogging();

// In packaged Electron on Windows, process.stdout/stderr are pipes.
// If the pipe reader disappears, writes throw EPIPE. Absorb these errors
// so they don't surface as uncaught exceptions that crash the app.
for (const stream of [process.stdout, process.stderr]) {
    stream?.on?.('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'EPIPE') return;
        writeDesktopLog('error', `[Electron] stdout/stderr stream error: ${err.message}`);
    });
}

const isDev = !app.isPackaged;
const appRoot = path.resolve(__dirname, '..');
const PORT = 3001;
const SERVER_URL = `http://localhost:${PORT}`;
const ALLOWED_EXTERNAL_HOSTS = new Set(['github.com', 'www.github.com']);

const debugRuntime = new DebugRuntime({
    appRoot,
    isDev,
    serverUrl: SERVER_URL,
});
debugRuntime.configureEarly();

console.log('[Electron] ============================================');
console.log('[Electron] Automated Video Generator Desktop App');
console.log('[Electron] ============================================');
console.log('[Electron] isDev:', isDev);
console.log('[Electron] appRoot:', appRoot);
console.log('[Electron] __dirname:', __dirname);
console.log('[Electron] process.execPath:', process.execPath);
console.log('[Electron] process.resourcesPath:', process.resourcesPath || '(not set)');
console.log('[Electron] dataRoot:', process.env.AUTOMATED_VIDEO_GENERATOR_DATA_ROOT);
console.log('[Electron] desktopLog:', getDesktopLogFilePath());
console.log('[Electron] debugInfo:', JSON.stringify(debugRuntime.getDebugInfo()));
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
let recoveryDialogOpen = false;
let windowManager: WindowManager;
let serverManager: ServerManager;

function getRuntimeState() {
    return {
        setupWindowOpen: Boolean(windowManager?.getSetupWindow()),
        serverProcessRunning: Boolean(serverManager?.hasServerProcess()),
        mainWindowOpen: Boolean(windowManager?.getMainWindow()),
        portalStartInProgress: Boolean(portalStartPromise),
        setupLaunchInProgress: isHandlingSetupLaunch,
        trayActive: Boolean(windowManager?.hasTray()),
        restartCount: serverManager?.getRestartCount?.() ?? 0,
    };
}

function withDebugHints(detail: string, snapshotPath?: string | null): string {
    const info = debugRuntime.getDebugInfo();
    const parts = [
        detail,
        `Desktop log: ${info.desktopLogFilePath}`,
        `Chromium log: ${info.chromiumLogFilePath}`,
        `Crash dumps: ${info.crashDumpsDirPath}`,
        `Diagnostics folder: ${info.diagnosticsDirPath}`,
    ];

    if (snapshotPath) {
        parts.push(`Snapshot: ${snapshotPath}`);
    }

    if (info.remoteDebuggingPort !== null) {
        parts.push(`Remote debugging port: ${info.remoteDebuggingPort}`);
    }

    return parts.join('\n\n');
}

function toggleDebugTools(): void {
    const targetWindow = windowManager.getMainWindow() || windowManager.getSetupWindow();
    debugRuntime.maybeToggleDevTools(targetWindow);
}

function showRecoveryDialog(title: string, message: string, detail: string): void {
    const tag = '[Electron:recovery]';
    const snapshotPath = debugRuntime.captureFailureSnapshot('recovery-dialog', new Error(message), {
        detail,
        title,
    });
    const detailWithHints = withDebugHints(detail, snapshotPath);
    writeDesktopLog('error', `${title}: ${message}\n${detailWithHints}`);

    if (!app.isReady()) {
        try {
            dialog.showErrorBox(title, `${message}\n\n${detailWithHints}`);
        } catch {
            // Best effort before the app is ready.
        }
        return;
    }

    try {
        if (typeof windowManager !== 'undefined' && !windowManager.hasTray()) {
            windowManager.createTray();
        }
        if (typeof windowManager !== 'undefined') {
            windowManager.createSetupWindow();
        }
    } catch (windowError: any) {
        console.error(tag, 'Failed to prepare recovery UI:', windowError.message);
    }

    if (recoveryDialogOpen) {
        return;
    }

    recoveryDialogOpen = true;
    try {
        const response = dialog.showMessageBoxSync({
            buttons: ['Open Setup Wizard', 'Keep Running', 'Quit'],
            cancelId: 1,
            defaultId: 0,
            detail: detailWithHints,
            message,
            noLink: true,
            title,
            type: 'error',
        });

        if (response === 0 && typeof windowManager !== 'undefined') {
            windowManager.createSetupWindow();
        }

        if (response === 2) {
            if (typeof serverManager !== 'undefined') {
                serverManager.stopServer();
            }
            if (typeof windowManager !== 'undefined') {
                windowManager.destroyTray();
            }
            app.quit();
        }
    } catch (dialogError: any) {
        console.error(tag, 'Failed to show recovery dialog:', dialogError.message);
    } finally {
        recoveryDialogOpen = false;
    }
}

function getProcessImageName(pid: number): string | null {
    try {
        const output = execSync(`tasklist /FI "PID eq ${pid}" /FO CSV /NH`, {
            encoding: 'utf8',
            stdio: ['pipe', 'pipe', 'pipe'],
            timeout: 5000,
            windowsHide: true,
        }).trim();

        if (!output || output.startsWith('INFO:')) {
            return null;
        }

        const match = /^"([^"]+)"/.exec(output.split(/\r?\n/)[0]);
        return match?.[1]?.toLowerCase() || null;
    } catch {
        return null;
    }
}

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
            timeout: 5000,
            windowsHide: true,
        }).trim();

        if (!result) {
            console.log(tag, 'No processes found on port', port);
            return;
        }

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
        const currentImageName = path.basename(process.execPath).toLowerCase();

        for (const pid of pids) {
            const imageName = getProcessImageName(pid);
            if (imageName && imageName !== currentImageName) {
                console.log(tag, `Skipping PID ${pid} on port ${port} because it belongs to ${imageName}, not ${currentImageName}`);
                continue;
            }

            try {
                execSync(`taskkill /F /T /PID ${pid}`, {
                    stdio: 'pipe',
                    timeout: 5000,
                    windowsHide: true,
                });
                console.log(tag, 'Killed zombie PID:', pid);
            } catch (killError: any) {
                console.warn(tag, 'Failed to kill PID', pid, ':', killError.message);
            }
        }
    } catch (error: any) {
        if (error.status === 1) {
            console.log(tag, 'No processes found on port', port, '(clean)');
            return;
        }
        console.warn(tag, 'Failed to check for zombie processes:', error.message);
    }
}

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

function handleServerRuntimeCrash(exitCode: number | null, signal: string | null, lastLog: string): void {
    const tag = '[Electron:handleServerCrash]';
    const snapshotPath = debugRuntime.captureFailureSnapshot('server-runtime-crash', new Error(`exit=${exitCode} signal=${signal}`), {
        exitCode,
        lastLog,
        signal,
    });
    console.error(tag, 'Server process crashed at runtime! Code:', exitCode, '| Signal:', signal);

    void (async () => {
        console.log(tag, 'Attempting automatic server restart...');
        const restarted = await serverManager.restartServer();

        if (restarted) {
            console.log(tag, 'Server auto-restarted successfully');
            const mainWindow = windowManager.getMainWindow();
            if (mainWindow && !mainWindow.isDestroyed()) {
                console.log(tag, 'Reloading main window to reconnect...');
                mainWindow.loadURL(SERVER_URL).catch((loadErr: Error) => {
                    console.error(tag, 'Failed to reload main window:', loadErr.message);
                });
            }
            return;
        }

        const detail = withDebugHints(
            `Exit code: ${exitCode}\nSignal: ${signal}\n\nThis usually happens when video generation runs out of memory or a dependency crashes.\n\nLast log:\n${lastLog.slice(-300) || '(no output)'}`,
            snapshotPath,
        );

        try {
            const response = dialog.showMessageBoxSync({
                buttons: ['Restart Server', 'Open Setup Wizard', 'Quit'],
                defaultId: 0,
                detail,
                message: 'The backend server has stopped unexpectedly.',
                noLink: true,
                title: 'Server Crashed',
                type: 'error',
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
            showRecoveryDialog(
                'Server Recovery Needed',
                'The backend server stopped unexpectedly and recovery options could not be shown normally.',
                detail,
            );
        }
    })();
}

serverManager = new ServerManager({
    appRoot,
    onRuntimeCrash: handleServerRuntimeCrash,
    port: PORT,
});

windowManager = new WindowManager({
    isDev,
    onQuit: () => {
        console.log('[Electron] Quit requested from tray/menu');
        serverManager.stopServer();
        windowManager.destroyTray();
        app.quit();
    },
    onWindowCreated: (kind, window) => {
        debugRuntime.registerWindow(kind, window);
    },
    openDesktopLog: () => {
        void debugRuntime.openDesktopLog();
    },
    openDiagnosticsFolder: () => {
        void debugRuntime.openDiagnosticsFolder();
    },
    openExternalSafely,
    serverUrl: SERVER_URL,
    shouldQuitAfterSetupClosed: (): boolean => {
        const shouldQuit = !windowManager.getMainWindow()
            && !windowManager.hasTray()
            && !serverManager.hasServerProcess()
            && !portalStartPromise
            && !isHandlingSetupLaunch;
        console.log('[Electron] shouldQuitAfterSetupClosed:', shouldQuit,
            '| mainWindow:', !!windowManager.getMainWindow(),
            '| tray:', windowManager.hasTray(),
            '| server:', serverManager.hasServerProcess(),
            '| portalStartPromise:', !!portalStartPromise,
            '| isHandlingSetupLaunch:', isHandlingSetupLaunch);
        return shouldQuit;
    },
    toggleDevTools: toggleDebugTools,
});

debugRuntime.setStateProviders({
    getDependencyState: () => dependencyService.checkAllDependencies(),
    getRuntimeState,
});
debugRuntime.attachAppEventListeners();
debugRuntime.captureSnapshot('bootstrap', { stage: 'electron-main-init' }, false);

async function startServerAndShowPortal() {
    const tag = '[Electron:startServerAndShowPortal]';
    if (portalStartPromise) {
        console.log(tag, 'Portal start already in progress; returning existing promise');
        return portalStartPromise;
    }

    portalStartPromise = (async () => {
        console.log(tag, 'Starting server and showing portal');
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
                    const snapshotPath = debugRuntime.captureFailureSnapshot('server-startup', serverError, {
                        runtime: getRuntimeState(),
                    });
                    console.error(tag, 'Server failed to start:', serverError.message);
                    const response = dialog.showMessageBoxSync({
                        buttons: ['Open Setup Wizard', 'Retry', 'Quit'],
                        defaultId: 0,
                        detail: withDebugHints(`${serverError.message}\n\nWould you like to open the setup wizard to check dependencies, retry, or quit?`, snapshotPath),
                        message: 'The backend server could not start.',
                        title: 'Server Startup Failed',
                        type: 'error',
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

                console.log(tag, 'Waiting 2 seconds for server to stabilize...');
                await new Promise((resolve) => setTimeout(resolve, 2000));
            } else {
                console.log(tag, 'Server process already running');
            }

            console.log(tag, 'Creating main window...');
            windowManager.createMainWindow();
            windowManager.closeSetupWindow();
            windowManager.showMainWindow();
            debugRuntime.captureSnapshot('portal-ready', { runtime: getRuntimeState() }, false);
            console.log(tag, 'Portal is ready');
        } catch (error: any) {
            const snapshotPath = debugRuntime.captureFailureSnapshot('startup-flow', error, {
                runtime: getRuntimeState(),
            });
            console.error(tag, 'Fatal error during startup:', error.message);
            console.error(tag, 'Stack:', error.stack);
            showRecoveryDialog(
                'Startup Error',
                'Failed to start the video generator server.',
                `${error.message}\n\nMake sure all dependencies are installed.${snapshotPath ? `\n\nSnapshot: ${snapshotPath}` : ''}`,
            );
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
        console.log(tag, 'Launch after setup complete');
    } catch (error: any) {
        const snapshotPath = debugRuntime.captureFailureSnapshot('launch-after-setup', error, {
            runtime: getRuntimeState(),
        });
        console.error(tag, 'Launch after setup failed:', error.message);
        console.error(tag, 'Snapshot:', snapshotPath || '(not written)');
        throw error;
    } finally {
        isHandlingSetupLaunch = false;
    }
}

async function launchApp() {
    const tag = '[Electron:launchApp]';
    console.log(tag, 'Launching application');

    try {
        debugRuntime.captureSnapshot('launch-start', { runtime: getRuntimeState() }, true);
        killZombieProcessesOnPort(PORT);
        await new Promise((resolve) => setTimeout(resolve, 1000));

        registerIpcHandlers({
            dependencyService,
            getDebugInfo: () => debugRuntime.getDebugInfo(),
            getSetupWindow: () => windowManager.getSetupWindow(),
            launchAfterSetup,
            openDesktopLog: () => debugRuntime.openDesktopLog(),
            openDiagnosticsFolder: () => debugRuntime.openDiagnosticsFolder(),
            openExternalSafely,
            recordRendererDebugLog: (payload) => {
                debugRuntime.writeRendererDebugLog(payload);
            },
        });

        console.log(tag, 'Verifying voice engine...');
        let voiceEngineCheck = dependencyService.verifyVoiceEngine();
        let voiceEngineRepairDetail = '';
        console.log(tag, 'Voice engine check result:', JSON.stringify(voiceEngineCheck));

        if (!voiceEngineCheck.ok) {
            const repairResult = dependencyService.tryAutoRepairVoiceEngine();
            console.log(tag, 'Voice engine auto-repair result:', JSON.stringify(repairResult));
            voiceEngineRepairDetail = repairResult.detail;

            if (repairResult.attempted && repairResult.repaired) {
                voiceEngineCheck = dependencyService.verifyVoiceEngine();
                console.log(tag, 'Voice engine re-check after repair:', JSON.stringify(voiceEngineCheck));
            }
        }

        if (!voiceEngineCheck.ok) {
            console.warn(tag, 'Voice engine check failed:', voiceEngineCheck.detail);
            const response = dialog.showMessageBoxSync({
                buttons: ['Launch Anyway', 'Install Dependencies', 'Quit'],
                defaultId: 0,
                detail: withDebugHints(
                    `${voiceEngineCheck.detail}${voiceEngineRepairDetail ? `\n\nAutomatic repair: ${voiceEngineRepairDetail}` : ''}`,
                ),
                message: 'The bundled voice engine could not be verified.\n\nThe app can still launch, but installing or repairing the voice engine is recommended for the best narration quality.',
                title: 'Voice Engine Not Found',
                type: 'warning',
            });

            console.log(tag, 'User response to voice engine dialog:', response, '(0=Launch, 1=Install, 2=Quit)');

            if (response === 2) {
                console.log(tag, 'User chose to quit');
                app.quit();
                return;
            }

            if (response === 1) {
                console.log(tag, 'User chose to install dependencies; opening setup wizard');
                windowManager.createSetupWindow();
                return;
            }

            console.log(tag, 'User chose to launch anyway');
        }

        await startServerAndShowPortal();
        debugRuntime.captureSnapshot('launch-complete', { runtime: getRuntimeState() }, false);
    } catch (error: any) {
        const snapshotPath = debugRuntime.captureFailureSnapshot('launch-app', error, {
            runtime: getRuntimeState(),
        });
        console.error(tag, 'Fatal error in launchApp:', error.message);
        console.error(tag, 'Stack:', error.stack);
        showRecoveryDialog(
            'Application Error',
            'An unexpected error occurred while launching the application.',
            `${error.message}\n\nThe app has been placed into recovery mode instead of exiting.${snapshotPath ? `\n\nSnapshot: ${snapshotPath}` : ''}`,
        );
    }
}

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
    console.log('[Electron] Another instance is already running; quitting');
    app.quit();
} else {
    console.log('[Electron] Single instance lock acquired');

    app.on('second-instance', () => {
        console.log('[Electron] Second instance detected; focusing existing window');
        if (windowManager.getMainWindow()) {
            windowManager.showMainWindow();
            return;
        }

        if (windowManager.getSetupWindow()) {
            windowManager.showSetupWindow();
        }
    });

    app.whenReady().then(() => {
        console.log('[Electron] App is ready; calling launchApp()');
        debugRuntime.captureSnapshot('app-ready', { runtime: getRuntimeState() }, true);
        void launchApp();
    }).catch((error: any) => {
        const snapshotPath = debugRuntime.captureFailureSnapshot('when-ready', error);
        console.error('[Electron] CRITICAL: app.whenReady() rejected:', error.message);
        console.error('[Electron] Stack:', error.stack);
        try {
            dialog.showErrorBox(
                'Critical Startup Error',
                withDebugHints(`The application failed to initialize.\n\n${error.message}`, snapshotPath),
            );
        } catch {
            // Last resort: we cannot show a dialog.
        }
        app.quit();
    });

    app.on('window-all-closed', () => {
        console.log('[Electron] All windows closed; staying in tray on Windows');
    });

    app.on('activate', () => {
        console.log('[Electron] App activated');
        if (windowManager.getMainWindow() !== null) {
            console.log('[Electron] Main window exists; not creating a new one');
            return;
        }

        if (serverManager.hasServerProcess() || windowManager.hasTray() || dependencyService.allDependenciesReady()) {
            console.log('[Electron] Server, tray, or core runtime is ready; starting portal');
            void startServerAndShowPortal();
            return;
        }

        if (windowManager.getSetupWindow() === null) {
            console.log('[Electron] No windows are open; showing setup');
            windowManager.createSetupWindow();
        }
    });

    app.on('before-quit', () => {
        console.log('[Electron] before-quit event; cleaning up');
        serverManager.stopServer();
        windowManager.destroyTray();
    });

    process.on('unhandledRejection', (reason: any) => {
        const snapshotPath = debugRuntime.captureFailureSnapshot('unhandled-rejection', reason, {
            runtime: getRuntimeState(),
        });
        console.error('[Electron] UNHANDLED REJECTION:', reason?.message || reason);
        console.error('[Electron] Stack:', reason?.stack);
        writeDesktopLog('error', `[Electron] unhandled rejection: ${reason?.stack || reason?.message || String(reason)}`);
        console.error('[Electron] Snapshot:', snapshotPath || '(not written)');
    });

    process.on('warning', (warning) => {
        console.warn('[Electron] PROCESS WARNING:', warning.name, warning.message);
        writeDesktopLog('warn', `[Electron] process warning: ${warning.name}: ${warning.message}`);
    });

    process.on('uncaughtException', (error: Error & { code?: string }) => {
        // EPIPE from process.stdout/stderr is harmless in packaged mode
        // (no console attached). The stream error handlers already absorb it.
        if (error.code === 'EPIPE') {
            writeDesktopLog('warn', `[Electron] Suppressed EPIPE uncaught exception (broken stdout/stderr pipe)`);
            return;
        }

        const snapshotPath = debugRuntime.captureFailureSnapshot('uncaught-exception', error, {
            runtime: getRuntimeState(),
        });
        console.error('[Electron] UNCAUGHT EXCEPTION:', error.message);
        console.error('[Electron] Stack:', error.stack);
        showRecoveryDialog(
            'Unexpected Error',
            'The desktop shell hit an unexpected error.',
            `${error.message}\n\nThe app will stay open in recovery mode so you can inspect setup and logs.${snapshotPath ? `\n\nSnapshot: ${snapshotPath}` : ''}`,
        );
    });
}
