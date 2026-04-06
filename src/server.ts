import { exec } from 'child_process';
import { HOST, PORT } from './constants/config';
import app from './app';

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

// Auto-start when run directly or launched by Electron as a background process
const isElectronMain = !!(process.versions as any).electron && !process.env.ELECTRON_BACKEND_SERVER;
const isBackgroundWorker = !!process.env.ELECTRON_BACKEND_SERVER;

if (!isElectronMain || isBackgroundWorker) {
    app.listen(PORT, HOST, () => {
        const url = `http://localhost:${PORT}`;
        console.log(`Video Generator portal running on ${url}`);
        
        // Automatically open the browser if not running as a background worker
        if (!isBackgroundWorker) {
            const start = process.platform === 'win32' ? 'start' : process.platform === 'darwin' ? 'open' : 'xdg-open';
            exec(`${start} ${url}`);
        }
    });
}
