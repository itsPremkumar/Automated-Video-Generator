/**
 * verify-download-sources.ts (v3)
 * EMPIRICAL test: download 1 image + 1 video from EACH source using the
 * project's REAL fetchers. Loads .env so keyed providers are exercised.
 * Per-source 45s timeout so one slow source can't hang the run.
 */
import * as fs from 'fs';
import * as path from 'path';
import { config as loadEnv } from 'dotenv';
loadEnv();
import { freeImageAdapter } from '../src/lib/free-image/index.js';
import { FreeVideoAdapter } from '../src/lib/free-video/adapter.js';
import { runBulkImageFetch } from '../src/agentic/operations/bulk-fetch.js';
import { searchPexelsImages, searchPexelsVideos, pexelsKeyPresent } from '../src/lib/pexels.js';
import { downloadMedia, searchImages, fetchVisualsForScene } from '../src/lib/visual-fetcher/index.js';

const BASE = path.resolve(__dirname, '..');
const OUT = path.join(BASE, 'workspace', 'verify-downloads');
fs.mkdirSync(OUT, { recursive: true });
const results: Array<{ source: string; media: string; status: string; bytes: number; note: string }> = [];
const withTimeout = <T,>(p: Promise<T>, ms: number, label: string): Promise<T> =>
  Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error('timeout ' + ms + 'ms')), ms))]);

async function dl(url: string, dir: string, name: string): Promise<string | null> {
  try { const r = await downloadMedia(url, dir, name); return r.path ?? null; } catch { return null; }
}
async function rec(source: string, media: string, p: Promise<{ file?: string | null; note?: string }>) {
  try {
    const r: any = await withTimeout(p, 120000, source + ':' + media);
    const fp = r.file;
    const bytes = fp && fs.existsSync(fp) ? fs.statSync(fp).size : 0;
    const ok = media === 'image' ? bytes > 1000 : bytes > 5000;
    results.push({ source, media, status: ok ? 'PASS' : 'FAIL', bytes, note: fp ? path.basename(fp) : (r.note ?? 'no file') });
  } catch (e: any) {
    results.push({ source, media, status: 'ERROR', bytes: 0, note: (e?.message ?? String(e)).slice(0, 70) });
  }
}

async function main() {
  console.log('Empirical download test (live .env keys + free CC fallback)\n');
  console.log('PEXELS present:', pexelsKeyPresent(), '| PIXABAY:', !!process.env.PIXABAY_API_KEY, '| OPENVERSE:', process.env.OPENVERSE_ENABLED);

  // IMAGES
  await rec('pexels(image/keyed)', 'image', (async () => {
    const r = await searchPexelsImages('ocean', 1);
    if (!r.length) return { note: 'empty' };
    const dir = path.join(OUT, 'pexels-img'); fs.mkdirSync(dir, { recursive: true });
    return { file: await dl(r[0].downloadUrl, dir, 'p.jpg'), note: r[0].provider };
  })());
  await rec('keyed-bulk(image)', 'image', (async () => {
    const dir = path.join(OUT, 'img-keyed'); fs.mkdirSync(dir, { recursive: true });
    const f = await runBulkImageFetch('ocean waves', 1, dir);
    return { file: f[0] };
  })());
  await rec('free-image(wiki/archive/nasa/met)', 'image', (async () => {
    const dir = path.join(OUT, 'img-free'); fs.mkdirSync(dir, { recursive: true });
    const best = await freeImageAdapter.searchBest('mountain landscape');
    if (!best) return { note: 'empty' };
    return { file: await dl(best.downloadUrl, dir, 'free.jpg'), note: best.provider };
  })());
  await rec('searchImages(openverse/pexels)', 'image', (async () => {
    const r = await searchImages('sunset beach', 3, 1, 'portrait', 1);
    if (!r.length) return { note: 'empty' };
    const dir = path.join(OUT, 'img-search'); fs.mkdirSync(dir, { recursive: true });
    return { file: await dl(r[0].url, dir, 's.jpg'), note: 'searchImages' };
  })());

  // VIDEOS
  await rec('pexels(video/keyed)', 'video', (async () => {
    const r = await searchPexelsVideos('city', 1);
    if (!r.length) return { note: 'empty' };
    const dir = path.join(OUT, 'pexels-vid'); fs.mkdirSync(dir, { recursive: true });
    return { file: await dl(r[0].downloadUrl, dir, 'p.mp4'), note: r[0].provider };
  })());
  await rec('free-video(wiki/archive)', 'video', (async () => {
    const dir = path.join(OUT, 'vid-free'); fs.mkdirSync(dir, { recursive: true });
    const o = await new FreeVideoAdapter().searchAndDownloadFirst('nature forest', dir);
    return { file: o?.localPath, note: o?.source };
  })());
  await rec('fetchVisualsForScene(video)', 'video', (async () => {
    const r: any = await fetchVisualsForScene(['waterfall nature'], true, 'portrait');
    if (!r) return { note: 'null' };
    const asset = Array.isArray(r) ? r[0] : r;
    if (!asset?.url) return { note: 'no url' };
    const dir = path.join(OUT, 'vid-fvs'); fs.mkdirSync(dir, { recursive: true });
    return { file: await dl(asset.url, dir, 'f.mp4'), note: asset.photographer ?? 'fvs' };
  })());

  console.log('\n=== DOWNLOAD SOURCE TEST RESULTS ===');
  console.log('source'.padEnd(30), 'media'.padEnd(7), 'status'.padEnd(7), 'bytes'.padEnd(10), 'note');
  for (const r of results)
    console.log(r.source.padEnd(30), r.media.padEnd(7), r.status.padEnd(7), String(r.bytes).padEnd(10), r.note);
  const pass = results.filter((r) => r.status === 'PASS').length;
  console.log(`\nPASS: ${pass}/${results.length}`);
}

main().catch((e) => { console.error('FATAL', e); process.exit(1); });
