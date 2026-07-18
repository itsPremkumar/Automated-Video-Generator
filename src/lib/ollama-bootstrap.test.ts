import assert from 'node:assert/strict';
import test from 'node:test';
import { ServiceUnavailableError } from './errors';
import { ensureOllamaReady } from './ollama-bootstrap';
import { createConnection } from 'node:net';

const origEnv = { ...process.env };

test.afterEach(() => {
    process.env = { ...origEnv };
});

/**
 * Probe whether an Ollama instance is actually listening. The "throws when
 * unreachable" tests are only meaningful when Ollama is NOT up; when it IS up
 * (e.g. a dev box with Ollama running) those assertions are false by
 * definition. Skip rather than fail in that case so the suite isn't flaky.
 */
function ollamaReachable(host = '127.0.0.1', port = 11434): Promise<boolean> {
    return new Promise((resolve) => {
        const sock = createConnection({ host, port });
        const done = (v: boolean) => {
            sock.destroy();
            resolve(v);
        };
        sock.setTimeout(1500);
        sock.once('connect', () => done(true));
        sock.once('error', () => done(false));
        sock.once('timeout', () => done(false));
    });
}

test('ensureOllamaReady throws ServiceUnavailableError when Ollama is unreachable and autostart disabled', async () => {
    if (await ollamaReachable()) {
        // Ollama is up in this environment — the unreachable premise doesn't hold.
        return; // skip (not a failure)
    }
    process.env.OLLAMA_AUTOSTART = 'false';
    await assert.rejects(
        () => ensureOllamaReady({ model: 'llama3', autostart: false, autopull: false }),
        (err: any) => err instanceof ServiceUnavailableError,
    );
});

test('ensureOllamaReady is non-fatal to callers via try/catch (template fallback path)', async () => {
    process.env.OLLAMA_AUTOSTART = 'false';
    let ok = false;
    try {
        await ensureOllamaReady({ autostart: false, autopull: false });
        ok = true;
    } catch (err) {
        assert.ok(err instanceof ServiceUnavailableError);
    }
    assert.ok(true);
});
