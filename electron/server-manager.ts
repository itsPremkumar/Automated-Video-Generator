import { ChildProcess, spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { getDesktopLogFilePath, writeDesktopLog } from './app-logger';

type ServerManagerOptions = {
    appRoot: string;
    port: number;
    /** Called when the server process dies unexpectedly after a successful startup */
    onRuntimeCrash?: (exitCode: number | null, signal: string | null, lastLog: string) => void;
};

function logTag(method: string): string {
    return `[ServerManager:${method}]`;
}

export class ServerManager {
    private serverProcess: ChildProcess | null = null;
    private serverStartedSuccessfully = false;
    private lastErrorLog = '';
    private restartCount = 0;
    private readonly MAX_AUTO_RESTARTS = 3;
    private lastRestartTime = 0;

    constructor(private readonly options: ServerManagerOptions) {
        console.log(logTag('constructor'), 'Initialized with appRoot:', this.options.appRoot, '| port:', this.options.port);
    }

    hasServerProcess(): boolean {
        const alive = this.serverProcess !== null
            && !this.serverProcess.killed
            && this.serverProcess.exitCode === null;
        console.log(logTag('hasServerProcess'), 'Server process alive:', alive, '| PID:', this.serverProcess?.pid || 'none');
        return alive;
    }

    getRestartCount(): number {
        return this.restartCount;
    }

    async startServer(): Promise<void> {
        const tag = logTag('startServer');
        console.log(tag, '=== Starting backend server ===');

        // Reset crash tracking for fresh starts (but not for auto-restarts)
        this.serverStartedSuccessfully = false;
        this.lastErrorLog = '';

        return new Promise((resolve, reject) => {
            const tsxPath = path.join(this.options.appRoot, 'node_modules', 'tsx', 'dist', 'cli.mjs');
            const serverPath = path.join(this.options.appRoot, 'src', 'server.ts');

            // Validate that required files exist before spawning
            console.log(tag, 'tsx path:', tsxPath, '| Exists:', fs.existsSync(tsxPath));
            console.log(tag, 'server.ts path:', serverPath, '| Exists:', fs.existsSync(serverPath));
            console.log(tag, 'process.execPath:', process.execPath);
            console.log(tag, 'process.resourcesPath:', process.resourcesPath || '(not set)');

            if (!fs.existsSync(tsxPath)) {
                const errMsg = `tsx CLI not found at: ${tsxPath}. Make sure node_modules are installed.`;
                console.error(tag, errMsg);
                reject(new Error(errMsg));
                return;
            }

            if (!fs.existsSync(serverPath)) {
                const errMsg = `Server entry point not found at: ${serverPath}. The app may be incorrectly packaged.`;
                console.error(tag, errMsg);
                reject(new Error(errMsg));
                return;
            }

            const env = {
                ...process.env,
                AUTOMATED_VIDEO_GENERATOR_DATA_ROOT: process.env.AUTOMATED_VIDEO_GENERATOR_DATA_ROOT || '',
                AUTOMATED_VIDEO_GENERATOR_DESKTOP_LOG: getDesktopLogFilePath(),
                PORT: String(this.options.port),
                ELECTRON_RUN_AS_NODE: '1',
                ELECTRON_BACKEND_SERVER: '1',
                ELECTRON_RESOURCES_PATH: process.resourcesPath || '',
                ELECTRON_APP_ROOT: this.options.appRoot,
            };

            // Log environment (redact sensitive values)
            const safeEnvKeys = ['PORT', 'ELECTRON_RUN_AS_NODE', 'ELECTRON_BACKEND_SERVER', 'ELECTRON_RESOURCES_PATH', 'ELECTRON_APP_ROOT', 'NODE_ENV', 'PATH'];
            const envSnapshot: Record<string, string> = {};
            const envRecord = env as Record<string, string | undefined>;
            for (const key of safeEnvKeys) {
                if (envRecord[key] !== undefined) {
                    envSnapshot[key] = key === 'PATH' ? '(present, length: ' + (envRecord[key]?.length || 0) + ')' : String(envRecord[key]);
                }
            }
            console.log(tag, 'Spawn environment:', JSON.stringify(envSnapshot));
            console.log(tag, 'Spawn command:', process.execPath, tsxPath, serverPath);
            console.log(tag, 'Working directory:', this.options.appRoot);

            try {
                this.serverProcess = spawn(process.execPath, [tsxPath, serverPath], {
                    cwd: this.options.appRoot,
                    env,
                    stdio: ['pipe', 'pipe', 'pipe'],
                    windowsHide: true,
                });
            } catch (spawnError: any) {
                console.error(tag, 'Failed to spawn server process:', spawnError.message);
                console.error(tag, 'Stack:', spawnError.stack);
                reject(new Error(`Failed to spawn server process: ${spawnError.message}`));
                return;
            }

            console.log(tag, 'Server process spawned with PID:', this.serverProcess.pid);

            // Absorb EPIPE errors on the server's stdin pipe. When the server
            // process dies, any pending write to its stdin will fail with EPIPE.
            // Without this handler the error becomes an uncaught exception.
            this.serverProcess.stdin?.on('error', (err: NodeJS.ErrnoException) => {
                if (err.code === 'EPIPE') return;
                console.warn(tag, 'Server stdin error:', err.message);
            });

            let started = false;
            const timeout = setTimeout(() => {
                if (!started) {
                    started = true;
                    console.warn(tag, '⚠ Server did not emit "running on" within 15s — resolving anyway (server may still be starting)');
                    this.serverStartedSuccessfully = true;
                    resolve();
                }
            }, 15000);

            this.serverProcess.stdout?.on('data', (data: Buffer) => {
                const message = data.toString();
                console.log('[Server:stdout]', message.trimEnd());
                writeDesktopLog('info', `[Server:stdout] ${message.trimEnd()}`);
                if (message.includes('running on') && !started) {
                    started = true;
                    clearTimeout(timeout);
                    this.serverStartedSuccessfully = true;
                    console.log(tag, '✓ Server reported ready');
                    resolve();
                }
            });

            this.serverProcess.stderr?.on('data', (data: Buffer) => {
                const message = data.toString();
                console.error('[Server:stderr]', message.trimEnd());
                writeDesktopLog('error', `[Server:stderr] ${message.trimEnd()}`);
                this.lastErrorLog += message;
                // Keep only the last 4000 chars to avoid memory issues
                if (this.lastErrorLog.length > 4000) {
                    this.lastErrorLog = this.lastErrorLog.slice(-4000);
                }
            });

            this.serverProcess.on('error', (error) => {
                console.error(tag, 'Server process error event:', error.message);
                console.error(tag, 'Error details:', JSON.stringify({ code: (error as any).code, errno: (error as any).errno }));
                writeDesktopLog('error', `${tag} server process error: ${error.message}`);
                if (!started) {
                    started = true;
                    clearTimeout(timeout);
                    reject(new Error(`Server process error: ${error.message}`));
                }
            });

            this.serverProcess.on('exit', (code, signal) => {
                const pid = this.serverProcess?.pid;
                console.log(tag, 'Server process exited | Code:', code, '| Signal:', signal, '| PID:', pid);
                writeDesktopLog('warn', `${tag} server exited | code=${code} signal=${signal} pid=${pid ?? 'none'}`);

                const wasRunning = this.serverStartedSuccessfully;
                this.serverProcess = null;
                clearTimeout(timeout);

                if (!started) {
                    // Crashed during startup — reject the startup promise
                    started = true;
                    clearTimeout(timeout);
                    const snippet = this.lastErrorLog.trim().slice(-500);
                    const errMsg = `Server script crashed on startup (code ${code}, signal ${signal})\n\nLog:\n${snippet || 'No error log output available'}`;
                    console.error(tag, errMsg);
                    reject(new Error(errMsg));
                    return;
                }

                if (wasRunning && code !== 0 && signal !== 'SIGTERM' && signal !== 'SIGINT') {
                    // Server crashed AFTER a successful startup — this is a runtime crash
                    console.error(tag, '══════════════════════════════════════════════════');
                    console.error(tag, '⚠ SERVER CRASHED AT RUNTIME');
                    console.error(tag, 'Exit code:', code, '| Signal:', signal);
                    console.error(tag, 'Last error log:', this.lastErrorLog.trim().slice(-500));
                    console.error(tag, '══════════════════════════════════════════════════');

                    this.serverStartedSuccessfully = false;

                    // Notify the Electron main process
                    if (this.options.onRuntimeCrash) {
                        this.options.onRuntimeCrash(code, signal, this.lastErrorLog.trim().slice(-500));
                    }
                }
            });
        });
    }

    /**
     * Attempt to restart the server after a runtime crash.
     * Returns true if restart was initiated, false if max restarts exceeded.
     */
    async restartServer(): Promise<boolean> {
        const tag = logTag('restartServer');
        const now = Date.now();

        // Reset the restart counter if more than 5 minutes since last restart
        if (now - this.lastRestartTime > 5 * 60 * 1000) {
            this.restartCount = 0;
        }

        if (this.restartCount >= this.MAX_AUTO_RESTARTS) {
            console.error(tag, `Max auto-restarts (${this.MAX_AUTO_RESTARTS}) exceeded — not restarting`);
            return false;
        }

        this.restartCount++;
        this.lastRestartTime = now;
        console.log(tag, `Restarting server (attempt ${this.restartCount}/${this.MAX_AUTO_RESTARTS})...`);

        // Clean up any lingering process
        this.stopServer();

        // Wait a brief moment for the port to release
        await new Promise<void>((resolve) => setTimeout(resolve, 1500));

        try {
            await this.startServer();
            console.log(tag, '✓ Server restarted successfully');
            return true;
        } catch (error: any) {
            console.error(tag, 'Server restart failed:', error.message);
            return false;
        }
    }

    stopServer() {
        const tag = logTag('stopServer');
        if (!this.serverProcess) {
            console.log(tag, 'No server process to stop');
            return;
        }

        console.log(tag, 'Stopping server process, PID:', this.serverProcess.pid);
        this.serverStartedSuccessfully = false;

        try {
            // On Windows, kill the entire process tree to prevent zombie children
            if (process.platform === 'win32' && this.serverProcess.pid) {
                try {
                    const { execSync } = require('child_process');
                    execSync(`taskkill /F /T /PID ${this.serverProcess.pid}`, {
                        stdio: 'pipe',
                        windowsHide: true,
                        timeout: 5000,
                    });
                    console.log(tag, '✓ Process tree killed via taskkill');
                } catch {
                    // taskkill failed — fall back to regular kill
                    this.serverProcess.kill();
                    console.log(tag, '✓ Server process kill signal sent (fallback)');
                }
            } else {
                this.serverProcess.kill();
                console.log(tag, '✓ Server process kill signal sent');
            }
        } catch (error: any) {
            console.warn(tag, 'Failed to kill server process (may have already exited):', error.message);
        }
        this.serverProcess = null;
    }
}
