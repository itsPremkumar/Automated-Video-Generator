import { exec } from 'child_process';
import { HOST, PORT } from '../../constants/config';
import app from '../../app';

export { app as expressApp };

/**
 * Install global process crash handlers to keep the server alive
 * when a video generation job throws an unhandled rejection or exception.
 *
 * Without these, a single unhandled error from Remotion, edge-tts, or
 * any async pipeline step kills the entire Node.js process.
 */
function installCrashGuards(): void {
    let unhandledRejectionCount = 0;
    let uncaughtExceptionCount = 0;

    process.on('unhandledRejection', (reason: unknown) => {
        unhandledRejectionCount++;
        const message = reason instanceof Error ? reason.message : String(reason);
        const stack = reason instanceof Error ? reason.stack : undefined;

        console.error('[SERVER] ════════ UNHANDLED REJECTION ════════');
        console.error(`[SERVER] Rejection #${unhandledRejectionCount}: ${message}`);
        if (stack) {
            console.error('[SERVER] Stack:', stack);
        }
        console.error('[SERVER] The server will continue running.');
        console.error('[SERVER] ════════════════════════════════════');

        // Do NOT call process.exit — let the server keep handling requests.
        // The job-service will mark the individual job as failed.
    });

    process.on('uncaughtException', (error: Error, origin: string) => {
        uncaughtExceptionCount++;

        console.error('[SERVER] ════════ UNCAUGHT EXCEPTION ════════');
        console.error(`[SERVER] Exception #${uncaughtExceptionCount} (origin: ${origin})`);
        console.error(`[SERVER] Error: ${error.message}`);
        console.error('[SERVER] Stack:', error.stack);
        console.error('[SERVER] ════════════════════════════════════');

        // For truly fatal exceptions (like running out of file descriptors),
        // we should exit. For most errors (OOM in child subprocess, bad
        // ffmpeg exit, etc.) the server can keep running.
        const isFatal =
            error.message.includes('ENOMEM') ||
            error.message.includes('EMFILE') ||
            error.message.includes('Cannot allocate memory');

        if (isFatal) {
            console.error('[SERVER] This exception is classified as FATAL — process will exit.');
            console.error('[SERVER] The Electron main process should detect the crash and offer recovery.');
            process.exit(1);
        }

        console.error('[SERVER] The server will try to continue running.');
    });

    // Warn on high memory usage so it shows up in logs before a potential OOM
    const MEMORY_CHECK_INTERVAL_MS = 60_000;
    const HEAP_WARN_THRESHOLD_MB = 512;

    setInterval(() => {
        const usage = process.memoryUsage();
        const heapUsedMB = Math.round(usage.heapUsed / 1024 / 1024);
        const rssMB = Math.round(usage.rss / 1024 / 1024);

        if (heapUsedMB > HEAP_WARN_THRESHOLD_MB) {
            console.warn(`[SERVER] ⚠ High memory usage: heap=${heapUsedMB}MB, rss=${rssMB}MB`);
        }
    }, MEMORY_CHECK_INTERVAL_MS).unref();
}

export function startServer(port?: number): Promise<void> {
    const listenPort = port || PORT;

    installCrashGuards();

    return new Promise((resolve, reject) => {
        const server = app.listen(listenPort, HOST, () => {
            const url = `http://localhost:${listenPort}`;
            console.log(`Video Generator portal running on ${url}`);
            resolve();
        });

        server.on('error', (error: NodeJS.ErrnoException) => {
            if (error.code === 'EADDRINUSE') {
                console.error(`[SERVER] Port ${listenPort} is already in use.`);
                console.error('[SERVER] Another instance may be running, or a zombie process is holding the port.');
                console.error('[SERVER] Try: taskkill /F /IM node.exe  (Windows)');
            } else {
                console.error(`[SERVER] Server listen error: ${error.message}`);
            }
            reject(error);
        });
    });
}

export function shouldAutoStartServer(): { shouldStart: boolean; isBackgroundWorker: boolean } {
    const isElectronMain = !!(process.versions as any).electron && !process.env.ELECTRON_BACKEND_SERVER;
    const isBackgroundWorker = !!process.env.ELECTRON_BACKEND_SERVER;

    return {
        shouldStart: !isElectronMain || isBackgroundWorker,
        isBackgroundWorker,
    };
}

export async function runServerEntry(): Promise<void> {
    const { shouldStart, isBackgroundWorker } = shouldAutoStartServer();
    if (!shouldStart) {
        return;
    }

    await startServer();

    if (!isBackgroundWorker) {
        const openCommand = process.platform === 'win32' ? 'start' : process.platform === 'darwin' ? 'open' : 'xdg-open';
        exec(`${openCommand} http://localhost:${PORT}`);
    }
}
