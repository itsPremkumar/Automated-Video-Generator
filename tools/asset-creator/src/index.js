'use strict';
/**
 * asset-creator — completely free, offline asset creation engine.
 *
 * NO network. NO API keys. NO downloads. Every asset is GENERATED locally by
 * ffmpeg-static (lavfi sources + drawtext + filters). This is the "creation"
 * counterpart to the Automated-Video-Generator's "download" asset pipeline.
 *
 * Covers: images, video clips (motion graphics), background music, SFX, GIF,
 * and branded placeholders.
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const ffmpeg = require('ffmpeg-static');

/** Run ffmpeg, throwing on failure with stderr captured. */
function ff(args, { timeoutMs = 60000 } = {}) {
  try {
    execFileSync(ffmpeg, args, { stdio: 'pipe', maxBuffer: 1024 * 1024 * 50, timeout: timeoutMs });
  } catch (e) {
    const stderr = (e.stderr && e.stderr.toString()) || e.message || String(e);
    throw new Error('ffmpeg failed: ' + stderr.split('\n').slice(-3).join(' | '));
  }
}

/** Ensure a directory exists. */
function ensureDir(p) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
}

/** Locate a usable font file for drawtext (static ffmpeg has no bundled font). */
function fontFile() {
  const candidates = [
    'C:\\Windows\\Fonts\\arial.ttf',
    'C:\\Windows\\Fonts\\segoeui.ttf',
    'C:\\Windows\\Fonts\\calibri.ttf',
    '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
    '/System/Library/Fonts/Supplemental/Arial.ttf',
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return null; // drawtext will use its default if any; null = no fontfile arg
}

/** Poll until a file exists and is non-empty (ffmpeg writes async). */
function waitFile(p, ms = 8000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (fs.existsSync(p) && fs.statSync(p).size > 0) return true;
    // yield to event loop briefly
    const start = Date.now();
    while (Date.now() - start < 20) { /* busy-wait 20ms */ }
  }
  return fs.existsSync(p) && fs.statSync(p).size > 0;
}

/** Build a drawtext fragment with an optional fontfile (static ffmpeg needs it). */
function dt(extra) {
  const ff2 = fontFile();
  return ff2 ? `drawtext=fontfile='${ff2.replace(/\\/g, '/')}':${extra}` : `drawtext=${extra}`;
}

// ---------------------------------------------------------------------------
// IMAGES
// ---------------------------------------------------------------------------

/**
 * Create a gradient/branded background image.
 * @param {object} o { out, w=1080, h=1920, color1='#1e3a8a', color2='#0f172a', angle=90 }
 */
function createBackgroundImage(o = {}) {
  const out = o.out || path.join(process.cwd(), 'out', 'bg.png');
  const w = o.w || 1080;
  const h = o.h || 1920;
  const c1 = (o.color1 || '#1e3a8a').replace('#', '0x');
  const c2 = (o.color2 || '#0f172a').replace('#', '0x');
  ensureDir(out);
  // diagonal gradient via hue/saturation/value lavfi with a radial-ish mix
  ff([
    '-f', 'lavfi', '-i', `color=c=${c2}:s=${w}x${h}:d=1`,
    '-f', 'lavfi', '-i', `gradients=s=${w}x${h}:c0=${c1}:c1=${c2}:nb_colors=2:speed=0.004:x0=${w / 2}:y0=${h / 2}:x1=${w / 2}:y1=0`,
    '-frames', '1', '-y', out,
  ]);
  if (!waitFile(out)) throw new Error('background image not produced: ' + out);
  return out;
}

/**
 * Create a title card image (background + big centered title + subtitle).
 * @param {object} o { out, title, subtitle, w, h, titleColor, bg }
 */
