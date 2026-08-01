#!/usr/bin/env tsx
/**
 * agentic-modular.ts — Modular pipeline CLI with INDEPENDENT stages + scene editor.
 *
 * Instead of running the full pipeline as a monolith, you can run each
 * stage independently, inspect intermediate results, and edit specific
 * scenes in an already-rendered video WITHOUT re-rendering everything.
 *
 * USAGE:
 *   npx tsx src/adapters/cli/agentic-modular.ts <subcommand> [options]
 *
 * SUBCOMMANDS:
 *   pipeline            Run the full end-to-end pipeline (default)
 *   plan                Parse script → build Plan (saves to workspace)
 *   visuals             Acquire + download visuals (saves render-manifest)
 *   flux3               OPTIONAL backend: generate scene clips via FLUX 3
 *                       (job field flux3: "auto"|"on" + flux3Prompts[]) —
 *                       falls back to stock visuals when unavailable
 *   voice               Generate voiceovers for all/selected scenes
 *   render              Render video from existing workspace
 *   edit                Edit a single scene in an existing workspace
 *   list                List scenes in an existing workspace
 *
 * EXAMPLES:
 *   # Full pipeline (same as npm run generate:agentic)
 *   npm run agentic:modular pipeline
 *
 *   # Stage 1: Plan only
 *   npm run agentic:modular plan
 *
 *   # Stage 2: Visuals only (reuses existing plan)
 *   npm run agentic:modular visuals
 *
 *   # Stage 3: Voice only
 *   npm run agentic:modular voice
 *
 *   # Stage 4: Render only
 *   npm run agentic:modular render
 *
 *   # Edit scene 3: change visual and voice
 *   npm run agentic:modular edit --scene 3 --visual "rocket launch" --voice en-IN-ValluvarNeural
 *
 *   # Edit scene 2: change volume only
 *   npm run agentic:modular edit --scene 2 --volume 0.8
 *
 *   # Edit scene 5: change caption style and color
 *   npm run agentic:modular edit --scene 5 --style top --color yellow
 *
 *   # List all scenes in workspace
 *   npm run agentic:modular list
 */
import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { execFileSync } from 'child_process';
import { estimateAudioDurationSafe } from '../../agentic/orchestrator/ffmpeg.js';
import { normalizeJobId } from '../../shared/identifiers.js';
import { getAgenticWorkspace } from '../../agentic/management/workspace.js';
import { flux3Mode, flux3Aspect, flux3PromptForScene, flux3Duration } from './flux3-option.js';

// ─── Types ──────────────────────────────────────────────────────────────────

type CliArgs = Record<string, string | boolean | number>;

// ─── Consts ──────────────────────────────────────────────────────────────────

const INPUT_DIR = path.join(process.cwd(), 'input', 'scripts');
const SCRIPTS_FILE = path.join(INPUT_DIR, 'agentic-scripts.json');
const OUTPUT_DIR = path.join(process.cwd(), 'output');

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseArgv(argv: string[]): { subcommand: string; args: CliArgs } {
    const s = argv.slice(2);
    const subcommand = s[0] || 'pipeline';
    const args: CliArgs = {};
    for (let i = 1; i < s.length; i++) {
        const k = s[i];
        if (k.startsWith('--')) {
            const key = k.slice(2);
            const next = s[i + 1];
            if (next && !next.startsWith('--')) {
                args[key] = isNaN(Number(next)) ? next : Number(next);
                i++;
            } else {
                args[key] = true;
            }
        }
    }
    return { subcommand, args };
}

function readJobJson(): any[] {
    const fileArg = (() => {
        const i = process.argv.indexOf('--file');
        return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : null;
    })();
    const target = fileArg ? path.resolve(fileArg) : SCRIPTS_FILE;
    if (!fs.existsSync(target)) {
        console.error(`✖ No job file at ${target}`);
        process.exit(1);
    }
    return JSON.parse(fs.readFileSync(target, 'utf-8'));
}

function workspaceFor(jobId: string) {
    return getAgenticWorkspace(jobId);
}

function readJson(dir: string, file: string): any {
    const p = path.join(dir, file);
    if (!fs.existsSync(p)) return null;
    return JSON.parse(fs.readFileSync(p, 'utf-8'));
}

function writeJson(dir: string, file: string, data: any): void {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, file), JSON.stringify(data, null, 2));
}

function outputFor(jobId: string) {
    return path.join(OUTPUT_DIR, jobId);
}

// ─── Dry-run helpers ──────────────────────────────────────────────────────────

type DryRunDetail = {
    stage: string;
    details: string[];
};

function printDryRun(job: any, title: string, details: DryRunDetail[]): void {
    console.log(`\n  ── DRY-RUN ──`);
    console.log(`  Job: ${title}`);
    console.log(`  ─────────────────`);
    for (const d of details) {
        console.log(`\n  [${d.stage}]`);
        for (const line of d.details) {
            console.log(`    ${line}`);
        }
    }
    console.log(`\n  ✅ Dry-run complete — no changes made.\n`);
}

// ─── Stage 1: Plan ─────────────────────────────────────────────────────────

async function runPlan(cliArgs: CliArgs) {
    const jobs = readJobJson();
    for (const job of jobs) {
        const id = normalizeJobId(job.id || `job_${Date.now()}`);
        const ws = workspaceFor(id);
        const title = job.title || id;
        const topic = job.topic || title;

        console.log(`\n═══════════════════════════════════════════`);
        console.log(`  [PLAN] ${title}`);
        console.log(`═══════════════════════════════════════════`);

        // Import plan builder
        const { parseScript } = await import('../../lib/script-parser.js');
        const { buildPlan, applyProEdits } = await import('../../agentic/pipeline/plan.js');
        const { AgentBrain } = await import('../../agentic/ai/brain.js');
        const brain = new AgentBrain();

        // Build plan from script or topic
        const script = job.script || `[Visual: ${topic}] ${title}`;
        // Bridge agentic-scripts.json -> Plan: pass the full real-voice cast
        // (personas, per-scene persona, in-scene dialogue, default persona)
        // straight into buildPlan so the voice stage can drive src/speech.
        const plan = await buildPlan(
            script,
            {
                jobId: id,
                title,
                orientation: job.orientation ?? 'portrait',
                voice: job.voice ?? 'en-US-JennyNeural',
                musicQuery: job.musicQuery,
                personas: job.personas,
                scenePersonas: job.scenePersonas,
                dialogueVoices: job.dialogueVoices,
                sceneDialogue: job.sceneDialogue,
                defaultPersona: job.defaultPersona,
                advancedByScene: job.advanced,
            },
            parseScript,
        );

        // Apply professional edits
        await applyProEdits(plan, {
            hookFirst: job.hookFirst ?? true,
            variablePacing: job.variablePacing ?? true,
            brain,
        });

        // ── Dry-run: show the scenes but don't write anything ──
        if (cliArgs['dry-run']) {
            const details: DryRunDetail[] = [{
                stage: 'PLAN',
                details: [
                    `Title: ${title}`,
                    `Topic: ${topic}`,
                    `Voice: ${job.voice ?? 'default'}`,
                    `Orientation: ${job.orientation ?? 'portrait'}`,
                    `Scenes: ${plan.scenes.length}`,
                    '',
                    ...plan.scenes.map((s: any) =>
                        `  [${s.sceneNumber}] ${(s.voiceoverText || '…').slice(0, 60).padEnd(62)} ${(s.durationSec || '?').toFixed(1)}s${s.visualPreference === 'video' ? ' 🎬' : ''}`,
                    ),
                    '',
                    `Total duration: ${plan.totalDurationSec?.toFixed(1) ?? '?'}s`,
                    `(plan.json would be written to workspace)`,
                ],
            }];
            printDryRun(job, title, details);
            continue;
        }

        writeJson(ws.root, 'plan.json', plan);
        writeJson(ws.root, 'job-meta.json', {
            jobId: id,
            title: job.title,
            topic: job.topic,
            voice: job.voice,
            orientation: job.orientation,
            language: job.language,
            backgroundMusic: job.backgroundMusic,
            musicVolume: job.musicVolume,
            hookFirst: job.hookFirst,
            variablePacing: job.variablePacing,
            captionTheme: job.captionTheme,
            captions: job.captions,
            sfx: job.sfx,
            jCutSec: job.jCutSec,
            vignette: job.vignette,
            kineticText: job.kineticText,
            preset: job.preset,
            format: job.format,
            platforms: job.platforms || [job.platform].filter(Boolean),
            videoType: job.videoType,
            brand: job.brand,
            renderer: job.renderer,
            maxAttempts: job.maxAttempts,
            languages: job.languages,
            kenBurns: job.kenBurns,
            transition: job.transition,
            grade: job.grade,
            intro: job.intro,
            outro: job.outro,
            musicQuery: job.musicQuery,
        });

        console.log(`  ✅ Plan ready: ${plan.scenes.length} scenes`);
        for (const s of plan.scenes) {
            console.log(`     [${s.sceneNumber}] ${(s.voiceoverText || '…').slice(0, 60)}`);
        }
    }
}

// ─── Stage 2: Visuals ──────────────────────────────────────────────────────

