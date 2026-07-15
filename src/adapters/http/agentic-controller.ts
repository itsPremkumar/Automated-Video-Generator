/**
 * agentic-controller.ts — PHASE 9.1 REST API for the agentic pipeline.
 *
 * Mounted under /api/agentic. Lets any HTTP client (web portal, another agent,
 * CI) trigger a full agentic video generation and inspect results.
 *
 *   POST /api/agentic/run        { topic, title, orientation?, voice?, backend? }
 *   GET  /api/agentic/jobs/:id    job status (state, gate, decisions, manifest)
 *   GET  /api/agentic/jobs/:id/video   stream the rendered MP4
 *   GET  /api/agentic/jobs/:id/scenes  scene-data (audit trail)
 *
 * All endpoints are additive — they do not touch the legacy /api routes.
 */

import { Router } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import { asyncHandler } from '../../lib/validation.js';
import { runAgenticPipeline, renderAgenticSlideshow } from '../../agentic/orchestrate.js';
import { getJob } from '../../agentic/job.js';

const router = Router();

router.post('/run', asyncHandler(async (req: any, res: any) => {
    const { topic, title, orientation, voice, backend, musicQuery, preferVisual } = req.body ?? {};
    if (!topic || !title) {
        return res.status(400).json({ error: 'topic and title are required' });
    }
    const result = await runAgenticPipeline({
        topic, title,
        orientation: orientation === 'landscape' ? 'landscape' : 'portrait',
        voice, backend, musicQuery, preferVisual,
    });
    let videoUrl: string | null = null;
    let rendered = false;
    if (result.gate.pass) {
        try {
            const mp4 = await renderAgenticSlideshow(result);
            videoUrl = '/api/agentic/jobs/' + result.workspace.jobId + '/video';
            rendered = true;
        } catch (e: any) {
            return res.status(500).json({ error: 'render failed: ' + e.message, jobId: result.workspace.jobId });
        }
    }
    return res.json({
        jobId: result.workspace.jobId,
        gate: result.gate,
        voiceoverDriven: result.voiceovers?.voiceoverDriven ?? false,
        rendered,
        videoUrl,
    });
}));

router.get('/jobs/:id', asyncHandler(async (req: any, res: any) => {
    const job = getJob(req.params.id);
    if (!job) return res.status(404).json({ error: 'job not found' });
    return res.json(job);
}));

router.get('/jobs/:id/scenes', asyncHandler(async (req: any, res: any) => {
    const job = getJob(req.params.id);
    if (!job) return res.status(404).json({ error: 'job not found' });
    const sd = path.join(job.workspace.root, 'scene-data.json');
    return res.json(fs.existsSync(sd) ? JSON.parse(fs.readFileSync(sd, 'utf8')) : { scenes: [] });
}));

router.get('/jobs/:id/video', asyncHandler(async (req: any, res: any) => {
    const job = getJob(req.params.id);
    if (!job) return res.status(404).json({ error: 'job not found' });
    const mp4 = path.join(job.workspace.root, 'render', job.workspace.jobId + '.mp4');
    const remotionMp4 = path.join(job.workspace.root, 'render', job.workspace.jobId + '_remotion.mp4');
    const finalMp4 = fs.existsSync(mp4) ? mp4 : fs.existsSync(remotionMp4) ? remotionMp4 : null;
    if (!finalMp4) return res.status(404).json({ error: 'video not rendered' });
    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Content-Disposition', `inline; filename="${job.workspace.jobId}.mp4"`);
    fs.createReadStream(finalMp4).pipe(res);
}));

// VISIBILITY: see every asset the agent approved (contact sheet image).
router.get('/jobs/:id/contact-sheet', asyncHandler(async (req: any, res: any) => {
    const job = getJob(req.params.id);
    if (!job) return res.status(404).json({ error: 'job not found' });
    const img = path.join(job.workspace.root, 'contact-sheet.png');
    if (!fs.existsSync(img)) return res.status(404).json({ error: 'contact sheet not built' });
    res.setHeader('Content-Type', 'image/png');
    fs.createReadStream(img).pipe(res);
}));

// VISIBILITY: plain-text record of every asset decision (stamped by agent).
router.get('/jobs/:id/decisions', asyncHandler(async (req: any, res: any) => {
    const job = getJob(req.params.id);
    if (!job) return res.status(404).json({ error: 'job not found' });
    const txt = path.join(job.workspace.root, 'decisions-report.txt');
    if (!fs.existsSync(txt)) return res.status(404).json({ error: 'decisions report not built' });
    res.setHeader('Content-Type', 'text/plain');
    res.send(fs.readFileSync(txt, 'utf8'));
}));

export default router;
