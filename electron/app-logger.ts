import * as fs from 'fs';
import * as path from 'path';
import { format } from 'util';

type LogLevel = 'debug' | 'error' | 'info' | 'warn';

let desktopLogFilePath: string | null = null;
let desktopLogDirPath: string | null = null;
let loggingInstalled = false;

function resolveDesktopLogDir(): string {
    const explicitDataRoot = process.env.AUTOMATED_VIDEO_GENERATOR_DATA_ROOT?.trim();
    if (explicitDataRoot) {
        return path.join(path.resolve(explicitDataRoot), 'logs');
    }

    const localAppData = process.env.LOCALAPPDATA?.trim();
    if (localAppData) {
        return path.join(localAppData, 'Automated Video Generator', 'logs');
    }

    return path.join(path.dirname(process.execPath), 'logs');
}

export function getDesktopLogFilePath(): string {
    if (desktopLogFilePath) {
        return desktopLogFilePath;
    }

    const logDir = getDesktopLogDirPath();

    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    desktopLogFilePath = path.join(logDir, `desktop-${stamp}.log`);
    return desktopLogFilePath;
}

export function getDesktopLogDirPath(): string {
    if (desktopLogDirPath) {
        return desktopLogDirPath;
    }

    desktopLogDirPath = resolveDesktopLogDir();
    fs.mkdirSync(desktopLogDirPath, { recursive: true });
    return desktopLogDirPath;
}

export function getDesktopDiagnosticsDirPath(): string {
    const diagnosticsDir = path.join(path.dirname(getDesktopLogDirPath()), 'diagnostics');
    fs.mkdirSync(diagnosticsDir, { recursive: true });
    return diagnosticsDir;
}

export function getDesktopCrashDumpsDirPath(): string {
    const crashDumpDir = path.join(path.dirname(getDesktopLogDirPath()), 'crashDumps');
    fs.mkdirSync(crashDumpDir, { recursive: true });
    return crashDumpDir;
}

export function writeDesktopDiagnosticSnapshot(prefix: string, payload: unknown): string | null {
    try {
        const stamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `${prefix}-${stamp}.json`;
        const filePath = path.join(getDesktopDiagnosticsDirPath(), filename);
        fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf8');
        return filePath;
    } catch {
        return null;
    }
}

export function writeDesktopLog(level: LogLevel, message: string): void {
    try {
        fs.appendFileSync(
            getDesktopLogFilePath(),
            `[${new Date().toISOString()}] [${level.toUpperCase()}] ${message}\n`,
        );
    } catch {
        // Logging should never take down the desktop shell.
    }
}

function patchConsoleMethod(method: 'debug' | 'error' | 'log' | 'warn', level: LogLevel): void {
    const original: (...args: unknown[]) => void = method === 'debug'
        ? console.debug.bind(console)
        : method === 'error'
            ? console.error.bind(console)
            : method === 'warn'
                ? console.warn.bind(console)
                : console.log.bind(console);

    const wrapped = (...args: unknown[]) => {
        const message = format(...args);
        writeDesktopLog(level, message);
        try {
            original(...args);
        } catch (err: any) {
            // In packaged Electron on Windows, process.stdout/stderr are pipes.
            // When the pipe reader disappears (e.g. no console attached), writing
            // throws EPIPE. Swallow it — the message is already in the desktop log.
            if (err?.code !== 'EPIPE') {
                throw err;
            }
        }
    };

    switch (method) {
        case 'debug':
            console.debug = wrapped;
            break;
        case 'error':
            console.error = wrapped;
            break;
        case 'warn':
            console.warn = wrapped;
            break;
        default:
            console.log = wrapped;
            break;
    }
}

export function installDesktopLogging(): void {
    if (loggingInstalled) {
        return;
    }

    loggingInstalled = true;
    patchConsoleMethod('debug', 'debug');
    patchConsoleMethod('error', 'error');
    patchConsoleMethod('log', 'info');
    patchConsoleMethod('warn', 'warn');

    writeDesktopLog('info', `Desktop logging initialized. PID=${process.pid} EXEC=${process.execPath}`);
}
