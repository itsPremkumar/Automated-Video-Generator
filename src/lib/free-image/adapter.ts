import { ImageResult, ImageSearchOptions } from './models.js';
import { WikimediaImageProvider } from './providers/wikimedia.js';
import { ArchiveOrgImageProvider } from './providers/archive.js';
import { NasaImageProvider } from './providers/nasa.js';
import { MetMuseumImageProvider } from './providers/metmuseum.js';

export class FreeImageAdapter {
    private wiki: WikimediaImageProvider;
    private archive: ArchiveOrgImageProvider;
    private nasa: NasaImageProvider;
    private met: MetMuseumImageProvider;

    constructor() {
        this.wiki = new WikimediaImageProvider();
        this.archive = new ArchiveOrgImageProvider();
        this.nasa = new NasaImageProvider();
        this.met = new MetMuseumImageProvider();
    }

    async searchAll(
        keyword: string,
        options?: {
            count?: number;
            orientation?: 'portrait' | 'landscape' | 'square';
            minWidth?: number;
            minHeight?: number;
        },
    ): Promise<{ source: string; results: ImageResult[] }[]> {
        const count = options?.count ?? 5;
        const opts: ImageSearchOptions = {
            keyword,
            count,
            orientation: options?.orientation,
            minWidth: options?.minWidth,
            minHeight: options?.minHeight,
        };

        const [wikiResults, archiveResults, nasaResults, metResults] = await Promise.allSettled([
            this.wiki.search(opts),
            this.archive.search(opts),
            this.nasa.search(opts),
            this.met.search(opts),
        ]);

        const output: { source: string; results: ImageResult[] }[] = [];

        if (wikiResults.status === 'fulfilled' && wikiResults.value.length > 0) {
            output.push({ source: 'wikimedia', results: wikiResults.value });
        }
        if (archiveResults.status === 'fulfilled' && archiveResults.value.length > 0) {
            output.push({ source: 'archive', results: archiveResults.value });
        }
        if (nasaResults.status === 'fulfilled' && nasaResults.value.length > 0) {
            output.push({ source: 'nasa', results: nasaResults.value });
        }
        if (metResults.status === 'fulfilled' && metResults.value.length > 0) {
            output.push({ source: 'metmuseum', results: metResults.value });
        }

        return output;
    }

    async searchBest(
        keyword: string,
        options?: {
            count?: number;
            orientation?: 'portrait' | 'landscape' | 'square';
            minWidth?: number;
            minHeight?: number;
        },
    ): Promise<ImageResult | null> {
        const sources = await this.searchAll(keyword, options);
        if (sources.length === 0) return null;

        const all = sources.flatMap((s) => s.results);
        const sorted = all.sort((a, b) => {
            const aRes = (a.width ?? 0) * (a.height ?? 0);
            const bRes = (b.width ?? 0) * (b.height ?? 0);
            return bRes - aRes;
        });

        return sorted[0] ?? null;
    }
}