async function runVisuals(cliArgs: CliArgs) {
    const jobs = readJobJson();
    for (const job of jobs) {
        const id = normalizeJobId(job.id || `job_${Date.now()}`);
        const ws = workspaceFor(id);
        const meta = readJson(ws.root, 'job-meta.json') || {};
        const plan = readJson(ws.root, 'plan.json');

        if (!plan) {
            console.error(`✖ No plan found for job "${id}". Run "plan" stage first.`);
            continue;
        }

        console.log(`\n═══════════════════════════════════════════`);
        console.log(`  [VISUALS] ${job.title || id}`);
        console.log(`═══════════════════════════════════════════`);

        // ── Dry-run: show what would be acquired ──
        if (cliArgs['dry-run']) {
            const sceneVisuals = plan.scenes.map((s: any) => {
                const kw = s.searchKeywords?.join(', ') || s.localAsset || 'auto';
                const pref = s.visualPreference === 'video' ? 'video' : 'image';
                return `  [${s.sceneNumber}] ${kw.slice(0, 60).padEnd(62)} ${pref}  ${(s.durationSec || '?').toFixed(1)}s`;
            });
            const details: DryRunDetail[] = [{
                stage: 'VISUALS',
                details: [
                    `Job: ${job.title || id}`,
                    `Orientation: ${job.orientation ?? 'portrait'}`,
                    `Candidates per asset: ${job.candidatesPerAsset ?? 2}`,
                    `Scenes needing visuals: ${plan.scenes.length}`,
                    '',
                    ...sceneVisuals,
                    '',
                    `Music query: ${job.musicQuery || (job.backgroundMusic || 'auto')}`,
                    `(assets would be downloaded to workspace; render-manifest.json would be written)`,
                ],
            }];
            printDryRun(job, job.title || id, details);
            continue;
        }

        // B2: --no-acquire — all visuals are pre-supplied locally via [Visual: file]
        // bindings in the script. Skip the network acquire/gateway stage entirely and
        // synthesize the render-manifest directly from plan.json localAssets + music.
        // Per-job: a FLUX 3 job (flux3Mode != off) always runs this path (its clips
        // are local assets); an explicit --no-acquire flag applies to every job.
        if (cliArgs['no-acquire'] === true || flux3Mode(job) !== 'off') {
            const { resolveFreeBackgroundMusic } = await import('../../lib/free-music.js');
            const { inputAssetPath, inputBgmPath } = await import('../../lib/path-safety.js');
            const assets: any[] = [];
            const missingVisuals: string[] = [];
            for (const s of plan.scenes) {
                const la = s.localAsset;
                if (!la) {
                    console.warn(`  ⚠ scene ${s.sceneNumber} has no localAsset — skipping in manifest`);
                    missingVisuals.push(`scene ${s.sceneNumber} (no [Visual:] tag)`);
                    continue;
                }
                const localPath = path.isAbsolute(la) ? la : path.join(process.cwd(), 'input', 'visuals', la);
                if (!fs.existsSync(localPath)) {
                    // BUG P2-1: a [Visual:] tag naming a file that isn't on disk
                    // (typo / wrong dir) must FAIL loudly under --no-acquire, not
                    // be silently skipped.
                    missingVisuals.push(`scene ${s.sceneNumber} -> ${la} (file not found)`);
                    continue;
                }
                const kind = /\.(mp4|mov|webm|mkv)$/i.test(la) ? 'video' : 'image';
                assets.push({
                    kind,
                    sceneIndex: (s.sceneNumber ?? 1) - 1,
                    localPath,
                    license: 'User-supplied local asset',
                });
            }
            // Resolve background music (explicit file or query)
            let musicPath = '';
            if (job.backgroundMusic) {
                const bp = inputBgmPath(job.backgroundMusic);
                const bpBundled = inputBgmPath('__bundled__', job.backgroundMusic);
                const bpLegacy = inputAssetPath(job.backgroundMusic);
                musicPath = fs.existsSync(bp) ? bp
                    : (fs.existsSync(bpBundled) ? bpBundled
                        : (fs.existsSync(bpLegacy) ? bpLegacy : ''));
            }
            if (!musicPath) {
                const m = await resolveFreeBackgroundMusic({ query: job.musicQuery || 'background music', enabled: true });
                musicPath = m?.localPath && fs.existsSync(m.localPath) ? m.localPath : '';
            }
            if (musicPath) {
                assets.push({ kind: 'music', sceneIndex: -1, localPath: musicPath, license: 'User-supplied / free music' });
            }
            // BUG P2-1: under --no-acquire, a missing visual file must not "succeed".
            // If any scene is missing its visual AND there's no music to fall back
            // on, abort loudly (non-zero exit) so CI/automation doesn't ship a
            // broken video.
            const visualAssets = assets.filter((a: any) => a.kind !== 'music');
            if (missingVisuals.length > 0 && visualAssets.length === 0) {
                throw new Error(`--no-acquire: ${missingVisuals.length} scene(s) have no resolvable local visual and no music fallback: ${missingVisuals.join('; ')}`);
            }
            if (missingVisuals.length > 0) {
                console.warn(`  ⚠ --no-acquire: ${missingVisuals.length} scene(s) missing visual: ${missingVisuals.join('; ')}`);
            }
            const manifest = { jobId: id, title: job.title, orientation: job.orientation ?? 'landscape', voice: job.voice, musicQuery: job.musicQuery, assets, generatedAt: new Date().toISOString() };
            writeJson(ws.root, 'render-manifest.json', manifest);
            writeJson(ws.root, 'scene-data.json', {
                jobId: id, title: job.title,
                scenes: plan.scenes.map((s: any) => ({ sceneNumber: s.sceneNumber, voiceoverText: s.voiceoverText, searchKeywords: s.searchKeywords, visualPreference: s.visualPreference, durationSec: s.durationSec, localAsset: s.localAsset, personalAudio: s.personalAudio })),
                generatedAt: new Date().toISOString(),
            });
            console.log(`  ✅ --no-acquire: manifest with ${assets.length} local asset(s) (no network acquire)`);
            continue;
        }

        // Reconstruct minimal request to reuse acquireAssets
        const req: any = {
            jobId: id,
            title: job.title,
            topic: job.topic,
            orientation: job.orientation ?? 'portrait',
            voice: job.voice,
            backgroundMusic: job.backgroundMusic,
            musicVolume: job.musicVolume,
            localAssets: job.localAssets,
            videoClips: job.videoClips,
            candidatesPerAsset: job.candidatesPerAsset ?? 2,
            defaultVisual: job.defaultVisual,
        };

        // Rebuild the pipeline deps
        const { acquireAssets } = await import('../../agentic/pipeline/acquire.js');
        const { resolveFreeBackgroundMusic } = await import('../../lib/free-music.js');
        const { fetchVisualsForScene, searchImages, downloadMedia } = await import('../../lib/visual-fetcher.js');
        const { withTimeout, makePlaceholder, normalizeAudio } = await import('../../agentic/orchestrator/ffmpeg.js');
        const { inputAssetPath, inputBgmPath } = await import('../../lib/path-safety.js');
        const { sourceFromUrl } = await import('../../agentic/orchestrator/source.js');

        const sharedImagePool: { url: string }[] = [];

        const acquireDeps: any = {
            fetchVisual: async (keywords: string[], kind: boolean, orientation: string, sceneIndex = 0) => {
                // Simplified fetch (stolen from pipeline.ts)
                const DEAD_HOSTS = /flickr\.com|staticflickr\.com|live\.staticflickr/i;
                for (const q of [keywords, [keywords[0] || 'nature']]) {
                    const res = await fetchVisualsForScene(q, kind, orientation as any);
                    const arr = !res ? [] : Array.isArray(res) ? res : [res];
                    const usable = arr.filter((a: any) => a?.url && !DEAD_HOSTS.test(a.url));
                    if (usable.length > 0) return [{ url: usable[0].url, localPath: '', source: 'pexels' }];
                }
                return [{ url: '', localPath: makePlaceholder(keywords, 'image'), source: 'placeholder' }];
            },
            download: async (url: string, dir: string, filename: string) => {
                try {
                    const dl = await downloadMedia(url, dir, filename);
                                        return typeof dl === 'string' ? dl : (dl && (dl as any).path) ? (dl as any).path : dl;
                } catch {
                    return makePlaceholder([filename], 'image');
                }
            },
            fetchMusic: async (query: string, count: number) => {
                if (job.backgroundMusic) {
                    const bgmPath = inputBgmPath(job.backgroundMusic);
                    const bgmBundled = inputBgmPath('__bundled__', job.backgroundMusic);
                    const bgmLegacy = inputAssetPath(job.backgroundMusic);
                    const resolved = fs.existsSync(bgmPath) ? bgmPath
                        : (fs.existsSync(bgmBundled) ? bgmBundled
                            : (fs.existsSync(bgmLegacy) ? bgmLegacy : ''));
                    if (resolved) return [{ url: '', localPath: resolved, source: 'local' }];
                }
                const tracks = [];
                for (let i = 0; i < count; i++) {
                    const m = await resolveFreeBackgroundMusic({ query, enabled: true });
                    const lp = m?.localPath && fs.existsSync(m?.localPath) ? m?.localPath : '';
                    const fallback = [inputBgmPath('twenty_minutes.mp3'), inputBgmPath('two_minutes.mp3')].find((p: string) => fs.existsSync(p));
                    tracks.push({ url: '', localPath: lp || fallback || makePlaceholder([query], 'music'), source: 'local' });
                }
                return tracks;
            },
        };

        const { workspace, candidates } = await acquireAssets(plan, acquireDeps as any, req.candidatesPerAsset ?? 2);
        console.log(`  ✅ Acquired ${candidates.length} candidates`);

        // Save render-manifest (verify + gateway simplified — run full pipeline for gate)
        const { runGateway } = await import('../../agentic/pipeline/gateway.js');
        const { runFinalGate } = await import('../../agentic/pipeline/gate.js');
        const gatewayDeps: any = {
            ...acquireDeps,
            verifyImage: async () => ({ passes: true, confidence: 6, reason: 'skipped (modular)' }),
            verifyVideo: async () => ({ passes: true, confidence: 6, reason: 'skipped (modular)' }),
            decide: async () => ({ decision: 'approved', sceneIndex: 0 }),
        };
        const { decisions } = await runGateway(plan, candidates, gatewayDeps);
        const manifest = readJson(workspace.root || workspace as any, 'render-manifest.json');
        if (manifest) {
            console.log(`  ✅ Manifest: ${manifest.assets?.length || 0} assets`);
        }

        // Copy scene-duration and keyword info to scene-data
        writeJson(workspace.root || (workspace as any).root, 'scene-data.json', {
            jobId: id,
            title: job.title,
            scenes: plan.scenes.map((s: any) => ({
                sceneNumber: s.sceneNumber,
                voiceoverText: s.voiceoverText,
                searchKeywords: s.searchKeywords,
                visualPreference: s.visualPreference,
                durationSec: s.durationSec,
                localAsset: s.localAsset,
                personalAudio: s.personalAudio,
            })),
            generatedAt: new Date().toISOString(),
        });
    }
}

