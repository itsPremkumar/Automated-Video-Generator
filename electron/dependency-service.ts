import { BrowserWindow, shell } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { execSync, spawnSync } from 'child_process';

export interface DepStatus {
    name: string;
    label: string;
    installed: boolean;
    version?: string;
    required: boolean;
}

export interface VoiceEngineRepairResult {
    attempted: boolean;
    detail: string;
    repaired: boolean;
}

type DependencyServiceOptions = {
    appRoot: string;
};

function logTag(method: string): string {
    return `[DependencyService:${method}]`;
}

export class DependencyService {
    constructor(private readonly options: DependencyServiceOptions) {
        console.log(logTag('constructor'), 'Initialized with appRoot:', this.options.appRoot);
    }

    private resolveApp(...segments: string[]): string {
        return path.join(this.options.appRoot, ...segments);
    }

    private runQuiet(command: string): string | null {
        const tag = logTag('runQuiet');
        console.log(tag, 'Running command:', command);
        try {
            const result = execSync(command, {
                encoding: 'utf8',
                timeout: 15000,
                stdio: ['pipe', 'pipe', 'pipe'],
                windowsHide: true,
            }).trim();
            console.log(tag, 'Command succeeded:', command, '→', result.slice(0, 200));
            return result;
        } catch (error: any) {
            const stderr = error?.stderr ? String(error.stderr).trim().slice(0, 300) : '';
            const msg = error?.message ? error.message.slice(0, 200) : 'Unknown error';
            console.warn(tag, 'Command failed:', command, '| Error:', msg, stderr ? `| Stderr: ${stderr}` : '');
            return null;
        }
    }

    private encodePowerShellCommand(script: string): string {
        const tag = logTag('encodePowerShellCommand');
        try {
            const encoded = Buffer.from(script, 'utf16le').toString('base64');
            console.log(tag, 'Encoded PowerShell script, length:', encoded.length);
            return encoded;
        } catch (error: any) {
            console.error(tag, 'Failed to encode PowerShell script:', error.message);
            throw error;
        }
    }

    private runPowerShellEncoded(script: string, envOverrides: NodeJS.ProcessEnv = process.env): string | null {
        const tag = logTag('runPowerShellEncoded');
        if (process.platform !== 'win32') {
            console.log(tag, 'Skipping — not running on Windows (platform:', process.platform, ')');
            return null;
        }

        console.log(tag, 'Executing PowerShell script...');
        try {
            const encodedCmd = this.encodePowerShellCommand(script);
            const result = spawnSync(
                'powershell.exe',
                ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encodedCmd],
                {
                    encoding: 'utf8',
                    env: envOverrides,
                    stdio: 'pipe',
                    timeout: 15000,
                    windowsHide: true,
                },
            );

            if (result.error) {
                console.warn(tag, 'PowerShell spawn error:', result.error.message);
                return null;
            }

            if (result.stderr && result.stderr.trim()) {
                console.warn(tag, 'PowerShell stderr:', result.stderr.trim().slice(0, 500));
            }

            if (result.status === 0) {
                const output = result.stdout.trim() || 'Windows offline speech ready';
                console.log(tag, 'PowerShell succeeded, output:', output.slice(0, 200));
                return output;
            }

            console.warn(tag, 'PowerShell exited with status:', result.status);
        } catch (error: any) {
            console.warn(tag, 'PowerShell execution failed:', error.message);
        }

