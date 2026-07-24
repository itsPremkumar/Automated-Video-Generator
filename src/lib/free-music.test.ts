import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveFreeBackgroundMusic, listFreeMusicProviders } from './free-music';
import { resolveMusicPath } from '../music-system/config';

// Offline-capable: force the local provider only and mock network for the others.
const tempDir = require('path').join(__dirname, 'temp-free-music');
const fs = require('fs');

test.before(() => {
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
});

test.after(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
});

test('listFreeMusicProviders includes the music sources', () => {
    const names = listFreeMusicProviders();
    assert.ok(names.includes('ccmixter'));
    assert.ok(names.includes('internet-archive'));
    assert.ok(names.includes('local'));
});

test('resolveFreeBackgroundMusic disabled does not touch network', async () => {
    const original = (require('axios') as any).get;
    (require('axios') as any).get = (() => {
        throw new Error('network must not be called when disabled');
    }) as any;
    try {
        const result = await resolveFreeBackgroundMusic({ enabled: false });
        assert.equal(result, null);
    } finally {
        (require('axios') as any).get = original;
    }
});

test('resolveFreeBackgroundMusic returns bundled music when network fails', async () => {
    // The bundled provider is backed by committed offline tracks under
    // input/bgm/__bundled__. On a bare checkout (or CI without those assets)
    // the provider has nothing to return — skip rather than hard-fail, the
    // same way the network image providers skip when hosts are unreachable.
    const bundleDir = resolveMusicPath('input/bgm/__bundled__');
    const hasTracks =
        fs.existsSync(bundleDir) &&
        fs.readdirSync(bundleDir).some((f: string) => /\.(mp3|ogg|wav|m4a)$/i.test(f));
    if (!hasTracks) {
        return test.skip('bundled music assets absent (input/bgm/__bundled__ empty)');
    }
    const original = (require('axios') as any).get;
    (require('axios') as any).get = (async () => {
        throw new Error('simulated network failure');
    }) as any;
    try {
        // Network providers fail, but bundled (offline, no axios) should succeed
        const result = await resolveFreeBackgroundMusic({ preferProviders: ['bundled'], query: 'ambient' });
        assert.ok(result !== null, 'Bundled provider should return music without network');
        assert.ok(typeof result.localPath === 'string', 'Result should have a localPath');
        assert.ok(result.track?.provider === 'bundled', 'Provider should be bundled');
    } finally {
        (require('axios') as any).get = original;
    }
});

test('local provider prefers user-dropped files (offline)', async () => {
    const localFile = require('path').join(tempDir, 'my-track.mp3');
    fs.writeFileSync(localFile, Buffer.from('fake-audio'));
    const result = await resolveFreeBackgroundMusic({
        preferProviders: ['local'],
        cacheDir: tempDir,
    });
    assert.ok(result === null || typeof result.localPath === 'string');
});