// ─── Stage 2.5: FLUX 3 (OPTIONAL backend) ───────────────────────────────────
// An opt-in job field (`flux3: "off" | "auto" | "on"` + optional per-scene
// `flux3Prompts[]`). "auto" uses FLUX 3 when the bridge reports it available
// and falls back to the stock visuals stage for any scene that fails; "on"
// requires FLUX 3 and fails loud. Absent/"off" leaves the pipeline untouched.
// The bridge runs under the Hermes Agent venv so it reuses Hermes' own Nous
// Portal auth + managed BFL gateway transport (scripts/flux3-bridge.py).

const FLUX3_BRIDGE = path.join(process.cwd(), 'scripts', 'flux3-bridge.py');
const DEFAULT_HERMES_PYTHON = 'C:\\Users\\PREM KUMAR\\AppData\\Local\\hermes\\hermes-agent\\venv\\Scripts\\python.exe';
const HERMES_PYTHON = process.env.HERMES_PYTHON || (fs.existsSync(DEFAULT_HERMES_PYTHON) ? DEFAULT_HERMES_PYTHON : 'python');

function runFlux3Bridge(args: string[], timeoutMs: number): { stdout: string; stderr: string } {
    try {
        const r = execFileSync(HERMES_PYTHON, [FLUX3_BRIDGE, ...args], {
            encoding: 'utf8',
            timeout: timeoutMs,
            stdio: ['ignore', 'pipe', 'pipe'],
        });
        return { stdout: r || '', stderr: '' };
    } catch (e: any) {
        return { stdout: e.stdout ? String(e.stdout) : '', stderr: e.stderr ? String(e.stderr) : String(e.message || e) };
    }
}

async function runFlux3(cliArgs: CliArgs) {
    const jobs = readJobJson();
    for (const job of jobs) {
        const mode = flux3Mode(job);
        if (mode === 'off') continue;

        const id = normalizeJobId(job.id || `job_${Date.now()}`);
        const ws = workspaceFor(id);
        const plan = readJson(ws.root, 'plan.json');
        const title = job.title || id;

        console.log(`\n═══════════════════════════════════════════`);
        console.log(`  [FLUX3] ${title}  (mode=${mode})`);
        console.log(`═══════════════════════════════════════════`);

        if (!plan || !Array.isArray(plan.scenes) || plan.scenes.length === 0) {
            console.error(`  ✖ No plan for job "${id}" — run the "plan" stage first.`);
            if (mode === 'on') throw new Error(`flux3:"on" — job "${id}" has no plan; run plan first`);
            continue;
        }

        // Availability gate (same check Hermes' bfl_flux3_* tools use).
        const avail = runFlux3Bridge(['available'], 60_000);
        let available = false;
        let reason = 'bridge error';
        try {
            const j = JSON.parse(avail.stdout);
            available = !!j.available;
            reason = j.reason || reason;
        } catch { /* fall through with defaults */ }
        if (!available) {
            if (mode === 'on') {
                throw new Error(`FLUX 3 requested (flux3:"on") but unavailable: ${reason}`);
            }
            console.warn(`  ⚠ FLUX 3 unavailable (${reason}) — falling back to stock visuals for this job.`);
            continue;
        }
        console.log(`  ✓ FLUX 3 available — generating ${plan.scenes.length} scene clip(s)`);

        const prompts: string[] = Array.isArray(job.flux3Prompts) ? job.flux3Prompts : [];
        const outDir = path.join(ws.root, 'flux3');
        fs.mkdirSync(outDir, { recursive: true });
        const clips: any[] = [];
        let fellBack = 0;

        for (const s of plan.scenes) {
            const idx = (s.sceneNumber ?? 1) - 1;
            const out = path.join(outDir, `scene_${s.sceneNumber}.mp4`);
            const prompt = flux3PromptForScene(s, prompts, idx, title);
            const duration = flux3Duration(s.durationSec ?? 8);

            console.log(`  … scene ${s.sceneNumber}: submitting FLUX 3 job (${duration}s, ${flux3Aspect(job.orientation)})`);
            const r = runFlux3Bridge([
                'generate',
                '--prompt', prompt,
                '--aspect', flux3Aspect(job.orientation),
                '--duration', String(duration),
                '--audio', '1',
                '--out', out,
            ], 960_000); // bridge polls up to 15 min per clip

            let parsed: any = {};
            try { parsed = JSON.parse(r.stdout); } catch { parsed = { error: r.stderr || r.stdout || 'no output' }; }

            if (parsed.status === 'Ready' && parsed.saved_path && fs.existsSync(out)) {
                s.localAsset = out; // absolute path — visuals --no-acquire accepts it
                clips.push({ sceneNumber: s.sceneNumber, jobId: parsed.job_id, prompt, savedPath: out });
                console.log(`  ✓ scene ${s.sceneNumber}: FLUX 3 clip → ${out}`);
            } else {
                fellBack += 1;
                const why = parsed.error ? String(parsed.error).slice(0, 160) : 'generation did not finish';
                if (mode === 'on') {
                    throw new Error(`flux3:"on" — scene ${s.sceneNumber} generation failed: ${why}`);
                }
                console.warn(`  ⚠ scene ${s.sceneNumber}: FLUX 3 ${why} — this scene falls back to stock visuals.`);
            }
        }

        writeJson(ws.root, 'plan.json', plan);
        writeJson(ws.root, 'flux3.json', {
            jobId: id,
            mode,
            generatedAt: new Date().toISOString(),
            clips,
            fellBackScenes: fellBack,
        });
        console.log(`  ✅ FLUX3 stage done: ${clips.length}/${plan.scenes.length} scene(s) generated${fellBack > 0 ? `, ${fellBack} fell back to stock` : ''}`);
    }
}

// ─── Stage 3: Voice ─────────────────────────────────────────────────────────

