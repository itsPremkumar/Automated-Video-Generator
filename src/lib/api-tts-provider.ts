import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';
import { logError, logInfo, logWarn } from '../runtime';

const console = {
  log: (...args: unknown[]) => logInfo('[API-TTS]', ...args),
  warn: (...args: unknown[]) => logWarn('[API-TTS]', ...args),
  error: (...args: unknown[]) => logError('[API-TTS]', ...args),
};

/**
 * Downloads a binary stream from an axios response and writes it to a file.
 */
async function saveStreamToFile(responseStream: any, outputPath: string): Promise<void> {
  if (responseStream && typeof responseStream.pipe === 'function') {
    const writer = fs.createWriteStream(outputPath);
    responseStream.pipe(writer);
    await new Promise<void>((resolve, reject) => {
      writer.on('finish', resolve);
      writer.on('error', reject);
    });
  } else if (responseStream instanceof Buffer) {
    fs.writeFileSync(outputPath, responseStream);
  } else if (typeof responseStream === 'string') {
    // In case response is a base64 encoded audio, decode it, otherwise write as buffer
    const buf = Buffer.from(responseStream, 'base64');
    fs.writeFileSync(outputPath, buf);
  } else {
    // fallback if data is returned as ArrayBuffer/Buffer
    fs.writeFileSync(outputPath, Buffer.from(responseStream));
  }
}

/**
 * Synthesizes voice using Jamie Pine's Voicebox FastAPI endpoint.
 */
export async function generateVoiceoverWithVoicebox(
  text: string,
  outputPath: string,
  language: string = 'en'
): Promise<void> {
  const url = process.env.VOICEBOX_API_URL || 'http://localhost:17493';
  const profileId = process.env.VOICEBOX_PROFILE_ID;

  if (!profileId) {
    throw new Error('VOICEBOX_PROFILE_ID is not configured in environment variables.');
  }

  const endpoint = `${url.replace(/\/$/, '')}/generate`;
  console.log(`Sending synthesis request to Voicebox: ${endpoint} (profile: ${profileId})`);

  try {
    const response = await axios.post(
      endpoint,
      {
        text,
        profile_id: profileId,
        language: language,
      },
      {
        responseType: 'stream',
        headers: {
          'Content-Type': 'application/json',
        },
        timeout: 120000, // 2 minutes timeout for longer sentences
      }
    );

    await saveStreamToFile(response.data, outputPath);
    console.log(`Successfully generated voiceover via Voicebox: ${outputPath}`);
  } catch (error: any) {
    console.error(`Voicebox synthesis failed: ${error.message}`);
    throw error;
  }
}

/**
 * Synthesizes voice using local XTTS API Server (e.g. daswer123/xtts-api-server).
 */
export async function generateVoiceoverWithXtts(
  text: string,
  outputPath: string,
  language: string = 'en'
): Promise<void> {
  const url = process.env.XTTS_API_URL || 'http://localhost:8020';
  const speakerWav = process.env.XTTS_SPEAKER_WAV || 'cloned_speaker.wav';
  const xttsLanguage = process.env.XTTS_LANGUAGE || language || 'en';

  const baseUrl = url.replace(/\/$/, '');
  
  // We will try standard /tts_to_audio first, and fallback to /tts or /tts_post if they fail
  const endpoints = [`${baseUrl}/tts_to_audio`, `${baseUrl}/tts`, `${baseUrl}/tts_post`];
  let lastError: any = null;

  for (const endpoint of endpoints) {
    try {
      console.log(`Sending synthesis request to XTTS: ${endpoint} (speaker: ${speakerWav}, lang: ${xttsLanguage})`);
      const response = await axios.post(
        endpoint,
        {
          text,
          speaker_wav: speakerWav,
          language: xttsLanguage,
        },
        {
          responseType: 'stream',
          headers: {
            'Content-Type': 'application/json',
          },
          timeout: 120000,
        }
      );

      await saveStreamToFile(response.data, outputPath);
      console.log(`Successfully generated voiceover via XTTS: ${outputPath}`);
      return; // Success, exit function
    } catch (error: any) {
      console.warn(`XTTS endpoint ${endpoint} failed, trying fallback: ${error.message}`);
      lastError = error;
    }
  }

  throw new Error(`XTTS synthesis failed on all endpoints. Last error: ${lastError?.message}`);
}

/**
 * Synthesizes voice using local OpenAI-compatible API (e.g. Kokoro-FastAPI).
 */
export async function generateVoiceoverWithLocalOpenAI(
  text: string,
  outputPath: string
): Promise<void> {
  const url = process.env.OPENAI_LOCAL_TTS_URL || 'http://localhost:8880/v1';
  const apiKey = process.env.OPENAI_LOCAL_TTS_API_KEY || 'mock-key';
  const voice = process.env.OPENAI_LOCAL_TTS_VOICE || 'af_sky';
  const model = process.env.OPENAI_LOCAL_TTS_MODEL || 'kokoro';

  const endpoint = `${url.replace(/\/$/, '')}/audio/speech`;
  console.log(`Sending synthesis request to OpenAI-Local TTS: ${endpoint} (voice: ${voice}, model: ${model})`);

  try {
    const response = await axios.post(
      endpoint,
      {
        model,
        input: text,
        voice,
        response_format: 'mp3',
      },
      {
        responseType: 'stream',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        timeout: 120000,
      }
    );

    await saveStreamToFile(response.data, outputPath);
    console.log(`Successfully generated voiceover via OpenAI-Local TTS: ${outputPath}`);
  } catch (error: any) {
    console.error(`OpenAI-Local TTS synthesis failed: ${error.message}`);
    throw error;
  }
}
