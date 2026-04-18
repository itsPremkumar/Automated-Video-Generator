import * as fs from 'fs';
import * as path from 'path';
import { resolveProjectPath, resolveResourcePath } from '../runtime';

export function getPythonExecutable(): string | null {
    // 1. Check portable-python in project root
    const portablePath = resolveProjectPath('portable-python', 'python.exe');
    if (fs.existsSync(portablePath)) {
        return portablePath;
    }

    // 2. Check bundled locations (for Electron)
    const bundledPaths = [
        resolveResourcePath('app-bundle', 'portable-python', 'python.exe'),
        resolveResourcePath('portable-python', 'python.exe'),
        path.join((process as any).resourcesPath || '', 'app-bundle', 'portable-python', 'python.exe'),
        path.join((process as any).resourcesPath || '', 'portable-python', 'python.exe'),
    ];

    for (const p of bundledPaths) {
        if (p && fs.existsSync(p)) {
            return p;
        }
    }

    // 3. Fallback to system python
    return 'python';
}