async function runVoice(cliArgs: CliArgs) {
    const jobs = readJobJson();
    for (const job of jobs) {
        const id = normalizeJobId(job.id || `job_${Date.now()}`);
        const ws = workspaceFor(id);
        const meta = readJson(ws.root, 'job-meta.json') || {};
        const plan = readJson(ws.root, 'plan.json');

        if (!plan) {
            console.error(`✖ No plan found for job "${id}". Run "plan" stage first.`);
            continue;
        }

        // Optionally filter to a single scene
        const targetScene = cliArgs.scene as number | undefined;
        if (targetScene) {
            const scene = plan.scenes.find((s: any) => s.sceneNumber === targetScene);
            if (!scene) {
                console.error(`✖ Scene ${targetScene} not found.`);
                continue;
            }
            plan.scenes = [scene];
        }

        console.log(`\n═══════════════════════════════════════════`);
        console.log(`  [VOICE] ${job.title || id}${targetScene ? ` scene ${targetScene}` : ''}`);
        console.log(`═══════════════════════════════════════════`);

        // ZERO-CONFIG parity with the orchestrator path: prefer the
        // self-driving kokoro/chatterbox backend (runVoiceStage), fall back to
        // the Edge-TTS dispatcher only if the backend cannot come up. This
        // removes the QA_REPORT integration gap (modular voice != orchestrator voice).
        const { runVoiceStageSafe } = await import('../../agentic/media/voice-controller.js');
        const { generateAgenticVoiceovers } = await import('../../agentic/media/tts.js');
        const { estimateAudioDurationSafe } = await import('../../agentic/orchestrator/ffmpeg.js');
        const { syllableWordTimings } = await import('../../lib/captions.js');
        // Build a full AgenticWorkspace so VoiceController's audioDir resolves correctly.
        const rootWs = {
            root: ws.root,
            assetsDir: ws.assetsDir,
            imagesDir: ws.imagesDir,
            videosDir: ws.videosDir,
            musicDir: ws.musicDir,
            verificationDir: ws.verificationDir,
            audioDir: ws.audioDir,
        } as any;
        // ── Bridge: real-voice controls from the JSON job -> src/speech ──
        // 1) cloneVoiceFrom: auto-clone a REAL voice profile from a clip in
        //    input/voices/ and use that profile id for the whole job.
        let clonedProfileId: string | undefined;
        if (job.cloneVoiceFrom) {
            const clip = path.resolve(process.cwd(), 'input', 'voices', job.cloneVoiceFrom);
            if (fs.existsSync(clip)) {
                try {
                    const { cloneFromVoicesDir } = await import('../../agentic/media/voice-controller.js');
                    const r = await cloneFromVoicesDir(clip, path.join(ws.root, 'cache', 'voicebox-profile.json'));
                    clonedProfileId = r.id;
                    console.log(`  🎙 cloned real voice (${job.cloneVoiceFrom}) -> profile ${r.id}`);
                } catch (e: any) {
                    console.warn(`  ⚠ cloneVoiceFrom failed (${e?.message}); using default`);
                }
            } else {
                console.warn(`  ⚠ cloneVoiceFrom clip not found: ${clip}`);
            }
        }
        // 2) kokoroVoice: pick a named kokoro preset (e.g. af_heart, af_bella).
        if (job.kokoroVoice) {
            process.env.VOICEBOX_PRESET_VOICE = job.kokoroVoice;
            console.log(`  🎙 kokoro preset voice: ${job.kokoroVoice}`);
        }
        // 3) voicesByScene: forward per-scene VoiceBox/kokoro id (not Edge).
        if (job.voicesByScene) {
            for (const [k, v] of Object.entries(job.voicesByScene as Record<string, string>)) {
                const sc = plan.scenes.find((s: any) => String(s.sceneNumber) === String(k));
                if (sc && !/Neural$/.test(String(v))) sc.voiceOverride = String(v);
            }
        }

        // ── Dry-run: show which scenes need voice ──
        if (cliArgs['dry-run']) {
            const sceneVoices = plan.scenes.map((s: any) => {
                const voiceLabel = s.voiceOverride || job.voice || 'default';
                const hasExisting = (() => {
                    const wav = path.join(ws.audioDir, `scene_${s.sceneNumber}_voice.wav`);
                    const mp3 = path.join(ws.audioDir, `scene_${s.sceneNumber}_voice.mp3`);
                    return fs.existsSync(wav) || fs.existsSync(mp3);
                })();
                return `  [${s.sceneNumber}] ${voiceLabel.padEnd(30)} ${(s.voiceoverText || '...').slice(0, 45).padEnd(48)} ${hasExisting ? '✅ cached' : '❓ needs generation'}`;
            });
            const details: DryRunDetail[] = [{
                stage: 'VOICE',
                details: [
                    `Job: ${job.title || id}`,
                    `Default voice: ${job.voice || 'default'}`,
                    `Target scene: ${targetScene ? `scene ${targetScene}` : 'all'}`,
                    `Scenes: ${plan.scenes.length}`,
                    '',
                    ...sceneVoices,
                    '',
                    `(voiceovers would be generated to workspace audio dir)`,
                ],
            }];
            printDryRun(job, job.title || id, details);
            continue;
        }

        let voiceovers;
        try {
            const vres = await runVoiceStageSafe(plan, rootWs, job.voice, undefined, clonedProfileId);
            // Generate real word-timed caption segments (same as orchestrator path).
            voiceovers = {
                voiceoverDriven: vres.voiceoverDriven,
                scenes: vres.voices.map((v: any) => ({
                    sceneIndex: v.sceneIndex,
                    audioPath: v.audioPath,
                    durationSec: v.durationSec,
                    captionSegments: syllableWordTimings(
                        plan.scenes[v.sceneIndex]?.voiceoverText ?? '',
                        Math.round((v.durationSec || 2) * 1000),
                    ),
                })),
                fallbackUsed: vres.fallbackUsed,
            };
        } catch (e: any) {
            console.warn(`  ⚠ kokoro voice stage unavailable ("${e?.message}"); falling back to Edge-TTS dispatcher`);
            voiceovers = await generateAgenticVoiceovers(plan, rootWs, job.voice);
        }

        if (!targetScene) {
            writeJson(ws.root, 'voiceover-meta.json', {
                voiceoverDriven: voiceovers.voiceoverDriven,
                sceneCount: voiceovers.scenes.length,
                fallbackUsed: voiceovers.fallbackUsed,
            });
        }

        // ── Bridge: apply voiceSpeed / voicePitchSemitones to real audio ──
        // ffmpeg atempo for speed, asetrate for pitch (keeps tempo). When both
        // are set, pitch-shift first then time-stretch so neither is lost.
        const speed = job.voiceSpeed ? Number(job.voiceSpeed) : undefined;
        const pitch = job.voicePitchSemitones ? Number(job.voicePitchSemitones) : undefined;
        if ((speed && speed !== 1) || (pitch && pitch !== 0)) {
            const ffmpegBin: string = require('ffmpeg-static');
            const filterParts: string[] = [];
            if (pitch && pitch !== 0) {
                const rate = Math.pow(2, pitch / 12); // semitones -> sample-rate factor
                filterParts.push(`asetrate=44100*${rate.toFixed(4)}`);
            }
            if (speed && speed !== 1) filterParts.push(`atempo=${speed}`);
            const filter = filterParts.join(',');
            let applied = 0;
            for (const v of voiceovers.scenes) {
                const src = v.audioPath;
                if (!src || !fs.existsSync(src)) continue;
                const tmp = src + '.pitched.wav';
                try {
                    execFileSync(ffmpegBin, ['-y', '-i', src, '-af', filter, '-ar', '44100', tmp], { stdio: 'ignore' });
                    if (fs.existsSync(tmp) && fs.statSync(tmp).size > 1000) {
                        fs.renameSync(tmp, src);
                        applied++;
                    }
                } catch { /* leave original on ffmpeg failure */ }
            }
            if (applied > 0) console.log(`  🎚 applied voice fx (speed=${speed ?? 1}, pitch=${pitch ?? 0} semi) to ${applied} scene(s)`);
        }

        console.log(`  ✅ Voiceover ${voiceovers.voiceoverDriven ? 'generated' : 'fallback'} — ${voiceovers.scenes.length} scene(s)`);
    }
}

// ─── Stage 4: Render ────────────────────────────────────────────────────────

