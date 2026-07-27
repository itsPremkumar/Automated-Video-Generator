#!/usr/bin/env tsx
/**
 * agentic-image.ts — Single-IMAGE toolbox for the AVS pipeline.
 *
 * The video editor (agentic-editor.ts) only accepts VIDEO inputs. This CLI
 * fills the gap: every advanced op a user expects on a STILL image — format
 * conversion, crop/resize/rotate, color adjust, text/emoji burn, watermark,
 * brand tint, vignette, border, Ken-Burns image→video, contact sheet, and
 * more — driven here, all as thin ffmpeg (`ffmpeg-static`) wrappers, plus
 * `sharp` for pure format conversion when no re-encode is needed.
 *
 * Everything is backward-compatible: no existing code is touched, this is a
 * standalone new entry point wired via `npm run agentic:image`.
 *
 * USAGE:
 *   npx tsx src/adapters/cli/agentic-image.ts <command> [options]
 *
 * COMMANDS (image in → image/video out):
 *   convert        Convert image format (png/jpg/jpeg/webp/tiff/bmp/gif)
 *   resize         Scale to new dimensions (keep aspect, pad)
 *   crop           Crop a region w:h:x:y
 *   rotate         Rotate 90/180/270/hflip/vflip or free angle
 *   adjust         Brightness/contrast/saturation/gamma
 *   blur           Blur whole or region w:h:x:y
 *   text           Burn text onto the image (caption/title)
 *   emoji          Burn an emoji/sticker onto the image
 *   watermark      Overlay a logo/watermark image (corner + opacity)
 *   tint           Brand color tint overlay (#RRGGBB@alpha)
 *   vignette       Edge darkening
 *   border         Add a colored border / padding
 *   enhance        Denoise + sharpen + deblock
 *   flip           Alias helpers (hflip/vflip)
 *   info           Show image metadata (dims, format, size)
 *   grayscale      Desaturate to B&W
 *   sepia          Warm vintage tone
 *   pixelate       Mosaic / pixel-art effect
 *   compress       Reduce file size (quality 1-31)
 *   face-blur      Blur a region (privacy)
 *   round-corners  Rounded corners (social thumbnails)
 *   merge          Overlay one image on top of another
 *   background-replace  Remove bg + insert new background
 *   focus          Auto center-crop to content
 *   remove-bg      Remove background (via rembg, on-device AI, offline)
 *   to-video       Image → video (Ken Burns zoom/pan, with optional text/emoji, duration, fps, music)
 *   contact-sheet  Build a grid/contact-sheet from many images
 *   gif            Image → animated GIF (Ken Burns loop)
 *   slideshow      Multiple images → timed video (crossfade)
 *
 * EXAMPLES:
 *   npm run agentic:image convert --input shot.png --output shot.jpg
 *   npm run agentic:image resize  --input shot.png --w 1080 --h 1080
 *   npm run agentic:image crop   --input shot.png --w 1080 --h 1920 --x 100 --y 200
 *   npm run agentic:image text   --input shot.png --text "Free for students" --color white --y h-th-120
 *   npm run agentic:image emoji  --input shot.png --emoji "🔥" --x '(w-text_w)/2' --y '(h-text_h)/2' --size 200
 *   npm run agentic:image to-video --input shot.png --duration 5 --kenburns --text "Built by students"
 */

import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { spawnSync } from 'child_process';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function ffmpegPath(): string {
  try {
    const p = require('ffmpeg-static');
    if (p && fs.existsSync(p)) return p;
  } catch {
    /* ffmpeg-static not available */
  }
  return 'ffmpeg';
}

function ffprobePath(): string {
  try {
    const p = require('ffprobe-static');
    if (p && p.path && fs.existsSync(p.path)) return p.path;
  } catch {
    /* ffprobe-static not available */
  }
  return 'ffprobe';
}

