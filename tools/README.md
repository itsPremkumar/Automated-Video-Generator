# tools/ — Standalone Free Asset-Creation Engines

These are **separate, self-contained asset-generation projects** kept outside the
main TypeScript build of Automated-Video-Generator. They extend AVG's agentic
pipeline with **completely free, offline, zero-API-key** asset creation.

## Folder map
| Folder | Lang | What it does | Verified |
|---|---|---|---|
| `asset-creator/` | Node.js | ffmpeg-driven creation: images (bg/title/quote cards), video clips (Ken-Burns/kinetic/countdown), procedural background music, SFX (whoosh/ding/impact/pop/click), GIF, placeholder. | ✅ 14/14 tests |
| `computer-agent/` | Python | computer_use (cua-driver) browser-driven advanced generation: launch Chrome, navigate/type in web AI tools (HF Spaces SDXL), screenshot any app, drive Shotcut, record screen to MP4. | ✅ 5/5 tests |

## Why separate?
AVG is TypeScript/Node. `asset-creator` is plain Node (ffmpeg-static only, no
TS toolchain) and `computer-agent` is Python (cua-driver + stdlib). Keeping them
in `tools/` avoids polluting AVG's `src/` typecheck/build while remaining part of
the repo and consumable by the agentic pipeline via `require()` / `subprocess`.

## Run them
```bash
# asset-creator (Node)
cd tools/asset-creator && npm install && node --test

# computer-agent (Python)
cd tools/computer-agent && python -m pytest test/test_agent.py -q
# live demo: open site + type + record
python demo_record.py
```

## Integration with AVG
The agentic pipeline (`src/agentic/acquire.ts`) can call these as fallback asset
sources when stock download fails or no asset exists — `asset-creator` for
procedural media, `computer-agent` for real AI-generated images via the browser.