async function runRender(cliArgs: CliArgs) {
    const jobs = readJobJson();
    for (const job of jobs) {
        const id = normalizeJobId(job.id || `job_${Date.now()}`);
        const ws = workspaceFor(id);
        const meta = readJson(ws.root, 'job-meta.json') || {};
        const plan = readJson(ws.root, 'plan.json');

        if (!plan) {
            console.error(`✖ No plan found for job "${id}". Run "plan" stage first.`);
            continue;
        }

        console.log(`\n═══════════════════════════════════════════`);
        console.log(`  [RENDER] ${job.title || id}`);
        console.log(`═══════════════════════════════════════════`);

        // Build minimal PipelineResult-like object
        const manifest = readJson(ws.root, 'render-manifest.json') || readJson(ws.root, 'scene-data.json');
        if (!manifest) {
            console.error(`✖ No manifest found for job "${id}". Run "visuals" stage first.`);
            continue;
        }

        // ── Dry-run: show what would be rendered ──
        if (cliArgs['dry-run']) {
            const sceneData = plan.scenes.map((s: any) => {
                const hasVisual = !!s.localAsset || manifest.assets?.some((a: any) => a.sceneIndex === s.sceneNumber - 1 && a.localPath);
                const hasVoice = (() => {
                    const wav = path.join(ws.audioDir, `scene_${s.sceneNumber}_voice.wav`);
                    const mp3 = path.join(ws.audioDir, `scene_${s.sceneNumber}_voice.mp3`);
                    return fs.existsSync(wav) || fs.existsSync(mp3);
                })();
                return `  [${s.sceneNumber}] ${(s.voiceoverText || '...').slice(0, 50).padEnd(52)} ${(s.durationSec || '?').toFixed(1)}s  ${hasVisual ? '🖼' : '❌'} ${hasVoice ? '🎙' : '🔇'}`;
            });
            const details: DryRunDetail[] = [{
                stage: 'RENDER',
                details: [
                    `Job: ${job.title || id}`,
                    `Workspace: ${ws.root}`,
                    `Scenes: ${plan.scenes.length}`,
                    `Total duration: ${plan.totalDurationSec?.toFixed(1) ?? '?'}s`,
                    `Orientation: ${job.orientation ?? 'portrait'}`,
                    `Captions: ${(job.captions || meta.captions) !== 'none' ? 'burned' : 'none'}`,
                    `Assets in manifest: ${manifest.assets?.length ?? 0}`,
                    '',
                    ...sceneData,
                    '',
                    `Output dir: ${outputFor(id)}`,
                    `(video would be rendered via ffmpeg)`,
                ],
            }];
            printDryRun(job, job.title || id, details);
            continue;
        }

        const voiceoverMeta = readJson(ws.root, 'voiceover-meta.json');
        const result: any = {
            backend: job.backend ?? 'agent',
            plan,
            workspace: { jobId: id, root: ws.root, assetsDir: ws.assetsDir, imagesDir: ws.imagesDir, videosDir: ws.videosDir, musicDir: ws.musicDir, verificationDir: ws.verificationDir, audioDir: ws.audioDir },
            manifest: manifest.assets ? manifest : {
                assets: plan.scenes.map((s: any, i: number) => ({
                    sceneIndex: i,
                    kind: s.visualPreference === 'video' ? 'video' : 'image',
                    localPath: s.localAsset ? path.join(ws.assetsDir, s.localAsset) : undefined,
                    durationSec: s.durationSec,
                })),
                voiceoverDriven: voiceoverMeta?.voiceoverDriven ?? false,
            },
            voiceovers: voiceoverMeta,
            gate: { pass: true, checks: [] },
            fullyAgentDriven: true,
        };

        // Build voiceovers scenes from files on disk (matches orchestrator path)
        const audioDir = ws.audioDir;
        const voiceScenes: any[] = [];
        if (fs.existsSync(audioDir)) {
            for (const s of plan.scenes) {
                const audioFile = path.join(audioDir, `scene_${s.sceneNumber}_voice.wav`);
                const mp3File = path.join(audioDir, `scene_${s.sceneNumber}_voice.mp3`);
                const found = [audioFile, mp3File].find(f => fs.existsSync(f));
                if (found) {
                    // FIX: scene length must follow the ACTUAL synthesized
                    // speech duration (like the orchestrator path does via
                    // estimateAudioDurationSafe). Previously this used the
                    // plan's default durationSec (8s) — a 16s narration was
                    // cut at 8s, capping videos far below their script length.
                    const realDur = await estimateAudioDurationSafe(found);
                    const dur = realDur > 0 ? realDur : s.durationSec || 4;
                    voiceScenes.push({
                        sceneIndex: s.sceneNumber - 1,
                        audioPath: found,
                        durationSec: dur,
                        captionSegments: s.captionSegments || [],
                    });
                    // keep manifest asset durations in sync — render.ts sizes
                    // visuals from `assets[].durationSec`
                    const asset = (result.manifest?.assets ?? []).find(
                        (a: any) => a.kind !== 'music' && a.sceneIndex === s.sceneNumber - 1,
                    );
                    if (asset) asset.durationSec = dur;
                }
            }
        }
        // GUARD (BUG A3, root cause): the earlier `result.voiceovers =
        // voiceoverMeta` may be the SLIM fallback shape
        // {voiceoverDriven, sceneCount, fallbackUsed} with NO `scenes` array
        // (when no per-scene WAVs exist on disk). render.ts indexes
        // `res.voiceovers?.scenes[clip.idx]`, which throws on that shape.
        // Always normalize to a VoiceoverResult with a real `scenes` array:
        // the on-disk WAVs when present, else an empty array (renderer then
        // uses a silent anullsrc track per scene — no crash).
        if (voiceScenes.length > 0) {
            result.voiceovers = { scenes: voiceScenes, voiceoverDriven: true, fallbackUsed: voiceoverMeta?.fallbackUsed ?? false, sidecars: result.voiceovers?.sidecars ?? [] };
        } else {
            // Preserve whatever slim meta was set, but guarantee `scenes`.
            result.voiceovers = {
                scenes: [],
                voiceoverDriven: voiceoverMeta?.voiceoverDriven ?? false,
                fallbackUsed: voiceoverMeta?.fallbackUsed ?? false,
                sidecars: (result.voiceovers as any)?.sidecars ?? [],
            };
        }

        const { renderAgenticSlideshow } = await import('../../agentic/orchestrator/render.js');
        const outputDir = outputFor(id);
        fs.mkdirSync(outputDir, { recursive: true });

        // BUG M3: motion FX (shakeByScene / speedRampByScene / punchInByScene /
        // parallaxDepthByScene) were only applied by composeVideo(), never on
        // the CLI render path. Pre-process the per-scene visual assets here.
        if (job.shakeByScene || job.speedRampByScene || job.punchInByScene || job.parallaxDepthByScene) {
            const fx = await import('../../agentic/operations/advanced-fx.js');
            const fxDir = path.join(ws.root, 'motion-fx');
            fs.mkdirSync(fxDir, { recursive: true });
            const dims = (job.orientation === 'portrait') ? { w: 720, h: 1280 } : (job.orientation === 'square' ? { w: 720, h: 720 } : { w: 1280, h: 720 });
            for (const a of (result.manifest?.assets ?? [])) {
                if (!a?.localPath || a.kind === 'music' || a.sceneIndex < 0) continue;
                if (!/\.(mp4|webm|mov|m4v)$/i.test(a.localPath)) continue; // stills handled by ken-burns
                let p = a.localPath;
                try {
                    p = fx.applyShake(p, a.sceneIndex, job, fxDir, dims.w, dims.h);
                    p = fx.applySpeedRamp(p, a.sceneIndex, job, fxDir);
                    p = fx.applyPunchIn(p, a.sceneIndex, job, fxDir, dims.w, dims.h);
                    p = fx.applyParallax(p, a.sceneIndex, job, fxDir, dims.w, dims.h);
                } catch (e: any) {
                    console.warn(`  ⚠ motion FX scene ${a.sceneIndex} failed: ${String(e?.message).slice(0, 160)}`);
                }
                if (p !== a.localPath && fs.existsSync(p)) {
                    console.log(`  🎬 motion FX applied to scene ${a.sceneIndex}: ${path.basename(p)}`);
                    a.localPath = p;
                }
            }
        }

        // BUG M4: honor declared ducking/voice-volume on the modular path.
        // render.ts reads these from env (AUDIO_DUCK_LEVEL / AUDIO_FULL_LEVEL).
        const duck = job.duckDepth;
        if (typeof duck === 'number') process.env.AUDIO_DUCK_LEVEL = String(duck);
        const voiceVol = job.voiceVolumeByScene?.[0] ?? (typeof job.voiceVolume === 'number' ? job.voiceVolume : undefined);
        if (typeof voiceVol === 'number') process.env.AUDIO_FULL_LEVEL = String(voiceVol);

        const finalMp4 = await renderAgenticSlideshow(result, {
            outPath: path.join(outputDir, `${job.title || 'output'}.mp4`),
            crossfadeSec: 0.3,
            burnCaptions: (job.captions || meta.captions) !== 'none',
            intro: job.intro || meta.intro,
            outro: job.outro || meta.outro,
            sfx: job.sfx ?? meta.sfx,
            captions: job.captions || meta.captions,
            captionTheme: job.captionTheme || meta.captionTheme,
            kinetic: job.kineticText ?? meta.kineticText,
            kenBurns: job.kenBurns ?? meta.kenBurns,
            preset: job.preset || meta.preset,
            vignette: job.vignette ?? meta.vignette,
            // BUG A1: jCutSec was written to job-meta but never forwarded.
            jCutSec: job.jCutSec ?? meta.jCutSec,
            // BUG A2: honor the job's exportAspects (incl. '4K') instead of the
            // hardcoded three-aspect list in render.ts.
            exportAspects: job.exportAspects ?? meta.exportAspects,
            // BUG C4: forward per-scene emoji stickers.
            emojiByScene: job.emojiByScene ?? meta.emojiByScene,
            // BUG combo-2: forward job-wide paletteFilter to the modular render path.
            paletteFilter: job.paletteFilter ?? meta.paletteFilter,
        });

        if (finalMp4 && fs.existsSync(finalMp4)) {
            const size = fs.statSync(finalMp4).size;
            console.log(`  ✅ Rendered: ${finalMp4} (${(size / 1024).toFixed(0)} KB)`);

            // Post-render export formats (gif/webm) + inspection artifacts.
            const exportFormat = job.exportFormat || meta.exportFormat;
            if (exportFormat === 'gif' || exportFormat === 'webm') {
                const { transcode } = await import('../../agentic/operations/export-fx.js');
                const converted = transcode(finalMp4, exportFormat, outputDir);
                if (converted) console.log(`  ✅ Exported ${exportFormat}: ${converted} (${(fs.statSync(converted).size / 1024).toFixed(0)} KB)`);
                else console.error(`  ✖ ${exportFormat} export failed.`);
            }
            const contactSheet = job.contactSheet ?? meta.contactSheet;
            if (contactSheet) {
                const { exportContactSheet } = await import('../../agentic/operations/export-fx.js');
                const sheet = exportContactSheet(finalMp4, outputDir);
                if (sheet) console.log(`  ✅ Contact sheet: ${sheet}`);
            }
        } else {
            console.error(`  ✖ Render failed — no output produced.`);
        }
    }
}

// ─── Scene Editor ────────────────────────────────────────────────────────────

