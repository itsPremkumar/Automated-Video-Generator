import { ImageProvider, ImageResult, ImageSearchOptions } from '../models.js';
import { createHttpClient, getJson } from '../http-client.js';
import { withRetry } from '../utils.js';

const SEARCH_URL = 'https://images-api.nasa.gov/search';

interface NasaItemData {
    title?: string;
    description?: string;
    photographer?: string;
    keywords?: string[];
    media_type?: string;
    nasa_id?: string;
    date_created?: string;
}

interface NasaItemLink {
    href?: string;
    rel?: string;
    render?: string;
}

interface NasaItem {
    data?: NasaItemData[];
    links?: NasaItemLink[];
    href?: string;
}

interface NasaCollection {
    items?: NasaItem[];
    metadata?: { total_hits?: number };
}

interface NasaResponse {
    collection?: NasaCollection;
}

export class NasaImageProvider implements ImageProvider {
    readonly name = 'nasa-images';
    private client = createHttpClient(30000);

    async search(options: ImageSearchOptions): Promise<ImageResult[]> {
        return withRetry(
            async () => {
                const data = await getJson<NasaResponse>(this.client, SEARCH_URL, {
                    q: options.keyword,
                    media_type: 'image',
                    page_size: Math.min(options.count, 50),
                });

                const items = data?.collection?.items ?? [];
                const results: ImageResult[] = [];

                for (const item of items) {
                    if (results.length >= options.count) break;

                    const itemData = item.data?.[0];
                    if (!itemData || itemData.media_type !== 'image') continue;

                    const title = itemData.title ?? 'Untitled NASA Image';
                    const description = itemData.description ?? '';
                    const photographer = itemData.photographer ?? 'NASA';

                    let downloadUrl = '';
                    let thumbnailUrl: string | null = null;

                    const links = item.links ?? [];
                    for (const link of links) {
                        if (link.rel === 'preview') {
                            // Preview link IS the actual downloadable image (just smaller res)
                            if (!thumbnailUrl) thumbnailUrl = link.href ?? null;
                            if (!downloadUrl) downloadUrl = link.href ?? '';
                        }
                    }

                    // Fallback: use the collection API URL only as last resort
                    if (!downloadUrl && item.href) {
                        downloadUrl = item.href;
                    }

                    if (!downloadUrl) continue;

                    results.push({
                        id: `nasa-${itemData.nasa_id ?? title.replace(/\s+/g, '-')}`,
                        title,
                        creator: photographer,
                        license: 'Public Domain (NASA)',
                        licenseUrl: 'https://www.nasa.gov/nasa-brand-center/images-and-media/',
                        provider: 'nasa',
                        downloadUrl,
                        thumbnailUrl,
                        width: null,
                        height: null,
                        fileSizeBytes: null,
                        sourcePageUrl: `https://images.nasa.gov/details/${itemData.nasa_id ?? ''}`,
                    });
                }

                return results;
            },
            { retries: 2, baseDelayMs: 1000, label: 'NasaImageProvider' },
        );
    }
}
