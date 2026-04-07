import { app, BrowserWindow, Menu, MenuItemConstructorOptions, nativeImage, Tray } from 'electron';
import * as fs from 'fs';
import * as path from 'path';

type WindowKind = 'main' | 'setup';

type WindowManagerOptions = {
    isDev: boolean;
    onQuit: () => void;
    onWindowCreated?: (kind: WindowKind, window: BrowserWindow) => void;
    openDesktopLog?: () => void;
    openDiagnosticsFolder?: () => void;
    openExternalSafely: (url: string) => Promise<void>;
    serverUrl: string;
    shouldQuitAfterSetupClosed: () => boolean;
    toggleDevTools?: () => void;
};

function logTag(method: string): string {
    return `[WindowManager:${method}]`;
}

export class WindowManager {
    private mainWindow: BrowserWindow | null = null;
    private setupWindow: BrowserWindow | null = null;
    private tray: Tray | null = null;

    constructor(private readonly options: WindowManagerOptions) {
        console.log(logTag('constructor'), 'Initialized | isDev:', this.options.isDev, '| serverUrl:', this.options.serverUrl);
    }

    getMainWindow(): BrowserWindow | null {
        return this.mainWindow;
    }

    getSetupWindow(): BrowserWindow | null {
        return this.setupWindow;
    }

    hasTray(): boolean {
        return this.tray !== null;
    }

    showMainWindow(): void {
        const tag = logTag('showMainWindow');
        if (!this.mainWindow || this.mainWindow.isDestroyed()) {
            console.warn(tag, 'Cannot show main window because it is missing or destroyed');
            return;
        }

        console.log(tag, 'Showing and focusing main window');
        this.mainWindow.show();
        this.mainWindow.focus();
    }

    showSetupWindow(): void {
        const tag = logTag('showSetupWindow');
        if (!this.setupWindow || this.setupWindow.isDestroyed()) {
            console.warn(tag, 'Cannot show setup window because it is missing or destroyed');
            return;
        }

        console.log(tag, 'Showing and focusing setup window');
        this.setupWindow.show();
        this.setupWindow.focus();
    }

