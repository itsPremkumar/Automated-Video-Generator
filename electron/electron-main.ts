import { app, BrowserWindow, Tray, Menu, ipcMain, shell, nativeImage, dialog } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { execSync, spawn, ChildProcess } from 'child_process';

// ─── Path Resolution ─────────────────────────────────────────────────────────
const isDev = !app.isPackaged;
const appRoot = path.resolve(__dirname, '..');

function resolveApp(...segments: string[]): string {
    return path.join(appRoot, ...segments);
}

// ─── Globals ─────────────────────────────────────────────────────────────────
let mainWindow: BrowserWindow | null = null;
let setupWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let serverProcess: ChildProcess | null = null;
const PORT = 3001;
const SERVER_URL = `http://localhost:${PORT}`;

// ─── Dependency Checking ─────────────────────────────────────────────────────
interface DepStatus {
    name: string;
    label: string;
    installed: boolean;
    version?: string;
    required: boolean;
}

function runQuiet(command: string): string | null {
    try {
        return execSync(command, {
            encoding: 'utf8',
            timeout: 15000,
            stdio: ['pipe', 'pipe', 'pipe'],
            windowsHide: true,
        }).trim();
    } catch {
        return null;
    }
}

function checkNodeInstalled(): DepStatus {
    const version = runQuiet('node --version');
    return {
        name: 'node',
        label: 'Node.js',
        installed: !!version,
        version: version || undefined,
        required: true,
    };
}

function checkPythonInstalled(): DepStatus {
    const pythonExe = findPythonExecutable();
    if (pythonExe) {
        const version = runQuiet(`"${pythonExe}" --version`);
        return {
            name: 'python',
            label: 'Python 3',
            installed: true,
            version: version || `Found at ${pythonExe}`,
            required: true,
        };
    }
    return {
        name: 'python',
        label: 'Python 3',
        installed: false,
        required: true,
    };
}

/**
 * Scans PATH and common Windows install directories to find a working python.exe
 * This mirrors the logic in scripts/start-local-portal.ps1 (Get-InstalledPythonDirs)
 */
function findPythonExecutable(): string | null {
    // 1. Try PATH-based commands first
    const pathCommands = ['python', 'py', 'python3'];
    for (const cmd of pathCommands) {
        const ver = runQuiet(`${cmd} --version`);
        if (ver && ver.toLowerCase().includes('python')) {
            return cmd;
        }
    }

    // 2. Scan common Windows Python install directories
    const localAppData = process.env.LOCALAPPDATA || '';
    const userProfile = process.env.USERPROFILE || '';
    const scanRoots: string[] = [];

    if (localAppData) {
        scanRoots.push(path.join(localAppData, 'Programs', 'Python'));
    }
    if (userProfile) {
        scanRoots.push(path.join(userProfile, 'AppData', 'Local', 'Programs', 'Python'));
    }

    // Collect all Python directories, sorted newest-first
    const pythonDirs: string[] = [];
    for (const root of [...new Set(scanRoots)]) {
        if (!fs.existsSync(root)) continue;
        try {
            const entries = fs.readdirSync(root, { withFileTypes: true });
            for (const entry of entries) {
                if (entry.isDirectory() && /^Python\d+/i.test(entry.name)) {
                    pythonDirs.push(path.join(root, entry.name));
                }
            }
        } catch { /* skip */ }
    }

    // Sort descending so newest Python is tried first
    pythonDirs.sort((a, b) => b.localeCompare(a));

    for (const dir of pythonDirs) {
        const exe = path.join(dir, 'python.exe');
        if (fs.existsSync(exe)) {
            const ver = runQuiet(`"${exe}" --version`);
            if (ver) return exe;
        }
    }

    // 3. Check system-wide installs like C:\Python3xx
    try {
        const cDriveEntries = fs.readdirSync('C:\\', { withFileTypes: true });
        for (const entry of cDriveEntries) {
            if (entry.isDirectory() && /^Python\d+/i.test(entry.name)) {
                const exe = path.join('C:\\', entry.name, 'python.exe');
                if (fs.existsSync(exe)) {
                    const ver = runQuiet(`"${exe}" --version`);
                    if (ver) return exe;
                }
            }
        }
    } catch { /* skip */ }

    // 4. WindowsApps python
    if (localAppData) {
        const windowsAppsExe = path.join(localAppData, 'Microsoft', 'WindowsApps', 'python.exe');
        if (fs.existsSync(windowsAppsExe)) {
            const ver = runQuiet(`"${windowsAppsExe}" --version`);
            if (ver) return windowsAppsExe;
        }
    }

    return null;
}