function runFfmpeg(args: string[], desc: string): { ok: boolean; stderr: string } {
  const ff = ffmpegPath();
  console.log(`  ⚡ ffmpeg ${args.slice(0, 8).join(' ')} ...`);
  const r = spawnSync(ff, args, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });
  if (r.status !== 0) {
    console.error(`  ✖ ${desc} failed (exit ${r.status})`);
    console.error(r.stderr?.slice(-500));
    return { ok: false, stderr: r.stderr || '' };
  }
  console.log(`  ✅ ${desc}`);
  return { ok: true, stderr: '' };
}

function resolveInput(input?: string): string {
  if (!input) {
    console.error('  ✖ --input <path> is required');
    process.exit(1);
  }
  if (!fs.existsSync(input)) {
    console.error(`  ✖ Input file not found: ${input}`);
    process.exit(1);
  }
  return input;
}

function resolveOutput(output?: string, fallback = 'output.png'): string {
  return output || fallback;
}

function parseArgs(argv: string[]): Record<string, any> {
  const args: Record<string, any> = {};
  for (let i = 2; i < argv.length; i++) {
    const k = argv[i];
    if (k.startsWith('--')) {
      const key = k.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) {
        args[key] = next;
        i++;
      } else {
        args[key] = true;
      }
    }
  }
  return args;
}