function createTitleCard(o = {}) {
  const out = o.out || path.join(process.cwd(), 'out', 'title.png');
  const w = o.w || 1080;
  const h = o.h || 1920;
  const bg = o.bg || '#0f172a';
  const title = (o.title || 'Title').replace(/:/g, '\\:');
  const subtitle = (o.subtitle || '').replace(/:/g, '\\:');
  const titleColor = o.titleColor || 'white';
  ensureDir(out);
  const titleFilter = dt(`text='${title}':fontcolor=${titleColor}:fontsize=${Math.round(w * 0.08)}:x=(w-text_w)/2:y=(h-text_h)/2-line_h${subtitle ? `-${Math.round(w * 0.06)}` : ''}:box=0`);
  const filters = [titleFilter];
  if (subtitle) {
    filters.push(dt(`text='${subtitle}':fontcolor=gray:fontsize=${Math.round(w * 0.04)}:x=(w-text_w)/2:y=(h-text_h)/2+${Math.round(w * 0.02)}:box=0`));
  }
  ff([
    '-f', 'lavfi', '-i', `color=c=${bg.replace('#', '0x')}:s=${w}x${h}:d=1`,
    '-vf', filters.join(','),
    '-frames', '1', '-y', out,
  ]);
  if (!waitFile(out)) throw new Error('title card not produced: ' + out);
  return out;
}

/**
 * Create a quote card image (background + wrapped quote + author).
 */
