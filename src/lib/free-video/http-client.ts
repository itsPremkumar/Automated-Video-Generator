import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';

export function createHttpClient(timeoutMs: number = 30000): AxiosInstance {
    return axios.create({
        timeout: timeoutMs,
        headers: {
            'User-Agent': 'Automated-Video-Generator/1.0 (free-video-integration)',
        },
    });
}

export async function headContentLength(client: AxiosInstance, url: string): Promise<number | null> {
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