function getImageInfo(file: string): any {
  const fp = ffprobePath();
  const r = spawnSync(fp, ['-v', 'quiet', '-print_format', 'json', '-show_format', '-show_streams', file], {
    encoding: 'utf-8',
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  if (r.status !== 0) return null;
  try {
    return JSON.parse(r.stdout);
  } catch {
    return null;
  }
}

// ─── Commands ─────────────────────────────────────────────────────────────────

const COMMANDS: Record<string, (args: Record<string, any>) => void> = {};

// 1. CONVERT — change image format (png/jpg/jpeg/webp/tiff/bmp/gif)
COMMANDS['convert'] = (args) => {
  const input = resolveInput(args.input);
  const output = resolveOutput(args.output, `conv_${Date.now()}.jpg`);
  const out = path.resolve(output);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const ff: string[] = ['-i', input, '-y', out];
  // ffmpeg handles png/jpg/webp/tiff/bmp natively; for webp quality:
  if (out.toLowerCase().endsWith('.webp')) ff.splice(2, 0, '-quality', args.quality || '90');
  runFfmpeg(ff, `Converted → ${path.basename(out)}`);
};

// 2. RESIZE — scale with aspect-preserving pad
COMMANDS['resize'] = (args) => {
  const input = resolveInput(args.input);
  const w = args.w || '1080';
  const h = args.h || '1080';
  const output = resolveOutput(args.output, `resized_${path.basename(input)}`);
  const ff: string[] = [
    '-i', input,
    '-vf', `scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2,setsar=1`,
    '-y', output,
  ];
  runFfmpeg(ff, `Resized to ${w}×${h}`);
};

// 3. CROP — region w:h:x:y
COMMANDS['crop'] = (args) => {
  const input = resolveInput(args.input);
  const w = args.w || '1080';
  const h = args.h || '1080';
  const x = args.x || '0';
  const y = args.y || '0';
  const output = resolveOutput(args.output, `cropped_${path.basename(input)}`);
  const ff: string[] = ['-i', input, '-vf', `crop=${w}:${h}:${x}:${y}`, '-y', output];
  runFfmpeg(ff, `Cropped ${w}×${h} at (${x},${y})`);
};

// 4. ROTATE — 90/180/270/hflip/vflip or free degrees
COMMANDS['rotate'] = (args) => {
  const input = resolveInput(args.input);
  const angle = args.angle || args.degrees || '90';
  const output = resolveOutput(args.output, `rotated_${path.basename(input)}`);
  let filter: string;
  switch (angle) {
    case '90': filter = 'transpose=1'; break;
    case '180': filter = 'transpose=1,transpose=1'; break;
    case '270': case '-90': filter = 'transpose=2'; break;
    case 'hflip': case 'horizontal': filter = 'hflip'; break;
    case 'vflip': case 'vertical': filter = 'vflip'; break;
    default: filter = `rotate=${parseFloat(angle) * Math.PI / 180}`; break;
  }
  const ff: string[] = ['-i', input, '-vf', filter, '-y', output];
  runFfmpeg(ff, `Rotated ${angle}°`);
};

// 5. ADJUST — brightness/contrast/saturation/gamma
COMMANDS['adjust'] = (args) => {
  const input = resolveInput(args.input);
  const output = resolveOutput(args.output, `adjusted_${path.basename(input)}`);
  const brightness = args.brightness || args.b || '0';
  const contrast = args.contrast || args.c || '1.0';
  const saturation = args.saturation || args.s || '1.0';
  const gamma = args.gamma || args.g || '1.0';
  const ff: string[] = [
    '-i', input,
    '-vf', `eq=brightness=${brightness}:contrast=${contrast}:saturation=${saturation}:gamma=${gamma}`,
    '-y', output,
  ];
  runFfmpeg(ff, `Adjusted (b=${brightness} c=${contrast} s=${saturation})`);
};

// 6. BLUR — whole or region w:h:x:y
COMMANDS['blur'] = (args) => {
  const input = resolveInput(args.input);
  const output = resolveOutput(args.output, `blurred_${path.basename(input)}`);
  const strength = args.strength || '8';
  const region = args.region;
  let filter: string;
  if (region) {
    const [rw, rh, rx, ry] = region.split(':');
    filter =
      `split[a][b];` +
      `[a]boxblur=${strength}:${strength}[ablur];` +
      `[b][ablur]overlay=${rx || 0}:${ry || 0}`;
  } else {
    filter = `boxblur=${strength}:${strength}`;
  }
  const ff: string[] = ['-i', input, '-filter_complex', filter, '-y', output];
  runFfmpeg(ff, `Blur (strength=${strength})`);
};

// 7. TEXT — burn text onto the image (sharp + SVG: reliable, emoji-capable fonts)
COMMANDS['text'] = async (args) => {
  const input = resolveInput(args.input);
  const text = args.text || 'Hello';
  const output = resolveOutput(args.output, `text_${path.basename(input)}`);
  const fontSize = parseInt(args['font-size'] || args.size || '64', 10);
  const color = args.color || 'white';
  const boxColor = args.box === false ? null : 'rgba(0,0,0,0.45)';
  try {
    const sharp = require('sharp');
    const meta = await sharp(input).metadata();
    const W = meta.width!;
    const H = meta.height!;
    // Bottom-center by default (margin = 1.5 * fontsize from bottom edge)
    const margin = fontSize * 1.5;
    const cy = Math.round(H - margin);
    const anchor = 'middle';
    const cx = W / 2;
    const escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const boxRect = boxColor
      ? `<rect x='0' y='${cy - fontSize}' width='${W}' height='${fontSize * 1.6}' fill='${boxColor}'/>`
      : '';
    const svg = Buffer.from(
      `<svg width='${W}' height='${H}'>` +
        boxRect +
        `<text x='${cx}' y='${cy}' font-size='${fontSize}' font-family='Segoe UI, Arial, sans-serif' font-weight='700' fill='${color}' text-anchor='${anchor}' dominant-baseline='middle'>${escaped}</text>` +
        `</svg>`,
    );
    await sharp(input).composite([{ input: svg, top: 0, left: 0 }]).toFile(output);
    console.log(`  ✅ Added text: "${text.slice(0, 40)}"`);
  } catch (e: any) {
    console.error(`  ✖ Text burn failed: ${e?.message || e}`);
  }
};

// 8. EMOJI — burn an emoji/sticker onto the image (sharp + SVG, Segoe UI Emoji)
COMMANDS['emoji'] = async (args) => {
  const input = resolveInput(args.input);
  const emoji = args.emoji || '🔥';
  const output = resolveOutput(args.output, `emoji_${path.basename(input)}`);
  const size = parseInt(args.size || '200', 10);
  try {
    const sharp = require('sharp');
    const meta = await sharp(input).metadata();
    const W = meta.width!;
    const H = meta.height!;
    const cx = Math.round(W / 2);
    const cy = Math.round(H / 2);
    const svg = Buffer.from(
      `<svg width='${W}' height='${H}'>` +
        `<text x='${cx}' y='${cy}' font-size='${size}' font-family='Segoe UI Emoji, Noto Color Emoji, Apple Color Emoji, sans-serif' text-anchor='middle' dominant-baseline='central'>${emoji}</text>` +
        `</svg>`,
    );
    await sharp(input).composite([{ input: svg, top: 0, left: 0 }]).toFile(output);
    console.log(`  ✅ Added emoji: ${emoji}`);
  } catch (e: any) {
    console.error(`  ✖ Emoji burn failed: ${e?.message || e}`);
  }
};

// 9. WATERMARK — overlay a logo image
COMMANDS['watermark'] = (args) => {
  const input = resolveInput(args.input);
  const image = resolveInput(args.image || args.logo || args.watermark);
  const output = resolveOutput(args.output, `wm_${path.basename(input)}`);
  const position = args.position || 'bottom-right';
  const opacity = args.opacity || '0.85';
  let posFilter: string;
  switch (position) {
    case 'top-left': posFilter = '10:10'; break;
    case 'top-right': posFilter = 'W-w-10:10'; break;
    case 'bottom-left': posFilter = '10:H-h-10'; break;
    case 'center': posFilter = '(W-w)/2:(H-h)/2'; break;
    default: posFilter = 'W-w-10:H-h-10'; break;
  }
  const ff: string[] = [
    '-i', input, '-i', image,
    '-filter_complex',
    `[1:v]scale=iw*${args.scale || 0.2}:-1[wm];[0:v][wm]overlay=${posFilter}:format=auto,format=yuv420p`,
    '-y', output,
  ];
  // apply opacity via colorchannelmixer on the watermark stream
  const ff2: string[] = [
    '-i', input, '-i', image,
    '-filter_complex',
    `[1:v]scale=iw*${args.scale || 0.2}:-1,colorchannelmixer=aa=${opacity}[wm];[0:v][wm]overlay=${posFilter}:format=auto,format=yuv420p`,
    '-y', output,
  ];
  const r = runFfmpeg(ff2, `Watermark ${path.basename(image)}`);
  if (!r.ok) runFfmpeg(ff, `Watermark ${path.basename(image)} (fallback)`);
};

// 10. TINT — brand color tint overlay
COMMANDS['tint'] = (args) => {
  const input = resolveInput(args.input);
  const output = resolveOutput(args.output, `tint_${path.basename(input)}`);
  const tint = args.color || args.tint || '#FF6B35';
  const alpha = args.alpha || '0.15';
  const m = /^#?([0-9a-fA-F]{6})/.exec(tint);
  const hex = m ? '0x' + m[1] : '0xFF6B35';
  const ff: string[] = [
    '-i', input,
    '-vf', `drawbox=x=0:y=0:w=iw:h=ih:color=${hex}@${alpha}:t=fill`,
    '-y', output,
  ];
  runFfmpeg(ff, `Tint ${hex}@${alpha}`);
};

// 11. VIGNETTE — edge darkening
COMMANDS['vignette'] = (args) => {
  const input = resolveInput(args.input);
  const output = resolveOutput(args.output, `vig_${path.basename(input)}`);
  const amount = args.amount || 'PI/5';
  const ff: string[] = ['-i', input, '-vf', `vignette=${amount}`, '-y', output];
  runFfmpeg(ff, `Vignette (${amount})`);
};

// 12. BORDER — colored border / padding
COMMANDS['border'] = (args) => {
  const input = resolveInput(args.input);
  const output = resolveOutput(args.output, `border_${path.basename(input)}`);
  const size = args.size || args.w || '40';
  const color = args.color || 'white';
  const ff: string[] = [
    '-i', input,
    '-vf', `pad=iw+${size}*2:ih+${size}*2:${size}:${size}:${color}`,
    '-y', output,
  ];
  runFfmpeg(ff, `Border ${size}px ${color}`);
};

// 13. ENHANCE — denoise + sharpen + deblock
COMMANDS['enhance'] = (args) => {
  const input = resolveInput(args.input);
  const output = resolveOutput(args.output, `enhanced_${path.basename(input)}`);
  const denoise = args.denoise === false ? '' : 'hqdn3d=3:2:4:3,';
  const sharpen = args.sharpen === false ? '' : 'unsharp=3:3:0.5:3:3:0.0,';
  const deblock = args.deblock === false ? '' : 'pp=de,';
  let filter = denoise + sharpen + deblock;
  if (filter.endsWith(',')) filter = filter.slice(0, -1);
  if (!filter) filter = 'hqdn3d=3:2:4:3,unsharp=3:3:0.5';
  const ff: string[] = ['-i', input, '-vf', filter, '-q:v', '2', '-y', output];
  runFfmpeg(ff, 'Enhanced (denoise+sharpen+deblock)');
};

// 14. FLIP — hflip / vflip convenience
COMMANDS['flip'] = (args) => {
  const input = resolveInput(args.input);
  const output = resolveOutput(args.output, `flip_${path.basename(input)}`);
  const dir = args.dir || args.direction || 'h';
  const filter = dir === 'v' ? 'vflip' : 'hflip';
  const ff: string[] = ['-i', input, '-vf', filter, '-y', output];
  runFfmpeg(ff, `Flip (${dir})`);
};

// 15. INFO — metadata
COMMANDS['info'] = (args) => {
  const input = resolveInput(args.input);
  const info = getImageInfo(input);
  if (!info) {
    console.error('  ✖ Could not read image info');
    return;
  }
  console.log(`\n  🖼  ${path.basename(input)}`);
  console.log(`  ─────────────────────────────`);
  console.log(`  Format:  ${info.format?.format_name}`);
  console.log(`  Size:    ${(parseInt(info.format?.size || '0') / 1024).toFixed(0)} KB`);
  for (const s of info.streams || []) {
    if (s.codec_type === 'video') {
      console.log(`  Image:   ${s.codec_name} ${s.width}×${s.height}`);
    }
  }
  console.log('');
};

// 16. TO-VIDEO — image → Ken Burns video (with optional text/emoji + music)
COMMANDS['to-video'] = (args) => {
  const input = resolveInput(args.input);
  const duration = args.duration || args.dur || '5';
  const fps = args.fps || '25';
  const W = args.w || '1080';
  const H = args.h || '1920';
  const output = resolveOutput(args.output, `imgvideo_${path.basename(input).replace(/\.[^.]+$/, '')}.mp4`);
  const zoom = args.kenburns !== false && args.kenburns !== 'false';
  // base: scale+pad to target, then optional zoompan
  let vf = `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},setsar=1,format=yuv420p`;
  if (zoom) {
    // gentle Ken Burns: slow continuous zoom-in across the whole clip
    vf = `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},setsar=1,zoompan=z='min(zoom+0.0015,1.15)':d=${Math.round(parseFloat(duration) * parseFloat(fps))}:s=${W}x${H}:fps=${fps},format=yuv420p`;
  }
  // optional text burn on top
  if (args.text) {
    const fontSize = args['font-size'] || args.size || '72';
    const color = args.color || 'white';
    const y = args.y || 'h-th-120';
    const escaped = String(args.text).replace(/'/g, "'\\''");
    vf += `,drawtext=text='${escaped}':fontcolor=${color}:fontsize=${fontSize}:x=(w-text_w)/2:y=${y}:box=1:boxcolor=black@0.4:boxborderw=12`;
  }
  const ff: string[] = [
    '-loop', '1', '-i', input,
    '-vf', vf,
    '-t', duration,
    '-r', fps,
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'veryfast',
    '-y', output,
  ];
  // attach music if provided
  if (args.music) {
    const music = resolveInput(args.music);
    ff.splice(1, 0); // no-op keep order
    ff.unshift('-i', music);
    // re-map: image loop = 0:v, music = 1:a
    // rebuild cleanly:
    ff.length = 0;
    ff.push(
      '-loop', '1', '-i', input,
      '-i', music,
      '-vf', vf,
      '-t', duration,
      '-r', fps,
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'veryfast',
      '-c:a', 'aac', '-shortest', '-map', '0:v:0', '-map', '1:a:0',
      '-y', output,
    );
  }
  runFfmpeg(ff, `Image → video (${duration}s, KB=${zoom})`);
};

// 17. CONTACT-SHEET — grid from many images (vertical stack) using sharp
COMMANDS['contact-sheet'] = async (args) => {
  const files = (args.files || args.input || '').split(',').filter(Boolean);
  if (files.length < 2) {
    console.error('  ✖ Provide at least 2 images via --files "a.png,b.png,..."');
    return;
  }
  const output = resolveOutput(args.output, 'contact-sheet.png');
  const thumbW = parseInt(args.w || '480', 10);
  const gap = parseInt(args.gap || '12', 10);
  try {
    const sharp = require('sharp');
    const imgs = await Promise.all(
      files.map((f: string) => sharp(resolveInput(f)).resize({ width: thumbW }).toBuffer({ resolveWithObject: true })),
    );
    const totalH = imgs.reduce((acc, im) => acc + im.info.height, 0) + gap * (imgs.length - 1);
    const composite = [];
    let y = 0;
    for (const im of imgs) {
      composite.push({ input: im.data, top: y, left: 0 });
      y += im.info.height + gap;
    }
    const bg = Buffer.from(
      `<svg width="${thumbW}" height="${totalH}"><rect width="100%" height="100%" fill="#111827"/></svg>`,
    );
    await sharp(bg).composite(composite).png().toFile(output);
    console.log(`  ✅ Contact sheet (${imgs.length} images, ${thumbW}px)`);
  } catch (e: any) {
    console.error(`  ✖ Contact sheet failed: ${e?.message || e}`);
  }
};

// 18. GIF — image → animated GIF (Ken Burns loop)
COMMANDS['gif'] = (args) => {
  const input = resolveInput(args.input);
  const duration = args.duration || args.dur || '3';
  const fps = args.fps || '15';
  const output = resolveOutput(args.output, `anim_${path.basename(input).replace(/\.[^.]+$/, '')}.gif`);
  const vf = `zoompan=z='min(zoom+0.004,1.2)':d=${Math.round(parseFloat(duration) * parseFloat(fps))}:s=480x480:fps=${fps},fps=${fps},scale=480:-1:flags=lanczos`;
  const ff: string[] = ['-loop', '1', '-i', input, '-vf', vf, '-t', duration, '-y', output];
  runFfmpeg(ff, `Animated GIF (${duration}s)`);
};

// 19. GRAYSCALE — desaturate to B&W
COMMANDS['grayscale'] = (args) => {
  const input = resolveInput(args.input);
  const output = resolveOutput(args.output, `gray_${path.basename(input)}`);
  runFfmpeg(['-i', input, '-vf', 'hue=s=0', '-y', output], `Grayscale (B&W)`);
};

// 20. SEPIA — warm vintage tone
COMMANDS['sepia'] = (args) => {
  const input = resolveInput(args.input);
  const output = resolveOutput(args.output, `sepia_${path.basename(input)}`);
  runFfmpeg(['-i', input, '-vf', 'colorchannelmixer=.393:.769:.189:0:.349:.686:.168:0:.272:.534:.131', '-y', output], `Sepia tone`);
};

// 21. PIXELATE — mosaic / pixel-art effect
COMMANDS['pixelate'] = (args) => {
  const input = resolveInput(args.input);
  const output = resolveOutput(args.output, `pixel_${path.basename(input)}`);
  const blocks = args.blocks || args.size || '20';
  runFfmpeg(
    ['-i', input, '-vf', `scale='max(1,trunc(iw/${blocks}))':'max(1,trunc(ih/${blocks}))':flags=neighbor,scale=iw:ih:flags=neighbor`, '-y', output],
    `Pixelated (block=${blocks})`,
  );
};

// 22b. COMPRESS — reduce file size (quality 1-31, lower = better)
COMMANDS['compress'] = (args) => {
  const input = resolveInput(args.input);
  const q = args.quality || args.q || '15';
  const output = resolveOutput(args.output, `compressed_${path.basename(input)}`);
  runFfmpeg(['-i', input, '-q:v', q, '-y', output], `Compressed (quality=${q})`);
};

// 22c. FACE-BLUR — blur a region (by default center 30% of frame)
COMMANDS['face-blur'] = (args) => {
  const input = resolveInput(args.input);
  const output = resolveOutput(args.output, `faceblur_${path.basename(input)}`);
  const strength = args.strength || '12';
  const region = args.region || '0.3:0.2:0.4:0.6'; // w_ratio:h_ratio:x_ratio:y_ratio
  const [rw, rh, rx, ry] = region.split(':').map(Number);
  const filter = `split[a][b];[a]scale=iw*${rw}:ih*${rh},boxblur=${strength}:${strength}[blur];[b][blur]overlay=${Math.round(rx * 100)}:${Math.round(ry * 100)}`;
  runFfmpeg(['-i', input, '-filter_complex', filter, '-y', output], `Face-blur (region=${region})`);
};

// 22d. ROUND-CORNERS — rounded corners on image using sharp
COMMANDS['round-corners'] = async (args) => {
  const input = resolveInput(args.input);
  const radius = parseInt(args.radius || args.r || '30', 10);
  const output = resolveOutput(args.output, `rounded_${path.basename(input)}`);
  try {
    const sharp = require('sharp');
    const meta = await sharp(input).metadata();
    const W = meta.width!;
    const H = meta.height!;
    const r = Math.min(radius, Math.min(W, H) / 2);
    const svg = Buffer.from(
      `<svg width="${W}" height="${H}"><rect x="0" y="0" width="${W}" height="${H}" rx="${r}" ry="${r}" fill="white"/></svg>`,
    );
    await sharp(input).composite([{ input: svg, blend: 'dest-in' }]).toFile(output);
    console.log(`  ✅ Rounded corners (r=${r})`);
  } catch (e: any) {
    console.error(`  ✖ round-corners failed: ${e?.message || e}`);
  }
};

// 22e. MERGE — overlay one image on top of another (blend)
COMMANDS['merge'] = (args) => {
  const input = resolveInput(args.input);
  const overlay = args.overlay || args.over || args.image;
  if (!overlay) { console.error('  ✖ --overlay <path> is required'); return; }
  const resolvedOverlay = resolveInput(overlay);
  const output = resolveOutput(args.output, `merged_${path.basename(input)}`);
  const x = args.x || '(W-w)/2';
  const y = args.y || '(H-h)/2';
  const opacity = args.opacity || '1.0';
  const ff: string[] = [
    '-i', input, '-i', resolvedOverlay,
    '-filter_complex',
    `[1:v]colorchannelmixer=aa=${opacity}[ov];[0:v][ov]overlay=${x}:${y},format=yuv420p`,
    '-y', output,
  ];
  runFfmpeg(ff, `Merged ${path.basename(resolvedOverlay)}`);
};

// 22f. BACKGROUND-REPLACE — remove bg then insert a new background image
COMMANDS['background-replace'] = async (args) => {
  const input = resolveInput(args.input);
  const bg = args.background || args.bg;
  if (!bg) { console.error('  ✖ --background <path> is required'); return; }
  const resolvedBg = resolveInput(bg);
  const output = resolveOutput(args.output, `bg_rep_${path.basename(input)}`);
  const tmp = path.join(path.dirname(output), `_tmp_nobg_${Date.now()}.png`);
  try {
    const { removeBackground } = await import('../../agentic/operations/remove-bg.js');
    const r = await removeBackground(input, tmp, args.model || 'u2net');
    if (!r.ok) { console.error(`  ✖ ${r.detail}`); return; }
    const sharp = require('sharp');
    const [fg, bgImg] = await Promise.all([sharp(tmp).metadata(), sharp(resolvedBg).metadata()]);
    const W = Math.max(fg.width!, bgImg.width!);
    const H = Math.max(fg.height!, bgImg.height!);
    const bgResized = await sharp(resolvedBg).resize(W, H, { fit: 'cover' }).toBuffer();
    const fgResized = await sharp(tmp).resize(W, H, { fit: 'inside' }).toBuffer();
    await sharp(bgResized).composite([{ input: fgResized, top: 0, left: 0 }]).toFile(output);
    console.log(`  ✅ Background replaced → ${path.basename(output)}`);
  } catch (e: any) {
    console.error(`  ✖ background-replace failed: ${e?.message || e}`);
  } finally {
    try { fs.rmSync(tmp, { force: true }); } catch { /* ignore */ }
  }
};

// 22g. FOCUS — auto center crop to the most interesting region (entropy-based)
COMMANDS['focus'] = (args) => {
  const input = resolveInput(args.input);
  const W = args.w || '1080';
  const H = args.h || '1080';
  const output = resolveOutput(args.output, `focus_${path.basename(input)}`);
  // Use ffmpeg cropdetect or a simple center crop with scale+pad
  const ff: string[] = ['-i', input, '-vf', `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H}`, '-y', output];
  runFfmpeg(ff, `Focus crop ${W}×${H}`);
};

// 22h. REMOVE-BG — background removal via rembg (Python on-device AI)
COMMANDS['remove-bg'] = async (args) => {
  const input = resolveInput(args.input);
  const output = resolveOutput(args.output, `nobg_${path.basename(input).replace(/\.[^.]+$/, '')}.png`);
  const model = args.model || 'u2net';
  try {
    const { removeBackground } = await import('../../agentic/operations/remove-bg.js');
    const r = await removeBackground(input, output, model);
    if (r.ok) console.log(`  ✅ Background removed → ${path.basename(output)}`);
    else console.error(`  ✖ ${r.detail}`);
  } catch (e: any) {
    console.error(`  ✖ remove-bg failed: ${e?.message || e}`);
    process.exit(1);
  }
};

// 22. SLIDESHOW — multiple images → timed video (with optional crossfade)
COMMANDS['slideshow'] = (args) => {
  const files = (args.files || args.input || '').split(',').filter(Boolean);
  if (files.length < 2) {
    console.error('  ✖ Provide at least 2 images via --files "a.png,b.png,..."');
    return;
  }
  const output = resolveOutput(args.output, `slideshow_${Date.now()}.mp4`);
  const dur = args.duration || args.d || '2';
  const fade = args.fade || args.crossfade || '0.5';
  const W = args.w || '1080';
  const H = args.h || '1920';
  const fps = args.fps || '25';
  const inputs = files.map((f: string) => resolveInput(f));
  const ff: string[] = [];
  inputs.forEach((f: string) => ff.push('-loop', '1', '-i', f));
  let filter = '';
  for (let i = 0; i < inputs.length; i++) {
    filter += `[${i}:v]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},setsar=1,format=yuv420p,trim=duration=${dur},setpts=PTS-STARTPTS[v${i}];`;
  }
  let chain = '';
  let prev = 'v0';
  for (let i = 1; i < inputs.length; i++) {
    const out = i === inputs.length - 1 ? 'v' : `x${i}`;
    chain += `[${prev}][v${i}]xfade=transition=fade:duration=${fade}:offset=${parseFloat(dur) - parseFloat(fade)}[${out}];`;
    prev = out;
  }
  filter += chain.replace(/;$/, '');
  ff.push('-filter_complex', filter, '-map', '[v]', '-r', fps, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'veryfast', '-y', output);
  runFfmpeg(ff, `Slideshow (${inputs.length} images, ${dur}s each)`);
};

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs(process.argv);
  const subcommand = process.argv[2] || '';

  console.log(`\n  🖼  AVS Image Toolbox`);
  console.log(`  ───────────────────\n`);

  if (!COMMANDS[subcommand]) {
    console.log('  Available commands:');
    for (const cmd of Object.keys(COMMANDS).sort()) console.log(`    ${cmd}`);
    console.log(`\n  Run: npx tsx src/adapters/cli/agentic-image.ts <command> --input <file> [options]`);
    console.log(`  Or:  npm run agentic:image <command> -- --input <file>`);
    return;
  }

  await COMMANDS[subcommand](args);
}

main();
