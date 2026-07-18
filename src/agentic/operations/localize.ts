/**
 * localize.ts — localize an EXISTING video's caption/srt text (single task).
 *
 * Reuses the project's localizeSrtSidecars (free-model translation, offline-safe
 * fallback to original text). Produces one translated .srt per language next to
 * the source srt. If no srt exists yet, builds one from `text` first.
 */

import * as fs from 'fs';
import * as path from 'path';
import { writeCaptionSidecars } from '../../lib/captions.js';
import { localizeSrtSidecars } from '../localize.js';
import { AgentBrain } from '../brain.js';

export interface LocalizeResult { ok: boolean; outputs: string[]; detail: string; }

/**
 * @param srcSrt path to a native .srt, OR null to build one from `text`.
 * @param text source caption text (used only when srcSrt is null).
 * @param languages target codes/names, e.g. ['es','fr','hi','ta'].
 */
export async function localizeVideo(
    srcSrt: string | null,
    text: string | null,
    languages: string[],
    outDir?: string,
    brain?: AgentBrain,
): Promise<LocalizeResult> {
    if (!languages.length) return { ok: false, outputs: [], detail: 'no languages given' };
    const dir = outDir ?? path.join(process.cwd(), 'output', `localize_${Date.now()}`);
    fs.mkdirSync(dir, { recursive: true });
    let source = srcSrt;
    if (!source || !fs.existsSync(source)) {
        if (!text) return { ok: false, outputs: [], detail: 'need either srcSrt or text' };
        // Build a native srt from the plain text (single sentence cue).
        const base = path.join(dir, 'native');
        writeCaptionSidecars(dir, [{ text, durationSeconds: 5 }], { baseName: 'native', mode: 'sentence' });
        source = `${base}.srt`;
        if (!fs.existsSync(source)) return { ok: false, outputs: [], detail: 'failed to build native srt' };
    }
    const b = brain ?? new AgentBrain();
    const written = await localizeSrtSidecars({
        srcSrtPath: source,
        outDir: dir,
        baseName: 'video',
        languages,
        brain: b,
    });
    return { ok: written.length > 0, outputs: written, detail: `localized to ${written.length} language(s): ${languages.join(', ')}` };
}
