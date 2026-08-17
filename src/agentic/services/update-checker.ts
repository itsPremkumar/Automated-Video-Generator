/**
 * update-checker.ts — Auto-update checker.
 *
 * Checks GitHub releases for new versions.
 * Identity-preserving: uses GitHub API, no external deps.
 */

import * as fs from 'fs';
import * as path from 'path';
import { logInfo, logWarn } from '../../shared/logging/runtime-logging.js';

const GITHUB_REPO = 'itsPremkumar/Automated-Video-Generator';
const GITHUB_API_URL = `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`;
const CURRENT_VERSION = '5.0.0';

export interface UpdateInfo {
    hasUpdate: boolean;
    currentVersion: string;
    latestVersion: string;
    releaseUrl: string;
    releaseNotes: string;
    publishedAt: string;
}

/** Check for updates from GitHub releases */
export async function checkForUpdates(): Promise<UpdateInfo> {
    try {
        const res = await fetch(GITHUB_API_URL, {
            headers: {
                'User-Agent': 'Automated-Video-Generator',
                'Accept': 'application/vnd.github.v3+json',
            },
        });

        if (!res.ok) {
            logWarn(`[UPDATE] Failed to check: ${res.status}`);
            return {
                hasUpdate: false,
                currentVersion: CURRENT_VERSION,
                latestVersion: CURRENT_VERSION,
                releaseUrl: '',
                releaseNotes: '',
                publishedAt: '',
            };
        }

        const json = await res.json();
        const latestVersion = json.tag_name?.replace('v', '') || CURRENT_VERSION;
        const hasUpdate = isNewerVersion(latestVersion, CURRENT_VERSION);

        if (hasUpdate) {
            logInfo(`[UPDATE] New version available: ${latestVersion}`);
        }

        return {
            hasUpdate,
            currentVersion: CURRENT_VERSION,
            latestVersion,
            releaseUrl: json.html_url || '',
            releaseNotes: json.body || '',
            publishedAt: json.published_at || '',
        };
    } catch (e: any) {
        logWarn(`[UPDATE] Check failed: ${e?.message ?? e}`);
        return {
            hasUpdate: false,
            currentVersion: CURRENT_VERSION,
            latestVersion: CURRENT_VERSION,
            releaseUrl: '',
            releaseNotes: '',
            publishedAt: '',
        };
    }
}

/** Compare version strings */
function isNewerVersion(latest: string, current: string): boolean {
    const latestParts = latest.split('.').map(Number);
    const currentParts = current.split('.').map(Number);

    for (let i = 0; i < Math.max(latestParts.length, currentParts.length); i++) {
        const l = latestParts[i] || 0;
        const c = currentParts[i] || 0;
        if (l > c) return true;
        if (l < c) return false;
    }
    return false;
}

/** Get update notification message */
export function getUpdateMessage(info: UpdateInfo): string {
    if (!info.hasUpdate) {
        return `✅ You are running the latest version (${info.currentVersion}).`;
    }
    return `🔄 New version available: ${info.latestVersion} (current: ${info.currentVersion})
   ${info.releaseUrl}`;
}
