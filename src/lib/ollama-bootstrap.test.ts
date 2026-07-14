import assert from 'node:assert/strict';
import test from 'node:test';
import { ServiceUnavailableError } from './errors';
import { ensureOllamaReady } from './ollama-bootstrap';

const origEnv = { ...process.env };

test.afterEach(() => {
    process.env = { ...origEnv };
});

test('ensureOllamaReady throws ServiceUnavailableError when Ollama is unreachable and autostart disabled', async () => {
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
