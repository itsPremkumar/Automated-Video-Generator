#!/usr/bin/env node
/**
 * vendor-real-voice-backend.mjs
 *
 * Produces a CLEAN, self-contained copy of the Voicebox backend inside this
 * project at:  src/adapters/real-voice-backend/backend/
 *
 * Source is the EXISTING local clone at /c/one/voicebox (already on latest
 * upstream `main`, commit 52f8d8d). The original clone is NEVER modified —
 * this is a one-way copy+strip into our repo.
 *
 * License: Voicebox is MIT (Copyright (c) 2026 Voicebox Contributors). We are
 * permitted to copy/modify/sell the code; the only duty is to retain the
 * LICENSE + copyright notice. We do that by copying LICENSE next to the
 * vendored backend and adding a VENDORED attribution note.
 *
 * REMOVED (unwanted / paid / bloat):
 *   1. routes/cloud.py            -> Voicebox Cloud paid sync service
 *   2. services/cloud.py          -> Voicebox Cloud paid sync service
 *   3. backends/hume_backend.py   -> HumeAI TADA PAID commercial API (needs key + ToS)
 *   4. routes/rocm.py / services/rocm.py   -> ROCm GPU-binary auto-updater (unneeded)
 *   5. routes/cuda.py / services/cuda.py   -> CUDA GPU-binary auto-updater (unneeded)
 *   6. tests/                     -> upstream test suite (not needed at runtime)
 *   7. __pycache__/               -> bytecode caches
 *
 * PATCH: routes/__init__.py registers the cloud router unconditionally, so
 * deleting routes/cloud.py alone would break boot (ModuleNotFoundError). We
 * strip the two cloud-registration lines from the copy.
 *
 * KEPT (free, MIT/Apache engines your pipeline uses):
 *   kokoro, chatterbox, qwen, pytorch, mlx, luxtts backends + core
 *   services/routes/utils/database/mcp_server + the LICENSE.
 */

import fs from 'node:fs';
import path from 'node:path';

const SRC = 'C:/one/voicebox/backend';
const ROOT = path.resolve('src/adapters/real-voice-backend');
const DST = path.join(ROOT, 'backend');

const log = (...a) => console.log('[REAL-VOICE-BACKEND]', ...a);
const warn = (...a) => console.warn('[REAL-VOICE-BACKEND][warn]', ...a);

function rmrf(p) {
  if (!fs.existsSync(p)) return false;
  fs.rmSync(p, { recursive: true, force: true });
  return true;
}

function copyDir(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dst, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '__pycache__') continue; // skip bytecode caches
      copyDir(s, d);
    } else {
      fs.copyFileSync(s, d);
    }
  }
}

// ---- 1. Clean destination ----
if (fs.existsSync(ROOT)) {
  log('removing previous vendored folder at', ROOT);
  rmrf(ROOT);
}
fs.mkdirSync(DST, { recursive: true });

// ---- 2. Copy whole backend/ ----
log('copying', SRC, '->', DST);
copyDir(SRC, DST);

// ---- 3. Remove unwanted files / dirs ----
const REMOVE = [
  'routes/cloud.py',
  'services/cloud.py',
  'backends/hume_backend.py',
  'routes/rocm.py',
  'services/rocm.py',
  'routes/cuda.py',
  'services/cuda.py',
  'tests',
];
for (const rel of REMOVE) {
  const p = path.join(DST, rel);
  if (rmrf(p)) log('removed:', rel);
  else warn('not present (already absent):', rel);
}

// ---- 4. Patch routes/__init__.py to drop cloud router registration ----
const initPath = path.join(DST, 'routes/__init__.py');
let init = fs.readFileSync(initPath, 'utf8');
const before = init;
init = init
  .replace(/from \.cloud import router as cloud_router\s*\n/, '')
  .replace(/app\.include_router\(cloud_router\)\s*\n/, '');
if (init !== before) log('patched routes/__init__.py (removed cloud router registration)');
else warn('cloud router lines NOT found in routes/__init__.py — verify manually');
fs.writeFileSync(initPath, init);

// ---- 5. Retain LICENSE + attribution (MIT obligation) ----
const licenseSrc = 'C:/one/voicebox/LICENSE';
const licenseDst = path.join(ROOT, 'LICENSE');
if (fs.existsSync(licenseSrc)) {
  fs.copyFileSync(licenseSrc, licenseDst);
  log('retained LICENSE at', licenseDst);
} else {
  warn('LICENSE not found at', licenseSrc);
}

const NOTICE = `real-voice-backend (vendored Voicebox backend)
Source: https://github.com/jamiepine/voicebox  (branch: main, vendored 2026-07-20, commit 52f8d8d)
License: MIT  —  Copyright (c) 2026 Voicebox Contributors

This folder is a clean copy of the upstream Voicebox backend containing ONLY
the required backend code for local TTS. Removed for our use:
  - Voicebox Cloud sync      (routes/cloud.py, services/cloud.py)
  - HumeAI TADA paid backend (backends/hume_backend.py)
  - ROCm / CUDA GPU-binary auto-updaters
  - upstream test suite, __pycache__

The cloud router registration was also stripped from routes/__init__.py.

All remaining code is MIT and may be used, modified, and distributed
commercially. See LICENSE for the full text.
`;
fs.writeFileSync(path.join(ROOT, 'VENDORED.md'), NOTICE);
log('wrote VENDORED.md attribution note');

// ---- 6. Report ----
const countPy = (dir) => {
  let n = 0;
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.py')) n++;
    }
  };
  walk(dir);
  return n;
};
log('DONE. Clean backend at', DST);
log('Python files kept:', countPy(DST));
log('License retained:', fs.existsSync(licenseDst));
