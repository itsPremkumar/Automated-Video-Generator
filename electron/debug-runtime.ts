import { app, BrowserWindow, crashReporter, shell, WebContents } from 'electron';
import * as os from 'os';
import * as path from 'path';
import {
    getDesktopCrashDumpsDirPath,
    getDesktopDiagnosticsDirPath,
    getDesktopLogDirPath,
    getDesktopLogFilePath,
    writeDesktopDiagnosticSnapshot,
    writeDesktopLog,
} from './app-logger';

type DebugLevel = 'debug' | 'error' | 'info' | 'warn';
type WindowKind = 'main' | 'setup';

type DebugRuntimeOptions = {
    appRoot: string;
    isDev: boolean;
    serverUrl: string;
};

type DebugStateProviders = {
    getDependencyState?: () => unknown;
    getRuntimeState?: () => unknown;
};

export type RendererDebugPayload = {
    column?: number;
    extra?: unknown;
    href?: string;
    level?: string;
    line?: number;
    message?: string;
    sessionId?: string;
    source?: string;
    stack?: string;
    timestamp?: string;
    title?: string;
};

export type DebugInfo = {
    appRoot: string;
    chromiumLogFilePath: string;
    crashDumpsDirPath: string;
    desktopLogFilePath: string;
    diagnosticsDirPath: string;
    enabled: boolean;
    isDev: boolean;
    openDevTools: boolean;
    remoteDebuggingPort: number | null;
    serverUrl: string;
    sessionId: string;
};

function hasDebugFlag(flag: string): boolean {
    return process.argv.includes(flag);
}

function normalizeRendererLevel(level: string | undefined): DebugLevel {
    switch ((level || '').toLowerCase()) {
        case 'debug':
            return 'debug';
        case 'error':
            return 'error';
        case 'warn':
        case 'warning':
            return 'warn';
        default:
            return 'info';
    }
}

function serializeError(error: unknown): Record<string, unknown> {
    if (error instanceof Error) {
        return {
            message: error.message,
            name: error.name,
            stack: error.stack,
        };
    }

    return {
        value: String(error),
    };
}

function toSerializable(value: unknown, depth = 0): unknown {
    if (depth > 5) {
        return '[max-depth]';
    }

    if (value === null || value === undefined) {
        return value;
    }

    if (value instanceof Error) {
        return serializeError(value);
    }

    if (typeof value === 'bigint') {
        return value.toString();
    }

    if (typeof value === 'function') {
        return `[function ${value.name || 'anonymous'}]`;
    }

    if (Array.isArray(value)) {
        return value.slice(0, 50).map((entry) => toSerializable(entry, depth + 1));
    }

    if (typeof value === 'object') {
        const output: Record<string, unknown> = {};
        let count = 0;
        for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
            output[key] = toSerializable(entry, depth + 1);
            count += 1;
            if (count >= 50) {
                output.__truncated__ = true;
                break;
            }
        }
        return output;
    }

    return value;
}

export class DebugRuntime {
    private readonly chromiumLogFilePath: string;
    private readonly crashDumpsDirPath: string;
    private readonly diagnosticsDirPath: string;
    private readonly desktopLogFilePath: string;
    private readonly enabled: boolean;
    private readonly openDevTools: boolean;
    private readonly remoteDebuggingPort: number | null;
    private readonly sessionId: string;
    private appEventListenersAttached = false;
    private providers: DebugStateProviders = {};

