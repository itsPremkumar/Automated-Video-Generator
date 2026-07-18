import assert from 'node:assert/strict';
import test from 'node:test';
import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';
import {
    generateVoiceoverWithVoicebox,
    generateVoiceoverWithXtts,
    generateVoiceoverWithLocalOpenAI,
} from './api-tts-provider';

// Mock axios
let axiosMockCalls: any[] = [];
let mockResponseData: any = Buffer.from('mock-audio-data');

test.beforeEach(() => {
    axiosMockCalls = [];
    mockResponseData = Buffer.from('mock-audio-data');
});

// We patch axios.post / axios.get to intercept requests and simulate the
// Voicebox async flow: POST /speak -> { id }, GET /generate/{id}/status
// (SSE "data: {...}" stream, completed), GET /audio/{id} -> audio bytes.
const mockGenId = 'gen-test-123';
const originalPost = axios.post;
axios.post = async function (url: string, data?: any, config?: any): Promise<any> {
    axiosMockCalls.push({ url, data, config });
    if (url.endsWith('/speak')) {
        return { status: 200, data: { id: mockGenId, status: 'generating' } };
    }
    return { status: 200, data: mockResponseData };
} as any;

const originalGet = axios.get;
axios.get = async function (url: string, config?: any): Promise<any> {
    axiosMockCalls.push({ url, data: undefined, config });
    if (url.includes('/status')) {
        // status endpoint returns an SSE stream; first frame is the json.
        return {
            status: 200,
            data: `data: ${JSON.stringify({ id: mockGenId, status: 'completed', duration: 1.0, error: null })}`,
        };
    }
    if (url.includes('/audio/')) {
        // audio endpoint returns a stream of bytes (Buffer in the mock).
        return { status: 200, data: mockResponseData };
    }
    return { status: 200, data: mockResponseData };
} as any;

const tempOutputDir = path.join(__dirname, 'temp-test-audio');

test.before(() => {
    if (!fs.existsSync(tempOutputDir)) {
        fs.mkdirSync(tempOutputDir, { recursive: true });
    }
});

test.after(() => {
    if (fs.existsSync(tempOutputDir)) {
        try {
            fs.rmSync(tempOutputDir, { recursive: true, force: true });
        } catch {
            // ignore cleanup errors
        }
    }
});

test('generateVoiceoverWithVoicebox posts to /speak, polls status, downloads audio', async () => {
    process.env.VOICEBOX_API_URL = 'http://localhost:17493';
    process.env.VOICEBOX_PROFILE_ID = 'test-profile-123';

    const testFile = path.join(tempOutputDir, 'voicebox-test.wav');
    if (fs.existsSync(testFile)) fs.unlinkSync(testFile);

    await generateVoiceoverWithVoicebox('Hello Voicebox', testFile, 'en');

    // 1) POST /speak with profile + engine
    const speakCall = axiosMockCalls.find((c) => c.url && c.url.endsWith('/speak'));
    assert.ok(speakCall, 'expected a POST to /speak');
    assert.deepEqual(speakCall.data, {
        text: 'Hello Voicebox',
        profile: 'test-profile-123',
        engine: 'kokoro',
        language: 'en',
    });

    // 2) status polled, then audio downloaded
    const statusCall = axiosMockCalls.find((c) => c.url && c.url.includes('/status'));
    const audioCall = axiosMockCalls.find((c) => c.url && c.url.includes('/audio/'));
    assert.ok(statusCall, 'expected a GET to /generate/{id}/status');
    assert.ok(audioCall, 'expected a GET to /audio/{id}');

    assert.ok(fs.existsSync(testFile));
    assert.equal(fs.readFileSync(testFile, 'utf8'), 'mock-audio-data');
});

test('generateVoiceoverWithVoicebox throws when no profile is configured', async () => {
    delete process.env.VOICEBOX_PROFILE_ID;
    const testFile = path.join(tempOutputDir, 'voicebox-noprofile.wav');
    await assert.rejects(generateVoiceoverWithVoicebox('Hello', testFile, 'en'), /requires a voice profile/i);
});

test('generateVoiceoverWithXtts tries multiple endpoints and writes file', async () => {
    process.env.XTTS_API_URL = 'http://localhost:8020';
    process.env.XTTS_SPEAKER_WAV = 'custom_voice.wav';
    process.env.XTTS_LANGUAGE = 'es';

    const testFile = path.join(tempOutputDir, 'xtts-test.wav');
    if (fs.existsSync(testFile)) fs.unlinkSync(testFile);

    await generateVoiceoverWithXtts('Hola XTTS', testFile, 'es');

    assert.equal(axiosMockCalls.length, 1);
    assert.equal(axiosMockCalls[0].url, 'http://localhost:8020/tts_to_audio');
    assert.deepEqual(axiosMockCalls[0].data, {
        text: 'Hola XTTS',
        speaker_wav: 'custom_voice.wav',
        language: 'es',
    });
    assert.ok(fs.existsSync(testFile));
    assert.equal(fs.readFileSync(testFile, 'utf8'), 'mock-audio-data');
});

test('generateVoiceoverWithLocalOpenAI makes post request and writes file', async () => {
    process.env.OPENAI_LOCAL_TTS_URL = 'http://localhost:8880/v1';
    process.env.OPENAI_LOCAL_TTS_VOICE = 'af_sky';
    process.env.OPENAI_LOCAL_TTS_MODEL = 'kokoro';
    process.env.OPENAI_LOCAL_TTS_API_KEY = 'test-api-key';

    const testFile = path.join(tempOutputDir, 'openai-local-test.mp3');
    if (fs.existsSync(testFile)) fs.unlinkSync(testFile);

    await generateVoiceoverWithLocalOpenAI('Hello OpenAI Local', testFile);

    assert.equal(axiosMockCalls.length, 1);
    assert.equal(axiosMockCalls[0].url, 'http://localhost:8880/v1/audio/speech');
    assert.deepEqual(axiosMockCalls[0].data, {
        model: 'kokoro',
        input: 'Hello OpenAI Local',
        voice: 'af_sky',
        response_format: 'mp3',
    });
    assert.equal(axiosMockCalls[0].config.headers['Authorization'], 'Bearer test-api-key');
    assert.ok(fs.existsSync(testFile));
    assert.equal(fs.readFileSync(testFile, 'utf8'), 'mock-audio-data');
});