function checkFfmpegInstalled(): DepStatus {
    // First check if ffmpeg-static is available in node_modules
    const ffmpegStaticPath = resolveApp('node_modules', 'ffmpeg-static', 'ffmpeg.exe');
    if (fs.existsSync(ffmpegStaticPath)) {
        return {
            name: 'ffmpeg',
            label: 'FFmpeg',
            installed: true,
            version: 'bundled (ffmpeg-static)',
            required: true,
        };
    }
    const version = runQuiet('ffmpeg -version');
    return {
        name: 'ffmpeg',
        label: 'FFmpeg',
        installed: !!version,
        version: version ? version.split('\n')[0] : undefined,
        required: true,
    };
}

function checkEdgeTtsInstalled(): DepStatus {
    // Check edge-tts command on PATH
    const edgeCheck = runQuiet('edge-tts --help');
    if (edgeCheck) {
        return {
            name: 'edge-tts',
            label: 'Edge-TTS (Voice Engine)',
            installed: true,
            version: 'edge-tts CLI',
            required: true,
        };
    }

    // Check via python module using our robust python finder
    const pythonExe = findPythonExecutable();
    if (pythonExe) {
        const pyCheck = runQuiet(`"${pythonExe}" -m edge_tts --help`);
        if (pyCheck) {
            return {
                name: 'edge-tts',
                label: 'Edge-TTS (Voice Engine)',
                installed: true,
                version: `${pythonExe} -m edge_tts`,
                required: true,
            };
        }
    }

    // Also check edge-tts.exe in Python Scripts directories
    const localAppData = process.env.LOCALAPPDATA || '';
    if (localAppData) {
        const pythonRoot = path.join(localAppData, 'Programs', 'Python');
        if (fs.existsSync(pythonRoot)) {
            try {
                const entries = fs.readdirSync(pythonRoot, { withFileTypes: true });
                for (const entry of entries) {
                    if (entry.isDirectory() && /^Python\d+/i.test(entry.name)) {
                        const edgeExe = path.join(pythonRoot, entry.name, 'Scripts', 'edge-tts.exe');
                        if (fs.existsSync(edgeExe)) {
                            const check = runQuiet(`"${edgeExe}" --help`);
                            if (check) {
                                return {
                                    name: 'edge-tts',
                                    label: 'Edge-TTS (Voice Engine)',
                                    installed: true,
                                    version: edgeExe,
                                    required: true,
                                };
                            }
                        }
                    }
                }
            } catch { /* skip */ }
        }
    }

    return {
        name: 'edge-tts',
        label: 'Edge-TTS (Voice Engine)',
        installed: false,
        required: true,
    };
}

function checkNodeModulesInstalled(): DepStatus {
    const exists = fs.existsSync(resolveApp('node_modules'));
    return {
        name: 'node_modules',
        label: 'Node.js Dependencies',
        installed: exists,
        version: exists ? 'installed' : undefined,
        required: true,
    };
}

function checkAllDependencies(): DepStatus[] {
    return [
        checkNodeInstalled(),
        checkPythonInstalled(),
        checkFfmpegInstalled(),
        checkEdgeTtsInstalled(),
        checkNodeModulesInstalled(),
    ];
}

function allDependenciesReady(): boolean {
    const deps = checkAllDependencies();
    return deps.filter(d => d.required).every(d => d.installed);
}

// ─── Dependency Installation ─────────────────────────────────────────────────

function sendProgress(win: BrowserWindow | null, step: string, message: string, percent: number) {
    win?.webContents.send('install-progress', { step, message, percent });
}