    constructor(private readonly options: DebugRuntimeOptions) {
        const stamp = new Date().toISOString().replace(/[:.]/g, '-');
        this.sessionId = `${stamp}-pid-${process.pid}`;
        this.enabled = hasDebugFlag('--avgen-debug') || process.env.AUTOMATED_VIDEO_GENERATOR_DEBUG === '1';
        this.openDevTools = this.enabled
            || hasDebugFlag('--avgen-devtools')
            || process.env.AUTOMATED_VIDEO_GENERATOR_OPEN_DEVTOOLS === '1';

        const configuredPort = Number.parseInt(process.env.AUTOMATED_VIDEO_GENERATOR_REMOTE_DEBUG_PORT || '9222', 10);
        this.remoteDebuggingPort = this.enabled && Number.isFinite(configuredPort) ? configuredPort : null;
        this.desktopLogFilePath = getDesktopLogFilePath();
        this.diagnosticsDirPath = getDesktopDiagnosticsDirPath();
        this.crashDumpsDirPath = getDesktopCrashDumpsDirPath();
        this.chromiumLogFilePath = path.join(getDesktopLogDirPath(), `chromium-${this.sessionId}.log`);
    }

    configureEarly(): void {
        try {
            app.commandLine.appendSwitch('enable-logging');
            app.commandLine.appendSwitch('log-file', this.chromiumLogFilePath);

            if (this.remoteDebuggingPort !== null) {
                app.commandLine.appendSwitch('remote-debugging-port', String(this.remoteDebuggingPort));
            }

            if (this.enabled) {
                app.commandLine.appendSwitch('disable-http-cache');
            }
        } catch (error) {
            writeDesktopLog('warn', `[DebugRuntime] Failed to configure Chromium logging switches: ${String(error)}`);
        }

        try {
            app.setPath('crashDumps', this.crashDumpsDirPath);
        } catch (error) {
            writeDesktopLog('warn', `[DebugRuntime] Failed to set crash dump directory: ${String(error)}`);
        }

        try {
            crashReporter.start({
                companyName: 'Automated Video Generator',
                compress: false,
                globalExtra: {
                    sessionId: this.sessionId,
                },
                ignoreSystemCrashHandler: false,
                productName: 'Automated Video Generator',
                submitURL: 'https://example.invalid/avgen-crash',
                uploadToServer: false,
            });
        } catch (error) {
            writeDesktopLog('warn', `[DebugRuntime] Failed to start Electron crash reporter: ${String(error)}`);
        }

        writeDesktopLog(
            'info',
            `[DebugRuntime] Diagnostics configured. session=${this.sessionId} chromiumLog=${this.chromiumLogFilePath} crashDumps=${this.crashDumpsDirPath} debug=${this.enabled} devtools=${this.openDevTools}`,
        );
    }

    setStateProviders(providers: DebugStateProviders): void {
        this.providers = providers;
    }

    attachAppEventListeners(): void {
        if (this.appEventListenersAttached) {
            return;
        }

        this.appEventListenersAttached = true;

        app.on('browser-window-created', (_event, window) => {
            this.log('info', `[App] browser-window-created id=${window.id}`);
        });

        app.on('child-process-gone', (_event, details) => {
            this.log('error', `[App] child-process-gone type=${details.type} reason=${details.reason} name=${details.name} exitCode=${details.exitCode}`);
            this.captureSnapshot('child-process-gone', { details }, false);
        });

        app.on('gpu-info-update', () => {
            try {
                const gpuStatus = app.getGPUFeatureStatus();
                this.log('info', `[App] gpu-info-update ${JSON.stringify(gpuStatus)}`);
            } catch (error) {
                this.log('warn', `[App] Failed to read GPU status: ${String(error)}`);
            }
        });

        app.on('web-contents-created', (_event, contents) => {
            this.attachWebContentsListeners(contents);
        });
    }

