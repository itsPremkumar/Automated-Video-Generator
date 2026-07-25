/**
 * advanced-fx.ts — Phase 2 advanced editor-signal consumers.
 *
 * Every function here takes a clip/audio path + scene index + the job spec
 * and returns EITHER the same path (when the field is unset / unsupported)
 * OR a new intermediate file path with the effect baked in.
 *
 * All functions are defensive: a missing input or an ffmpeg failure falls
 * back to the original path so one bad effect can never poison the whole
 * render. Every new field is optional → fully backward-compatible.
 *
 * Consumed fields:
 *   Audio : duckDepth, duckDepthByScene, voiceVolumeByScene, voiceDelayByScene,
 *           eqByScene, compressorByScene, noiseReductionByScene, reverbByScene,
 *           pitchShiftByScene, tempoByScene
 *   Color : highlightsByScene, shadowsByScene, whitesByScene, blacksByScene,
 *           colorWheelsByScene, toneCurveByScene
 *   Output: frameRate, keyframeInterval, hardwareEncode, outputQuality,
 *           halfResolution, doubleResolution, exportAspects, outputName
 *   Motion: parallaxDepthByScene, particlesByScene
 *   Brand : watermarkByScene, watermarkRotation, watermarkShadow, brandTintByScene
 */

import * as fs from 'fs';
import * as path from 'path';
import { execFileSync } from 'child_process';
import ffmpegPath from 'ffmpeg-static';

function ff(): string {
  const p = ffmpegPath as unknown as string;
  if (!p || !fs.existsSync(p)) throw new Error('ffmpeg-static binary not found');
  return p;
}