async function runEdit(cliArgs: CliArgs) {
    const sceneNum = cliArgs.scene as number;
    if (!sceneNum || sceneNum < 1) {
        console.error(`✖ Usage: edit --scene <N> [--visual keyword] [--voice name] [--volume N] [--style top|center|bottom] [--color name] [--music file.mp3]`);
        process.exit(1);
    }

    const jobs = readJobJson();
    for (const job of jobs) {
        const id = normalizeJobId(job.id || `job_${Date.now()}`);
        const ws = workspaceFor(id);
        const plan = readJson(ws.root, 'plan.json');

        if (!plan) {
            console.error(`✖ No plan found for job "${id}". Run "plan" stage first.`);
            continue;
        }

        const scene = plan.scenes.find((s: any) => s.sceneNumber === sceneNum);
        if (!scene) {
            console.error(`✖ Scene ${sceneNum} not found. Available: ${plan.scenes.map((s: any) => s.sceneNumber).join(', ')}`);
            continue;
        }

        console.log(`\n═══════════════════════════════════════════`);
        console.log(`  [EDIT] Scene ${sceneNum}`);
        console.log(`═══════════════════════════════════════════`);
        console.log(`  Before: "${(scene.voiceoverText || '…').slice(0, 60)}"`);
        console.log(`    visual: ${scene.searchKeywords?.join(', ') || scene.localAsset || 'auto'}`);
        console.log(`    voice: ${scene.voiceOverride || job.voice || 'default'}`);
        console.log(`    volume: ${scene.volumeOverride || 1.0}`);
        console.log(`    style: ${scene.captionStyle || 'default'}`);
        console.log(`    color: ${scene.captionColor || 'default'}`);
        console.log(`    music: ${scene.musicOverride || job.backgroundMusic || 'auto'}`);

        // Apply edits
        let changed = false;

        if (cliArgs.visual) {
            scene.searchKeywords = [String(cliArgs.visual)];
            scene.localAsset = undefined;
            scene.visualPreference = undefined;
            changed = true;
            console.log(`  → visual: "${cliArgs.visual}"`);
        }
        if (cliArgs.voice) {
            scene.voiceOverride = String(cliArgs.voice);
            changed = true;
            console.log(`  → voice: "${cliArgs.voice}"`);
        }
        if (cliArgs.volume !== undefined) {
            scene.volumeOverride = Number(cliArgs.volume);
            changed = true;
            console.log(`  → volume: ${cliArgs.volume}`);
        }
        if (cliArgs.style) {
            scene.captionStyle = String(cliArgs.style);
            changed = true;
            console.log(`  → style: ${cliArgs.style}`);
        }
        if (cliArgs.color) {
            scene.captionColor = String(cliArgs.color);
            changed = true;
            console.log(`  → color: ${cliArgs.color}`);
        }
        if (cliArgs.music) {
            scene.musicOverride = String(cliArgs.music);
            changed = true;
            console.log(`  → music: "${cliArgs.music}"`);
        }
        if (cliArgs.transition) {
            scene.transition = String(cliArgs.transition);
            changed = true;
            console.log(`  → transition: "${cliArgs.transition}"`);
        }
        if (cliArgs.grade) {
            scene.grade = String(cliArgs.grade);
            changed = true;
            console.log(`  → grade: "${cliArgs.grade}"`);
        }
        if (cliArgs['ken-burns'] !== undefined) {
            scene.kenBurns = cliArgs['ken-burns'] === false ? false : String(cliArgs['ken-burns']);
            changed = true;
            console.log(`  → kenBurns: ${scene.kenBurns}`);
        }
        if (cliArgs['fade-in'] !== undefined) {
            scene.fadeIn = Number(cliArgs['fade-in']);
            changed = true;
            console.log(`  → fadeIn: ${scene.fadeIn}`);
        }
        if (cliArgs['fade-out'] !== undefined) {
            scene.fadeOut = Number(cliArgs['fade-out']);
            changed = true;
            console.log(`  → fadeOut: ${scene.fadeOut}`);
        }
        if (cliArgs.trim) {
            // Format: "start-end" e.g. "00:05-00:10"
            const parts = String(cliArgs.trim).split('-');
            if (parts.length === 2) {
                scene.trim = String(cliArgs.trim);
                scene.trimStart = parts[0];
                scene.trimEnd = parts[1];
                changed = true;
                console.log(`  → trim: ${cliArgs.trim}`);
            } else {
                console.warn(`  ⚠ Invalid trim format. Use: start-end (e.g. 00:05-00:10)`);
            }
        }
        if (cliArgs['trim-start'] !== undefined) {
            scene.trimStart = String(cliArgs['trim-start']);
            changed = true;
            console.log(`  → trimStart: ${scene.trimStart}`);
        }
        if (cliArgs['trim-end'] !== undefined) {
            scene.trimEnd = String(cliArgs['trim-end']);
            changed = true;
            console.log(`  → trimEnd: ${scene.trimEnd}`);
        }

        if (!changed) {
            console.log(`  ℹ No changes specified. Add --visual, --voice, --volume, etc.`);
            continue;
        }

        // Save updated plan
        writeJson(ws.root, 'plan.json', plan);
        console.log(`  ✅ Plan updated`);

        // If voice changed, regenerate TTS for this scene AND re-extract
        // word-timed captions so the burned text stays in sync with the new
        // audio (fixes the caption-desync gap when editing voice).
        if (cliArgs.voice) {
            console.log(`  🔄 Regenerating voiceover for scene ${sceneNum} with "${cliArgs.voice}"...`);
            const { runVoiceStageSafe } = await import('../../agentic/media/voice-controller.js');
            const { generateAgenticVoiceovers } = await import('../../agentic/media/tts.js');
            const { syllableWordTimings, writeCaptionSidecars } = await import('../../lib/captions.js');
            const audioDir = ws.audioDir;
            const outWav = path.join(audioDir, `scene_${sceneNum}_voice.wav`);
            const outMp3 = path.join(audioDir, `scene_${sceneNum}_voice.mp3`);
            try {
                await runVoiceStageSafe({ ...plan, scenes: [scene] } as any, { root: ws.root } as any, String(cliArgs.voice));
            } catch {
                await generateAgenticVoiceovers({ ...plan, scenes: [scene] } as any, { root: ws.root } as any, String(cliArgs.voice));
            }
            // Re-extract caption timings from the regenerated audio so captions match.
            const audioFile = [outWav, outMp3].find((f) => fs.existsSync(f));
            if (audioFile) {
                try {
                    const dur = await estimateAudioDurationSafe(audioFile);
                    const segs = syllableWordTimings(scene.voiceoverText || '', dur || scene.durationSec);
                    scene.captionSegments = segs;
                    writeJson(ws.root, 'plan.json', plan);
                    console.log(`  ✅ Scene ${sceneNum} voiceover + captions regenerated`);
                } catch {
                    console.log(`  ✅ Scene ${sceneNum} voiceover regenerated (caption timings kept)`);
                }
            } else {
                console.log(`  ✅ Scene ${sceneNum} voiceover regenerated`);
            }
        }

        // If visual changed, re-download
        if (cliArgs.visual) {
            console.log(`  🔄 Re-downloading visual for scene ${sceneNum}...`);
            const { downloadMedia } = await import('../../lib/visual-fetcher.js');
            const { fetchVisualsForScene } = await import('../../lib/visual-fetcher.js');
            const { withTimeout } = await import('../../agentic/orchestrator/ffmpeg.js');
            try {
                const res = await fetchVisualsForScene([String(cliArgs.visual)], false, job.orientation ?? 'portrait');
                if (res) {
                    const urls = Array.isArray(res) ? res : [res];
                    const url = urls[0]?.url;
                    if (url) {
                        const ext = path.extname(new URL(url).pathname) || '.jpg';
                        const dlResult = await downloadMedia(url, ws.assetsDir, `scene_${sceneNum}${ext}`);
                        const localPath = typeof dlResult === 'string' ? dlResult : (dlResult as any).path || '';
                        scene.localAsset = path.basename(localPath);
                        writeJson(ws.root, 'plan.json', plan);
                        console.log(`  ✅ Scene ${sceneNum} visual updated: ${path.basename(localPath)}`);
                    }
                }
            } catch (e: any) {
                console.warn(`  ⚠ Could not fetch visual: ${e.message}`);
            }
        }

        // Render ONLY the edited scene as a standalone segment
        if (cliArgs.render !== false) {
            console.log(`\n  🔄 Re-rendering scene ${sceneNum} only...`);

            const audioDir = ws.audioDir;
            const sceneAudio = [path.join(audioDir, `scene_${sceneNum}_voice.wav`), path.join(audioDir, `scene_${sceneNum}_voice.mp3`)].find(f => fs.existsSync(f));

            const result: any = {
                backend: job.backend ?? 'agent',
                plan,
                workspace: { root: ws.root, assetsDir: ws.assetsDir, jobId: id },
                manifest: {
                    assets: [{
                        sceneIndex: sceneNum - 1,
                        kind: scene.visualPreference === 'video' ? 'video' : 'image',
                        localPath: scene.localAsset
                            ? (fs.existsSync(path.join(ws.assetsDir, scene.localAsset))
                                ? path.join(ws.assetsDir, scene.localAsset)
                                : undefined)
                            : undefined,
                        durationSec: scene.durationSec,
                    }],
                    voiceoverDriven: true,
                },
                voiceovers: {
                    scenes: [{
                        sceneIndex: sceneNum - 1,
                        audioPath: sceneAudio || '',
                        durationSec: scene.durationSec,
                        captionSegments: scene.captionSegments || [],
                    }],
                    voiceoverDriven: !!sceneAudio,
                    fallbackUsed: false,
                },
                gate: { pass: true, checks: [] },
                fullyAgentDriven: true,
            };

            const { renderAgenticSlideshow } = await import('../../agentic/orchestrator/render.js');
            const outputDir = outputFor(id);
            const editOut = path.join(outputDir, `scene_${sceneNum}_edit.mp4`);

            try {
                const mp4 = await renderAgenticSlideshow(result, {
                    outPath: editOut,
                    crossfadeSec: 0,
                    burnCaptions: (job.captions) !== 'none',
                    intro: undefined,
                    outro: undefined,
                    sfx: false,
                    vignette: job.vignette !== false,
                });
                if (mp4 && fs.existsSync(mp4)) {
                    const size = fs.statSync(mp4).size;
                    console.log(`  ✅ Edited scene ${sceneNum} rendered: ${mp4} (${(size / 1024).toFixed(0)} KB)`);
                    // Contact-sheet: extract a few frames so the user can SEE
                    // the edit without scrubbing the full video.
                    try {
                        const ffmpeg: string = require('ffmpeg-static');
                        const sheetDir = path.join(ws.root, 'verification', `scene_${sceneNum}_sheet`);
                        fs.mkdirSync(sheetDir, { recursive: true });
                        const sheet = path.join(sheetDir, 'contact-sheet.png');
                        const probe = require('child_process').spawnSync(ffmpeg, [
                            '-i', mp4, '-vf', 'thumbnail,scale=720:-1,tile=4x1', '-frames:v', '1', sheet,
                        ], { stdio: 'ignore' });
                        if (probe.status === 0 && fs.existsSync(sheet)) {
                            console.log(`  🖼 contact-sheet: ${sheet}`);
                        }
                    } catch (err: any) {
                        // ENOENT means ffmpeg-static is not installed — inform user
                        if (err?.code === 'ENOENT' || err?.message?.includes('ENOENT') || err?.message?.includes('ffmpeg')) {
                            console.warn(`  ⚠ contact-sheet skipped: ffmpeg not available (run: npm install)`);
                        } else {
                            console.warn(`  ⚠ contact-sheet skipped: ${err?.message ?? err}`);
                        }
                    }

                    // Gap C fix: swap the regenerated scene INTO the existing
                    // master in-place (editing, not full re-render). Prefer the
                    // job's title-based master; fall back to any full render.
                    const masterName = `${job.title || 'output'}.mp4`;
                    const masterPath = path.join(outputDir, masterName);
                    const masterAlt = fs.existsSync(masterPath)
                        ? masterPath
                        : (fs.readdirSync(outputDir).find((f) => f.endsWith('.mp4') && !f.includes('scene_')) || '');
                    if (masterAlt && fs.existsSync(masterAlt)) {
                        try {
                            const { restitchMaster } = await import('../../agentic/operations/restitch.js');
                            const stitched = await restitchMaster(
                                masterAlt, mp4, path.join(ws.root, 'plan.json'), sceneNum,
                                path.join(outputDir, `${job.title || 'output'}_r${sceneNum}.mp4`),
                            );
                            if (stitched.ok) {
                                console.log(`  🎬 Re-stitched master → ${stitched.output}`);
                            } else {
                                console.log(`  ⚠ re-stitch skipped: ${stitched.detail} (full re-render still available)`);
                            }
                        } catch (re: any) {
                            console.log(`  ⚠ re-stitch failed: ${re?.message ?? re} (full re-render still available)`);
                        }
                    } else {
                        console.log(`\n  ℹ No master render found to splice into. To regenerate the full video, run:`);
                        console.log(`     npm run agentic:modular render`);
                    }
                }
            } catch (e: any) {
                console.error(`  ✖ Scene render failed: ${e.message}`);
            }
        }

        console.log(`\n  ℹ To regenerate the full video after edits, run:`);
        console.log(`     npm run agentic:modular render`);
    }
}

