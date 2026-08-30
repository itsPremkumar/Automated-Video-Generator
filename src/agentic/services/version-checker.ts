/**
 * version-checker.ts — Check for new releases on GitHub.
 *
 * Compares current version with latest GitHub release.
 * Identity-preserving: never throws, returns null if check fails.
 */

import { logInfo, logWarn } from '../../shared/logging/runtime-logging.js';

export interface VersionInfo {
    current: string;
    latest: string;
    hasUpdate: boolean;
    releaseUrl: string;
    releaseNotes: string;
    publishedAt: string;
}

const GITHUB_API = 'https://api.github.com/repos/itsPremkumar/Automated-Video-Generator/releases/latest';
const CURRENT_VERSION = '5.0.0';

/** Check for updates from GitHub releases */
export async function checkForUpdates(): Promise<VersionInfo | null> {
    try {
        const res = await fetch(GITHUB_API, {
            headers: {
                'Accept': 'application/vnd.github.v3+json',
                'User-Agent': 'Automated-Video-Generator',
            },
        });

        if (!res.ok) {
            logWarn(`[VERSION] GitHub API returned ${res.status}`);
            return null;
        }

        const json = await res.json();
        const latest = json?.tag_name?.replace(/^v/, '') || CURRENT_VERSION;
        const hasUpdate = compareVersions(latest, CURRENT_VERSION) > 0;

        if (hasUpdate) {
            logInfo(`[VERSION] Update available: ${CURRENT_VERSION} → ${latest}`);
        }

        return {
            current: CURRENT_VERSION,
            latest,
            hasUpdate,
            releaseUrl: json?.html_url || 'https://github.com/itsPremkumar/Automated-Video-Generator/releases',
            releaseNotes: json?.body || '',
            publishedAt: json?.published_at || '',
        };
    } catch (e: any) {
        logWarn(`[VERSION] Check failed: ${e?.message ?? e}`);
        return null;
    }
}

/** Compare two semver strings. Returns >0 if a>b, <0 if a<b, 0 if equal */
function compareVersions(a: string, b: string): number {
    const partsA = a.split('.').map(Number);
    const partsB = b.split('.').map(Number);
    for (let i = 0; i < 3; i++) {
        const diff = (partsA[i] || 0) - (partsB[i] || 0);
        if (diff !== 0) return diff;
    }
    return 0;
}

/**
 * Legacy alias: the previous `update-checker.ts` exposed the same shape under
 * the name `UpdateInfo` (with `currentVersion`/`latestVersion` instead of
 * `current`/`latest`). Keep it as a structural alias so any third-party
 * consumers don't break — collapsed in the 2026-08 consolidation when
 * `update-checker.ts` was deleted in favour of this file.
 */
export type UpdateInfo = VersionInfo;

/**
 * Legacy alias: `update-checker.ts` exposed `getUpdateMessage(info)`.
 * Returns a human-readable update notification string. Equivalent to
 * `formatVersionInfo` but with a slightly different message format
 * (preserved verbatim so the surface stays stable for any consumers).
 */
export function getUpdateMessage(info: VersionInfo | UpdateInfo): string {
    if (!info.hasUpdate) {
        return `✅ You are running the latest version (${'currentVersion' in info ? info.currentVersion : info.current}).`;
    }
    const latest = 'latestVersion' in info ? info.latestVersion : info.latest;
    const current = 'currentVersion' in info ? info.currentVersion : info.current;
    const url = info.releaseUrl;
    return `🔄 New version available: ${latest} (current: ${current})\n   ${url}`;
}

/** Get current version */
export function getCurrentVersion(): string {
    return CURRENT_VERSION;
}

/** Format version info for display */
export function formatVersionInfo(info: VersionInfo): string {
    if (!info.hasUpdate) {
        return `✅ You are running the latest version (v${info.current})`;
    }
    return `🔄 Update available: v${info.current} → v${info.latest}
   ${info.releaseUrl}`;
}
