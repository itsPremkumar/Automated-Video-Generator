import { ChildProcess, spawn } from 'child_process';
import * as path from 'path';

type ServerManagerOptions = {
    appRoot: string;
    port: number;
};

export class ServerManager {
    private serverProcess: ChildProcess | null = null;

    constructor(private readonly options: ServerManagerOptions) {}

    hasServerProcess(): boolean {
        return this.serverProcess !== null;
    }

    async startServer(): Promise<void> {
        return new Promise((resolve, reject) => {
            const tsxPath = path.join(this.options.appRoot, 'node_modules', 'tsx', 'dist', 'cli.mjs');
            const serverPath = path.join(this.options.appRoot, 'src', 'server.ts');
            const env = {
                ...process.env,
                PORT: String(this.options.port),
                ELECTRON_RUN_AS_NODE: '1',
                ELECTRON_BACKEND_SERVER: '1',
                ELECTRON_RESOURCES_PATH: process.resourcesPath || '',
                ELECTRON_APP_ROOT: this.options.appRoot,
            };

            this.serverProcess = spawn(process.execPath, [tsxPath, serverPath], {
                cwd: this.options.appRoot,
                env,
                stdio: ['pipe', 'pipe', 'pipe'],
                windowsHide: true,
            });

            let started = false;
            const timeout = setTimeout(() => {
                if (!started) {
                    started = true;
                    resolve();
                }
            }, 15000);

            this.serverProcess.stdout?.on('data', (data: Buffer) => {
                const message = data.toString();
                console.log('[Server]', message);
                if (message.includes('running on') && !started) {
                    started = true;
                    clearTimeout(timeout);
                    resolve();
                }
            });

            let lastErrorLog = '';
            this.serverProcess.stderr?.on('data', (data: Buffer) => {
                const message = data.toString();
                console.error('[Server Error]', message);
                lastErrorLog += message;
            });

            this.serverProcess.on('error', (error) => {
                console.error('[Server Process Error]', error);
                if (!started) {
                    started = true;
                    clearTimeout(timeout);
                    reject(error);
                }
            });

            this.serverProcess.on('exit', (code) => {
                console.log('[Server] Process exited with code', code);
                if (code !== 0 && !started) {
                    started = true;
                    clearTimeout(timeout);
                    const snippet = lastErrorLog.trim().slice(-500);
                    reject(new Error(`Server script crashed on startup (code ${code})\n\nLog:\n${snippet || 'No error log output available'}`));
                }
                this.serverProcess = null;
            });
        });
    }

    stopServer() {
        if (this.serverProcess) {
            this.serverProcess.kill();
            this.serverProcess = null;
        }
    }
}