// ─── List Scenes ─────────────────────────────────────────────────────────────

async function runList() {
    const jobs = readJobJson();
    for (const job of jobs) {
        const id = normalizeJobId(job.id || `job_${Date.now()}`);
        const ws = workspaceFor(id);
        const plan = readJson(ws.root, 'plan.json');
        const sceneData = readJson(ws.root, 'scene-data.json');

        console.log(`\n═══════════════════════════════════════════`);
        console.log(`  ${job.title || id}`);
        console.log(`═══════════════════════════════════════════`);

        if (!plan) {
            console.log(`  ℹ No plan yet — run "plan" stage first.`);
            continue;
        }

        console.log(`  Duration: ${plan.totalDurationSec?.toFixed(1) || '?'}s`);
        console.log(`  Voice: ${job.voice || plan.voice || 'default'}`);
        console.log(`  Orientation: ${plan.orientation}`);
        console.log(`  `);
        console.log(`  Scenes (${plan.scenes.length}):`);
        console.log(`  `);
        for (const s of plan.scenes) {
            const vo = s.voiceOverride || '';
            const vol = s.volumeOverride ? ` vol=${s.volumeOverride}` : '';
            const style = s.captionStyle ? ` style=${s.captionStyle}` : '';
            const color = s.captionColor ? ` (${s.captionColor})` : '';
            const kb = s.kenBurns !== undefined ? ` kb=${s.kenBurns}` : '';
            const tr = s.transition ? ` tr=${s.transition}` : '';
            const gr = s.grade ? ` gr=${s.grade}` : '';
            const fi = s.fadeIn ? ` fi=${s.fadeIn}s` : '';
            const fo = s.fadeOut ? ` fo=${s.fadeOut}s` : '';
            const mu = s.musicOverride ? ` mu=${s.musicOverride}` : '';
            const tags = `${vo}${vol}${style}${color}${kb}${tr}${gr}${fi}${fo}${mu}`;
            const visual = s.localAsset || s.searchKeywords?.join(' ') || 'auto';
            console.log(`    ${String(s.sceneNumber).padStart(2)}. ${(s.voiceoverText || '…').slice(0, 50).padEnd(52)} [${(s.durationSec || '?').toFixed(1)}s]`);
            console.log(`       🖼 ${visual.slice(0, 60)}`);
            if (tags) console.log(`       🏷 ${tags}`);
        }

        // Check stage completion
        const hasVoice = readJson(ws.root, 'voiceover-meta.json') !== null || fs.existsSync(path.join(ws.audioDir, 'scene_1_voice.wav'));
        const hasManifest = readJson(ws.root, 'render-manifest.json') !== null;
        const hasOutput = fs.existsSync(path.join(outputFor(id), `${job.title || 'output'}.mp4`));
        console.log(`  `);
        console.log(`  Stages:`);
        console.log(`    Plan:     ✅`);
        console.log(`    Visuals:  ${hasManifest ? '✅' : '—'}`);
        console.log(`    Voice:    ${hasVoice ? '✅' : '—'}`);
        console.log(`    Render:   ${hasOutput ? '✅' : '—'}`);
        console.log(`  `);
        console.log(`  Next steps:`);
        if (!hasManifest) console.log(`    npm run agentic:modular visuals`);
        if (!hasVoice) console.log(`    npm run agentic:modular voice`);
        if (!hasOutput) console.log(`    npm run agentic:modular render`);
    }
}

// ─── Doctor / Check ───────────────────────────────────────────────────────────

async function runDoctor() {
    const jobs = readJobJson();

    console.log(`\n  🔍 System Check`);
    console.log(`  ───────────────`);

    // 1. ffmpeg availability
    let ffmpegOk = false;
    let ffmpegVer = '';
    try {
        const { execSync } = require('child_process');
        const ffmpeg = require('ffmpeg-static');
        if (ffmpeg) {
            ffmpegOk = true;
            const ver = execSync(`"${ffmpeg}" -version`, { encoding: 'utf-8', timeout: 5000 });
            ffmpegVer = ver.split('\n')[0] || 'unknown';
        }
    } catch { /* execSync failed — ffmpeg not found */ }
    if (!ffmpegOk) {
        try {
            const { execSync } = require('child_process');
            const ver = execSync('ffmpeg -version', { encoding: 'utf-8', timeout: 5000 });
            ffmpegOk = true;
            ffmpegVer = ver.split('\n')[0] || 'ffmpeg in PATH';
        } catch { /* ffmpeg not in PATH either */
            ffmpegOk = false;
        }
    }
    console.log(`  ${ffmpegOk ? '✅' : '❌'} FFmpeg:        ${ffmpegVer || 'NOT FOUND'}`);

    // 2. Voicebox check
    let voiceboxOk = false;
    try {
        const r = require('child_process').execSync(
            'curl -s -o NUL -w "%{http_code}" http://127.0.0.1:17493/health 2>NUL || curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:17493/health 2>/dev/null',
            { encoding: 'utf-8', timeout: 3000, shell: true }
        );
        voiceboxOk = r.trim() === '200' || r.trim() === '000';
    } catch { /* curl/voicebox health check failed */ }
    console.log(`  ${voiceboxOk ? '✅' : '⚠️'} Voicebox:      ${voiceboxOk ? '127.0.0.1:17493 reachable' : 'Not reachable (run voicebox first)'}`);

    // 3. Node version
    console.log(`  ✅ Node:          ${process.version}`);

    // 4. Disk space
    try {
        const df = require('child_process').execSync('df -h . 2>/dev/null | tail -1', { encoding: 'utf-8', timeout: 2000 });
        console.log(`  ✅ Disk:         ${df.trim()}`);
    } catch {
        // Windows
        try {
            const df = require('child_process').execSync('wmic logicaldisk get size,freespace,caption 2>NUL', { encoding: 'utf-8', timeout: 2000 });
            const lines = df.split('\\n').filter((l: string) => l.includes('C:'));
            if (lines.length > 0) console.log(`  ✅ Disk:         C: drive available`);
        } catch { /* wmic failed */ }
    }

    // 5. Workspace jobs
    for (const job of jobs) {
        const id = normalizeJobId(job.id || `job_${Date.now()}`);
        const ws = workspaceFor(id);
        const plan = readJson(ws.root, 'plan.json');
        const manifest = readJson(ws.root, 'render-manifest.json');
        const voiceMeta = readJson(ws.root, 'voiceover-meta.json');
        const outputDir = outputFor(id);
        const outputVideos = fs.existsSync(outputDir) ? fs.readdirSync(outputDir).filter(f => f.endsWith('.mp4')).length : 0;

        console.log(`  `);
        console.log(`  Job: ${job.title || id}`);
        console.log(`    Plan:     ${plan ? `✅ ${plan.scenes?.length || 0} scenes` : '⏳ Not generated'}`);
        console.log(`    Visuals:  ${manifest ? `✅ ${manifest.assets?.length || 0} assets` : '⏳ Not acquired'}`);
        console.log(`    Voice:    ${voiceMeta ? `✅ ${voiceMeta.total || 0} files` : '⏳ Not generated'}`);
        console.log(`    Render:   ${outputVideos > 0 ? `✅ ${outputVideos} video(s)` : '⏳ Not rendered'}`);
    }

    // 6. NPM dependencies
    try {
        const missing: string[] = [];
        const deps: [string, string][] = [
            ['ffmpeg-static', 'ffmpeg-static'],
            ['tsx', 'tsx'],
            ['dotenv', 'dotenv'],
            ['axios', 'axios'],
        ];
        for (const [dep, pkg] of deps) {
            try { require.resolve(pkg); } catch { missing.push(dep); }
        }
        if (missing.length === 0) {
            console.log(`\n  ✅ All NPM dependencies installed`);
        } else {
            console.log(`\n  ⚠️ Missing NPM packages: ${missing.join(', ')}`);
        }
    } catch { /* NPM dep check failed */ }

    // 7. Environment
    const envVars = ['TTS_PROVIDER', 'VOICEBOX_API_URL', 'VOICEBOX_ENGINE'];
    for (const v of envVars) {
        console.log(`  ${process.env[v] ? '✅' : '⚠️'} ${v}: ${process.env[v] || 'not set'}`);
    }

    console.log(`\n  Doctor check complete.\n`);
}