function createQuoteCard(o = {}) {
  const out = o.out || path.join(process.cwd(), 'out', 'quote.png');
  const w = o.w || 1080;
  const h = o.h || 1080;
  const bg = o.bg || '#111827';
  const qColor = o.quoteColor || 'white';
  ensureDir(out);
  // This static ffmpeg build has no drawtext wrap_width; wrap manually.
  const maxChars = Math.max(8, Math.floor((w * 0.8) / (w * 0.06 * 0.55)));
  const wrapped = wrapText(o.quote || 'A great quote.', maxChars).join('\\n');
  const quoteEsc = wrapped.replace(/:/g, '\\:').replace(/'/g, "'\\\\''");
  const author = (o.author || '').replace(/:/g, '\\:');
  const fs_ = [
    dt(`text='${quoteEsc}':fontcolor=${qColor}:fontsize=${Math.round(w * 0.06)}:x=(w-text_w)/2:y=(h-text_h)/2:box=0`),
  ];
  if (author) {
    fs_.push(dt(`text='— ${author}':fontcolor=gray:fontsize=${Math.round(w * 0.04)}:x=(w-text_w)/2:y=(h-text_h)/2+${Math.round(w * 0.1)}:box=0`));
  }
  ff([
    '-f', 'lavfi', '-i', `color=c=${bg.replace('#', '0x')}:s=${w}x${h}:d=1`,
    '-vf', fs_.join(','),
    '-frames', '1', '-y', out,
  ]);
  if (!waitFile(out)) throw new Error('quote card not produced: ' + out);
  return out;
}

/** Greedy word-wrap to ~maxChars per line (no external deps). */
function wrapText(text, maxChars) {
  const words = String(text).split(/\s+/);
  const lines = [];
  let line = '';
  for (const word of words) {
    if (!line) { line = word; continue; }
    if ((line + ' ' + word).length <= maxChars) line += ' ' + word;
    else { lines.push(line); line = word; }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [String(text)];
}

// ---------------------------------------------------------------------------
// VIDEO CLIPS (motion graphics)
// ---------------------------------------------------------------------------

/**
 * Ken-Burns zoom/pan over a still image -> short video clip.
 * @param {object} o { src, out, duration=4, zoom=1.15, w, h, fps=30 }
 */
function createKenBurnsClip(o = {}) {
  const out = o.out || path.join(process.cwd(), 'out', 'kenburns.mp4');
  const src = o.src;
  if (!src || !fs.existsSync(src)) throw new Error('ken-burns needs a src image: ' + src);
  const dur = o.duration || 4;
  const zoom = o.zoom || 1.15;
  const fps = o.fps || 30;
  ensureDir(out);
  // zoompan from z=1 to z=zoom over the duration, slow pan
  ff([
    '-i', src,
    '-vf', `scale=-2:1080,zoompan=z='min(${zoom},on/${Math.round(dur * fps)}*${zoom}+1)':d=${Math.round(dur * fps)}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=1080x1920:fps=${fps}`,
    '-t', String(dur), '-r', String(fps), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-y', out,
  ]);
  if (!waitFile(out)) throw new Error('ken-burns clip not produced: ' + out);
  return out;
}

/**
 * Kinetic typography clip: a phrase that scales/fades in over a colored bg.
 */
function createKineticTextClip(o = {}) {
  const out = o.out || path.join(process.cwd(), 'out', 'kinetic.mp4');
  const w = o.w || 1080;
  const h = o.h || 1920;
  const dur = o.duration || 3;
  const fps = o.fps || 30;
  const text = (o.text || 'Hello').replace(/:/g, '\\:');
  const bg = o.bg || '#0f172a';
  const color = o.color || 'white';
  ensureDir(out);
  const vf = dt(`text='${text}':fontcolor=${color}:fontsize=${Math.round(w * 0.09)}:x=(w-text_w)/2:y=(h-text_h)/2:enable='between(t,0,${dur})':alpha='if(lt(t,0.5),t/0.5,if(gt(t,${dur - 0.5}),(${dur}-t)/0.5,1))':shadowcolor=black@0.4:shadowx=2:shadowy=2`);
  ff([
    '-f', 'lavfi', '-i', `color=c=${bg.replace('#', '0x')}:s=${w}x${h}:d=${dur}`,
    '-vf', vf,
    '-t', String(dur), '-r', String(fps), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-y', out,
  ]);
  if (!waitFile(out)) throw new Error('kinetic clip not produced: ' + out);
  return out;
}

/**
 * Countdown clip (3..2..1) over a bg — useful for intros.
 */
function createCountdownClip(o = {}) {
  const out = o.out || path.join(process.cwd(), 'out', 'countdown.mp4');
  const w = o.w || 1080;
  const h = o.h || 1920;
  const from = o.from || 3;
  const fps = o.fps || 30;
  const bg = o.bg || '#000000';
  ensureDir(out);
  const vf = dt(`text='%{eif\\:${from}-trunc(t)\\:d}':fontcolor=white:fontsize=${Math.round(w * 0.3)}:x=(w-text_w)/2:y=(h-text_h)/2`);
  ff([
    '-f', 'lavfi', '-i', `color=c=${bg.replace('#', '0x')}:s=${w}x${h}:d=${from}`,
    '-vf', vf,
    '-t', String(from), '-r', String(fps), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-y', out,
  ]);
  if (!waitFile(out)) throw new Error('countdown clip not produced: ' + out);
  return out;
}

// ---------------------------------------------------------------------------
// AUDIO — BACKGROUND MUSIC (procedural, royalty-free)
// ---------------------------------------------------------------------------

/**
 * Generate a procedural ambient music loop (no samples, pure synthesis).
 * A soft pad: two detuned sine/triangle oscillators + slow amplitude envelope.
 * @param {object} o { out, duration=20, freq=220, type='sine'|'triangle', gain=0.2 }
 */
function createBackgroundMusic(o = {}) {
  const out = o.out || path.join(process.cwd(), 'out', 'bgm.wav');
  const dur = o.duration || 20;
  const f = o.freq || 220;
  const type = o.type || 'sine';
  const gain = o.gain || 0.2;
  ensureDir(out);
  // two oscillators (root + fifth) mixed, lowpassed, gain-limited
  ff([
    '-f', 'lavfi', '-i', `sine=frequency=${f}:duration=${dur}`,
    '-f', 'lavfi', '-i', `sine=frequency=${Math.round(f * 1.5)}:duration=${dur}`,
    '-filter_complex', `[0][1]amix=inputs=2,lowpass=f=1200,volume=${gain},atrim=0:${dur}[out]`,
    '-map', '[out]', '-c:a', 'pcm_s16le', '-y', out,
  ]);
  if (!waitFile(out)) throw new Error('background music not produced: ' + out);
  return out;
}

// ---------------------------------------------------------------------------
// AUDIO — SFX (procedural)
// ---------------------------------------------------------------------------

/**
 * Generate a sound effect. kind: whoosh | ding | impact | pop | click
 * @param {object} o { out, kind='whoosh', duration }
 */
function createSfx(o = {}) {
  const kind = o.kind || 'whoosh';
  const out = o.out || path.join(process.cwd(), 'out', `sfx_${kind}.wav`);
  const dur = o.duration || (kind === 'whoosh' ? 0.6 : kind === 'impact' ? 0.3 : 0.15);
  ensureDir(out);
  let filter;
  switch (kind) {
    case 'whoosh':
      filter = `aevalsrc='0.4*sin(2*PI*600*t)*exp(-3*t)'`;
      break;
    case 'ding':
      filter = `sine=frequency=1320:duration=${dur},volume=0.4`;
      break;
    case 'impact':
      filter = `sine=frequency=80:duration=${dur},lowpass=f=200,volume=0.6`;
      break;
    case 'pop':
      filter = `aevalsrc='0.4*sin(2*PI*400*t)*exp(-12*t)'`;
      break;
    case 'click':
      filter = `sine=frequency=2000:duration=0.04,volume=0.3`;
      break;
    default:
      throw new Error('unknown sfx kind: ' + kind);
  }
  ff([
    '-f', 'lavfi', '-i', filter,
    '-t', String(dur), '-c:a', 'pcm_s16le', '-y', out,
  ]);
  if (!waitFile(out)) throw new Error('sfx not produced: ' + kind);
  return out;
}

// ---------------------------------------------------------------------------
// GIF
// ---------------------------------------------------------------------------

/**
 * Create an animated GIF from a source clip (or from a still with ken-burns).
 * @param {object} o { src, out, duration, w=480, fps=12 }
 */
function createGif(o = {}) {
  const out = o.out || path.join(process.cwd(), 'out', 'clip.gif');
  const src = o.src;
  if (!src || !fs.existsSync(src)) throw new Error('gif needs a src: ' + src);
  const w = o.w || 480;
  const fps = o.fps || 12;
  ensureDir(out);
  ff([
    '-i', src,
    '-vf', `fps=${fps},scale=${w}:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse`,
    '-y', out,
  ]);
  if (!waitFile(out)) throw new Error('gif not produced: ' + out);
  return out;
}

// ---------------------------------------------------------------------------
// PLACEHOLDER (branded fallback)
// ---------------------------------------------------------------------------

/**
 * Branded placeholder image (used when stock download fails — the AVG
 * "bright placeholder" spirit, but styled, not flat).
 * @param {object} o { out, label, w, h, bg, fg }
 */
function createPlaceholder(o = {}) {
  const out = o.out || path.join(process.cwd(), 'out', 'placeholder.png');
  const w = o.w || 1080;
  const h = o.h || 1920;
  const bg = o.bg || '#1d4ed8';
  const fg = o.fg || 'white';
  const label = (o.label || 'No image').replace(/:/g, '\\:');
  ensureDir(out);
  ff([
    '-f', 'lavfi', '-i', `color=c=${bg.replace('#', '0x')}:s=${w}x${h}:d=1`,
    '-vf', dt(`text='${label}':fontcolor=${fg}:fontsize=${Math.round(w * 0.07)}:x=(w-text_w)/2:y=(h-text_h)/2:box=1:boxcolor=${bg.replace('#', '0x')}@0.6:boxborderw=20`),
    '-frames', '1', '-y', out,
  ]);
  if (!waitFile(out)) throw new Error('placeholder not produced: ' + out);
  return out;
}

module.exports = {
  ff,
  createBackgroundImage,
  createTitleCard,
  createQuoteCard,
  createKenBurnsClip,
  createKineticTextClip,
  createCountdownClip,
  createBackgroundMusic,
  createSfx,
  createGif,
  createPlaceholder,
};
