real-voice-backend (vendored Voicebox backend)
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

The project-root THIRD_PARTY_LICENSES.md carries the canonical, tracked copy of
this MIT notice and provenance for GitHub (this folder is git-ignored).