        return null;
    }

    private detectWindowsOfflineVoice(): string | null {
        const tag = logTag('detectWindowsOfflineVoice');
        console.log(tag, 'Checking for Windows offline speech voices...');
        const result = this.runPowerShellEncoded(`
Add-Type -AssemblyName System.Speech
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
try {
  $voices = @($synth.GetInstalledVoices() | Where-Object { $_.Enabled })
  if ($voices.Count -le 0) {
    throw 'No enabled Windows speech voices are installed.'
  }
  Write-Output $voices[0].VoiceInfo.Name
} finally {
  $synth.Dispose()
}
        `);

        if (result) {
            console.log(tag, 'Windows offline voice found:', result);
        } else {
            console.log(tag, 'No Windows offline voice available');
        }
        return result;
    }

    private bundledPythonCandidates(): string[] {
        const candidates = [
            this.resolveApp('portable-python', 'python.exe'),
            path.join(process.resourcesPath || '', 'app-bundle', 'portable-python', 'python.exe'),
            path.join(process.resourcesPath || '', 'portable-python', 'python.exe'),
        ].filter(Boolean);
        console.log(logTag('bundledPythonCandidates'), 'Candidates:', candidates);
        return candidates;
    }

    private bundledRequirementsCandidates(): string[] {
        const candidates = [
            this.resolveApp('requirements.txt'),
            path.join(process.resourcesPath || '', 'app-bundle', 'requirements.txt'),
        ].filter(Boolean);
        console.log(logTag('bundledRequirementsCandidates'), 'Candidates:', candidates);
        return candidates;
    }

    private isBundledPythonPath(pythonPath: string): boolean {
        const normalized = path.resolve(pythonPath);
        return this.bundledPythonCandidates().some((candidate) => path.resolve(candidate) === normalized);
    }

    private getCoreRuntimeStatus(): {
        detail: string;
        ready: boolean;
    } {
        const serverEntry = this.resolveApp('src', 'server.ts');
        const tsxCli = this.resolveApp('node_modules', 'tsx', 'dist', 'cli.mjs');
        const nodeModules = this.resolveApp('node_modules');

        const missing: string[] = [];
        if (!fs.existsSync(nodeModules)) {
            missing.push(`node_modules missing at ${nodeModules}`);
        }
        if (!fs.existsSync(tsxCli)) {
            missing.push(`tsx CLI missing at ${tsxCli}`);
        }
        if (!fs.existsSync(serverEntry)) {
            missing.push(`server entry missing at ${serverEntry}`);
        }

        return {
            ready: missing.length === 0,
            detail: missing.length === 0 ? 'Core portal runtime is available.' : missing.join('\n'),
        };
    }

    private findBundledPythonExecutable(): string | null {
        const tag = logTag('findBundledPythonExecutable');
        console.log(tag, 'Searching for bundled Python...');

        for (const pythonExe of this.bundledPythonCandidates()) {
            console.log(tag, 'Checking:', pythonExe, '| Exists:', fs.existsSync(pythonExe));
            if (!fs.existsSync(pythonExe)) {
                continue;
            }

            try {
                const stat = fs.statSync(pythonExe);
                if (stat.size === 0) {
                    console.warn(tag, 'Skipping zero-byte python.exe at:', pythonExe);
                    continue;
                }
                console.log(tag, 'File size:', stat.size, 'bytes');
            } catch (statErr: any) {
                console.warn(tag, 'Cannot stat file:', pythonExe, statErr.message);
                continue;
            }

            const version = this.runQuiet(`"${pythonExe}" --version`);
            if (version) {
                console.log(tag, 'Found bundled Python:', pythonExe, '→', version);
                return pythonExe;
            } else {
                console.warn(tag, 'python.exe exists but --version failed:', pythonExe);
            }
        }

        console.log(tag, 'No bundled Python executable found');
        return null;
    }

    private findPythonExecutable(): string | null {
        const tag = logTag('findPythonExecutable');
        console.log(tag, 'Searching for system Python...');

        // Try common PATH commands first
        for (const cmd of ['python', 'py', 'python3']) {
            console.log(tag, 'Trying PATH command:', cmd);
            const version = this.runQuiet(`${cmd} --version`);
            if (version && version.toLowerCase().includes('python')) {
                console.log(tag, 'Found system Python via:', cmd, '→', version);
                return cmd;
            }
        }

        // Scan common install locations
        const localAppData = process.env.LOCALAPPDATA || '';
        const userProfile = process.env.USERPROFILE || '';
        console.log(tag, 'LOCALAPPDATA:', localAppData, '| USERPROFILE:', userProfile);

        const scanRoots: string[] = [];
        if (localAppData) {
            scanRoots.push(path.join(localAppData, 'Programs', 'Python'));
        }
        if (userProfile) {
            scanRoots.push(path.join(userProfile, 'AppData', 'Local', 'Programs', 'Python'));
        }

        const pythonDirs: string[] = [];
        for (const root of [...new Set(scanRoots)]) {
            console.log(tag, 'Scanning directory:', root, '| Exists:', fs.existsSync(root));
            if (!fs.existsSync(root)) {
                continue;
            }

            try {
                const entries = fs.readdirSync(root, { withFileTypes: true });
                for (const entry of entries) {
                    if (entry.isDirectory() && /^Python\d+/i.test(entry.name)) {
                        const dir = path.join(root, entry.name);
                        console.log(tag, 'Found Python directory:', dir);
                        pythonDirs.push(dir);
                    }
                }
            } catch (error: any) {
                console.warn(tag, 'Failed to scan directory:', root, '| Error:', error.message);
            }
        }

        pythonDirs.sort((left, right) => right.localeCompare(left));
        for (const dir of pythonDirs) {
            const exe = path.join(dir, 'python.exe');
            console.log(tag, 'Checking:', exe, '| Exists:', fs.existsSync(exe));
            if (fs.existsSync(exe) && this.runQuiet(`"${exe}" --version`)) {
                console.log(tag, 'Found system Python at:', exe);
                return exe;
            }
        }

        // Scan C:\ root for Python directories
        try {
            console.log(tag, 'Scanning C:\\ root for Python directories...');
            const cDriveEntries = fs.readdirSync('C:\\', { withFileTypes: true });
            for (const entry of cDriveEntries) {
                if (!entry.isDirectory() || !/^Python\d+/i.test(entry.name)) {
                    continue;
                }

                const exe = path.join('C:\\', entry.name, 'python.exe');
                console.log(tag, 'Checking C:\\ Python:', exe, '| Exists:', fs.existsSync(exe));
                if (fs.existsSync(exe) && this.runQuiet(`"${exe}" --version`)) {
                    console.log(tag, 'Found system Python at:', exe);
                    return exe;
                }
            }
        } catch (error: any) {
            console.warn(tag, 'Failed to scan C:\\ root:', error.message);
        }

        // Check Windows Store Python
        if (localAppData) {
            const windowsAppsExe = path.join(localAppData, 'Microsoft', 'WindowsApps', 'python.exe');
            console.log(tag, 'Checking Windows Store Python:', windowsAppsExe, '| Exists:', fs.existsSync(windowsAppsExe));
            if (fs.existsSync(windowsAppsExe) && this.runQuiet(`"${windowsAppsExe}" --version`)) {
                console.log(tag, 'Found Windows Store Python at:', windowsAppsExe);
                return windowsAppsExe;
            }
        }

        console.warn(tag, 'No system Python found anywhere');
        return null;
    }

    private findBundledEdgeTtsExecutable(): string | null {
        const tag = logTag('findBundledEdgeTtsExecutable');
        console.log(tag, 'Searching for bundled edge-tts...');

        const bundledPython = this.findBundledPythonExecutable();
        if (!bundledPython) {
            console.log(tag, 'No bundled Python — cannot check for bundled edge-tts');
            return null;
        }

        const edgeExe = path.join(path.dirname(bundledPython), 'Scripts', 'edge-tts.exe');
        console.log(tag, 'Checking edge-tts.exe at:', edgeExe, '| Exists:', fs.existsSync(edgeExe));
        if (fs.existsSync(edgeExe)) {
            const helpResult = this.runQuiet(`"${edgeExe}" --help`);
            if (helpResult) {
                console.log(tag, 'Found bundled edge-tts.exe:', edgeExe);
                return edgeExe;
            } else {
                console.warn(tag, 'edge-tts.exe exists but --help failed:', edgeExe);
            }
        }

        console.log(tag, 'Trying bundled Python module: edge_tts');
        if (this.runQuiet(`"${bundledPython}" -m edge_tts --help`)) {
            console.log(tag, 'Found bundled edge_tts module via:', bundledPython);
            return bundledPython;
        }

        console.warn(tag, 'No bundled edge-tts found');
        return null;
    }

    private repairBundledEdgeTts(): boolean {
        const tag = logTag('repairBundledEdgeTts');
        console.log(tag, 'Attempting to repair bundled edge-tts...');

        const bundledPython = this.findBundledPythonExecutable();
        if (!bundledPython) {
            console.warn(tag, 'Cannot repair — no bundled Python found');
            return false;
        }

        const requirementsFile = this.bundledRequirementsCandidates().find((candidate) => fs.existsSync(candidate));
        const installCommand = requirementsFile
            ? `"${bundledPython}" -m pip install -r "${requirementsFile}" --no-warn-script-location`
            : `"${bundledPython}" -m pip install edge-tts --no-warn-script-location`;

        console.log(tag, 'Requirements file:', requirementsFile || 'none found, using direct install');
        console.log(tag, 'Install command:', installCommand);

        try {
            const output = execSync(installCommand, {
                encoding: 'utf8',
                timeout: 240000,
                stdio: ['pipe', 'pipe', 'pipe'],
                windowsHide: true,
            });
            console.log(tag, 'pip install output:', output.trim().slice(-500));

            const edgeTtsFound = Boolean(this.findBundledEdgeTtsExecutable());
            console.log(tag, 'Repair result — edge-tts available:', edgeTtsFound);
            return edgeTtsFound;
        } catch (error: any) {
            const stderr = error?.stderr ? String(error.stderr).trim().slice(0, 500) : '';
            console.error(tag, 'pip install failed:', error.message);
            if (stderr) {
                console.error(tag, 'pip stderr:', stderr);
            }
            return false;
        }
    }

    checkNodeInstalled(): DepStatus {
        const tag = logTag('checkNodeInstalled');
        console.log(tag, 'Checking Node.js...');
        const version = this.runQuiet('node --version');
        const status: DepStatus = { name: 'node', label: 'Node.js', installed: !!version, version: version || undefined, required: true };
        console.log(tag, 'Result:', JSON.stringify(status));
        return status;
    }

    checkPythonInstalled(): DepStatus {
        const tag = logTag('checkPythonInstalled');
        console.log(tag, 'Checking Python...');

        const bundledPython = this.findBundledPythonExecutable();
        if (bundledPython) {
            const version = this.runQuiet(`"${bundledPython}" --version`);
            const status: DepStatus = {
                name: 'python',
                label: 'Python 3',
                installed: true,
                version: version ? `${version} (bundled)` : `Bundled at ${bundledPython}`,
                required: true,
            };
            console.log(tag, 'Found bundled Python:', JSON.stringify(status));
            return status;
        }

        const pythonExe = this.findPythonExecutable();
        if (pythonExe) {
            const version = this.runQuiet(`"${pythonExe}" --version`);
            const status: DepStatus = {
                name: 'python',
                label: 'Python 3',
                installed: true,
                version: version || `Found at ${pythonExe}`,
                required: true,
            };
            console.log(tag, 'Found system Python:', JSON.stringify(status));
            return status;
        }

        console.warn(tag, 'Python not found');
        return { name: 'python', label: 'Python 3', installed: false, required: true };
    }

    checkFfmpegInstalled(): DepStatus {
        const tag = logTag('checkFfmpegInstalled');
        console.log(tag, 'Checking FFmpeg...');

        const ffmpegStaticPath = this.resolveApp('node_modules', 'ffmpeg-static', 'ffmpeg.exe');
        console.log(tag, 'Checking bundled ffmpeg-static at:', ffmpegStaticPath, '| Exists:', fs.existsSync(ffmpegStaticPath));
        if (fs.existsSync(ffmpegStaticPath)) {
            const status: DepStatus = { name: 'ffmpeg', label: 'FFmpeg', installed: true, version: 'bundled (ffmpeg-static)', required: true };
            console.log(tag, 'Found bundled FFmpeg');
            return status;
        }

        const version = this.runQuiet('ffmpeg -version');
        const status: DepStatus = {
            name: 'ffmpeg',
            label: 'FFmpeg',
            installed: !!version,
            version: version ? version.split('\n')[0] : undefined,
            required: true,
        };
        console.log(tag, 'System FFmpeg result:', JSON.stringify(status));
        return status;
    }

    checkEdgeTtsInstalled(): DepStatus {
        const tag = logTag('checkEdgeTtsInstalled');
        console.log(tag, 'Checking Edge-TTS voice engine...');

        // 1. Check bundled edge-tts
        const bundledEdgeTts = this.findBundledEdgeTtsExecutable();
        if (bundledEdgeTts) {
            const status: DepStatus = {
                name: 'edge-tts',
                label: 'Voice Engine',
                installed: true,
                version: bundledEdgeTts.endsWith('python.exe') ? `${bundledEdgeTts} -m edge_tts` : `${bundledEdgeTts} (bundled)`,
                required: true,
            };
            console.log(tag, 'Found bundled edge-tts:', JSON.stringify(status));
            return status;
        }

        // 2. Check system edge-tts CLI
        console.log(tag, 'Checking system edge-tts CLI...');
        if (this.runQuiet('edge-tts --help')) {
            console.log(tag, 'Found system edge-tts CLI on PATH');
            return { name: 'edge-tts', label: 'Voice Engine', installed: true, version: 'edge-tts CLI', required: true };
        }

        // 3. Check system Python with edge_tts module
        console.log(tag, 'Checking system Python for edge_tts module...');
        const pythonExe = this.findPythonExecutable();
        if (pythonExe && this.runQuiet(`"${pythonExe}" -m edge_tts --help`)) {
            console.log(tag, 'Found edge_tts via system Python:', pythonExe);
            return { name: 'edge-tts', label: 'Voice Engine', installed: true, version: `${pythonExe} -m edge_tts`, required: true };
        }

        // 4. Scan LOCALAPPDATA Python directories for edge-tts.exe
        const localAppData = process.env.LOCALAPPDATA || '';
        if (localAppData) {
            const pythonRoot = path.join(localAppData, 'Programs', 'Python');
            console.log(tag, 'Scanning LOCALAPPDATA Python at:', pythonRoot, '| Exists:', fs.existsSync(pythonRoot));
            if (fs.existsSync(pythonRoot)) {
                try {
                    const entries = fs.readdirSync(pythonRoot, { withFileTypes: true });
                    for (const entry of entries) {
                        if (!entry.isDirectory() || !/^Python\d+/i.test(entry.name)) {
                            continue;
                        }

                        const edgeExe = path.join(pythonRoot, entry.name, 'Scripts', 'edge-tts.exe');
                        console.log(tag, 'Checking LOCALAPPDATA edge-tts:', edgeExe, '| Exists:', fs.existsSync(edgeExe));
                        if (fs.existsSync(edgeExe) && this.runQuiet(`"${edgeExe}" --help`)) {
                            console.log(tag, 'Found edge-tts via LOCALAPPDATA:', edgeExe);
                            return { name: 'edge-tts', label: 'Voice Engine', installed: true, version: edgeExe, required: true };
                        }
                    }
                } catch (error: any) {
                    console.warn(tag, 'Failed scanning LOCALAPPDATA Python:', error.message);
                }
            }
        }

        // 5. Check Windows offline speech voices
        console.log(tag, 'Checking Windows offline speech voices as last resort...');
        const offlineVoice = this.detectWindowsOfflineVoice();
        if (offlineVoice) {
            console.log(tag, 'Found Windows offline voice:', offlineVoice);
            return {
                name: 'edge-tts',
                label: 'Voice Engine',
                installed: true,
                version: `Windows offline voice: ${offlineVoice}`,
                required: true,
            };
        }

        console.warn(tag, 'No voice engine found anywhere');
        return { name: 'edge-tts', label: 'Voice Engine', installed: false, required: true };
    }

    checkNodeModulesInstalled(): DepStatus {
        const tag = logTag('checkNodeModulesInstalled');
        const nodeModulesPath = this.resolveApp('node_modules');
        const exists = fs.existsSync(nodeModulesPath);
        console.log(tag, 'node_modules path:', nodeModulesPath, '| Exists:', exists);
        return {
            name: 'node_modules',
            label: 'Node.js Dependencies',
            installed: exists,
            version: exists ? 'installed' : undefined,
            required: true,
        };
    }

    checkAllDependencies(): DepStatus[] {
        const tag = logTag('checkAllDependencies');
        console.log(tag, '--- Starting full dependency check ---');
        const startTime = Date.now();
        const results = [
            this.checkNodeInstalled(),
            this.checkPythonInstalled(),
            this.checkFfmpegInstalled(),
            this.checkEdgeTtsInstalled(),
            this.checkNodeModulesInstalled(),
        ];
        const elapsed = Date.now() - startTime;
        console.log(tag, `--- Dependency check complete in ${elapsed}ms ---`);
        console.log(tag, 'Summary:', results.map(d => `${d.name}=${d.installed ? 'OK' : 'MISSING'}`).join(', '));
        return results;
    }

    allDependenciesReady(): boolean {
        const tag = logTag('allDependenciesReady');
        const coreRuntime = this.getCoreRuntimeStatus();
        console.log(tag, 'Core runtime ready:', coreRuntime.ready, '| Detail:', coreRuntime.detail);
        return coreRuntime.ready;
    }

    tryAutoRepairVoiceEngine(): VoiceEngineRepairResult {
        const tag = logTag('tryAutoRepairVoiceEngine');
        console.log(tag, 'Attempting automatic voice engine repair...');

        const bundledPython = this.findBundledPythonExecutable();
        if (!bundledPython) {
            const detail = 'No bundled Python runtime is available for automatic voice-engine repair.';
            console.log(tag, detail);
            return { attempted: false, detail, repaired: false };
        }

        if (!this.isBundledPythonPath(bundledPython)) {
            const detail = `Skipping automatic repair because Python is not bundled: ${bundledPython}`;
            console.log(tag, detail);
            return { attempted: false, detail, repaired: false };
        }

        const repaired = this.repairBundledEdgeTts();
        const detail = repaired
            ? `Bundled voice engine repaired successfully via ${bundledPython}`
            : `Bundled Python was found at ${bundledPython}, but repairing edge-tts failed.`;
        console.log(tag, detail);
        return { attempted: true, detail, repaired };
    }

    private sendProgress(win: BrowserWindow | null, step: string, message: string, percent: number) {
        console.log(logTag('sendProgress'), `[${step}] ${message} (${percent}%)`);
        try {
            win?.webContents.send('install-progress', { step, message, percent });
        } catch (error: any) {
            console.warn(logTag('sendProgress'), 'Failed to send progress to renderer:', error.message);
        }
    }

    private tryExecSync(command: string, options: Parameters<typeof execSync>[1]): { ok: boolean; stdout: string; stderr: string } {
        const tag = logTag('tryExecSync');
        console.log(tag, 'Executing:', command);
        try {
            const stdout = execSync(command, {
                ...options,
                encoding: 'utf8',
                stdio: ['pipe', 'pipe', 'pipe'],
            }) as string;
            console.log(tag, 'Command succeeded. Stdout (last 300 chars):', stdout.trim().slice(-300));
            return { ok: true, stdout: stdout.trim(), stderr: '' };
        } catch (error: any) {
            const stderr = error?.stderr ? String(error.stderr).trim() : '';
            const stdout = error?.stdout ? String(error.stdout).trim() : '';
            console.error(tag, 'Command failed:', command);
            console.error(tag, 'Exit code:', error?.status);
            console.error(tag, 'Error message:', error?.message?.slice(0, 300));
            if (stderr) console.error(tag, 'Stderr:', stderr.slice(0, 500));
            if (stdout) console.log(tag, 'Stdout before failure:', stdout.slice(-300));
            return { ok: false, stdout, stderr: stderr || error?.message || 'Unknown error' };
        }
    }

    async installDependency(win: BrowserWindow | null, name: string): Promise<boolean> {
        const tag = logTag('installDependency');
        console.log(tag, '=== Installing dependency:', name, '===');
        const startTime = Date.now();

        try {
            switch (name) {
                case 'python': {
                    if (this.findBundledPythonExecutable()) {
                        this.sendProgress(win, name, 'Bundled Python runtime is already available.', 100);
                        console.log(tag, 'Python: bundled Python already available');
                        return true;
                    }

                    // Attempt 1: Install via winget
                    this.sendProgress(win, name, 'Installing Python 3 via winget...', 10);
                    console.log(tag, 'Python: trying winget install...');
                    const wingetResult = this.tryExecSync(
                        'winget install --id Python.Python.3.12 --exact --accept-package-agreements --accept-source-agreements --silent',
                        { timeout: 300000, windowsHide: true },
                    );

                    if (wingetResult.ok) {
                        this.sendProgress(win, name, 'Python 3 installed successfully via winget', 100);
                        console.log(tag, 'Python: ✓ installed via winget');
                        return true;
                    }

                    console.warn(tag, 'Python: winget failed, trying chocolatey fallback...');

                    // Attempt 2: Install via chocolatey
                    this.sendProgress(win, name, 'winget failed. Trying Chocolatey...', 30);
                    const chocoResult = this.tryExecSync(
                        'choco install python3 -y --no-progress',
                        { timeout: 300000, windowsHide: true },
                    );

                    if (chocoResult.ok) {
                        this.sendProgress(win, name, 'Python 3 installed successfully via Chocolatey', 100);
                        console.log(tag, 'Python: ✓ installed via chocolatey');
                        return true;
                    }

                    console.warn(tag, 'Python: chocolatey also failed, trying to open download page...');

                    // Attempt 3: Open Python download page as last resort
                    this.sendProgress(win, name, 'Automatic install failed. Opening Python download page...', 50);
                    try {
                        await shell.openExternal('https://www.python.org/downloads/');
                        console.log(tag, 'Python: opened download page for manual install');
                    } catch (shellError: any) {
                        console.error(tag, 'Python: failed to open download page:', shellError.message);
                    }
                    this.sendProgress(win, name, 'Please install Python 3 manually from python.org, then click "Install" again.', 0);
                    return false;
                }
                case 'ffmpeg':
                    console.log(tag, 'FFmpeg: bundled with app via ffmpeg-static');
                    this.sendProgress(win, name, 'FFmpeg is bundled with the app (ffmpeg-static)', 100);
                    return true;
                case 'edge-tts': {
                    if (this.findBundledEdgeTtsExecutable()) {
                        this.sendProgress(win, name, 'Bundled Edge-TTS voice engine is already available.', 100);
                        console.log(tag, 'Edge-TTS: bundled version already available');
                        return true;
                    }

                    const bundledPython = this.findBundledPythonExecutable();
                    if (bundledPython) {
                        this.sendProgress(win, name, 'Repairing bundled Edge-TTS voice engine...', 20);
                        console.log(tag, 'Edge-TTS: attempting repair with bundled Python:', bundledPython);
                        const repaired = this.repairBundledEdgeTts();
                        if (repaired) {
                            this.sendProgress(win, name, 'Bundled Edge-TTS repaired successfully', 100);
                            console.log(tag, 'Edge-TTS: ✓ bundled edge-tts repaired');
                        } else {
                            this.sendProgress(win, name, 'Bundled Edge-TTS repair failed — will try system Python', 30);
                            console.warn(tag, 'Edge-TTS: bundled repair failed, falling through to system pip');
                        }
                        if (repaired) return true;
                    }

                    this.sendProgress(win, name, 'Installing edge-tts Python package via system pip...', 40);
                    console.log(tag, 'Edge-TTS: trying system pip install...');

                    // Find a working pip
                    let pipCmd: string | null = null;
                    for (const candidate of ['python', 'py', 'python3']) {
                        console.log(tag, 'Edge-TTS: checking pip via:', candidate);
                        if (this.runQuiet(`${candidate} -m pip --version`)) {
                            pipCmd = candidate;
                            break;
                        }
                    }

                    if (!pipCmd) {
                        // Also check known Python paths
                        const systemPython = this.findPythonExecutable();
                        if (systemPython && this.runQuiet(`"${systemPython}" -m pip --version`)) {
                            pipCmd = `"${systemPython}"`;
                            console.log(tag, 'Edge-TTS: found pip via full Python path:', systemPython);
                        }
                    }

                    if (!pipCmd) {
                        console.error(tag, 'Edge-TTS: no pip found — cannot install edge-tts');
                        this.sendProgress(win, name, 'Python pip not found. Install Python first, then retry.', 0);
                        return false;
                    }

                    console.log(tag, 'Edge-TTS: installing via:', pipCmd);
                    const pipResult = this.tryExecSync(
                        `${pipCmd} -m pip install edge-tts --no-warn-script-location`,
                        { timeout: 120000, windowsHide: true },
                    );

                    if (pipResult.ok) {
                        this.sendProgress(win, name, 'edge-tts installed successfully', 100);
                        console.log(tag, 'Edge-TTS: ✓ installed via pip');
                        return true;
                    }

                    console.error(tag, 'Edge-TTS: pip install failed:', pipResult.stderr.slice(0, 300));
                    this.sendProgress(win, name, `edge-tts install failed: ${pipResult.stderr.slice(0, 150)}`, 0);
                    return false;
                }
                case 'node_modules': {
                    this.sendProgress(win, name, 'Installing Node.js dependencies (npm install)...', 10);
                    console.log(tag, 'node_modules: running npm install in:', this.options.appRoot);

                    const npmResult = this.tryExecSync('npm install', {
                        cwd: this.options.appRoot,
                        timeout: 300000,
                        windowsHide: true,
                    });

                    if (npmResult.ok) {
                        this.sendProgress(win, name, 'Node.js dependencies installed', 100);
                        console.log(tag, 'node_modules: ✓ npm install succeeded');
                        return true;
                    }

                    console.error(tag, 'node_modules: npm install failed:', npmResult.stderr.slice(0, 300));
                    this.sendProgress(win, name, `npm install failed: ${npmResult.stderr.slice(0, 150)}`, 0);
                    return false;
                }
                default:
                    console.warn(tag, 'Unknown dependency name:', name);
                    this.sendProgress(win, name, `Unknown dependency: ${name}`, 0);
                    return false;
            }
        } catch (error: any) {
            const errorMsg = error?.message || String(error);
            console.error(tag, 'Unhandled error installing', name, ':', errorMsg);
            console.error(tag, 'Stack:', error?.stack);
            this.sendProgress(win, name, `Failed: ${errorMsg.slice(0, 200)}`, 0);
            return false;
        } finally {
            const elapsed = Date.now() - startTime;
            console.log(tag, `=== Finished installing ${name} in ${elapsed}ms ===`);
        }
    }

    async installAllDependencies(win: BrowserWindow | null): Promise<void> {
        const tag = logTag('installAllDependencies');
        console.log(tag, '=== Starting full dependency installation ===');
        const startTime = Date.now();

        const allDeps = this.checkAllDependencies();
        const missing = allDeps.filter((dep) => dep.required && !dep.installed);
        console.log(tag, 'Total dependencies:', allDeps.length, '| Missing:', missing.length);
        console.log(tag, 'Missing:', missing.map(d => d.name).join(', ') || 'none');

        let index = 0;
        const results: { name: string; success: boolean }[] = [];

        for (const dep of missing) {
            index += 1;
            const overallPercent = Math.round((index / missing.length) * 100);
            this.sendProgress(win, dep.name, `Installing ${dep.label}... (${index}/${missing.length})`, overallPercent);
            const success = await this.installDependency(win, dep.name);
            results.push({ name: dep.name, success });
        }

        const elapsed = Date.now() - startTime;
        console.log(tag, `=== Full installation complete in ${elapsed}ms ===`);
        console.log(tag, 'Results:', results.map(r => `${r.name}=${r.success ? 'OK' : 'FAILED'}`).join(', '));

        try {
            win?.webContents.send('setup-complete');
        } catch (error: any) {
            console.warn(tag, 'Failed to send setup-complete to renderer:', error.message);
        }
    }

    verifyVoiceEngine(): { ok: boolean; detail: string } {
        const tag = logTag('verifyVoiceEngine');
        console.log(tag, '=== Verifying voice engine ===');

        const voiceEngineStatus = this.checkEdgeTtsInstalled();
        if (voiceEngineStatus.installed) {
            console.log(tag, '✓ Voice engine is ready:', voiceEngineStatus.version);
            return { ok: true, detail: voiceEngineStatus.version || 'Voice engine ready' };
        }

        const resourcesDir = process.resourcesPath || '';
        console.log(tag, 'Voice engine not found via checkEdgeTtsInstalled. Doing deep verification...');
        console.log(tag, 'resourcesPath:', resourcesDir || '(not set)');

        const candidatePaths = [
            path.join(this.options.appRoot, 'portable-python', 'python.exe'),
            path.join(resourcesDir, 'app-bundle', 'portable-python', 'python.exe'),
            path.join(resourcesDir, 'portable-python', 'python.exe'),
        ];

        for (const pythonPath of candidatePaths) {
            console.log(tag, 'Checking Python candidate:', pythonPath, '| Exists:', fs.existsSync(pythonPath));
            if (!fs.existsSync(pythonPath)) {
                continue;
            }

            const versionCheck = this.runQuiet(`"${pythonPath}" --version`);
            if (!versionCheck) {
                console.warn(tag, 'Python exists but --version failed:', pythonPath);
                continue;
            }

            const edgeTtsExe = path.join(path.dirname(pythonPath), 'Scripts', 'edge-tts.exe');
            console.log(tag, 'Checking edge-tts.exe at:', edgeTtsExe, '| Exists:', fs.existsSync(edgeTtsExe));
            if (fs.existsSync(edgeTtsExe)) {
                console.log(tag, '✓ Found bundled edge-tts.exe at:', edgeTtsExe);
                return { ok: true, detail: `Bundled edge-tts found at: ${edgeTtsExe}` };
            }
            if (this.runQuiet(`"${pythonPath}" -m edge_tts --help`)) {
                console.log(tag, '✓ Found bundled Python edge_tts module at:', pythonPath);
                return { ok: true, detail: `Bundled Python edge_tts module at: ${pythonPath}` };
            }

            console.warn(tag, 'Python found but edge-tts NOT installed in it:', pythonPath);
            if (this.isBundledPythonPath(pythonPath)) {
                return {
                    ok: false,
                    detail: `Bundled Python was found at ${pythonPath}, but edge-tts is missing. The app can still launch, and the setup flow can repair the voice engine.`,
                };
            }

            return {
                ok: false,
                detail: `Python found at ${pythonPath} but edge-tts is not installed in it. The app can still launch, but voice generation will be unavailable until the package is installed.`,
            };
        }

        const systemPython = this.findPythonExecutable();
        if (systemPython && this.runQuiet(`"${systemPython}" -m edge_tts --help`)) {
            console.log(tag, '✓ Found system edge-tts via:', systemPython);
            return { ok: true, detail: `System edge-tts via: ${systemPython}` };
        }
        if (this.runQuiet('edge-tts --help')) {
            console.log(tag, '✓ edge-tts found on system PATH');
            return { ok: true, detail: 'edge-tts found on system PATH' };
        }

        const checkedList = candidatePaths.map((candidate) => `  - ${candidate} (${fs.existsSync(candidate) ? 'exists but broken' : 'not found'})`).join('\n');
        const detail = `No working bundled Edge-TTS runtime was found.\n\nPaths checked:\n${checkedList}\n\nSystem Python: ${systemPython || 'not found'}\nresourcesPath: ${resourcesDir || 'not set'}\n\nThe app can still launch, but narration generation will stay disabled until a voice engine is repaired or installed.`;
        console.error(tag, '✗ Voice engine verification failed:');
        console.error(tag, detail);
        return { ok: false, detail };
    }
}
