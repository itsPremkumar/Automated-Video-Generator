import assert from 'node:assert/strict';
import test from 'node:test';
import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';
import {
  generateVoiceoverWithVoicebox,
  generateVoiceoverWithXtts,
  generateVoiceoverWithLocalOpenAI
} from './api-tts-provider';

// Mock axios
let axiosMockCalls: any[] = [];
let mockResponseData: any = Buffer.from('mock-audio-data');

test.beforeEach(() => {
  axiosMockCalls = [];
  mockResponseData = Buffer.from('mock-audio-data');
});

// We patch axios.post to intercept requests
const originalPost = axios.post;
axios.post = async function (url: string, data?: any, config?: any): Promise<any> {
  axiosMockCalls.push({ url, data, config });
  return {
    status: 200,
    data: mockResponseData,
  };
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

test('generateVoiceoverWithVoicebox makes post request and writes file', async () => {
  process.env.VOICEBOX_API_URL = 'http://localhost:17493';
  process.env.VOICEBOX_PROFILE_ID = 'test-profile-123';

  const testFile = path.join(tempOutputDir, 'voicebox-test.wav');
  if (fs.existsSync(testFile)) fs.unlinkSync(testFile);

  await generateVoiceoverWithVoicebox('Hello Voicebox', testFile, 'en');

  assert.equal(axiosMockCalls.length, 1);
  assert.equal(axiosMockCalls[0].url, 'http://localhost:17493/generate');
  assert.deepEqual(axiosMockCalls[0].data, {
    text: 'Hello Voicebox',
    profile_id: 'test-profile-123',
    language: 'en'
  });
  assert.ok(fs.existsSync(testFile));
  assert.equal(fs.readFileSync(testFile, 'utf8'), 'mock-audio-data');
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
    language: 'es'
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
    response_format: 'mp3'
  });
  assert.equal(axiosMockCalls[0].config.headers['Authorization'], 'Bearer test-api-key');
  assert.ok(fs.existsSync(testFile));
  assert.equal(fs.readFileSync(testFile, 'utf8'), 'mock-audio-data');
});
