import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import { AppConfig } from '../config';

export function createHttpClient(config: AppConfig): AxiosInstance {
    const client = axios.create({
        timeout: config.httpTimeoutMs,
        headers: {
            'User-Agent': 'free-video-downloader/1.0 (open-source; no-api-key)',
        },
    });
    return client;
}

export async function headContentLength(
    client: AxiosInstance,
    url: string,
): Promise<number | null> {
    try {
        const response = await client.head(url);
        const length = response.headers['content-length'];
        return length ? parseInt(String(length), 10) : null;
    } catch {
        return null;
    }
}

export async function getJson<T>(
    client: AxiosInstance,
    url: string,
    params?: Record<string, string | number | boolean | undefined>,
): Promise<T> {
    // Remove undefined values from params
    const cleanParams: Record<string, string | number | boolean> = {};
    if (params) {
        for (const [key, value] of Object.entries(params)) {
            if (value !== undefined) {
                cleanParams[key] = value;
            }
        }
    }

    const config: AxiosRequestConfig = { params: cleanParams };
    const response = await client.get<T>(url, config);
    return response.data;
}
