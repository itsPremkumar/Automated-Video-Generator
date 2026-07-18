#!/usr/bin/env node
/**
 * test-voicebox-voices.mjs
 *
 * Exercises EVERY voice scenario the agentic pipeline can use, against a live
 * Voicebox backend, and writes one WAV per scenario so you can A/B them.
 *
 * Scenarios:
 *   A) Kokoro PRESET narrator voices (license-clean fictional voices, no clone)
 *        - af_heart  (warm female)
 *        - am_adam   (male)
 *        - af_bella  (bright female)
 *   B) CLONED voice (Chatterbox-Turbo) — your voice (placeholder until you
 *        re-run scripts/setup-voicebox-clone.mjs with a real clip)
 *   C) Switch demonstration: the same line rendered through A and B to compare.
 *
 * Prereq: Voicebox backend running on VOICEBOX_API_URL (default :17493),
 * started with: env PYTHONPATH= .venv/Scripts/python.exe -m backend.main \
 *   --host 127.0.0.1 --port 17493 --data-dir C:/one/voicebox/.voicebox-data
 *
 * Usage: node scripts/test-voicebox-voices.mjs
 */
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const API = process.env.VOICEBOX_API_URL || 'http://127.0.0.1:17493';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, '..', 'voicebox-test-output');
fs.mkdirSync(outDir, { recursive: true });

const LINE = 'Welcome to the channel. Today we explore how artificial intelligence is changing video creation forever.';

// Pull live profile ids from the backend so this script never goes stale.
async function getProfiles() {
  const r = await fetch(`${API}/profiles`);
  if (!r.ok) throw new Error(`profiles list failed: ${r.status}`);
  return r.json();
}
function find(profiles, nameFragment) {
  const p = profiles.find((x) => x.name.toLowerCase().includes(nameFragment.toLowerCase()));
  if (!p) throw new Error(`no profile matching "${nameFragment}"`);
  return p;
}

async function speak(profileId, engine, label) {
  const start = await fetch(`${API}/speak`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: LINE, profile: profileId, engine, language: 'en' }),
  });
  if (!start.ok) throw new Error(`${label}: /speak -> ${start.status} ${await start.text()}`);
  const { id } = await start.json();

  // poll SSE status
  let status = 'generating';
  for (let i = 0; i < 120 && status !== 'completed' && status !== 'complete' && status !== 'done'; i++) {
    await new Promise((r) => setTimeout(r, 3000));
    const s = await fetch(`${API}/generate/${id}/status`);
    const raw = (await s.text()).split('\n').find((l) => l.startsWith('data:')) || '';
    const j = JSON.parse(raw.replace(/^data:\s*/, ''));
    status = j.status;
    if (status === 'error' || status === 'failed') throw new Error(`${label}: gen error ${j.error}`);
  }
  if (status !== 'completed' && status !== 'complete' && status !== 'done')
    throw new Error(`${label}: timed out (status=${status})`);

  const audio = await fetch(`${API}/audio/${id}`);
  if (!audio.ok) throw new Error(`${label}: audio -> ${audio.status}`);
  const buf = Buffer.from(await audio.arrayBuffer());
  const file = path.join(outDir, `${label}.wav`);
  fs.writeFileSync(file, buf);
  // quick validity check
  const riff = buf.slice(0, 4).toString('ascii');
  const ok = riff === 'RIFF' && buf.length > 1000;
  console.log(`  [${label}] ${ok ? 'OK' : 'FAIL'}  ${(buf.length / 1024).toFixed(0)} KB  -> ${file}`);
  return ok;
}

(async () => {
  console.log(`Voicebox multi-scenario test -> ${API}`);
  let profiles = [];
  try {
    profiles = await getProfiles();
  } catch (e) {
    console.error(`Cannot reach Voicebox backend: ${e.message}`);
    console.error('Start it first (see docs VOICE_CLONING_GUIDE.md §10.2).');
    process.exit(1);
  }
  console.log(`Found ${profiles.length} profiles.`);

  const scenarios = [
    { label: 'A1_kokoro_heart',  profile: find(profiles, 'Kokoro Heart'),  engine: 'kokoro' },
    { label: 'A2_kokoro_adam',   profile: find(profiles, 'Kokoro Adam'),   engine: 'kokoro' },
    { label: 'A3_kokoro_bella',  profile: find(profiles, 'Kokoro Bella'),  engine: 'kokoro' },
    { label: 'B_clone_chatterbox', profile: find(profiles, 'clone'),       engine: 'chatterbox_turbo' },
  ];

  let pass = 0;
  for (const s of scenarios) {
    try {
      const ok = await speak(s.profile.id, s.engine, s.label);
      if (ok) pass++;
    } catch (e) {
      console.log(`  [${s.label}] ERROR ${e.message}`);
    }
  }
  console.log(`\n${pass}/${scenarios.length} scenarios produced valid audio.`);
  console.log(`Outputs in: ${outDir}`);
  console.log('A = Kokoro preset narrator (fictional, license-clean). B = Chatterbox-Turbo clone (placeholder until you supply your real voice clip).');
  process.exit(pass === scenarios.length ? 0 : 1);
})();
