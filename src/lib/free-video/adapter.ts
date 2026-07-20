import * as path from 'path';
import { MediaAsset } from '../visual-fetcher.js';
import { VideoResult } from './models.js';
import { WikimediaProvider } from './providers/wikimedia.js';
import { ArchiveOrgProvider } from './providers/archive.js';
import { FreeDownloadManager } from './download/downloader.js';
import { toPublicRelativePath } from '../../pipeline-workspace.js';
import { logInfo } from '../../shared/logging/runtime-logging.js';

export class FreeVideoAdapter {
    private wiki: WikimediaProvider;
    private archive: ArchiveOrgProvider;
    private downloader: FreeDownloadManager;

    constructor() {
        this.wiki = new WikimediaProvider();
        this.archive = new ArchiveOrgProvider();
        this.downloader = new FreeDownloadManager();
    }

    async searchAll(
        keyword: string,
        filters?: {
            count?: number;
            maxDuration?: number;
            minResolution?: number;
        },
    ): Promise<{ source: string; results: VideoResult[] }[]> {
        const count = filters?.count ?? 5;
        const maxDuration = filters?.maxDuration;
        const minResolution = filters?.minResolution;

        const [wikiResults, archiveResults] = await Promise.allSettled([
            this.wiki.search({ keyword, count, maxDurationSeconds: maxDuration, minResolutionHeight: minResolution }),
            this.archive.search({
                keyword,
                count,
                maxDurationSeconds: maxDuration,
                minResolutionHeight: minResolution,
            }),
        ]);

        const output: { source: string; results: VideoResult[] }[] = [];

        if (wikiResults.status === 'fulfilled' && wikiResults.value.length > 0) {
            // RELEVANCE FILTER: drop off-topic videos (e.g. "lion king trailer",
            // "lion dance") whose title doesn't contain the query token.
            const onTopic = wikiResults.value.filter((v) => FreeVideoAdapter.isOnTopic(keyword, v.title));
            if (onTopic.length > 0) output.push({ source: 'wikimedia', results: onTopic });
        }
        if (archiveResults.status === 'fulfilled' && archiveResults.value.length > 0) {
            const onTopic = archiveResults.value.filter((v) => FreeVideoAdapter.isOnTopic(keyword, v.title));
            if (onTopic.length > 0) output.push({ source: 'archive', results: onTopic });
        }

        return output;
    }

