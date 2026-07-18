#!/usr/bin/env node
/**
 * setup-voicebox-clone.mjs
 *
 * One-shot setup that registers YOUR real voice as a clone profile in the
 * Voicebox headless backend, then writes the resulting profile id into the
 * project .env so the agentic pipeline narrates in YOUR voice.
 *
 * Prereqs:
 *   - Voicebox backend running on VOICEBOX_API_URL (default http://127.0.0.1:17493)
 *     started with:  env PYTHONPATH= .venv/Scripts/python.exe -m backend.main \
 *       --host 127.0.0.1 --port 17493 --data-dir C:/one/voicebox/.voicebox-data
 *   - A clean ~10-30s reference clip of YOUR voice (WAV/MP3), passed as arg 1.
 *   - chatterbox-tts installed in the venv (clone engine, MIT).
 *
 * Usage:
 *   node scripts/setup-voicebox-clone.mjs path/to/your-voice.wav "transcript of what you said"
 *
 * The transcript is required: Voicebox stores it as the reference_text used to
 * align the clone. Read the clip's words verbatim.
 *
 * After this runs, set in .env:
 *   TTS_PROVIDER=voicebox
 *   VOICEBOX_ENGINE=chatterbox_turbo
 *   VOICEBOX_PROFILE_ID=<printed id>
 * and the pipeline will generate narration in your cloned voice.
 */
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const API = process.env.VOICEBOX_API_URL || 'http://127.0.0.1:17493';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

const clip = process.argv[2];
const transcript = process.argv[3];
if (!clip || !transcript) {
  console.error('Usage: node scripts/setup-voicebox-clone.mjs <voice-clip> "<transcript>"');
  process.exit(1);
}
if (!fs.existsSync(clip)) {
  console.error(`Reference clip not found: ${clip}`);
  process.exit(1);
}

const probe = await fetch(`${API}/models/status`).catch(() => null);
if (!probe || !probe.ok) {
  console.error(`Voicebox backend not reachable at ${API}. Start it first.`);
  process.exit(1);
}

// 1) Create a CLONED profile backed by chatterbox-turbo (MIT, ~1.5GB VRAM).
console.log('Creating cloned voice profile...');
const createRes = await fetch(`${API}/profiles`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    name: 'My Real Voice (Chatterbox Turbo)',
    voice_type: 'cloned',
    default_engine: 'chatterbox_turbo',
  }),
});
if (!createRes.ok) {
  console.error(`Profile create failed: ${createRes.status} ${await createRes.text()}`);
  process.exit(1);
}
const profile = await createRes.json();
const profileId = profile.id;
console.log(`  profile_id = ${profileId}`);

// 2) Upload the reference sample (the clip + verbatim transcript).
console.log('Uploading reference voice sample...');
const form = new FormData();
form.append('file', new Blob([fs.readFileSync(clip)], { type: 'audio/*' }), path.basename(clip));
form.append('reference_text', transcript);
const sampleRes = await fetch(`${API}/profiles/${profileId}/samples`, {
  method: 'POST',
  body: form,
});
if (!sampleRes.ok) {
  console.error(`Sample upload failed: ${sampleRes.status} ${await sampleRes.text()}`);
  process.exit(1);
}
console.log('  reference sample stored.');

// 3) Persist to .env (append or update VOICEBOX_PROFILE_ID / VOICEBOX_ENGINE).
const envPath = path.join(projectRoot, '.env');
let env = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
const setVar = (k, v) => {
  const re = new RegExp(`^${k}=.*$`, 'm');
  if (re.test(env)) env = env.replace(re, `${k}=${v}`);
  else env += `\n${k}=${v}\n`;
};
setVar('TTS_PROVIDER', 'voicebox');
setVar('VOICEBOX_ENGINE', 'chatterbox_turbo');
setVar('VOICEBOX_PROFILE_ID', profileId);
fs.writeFileSync(envPath, env);
console.log(`\nDone. Wrote VOICEBOX_PROFILE_ID=${profileId} to ${envPath}`);
console.log('The agentic pipeline will now narrate in your cloned voice.');
