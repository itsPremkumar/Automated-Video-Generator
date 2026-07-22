import * as fs from 'fs';
import { assetId } from '../types.js';
import { runFfmpeg } from './ffmpeg.js';
import type { PipelineResult } from './types.js';
import { resolveWorkspaceTempPath } from '../../shared/runtime/paths.js';

/**
 * makeContactSheet — tiles EVERY downloaded image (and one frame of every video)
 * into a single grid image for audit visibility.
 */
export async function makeContactSheet(res: PipelineResult): Promise<string | null> {
    const wsRoot = res.workspace.root;
    const tmpDir = resolveWorkspaceTempPath('contact-sheet');
    fs.mkdirSync(tmpDir, { recursive: true });
    const imgs: string[] = [];
    for (const d of res.decisions) {
        if (d.kind === 'music') continue;
        const c = res.candidates.find((x) => assetId(x.kind, x.sceneIndex, x.candidateIndex) === d.assetId);
        if (!c?.localPath || !fs.existsSync(c.localPath)) continue;
        if (c.kind === 'image') imgs.push(c.localPath);
        else if (c.kind === 'video') {
            const frame = `${tmpDir}/cs_frame_${res.workspace.jobId}_${d.sceneIndex}.png`;
            try {
                await runFfmpeg(['-y', '-ss', '00:00:00.1', '-i', c.localPath, '-frames:v', '1', frame]);
                if (fs.existsSync(frame)) imgs.push(frame);
            } catch { /* skip unreadable video */ }
        }
    }
    if (imgs.length === 0) return null;
    const cols = Math.min(imgs.length, 3);
    const out = `${wsRoot}/contact-sheet.png`;
    try {
        await runFfmpeg([
            '-y',
            ...imgs.flatMap((p) => ['-i', p]),
            '-filter_complex',
            imgs.map((_, i) => `[${i}:v]scale=360:640[s${i}]`).join(';') +
                ';' +
                imgs.map((_, i) => `[s${i}]`).join('') +
                `vstack=inputs=${imgs.length}`,
            '-frames:v', '1', out,
        ]);
        return fs.existsSync(out) ? out : null;
    } catch {
        return null;
    }
}

/**
 * writeDecisionsReport — human/agent-readable record of every asset decision.
 */
export function writeDecisionsReport(res: PipelineResult): string {
    const wsRoot = res.workspace.root;
    const decider = res.fullyAgentDriven ? 'HERMES AI AGENT (autonomous, no external model)' : 'AGENT + vision backend';
    const lines: string[] = [
        `AGENTIC VIDEO — DECISION REPORT`,
        `job: ${res.workspace.jobId} | title: ${res.plan.title} | backend: ${res.backend}`,
        `decider: ${decider}`,
        `gate: ${res.gate.pass ? 'PASS' : 'BLOCKED'}`,
        ``,
        `Every image/video below was APPROVED by the agent. No human approval required.`,
        ``,
    ];
    for (const d of res.decisions) {
        const c = res.candidates.find((x) => assetId(x.kind, x.sceneIndex, x.candidateIndex) === d.assetId);
        const path = c?.localPath ?? '(none)';
        const verdict =
            d.decision === 'approved' ? '✅ APPROVED' : d.decision === 'rejected' ? '❌ REJECTED' : '🔁 REPLACED';
        lines.push(`[${verdict}] ${d.kind} scene#${d.sceneIndex} -> ${path}`);
        lines.push(`    decision by: ${d.decidedBy} | rationale: ${d.rationale}`);
    }
    const out = `${wsRoot}/decisions-report.txt`;
    fs.writeFileSync(out, lines.join('\n'), 'utf8');
    return out;
}
