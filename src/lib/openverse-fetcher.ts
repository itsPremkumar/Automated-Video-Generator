import axios from 'axios';
import { logInfo } from '../runtime';
import { MediaAsset } from './visual-fetcher';

const console = {
    log: (...args: unknown[]) => logInfo(...args),
};

const UA =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

interface OpenverseResult {
    id: string;
    title: string;
    url: string;
    thumbnail: string;
    creator: string;
    license: string;
    license_version: string;
    license_url: string;
    attribution: string;
    width: number;
    height: number;
}

interface OpenverseResponse {
    result_count: number;
    results: OpenverseResult[];
}

export async function searchOpenverseImages(query: string, count: number = 5): Promise<MediaAsset[]> {
    const pageSize = Math.min(count, 50);

    const { data } = await axios.get<OpenverseResponse>('https://api.openverse.engineering/v1/images/', {
        params: { q: query, page: 1, page_size: pageSize },
        headers: { 'User-Agent': UA },
        timeout: 15000,
    });

    return data.results.map((r) => ({
        type: 'image' as const,
        url: r.url,
        width: r.width || 0,
        height: r.height || 0,
        photographer: r.creator || undefined,
    }));
}
