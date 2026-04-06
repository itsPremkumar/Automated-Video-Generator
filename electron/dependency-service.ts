import { BrowserWindow } from 'electron';
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

type DependencyServiceOptions = {
    appRoot: string;
};

export class DependencyService {
    constructor(private readonly options: DependencyServiceOptions) {}

    private resolveApp(...segments: string[]): string {
        return path.join(this.options.appRoot, ...segments);
    }

    private runQuiet(command: string): string | null {
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

    private encodePowerShellCommand(script: string): string {
        return Buffer.from(script, 'utf16le').toString('base64');
    }

    private runPowerShellEncoded(script: string, envOverrides: NodeJS.ProcessEnv = process.env): string | null {
        if (process.platform !== 'win32') {
            return null;
        }

        try {
            const result = spawnSync(
                'powershell.exe',
                ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', this.encodePowerShellCommand(script)],
                {
                    encoding: 'utf8',
                    env: envOverrides,
                    stdio: 'pipe',
                    timeout: 15000,
                    windowsHide: true,
                },
            );

            if (result.status === 0) {
                return result.stdout.trim() || 'Windows offline speech ready';
            }
        } catch {
            // Ignore probe failures.
        }

        return null;
    }

    private detectWindowsOfflineVoice(): string | null {
        return this.runPowerShellEncoded(`
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
    }

    private bundledPythonCandidates(): string[] {
        return [
            this.resolveApp('portable-python', 'python.exe'),
            path.join(process.resourcesPath || '', 'app-bundle', 'portable-python', 'python.exe'),
            path.join(process.resourcesPath || '', 'portable-python', 'python.exe'),
        ].filter(Boolean);
    }

    private bundledRequirementsCandidates(): string[] {
        return [
            this.resolveApp('requirements.txt'),
            path.join(process.resourcesPath || '', 'app-bundle', 'requirements.txt'),
        ].filter(Boolean);
    }

    private findBundledPythonExecutable(): string | null {
        for (const pythonExe of this.bundledPythonCandidates()) {
            if (!fs.existsSync(pythonExe)) {
                continue;
            }

            const version = this.runQuiet(`"${pythonExe}" --version`);
            if (version) {
                return pythonExe;
            }
        }

        return null;
    }

    private findPythonExecutable(): string | null {
        for (const cmd of ['python', 'py', 'python3']) {
            const version = this.runQuiet(`${cmd} --version`);
            if (version && version.toLowerCase().includes('python')) {
                return cmd;
            }
        }

        const localAppData = process.env.LOCALAPPDATA || '';
        const userProfile = process.env.USERPROFILE || '';
        const scanRoots: string[] = [];
        if (localAppData) {
            scanRoots.push(path.join(localAppData, 'Programs', 'Python'));
        }
        if (userProfile) {
            scanRoots.push(path.join(userProfile, 'AppData', 'Local', 'Programs', 'Python'));
        }

        const pythonDirs: string[] = [];
        for (const root of [...new Set(scanRoots)]) {
            if (!fs.existsSync(root)) {
                continue;
            }

            try {
                const entries = fs.readdirSync(root, { withFileTypes: true });
                for (const entry of entries) {
                    if (entry.isDirectory() && /^Python\d+/i.test(entry.name)) {
                        pythonDirs.push(path.join(root, entry.name));
                    }
                }
            } catch {
                // Skip unreadable directories.
            }
        }

        pythonDirs.sort((left, right) => right.localeCompare(left));
        for (const dir of pythonDirs) {
            const exe = path.join(dir, 'python.exe');
            if (fs.existsSync(exe) && this.runQuiet(`"${exe}" --version`)) {
                return exe;
            }
        }

        try {
            const cDriveEntries = fs.readdirSync('C:\\', { withFileTypes: true });
            for (const entry of cDriveEntries) {
                if (!entry.isDirectory() || !/^Python\d+/i.test(entry.name)) {
                    continue;
                }

                const exe = path.join('C:\\', entry.name, 'python.exe');
                if (fs.existsSync(exe) && this.runQuiet(`"${exe}" --version`)) {
                    return exe;
                }
            }
        } catch {
            // Ignore system directory scan failures.
        }

        if (localAppData) {
            const windowsAppsExe = path.join(localAppData, 'Microsoft', 'WindowsApps', 'python.exe');
            if (fs.existsSync(windowsAppsExe) && this.runQuiet(`"${windowsAppsExe}" --version`)) {
                return windowsAppsExe;
            }
        }

        return null;
    }

    private findBundledEdgeTtsExecutable(): string | null {
        const bundledPython = this.findBundledPythonExecutable();
        if (!bundledPython) {
            return null;
        }

        const edgeExe = path.join(path.dirname(bundledPython), 'Scripts', 'edge-tts.exe');
        if (fs.existsSync(edgeExe) && this.runQuiet(`"${edgeExe}" --help`)) {
            return edgeExe;
        }

        if (this.runQuiet(`"${bundledPython}" -m edge_tts --help`)) {
            return bundledPython;
        }

        return null;
    }

    private repairBundledEdgeTts(): boolean {
        const bundledPython = this.findBundledPythonExecutable();
        if (!bundledPython) {
            return false;
        }

        const requirementsFile = this.bundledRequirementsCandidates().find((candidate) => fs.existsSync(candidate));
        const installCommand = requirementsFile
            ? `"${bundledPython}" -m pip install -r "${requirementsFile}" --no-warn-script-location`
            : `"${bundledPython}" -m pip install edge-tts --no-warn-script-location`;

        try {
            execSync(installCommand, {
                encoding: 'utf8',
                timeout: 240000,
                stdio: 'pipe',
                windowsHide: true,
            });

            return Boolean(this.findBundledEdgeTtsExecutable());
        } catch {
            return false;
        }
    }

    checkNodeInstalled(): DepStatus {
        const version = this.runQuiet('node --version');
        return { name: 'node', label: 'Node.js', installed: !!version, version: version || undefined, required: true };
    }

    checkPythonInstalled(): DepStatus {
        const bundledPython = this.findBundledPythonExecutable();
        if (bundledPython) {
            const version = this.runQuiet(`"${bundledPython}" --version`);
            return {
                name: 'python',
                label: 'Python 3',
                installed: true,
                version: version ? `${version} (bundled)` : `Bundled at ${bundledPython}`,
                required: true,
            };
        }

        const pythonExe = this.findPythonExecutable();
        if (pythonExe) {
            const version = this.runQuiet(`"${pythonExe}" --version`);
            return {
                name: 'python',
                label: 'Python 3',
                installed: true,
                version: version || `Found at ${pythonExe}`,
                required: true,
            };
        }

        return { name: 'python', label: 'Python 3', installed: false, required: true };
    }

    checkFfmpegInstalled(): DepStatus {
        const ffmpegStaticPath = this.resolveApp('node_modules', 'ffmpeg-static', 'ffmpeg.exe');
        if (fs.existsSync(ffmpegStaticPath)) {
            return { name: 'ffmpeg', label: 'FFmpeg', installed: true, version: 'bundled (ffmpeg-static)', required: true };
        }

        const version = this.runQuiet('ffmpeg -version');
        return {
            name: 'ffmpeg',
            label: 'FFmpeg',
            installed: !!version,
            version: version ? version.split('\n')[0] : undefined,
            required: true,
        };
    }

    checkEdgeTtsInstalled(): DepStatus {
        const bundledEdgeTts = this.findBundledEdgeTtsExecutable();
        if (bundledEdgeTts) {
            return {
                name: 'edge-tts',
                label: 'Voice Engine',
                installed: true,
                version: bundledEdgeTts.endsWith('python.exe') ? `${bundledEdgeTts} -m edge_tts` : `${bundledEdgeTts} (bundled)`,
                required: true,
            };
        }

        if (this.runQuiet('edge-tts --help')) {
            return { name: 'edge-tts', label: 'Voice Engine', installed: true, version: 'edge-tts CLI', required: true };
        }

        const pythonExe = this.findPythonExecutable();
        if (pythonExe && this.runQuiet(`"${pythonExe}" -m edge_tts --help`)) {
            return { name: 'edge-tts', label: 'Voice Engine', installed: true, version: `${pythonExe} -m edge_tts`, required: true };
        }

        const localAppData = process.env.LOCALAPPDATA || '';
        if (localAppData) {
            const pythonRoot = path.join(localAppData, 'Programs', 'Python');
            if (fs.existsSync(pythonRoot)) {
                try {
                    const entries = fs.readdirSync(pythonRoot, { withFileTypes: true });
                    for (const entry of entries) {
                        if (!entry.isDirectory() || !/^Python\d+/i.test(entry.name)) {
                            continue;
                        }

                        const edgeExe = path.join(pythonRoot, entry.name, 'Scripts', 'edge-tts.exe');
                        if (fs.existsSync(edgeExe) && this.runQuiet(`"${edgeExe}" --help`)) {
                            return { name: 'edge-tts', label: 'Voice Engine', installed: true, version: edgeExe, required: true };
                        }
                    }
                } catch {
                    // Ignore user profile scan failures.
                }
            }
        }

        const offlineVoice = this.detectWindowsOfflineVoice();
        if (offlineVoice) {
            return {
                name: 'edge-tts',
                label: 'Voice Engine',
                installed: true,
                version: `Windows offline voice: ${offlineVoice}`,
                required: true,
            };
        }

        return { name: 'edge-tts', label: 'Voice Engine', installed: false, required: true };
    }

    checkNodeModulesInstalled(): DepStatus {
        const exists = fs.existsSync(this.resolveApp('node_modules'));
        return {
            name: 'node_modules',
            label: 'Node.js Dependencies',
            installed: exists,
            version: exists ? 'installed' : undefined,
            required: true,
        };
    }

    checkAllDependencies(): DepStatus[] {
        return [
            this.checkNodeInstalled(),
            this.checkPythonInstalled(),
            this.checkFfmpegInstalled(),
            this.checkEdgeTtsInstalled(),
            this.checkNodeModulesInstalled(),
        ];
    }

    allDependenciesReady(): boolean {
        return this.checkAllDependencies().filter((dep) => dep.required).every((dep) => dep.installed);
    }

    private sendProgress(win: BrowserWindow | null, step: string, message: string, percent: number) {
        win?.webContents.send('install-progress', { step, message, percent });
    }

    async installDependency(win: BrowserWindow | null, name: string): Promise<boolean> {
        try {
            switch (name) {
                case 'python': {
                    if (this.findBundledPythonExecutable()) {
                        this.sendProgress(win, name, 'Bundled Python runtime is already available.', 100);
                        return true;
                    }

                    this.sendProgress(win, name, 'Installing Python 3 via winget...', 10);
                    execSync('winget install --id Python.Python.3.12 --exact --accept-package-agreements --accept-source-agreements --silent', {
                        encoding: 'utf8',
                        timeout: 300000,
                        stdio: 'pipe',
                        windowsHide: true,
                    });
                    this.sendProgress(win, name, 'Python 3 installed successfully', 100);
                    return true;
                }
                case 'ffmpeg':
                    this.sendProgress(win, name, 'FFmpeg is bundled with the app (ffmpeg-static)', 100);
                    return true;
                case 'edge-tts': {
                    if (this.findBundledEdgeTtsExecutable()) {
                        this.sendProgress(win, name, 'Bundled Edge-TTS voice engine is already available.', 100);
                        return true;
                    }

                    const bundledPython = this.findBundledPythonExecutable();
                    if (bundledPython) {
                        this.sendProgress(win, name, 'Repairing bundled Edge-TTS voice engine...', 20);
                        const repaired = this.repairBundledEdgeTts();
                        this.sendProgress(win, name, repaired ? 'Bundled Edge-TTS repaired successfully' : 'Bundled Edge-TTS repair failed', repaired ? 100 : 0);
                        return repaired;
                    }

                    this.sendProgress(win, name, 'Installing edge-tts Python package...', 10);
                    const pipCmd = this.runQuiet('python -m pip --version') ? 'python' : this.runQuiet('py -m pip --version') ? 'py' : null;
                    if (!pipCmd) {
                        this.sendProgress(win, name, 'Python pip not found. Install Python first.', 0);
                        return false;
                    }

                    execSync(`${pipCmd} -m pip install edge-tts`, {
                        encoding: 'utf8',
                        timeout: 120000,
                        stdio: 'pipe',
                        windowsHide: true,
                    });
                    this.sendProgress(win, name, 'edge-tts installed successfully', 100);
                    return true;
                }
                case 'node_modules':
                    this.sendProgress(win, name, 'Installing Node.js dependencies (npm install)...', 10);
                    execSync('npm install', {
                        encoding: 'utf8',
                        cwd: this.options.appRoot,
                        timeout: 300000,
                        stdio: 'pipe',
                        windowsHide: true,
                    });
                    this.sendProgress(win, name, 'Node.js dependencies installed', 100);
                    return true;
                default:
                    return false;
            }
        } catch (error: any) {
            this.sendProgress(win, name, `Failed: ${error.message}`, 0);
            return false;
        }
    }

    async installAllDependencies(win: BrowserWindow | null): Promise<void> {
        const missing = this.checkAllDependencies().filter((dep) => dep.required && !dep.installed);
        let index = 0;

        for (const dep of missing) {
            index += 1;
            const overallPercent = Math.round((index / missing.length) * 100);
            this.sendProgress(win, dep.name, `Installing ${dep.label}... (${index}/${missing.length})`, overallPercent);
            await this.installDependency(win, dep.name);
        }

        win?.webContents.send('setup-complete');
    }

    verifyVoiceEngine(): { ok: boolean; detail: string } {
        const voiceEngineStatus = this.checkEdgeTtsInstalled();
        if (voiceEngineStatus.installed) {
            return { ok: true, detail: voiceEngineStatus.version || 'Voice engine ready' };
        }

        const resourcesDir = process.resourcesPath || '';
        const candidatePaths = [
            path.join(this.options.appRoot, 'portable-python', 'python.exe'),
            path.join(resourcesDir, 'app-bundle', 'portable-python', 'python.exe'),
            path.join(resourcesDir, 'portable-python', 'python.exe'),
        ];

        for (const pythonPath of candidatePaths) {
            if (!fs.existsSync(pythonPath) || !this.runQuiet(`"${pythonPath}" --version`)) {
                continue;
            }

            const edgeTtsExe = path.join(path.dirname(pythonPath), 'Scripts', 'edge-tts.exe');
            if (fs.existsSync(edgeTtsExe)) {
                return { ok: true, detail: `Bundled edge-tts found at: ${edgeTtsExe}` };
            }
            if (this.runQuiet(`"${pythonPath}" -m edge_tts --help`)) {
                return { ok: true, detail: `Bundled Python edge_tts module at: ${pythonPath}` };
            }

            return { ok: false, detail: `Python found at ${pythonPath} but edge-tts is not installed in it.` };
        }

        const systemPython = this.findPythonExecutable();
        if (systemPython && this.runQuiet(`"${systemPython}" -m edge_tts --help`)) {
            return { ok: true, detail: `System edge-tts via: ${systemPython}` };
        }
        if (this.runQuiet('edge-tts --help')) {
            return { ok: true, detail: 'edge-tts found on system PATH' };
        }

        const checkedList = candidatePaths.map((candidate) => `  - ${candidate} (${fs.existsSync(candidate) ? 'exists but broken' : 'not found'})`).join('\n');
        return {
            ok: false,
            detail: `No working bundled Edge-TTS runtime was found.\n\nPaths checked:\n${checkedList}\n\nSystem Python: ${systemPython || 'not found'}\nresourcesPath: ${resourcesDir || 'not set'}`,
        };
    }
}