async function installDependency(win: BrowserWindow | null, name: string): Promise<boolean> {
    try {
        switch (name) {
            case 'python': {
                sendProgress(win, name, 'Installing Python 3 via winget...', 10);
                execSync('winget install --id Python.Python.3.12 --exact --accept-package-agreements --accept-source-agreements --silent', {
                    encoding: 'utf8',
                    timeout: 300000,
                    stdio: 'pipe',
                    windowsHide: true,
                });
                sendProgress(win, name, 'Python 3 installed successfully', 100);
                return true;
            }
            case 'ffmpeg': {
                sendProgress(win, name, 'FFmpeg is bundled with the app (ffmpeg-static)', 100);
                return true;
            }
            case 'edge-tts': {
                sendProgress(win, name, 'Installing edge-tts Python package...', 10);
                const pipCmd = runQuiet('python -m pip --version') ? 'python' :
                    runQuiet('py -m pip --version') ? 'py' : null;
                if (!pipCmd) {
                    sendProgress(win, name, 'Python pip not found. Install Python first.', 0);
                    return false;
                }
                execSync(`${pipCmd} -m pip install edge-tts`, {
                    encoding: 'utf8',
                    timeout: 120000,
                    stdio: 'pipe',
                    windowsHide: true,
                });
                sendProgress(win, name, 'edge-tts installed successfully', 100);
                return true;
            }
            case 'node_modules': {
                sendProgress(win, name, 'Installing Node.js dependencies (npm install)...', 10);
                execSync('npm install', {
                    encoding: 'utf8',
                    cwd: appRoot,
                    timeout: 300000,
                    stdio: 'pipe',
                    windowsHide: true,
                });
                sendProgress(win, name, 'Node.js dependencies installed', 100);
                return true;
            }
            default:
                return false;
        }
    } catch (err: any) {
        sendProgress(win, name, `Failed: ${err.message}`, 0);
        return false;
    }
}

async function installAllDependencies(win: BrowserWindow | null): Promise<void> {
    const deps = checkAllDependencies();
    const missing = deps.filter(d => d.required && !d.installed);
    let idx = 0;

    for (const dep of missing) {
        idx++;
        const overallPercent = Math.round((idx / missing.length) * 100);
        sendProgress(win, dep.name, `Installing ${dep.label}... (${idx}/${missing.length})`, overallPercent);
        await installDependency(win, dep.name);
    }

    win?.webContents.send('setup-complete');
}

// ─── Server Management ───────────────────────────────────────────────────────

function startServer(): Promise<void> {
    return new Promise((resolve, reject) => {
        const tsxPath = resolveApp('node_modules', 'tsx', 'dist', 'cli.mjs');
        const serverPath = resolveApp('src', 'server.ts');

        // Use the embedded Electron binary as a Node.js process
        const cmd = process.execPath;
        const args = [tsxPath, serverPath];

        const env = {
            ...process.env,
            PORT: String(PORT),
            ELECTRON_RUN_AS_NODE: '1', // Crucial: forces Electron to act like Node.js
            ELECTRON_BACKEND_SERVER: '1', // Tells server.ts to auto-start
            ELECTRON_RESOURCES_PATH: process.resourcesPath || '', // Pass resources path so subprocess can find bundled portable-python
            ELECTRON_APP_ROOT: appRoot, // Pass app root for reliable path resolution
        };

        serverProcess = spawn(cmd, args, {
            cwd: appRoot,
            env,
            stdio: ['pipe', 'pipe', 'pipe'],
            windowsHide: true,
        });

        let started = false;
        const timeout = setTimeout(() => {
            if (!started) {
                started = true;
                resolve(); // resolve anyway after timeout, server may still be starting
            }
        }, 15000);

        serverProcess.stdout?.on('data', (data: Buffer) => {
            const msg = data.toString();
            console.log('[Server]', msg);
            if (msg.includes('running on') && !started) {
                started = true;
                clearTimeout(timeout);
                resolve();
            }
        });

        let lastErrorLog = '';
        serverProcess.stderr?.on('data', (data: Buffer) => {
            const str = data.toString();
            console.error('[Server Error]', str);
            lastErrorLog += str;
        });

        serverProcess.on('error', (err) => {
            console.error('[Server Process Error]', err);
            if (!started) {
                started = true;
                clearTimeout(timeout);
                reject(err);
            }
        });

        serverProcess.on('exit', (code) => {
            console.log('[Server] Process exited with code', code);
            if (code !== 0 && !started) {
                started = true;
                clearTimeout(timeout);
                // Extract last 500 chars of error to fit in dialog comfortably
                const snippet = lastErrorLog.trim().slice(-500); 
                reject(new Error(`Server script crashed on startup (code ${code})\n\nLog:\n${snippet || 'No error log output available'}`));
            }
            serverProcess = null;
        });
    });
}

function stopServer() {
    if (serverProcess) {
        serverProcess.kill();
        serverProcess = null;
    }
}

// ─── Window Creation ─────────────────────────────────────────────────────────