function isReadableVideo(p: string): boolean {
  try {
    const s = fs.statSync(p);
    return s.size > 0;
  } catch {
    return false;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// AUDIO FX
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Build a per-scene voice audio filtergraph string (single-input [0:a]).
 * Returns '' when no audio FX are set for this scene.
 */
export function buildVoiceAudioFilter(job: any, sceneIndex: number): string {
  const parts: string[] = [];
  const eq = job.eqByScene?.[sceneIndex];
  if (eq && Array.isArray(eq) && eq.length) {
    const bands = eq.map((b: any, i: number) => `anequalizer=c0 f=${b.freq ?? 1000}:g=${b.gain ?? 0}:t=q:w=${b.q ?? 1}:${i === 0 ? 'n=' + eq.length : ''}`).join(',');
    parts.push(bands);
  }
  const comp = job.compressorByScene?.[sceneIndex];
  if (comp) {
    const thr = (comp.threshold ?? -20).toFixed(1);
    const ratio = (comp.ratio ?? 3).toFixed(1);
    const atk = (comp.attack ?? 5).toFixed(1);
    const rel = (comp.release ?? 80).toFixed(1);
    const makeup = (comp.makeup ?? 0).toFixed(1);
    parts.push(`acompressor=threshold=${thr}dB:ratio=${ratio}:attack=${atk}:release=${rel}:makeup=${makeup}dB`);
  }
  const nr = job.noiseReductionByScene?.[sceneIndex];
  if (nr && nr > 0) {
    const amt = Math.min(1, nr).toFixed(2);
    parts.push(`afftdn=nr=${Math.round(Number(amt) * 20)}`);
  }
  const rev = job.reverbByScene?.[sceneIndex];
  if (rev && rev !== 'none') {
    // Simple convolution-free reverb approximation via apulsator-free `aecho`.
    parts.push(`aecho=0.8:0.9:${rev === 'large' ? 80 : rev === 'small' ? 20 : 50}:0.4`);
  }
  const pitch = job.pitchShiftByScene?.[sceneIndex];
  if (pitch && pitch !== 0) {
    // semitones → asetrate factor (2^(n/12))
    const factor = Math.pow(2, Number(pitch) / 12).toFixed(4);
    parts.push(`asetrate=44100*${factor},aresample=44100`);
  }
  const tempo = job.tempoByScene?.[sceneIndex];
  if (tempo && tempo !== 1) {
    parts.push(`atempo=${Number(tempo).toFixed(3)}`);
  }
  return parts.join(',');
}

/**
 * Apply per-scene voice FX to a single voice WAV/MP3 and return the processed path.
 */
export function applyVoiceAudioFx(input: string, sceneIndex: number, job: any, workDir: string): string {
  const filt = buildVoiceAudioFilter(job, sceneIndex);
  if (!filt) return input;
  if (!fs.existsSync(input)) return input;
  const out = path.join(workDir, `vfx_${sceneIndex}.wav`);
  if (fs.existsSync(out)) fs.rmSync(out, { force: true });
  try {
    execFileSync(ff(), ['-y', '-i', input, '-af', filt, '-ar', '44100', out], { stdio: ['ignore', 'ignore', 'pipe'], timeout: 60000 });
    return isReadableVideo(out) ? out : input;
  } catch (e: any) {
    console.warn(`  ⚠ voice FX scene ${sceneIndex} failed: ${String(e?.stderr ?? e?.message).slice(0, 200)}`);
    return input;
  }
}

/**
 * Compute the music ducking gain for a scene (0..1 multiplier).
 * Honors duckDepthByScene > duckDepth > default 0 (no ducking).
 */
export function sceneDuckGain(job: any, sceneIndex: number): number {
  const d = job.duckDepthByScene?.[sceneIndex] ?? job.duckDepth ?? 0;
  const v = Math.max(0, Math.min(1, Number(d)));
  // 0 → full music, 1 → silent music during voice
  return 1 - v * 0.85; // never fully mute; keep 15% bed
}

/**
 * Per-scene voice volume multiplier (0..1).
 */
export function sceneVoiceVolume(job: any, sceneIndex: number): number {
  const v = job.voiceVolumeByScene?.[sceneIndex];
  if (v === undefined) return 1;
  return Math.max(0, Math.min(2, Number(v)));
}

/**
 * Per-scene voice delay in seconds (for lip-sync offset).
 */
export function sceneVoiceDelay(job: any, sceneIndex: number): number {
  const d = job.voiceDelayByScene?.[sceneIndex];
  return d ? Math.max(0, Number(d)) : 0;
}

// ═══════════════════════════════════════════════════════════════════════════
// COLOR GRADING DEPTH (extends the eq-based adjuster in compose.ts)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Build a color-grading-depth filter string (highlights/shadows/whites/blacks/
 * colorWheels/toneCurve). Returns '' when unset.
 */
export function buildColorGradeDepthFilter(job: any, sceneIndex: number): string {
  const parts: string[] = [];
  const hi = job.highlightsByScene?.[sceneIndex];
  const sh = job.shadowsByScene?.[sceneIndex];
  const wh = job.whitesByScene?.[sceneIndex];
  const bl = job.blacksByScene?.[sceneIndex];
  if ([hi, sh, wh, bl].some((x) => x !== undefined)) {
    const p = (v: number | undefined, def: number) => (v === undefined ? def : Number(v));
    // This ffmpeg build only supports rs/gs/bs (shadows), rm/gm/bm (midtones),
    // rh/gh/bh (highlights) — there is NO `gain`/`lift` option. Map:
    //   shadows  → rs/gs/bs
    //   highlights→ rh/gh/bh
    //   blacks   → rm/gm/bm (midtones shifted darker)
    //   whites   → skip (no native support; approximated by highlights boost)
    const rs = p(sh, 0).toFixed(3), gs = p(sh, 0).toFixed(3), bs = p(sh, 0).toFixed(3);
    const rh = p(hi, 0).toFixed(3), gh = p(hi, 0).toFixed(3), bh = p(hi, 0).toFixed(3);
    const rm = p(bl, 0).toFixed(3), gm = p(bl, 0).toFixed(3), bm = p(bl, 0).toFixed(3);
    parts.push(`colorbalance=rs=${rs}:gs=${gs}:bs=${bs}:rh=${rh}:gh=${gh}:bh=${bh}:rm=${rm}:gm=${gm}:bm=${bm}`);
  }
  const tone = job.toneCurveByScene?.[sceneIndex];
  if (tone && tone !== 'none') {
    if (tone === 'sCurve' || tone === 'cinematic') parts.push('curves=all=0.5/0.5');
    else if (tone === 'linear') parts.push('curves=all=0/0:1/1');
    else if (tone === 'punch') parts.push('curves=all=0.25/0.2:0.75/0.8');
  }
  const wheels = job.colorWheelsByScene?.[sceneIndex];
  if (wheels) {
    // colorbalance takes floats in [-1,1]; convert hex (0x000000..0xFFFFFF)
    // to a signed normalized value: signed = (u/255)*2 - 1.
    const norm = (h?: string): number => {
      if (!h) return 0;
      const u = parseInt(h.replace('#', ''), 16);
      return Math.max(-1, Math.min(1, ((u & 0xFF) / 255) * 2 - 1));
    };
    const shC = norm(wheels.shadows);
    const midC = norm(wheels.midtones);
    const hiC = norm(wheels.highlights);
    parts.push(`colorbalance=rs=${shC.toFixed(3)}:gs=${shC.toFixed(3)}:bs=${shC.toFixed(3)}:rh=${hiC.toFixed(3)}:gh=${hiC.toFixed(3)}:bh=${hiC.toFixed(3)}:rm=${midC.toFixed(3)}:gm=${midC.toFixed(3)}:bm=${midC.toFixed(3)}`);
  }
  return parts.join(',');
}

export function applyColorGradeDepth(clipPath: string, sceneIndex: number, job: any, workDir: string): string {
  const filt = buildColorGradeDepthFilter(job, sceneIndex);
  if (!filt || !fs.existsSync(clipPath)) return clipPath;
  const out = path.join(workDir, `cdeep_${sceneIndex}.mp4`);
  if (fs.existsSync(out)) fs.rmSync(out, { force: true });
  try {
    execFileSync(ff(), ['-y', '-i', clipPath, '-vf', filt, '-an', '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-threads', '1', out], { stdio: ['ignore', 'ignore', 'pipe'], timeout: 60000 });
    return isReadableVideo(out) ? out : clipPath;
  } catch (e: any) {
    console.warn(`  ⚠ color-depth scene ${sceneIndex} failed: ${String(e?.stderr ?? e?.message).slice(0, 200)}`);
    return clipPath;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// MOTION: parallax + particles
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Parallax: subtle scale + drift to fake 2.5D depth. depth 0..10.
 */
export function applyParallax(clipPath: string, sceneIndex: number, job: any, workDir: string, W: number, H: number): string {
  const depth = job.parallaxDepthByScene?.[sceneIndex];
  if (!depth || !fs.existsSync(clipPath)) return clipPath;
  const z = 1 + Math.min(10, Number(depth)) * 0.02; // up to +20% zoom
  const out = path.join(workDir, `par_${sceneIndex}.mp4`);
  if (fs.existsSync(out)) fs.rmSync(out, { force: true });
  const filt = `scale=${W * z}:${H * z}:force_original_aspect_ratio=increase,crop=${W}:${H},zoompan=z='min(zoom+0.001,${z.toFixed(3)})':d=1:s=${W}x${H}:fps=25`;
  try {
    execFileSync(ff(), ['-y', '-i', clipPath, '-vf', filt, '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-threads', '1', out], { stdio: ['ignore', 'ignore', 'pipe'], timeout: 90000 });
    return isReadableVideo(out) ? out : clipPath;
  } catch (e: any) {
    console.warn(`  ⚠ parallax scene ${sceneIndex} failed: ${String(e?.stderr ?? e?.message).slice(0, 200)}`);
    return clipPath;
  }
}

/**
 * Particles: overlay a generated particle field (snow/rain/sparkles) on top.
 * The particle field is synthesized with ffmpeg's geq (no external asset needed).
 */
export function applyParticles(clipPath: string, sceneIndex: number, job: any, workDir: string, W: number, H: number): string {
  const kind = job.particlesByScene?.[sceneIndex];
  if (!kind || !fs.existsSync(clipPath)) return clipPath;
  const out = path.join(workDir, `part_${sceneIndex}.mp4`);
  if (fs.existsSync(out)) fs.rmSync(out, { force: true });
  // Generate a moving noise field then colorize per kind.
  let expr: string;
  if (kind === 'rain') expr = `if(lt(random(1)*${H},Y),255,0)`;
  else if (kind === 'snow') expr = `if(lt(random(2)*${W},X),255,0)`;
  else expr = `if(lt(random(3)*200,20),255,0)`; // sparkles
  const color = kind === 'rain' ? '0xAAAAAA' : kind === 'snow' ? '0xFFFFFF' : '0xFFD700';
  const filt = `[1:v]scale=320:568,format=gray,geq=lum='${expr}'[p];color=${color}@0.6,scale=320:568[c];[c][p]alphamerge[a];[a]scale=${W}:${H}[as];[0:v][as]overlay=format=auto[ov]`;
  try {
    execFileSync(ff(), [
      '-y', '-i', clipPath, '-f', 'lavfi', '-i', `color=c=black:s=${W}x${H}:r=25:d=5`,
      '-filter_complex', filt, '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-threads', '1', out,
    ], { stdio: ['ignore', 'ignore', 'pipe'], timeout: 90000 });
    return isReadableVideo(out) ? out : clipPath;
  } catch (e: any) {
    console.warn(`  ⚠ particles scene ${sceneIndex} failed: ${String(e?.stderr ?? e?.message).slice(0, 200)}`);
    return clipPath;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// BRAND: watermark per-scene (rotation/shadow/tint) + brand tint
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Apply a per-scene watermark with rotation + drop shadow.
 */
export function applyWatermarkScene(clipPath: string, sceneIndex: number, job: any, workDir: string, inputDir: string, W: number, H: number): string {
  const wm = job.watermarkByScene?.[sceneIndex];
  const globalWm = job.watermark;
  const src = wm?.image ?? globalWm;
  if (!src) return clipPath;
  const wmPath = path.resolve(inputDir, src);
  if (!fs.existsSync(wmPath)) return clipPath;
  const rot = wm?.rotation ?? job.watermarkRotation ?? 0;
  const shadow = wm?.shadow ?? job.watermarkShadow;
  const out = path.join(workDir, `wm_${sceneIndex}.mp4`);
  if (fs.existsSync(out)) fs.rmSync(out, { force: true });
  const shFilt = shadow ? `,drawbox=x=${shadow.x ?? 3}:y=${shadow.y ?? 3}:w=iw:h=ih:color=${shadow.color ?? 'black@0.5'}:t=fill` : '';
  const filt = `[1:v]scale=${Math.round(W * 0.18)}:-1,rotate=${rot}*(PI/180)${shFilt}[w];[0:v][w]overlay=W-w-20:H-h-20`;
  try {
    execFileSync(ff(), ['-y', '-i', clipPath, '-i', wmPath, '-filter_complex', filt, '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', out], { stdio: ['ignore', 'ignore', 'pipe'], timeout: 120000 });
    return isReadableVideo(out) ? out : clipPath;
  } catch (e: any) {
    console.warn(`  ⚠ watermark scene ${sceneIndex} failed: ${String(e?.stderr ?? e?.message).slice(0, 200)}`);
    return clipPath;
  }
}

/**
 * Apply a per-scene brand color tint (subtle full-frame color overlay).
 * Uses a drawbox full-frame fill at low alpha — works on every ffmpeg build
 * (coloroverlay is not always compiled in).
 */
export function applyBrandTint(clipPath: string, sceneIndex: number, job: any, workDir: string): string {
  const tint = job.brandTintByScene?.[sceneIndex];
  if (!tint || !fs.existsSync(clipPath)) return clipPath;
  // tint format "#RRGGBB@alpha"
  const m = /^#?([0-9a-fA-F]{6})@?([0-9.]+)?$/.exec(tint);
  if (!m) return clipPath;
  const color = '0x' + m[1];
  const alpha = m[2] ? Number(m[2]) : 0.1;
  const out = path.join(workDir, `tint_${sceneIndex}.mp4`);
  if (fs.existsSync(out)) fs.rmSync(out, { force: true });
  const filt = `drawbox=x=0:y=0:w=iw:h=ih:color=${color}@${alpha.toFixed(2)}:t=fill`;
  try {
    execFileSync(ff(), ['-y', '-i', clipPath, '-vf', filt, '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', out], { stdio: ['ignore', 'ignore', 'pipe'], timeout: 60000 });
    return isReadableVideo(out) ? out : clipPath;
  } catch (e: any) {
    console.warn(`  ⚠ brand tint scene ${sceneIndex} failed: ${String(e?.stderr ?? e?.message).slice(0, 200)}`);
    return clipPath;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// OUTPUT CONTROL
// ═══════════════════════════════════════════════════════════════════════════

export type EncodeOpts = {
  codecArgs: string[];
  fps: number;
  gop: number;
  scaleW?: number;
  scaleH?: number;
};

/**
 * Resolve final-encode options from job output-control fields.
 */
export function resolveEncodeOpts(job: any, baseW: number, baseH: number): EncodeOpts {
  const fps = job.frameRate && job.frameRate > 0 ? Number(job.frameRate) : 25;
  const gop = job.keyframeInterval && job.keyframeInterval > 0 ? Math.round(Number(job.keyframeInterval) * fps) : Math.round(fps * 2);
  let scaleW = baseW;
  let scaleH = baseH;
  if (job.halfResolution) { scaleW = Math.round(baseW / 2); scaleH = Math.round(baseH / 2); }
  if (job.doubleResolution) { scaleW = baseW * 2; scaleH = baseH * 2; }

  let codecArgs: string[];
  if (job.hardwareEncode) {
    // Try nvenc, fall back to libx264 (verified presence below by caller).
    codecArgs = ['-c:v', 'h264_nvenc', '-preset', 'p2', '-pix_fmt', 'yuv420p'];
  } else {
    const preset = job.outputQuality === 'lossless' ? 'veryslow'
      : job.outputQuality === 'high' ? 'slow'
      : job.outputQuality === 'medium' ? 'medium'
      : job.outputQuality === 'low' ? 'ultrafast' : 'veryfast';
    codecArgs = ['-c:v', 'libx264', '-preset', preset, '-pix_fmt', 'yuv420p'];
  }
  return { codecArgs, fps, gop, scaleW, scaleH };
}

/**
 * Detect hardware encoder availability (nvenc / videotoolbox).
 */
export function hasHardwareEncoder(): 'nvenc' | 'videotoolbox' | null {
  try {
    const out = execFileSync(ff(), ['-hide_banner', '-encoders'], { stdio: ['ignore', 'pipe', 'pipe'], timeout: 20000 }).toString();
    if (/h264_nvenc/.test(out)) return 'nvenc';
    if (/h264_videotoolbox/.test(out)) return 'videotoolbox';
  } catch { /* ignore */ }
  return null;
}

/**
 * Resolve the final output filename honoring outputName.
 */
export function resolveOutputName(job: any, defaultBase: string): string {
  if (job.outputName) {
    const n = String(job.outputName).replace(/[^a-z0-9_.-]/gi, '_');
    return n.endsWith('.mp4') ? n : n + '.mp4';
  }
  return defaultBase;
}

/**
 * Map exportAspects → array of {w,h} for multi-aspect rendering.
 */
export function resolveAspectSizes(job: any, baseW: number, baseH: number): { label: string; w: number; h: number }[] {
  const aspects: string[] = job.exportAspects ?? [];
  const map: Record<string, [number, number]> = {
    '9:16': [720, 1280],
    '16:9': [1280, 720],
    '1:1': [1080, 1080],
    square: [1080, 1080],
  };
  const out: { label: string; w: number; h: number }[] = [];
  for (const a of aspects) {
    const s = map[a];
    if (s) out.push({ label: a.replace(':', 'x'), w: s[0], h: s[1] });
  }
  return out;
}
