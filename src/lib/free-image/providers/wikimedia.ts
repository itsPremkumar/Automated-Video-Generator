import { ImageProvider, ImageResult, ImageSearchOptions } from '../models.js';
import { createHttpClient, getJson } from '../http-client.js';
import { withRetry } from '../utils.js';

const COMMONS_API = 'https://commons.wikimedia.org/w/api.php';

interface ImageInfo {
    url?: string;
    descriptionurl?: string;
    size?: number;
    width?: number;
    height?: number;
    mime?: string;
    extmetadata?: Record<string, { value: string }>;
}

interface Page {
    pageid: number;
    title: string;
    imageinfo?: ImageInfo[];
}

interface QueryResponse {
    query?: {
        pages?: Record<string, Page>;
    };
    continue?: Record<string, unknown>;
}

function stripHtml(input: string | undefined): string {
    if (!input) return 'Unknown';
    return input.replace(/<[^>]*>/g, '').trim() || 'Unknown';
}

export class WikimediaImageProvider implements ImageProvider {
    readonly name = 'wikimedia-commons-images';
    private client = createHttpClient(30000);

    async search(options: ImageSearchOptions): Promise<ImageResult[]> {
        return withRetry(
            async () => {
                const params = {
                    action: 'query',
                    generator: 'search',
                    gsrsearch: options.keyword,
                    gsrnamespace: 6,
                    gsrlimit: Math.min(options.count, 50),
                    prop: 'imageinfo',
                    iiprop: 'url|size|dimensions|extmetadata',
                    iiurlwidth: 800,
                    format: 'json',
                };

                const data = await getJson<QueryResponse>(this.client, COMMONS_API, params);
                const pages = data?.query?.pages;
                if (!pages) return [];

                const results: ImageResult[] = [];

                for (const page of Object.values(pages)) {
                    const info = page.imageinfo?.[0];
                    if (!info?.url) continue;

                    const width = info.width ?? null;
                    const height = info.height ?? null;

                    if (options.minWidth && width && width < options.minWidth) continue;
                    if (options.minHeight && height && height < options.minHeight) continue;
                    if (options.orientation) {
                        if (width && height) {
                            const ratio = width / height;
                            if (options.orientation === 'portrait' && ratio > 1) continue;
                            if (options.orientation === 'landscape' && ratio < 1) continue;
                            if (options.orientation === 'square' && (ratio < 0.8 || ratio > 1.2)) continue;
                        }
                    }

                    const meta = info.extmetadata ?? {};
                    const license = stripHtml(meta.LicenseShortName?.value) || 'CC (check source)';
                    const licenseUrl = stripHtml(meta.LicenseUrl?.value) || '';
                    const artist = stripHtml(meta.Artist?.value) || 'Unknown';

                    results.push({
                        id: `wikimedia-${page.pageid}`,
                        title: page.title.replace(/^File:/, '').replace(/\.[^.]+$/, ''),
                        creator: artist,
                        license,
                        licenseUrl,
                        provider: 'wikimedia-commons',
                        downloadUrl: info.url,
                        thumbnailUrl: info.url?.replace(/\/(\d+)px-/, '/300px-') ?? null,
                        width,
                        height,
                        fileSizeBytes: info.size ?? null,
                        sourcePageUrl: info.descriptionurl ?? `https://commons.wikimedia.org/wiki/${encodeURI(page.title)}`,
                    });
                }

                return results;
            },
            { retries: 2, baseDelayMs: 1000, label: 'WikimediaImageProvider' },
        );
    }
}