    /**
     * Whole-word relevance gate for video titles. Mirrors the image adapter's
     * rule so a "lion" query never ships a "lion king" trailer or "lion dance"
     * clip. Off-topic compound nouns are excluded; broad topics pass through.
     */
    public static isOnTopic(keyword: string, title: string): boolean {
        const k = keyword.trim().toLowerCase();
        if (!k) return true;
        const generic = ['nature', 'city', 'background', 'texture', 'abstract', 'b roll', 'b-roll'];
        if (generic.includes(k)) return true;
        const t = (title || '').toLowerCase();
        const offTopicCompounds: Record<string, RegExp> = {
            lion: /(stone\s+lion|sea\s+lion|lion\s+king|lioness|lion's|lions'\s|mountain\s+lion|city\s+lion|lion\s+dance)/,
            cat: /(lion|tiger|bear|wildcat)/,
            dog: /(hot\s+dog|sea\s+dog)/,
            bear: /(teddy\s+bear|grizzly)/,
        };
        // Brand / commercial leakage (e.g. "LION" the detergent brand, Japanese
        // TV commercials). A topic query like "lion" must NOT ship these.
        const commercialTokens =
            /\b(cm|commercial|advert|detergent|shampoo|soap|brand|mylink|ナテラ|広告|商品|公式)\b|ライオン/;
        if (commercialTokens.test(t)) return false;
        // Non-Latin title for a Latin query => almost always a foreign brand /
        // media clip, not the requested English topic. Reject to avoid leakage.
        // eslint-disable-next-line no-control-regex -- \x00-\x7F is the intended ASCII range check
        const isLatinQuery = /^[\x00-\x7F]+$/.test(k);
        const nonLatinRatio = (t.match(/[぀-ヿ一-鿿]/g) || []).length / Math.max(1, t.replace(/\s/g, '').length);
        if (isLatinQuery && nonLatinRatio > 0.3) return false;
        for (const tok of k.split(/\s+/).filter((x) => x.length >= 3)) {
            if (offTopicCompounds[tok] && offTopicCompounds[tok].test(t)) return false;
            const re = new RegExp(`\\b${tok.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
            if (re.test(t)) return true;
        }
        return false;
    }

    async downloadToWorkspace(
        videoResult: VideoResult,
        workspaceDir: string,
        filename?: string,
    ): Promise<{ localPath: string; publicPath: string } | null> {
        const videosDir = workspaceDir; // The caller should pass the videos directory
        const results = await this.downloader.downloadAll([videoResult], videosDir);
        if (results.length === 0 || !results[0].success || !results[0].localPath) {
            return null;
        }

        const localPath = results[0].localPath;
        let publicPath: string;
        try {
            publicPath = toPublicRelativePath(localPath);
        } catch {
            // Fallback: just return the filename relative to workspace
            publicPath = `jobs/${path.relative(path.resolve(process.cwd(), 'public'), localPath).replace(/\\/g, '/')}`;
        }

        logInfo(`[FREE-VIDEO] Downloaded "${videoResult.title}" to ${localPath}`);
        return { localPath, publicPath };
    }

    async searchAndDownloadFirst(
        keyword: string,
        workspaceVideosDir: string,
        orientation: 'portrait' | 'landscape' = 'portrait',
    ): Promise<MediaAsset | null> {
        const sources = await this.searchAll(keyword, { count: 6, maxDuration: 30, minResolution: 360 });
        if (sources.length === 0) return null;

        // Flatten and pick the best result
        const allResults = sources.flatMap((s) => s.results);
        // RELEVANCE-FIRST ranking: prefer on-topic videos, then by resolution.
        // Fixes the prior bug where a high-res OFF-TOPIC clip beat a real one.
        const sorted = allResults.sort((a, b) => {
            const aOn = FreeVideoAdapter.isOnTopic(keyword, a.title) ? 1 : 0;
            const bOn = FreeVideoAdapter.isOnTopic(keyword, b.title) ? 1 : 0;
            if (aOn !== bOn) return bOn - aOn;
            const aRes = a.resolution ? parseInt(a.resolution.split('x')[1] ?? '0', 10) : 0;
            const bRes = b.resolution ? parseInt(b.resolution.split('x')[1] ?? '0', 10) : 0;
            return bRes - aRes;
        });

        // FAILOVER: try each on-topic candidate in order. Wikimedia often
        // rate-limits (HTTP 429) under burst; if the top pick fails we move to
        // the next one (e.g. an Internet Archive copy) instead of giving up.
        for (const candidate of sorted) {
            const result = await this.downloader.downloadAll([candidate], workspaceVideosDir);
            if (result.length > 0 && result[0].success && result[0].localPath) {
                const best = candidate;
                const localPath = result[0].localPath;
                const width = best.resolution ? parseInt(best.resolution.split('x')[0] ?? '1080', 10) : 1080;
                const height = best.resolution ? parseInt(best.resolution.split('x')[1] ?? '1920', 10) : 1920;
                return {
                    type: 'video',
                    url: best.downloadUrl,
                    width,
                    height,
                    photographer: best.creator,
                    localPath,
                    videoDuration: best.durationSeconds ?? undefined,
                };
            }
        }
        return null;
    }

    /**
     * Download up to `count` distinct on-topic videos, failing over through the
     * ranked candidate list so a single throttled source (Wikimedia 429) does
     * not block the whole batch. Used by bulk agents that need several clips.
     */
    async downloadBest(keyword: string, outputDir: string, count = 1): Promise<string[]> {
        const sources = await this.searchAll(keyword, { count: count * 4, maxDuration: 30, minResolution: 360 });
        if (sources.length === 0) return [];
        const sorted = sources
            .flatMap((s) => s.results)
            .sort((a, b) => {
                const aOn = FreeVideoAdapter.isOnTopic(keyword, a.title) ? 1 : 0;
                const bOn = FreeVideoAdapter.isOnTopic(keyword, b.title) ? 1 : 0;
                if (aOn !== bOn) return bOn - aOn;
                const aRes = a.resolution ? parseInt(a.resolution.split('x')[1] ?? '0', 10) : 0;
                const bRes = b.resolution ? parseInt(b.resolution.split('x')[1] ?? '0', 10) : 0;
                return bRes - aRes;
            });
        const out: string[] = [];
        for (const candidate of sorted) {
            if (out.length >= count) break;
            const res = await this.downloader.downloadAll([candidate], outputDir);
            if (res.length > 0 && res[0].success && res[0].localPath) out.push(res[0].localPath);
        }
        return out;
    }
}
