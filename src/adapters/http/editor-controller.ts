/**
 * editor-controller.ts — HTTP surface for the agentic video EDITOR assistant.
 *
 * Exposes the operations an interactive editor/agent needs beyond the existing
 * scene reorder/refine endpoints: Director's Critique, scope-aware Revise,
 * the 11 single-task editor ops (convert/gif/mute/separate/...), and the
 * in-place master re-stitch. ZERO-COST: everything is ffmpeg/ffprobe or
 * locally-rendered.
 */

import { Request, Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import { resolveProjectPath } from '../../shared/runtime/paths';

function workspaceRootFor(jobId: string): string {
    return resolveProjectPath('workspace', 'jobs', jobId);
}
function outputFor(jobId: string): string {
    return resolveProjectPath('output', jobId);
}

/** Critique a rendered MP4 (Director's Critique). */
export const critiqueJob = async (req: Request, res: Response) => {
    const jobId = String(req.params.jobId);
    const mp4Path = (req.body as any)?.mp4Path as string | undefined;
    const wsRoot = workspaceRootFor(jobId);
    const planPath = path.join(wsRoot, 'plan.json');
    let mp4 = mp4Path;
    if (!mp4 || !fs.existsSync(mp4)) {
        const outDir = outputFor(jobId);
        if (fs.existsSync(outDir)) {
            const cands = fs.readdirSync(outDir).filter((f) => f.endsWith('.mp4') && !f.includes('scene_'));
            if (cands.length) mp4 = path.join(outDir, cands[0]);
        }
    }
    if (!mp4 || !fs.existsSync(mp4)) {
        res.status(404).json({ success: false, error: 'No rendered MP4 found for job.' });
        return;
    }
    const { critiqueVideo } = await import('../../agentic/operations/critique.js');
    const rep = await critiqueVideo(mp4, { planPath });
    res.json({
        success: true,
        data: {
            ok: rep.ok,
            raw: rep.raw,
            suggestions: rep.suggestions,
        },
    });
};

/** Scope-aware revise (close the feedback loop without a full re-gen). */
export const reviseJobCtrl = async (req: Request, res: Response) => {
    const jobId = String(req.params.jobId);
    const body = req.body as any;
    const { reviseJob, critiqueAndRevise } = await import('../../agentic/operations/revise.js');
    let report;
    try {
        if (body.autoCritique) {
            const outDir = outputFor(jobId);
            const cands = fs.existsSync(outDir)
                ? fs.readdirSync(outDir).filter((f) => f.endsWith('.mp4') && !f.includes('scene_'))
                : [];
            if (!cands.length) {
                res.status(404).json({ success: false, error: 'No rendered MP4 to auto-critique.' });
                return;
            }
            const mp4 = path.join(outDir, cands[0]);
            report = await critiqueAndRevise(jobId, mp4, path.join(workspaceRootFor(jobId), 'plan.json'), body.notes || 'auto-critique fixes');
        } else {
            report = await reviseJob(jobId, body.notes || 'manual revision', body.hints ?? [], {
                scope: body.scope,
            });
        }
    } catch (e: any) {
        res.status(500).json({ success: false, error: e?.message ?? String(e) });
        return;
    }
    res.json({ success: report.ok, data: report });
};

/** Single-task editor op (convert/gif/convert_audio/images_to_video/...). */
export const editorOp = async (req: Request, res: Response) => {
    const kind = String(req.params.kind);
    const body = req.body as any;
    const allowed = new Set([
        'convert', 'to_gif', 'convert_audio', 'images_to_video', 'video_to_images',
        'separate_audio', 'separate_video', 'mute_video', 'social_download', 'write_script',
    ]);
    if (!allowed.has(kind)) {
        res.status(400).json({ success: false, error: `Unknown editor op: ${kind}` });
        return;
    }
    const { routeTask } = await import('../../agentic/operations/route.js');
    const { doTask } = await import('../../agentic/operations/dispatch.js');
    // Build an input shaped like the dispatch RunInput.
    const input: any = {
        files: body.input ? [body.input] : [],
        out: undefined,
        orientation: 'portrait',
        voice: body.voice,
        text: body.topic,
    };
    const routed = routeTask(
        kind === 'write_script'
            ? `write a script about ${body.topic || 'video'}`
            : kind === 'social_download'
            ? `download ${body.url}`
            : `${kind} ${body.input || ''}`,
    );
    try {
        const result = await doTask(routed, input);
        res.json({ success: true, data: result });
    } catch (e: any) {
        res.status(500).json({ success: false, error: e?.message ?? String(e) });
    }
};
export const restitchJob = async (req: Request, res: Response) => {
    const jobId = String(req.params.jobId);
    const body = req.body as any;
    const { restitchMaster } = await import('../../agentic/operations/restitch.js');
    const wsRoot = workspaceRootFor(jobId);
    const outDir = outputFor(jobId);
    const master = body.masterMp4 || (fs.existsSync(outDir)
        ? (fs.readdirSync(outDir).find((f) => f.endsWith('.mp4') && !f.includes('scene_')) || '')
        : '');
    if (!master || !fs.existsSync(master)) {
        res.status(404).json({ success: false, error: 'No master MP4 found to re-stitch into.' });
        return;
    }
    if (!fs.existsSync(body.sceneClip)) {
        res.status(404).json({ success: false, error: `scene clip not found: ${body.sceneClip}` });
        return;
    }
    const out = path.join(outDir, `${path.basename(master, '.mp4')}_r${body.sceneNumber}.mp4`);
    const rep = await restitchMaster(master, body.sceneClip, path.join(wsRoot, 'plan.json'), body.sceneNumber, out);
    if (!rep.ok) {
        res.status(500).json({ success: false, error: rep.detail });
        return;
    }
    res.json({ success: true, data: rep });
};