    registerWindow(kind: WindowKind, window: BrowserWindow): void {
        this.log('info', `[DebugRuntime] registered ${kind} window id=${window.id}`);

        window.on('show', () => {
            this.log('info', `[Window:${kind}] show id=${window.id}`);
        });

        window.on('hide', () => {
            this.log('info', `[Window:${kind}] hide id=${window.id}`);
        });

        window.on('focus', () => {
            this.log('debug', `[Window:${kind}] focus id=${window.id}`);
        });

        window.on('blur', () => {
            this.log('debug', `[Window:${kind}] blur id=${window.id}`);
        });

        window.on('unresponsive', () => {
            this.log('warn', `[Window:${kind}] unresponsive id=${window.id}`);
            this.captureSnapshot(`window-${kind}-unresponsive`, { windowId: window.id }, false);
        });

        window.on('responsive', () => {
            this.log('info', `[Window:${kind}] responsive id=${window.id}`);
        });

        if (this.openDevTools) {
            window.webContents.once('did-finish-load', () => {
                setTimeout(() => {
                    if (!window.isDestroyed() && !window.webContents.isDestroyed() && !window.webContents.isDevToolsOpened()) {
                        window.webContents.openDevTools({ mode: 'detach' });
                        this.log('info', `[DebugRuntime] DevTools opened automatically for ${kind} window id=${window.id}`);
                    }
                }, 250);
            });
        }
    }

    captureSnapshot(name: string, extra: unknown, includeDependencies: boolean): string | null {
        const payload = {
            app: {
                appRoot: this.options.appRoot,
                isDev: this.options.isDev,
                isPackaged: app.isPackaged,
                name: app.getName(),
                serverUrl: this.options.serverUrl,
                version: app.getVersion(),
            },
            extra: toSerializable(extra),
            host: {
                arch: process.arch,
                cwd: process.cwd(),
                execPath: process.execPath,
                hostname: os.hostname(),
                pid: process.pid,
                platform: process.platform,
                release: os.release(),
            },
            logs: {
                chromiumLogFilePath: this.chromiumLogFilePath,
                crashDumpsDirPath: this.crashDumpsDirPath,
                desktopLogFilePath: this.desktopLogFilePath,
                diagnosticsDirPath: this.diagnosticsDirPath,
            },
            runtime: toSerializable(this.safeInvoke('getRuntimeState', this.providers.getRuntimeState)),
            sessionId: this.sessionId,
            timestamp: new Date().toISOString(),
            versions: {
                chrome: process.versions.chrome,
                electron: process.versions.electron,
                node: process.versions.node,
            },
            dependencies: includeDependencies
                ? toSerializable(this.safeInvoke('getDependencyState', this.providers.getDependencyState))
                : undefined,
        };

        const snapshotPath = writeDesktopDiagnosticSnapshot(name, payload);
        if (snapshotPath) {
            this.log('info', `[DebugRuntime] Wrote diagnostic snapshot: ${snapshotPath}`);
        }
        return snapshotPath;
    }

    captureFailureSnapshot(reason: string, error: unknown, extra?: unknown): string | null {
        return this.captureSnapshot(
            `failure-${reason}`,
            {
                error: serializeError(error),
                reason,
                extra,
            },
            true,
        );
    }

    writeRendererDebugLog(payload: RendererDebugPayload): void {
        const level = normalizeRendererLevel(payload.level);
        const location = payload.href || payload.source || 'unknown';
        const title = payload.title ? ` title=${payload.title}` : '';
        const lineInfo = payload.line ? ` line=${payload.line}${payload.column ? `:${payload.column}` : ''}` : '';
        const stack = payload.stack ? `\n${payload.stack}` : '';
        const extra = payload.extra ? `\nextra=${JSON.stringify(toSerializable(payload.extra))}` : '';

        this.log(
            level,
            `[Renderer] ${payload.message || '(no message)'} url=${location}${title}${lineInfo}${stack}${extra}`,
        );

        if (level === 'error') {
            this.captureSnapshot(
                'renderer-error',
                {
                    payload: toSerializable(payload),
                },
                false,
            );
        }
    }

    getDebugInfo(): DebugInfo {
        return {
            appRoot: this.options.appRoot,
            chromiumLogFilePath: this.chromiumLogFilePath,
            crashDumpsDirPath: this.crashDumpsDirPath,
            desktopLogFilePath: this.desktopLogFilePath,
            diagnosticsDirPath: this.diagnosticsDirPath,
            enabled: this.enabled,
            isDev: this.options.isDev,
            openDevTools: this.openDevTools,
            remoteDebuggingPort: this.remoteDebuggingPort,
            serverUrl: this.options.serverUrl,
            sessionId: this.sessionId,
        };
    }

