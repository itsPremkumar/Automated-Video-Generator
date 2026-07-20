import assert from 'node:assert';
import { test } from 'node:test';
import {
    NullBridge,
    ModelBridge,
    McpDriverBridge,
    resolveBridge,
    type DriverLlmCallback,
    type BridgeScore,
} from '../../../src/agentic/ai/bridge.js';

// A fake "configured model" so ModelBridge is exercised offline (no network).
function fakeModel(): ModelBridge {
    const b = new ModelBridge();
    // @ts-expect-error override brain with a deterministic stub
    b.brain = {
        completeJSON: async <T>(_s: string, _p: string, _h: string): Promise<T | null> =>
            ({
                script: 'model-script',
            }) as unknown as T,
    };
    return b;
}

test('NullBridge: every method returns null (signal floor)', async () => {
    const n = new NullBridge();
    assert.strictEqual(await n.completeJSON(), null);
    assert.strictEqual(await n.visionVerify(), null);
    assert.strictEqual(await n.judgeAudio(), null);
    assert.strictEqual(n.name, 'null');
});

test('ModelBridge: passes through configured model results', async () => {
    const b = fakeModel();
    const r = await b.completeJSON<{ script: string }>('s', 'p', 'h');
    assert.strictEqual(r?.script, 'model-script');
    assert.strictEqual(b.name, 'model');
});

test('McpDriverBridge: driver callback is used FIRST when present', async () => {
    const driver: DriverLlmCallback = async (req) => {
        if (req.type === 'json') return { script: 'driver-script' } as any;
        if (req.type === 'vision') return { pass: true, confidence: 9, reason: 'driver-ok' } as any;
        return { pass: true, confidence: 8, reason: 'driver-audio' } as any;
    };
    const b = new McpDriverBridge(driver, fakeModel());
    const j = await b.completeJSON<{ script: string }>('s', 'p', 'h');
    assert.strictEqual(j?.script, 'driver-script');
    const v = await b.visionVerify('/x.jpg', ['k']);
    assert.strictEqual(v?.reason, 'driver-ok');
    const a = await b.judgeAudio('t', 'e', ['f']);
    assert.strictEqual(a?.reason, 'driver-audio');
    assert.strictEqual(b.name, 'driver');
});

test('McpDriverBridge: falls back to model when driver returns null', async () => {
    const driver: DriverLlmCallback = async () => null; // driver declines
    const b = new McpDriverBridge(driver, fakeModel());
    const j = await b.completeJSON<{ script: string }>('s', 'p', 'h');
    assert.strictEqual(j?.script, 'model-script'); // model tier used
});

test('McpDriverBridge: falls back to model when driver throws', async () => {
    const driver: DriverLlmCallback = async () => {
        throw new Error('driver down');
    };
    const b = new McpDriverBridge(driver, fakeModel());
    const j = await b.completeJSON<{ script: string }>('s', 'p', 'h');
    assert.strictEqual(j?.script, 'model-script');
});

test('McpDriverBridge: with no driver callback, behaves exactly like its fallback', async () => {
    const b = new McpDriverBridge(undefined, fakeModel());
    const j = await b.completeJSON<{ script: string }>('s', 'p', 'h');
    assert.strictEqual(j?.script, 'model-script');
});

test('McpDriverBridge: setDriver can swap the callback at runtime', async () => {
    const b = new McpDriverBridge(undefined, fakeModel());
    // Before driver set: uses the model fallback.
    assert.strictEqual((await b.completeJSON<{ script: string }>('s', 'p', 'h'))?.script, 'model-script');
    b.setDriver(async () => ({ script: 'new-driver' }) as any);
    assert.strictEqual((await b.completeJSON<{ script: string }>('s', 'p', 'h'))?.script, 'new-driver');
});

test('resolveBridge: driver callback present -> McpDriverBridge', () => {
    const b = resolveBridge({ driverLLM: async () => null, hasModelKeys: true });
    assert.strictEqual(b.name, 'driver');
});

test('resolveBridge: model keys present, no driver -> ModelBridge', () => {
    const b = resolveBridge({ hasModelKeys: true });
    assert.strictEqual(b.name, 'model');
});

test('resolveBridge: no keys, no driver -> NullBridge (offline floor)', () => {
    const b = resolveBridge({});
    assert.strictEqual(b.name, 'null');
});

test('End-to-end cascade: driver -> model -> null over all three methods', async () => {
    // Driver handles json only; vision + audio fall through to model; model returns
    // null for everything -> signal floor (null) for vision/audio.
    const model = fakeModel();
    model.visionVerify = async () => null;
    model.judgeAudio = async () => null;
    const driver: DriverLlmCallback = async (req) => (req.type === 'json' ? ({ script: 'd' } as any) : null);
    const b = new McpDriverBridge(driver, model);
    assert.strictEqual((await b.completeJSON<{ script: string }>('s', 'p', 'h'))?.script, 'd');
    assert.strictEqual(await b.visionVerify('/x.jpg', ['k']), null); // model null -> floor
    assert.strictEqual(await b.judgeAudio('t', 'e', ['f']), null);
});