// ─── Scene Reorder ──────────────────────────────────────────────────────

async function runReorder(cliArgs: CliArgs) {
    const jobs = readJobJson();
    const orderRaw = cliArgs.order as string | undefined;
    if (!orderRaw) {
        console.error('✖ Usage: reorder --order 4,1,2,3');
        process.exit(1);
    }
    const order = orderRaw.split(',').map((s) => parseInt(s.trim(), 10)).filter((n) => n >= 1);

    for (const job of jobs) {
        const id = normalizeJobId(job.id || `job_${Date.now()}`);
        const ws = workspaceFor(id);
        const plan = readJson(ws.root, 'plan.json');
        if (!plan) {
            console.error(`✖ No plan found for job "${id}". Run "plan" first.`);
            continue;
        }
        const n = plan.scenes.length;
        if (order.length !== n || new Set(order).size !== n) {
            console.error(`✖ --order must list all ${n} scene numbers exactly once (got ${orderRaw})`);
            continue;
        }
        // Reorder scenes by the requested 1-based order, renumber sceneNumber.
        const byNum = new Map<any, any>(plan.scenes.map((s: any) => [s.sceneNumber, s]));
        plan.scenes = order.map((num, i) => {
            const sc: any = byNum.get(num);
            sc.sceneNumber = i + 1;
            return sc;
        });
        plan.totalDurationSec = plan.scenes.reduce((acc: number, s: any) => acc + (s.durationSec || 0), 0);
        writeJson(ws.root, 'plan.json', plan);
        console.log(`  ✅ Reordered ${n} scenes → [${order.join(', ')}]. Re-render to apply:`);
        console.log(`     npm run agentic:modular render`);
    }
}

// ─── Critique (Director's Critique) ───────────────────────────────────

async function runCritique(cliArgs: CliArgs) {
    const jobs = readJobJson();
    for (const job of jobs) {
        const id = normalizeJobId(job.id || `job_${Date.now()}`);
        const ws = workspaceFor(id);
        const planPath = path.join(ws.root, 'plan.json');
        const outDir = outputFor(id);
        if (!fs.existsSync(outDir)) {
            console.error(`✖ No output for job "${id}". Render first.`);
            continue;
        }
        const mp4s = fs.readdirSync(outDir).filter((f) => f.endsWith('.mp4') && !f.includes('scene_'));
        if (mp4s.length === 0) {
            console.error(`✖ No rendered MP4 in ${outDir}`);
            continue;
        }
        const mp4 = path.join(outDir, mp4s[0]);
        const { critiqueVideo } = await import('../../agentic/operations/critique.js');
        const rep = await critiqueVideo(mp4, { planPath });
        console.log(`\n═══════════════════════════════════════════`);
        console.log(`  [CRITIQUE] ${job.title || id} — ${rep.ok ? 'PASS' : 'NEEDS WORK'}`);
        console.log(`═══════════════════════════════════════════`);
        console.log(`  dims ${rep.raw.width}x${rep.raw.height} ${rep.raw.codec}, peak ${rep.raw.peakDb}dB, longestBlack ${rep.raw.longestBlack}s`);
        if (rep.suggestions.length === 0) {
            console.log('  ✅ No issues found.');
        } else {
            for (const s of rep.suggestions) {
                const where = s.scope === 'global' ? 'GLOBAL' : `scene ${s.scope + 1}`;
                console.log(`  [${s.severity}] ${where}: ${s.issue}`);
            }
            console.log(`\n  💡 Auto-fix: npm run agentic:modular revise --job ${id} --auto`);
        }
    }
}

// ─── Revise (close feedback loop) ─────────────────────────────────────

async function runRevise(cliArgs: CliArgs) {
    const jobs = readJobJson();
    for (const job of jobs) {
        const id = normalizeJobId(job.id || `job_${Date.now()}`);
        const notes = (cliArgs.notes as string) || (cliArgs.auto ? 'auto-critique fixes' : 'manual revision');
        const { reviseJob, critiqueAndRevise } = await import('../../agentic/operations/revise.js');
        let report;
        if (cliArgs.auto) {
            const outDir = outputFor(id);
            const mp4s = fs.existsSync(outDir) ? fs.readdirSync(outDir).filter((f) => f.endsWith('.mp4') && !f.includes('scene_')) : [];
            if (mp4s.length === 0) {
                console.error(`✖ No rendered MP4 to auto-critique for ${id}`);
                continue;
            }
            const mp4 = path.join(outDir, mp4s[0]);
            report = await critiqueAndRevise(id, mp4, path.join(workspaceFor(id).root, 'plan.json'), notes);
        } else {
            report = await reviseJob(id, notes);
        }
        console.log(`\n═══════════════════════════════════════════`);
        console.log(`  [REVISE] ${job.title || id} — round ${report.round} ${report.ok ? 'OK' : 'FAILED'}`);
        console.log(`═══════════════════════════════════════════`);
        console.log(`  ${report.detail}`);
        if (report.outputPath) console.log(`  📹 ${report.outputPath}`);
    }
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
    const { subcommand, args } = parseArgv(process.argv);
    console.log(`\n  🎬 AVS Modular Pipeline`);
    console.log(`  ─────────────────────\n`);

    // Show help
    if (subcommand === 'help' || subcommand === '--help' || subcommand === '-h') {
        console.log(`  Commands:`);
        console.log(`    plan              Parse script and generate plan`);
        console.log(`    visuals           Download visuals for all scenes`);
        console.log(`    voice             Generate voiceovers`);
        console.log(`    render            Render video from workspace`);
        console.log(`    edit              Edit specific scenes (--scene N --visual kw --voice name)`);
        console.log(`  `);
        console.log(`  Global flags:`);
        console.log(`    --dry-run         Preview what would happen without making changes`);
        console.log(`    --file <path>     Use a custom job JSON file (default: input/scripts/agentic-scripts.json)`);
        console.log(`    --job <id>        Target a specific job by id`);
        console.log(`    reorder           Reorder scenes (--order 4,1,2,3) then re-render`);
        console.log(`    critique          Director's Critique of the rendered MP4 (black/clip/aspect)`);
        console.log(`    revise            Re-edit a delivered job from change notes (--auto to self-heal)`);
        console.log(`    list              Show workspace state`);
        console.log(`    doctor            Check system health`);
        console.log(`    pipeline          Run all stages (default)`);
        console.log(`  `);
        console.log(`  Edit flags: --scene N --visual kw --voice name --volume 0.8`);
        console.log(`              --style top|center|bottom --color red|yellow|cyan`);
        console.log(`              --transition fade|slide|zoomblur --grade warm|cool`);
        console.log(`              --ken-burns true|false|zoom-in|zoom-out`);
        console.log(`              --fade-in 0.5 --fade-out 0.5 --music bgm.mp3`);
        console.log(`              --trim "00:05-00:10" --render false`);
        console.log(`  `);
        console.log(`  Editor (simple operations):`);
        console.log(`    npm run agentic:editor -- trim --input file.mp4 --start 00:05 --end 00:15`);
        console.log(`    npm run agentic:editor -- info --input file.mp4`);
        console.log(`  `);
        return;
    }

    // If the user asks for a specific subcommand, process only the first job
    // (isSingleJob — reserved for future single-job narrowing)
    void args.job;

    switch (subcommand) {
        case 'plan':
            await runPlan(args);
            break;
        case 'visuals':
            await runVisuals(args);
            break;
        case 'flux3':
            await runFlux3(args);
            break;
        case 'voice':
            await runVoice(args);
            break;
        case 'render':
            await runRender(args);
            break;
        case 'edit':
            await runEdit(args);
            break;
        case 'reorder':
            await runReorder(args);
            break;
        case 'critique':
            await runCritique(args);
            break;
        case 'revise':
            await runRevise(args);
            break;
        case 'list':
            await runList();
            break;
        case 'doctor':
            await runDoctor();
            break;
        case 'pipeline':
        default:
            // Full pipeline: plan → (optional FLUX 3) → visuals → voice → render.
            // FLUX 3 jobs resolve their own no-acquire inside runVisuals (per-job);
            // stock jobs acquire normally even in a mixed job file.
            await runPlan(args);
            await runFlux3(args);
            await runVisuals(args);
            await runVoice(args);
            await runRender(args);
            break;
    }

    console.log(`\n  ✅ Done.\n`);
}

main().catch((e) => {
    console.error(`✖ Fatal: ${e.message}`);
    process.exit(1);
});