    async openDesktopLog(): Promise<string> {
        return shell.openPath(this.desktopLogFilePath);
    }

    async openDiagnosticsFolder(): Promise<string> {
        return shell.openPath(this.diagnosticsDirPath);
    }

    maybeToggleDevTools(target: BrowserWindow | null): void {
        if (!target || target.isDestroyed() || target.webContents.isDestroyed()) {
            this.log('warn', '[DebugRuntime] No live window is available for DevTools');
            return;
        }

        if (target.webContents.isDevToolsOpened()) {
            target.webContents.closeDevTools();
            this.log('info', `[DebugRuntime] Closed DevTools for window id=${target.id}`);
            return;
        }

        target.webContents.openDevTools({ mode: 'detach' });
        this.log('info', `[DebugRuntime] Opened DevTools for window id=${target.id}`);
    }

    private attachWebContentsListeners(contents: WebContents): void {
        const contentsLabel = () => {
            const currentUrl = contents.isDestroyed() ? '(destroyed)' : contents.getURL() || '(empty-url)';
            return `[WebContents:${contents.id}] ${currentUrl}`;
        };

        contents.on('console-message', (_event, level, message, line, sourceId) => {
            const normalizedLevel: DebugLevel = level >= 3 ? 'error' : level === 2 ? 'warn' : 'info';
            this.log(normalizedLevel, `${contentsLabel()} console source=${sourceId} line=${line} ${message}`);
        });

        contents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
            this.log('error', `${contentsLabel()} did-fail-load code=${errorCode} desc=${errorDescription} url=${validatedURL} mainFrame=${isMainFrame}`);
            this.captureSnapshot('did-fail-load', { errorCode, errorDescription, isMainFrame, validatedURL, webContentsId: contents.id }, false);
        });

        contents.on('did-fail-provisional-load', (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
            this.log('error', `${contentsLabel()} did-fail-provisional-load code=${errorCode} desc=${errorDescription} url=${validatedURL} mainFrame=${isMainFrame}`);
            this.captureSnapshot('did-fail-provisional-load', { errorCode, errorDescription, isMainFrame, validatedURL, webContentsId: contents.id }, false);
        });

        contents.on('dom-ready', () => {
            this.log('info', `${contentsLabel()} dom-ready`);
        });

        contents.on('did-finish-load', () => {
            this.log('info', `${contentsLabel()} did-finish-load`);
        });

        contents.on('render-process-gone', (_event, details) => {
            this.log('error', `${contentsLabel()} render-process-gone reason=${details.reason} exitCode=${details.exitCode}`);
            this.captureSnapshot('render-process-gone', { details, webContentsId: contents.id }, false);
        });

        contents.on('preload-error', (_event, preloadPath, error) => {
            this.log('error', `${contentsLabel()} preload-error path=${preloadPath} error=${error.message}`);
            this.captureSnapshot('preload-error', { error: serializeError(error), preloadPath, webContentsId: contents.id }, false);
        });

        contents.on('unresponsive', () => {
            this.log('warn', `${contentsLabel()} unresponsive`);
        });

        contents.on('responsive', () => {
            this.log('info', `${contentsLabel()} responsive`);
        });

        contents.on('devtools-opened', () => {
            this.log('info', `${contentsLabel()} devtools-opened`);
        });

        contents.on('devtools-closed', () => {
            this.log('info', `${contentsLabel()} devtools-closed`);
        });

        contents.on('destroyed', () => {
            this.log('info', `[WebContents:${contents.id}] destroyed`);
        });
    }

    private log(level: DebugLevel, message: string): void {
        writeDesktopLog(level, message);
    }

    private safeInvoke(label: string, provider?: () => unknown): unknown {
        if (!provider) {
            return null;
        }

        try {
            return provider();
        } catch (error) {
            return {
                error: `${label} failed`,
                detail: serializeError(error),
            };
        }
    }
}
