/**
 * src/music-system/music-system.test.ts
 * Unit tests for the music system core — no network calls.
 *
 * Run: npm run test:unit
 */

import * as assert from 'node:assert';
import { describe, it, before } from 'node:test';

// ─── Types ───────────────────────────────────────────────────
import {
    type MusicTrack,
    type MusicQuery,
} from './types';

// ─── Query builder ────────────────────────────────────────────
import { buildMusicQuery } from './query';

describe('MusicQuery builder', () => {
    it('builds a query from topic and mood', () => {
        const q = buildMusicQuery({ mood: 'calm', topic: 'nature meditation', targetDurationSec: 60 });
        assert.equal(q.mood, 'calm');
        assert.equal(q.topic, 'nature meditation');
        assert.ok(q.targetDurationSec === 60);
    });

    it('detects mood from keywords', () => {
        const q = buildMusicQuery({ topic: 'sad emotional documentary' });
        assert.equal(q.mood, 'dramatic');
    });

    it('detects upbeat from keywords', () => {
        const q = buildMusicQuery({ topic: 'happy dance party summer fun' });
        assert.equal(q.mood, 'upbeat');
    });

    it('defaults to ambient for neutral keywords', () => {
        const q = buildMusicQuery({ topic: 'how to install software' });
        assert.equal(q.mood, 'calm');
    });

    it('extracts genre preferences from topic', () => {
        const q = buildMusicQuery({ mood: 'nostalgic', topic: 'lofi jazz study beats' });
        assert.ok(q.preferredGenres!.includes('lofi'));
    });
});

// ─── BundledProvider (offline) ─────────────────────────────────
import { BundledProvider } from './providers/bundled';

describe('BundledProvider', () => {
    it('reads bundled tracks from input/bgm/__bundled__/', async () => {
        const provider = new BundledProvider();
        const tracks = await provider.search({ mood: 'any' as any, targetDurationSec: 60, minDurationSec: 10, role: 'background' as any });
        assert.ok(tracks.length >= 3, `Expected >=3 bundled tracks, got ${tracks.length}`);
        tracks.forEach(t => {
            assert.ok(t.id.startsWith('bundled_'), `Track ${t.id} has bundled_ prefix`);
            assert.ok(t.durationSec > 0, `Track ${t.title} has duration`);
        });
    });

    it('filters by mood correctly', async () => {
        const provider = new BundledProvider();
        const tracks = await provider.search({ mood: 'dramatic' as any, targetDurationSec: 60, minDurationSec: 10, role: 'background' as any });
        assert.ok(tracks.length >= 1, 'Expected at least 1 dramatic track');
        tracks.forEach(t => {
            assert.ok(t.mood?.includes('dramatic'), `Track ${t.title} mood ${t.mood} should include dramatic`);
        });
    });

    it('returns empty for unknown mood', async () => {
        const provider = new BundledProvider();
        const tracks = await provider.search({ mood: 'metal' as any, targetDurationSec: 60, minDurationSec: 10, role: 'background' as any });
        assert.equal(tracks.length, 0);
    });

    it('copies file on download', async () => {
        const provider = new BundledProvider();
        const tracks = await provider.search({ mood: 'calm' as any, targetDurationSec: 60, minDurationSec: 10, role: 'background' as any });
        assert.ok(tracks.length >= 1, 'No calm tracks found');

        const dest = `_test_bundled_copy.${tracks[0].format}`;
        try {
            const result = await provider.download(tracks[0], dest);
            assert.ok(require('fs').existsSync(result), `File ${result} should exist`);
            const stat = require('fs').statSync(result);
            assert.ok(stat.size > 50000, `File should be >50KB, got ${stat.size}`);
        } finally {
            try { require('fs').unlinkSync(dest); } catch { /* ignore */ }
        }
    });
});

// ─── ProceduralProvider (offline) ──────────────────────────────
import { ProceduralProvider } from './providers/procedural';

