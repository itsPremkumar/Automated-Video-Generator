/**
 * plugins.test.ts — prove the plugin registry loads cleanly with the stock
 * agentic-plugins.config.json (no crashes), and that lut-loader tolerates a
 * missing lutDir. This is the integration gate: if createPluginRegistry throws,
 * the whole plugin system is unusable from the pipeline.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as path from 'path';
import { createPluginRegistry, registerAllPlugins } from './index.js';
import { PluginContext } from './core/types.js';

function loadStockConfig(): any {
  const cfgPath = path.join(process.cwd(), 'agentic-plugins.config.json');
  return fs.existsSync(cfgPath) ? JSON.parse(fs.readFileSync(cfgPath, 'utf-8')) : { plugins: [] };
}

test('createPluginRegistry + registerAllPlugins does NOT throw on stock config', async () => {
  const cfg = loadStockConfig();
  const ctx = new PluginContext({ jobId: 'probe', workspaceRoot: '/tmp', config: cfg });
  // Must not throw (regression: lut-loader crashed on undefined lutDir).
  const reg = await createPluginRegistry(ctx);
  registerAllPlugins(reg, cfg);
  const all = reg.getAll();
  assert.ok(all.length >= 20, 'all 20+ plugins registered (got ' + all.length + ')');
  // Hooks the pipeline will call must exist.
  assert.equal(typeof reg.invokeOnPlan, 'function');
  assert.equal(typeof reg.invokeOnStyle, 'function');
  assert.equal(typeof reg.invokeOnRender, 'function');
  assert.equal(typeof reg.invokeOnPostRender, 'function');
});

test('lut-loader plugin is present and reports COLOR category', async () => {
  const cfg = loadStockConfig();
  const ctx = new PluginContext({ jobId: 'probe', workspaceRoot: '/tmp', config: cfg });
  const reg = await createPluginRegistry(ctx);
  registerAllPlugins(reg, cfg);
  const lut = reg.getAll().find((e: any) => e.plugin?.metadata?.name === 'lut-loader');
  assert.ok(lut, 'lut-loader registered');
  assert.equal(lut!.plugin.category, 'color');
});
