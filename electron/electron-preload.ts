/// <reference lib="dom" />
import { contextBridge, ipcRenderer } from 'electron';

type RendererDebugLevel = 'debug' | 'error' | 'info' | 'warn';

type RendererDebugPayload = {
    column?: number;
    extra?: unknown;
    href?: string;
    level: RendererDebugLevel;
    line?: number;
    message: string;
    sessionId: string;
    source?: string;
    stack?: string;
    timestamp: string;
    title?: string;
};

const rendererSessionId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;

function serializeValue(value: unknown, depth = 0): unknown {
    if (depth > 4) {
        return '[max-depth]';
    }

    if (value === null || value === undefined) {
        return value;
    }

    if (value instanceof Error) {
        return {
            message: value.message,
            name: value.name,
            stack: value.stack,
        };
    }

    if (typeof value === 'bigint') {
        return value.toString();
    }

    if (typeof value === 'function') {
        return `[function ${value.name || 'anonymous'}]`;
    }

    if (Array.isArray(value)) {
        return value.slice(0, 20).map((entry) => serializeValue(entry, depth + 1));
    }

    if (typeof value === 'object') {
        const output: Record<string, unknown> = {};
        let count = 0;
        for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
            output[key] = serializeValue(entry, depth + 1);
            count += 1;
            if (count >= 20) {
                output.__truncated__ = true;
                break;
            }
        }
        return output;
    }

    return value;
}

function formatArgs(args: unknown[]): string {
    return args.map((arg) => {
        if (typeof arg === 'string') {
            return arg;
        }

        if (arg instanceof Error) {
            return arg.stack || `${arg.name}: ${arg.message}`;
        }

        try {
            return JSON.stringify(serializeValue(arg));
        } catch {
            return String(arg);
        }
    }).join(' ');
}

function sendRendererDebug(payload: Omit<RendererDebugPayload, 'href' | 'sessionId' | 'timestamp' | 'title'>): void {
    try {
        ipcRenderer.send('renderer-debug-log', {
            ...payload,
            href: window.location.href,
            sessionId: rendererSessionId,
            timestamp: new Date().toISOString(),
            title: document.title,
        } satisfies RendererDebugPayload);
    } catch {
        // Renderer diagnostics should never break the page.
    }
}

function installRendererDiagnostics(): void {
    const globalScope = globalThis as typeof globalThis & {
        __AVGEN_RENDERER_DIAGNOSTICS_INSTALLED__?: boolean;
    };

    if (globalScope.__AVGEN_RENDERER_DIAGNOSTICS_INSTALLED__) {
        return;
    }

    globalScope.__AVGEN_RENDERER_DIAGNOSTICS_INSTALLED__ = true;

    const patchConsoleMethod = (method: 'debug' | 'error' | 'info' | 'log' | 'warn', level: RendererDebugLevel) => {
        const original = console[method].bind(console);
        console[method] = (...args: unknown[]) => {
            sendRendererDebug({
                extra: serializeValue(args),
                level,
                message: formatArgs(args),
            });
            original(...args);
        };
    };

    patchConsoleMethod('debug', 'debug');
    patchConsoleMethod('error', 'error');
    patchConsoleMethod('info', 'info');
    patchConsoleMethod('log', 'info');
    patchConsoleMethod('warn', 'warn');

    window.addEventListener('error', (event) => {
        sendRendererDebug({
            column: event.colno,
            level: 'error',
            line: event.lineno,
            message: event.message || 'Unhandled window error',
            source: event.filename,
            stack: event.error instanceof Error ? event.error.stack : undefined,
        });
    });

    window.addEventListener('unhandledrejection', (event) => {
        const reason = event.reason instanceof Error
            ? event.reason.stack || event.reason.message
            : formatArgs([event.reason]);
        sendRendererDebug({
            extra: serializeValue(event.reason),
            level: 'error',
            message: `Unhandled promise rejection: ${reason}`,
        });
    });

    window.addEventListener('DOMContentLoaded', () => {
        sendRendererDebug({
            extra: {
                readyState: document.readyState,
                userAgent: navigator.userAgent,
            },
            level: 'info',
            message: 'Renderer diagnostics initialized',
        });
    });
}

installRendererDiagnostics();

contextBridge.exposeInMainWorld('electronAPI', {
    checkDependencies: () => ipcRenderer.invoke('check-dependencies'),
    getAppVersion: () => ipcRenderer.invoke('get-app-version'),
    getDebugInfo: () => ipcRenderer.invoke('get-debug-info'),
    installAllDependencies: () => ipcRenderer.invoke('install-all-dependencies'),
    installDependency: (name: string) => ipcRenderer.invoke('install-dependency', name),
    launchAfterSetup: () => ipcRenderer.invoke('launch-after-setup'),
    onInstallProgress: (callback: (event: unknown, data: { step: string; message: string; percent: number }) => void) => {
        ipcRenderer.on('install-progress', callback);
    },
    onSetupComplete: (callback: (event: unknown) => void) => {
        ipcRenderer.on('setup-complete', callback);
    },
    openDesktopLog: () => ipcRenderer.invoke('open-desktop-log'),
    openDiagnosticsFolder: () => ipcRenderer.invoke('open-diagnostics-folder'),
    openExternal: (url: string) => ipcRenderer.invoke('open-external', url),
    removeAllListeners: (channel: string) => {
        ipcRenderer.removeAllListeners(channel);
    },
    skipSetup: () => ipcRenderer.invoke('skip-setup'),
});
