/**
 * Verification tests — run fully offline (dry-run), no credentials/network.
 * These prove the adapter's logic is correct before any real YouTube call.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { YouTubeAuth, uploadVideo, saveTokens, loadTokens, clearTokens } from './index.js';
import type { YouTubeCredentials } from './types.js';

const CREDS: YouTubeCredentials = {
    clientId: 'test_client',
    clientSecret: 'test_secret',
    redirectUri: 'http://localhost:3001/oauth/callback',
};

test('buildAuthUrl produces a valid Google OAuth URL (dry-run)', async () => {
    const auth = new YouTubeAuth(CREDS, true);
    const url = await auth.buildAuthUrl('state123');
    assert.ok(url.startsWith('https://accounts.google.com/o/oauth2/v2/auth?'));
    assert.ok(url.includes('client_id=test_client'));
    assert.ok(url.includes('scope='));
    assert.ok(url.includes('state=state123'));
});

test('exchangeCode returns mocked tokens in dry-run', async () => {
    const auth = new YouTubeAuth(CREDS, true);
    const tokens = await auth.exchangeCode('fake_code');
    assert.ok(tokens.accessToken.startsWith('dryrun_access_'));
    assert.ok(tokens.refreshToken?.startsWith('dryrun_refresh_'));
    assert.equal(tokens.tokenType, 'Bearer');
});

test('refresh returns a new access token in dry-run', async () => {
    const auth = new YouTubeAuth(CREDS, true);
    const tokens = await auth.refresh('existing_refresh');
    assert.ok(tokens.accessToken.includes('refreshed'));
    assert.equal(tokens.refreshToken, 'existing_refresh');
});

test('token store round-trips', () => {
    clearTokens();
    assert.equal(loadTokens(), null);
    const sample = { accessToken: 'a', refreshToken: 'r', scope: 's', tokenType: 'Bearer' };
    saveTokens(sample);
    assert.deepEqual(loadTokens(), sample);
    clearTokens();
    assert.equal(loadTokens(), null);
});

test('uploadVideo dry-run validates file and returns mocked result', async () => {
    const tmp = path.join(os.tmpdir(), `yt_test_${Date.now()}.mp4`);
    fs.writeFileSync(tmp, Buffer.from('fake mp4 content'));

    const result = await uploadVideo({
        videoPath: tmp,
        metadata: { title: 'Test', privacyStatus: 'private', tags: ['a', 'b'] },
        tokens: { accessToken: 'x', scope: '', tokenType: 'Bearer' },
        mode: 'dry-run',
    });

    assert.ok(result.dryRun);
    assert.ok(result.videoId.startsWith('dryrun_'));
    assert.ok(result.url.includes(result.videoId));
    fs.unlinkSync(tmp);
});

test('uploadVideo rejects missing file', async () => {
    await assert.rejects(
        uploadVideo({
            videoPath: '/nonexistent/video.mp4',
            metadata: { title: 'X', privacyStatus: 'private' },
            tokens: { accessToken: 'x', scope: '', tokenType: 'Bearer' },
            mode: 'dry-run',
        }),
        /not found/
    );
});
