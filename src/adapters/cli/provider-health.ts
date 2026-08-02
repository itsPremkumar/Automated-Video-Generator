/**
 * CLI command wrapper for the provider-health tracker.
 *
 * The runtime tally lives in src/lib/visual-fetcher/provider-health.ts
 * (in-memory, process-lifetime). This module only renders it for the
 * `npm run agentic -- --status providers` command. Read-only.
 */
import { getProviderHealth, ProviderHealthSnapshot } from '../../lib/visual-fetcher/provider-health.js';

export interface ProviderHealthCommandOptions {
  json?: boolean;
}

export async function runProviderHealthCommand(
  opts: ProviderHealthCommandOptions = {},
): Promise<ProviderHealthSnapshot> {
  const report = getProviderHealth();
  if (opts.json) {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  } else {
    if (!report.providers.length) {
      process.stdout.write('provider-health: no provider activity recorded this session\n');
    } else {
      process.stdout.write('provider-health (this session):\n');
      for (const p of report.providers) {
        const marker = p.healthy ? 'OK  ' : 'FAIL';
        process.stdout.write(
          `  [${marker}] ${p.provider}  failures=${p.failures} successes=${p.successes}\n`,
        );
      }
    }
  }
  return report;
}
