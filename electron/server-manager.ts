import { ChildProcess, spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

type ServerManagerOptions = {
    appRoot: string;
    port: number;
};

function logTag(method: string): string {
    return `[ServerManager:${method}]`;
}

export class ServerManager {
    private serverProcess: ChildProcess | null = null;

    constructor(private readonly options: ServerManagerOptions) {
        console.log(logTag('constructor'), 'Initialized with appRoot:', this.options.appRoot, '| port:', this.options.port);
    }

    hasServerProcess(): boolean {
        const alive = this.serverProcess !== null && !this.serverProcess.killed;
        console.log(logTag('hasServerProcess'), 'Server process alive:', alive, '| PID:', this.serverProcess?.pid || 'none');
        return this.serverProcess !== null;
    }

    async startServer(): Promise<void> {
        const tag = logTag('startServer');
        console.log(tag, '=== Starting backend server ===');

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

            let started = false;
            const timeout = setTimeout(() => {
                if (!started) {
                    started = true;
                    console.warn(tag, '⚠ Server did not emit "running on" within 15s — resolving anyway (server may still be starting)');
                    resolve();
                }
            }, 15000);

            this.serverProcess.stdout?.on('data', (data: Buffer) => {
                const message = data.toString();
                console.log('[Server:stdout]', message.trimEnd());
                if (message.includes('running on') && !started) {
                    started = true;
                    clearTimeout(timeout);
                    console.log(tag, '✓ Server reported ready');
                    resolve();
                }
            });

            let lastErrorLog = '';
            this.serverProcess.stderr?.on('data', (data: Buffer) => {
                const message = data.toString();
                console.error('[Server:stderr]', message.trimEnd());
                lastErrorLog += message;
                // Keep only the last 2000 chars to avoid memory issues
                if (lastErrorLog.length > 2000) {
                    lastErrorLog = lastErrorLog.slice(-2000);
                }
            });

            this.serverProcess.on('error', (error) => {
                console.error(tag, 'Server process error event:', error.message);
                console.error(tag, 'Error details:', JSON.stringify({ code: (error as any).code, errno: (error as any).errno }));
                if (!started) {
                    started = true;
                    clearTimeout(timeout);
                    reject(new Error(`Server process error: ${error.message}`));
                }
            });

            this.serverProcess.on('exit', (code, signal) => {
                console.log(tag, 'Server process exited | Code:', code, '| Signal:', signal, '| PID:', this.serverProcess?.pid);
                if (code !== 0 && !started) {
                    started = true;
                    clearTimeout(timeout);
                    const snippet = lastErrorLog.trim().slice(-500);
                    const errMsg = `Server script crashed on startup (code ${code}, signal ${signal})\n\nLog:\n${snippet || 'No error log output available'}`;
                    console.error(tag, errMsg);
                    reject(new Error(errMsg));
                }
                this.serverProcess = null;
            });
        });
    }

    stopServer() {
        const tag = logTag('stopServer');
        if (!this.serverProcess) {
            console.log(tag, 'No server process to stop');
            return;
        }

        console.log(tag, 'Stopping server process, PID:', this.serverProcess.pid);
        try {
            this.serverProcess.kill();
            console.log(tag, '✓ Server process kill signal sent');
        } catch (error: any) {
            console.warn(tag, 'Failed to kill server process (may have already exited):', error.message);
        }
        this.serverProcess = null;
    }
}
