import { ImageProvider, ImageResult, ImageSearchOptions } from '../models.js';
import { createHttpClient, getJson } from '../http-client.js';
import { withRetry } from '../utils.js';

const SEARCH_URL = 'https://collectionapi.metmuseum.org/public/collection/v1/search';
const OBJECT_URL = 'https://collectionapi.metmuseum.org/public/collection/v1/objects';

interface MetSearchResponse {
    total?: number;
    objectIDs?: number[];
}

interface MetObjectResponse {
    objectID: number;
    title?: string;
    artistDisplayName?: string;
    artistAlphaSort?: string;
    primaryImage?: string;
    primaryImageSmall?: string;
    objectURL?: string;
    creditLine?: string;
    rightsAndReproduction?: string;
    medium?: string;
    dimensions?: string;
}

export class MetMuseumImageProvider implements ImageProvider {
    readonly name = 'metmuseum-images';
    private client = createHttpClient(30000);

    async search(options: ImageSearchOptions): Promise<ImageResult[]> {
        return withRetry(
            async () => {
                const searchData = await getJson<MetSearchResponse>(this.client, SEARCH_URL, {
                    q: options.keyword,
                    hasImages: true,
                });

                const objectIds = searchData?.objectIDs ?? [];
                if (objectIds.length === 0) return [];

                const limit = Math.min(options.count, objectIds.length, 20);
                const sampled = objectIds.slice(0, limit * 3);

                const results: ImageResult[] = [];
                const batchSize = 5;

                for (let i = 0; i < sampled.length && results.length < limit; i += batchSize) {
                    const batch = sampled.slice(i, i + batchSize);
                    const settled = await Promise.allSettled(
                        batch.map((id) => getJson<MetObjectResponse>(this.client, `${OBJECT_URL}/${id}`)),
                    );

                    for (const result of settled) {
                        if (results.length >= limit) break;
                        if (result.status !== 'fulfilled') continue;

                        const obj = result.value;
                        if (!obj?.primaryImage) continue;

                        const rights = (obj.rightsAndReproduction ?? '').toLowerCase();
                        const license = rights.includes('public domain')
                            ? 'Public Domain (Met Museum)'
                            : rights.includes('creative commons')
                              ? 'CC (Met Museum)'
                              : 'Public Domain (check metmuseum.org)';

                        results.push({
                            id: `met-${obj.objectID}`,
                            title: obj.title ?? `Met Museum Object ${obj.objectID}`,
                            creator: obj.artistDisplayName ?? obj.artistAlphaSort ?? 'Unknown',
                            license,
                            licenseUrl: obj.objectURL ?? `https://www.metmuseum.org/art/collection/search/${obj.objectID}`,
                            provider: 'metmuseum',
                            downloadUrl: obj.primaryImage,
                            thumbnailUrl: obj.primaryImageSmall ?? obj.primaryImage,
                            width: null,
                            height: null,
                            fileSizeBytes: null,
                            sourcePageUrl: obj.objectURL ?? `https://www.metmuseum.org/art/collection/search/${obj.objectID}`,
                        });
                    }
                }

                return results;
            },
            { retries: 2, baseDelayMs: 1000, label: 'MetMuseumImageProvider' },
        );
    }
}