    createSetupWindow(): BrowserWindow {
        const tag = logTag('createSetupWindow');
        console.log(tag, 'Creating setup window...');

        if (this.setupWindow && !this.setupWindow.isDestroyed()) {
            console.log(tag, 'Setup window already exists; focusing it instead');
            this.showSetupWindow();
            return this.setupWindow;
        }

        const iconPath = this.getIconPath();
        const preloadPath = this.getPreloadPath();
        const setupHtmlPath = this.resolveSetupHtmlPath();

        this.setupWindow = new BrowserWindow({
            autoHideMenuBar: true,
            height: 620,
            icon: iconPath,
            maximizable: false,
            resizable: false,
            title: 'Automated Video Generator - Setup',
            webPreferences: {
                contextIsolation: true,
                nodeIntegration: false,
                preload: preloadPath,
                sandbox: true,
            },
            width: 720,
        });

        this.options.onWindowCreated?.('setup', this.setupWindow);
        this.attachNavigationGuards(this.setupWindow);

        if (setupHtmlPath) {
            this.setupWindow.loadFile(setupHtmlPath).catch((error: Error) => {
                console.error(tag, 'Failed to load setup HTML:', error.message);
            });
        }

        this.setupWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
            console.error(tag, 'Setup window failed to load | Code:', errorCode, '| Description:', errorDescription, '| URL:', validatedURL);
        });

        this.setupWindow.webContents.on('did-finish-load', () => {
            console.log(tag, 'Setup window finished loading');
        });

        this.setupWindow.on('closed', () => {
            console.log(tag, 'Setup window closed');
            this.setupWindow = null;
            if (this.options.shouldQuitAfterSetupClosed()) {
                console.log(tag, 'No main window or pending launch remains; quitting app');
                app.quit();
            }
        });

        console.log(tag, 'Setup window created successfully');
        return this.setupWindow;
    }

    closeSetupWindow(): void {
        const tag = logTag('closeSetupWindow');
        if (!this.setupWindow || this.setupWindow.isDestroyed()) {
            console.log(tag, 'Setup window is already closed');
            this.setupWindow = null;
            return;
        }

        console.log(tag, 'Closing setup window...');
        const windowRef = this.setupWindow;
        this.setupWindow = null;
        windowRef.removeAllListeners('closed');

        try {
            windowRef.close();
        } catch (error: any) {
            console.warn(tag, 'Failed to close setup window cleanly:', error.message);
        }
    }

    createMainWindow(): BrowserWindow {
        const tag = logTag('createMainWindow');
        console.log(tag, 'Creating main window...');

        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
            console.log(tag, 'Main window already exists; focusing it instead');
            this.showMainWindow();
            return this.mainWindow;
        }

        const iconPath = this.getIconPath();
        const preloadPath = this.getPreloadPath();

        this.mainWindow = new BrowserWindow({
            autoHideMenuBar: true,
            height: 860,
            icon: iconPath,
            minHeight: 600,
            minWidth: 900,
            show: false,
            title: 'Automated Video Generator',
            webPreferences: {
                contextIsolation: true,
                nodeIntegration: false,
                preload: preloadPath,
                sandbox: true,
            },
            width: 1280,
        });

        this.options.onWindowCreated?.('main', this.mainWindow);
        this.attachNavigationGuards(this.mainWindow);

        this.mainWindow.loadURL(this.options.serverUrl).catch((error: Error) => {
            console.error(tag, 'Failed to load portal URL:', error.message);
        });

        this.mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
            console.error(tag, 'Main window failed to load | Code:', errorCode, '| Description:', errorDescription, '| URL:', validatedURL);
        });

        this.mainWindow.webContents.on('did-finish-load', () => {
            console.log(tag, 'Main window finished loading:', this.options.serverUrl);
        });

        this.mainWindow.once('ready-to-show', () => {
            console.log(tag, 'Main window is ready to show');
            this.mainWindow?.show();
        });

        this.mainWindow.on('close', (event) => {
            if (this.mainWindow && this.tray) {
                console.log(tag, 'Close intercepted; hiding main window to tray');
                event.preventDefault();
                this.mainWindow.hide();
            }
        });

        this.mainWindow.on('closed', () => {
            console.log(tag, 'Main window closed');
            this.mainWindow = null;
        });

        this.mainWindow.webContents.on('render-process-gone', (_event, details) => {
            console.error(tag, 'Renderer process crashed | Reason:', details.reason, '| Exit code:', details.exitCode);
            if (this.mainWindow && !this.mainWindow.isDestroyed()) {
                setTimeout(() => {
                    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
                        this.mainWindow.loadURL(this.options.serverUrl).catch((error: Error) => {
                            console.error(tag, 'Failed to reload main window after renderer crash:', error.message);
                        });
                    }
                }, 2000);
            }
        });

        this.mainWindow.webContents.on('unresponsive', () => {
            console.warn(tag, 'Main window became unresponsive; waiting before reload');
            setTimeout(() => {
                if (!this.mainWindow || this.mainWindow.isDestroyed()) {
                    return;
                }

                if (!this.mainWindow.webContents.isCrashed()) {
                    console.log(tag, 'Main window recovered before forced reload');
                    return;
                }

                this.mainWindow.loadURL(this.options.serverUrl).catch((error: Error) => {
                    console.error(tag, 'Failed to reload unresponsive main window:', error.message);
                });
            }, 30000);
        });

        this.mainWindow.webContents.on('responsive', () => {
            console.log(tag, 'Main window became responsive again');
        });

        console.log(tag, 'Main window created successfully');
        return this.mainWindow;
    }

    createTray(): Tray | null {
        const tag = logTag('createTray');
        console.log(tag, 'Creating system tray...');

        if (this.tray) {
            console.log(tag, 'Tray already exists');
            return this.tray;
        }

        const trayIconPath = this.options.isDev
            ? path.join(__dirname, '..', 'assets', 'logo-automation.png')
            : path.join(process.resourcesPath, 'logo-automation.png');

        let trayImage = nativeImage.createEmpty();
        if (fs.existsSync(trayIconPath)) {
            try {
                const loadedImage = nativeImage.createFromPath(trayIconPath);
                if (!loadedImage.isEmpty()) {
                    trayImage = loadedImage;
                }
            } catch (error: any) {
                console.warn(tag, 'Failed to load tray icon:', error.message);
            }
        }

        if (trayImage.isEmpty()) {
            trayImage = nativeImage.createFromDataURL(this.createFallbackTrayIcon());
        }

        try {
            this.tray = new Tray(trayImage);
            this.tray.setToolTip('Automated Video Generator');
            this.tray.setContextMenu(Menu.buildFromTemplate(this.buildTrayMenu()));
            this.tray.on('double-click', () => {
                if (this.mainWindow) {
                    this.showMainWindow();
                    return;
                }

                if (this.setupWindow) {
                    this.showSetupWindow();
                }
            });
            console.log(tag, 'System tray created');
        } catch (error: any) {
            console.error(tag, 'Failed to create system tray:', error.message);
            console.error(tag, 'Stack:', error.stack);
        }

        return this.tray;
    }

    destroyTray(): void {
        const tag = logTag('destroyTray');
        if (!this.tray) {
            console.log(tag, 'No tray to destroy');
            return;
        }

        try {
            this.tray.destroy();
            console.log(tag, 'Tray destroyed');
        } catch (error: any) {
            console.warn(tag, 'Failed to destroy tray cleanly:', error.message);
        }

        this.tray = null;
    }

    private attachNavigationGuards(window: BrowserWindow): void {
        const tag = logTag('attachNavigationGuards');
        window.webContents.setWindowOpenHandler(({ url }) => {
            console.log(tag, 'Intercepted window.open for URL:', url);
            void this.options.openExternalSafely(url).catch((error) => {
                console.warn(tag, 'Failed to open external URL:', error.message);
            });
            return { action: 'deny' };
        });

        window.webContents.on('will-navigate', (event, url) => {
            if (url === 'about:blank' || url === this.options.serverUrl || url.startsWith(`${this.options.serverUrl}/`)) {
                return;
            }

            event.preventDefault();
            console.log(tag, 'Blocked in-app navigation to:', url);
            void this.options.openExternalSafely(url).catch((error) => {
                console.warn(tag, 'Failed to open external URL:', error.message);
            });
        });
    }

    private buildTrayMenu(): MenuItemConstructorOptions[] {
        const items: MenuItemConstructorOptions[] = [
            {
                label: 'Show Portal',
                click: () => {
                    if (this.mainWindow) {
                        this.showMainWindow();
                        return;
                    }

                    if (this.setupWindow) {
                        this.showSetupWindow();
                    }
                },
            },
            {
                label: 'Open in Browser',
                click: () => {
                    void this.options.openExternalSafely(this.options.serverUrl).catch((error) => {
                        console.warn(logTag('buildTrayMenu'), 'Failed to open browser URL:', error.message);
                    });
                },
            },
        ];

        if (this.options.openDesktopLog) {
            items.push({
                label: 'Open Desktop Log',
                click: () => {
                    this.options.openDesktopLog?.();
                },
            });
        }

        if (this.options.openDiagnosticsFolder) {
            items.push({
                label: 'Open Diagnostics Folder',
                click: () => {
                    this.options.openDiagnosticsFolder?.();
                },
            });
        }

        if (this.options.toggleDevTools) {
            items.push({
                label: 'Toggle DevTools',
                click: () => {
                    this.options.toggleDevTools?.();
                },
            });
        }

        items.push(
            { type: 'separator' },
            {
                label: 'Quit',
                click: () => {
                    this.options.onQuit();
                },
            },
        );

        return items;
    }

    private createFallbackTrayIcon(): string {
        return 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAA0ElEQVQ4T2NkoBAwUqifYdAb8P////8MDAwMjIyMDMjy////Z2BgYGD4/x+okJGRARkzIKv5Dwb/GRj+/2dk+M/AwMD4n4Hh/38w/v+fkYERJsbAwPAfRcv//wwMwDD4z8DA8B/I+s/AwMjwH8hmZGD8D5YDigHlGIBq/oNcAzKckZHxPyMDI9A1/4Gu+c/ACLIBLMfIyMDA+P8/A+N/RkZGsJtBYgz/GRgYQGECdsN/BgYGRrCboW4G2cDICHIzWAwYK8C4kZGREWgpGAAAx5VSEWhLJocAAAAASUVORK5CYII=';
    }

    private getIconPath(): string | undefined {
        const iconPath = this.options.isDev
            ? path.join(__dirname, '..', 'assets', 'logo-automation.png')
            : path.join(process.resourcesPath, 'logo-automation.png');

        if (!fs.existsSync(iconPath)) {
            console.warn(logTag('getIconPath'), 'Icon file not found:', iconPath);
            return undefined;
        }

        return iconPath;
    }

    private getPreloadPath(): string {
        const tag = logTag('getPreloadPath');
        const preloadPath = path.join(__dirname, 'electron-preload.js');
        if (!fs.existsSync(preloadPath)) {
            console.error(tag, 'Preload script not found:', preloadPath);
        }
        return preloadPath;
    }

    private resolveSetupHtmlPath(): string | null {
        const tag = logTag('resolveSetupHtmlPath');
        const candidates = [
            this.options.isDev
                ? path.join(__dirname, '..', 'electron', 'electron-setup.html')
                : path.join(__dirname, 'electron-setup.html'),
            path.join(__dirname, 'electron-setup.html'),
            path.join(__dirname, '..', 'electron', 'electron-setup.html'),
            path.join(process.resourcesPath || '', 'app', 'electron', 'electron-setup.html'),
        ];

        for (const candidate of candidates) {
            if (candidate && fs.existsSync(candidate)) {
                console.log(tag, 'Using setup HTML at:', candidate);
                return candidate;
            }
        }

        console.error(tag, 'No setup HTML file was found. Candidates:', candidates);
        return null;
    }
}
