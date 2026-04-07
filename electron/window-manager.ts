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

    showMainWindow() {
        const tag = logTag('showMainWindow');
        if (!this.mainWindow || this.mainWindow.isDestroyed()) {
            console.warn(tag, 'Cannot show main window — it is null or destroyed');
            return;
        }
        console.log(tag, 'Showing and focusing main window');
        this.mainWindow.show();
        this.mainWindow.focus();
    }

    showSetupWindow() {
        const tag = logTag('showSetupWindow');
        if (!this.setupWindow || this.setupWindow.isDestroyed()) {
            console.warn(tag, 'Cannot show setup window — it is null or destroyed');
            return;
        }
        console.log(tag, 'Showing and focusing setup window');
        this.setupWindow.show();
        this.setupWindow.focus();
    }

    private getIconPath(): string | undefined {
        const tag = logTag('getIconPath');
        const icoPath = this.options.isDev
            ? path.join(__dirname, '..', 'assets', 'logo-automation.png')
            : path.join(process.resourcesPath, 'logo-automation.png');

        const exists = fs.existsSync(icoPath);
        console.log(tag, 'Icon path:', icoPath, '| Exists:', exists);

        if (!exists) {
            console.warn(tag, 'Icon file not found — window will use default icon');
            return undefined;
        }

        try {
            const stat = fs.statSync(icoPath);
            if (stat.size === 0) {
                console.warn(tag, 'Icon file is zero bytes — ignoring');
                return undefined;
            }
        } catch (error: any) {
            console.warn(tag, 'Cannot stat icon file:', error.message);
            return undefined;
        }

        return icoPath;
    }

    private createFallbackTrayIcon(): string {
        console.log(logTag('createFallbackTrayIcon'), 'Using inline fallback tray icon');
        return 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAA0ElEQVQ4T2NkoBAwUqifYdAb8P////8MDAwMjIyMDMjy////Z2BgYGD4/x+okJGRARkzIKv5Dwb/GRj+/2dk+M/AwMD4n4Hh/38w/v+fkYERJsbAwPAfRcv//wwMwDD4z8DA8B/I+s/AwMjwH8hmZGD8D5YDigHlGIBq/oNcAzKckZHxPyMDI9A1/4Gu+c/ACLIBLMfIyMDA+P8/A+N/RkZGsJtBYgz/GRgYQGECdsN/BgYGRrCboW4G2cDICHIzWAwYK8C4kZGREWgpGAAAx5VSEWhLJocAAAAASUVORK5CYII=';
    }

    private attachNavigationGuards(win: BrowserWindow): void {
        const tag = logTag('attachNavigationGuards');
        console.log(tag, 'Attaching navigation guards to window');

        win.webContents.setWindowOpenHandler(({ url }) => {
            console.log(tag, 'window.open intercepted, URL:', url);
            void this.options.openExternalSafely(url).catch((error) => {
                console.warn(tag, 'Failed to open external URL:', url, '| Error:', error.message);
            });
            return { action: 'deny' };
        });

        win.webContents.on('will-navigate', (event, url) => {
            if (url === 'about:blank' || url === this.options.serverUrl || url.startsWith(`${this.options.serverUrl}/`)) {
                console.log(tag, 'Allowing navigation to:', url);
                return;
            }

            console.log(tag, 'Blocking in-app navigation to:', url, '— opening externally');
            event.preventDefault();
            void this.options.openExternalSafely(url).catch((error) => {
                console.warn(tag, 'Failed to open external URL:', url, '| Error:', error.message);
            });
        });
    }

    createSetupWindow() {
        const tag = logTag('createSetupWindow');
        console.log(tag, 'Creating setup window...');

        if (this.setupWindow && !this.setupWindow.isDestroyed()) {
            console.log(tag, 'Setup window already exists — showing existing window');
            this.showSetupWindow();
            return this.setupWindow;
        }

        const iconPath = this.getIconPath();
        const preloadPath = path.join(__dirname, 'electron-preload.js');
        console.log(tag, 'Preload path:', preloadPath, '| Exists:', fs.existsSync(preloadPath));

        if (!fs.existsSync(preloadPath)) {
            console.error(tag, 'Preload script not found at:', preloadPath, '— setup window IPC will not work');
        }

        try {
            this.setupWindow = new BrowserWindow({
                width: 720,
                height: 620,
                resizable: false,
                maximizable: false,
                title: 'Automated Video Generator - Setup',
                icon: iconPath,
                autoHideMenuBar: true,
                webPreferences: {
                    preload: preloadPath,
                    contextIsolation: true,
                    nodeIntegration: false,
                    sandbox: true,
                },
            });
        } catch (error: any) {
            console.error(tag, 'Failed to create setup BrowserWindow:', error.message);
            console.error(tag, 'Stack:', error.stack);
            throw error;
        }

        const setupHtmlPath = this.options.isDev
            ? path.join(__dirname, '..', 'electron', 'electron-setup.html')
            : path.join(__dirname, 'electron-setup.html');

        console.log(tag, 'Setup HTML path:', setupHtmlPath, '| Exists:', fs.existsSync(setupHtmlPath));

        if (!fs.existsSync(setupHtmlPath)) {
            console.error(tag, 'Setup HTML file not found at:', setupHtmlPath);
            // Try alternate locations as fallback
            const alternates = [
                path.join(__dirname, 'electron-setup.html'),
                path.join(__dirname, '..', 'electron', 'electron-setup.html'),
                path.join(this.options.isDev ? '' : (process.resourcesPath || ''), 'app', 'electron', 'electron-setup.html'),
            ].filter(Boolean);

            let foundAlternate = false;
            for (const alt of alternates) {
                if (alt && fs.existsSync(alt)) {
                    console.log(tag, 'Found setup HTML at alternate location:', alt);
                    this.attachNavigationGuards(this.setupWindow);
                    this.setupWindow.loadFile(alt).catch((loadErr: Error) => {
                        console.error(tag, 'Failed to load setup HTML from alternate:', alt, '| Error:', loadErr.message);
                    });
                    foundAlternate = true;
                    break;
                }
            }

            if (!foundAlternate) {
                console.error(tag, 'No setup HTML file found at any location. Alternates checked:', alternates);
            }
        } else {
            this.attachNavigationGuards(this.setupWindow);
            this.setupWindow.loadFile(setupHtmlPath).catch((loadErr: Error) => {
                console.error(tag, 'Failed to load setup HTML:', setupHtmlPath, '| Error:', loadErr.message);
            });
        }

        this.setupWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
            console.error(tag, 'Setup window failed to load | Code:', errorCode, '| Description:', errorDescription, '| URL:', validatedURL);
        });

        this.setupWindow.webContents.on('did-finish-load', () => {
            console.log(tag, '✓ Setup window finished loading');
        });

        this.setupWindow.on('closed', () => {
            console.log(tag, 'Setup window closed');
            this.setupWindow = null;
            if (this.options.shouldQuitAfterSetupClosed()) {
                console.log(tag, 'No main window or pending launch — quitting app');
                app.quit();
            }
        });

        console.log(tag, '✓ Setup window created successfully');
        return this.setupWindow;
    }

    closeSetupWindow() {
        const tag = logTag('closeSetupWindow');

        if (!this.setupWindow || this.setupWindow.isDestroyed()) {
            console.log(tag, 'Setup window already closed or destroyed');
            this.setupWindow = null;
            return;
        }

        console.log(tag, 'Closing setup window...');
        const win = this.setupWindow;
        this.setupWindow = null;
        win.removeAllListeners('closed');

        try {
            win.close();
            console.log(tag, '✓ Setup window closed');
        } catch (error: any) {
            console.warn(tag, 'Error closing setup window (may already be destroyed):', error.message);
        }
    }

    createMainWindow() {
        const tag = logTag('createMainWindow');
        console.log(tag, 'Creating main window...');

        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
            console.log(tag, 'Main window already exists — showing existing window');
            this.showMainWindow();
            return this.mainWindow;
        }

        const iconPath = this.getIconPath();
        console.log(tag, 'Loading URL:', this.options.serverUrl);

        try {
            this.mainWindow = new BrowserWindow({
                width: 1280,
                height: 860,
                minWidth: 900,
                minHeight: 600,
                title: 'Automated Video Generator',
                icon: iconPath,
                autoHideMenuBar: true,
                show: false,
                webPreferences: {
                    contextIsolation: true,
                    nodeIntegration: false,
                    sandbox: true,
                },
            });
        } catch (error: any) {
            console.error(tag, 'Failed to create main BrowserWindow:', error.message);
            console.error(tag, 'Stack:', error.stack);
            throw error;
        }

        this.attachNavigationGuards(this.mainWindow);

        this.mainWindow.loadURL(this.options.serverUrl).catch((loadErr: Error) => {
            console.error(tag, 'Failed to load server URL:', this.options.serverUrl, '| Error:', loadErr.message);
        });

        this.mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
            console.error(tag, 'Main window failed to load | Code:', errorCode, '| Description:', errorDescription, '| URL:', validatedURL);
        });

        this.mainWindow.webContents.on('did-finish-load', () => {
            console.log(tag, '✓ Main window finished loading:', this.options.serverUrl);
        });

        this.mainWindow.once('ready-to-show', () => {
            console.log(tag, 'Main window ready to show');
            this.mainWindow?.show();
        });

        this.mainWindow.on('close', (event) => {
            if (this.mainWindow && this.tray) {
                console.log(tag, 'Main window close intercepted — hiding to tray');
                event.preventDefault();
                this.mainWindow.hide();
            }
        });

        this.mainWindow.on('closed', () => {
            console.log(tag, 'Main window closed and destroyed');
            this.mainWindow = null;
        });

        // ── Crash Detection & Recovery ──────────────────────────────────
        this.mainWindow.webContents.on('render-process-gone', (_event, details) => {
            console.error(tag, '══════════════════════════════════════════');
            console.error(tag, '⚠ RENDERER PROCESS CRASHED');
            console.error(tag, 'Reason:', details.reason);
            console.error(tag, 'Exit code:', details.exitCode);
            console.error(tag, '══════════════════════════════════════════');

            // Auto-reload on crash instead of showing a blank window
            if (this.mainWindow && !this.mainWindow.isDestroyed()) {
                console.log(tag, 'Attempting to reload main window after crash...');
                setTimeout(() => {
                    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
                        this.mainWindow.loadURL(this.options.serverUrl).catch((loadErr: Error) => {
                            console.error(tag, 'Failed to reload after crash:', loadErr.message);
                        });
                    }
                }, 2000);
            }
        });

        this.mainWindow.webContents.on('unresponsive', () => {
            console.warn(tag, '══════════════════════════════════════════');
            console.warn(tag, '⚠ RENDERER BECAME UNRESPONSIVE');
            console.warn(tag, 'The page may be stuck due to heavy processing.');
            console.warn(tag, 'Will wait 30s before force-reloading...');
            console.warn(tag, '══════════════════════════════════════════');

            // Give it 30 seconds to recover before force-reloading
            setTimeout(() => {
                if (this.mainWindow && !this.mainWindow.isDestroyed()) {
                    if (this.mainWindow.webContents.isCurrentlyAudible() || !this.mainWindow.webContents.isCrashed()) {
                        console.log(tag, 'Window seems to have recovered — not reloading');
                        return;
                    }
                    console.log(tag, 'Force-reloading unresponsive window...');
                    this.mainWindow.loadURL(this.options.serverUrl).catch((loadErr: Error) => {
                        console.error(tag, 'Failed to reload unresponsive window:', loadErr.message);
                    });
                }
            }, 30000);
        });

        this.mainWindow.webContents.on('responsive', () => {
            console.log(tag, '✓ Renderer became responsive again');
        });

        console.log(tag, '✓ Main window created successfully');
        return this.mainWindow;
    }

    createTray() {
        const tag = logTag('createTray');
        console.log(tag, 'Creating system tray...');

        if (this.tray) {
            console.log(tag, 'Tray already exists');
            return this.tray;
        }

        const trayIconPath = this.options.isDev
            ? path.join(__dirname, '..', 'assets', 'logo-automation.png')
            : path.join(process.resourcesPath, 'logo-automation.png');

        console.log(tag, 'Tray icon path:', trayIconPath, '| Exists:', fs.existsSync(trayIconPath));

        let trayImage = nativeImage.createEmpty();

        if (fs.existsSync(trayIconPath)) {
            try {
                const stat = fs.statSync(trayIconPath);
                if (stat.size > 0) {
                    const loadedImage = nativeImage.createFromPath(trayIconPath);
                    if (!loadedImage.isEmpty()) {
                        trayImage = loadedImage;
                        console.log(tag, '✓ Loaded tray icon from file');
                    } else {
                        console.warn(tag, 'Tray icon loaded but is empty — using fallback');
                    }
                } else {
                    console.warn(tag, 'Tray icon is zero bytes — using fallback');
                }
            } catch (error: any) {
                console.warn(tag, 'Failed to load tray icon:', error.message, '— using fallback');
            }
        } else {
            console.warn(tag, 'Tray icon file not found — using fallback');
        }

        if (trayImage.isEmpty()) {
            try {
                trayImage = nativeImage.createFromDataURL(this.createFallbackTrayIcon());
                console.log(tag, 'Using inline fallback tray icon');
            } catch (error: any) {
                console.error(tag, 'Failed to create fallback tray icon:', error.message);
                // Create a minimal 16x16 icon as final fallback
                try {
                    const buffer = Buffer.alloc(16 * 16 * 4, 0);
                    // Fill with a solid orange color (RGBA)
                    for (let i = 0; i < buffer.length; i += 4) {
                        buffer[i] = 216;     // R
                        buffer[i + 1] = 100; // G
                        buffer[i + 2] = 42;  // B
                        buffer[i + 3] = 255; // A
                    }
                    trayImage = nativeImage.createFromBuffer(buffer, { width: 16, height: 16 });
                    console.log(tag, 'Using programmatic minimal tray icon');
                } catch (bufErr: any) {
                    console.error(tag, 'Failed to create programmatic tray icon:', bufErr.message);
                }
            }
        }

        try {
            this.tray = new Tray(trayImage);
            this.tray.setToolTip('Automated Video Generator');
            this.tray.setContextMenu(Menu.buildFromTemplate([
                {
                    label: 'Show Portal',
                    click: () => {
                        console.log(tag, 'Tray menu: Show Portal clicked');
                        this.showMainWindow();
                    },
                },
                {
                    label: 'Open in Browser',
                    click: () => {
                        console.log(tag, 'Tray menu: Open in Browser clicked');
                        void this.options.openExternalSafely(this.options.serverUrl).catch((error) => {
                            console.warn(tag, 'Failed to open browser URL:', error.message);
                        });
                    },
                },
                { type: 'separator' },
                {
                    label: 'Quit',
                    click: () => {
                        console.log(tag, 'Tray menu: Quit clicked');
                        this.options.onQuit();
                    },
                },
            ]));
            this.tray.on('double-click', () => {
                console.log(tag, 'Tray double-clicked');
                this.showMainWindow();
            });
            console.log(tag, '✓ System tray created');
        } catch (error: any) {
            console.error(tag, 'Failed to create system tray:', error.message);
            console.error(tag, 'Stack:', error.stack);
        }

        return this.tray;
    }

    destroyTray() {
        const tag = logTag('destroyTray');
        if (!this.tray) {
            console.log(tag, 'No tray to destroy');
            return;
        }

        console.log(tag, 'Destroying system tray...');
        try {
            this.tray.destroy();
            console.log(tag, '✓ Tray destroyed');
        } catch (error: any) {
            console.warn(tag, 'Error destroying tray:', error.message);
        }
        this.tray = null;
    }
}
