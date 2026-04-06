import { exec } from 'child_process';
import { HOST, PORT } from '../../constants/config';
import app from '../../app';

export { app as expressApp };

export function startServer(port?: number): Promise<void> {
    const listenPort = port || PORT;

    return new Promise((resolve) => {
        app.listen(listenPort, HOST, () => {
            const url = `http://localhost:${listenPort}`;
            console.log(`Video Generator portal running on ${url}`);
            resolve();
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
