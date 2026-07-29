/**
 * Regression: scene-boundary caption windows must be half-open [start, end).
 *
 * Bug (found via frame-level visual QA of a rendered portrait video): the
 * caption enable expression used gte(t,start)*lte(t,end). At a scene boundary
 * the outgoing scene's `lte(t,end)` and the incoming scene's `gte(t,start)`
 * are simultaneously true (end === next start), so BOTH captions were burned
 * onto the boundary frames — overlapping, unreadable text.
 *
 * The fix closes the window with lt() instead of lte(). This test greps the
 * compose source to keep the class of bug from regressing anywhere a
 * per-scene time window is built.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as path from 'path';

const SRC = path.join(process.cwd(), 'src', 'agentic', 'operations', 'compose.ts');

describe('caption enable windows are half-open (no boundary overlap)', () => {
    const src = fs.readFileSync(SRC, 'utf8');

    it('no per-scene window uses lte() against a scene end variable', () => {
        // Interpolated end bounds must use lt( — lte( at the close of a
        // dynamic window reintroduces double-caption boundary frames.
        const bad = src.match(/gte\(t,\$\{[^}]+\}\)\*lte\(t,\$\{[^}]+\}\)/g) ?? [];
        assert.deepEqual(bad, [], `found lte()-closed dynamic windows: ${bad.join(' | ')}`);
    });

    it('per-scene windows exist and use lt() close', () => {
        const good = src.match(/gte\(t,\$\{[^}]+\}\)\*lt\(t,\$\{[^}]+\}\)/g) ?? [];
        assert.ok(good.length >= 4, `expected >=4 half-open windows, found ${good.length}`);
    });
});
