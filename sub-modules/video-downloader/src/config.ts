import * as path from 'path';
import * as fs from 'fs-extra';

export interface AppConfig {
    downloadDir: string;
    concurrentDownloads: number;
    retryCount: number;
    retryBaseDelayMs: number;
    historyFile: string;
    httpTimeoutMs: number;
}

const DEFAULTS: AppConfig = {
    downloadDir: path.resolve(process.cwd(), 'downloads'),
    concurrentDownloads: 3,
    retryCount: 3,
    retryBaseDelayMs: 2000,
    historyFile: path.resolve(process.cwd(), 'download-history.json'),
    httpTimeoutMs: 30000,
};

export function buildConfig(overrides?: Partial<AppConfig>): AppConfig {
    const config: AppConfig = { ...DEFAULTS };

    if (overrides?.downloadDir) {
        config.downloadDir = path.resolve(process.cwd(), overrides.downloadDir);
    }
    if (overrides?.concurrentDownloads !== undefined) {
        config.concurrentDownloads = overrides.concurrentDownloads;
    }
    if (overrides?.retryCount !== undefined) {
        config.retryCount = overrides.retryCount;
    }
    if (overrides?.retryBaseDelayMs !== undefined) {
        config.retryBaseDelayMs = overrides.retryBaseDelayMs;
    }
    if (overrides?.historyFile) {
        config.historyFile = path.resolve(process.cwd(), overrides.historyFile);
    }
    if (overrides?.httpTimeoutMs !== undefined) {
        config.httpTimeoutMs = overrides.httpTimeoutMs;
    }

    fs.ensureDirSync(config.downloadDir);
    return config;
}
