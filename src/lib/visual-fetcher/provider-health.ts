/**
 * Lightweight in-memory provider-health tracker.
 *
 * The AVS media pipeline calls Pexels / Pixabay / Openverse (and free sources)
 * on every run. On a 6GB box you cannot babysit logs, and there is no external
 * circuit-breaker module. This keeps a per-process tally of provider failures
 * so a human can run `npm run agentic -- --status providers` and see, in one
 * glance, which providers are degraded THIS session.
 *
 * Scope is intentional: in-memory only, process-lifetime. No disk, no network,
 * no async — it must never add latency or failure surface to the hot fetch path.
 */
import { logWarn } from '../../runtime';

export type ProviderName = 'pexels' | 'pixabay' | 'openverse' | 'free-image' | 'free-video';

const failureCounts = new Map<ProviderName, number>();
const successCounts = new Map<ProviderName, number>();

export function recordProviderSuccess(name: ProviderName): void {
    successCounts.set(name, (successCounts.get(name) || 0) + 1);
}

export function recordProviderFailure(name: ProviderName, detail?: string): void {
    failureCounts.set(name, (failureCounts.get(name) || 0) + 1);
    if (detail) logWarn(`[provider-health] ${name} failure: ${detail}`);
}

export interface ProviderHealthEntry {
    provider: ProviderName;
    failures: number;
    successes: number;
    healthy: boolean;
}

export interface ProviderHealthSnapshot {
    checkedAt: string;
    providers: ProviderHealthEntry[];
}

export function getProviderHealth(): ProviderHealthSnapshot {
    const names = new Set<ProviderName>([...failureCounts.keys(), ...successCounts.keys()]);
    const providers: ProviderHealthEntry[] = [...names].map((provider) => {
        const failures = failureCounts.get(provider) || 0;
        const successes = successCounts.get(provider) || 0;
        return { provider, failures, successes, healthy: failures === 0 };
    });
    // Stable, worst-first ordering so degraded providers surface at the top.
    providers.sort((a, b) => b.failures - a.failures || a.provider.localeCompare(b.provider));
    return { checkedAt: new Date().toISOString(), providers };
}

export function resetProviderHealth(): void {
    failureCounts.clear();
    successCounts.clear();
}
