import { createHttpClient, getJson } from '../http-client.js';
import { withRetry } from '../utils.js';
import { SearchFilters, VideoFormat, VideoProvider, VideoResult } from '../models.js';

interface ArchiveSearchDoc {
    identifier: string;
    title?: string;
    creator?: string | string[];
    licenseurl?: string;
    mediatype?: string;
    publicdate?: string;
}

interface ArchiveSearchResponse {
    response?: { docs?: ArchiveSearchDoc[]; numFound?: number };
}

interface ArchiveFile {
    name: string;
    format?: string;
    size?: string;
    length?: string;
    width?: string;
    height?: string;
    source?: string;
}

interface ArchiveMetadataResponse {
    metadata?: { title?: string; creator?: string | string[]; licenseurl?: string };
    files?: ArchiveFile[];
    server?: string;
    dir?: string;
}

const SEARCH_URL = 'https://archive.org/advancedsearch.php';
const METADATA_URL = 'https://archive.org/metadata';
const VIDEO_EXTENSIONS = ['.mp4', '.webm', '.ogv', '.ogg'];

function extensionToFormat(filename: string): VideoFormat {
    const lower = filename.toLowerCase();
    if (lower.endsWith('.mp4')) return 'mp4';
    if (lower.endsWith('.webm')) return 'webm';
    if (lower.endsWith('.ogv') || lower.endsWith('.ogg')) return 'ogg';
    return 'unknown';
}

function isVideoFile(file: ArchiveFile): boolean {
    const lower = file.name.toLowerCase();
    return VIDEO_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

function normalizeCreator(creator: string | string[] | undefined): string {
    if (!creator) return 'Unknown';
    if (Array.isArray(creator)) return creator.join(', ');
    return creator;
}

export class ArchiveOrgProvider implements VideoProvider {
    public readonly name = 'Internet Archive' as const;
    private readonly client;

    constructor() {
        this.client = createHttpClient(30000);
    }

    public async search(filters: SearchFilters): Promise<VideoResult[]> {
        const rows = Math.min(Math.max(filters.count * 3, 15), 75);
        const page = filters.page ?? 1;
        const sortParam = this.mapSort(filters.sortBy);

        const searchData = await withRetry(
            () =>
                getJson<ArchiveSearchResponse>(this.client, SEARCH_URL, {
                    q: `mediatype:movies AND (${filters.keyword})`,
                    'fl[]': 'identifier,title,creator,licenseurl,mediatype,publicdate',
                    rows,
                    page,
                    output: 'json',
                    ...(sortParam ? { 'sort[]': sortParam } : {}),
                }),
            { retries: 3, baseDelayMs: 2000, label: 'Archive.org search' },
        );

        const docs = searchData.response?.docs ?? [];
        if (docs.length === 0) return [];

        const results: VideoResult[] = [];
        for (const doc of docs) {
            if (results.length >= filters.count * 2) break;
            try {
                const itemResult = await this.fetchBestVideoFromItem(doc);
                if (itemResult) results.push(itemResult);
            } catch {
                continue;
            }
        }

        return this.applyFilters(results, filters);
    }

    private async fetchBestVideoFromItem(doc: ArchiveSearchDoc): Promise<VideoResult | null> {
        const data = await withRetry(
            () => getJson<ArchiveMetadataResponse>(this.client, `${METADATA_URL}/${doc.identifier}`),
            { retries: 3, baseDelayMs: 2000, label: `Archive metadata:${doc.identifier}` },
        );

        const files = (data.files ?? []).filter(isVideoFile);
        if (files.length === 0) return null;

        const best = [...files].sort((a, b) => {
            const aOriginal = a.source === 'original' ? 1 : 0;
            const bOriginal = b.source === 'original' ? 1 : 0;
            if (aOriginal !== bOriginal) return bOriginal - aOriginal;
            const aSize = a.size ? parseInt(a.size, 10) : 0;
            const bSize = b.size ? parseInt(b.size, 10) : 0;
            return bSize - aSize;
        })[0];

        if (!data.server || !data.dir) return null;

        const downloadUrl = `https://${data.server}${data.dir}/${encodeURIComponent(best.name)}`;
        const width = best.width ? parseInt(best.width, 10) : null;
        const height = best.height ? parseInt(best.height, 10) : null;

        return {
            id: doc.identifier,
            title: data.metadata?.title ?? doc.title ?? doc.identifier,
            creator: normalizeCreator(data.metadata?.creator ?? doc.creator),
            license: (data.metadata?.licenseurl ?? doc.licenseurl) ? 'See license URL' : 'Public Domain / Unspecified',
            licenseUrl: data.metadata?.licenseurl ?? doc.licenseurl ?? 'https://archive.org/about/terms.php',
            provider: this.name,
            downloadUrl,
            thumbnailUrl: `https://archive.org/services/img/${doc.identifier}`,
            durationSeconds: best.length ? Math.round(parseFloat(best.length)) : null,
            resolution: width && height ? `${width}x${height}` : null,
            fileSizeBytes: best.size ? parseInt(best.size, 10) : null,
            format: extensionToFormat(best.name),
            sourcePageUrl: `https://archive.org/details/${doc.identifier}`,
        };
    }

    private mapSort(sortBy?: SearchFilters['sortBy']): string | null {
        if (sortBy === 'newest') return 'publicdate desc';
        return null;
    }

    private applyFilters(results: VideoResult[], filters: SearchFilters): VideoResult[] {
        let filtered = results;

        if (filters.license) {
            const wanted = filters.license.toLowerCase();
            filtered = filtered.filter(
                (v) => v.license.toLowerCase().includes(wanted) || v.licenseUrl.toLowerCase().includes(wanted),
            );
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

        if (filters.sortBy === 'resolution') {
            filtered = [...filtered].sort((a, b) => {
                const heightA = a.resolution ? parseInt(a.resolution.split('x')[1] ?? '0', 10) : 0;
                const heightB = b.resolution ? parseInt(b.resolution.split('x')[1] ?? '0', 10) : 0;
                return heightB - heightA;
            });
        }

        return filtered.slice(0, filters.count);
    }
}