function createSetupWindow() {
    setupWindow = new BrowserWindow({
        width: 720,
        height: 620,
        resizable: false,
        maximizable: false,
        title: 'Automated Video Generator — Setup',
        icon: getIconPath(),
        autoHideMenuBar: true,
        webPreferences: {
            preload: path.join(__dirname, 'electron-preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
        },
    });

    const setupHtmlPath = isDev
        ? path.join(__dirname, '..', 'electron', 'electron-setup.html')
        : path.join(__dirname, 'electron-setup.html');

    setupWindow.loadFile(setupHtmlPath);

    setupWindow.on('closed', () => {
        setupWindow = null;
    });
}

function createMainWindow() {
    mainWindow = new BrowserWindow({
        width: 1280,
        height: 860,
        minWidth: 900,
        minHeight: 600,
        title: 'Automated Video Generator',
        icon: getIconPath(),
        autoHideMenuBar: true,
        show: false,
        webPreferences: {
            contextIsolation: true,
            nodeIntegration: false,
        },
    });

    mainWindow.loadURL(SERVER_URL);

    mainWindow.once('ready-to-show', () => {
        mainWindow?.show();
    });

    mainWindow.on('close', (event) => {
        // Minimize to tray instead of closing
        if (mainWindow && tray) {
            event.preventDefault();
            mainWindow.hide();
        }
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

function getIconPath(): string | undefined {
    const icoPath = isDev
        ? path.join(__dirname, '..', 'assets', 'icon.ico')
        : path.join(process.resourcesPath, 'icon.ico');
    return fs.existsSync(icoPath) ? icoPath : undefined;
}

function createTray() {
    const trayIconPath = isDev
        ? path.join(__dirname, '..', 'assets', 'tray-icon.png')
        : path.join(process.resourcesPath, 'tray-icon.png');

    let trayImage: Electron.NativeImage;
    if (fs.existsSync(trayIconPath)) {
        trayImage = nativeImage.createFromPath(trayIconPath);
    } else {
        // Fallback: create a simple 16x16 tray icon
        trayImage = nativeImage.createEmpty();
    }

    tray = new Tray(trayImage.isEmpty() ? nativeImage.createFromDataURL(createFallbackTrayIcon()) : trayImage);
    tray.setToolTip('Automated Video Generator');

    const contextMenu = Menu.buildFromTemplate([
        {
            label: 'Show Portal',
            click: () => {
                mainWindow?.show();
                mainWindow?.focus();
            },
        },
        {
            label: 'Open in Browser',
            click: () => {
                shell.openExternal(SERVER_URL);
            },
        },
        { type: 'separator' },
        {
            label: 'Quit',
            click: () => {
                stopServer();
                tray?.destroy();
                tray = null;
                app.quit();
            },
        },
    ]);

    tray.setContextMenu(contextMenu);
    tray.on('double-click', () => {
        mainWindow?.show();
        mainWindow?.focus();
    });
}

function createFallbackTrayIcon(): string {
    // Simple 16x16 orange circle as a data URL for fallback tray icon
    return 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAA0ElEQVQ4T2NkoBAwUqifYdAb8P////8MDAwMjIyMDMjy////Z2BgYGD4/x+okJGRARkzIKv5Dwb/GRj+/2dk+M/AwMD4n4Hh/38w/v+fkYERJsbAwPAfRcv//wwMwDD4z8DA8B/I+s/AwMjwH8hmZGD8D5YDigHlGIBq/oNcAzKckZHxPyMDI9A1/4Gu+c/ACLIBLMfIyMDA+P8/A+N/RkZGsJtBYgz/GRgYQGECdsN/BgYGRrCboW4G2cDICHIzWAwYK8C4kZGREWgpGAAAx5VSEWhLJocAAAAASUVORK5CYII=';
}

// ─── IPC Handlers ────────────────────────────────────────────────────────────

function registerIpcHandlers() {
    ipcMain.handle('check-dependencies', () => {
        return checkAllDependencies();
    });

    ipcMain.handle('install-dependency', async (_event, name: string) => {
        return installDependency(setupWindow, name);
    });

    ipcMain.handle('install-all-dependencies', async () => {
        await installAllDependencies(setupWindow);
        return checkAllDependencies();
    });

    ipcMain.handle('open-external', async (_event, url: string) => {
        await shell.openExternal(url);
    });

    ipcMain.handle('get-app-version', () => {
        return app.getVersion();
    });
}

// ─── App Lifecycle ───────────────────────────────────────────────────────────

/**
 * Pre-flight check: verify the bundled portable-python is functional.
 * If the bundled Python can't run, check if system Python + edge-tts exists.
 * Returns diagnostic info if everything fails.
 */
function verifyPortablePython(): { ok: boolean; detail: string } {
    const resourcesDir = process.resourcesPath || '';
    const candidatePaths = [
        path.join(appRoot, 'portable-python', 'python.exe'),                          // dev mode
        path.join(resourcesDir, 'app-bundle', 'portable-python', 'python.exe'),       // packaged
        path.join(resourcesDir, 'portable-python', 'python.exe'),                     // legacy
    ];

    for (const pythonPath of candidatePaths) {
        if (!fs.existsSync(pythonPath)) continue;

        // Check python.exe works
        const pyResult = runQuiet(`"${pythonPath}" --version`);
        if (!pyResult) continue;

        // Check edge-tts is installed
        const edgeTtsExe = path.join(path.dirname(pythonPath), 'Scripts', 'edge-tts.exe');
        if (fs.existsSync(edgeTtsExe)) {
            return { ok: true, detail: `Bundled edge-tts found at: ${edgeTtsExe}` };
        }

        const moduleCheck = runQuiet(`"${pythonPath}" -m edge_tts --help`);
        if (moduleCheck) {
            return { ok: true, detail: `Bundled Python edge_tts module at: ${pythonPath}` };
        }

        return { ok: false, detail: `Python found at ${pythonPath} but edge-tts is not installed in it.` };
    }

    // Check system Python as fallback
    const systemPython = findPythonExecutable();
    if (systemPython) {
        const sysCheck = runQuiet(`"${systemPython}" -m edge_tts --help`);
        if (sysCheck) {
            return { ok: true, detail: `System edge-tts via: ${systemPython}` };
        }
    }

    // Check edge-tts on PATH
    const pathCheck = runQuiet('edge-tts --help');
    if (pathCheck) {
        return { ok: true, detail: 'edge-tts found on system PATH' };
    }

    const checkedList = candidatePaths.map(p => `  - ${p} (${fs.existsSync(p) ? 'exists but broken' : 'not found'})`).join('\n');
    return {
        ok: false,
        detail: `No working edge-tts found.\n\nPaths checked:\n${checkedList}\n\nSystem Python: ${systemPython || 'not found'}\nresourcesPath: ${resourcesDir || 'not set'}`,
    };
}

async function launchApp() {
    registerIpcHandlers();
    
    // Verify bundled Python + edge-tts before starting
    const pythonCheck = verifyPortablePython();
    if (!pythonCheck.ok) {
        console.warn('[Electron] Portable Python check failed:', pythonCheck.detail);
        // Show setup wizard so user can install dependencies
        const response = dialog.showMessageBoxSync({
            type: 'warning',
            title: 'Edge-TTS Voice Engine Not Found',
            message: 'The bundled voice engine (edge-tts) could not be verified.\n\nThe app will still launch, but video generation may fail until this is resolved.',
            detail: pythonCheck.detail,
            buttons: ['Launch Anyway', 'Install Dependencies', 'Quit'],
            defaultId: 0,
        });

        if (response === 2) {
            app.quit();
            return;
        }

        if (response === 1) {
            // Show setup wizard
            createSetupWindow();
            return;
        }
    }

    await startServerAndShowPortal();
}

async function startServerAndShowPortal() {
    try {
        // Create tray first for visual feedback
        createTray();

        // Start the Express server
        await startServer();

        // Give server a moment to fully initialize
        await new Promise(r => setTimeout(r, 2000));

        // Open the main window
        createMainWindow();
    } catch (err: any) {
        dialog.showErrorBox(
            'Startup Error',
            `Failed to start the video generator server.\n\n${err.message}\n\nMake sure all dependencies are installed.`
        );
        app.quit();
    }
}

// Prevent multiple instances
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
    app.quit();
} else {
    app.on('second-instance', () => {
        if (mainWindow) {
            mainWindow.show();
            mainWindow.focus();
        }
    });

    app.whenReady().then(launchApp);

    app.on('window-all-closed', () => {
        // Don't quit; keep running in tray on Windows
    });

    app.on('activate', () => {
        if (mainWindow === null) {
            createMainWindow();
        }
    });

    app.on('before-quit', () => {
        stopServer();
        tray?.destroy();
        tray = null;
    });
}
