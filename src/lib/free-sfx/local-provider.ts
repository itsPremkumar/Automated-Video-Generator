import * as fs from 'fs';
import * as path from 'path';
import { SfxClip, SfxKind, SfxProvider } from './models.js';
import { resolveProjectPath } from '../../shared/runtime/paths.js';

const SFX_INPUT_DIR = resolveProjectPath('input', 'sfx');

const KIND_MAP: Record<string, SfxKind> = {
    'whoosh': 'whoosh',
    'ding': 'ding',
    'impact': 'impact',
    'notification': 'notification',
    'click': 'click',
    'pop': 'pop',
    'transition': 'transition',
    'swish': 'swish',
    'bounce': 'bounce',
};

const AUDIO_EXTENSIONS = ['.mp3', '.wav', '.ogg', '.m4a', '.flac'];

export class LocalSfxProvider implements SfxProvider {
    readonly name = 'local-sfx';

    async getSfx(kind: SfxKind): Promise<SfxClip | null> {
        const dir = SFX_INPUT_DIR;
        if (!fs.existsSync(dir)) return null;

        const files = fs.readdirSync(dir);
        // First try exact name match: <kind>.mp3, <kind>.wav, etc.
        for (const ext of AUDIO_EXTENSIONS) {
            const exactPath = path.join(dir, `${kind}${ext}`);
            if (fs.existsSync(exactPath)) {
                const stat = fs.statSync(exactPath);
                const durationMs = estimateDuration(stat.size, ext);
                return {
                    kind,
                    localPath: exactPath,
                    durationMs,
                    description: `Local SFX: ${kind}`,
                };
            }
        }

        // Fallback: check if filename contains the kind name
        const matched = files.find((f) => {
            const lower = f.toLowerCase();
            return AUDIO_EXTENSIONS.some((ext) => lower.endsWith(ext)) && lower.includes(kind);
        });

        if (matched) {
            const fullPath = path.join(dir, matched);
            const stat = fs.statSync(fullPath);
            const ext = path.extname(matched).toLowerCase();
            const durationMs = estimateDuration(stat.size, ext);
            return {
                kind,
                localPath: fullPath,
                durationMs,
                description: `Local SFX: ${matched}`,
            };
        }

        return null;
    }

    async getAllAvailable(): Promise<SfxKind[]> {
        const dir = SFX_INPUT_DIR;
        if (!fs.existsSync(dir)) return [];

        const files = fs.readdirSync(dir);
        const available: SfxKind[] = [];

        for (const file of files) {
            const lower = file.toLowerCase();
            if (!AUDIO_EXTENSIONS.some((ext) => lower.endsWith(ext))) continue;

            for (const [name, kind] of Object.entries(KIND_MAP)) {
                if (lower.includes(name)) {
                    available.push(kind);
                    break;
                }
            }
        }

        return [...new Set(available)];
    }
}

function estimateDuration(fileSizeBytes: number, ext: string): number {
    // Per-format bitrate estimates (bytes per second)
    const rates: Record<string, number> = {
        '.mp3': 16000,   // ~128 kbps
        '.wav': 176000,  // ~1411 kbps
        '.ogg': 14000,   // ~112 kbps Vorbis
        '.m4a': 16000,   // ~128 kbps AAC
        '.flac': 75000,  // ~600 kbps variable
        '.aac': 16000,   // ~128 kbps
    };
    const bytesPerSec = rates[ext.toLowerCase()] ?? 16000;
    const estimatedSec = fileSizeBytes / bytesPerSec;
    return Math.max(100, Math.round(estimatedSec * 1000));
}
