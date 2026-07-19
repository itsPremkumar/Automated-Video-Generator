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

    /**
     * Relevance gate: an asset is "on topic" only if its title (or source
     * page) mentions the query token somewhere. Without this, NASA returns
     * "Lion nebula" space photos and MetMuseum returns "sea lion"/"stone
     * lion"/"Lion King" art for a "lion" query — which would corrupt the
     * generated video's actual content. Generic-scope topic words (e.g.
     * "nature", "city") are accepted from any provider because they have no
     * single concrete subject to match.
     */
    public static isOnTopic(keyword: string, title: string): boolean {
        const k = keyword.trim().toLowerCase();
        if (!k) return true;
        // Broad/generic topics: accept anything (the provider already filtered).
        const generic = ['nature', 'city', 'background', 'texture', 'abstract'];
        if (generic.includes(k)) return true;
        const t = (title || '').toLowerCase();
        // Compound nouns that share a token with the query but are OFF-TOPIC
        // (e.g. "lion" → "stone lion", "sea lion", "lion king", "lioness").
        // These must be rejected even though they contain the query token.
        const offTopicCompounds: Record<string, RegExp> = {
            lion: /(stone\s+lion|sea\s+lion|lion\s+king|lioness|lion's|lions'\s|mountain\s+lion|city\s+lion)/,
            cat: /(lion|tiger|bear|wildcat|cat\s+statue)/,
            dog: /(hot\s+dog|dog\s+statue|sea\s+dog)/,
            bear: /(teddy\s+bear|grizzly)/,
        };
        // Brand / commercial leakage (e.g. "LION" the detergent brand). A topic
        // query like "lion" must NOT ship these as an image either.
        const commercialTokens =
            /\b(cm|commercial|advert|detergent|shampoo|soap|brand|mylink|ナテラ|広告|商品|公式)\b|ライオン/;
        if (commercialTokens.test(t)) return false;
        // Non-Latin title for a Latin query => almost always a foreign brand /
        // media still, not the requested English topic. Reject to avoid leakage.
        const isLatinQuery = /^[\x00-\x7F]+$/.test(k);
        const nonLatinRatio = (t.match(/[぀-ヿ一-鿿]/g) || []).length / Math.max(1, t.replace(/\s/g, '').length);
        if (isLatinQuery && nonLatinRatio > 0.3) return false;
        for (const tok of k.split(/\s+/).filter((x) => x.length >= 3)) {
            if (offTopicCompounds[tok] && offTopicCompounds[tok].test(t)) return false;
            // Require a whole-word boundary so "lion" does not match inside a
            // larger unrelated word. \b handles the English word edge.
            const re = new RegExp(`\\b${tok.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
            if (re.test(t)) return true;
        }
        return false;
    }

    /**
     * Provider participation policy. Wikimedia + Internet Archive are general
     * photo libraries → always queried. NASA (space) and MetMuseum (art) are
     * DOMAIN-SPECIFIC and would return OFF-TOPIC results for everyday queries
     * ("lion" → nebula art), so they are only queried when the keyword is
     * explicitly space/astronomy/museum-related. This is the core fix for
     * "the download gave the wrong image and changed the video's content".
     */
    private shouldQuery(provider: 'wiki' | 'archive' | 'nasa' | 'met', keyword: string): boolean {
        if (provider === 'wiki' || provider === 'archive') return true;
        const k = keyword.trim().toLowerCase();
        if (provider === 'nasa') {
            return /space|nasa|galaxy|nebula|star|planet|cosmo|astronom|moon|earth|satellite|telescope|comet|asteroid|universe|milky/.test(
                k,
            );
        }
        // met = art museum → only for explicitly art/heritage queries
        return /painting|sculpture|museum|artwork|portrait|renaissance|classical art|artifact|exhibit/.test(k);
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

        const tasks: Array<[string, Promise<ImageResult[]>, 'wiki' | 'archive' | 'nasa' | 'met']> = [
            [this.wiki.name, this.wiki.search(opts), 'wiki'],
            [this.archive.name, this.archive.search(opts), 'archive'],
        ];
        if (this.shouldQuery('nasa', keyword)) tasks.push([this.nasa.name, this.nasa.search(opts), 'nasa']);
        if (this.shouldQuery('met', keyword)) tasks.push([this.met.name, this.met.search(opts), 'met']);

        const settled = await Promise.allSettled(tasks.map((t) => t[1]));

        const output: { source: string; results: ImageResult[] }[] = [];
        settled.forEach((res, i) => {
            const source = tasks[i][0];
            if (res.status === 'fulfilled' && res.value.length > 0) {
                // RELEVANCE FILTER: drop off-topic assets (NASA/MET already
                // gated at the query stage, but Wikimedia/Archive can still
                // return "sea lion"/"lion statue" for a "lion" query).
                const onTopic = res.value.filter((r) => FreeImageAdapter.isOnTopic(keyword, r.title));
                if (onTopic.length > 0) output.push({ source, results: onTopic });
            }
        });

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
        // RELEVANCE-FIRST ranking: prefer on-topic assets, then break ties by
        // resolution. Fixes the prior bug where a high-res OFF-TOPIC NASA/MET
        // image beat a lower-res REAL photo purely on pixel count.
        const sorted = all.sort((a, b) => {
            const aOn = FreeImageAdapter.isOnTopic(keyword, a.title) ? 1 : 0;
            const bOn = FreeImageAdapter.isOnTopic(keyword, b.title) ? 1 : 0;
            if (aOn !== bOn) return bOn - aOn;
            const aRes = (a.width ?? 0) * (a.height ?? 0);
            const bRes = (b.width ?? 0) * (b.height ?? 0);
            return bRes - aRes;
        });

        return sorted[0] ?? null;
    }
}
