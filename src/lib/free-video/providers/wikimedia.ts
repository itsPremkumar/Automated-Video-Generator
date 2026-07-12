import { createHttpClient, getJson } from '../http-client.js';
import { withRetry } from '../utils.js';
import { SearchFilters, VideoFormat, VideoProvider, VideoResult } from '../models.js';

interface CommonsExtMetadataField {
    value: string;
}
interface CommonsExtMetadata {
    LicenseShortName?: CommonsExtMetadataField;
    LicenseUrl?: CommonsExtMetadataField;
    Artist?: CommonsExtMetadataField;
    Credit?: CommonsExtMetadataField;
}

interface CommonsImageInfo {
    url?: string;
    descriptionurl?: string;
    size?: number;
    width?: number;
    height?: number;
    duration?: number;
    mime?: string;
    extmetadata?: CommonsExtMetadata;
}

interface CommonsPage {
    pageid: number;
    title: string;
    imageinfo?: CommonsImageInfo[];
}

interface CommonsQueryResponse {
    query?: { pages?: Record<string, CommonsPage> };
}

const COMMONS_API_URL = 'https://commons.wikimedia.org/w/api.php';

function stripHtml(input: string | undefined): string {
    if (!input) return 'Unknown';
    const stripped = input.replace(/<[^>]*>/g, '').trim();
    return stripped.length > 0 ? stripped : 'Unknown';
}

function mimeToFormat(mime: string | undefined): VideoFormat {
    if (!mime) return 'unknown';
    if (mime.includes('mp4')) return 'mp4';
    if (mime.includes('webm')) return 'webm';
    if (mime.includes('ogg') || mime.includes('ogv')) return 'ogg';
    return 'unknown';
}

export class WikimediaProvider implements VideoProvider {
    public readonly name = 'Wikimedia Commons' as const;
    private readonly client;

    constructor() {
        this.client = createHttpClient(30000);
    }

    public async search(filters: SearchFilters): Promise<VideoResult[]> {
        const gsrlimit = Math.min(Math.max(filters.count * 2, 10), 50);
        const offset = ((filters.page ?? 1) - 1) * gsrlimit;

        const data = await withRetry(
            () =>
                getJson<CommonsQueryResponse>(this.client, COMMONS_API_URL, {
                    action: 'query',
                    format: 'json',
                    generator: 'search',
                    gsrsearch: `filetype:video ${filters.keyword}`,
                    gsrnamespace: 6,
                    gsrlimit,
                    gsroffset: offset || undefined,
                    prop: 'imageinfo',
                    iiprop: 'url|size|mime|extmetadata|metadata',
                    formatversion: 2,
                }),
            { retries: 3, baseDelayMs: 2000, label: 'Wikimedia search' },
        );

        const pages = data.query?.pages;
        if (!pages) return [];

        const results: VideoResult[] = [];
        for (const key of Object.keys(pages)) {
            const page = pages[key];
            const info = page.imageinfo?.[0];
            if (!info?.url) continue;

            const format = mimeToFormat(info.mime);
            if (info.mime && !info.mime.startsWith('video/')) continue;

            const meta = info.extmetadata ?? {};
            const license = stripHtml(meta.LicenseShortName?.value) || 'Unknown';
            const licenseUrl = meta.LicenseUrl?.value ?? '';
            const creator = stripHtml(meta.Artist?.value) || stripHtml(meta.Credit?.value);
            const title = page.title.replace(/^File:/, '').replace(/\.[^/.]+$/, '');

            results.push({
                id: String(page.pageid),
                title,
                creator,
                license,
                licenseUrl,
                provider: this.name,
                downloadUrl: info.url,
                thumbnailUrl: null,
                durationSeconds: typeof info.duration === 'number' ? info.duration : null,
                resolution: info.width && info.height ? `${info.width}x${info.height}` : null,
                fileSizeBytes: typeof info.size === 'number' ? info.size : null,
                format,
                sourcePageUrl:
                    info.descriptionurl ?? `https://commons.wikimedia.org/wiki/${encodeURIComponent(page.title)}`,
            });

            if (results.length >= filters.count) break;
        }

        return this.applyFilters(results, filters);
    }

    private applyFilters(results: VideoResult[], filters: SearchFilters): VideoResult[] {
        let filtered = results;

        if (filters.license) {
            const wanted = filters.license.toLowerCase();
            filtered = filtered.filter((v) => v.license.toLowerCase().includes(wanted));
        }
        if (filters.minDurationSeconds !== undefined) {
            filtered = filtered.filter(
                (v) => v.durationSeconds !== null && v.durationSeconds >= filters.minDurationSeconds!,
            );
        }
        if (filters.maxDurationSeconds !== undefined) {
            filtered = filtered.filter(
                (v) => v.durationSeconds !== null && v.durationSeconds <= filters.maxDurationSeconds!,
            );
        }
        if (filters.maxFileSizeBytes !== undefined) {
            filtered = filtered.filter((v) => v.fileSizeBytes !== null && v.fileSizeBytes <= filters.maxFileSizeBytes!);
        }
        if (filters.minResolutionHeight !== undefined || filters.hdOnly) {
            const minHeight = filters.hdOnly ? 720 : filters.minResolutionHeight!;
            filtered = filtered.filter((v) => {
                if (!v.resolution) return false;
                const height = parseInt(v.resolution.split('x')[1] ?? '0', 10);
                return height >= minHeight;
            });
        }

        filtered = this.sortResults(filtered, filters.sortBy);
        return filtered.slice(0, filters.count);
    }

    private sortResults(results: VideoResult[], sortBy?: SearchFilters['sortBy']): VideoResult[] {
        if (sortBy === 'resolution') {
            return [...results].sort((a, b) => {
                const heightA = a.resolution ? parseInt(a.resolution.split('x')[1] ?? '0', 10) : 0;
                const heightB = b.resolution ? parseInt(b.resolution.split('x')[1] ?? '0', 10) : 0;
                return heightB - heightA;
            });
        }
        return results;
    }
}
