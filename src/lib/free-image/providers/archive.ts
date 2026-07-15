import { ImageProvider, ImageResult, ImageSearchOptions } from '../models.js';
import { createHttpClient, getJson } from '../http-client.js';
import { withRetry } from '../utils.js';

const SEARCH_URL = 'https://archive.org/advancedsearch.php';
const METADATA_URL = 'https://archive.org/metadata';
const DOWNLOAD_BASE = 'https://archive.org/download';

interface ArchiveSearchDoc {
    identifier: string;
    title?: string;
    creator?: string | string[];
    licenseurl?: string;
    publicdate?: string;
    description?: string;
}

interface ArchiveSearchResponse {
    response?: {
        docs?: ArchiveSearchDoc[];
        numFound?: number;
    };
}

interface ArchiveFile {
    name: string;
    format?: string;
    size?: string;
    width?: string;
    height?: string;
    source?: string;
}

interface ArchiveMetadataResponse {
    metadata?: {
        title?: string;
        creator?: string | string[];
        licenseurl?: string;
    };
    files?: ArchiveFile[];
}

const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.tiff', '.tif'];

function isImageFile(file: ArchiveFile): boolean {
    const lower = file.name.toLowerCase();
    return IMAGE_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

function safeParseInt(value: string | undefined | null, fallback: number | null): number | null {
    if (value == null) return fallback;
    const parsed = parseInt(value, 10);
    return isNaN(parsed) ? fallback : parsed;
}

export class ArchiveOrgImageProvider implements ImageProvider {
    readonly name = 'internet-archive-images';
    private client = createHttpClient(30000);

    async search(options: ImageSearchOptions): Promise<ImageResult[]> {
        return withRetry(
            async () => {
                const q = `${options.keyword} AND mediatype:image`;
                const fl = ['identifier', 'title', 'creator', 'licenseurl', 'publicdate', 'description'];

                const data = await getJson<ArchiveSearchResponse>(this.client, SEARCH_URL, {
                    q,
                    fl: fl.join(','),
                    rows: Math.min(options.count * 2, 50),
                    page: 1,
                    output: 'json',
                    sort: 'downloads desc',
                });

                const docs = data?.response?.docs ?? [];
                if (docs.length === 0) return [];

                const slice = docs.slice(0, options.count * 2);

                // Fetch all metadata in parallel to avoid N+1 sequential HTTP requests
                const metaResults = await Promise.allSettled(
                    slice.map((doc) =>
                        getJson<ArchiveMetadataResponse>(this.client, `${METADATA_URL}/${doc.identifier}`),
                    ),
                );

                const results: ImageResult[] = [];

                for (let d = 0; d < slice.length && results.length < options.count; d++) {
                    const doc = slice[d];
                    const metaResult = metaResults[d];
                    if (metaResult.status !== 'fulfilled') continue;

                    const meta = metaResult.value;
                    const files = meta?.files ?? [];
                    const imageFiles = files.filter(isImageFile);

                    for (const file of imageFiles) {
                        if (results.length >= options.count) break;

                        const width = safeParseInt(file.width, null);
                        const height = safeParseInt(file.height, null);

                        if (options.minWidth && width && width < options.minWidth) continue;
                        if (options.minHeight && height && height < options.minHeight) continue;

                        const downloadUrl = `${DOWNLOAD_BASE}/${doc.identifier}/${file.name}`;
                        const creator = Array.isArray(doc.creator) ? doc.creator[0] : (doc.creator ?? 'Unknown');
                        const licenseUrl = doc.licenseurl ?? meta?.metadata?.licenseurl ?? '';

                        results.push({
                            id: `archive-${doc.identifier}-${file.name}`,
                            title: doc.title ?? file.name,
                            creator,
                            license: licenseUrl.includes('creativecommons')
                                ? 'CC (check source)'
                                : 'Public Domain (check archive.org)',
                            licenseUrl,
                            provider: 'internet-archive',
                            downloadUrl,
                            thumbnailUrl: null,
                            width,
                            height,
                            fileSizeBytes: safeParseInt(file.size, null),
                            sourcePageUrl: `https://archive.org/details/${doc.identifier}`,
                        });
                    }
                }

                return results;
            },
            { retries: 2, baseDelayMs: 1000, label: 'ArchiveOrgImageProvider' },
        );
    }
}
