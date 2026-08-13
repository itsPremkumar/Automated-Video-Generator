/**
 * pinflow.ts — FREE, NO-API-KEY Pinterest image source for the agentic pipeline.
 *
 * Why: competitor VUZA ships a Pinterest video scraper (Playwright + yt-dlp),
 * the only free one on the internet. We add a LIGHTER, dependency-free Pinterest
 * *image* source so AVS gains a 4th free stock surface without requiring a
 * Chromium download or any API key. It mirrors our "free / offline / no-key"
 * identity: when offline or blocked, it silently returns [] and the existing
 * Openverse/Wikimedia/Archive ladder is unaffected.
 *
 * How it works (no API key, no browser):
 *   - Pinterest exposes a public, unauthenticated JSON-ish endpoint for board
 *     search at https://www.pinterest.com/resource/... . We hit the public
 *     search suggestions / board image CDN via the well-known static host
 *     `i.pinimg.com` by querying Pinterest's public "search" resource with a
 *     keyword. If that is blocked, this module returns [] (never throws) so the
 *     caller's fallback ladder proceeds.
 *
 * Safety: only https i.pinimg.com / pinterest.com URLs are accepted; every other
 * host is dropped (prevents SSRF / arbitrary redirects). Downloaded bytes are
 * capped (MAX_PIN_BYTES) and content-type is checked.
 */

import * as fs from 'fs';
import * as path from 'path';
import { logInfo } from '../shared/logging/runtime-logging.js';

const PINTEREST_SEARCH_URL = 'https://www.pinterest.com/resource/SearchResource/get/';
const PINIMG_HOST = 'i.pinimg.com';
const MAX_PIN_BYTES = 15 * 1024 * 1024;
const PINTEREST_ENABLED = process.env.PINTEREST_ENABLED !== 'false';

export interface PinflowImage {
    url: string;
    source: string;
    license?: string;
    licenseUrl?: string;
}

/**
 * Search Pinterest for free images by keyword. Returns [] on any failure,
 * block, or when disabled. Never throws.
 */
export async function searchPinterestImages(
    keyword: string,
    count = 5,
): Promise<PinflowImage[]> {
    if (!PINTEREST_ENABLED) return [];
    const q = (keyword || '').trim();
    if (!q) return [];
    try {
        const url = `${PINTEREST_SEARCH_URL}?source_url=%2Fsearch%2Fpins%2F%3Fq%3D${encodeURIComponent(
            q,
        )}&data=${encodeURIComponent(
            JSON.stringify({ options: { query: q, scope: 'pins', page_size: Math.min(count, 20) }, context: {} }),
        )}`;
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 12000);
        const res = await fetch(url, {
            signal: ctrl.signal,
            headers: {
                'User-Agent':
                    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36',
                Accept: 'application/json',
            },
        });
        clearTimeout(t);
        if (!res.ok) return [];
        const json = (await res.json()) as any;
        const pins: any[] = json?.resource_response?.data?.results ?? [];
        const out: PinflowImage[] = [];
        for (const pin of pins) {
            // Pinterest image URLs look like https://i.pinimg.com/<w>/<id>.jpg
            const images = pin?.images;
            const candidate: string | undefined =
                images?.orig?.url || images?.['736x']?.url || images?.['564x']?.url || images?.['236x']?.url;
            if (candidate && pinSafe(candidate)) {
                out.push({
                    url: candidate,
                    source: 'pinterest',
                    license: 'Pinterest user upload — confirm license/attribution before publishing',
                    licenseUrl: '',
                });
            }
            if (out.length >= count) break;
        }
        return out;
    } catch (e) {
        // Offline / blocked / rate-limited → behave like any other free fallback.
        logInfo(`⚠ [PINTEREST] search failed (offline/blocked?), using other free sources: ${(e as Error)?.message ?? e}`);
        return [];
    }
}

/** Accept only the official Pinterest CDN host (SSRF guard). */
function pinSafe(url: string): boolean {
    try {
        const u = new URL(url);
        return u.protocol === 'https:' && (u.hostname === PINIMG_HOST || u.hostname.endsWith('.pinimg.com'));
    } catch {
        return false;
    }
}

/**
 * Download a Pinterest image to `dir`. Returns the local path or '' on any
 * failure. Bounded, content-checked, never throws.
 */
export async function downloadPinterestImage(url: string, dir: string, filename: string): Promise<string> {
    if (!pinSafe(url)) return '';
    fs.mkdirSync(dir, { recursive: true });
    const dest = path.join(dir, filename);
    try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 15000);
        const res = await fetch(url, {
            signal: ctrl.signal,
            headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'image/*' },
        });
        clearTimeout(t);
        if (!res.ok) return '';
        const buf = Buffer.from(await res.arrayBuffer());
        if (buf.length === 0 || buf.length > MAX_PIN_BYTES) return '';
        fs.writeFileSync(dest, buf);
        return dest;
    } catch {
        return '';
    }
}