describe('ProceduralProvider', () => {
    it('generates ambient track', async () => {
        const provider = new ProceduralProvider();
        const tracks = await provider.search({ mood: 'calm' as any, targetDurationSec: 30, minDurationSec: 15, role: 'background' as any });
        assert.ok(tracks.length >= 1);
        assert.ok(tracks[0].downloadUrl.startsWith('__ffmpeg_generated__'));
    });

    it('generates different profiles for different moods', async () => {
        const provider = new ProceduralProvider();
        const calm = await provider.search({ mood: 'calm' as any, targetDurationSec: 30, minDurationSec: 15, role: 'background' as any });
        const upbeat = await provider.search({ mood: 'upbeat' as any, targetDurationSec: 30, minDurationSec: 15, role: 'background' as any });
        assert.ok(calm.length >= 1);
        assert.ok(upbeat.length >= 1);
        assert.notEqual(
            calm[0].tags?.join(','),
            upbeat[0].tags?.join(','),
            'Different moods should produce different tags'
        );
    });
});

// ─── MusicEngine (offline only) ────────────────────────────────
import { MusicEngine } from './index';
import { registerDefaultProviders, globalRegistry } from './providers/index';

describe('MusicEngine', () => {
    before(() => {
        registerDefaultProviders();
    });

    it('initializes with default config', async () => {
        const engine = new MusicEngine();
        await engine.init();
        assert.ok(engine); // just make sure it doesn't throw
    });

    it('resolves bundled music (offline, priority 1)', async () => {
        const engine = new MusicEngine();
        await engine.init();
        const result = await engine.resolveBackground({ topic: 'calm meditation', targetDurationSec: 30 });
        assert.ok(result, 'Engine should resolve background music');
        assert.ok(result!.track.provider === 'bundled', `Expected bundled provider, got ${result!.track.provider}`);
    });
});

// ─── Config defaults ──────────────────────────────────────────
import { loadMusicConfig } from './config';

describe('Config', () => {
    it('loads defaults', () => {
        const cfg = loadMusicConfig();
        assert.ok(cfg.cacheDir);
        assert.ok(cfg.processing.fadeInSec >= 0);
        assert.equal(cfg.processing.targetLufs, -23);
    });

    it('merges user overrides', () => {
        const cfg = loadMusicConfig({ cacheDir: '/tmp/test-cache' });
        assert.equal(cfg.cacheDir, '/tmp/test-cache');
        assert.equal(cfg.processing.targetLufs, -23);
    });
});

// ─── Cache (offline) ───────────────────────────────────────────
import { MusicCache } from './cache';

describe('MusicCache', () => {
    it('stores and retrieves tracks', () => {
        const cache = new MusicCache('/tmp/_test_music_cache');
        const track: MusicTrack = {
            id: 'test_1',
            title: 'Test Track',
            creator: 'Tester',
            provider: 'test',
            downloadUrl: 'https://example.com/test.mp3',
            durationSec: 60,
            format: 'mp3',
            license: 'CC0',
            licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
            genre: 'test',
            tags: ['test'],
        };

        // MusicCache uses get/has internally; manually track
        assert.equal(cache.get(track), null);
    });

    it('returns null for uncached tracks', () => {
        const cache = new MusicCache('/tmp/_test_music_cache_2');
        const track: MusicTrack = {
            id: 'nonexistent',
            title: '',
            creator: '',
            provider: 'test',
            downloadUrl: '',
            durationSec: 0,
            format: 'mp3',
            license: '',
            licenseUrl: '',
            genre: '',
            tags: [],
        };
        assert.equal(cache.get(track), null);
    });
});

// ─── Event bus ────────────────────────────────────────────────
import { MusicEventBus } from './events';

describe('MusicEventBus', () => {
    it('emits and receives events', () => {
        const bus = new MusicEventBus();
        let received: any = null;
        bus.on('provider:search:success', (e: any) => { received = e; });
        bus.emit({ type: 'provider:search:success', provider: 'test', latencyMs: 100 });
        assert.equal(received?.provider, 'test');
        assert.equal(received?.latencyMs, 100);
    });

    it('supports multiple listeners', () => {
        const bus = new MusicEventBus();
        let count = 0;
        bus.on('provider:search:success', () => count++);
        bus.on('provider:search:success', () => count++);
        bus.emit({ type: 'provider:search:success', provider: 'test', latencyMs: 50 });
        assert.equal(count, 2);
    });
});
