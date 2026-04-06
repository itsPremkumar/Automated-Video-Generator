import { app, BrowserWindow, Menu, nativeImage, Tray } from 'electron';
import * as fs from 'fs';
import * as path from 'path';

type WindowManagerOptions = {
    isDev: boolean;
    serverUrl: string;
    openExternalSafely: (url: string) => Promise<void>;
    onQuit: () => void;
    shouldQuitAfterSetupClosed: () => boolean;
};

export class WindowManager {
    private mainWindow: BrowserWindow | null = null;
    private setupWindow: BrowserWindow | null = null;
    private tray: Tray | null = null;

    constructor(private readonly options: WindowManagerOptions) {}

    getMainWindow(): BrowserWindow | null {
        return this.mainWindow;
    }

    getSetupWindow(): BrowserWindow | null {
        return this.setupWindow;
    }

    hasTray(): boolean {
        return this.tray !== null;
    }

    showMainWindow() {
        this.mainWindow?.show();
        this.mainWindow?.focus();
    }

    showSetupWindow() {
        this.setupWindow?.show();
        this.setupWindow?.focus();
    }

    private getIconPath(): string | undefined {
        const icoPath = this.options.isDev
            ? path.join(__dirname, '..', 'assets', 'icon.ico')
            : path.join(process.resourcesPath, 'icon.ico');
        return fs.existsSync(icoPath) ? icoPath : undefined;
    }

    private createFallbackTrayIcon(): string {
        return 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAA0ElEQVQ4T2NkoBAwUqifYdAb8P////8MDAwMjIyMDMjy////Z2BgYGD4/x+okJGRARkzIKv5Dwb/GRj+/2dk+M/AwMD4n4Hh/38w/v+fkYERJsbAwPAfRcv//wwMwDD4z8DA8B/I+s/AwMjwH8hmZGD8D5YDigHlGIBq/oNcAzKckZHxPyMDI9A1/4Gu+c/ACLIBLMfIyMDA+P8/A+N/RkZGsJtBYgz/GRgYQGECdsN/BgYGRrCboW4G2cDICHIzWAwYK8C4kZGREWgpGAAAx5VSEWhLJocAAAAASUVORK5CYII=';
    }

    private attachNavigationGuards(win: BrowserWindow): void {
        win.webContents.setWindowOpenHandler(({ url }) => {
            void this.options.openExternalSafely(url).catch((error) => {
                console.warn('[Electron] Failed to open external URL:', error.message);
            });
            return { action: 'deny' };
        });

        win.webContents.on('will-navigate', (event, url) => {
            if (url === 'about:blank' || url === this.options.serverUrl || url.startsWith(`${this.options.serverUrl}/`)) {
                return;
            }

            event.preventDefault();
            void this.options.openExternalSafely(url).catch((error) => {
                console.warn('[Electron] Failed to open external URL:', error.message);
            });
        });
    }

    createSetupWindow() {
        if (this.setupWindow && !this.setupWindow.isDestroyed()) {
            this.showSetupWindow();
            return this.setupWindow;
        }

        this.setupWindow = new BrowserWindow({
            width: 720,
            height: 620,
            resizable: false,
            maximizable: false,
            title: 'Automated Video Generator - Setup',
            icon: this.getIconPath(),
            autoHideMenuBar: true,
            webPreferences: {
                preload: path.join(__dirname, 'electron-preload.js'),
                contextIsolation: true,
                nodeIntegration: false,
                sandbox: true,
            },
        });

        const setupHtmlPath = this.options.isDev
            ? path.join(__dirname, '..', 'electron', 'electron-setup.html')
            : path.join(__dirname, 'electron-setup.html');

        this.attachNavigationGuards(this.setupWindow);
        this.setupWindow.loadFile(setupHtmlPath);
        this.setupWindow.on('closed', () => {
            this.setupWindow = null;
            if (this.options.shouldQuitAfterSetupClosed()) {
                app.quit();
            }
        });

        return this.setupWindow;
    }

    closeSetupWindow() {
        if (!this.setupWindow || this.setupWindow.isDestroyed()) {
            this.setupWindow = null;
            return;
        }

        const win = this.setupWindow;
        this.setupWindow = null;
        win.removeAllListeners('closed');
        win.close();
    }

    createMainWindow() {
        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
            this.showMainWindow();
            return this.mainWindow;
        }

        this.mainWindow = new BrowserWindow({
            width: 1280,
            height: 860,
            minWidth: 900,
            minHeight: 600,
            title: 'Automated Video Generator',
            icon: this.getIconPath(),
            autoHideMenuBar: true,
            show: false,
            webPreferences: {
                contextIsolation: true,
                nodeIntegration: false,
                sandbox: true,
            },
        });

        this.attachNavigationGuards(this.mainWindow);
        this.mainWindow.loadURL(this.options.serverUrl);
        this.mainWindow.once('ready-to-show', () => {
            this.mainWindow?.show();
        });
        this.mainWindow.on('close', (event) => {
            if (this.mainWindow && this.tray) {
                event.preventDefault();
                this.mainWindow.hide();
            }
        });
        this.mainWindow.on('closed', () => {
            this.mainWindow = null;
        });

        return this.mainWindow;
    }

    createTray() {
        if (this.tray) {
            return this.tray;
        }

        const trayIconPath = this.options.isDev
            ? path.join(__dirname, '..', 'assets', 'tray-icon.png')
            : path.join(process.resourcesPath, 'tray-icon.png');

        const trayImage = fs.existsSync(trayIconPath)
            ? nativeImage.createFromPath(trayIconPath)
            : nativeImage.createEmpty();

        this.tray = new Tray(trayImage.isEmpty() ? nativeImage.createFromDataURL(this.createFallbackTrayIcon()) : trayImage);
        this.tray.setToolTip('Automated Video Generator');
        this.tray.setContextMenu(Menu.buildFromTemplate([
            { label: 'Show Portal', click: () => this.showMainWindow() },
            {
                label: 'Open in Browser',
                click: () => {
                    void this.options.openExternalSafely(this.options.serverUrl).catch((error) => {
                        console.warn('[Electron] Failed to open browser URL:', error.message);
                    });
                },
            },
            { type: 'separator' },
            { label: 'Quit', click: () => this.options.onQuit() },
        ]));
        this.tray.on('double-click', () => this.showMainWindow());

        return this.tray;
    }

    destroyTray() {
        this.tray?.destroy();
        this.tray = null;
    }
}
