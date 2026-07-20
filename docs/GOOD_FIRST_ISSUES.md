# Good First Issues — Automated Video Generator

Paste-ready GitHub issues. Each is scoped, low-risk, and does not touch the core
generation pipeline. Format: **Title** → **Body**. Labels: `good first issue`.

---

### Issue 1 — Add an architecture SVG diagram to the README
**Body:**
The README has an ASCII architecture diagram. A clean SVG would read better and look more professional on the landing page.
- Create `assets/architecture.svg` showing: Runtimes → Application → Infrastructure → Lib/Services (hexagonal style)
- Use brand color `#4F46E5`
- Replace the ASCII block in `README.md`
Labels: `good first issue`, `documentation`

### Issue 2 — Write an end-to-end render smoke test for CI
**Body:**
Current integration tests cover parse→validate→workspace but not an actual Remotion render. A headless 1-scene render test would catch regressions.
- Add a CI job (or `test:e2e` script) that renders a single scene using a local asset + bundled `input/input-assets/default.mp4`
- Skip gracefully if ffmpeg/Remotion unavailable
- Files: `src/`, `.github/workflows/ci.yml`
Labels: `good first issue`, `testing`

### Issue 3 — Improve CLI `--help` output
**Body:**
`npm run generate` accepts `--resume` and `--segment` but there's no built-in help describing all options and example `input-scripts.json` shapes.
- Print a usage block when `--help` is passed
- Document example configs
- File: `src/cli.ts`
Labels: `good first issue`, `enhancement`

### Issue 4 — Add a CONTRIBUTING quickstart for non-Windows users
**Body:**
Setup docs lean Windows-heavy (`.bat`, `winget`). Linux/macOS users need a clear path.
- Add a "Linux / macOS" section to `QUICKSTART.md` covering Python venv + `pip install -r requirements.txt` + `npm run dev`
- File: `QUICKSTART.md`
Labels: `good first issue`, `documentation`

### Issue 5 — Add an Instagram/TikTok upload adapter
**Body:**
We have a working YouTube upload adapter in `youtube-upload/` (OAuth + resumable upload, dry-run verified). Extend the pattern to Instagram Graph API and TikTok Content Posting API.
- Mirror `youtube-upload/src/uploader.ts` structure
- Keep dry-run mode (no credentials needed to verify)
- Files: new `instagram-upload/`, `tiktok-upload/`
Labels: `good first issue`, `enhancement`

### Issue 6 — Add niche "faceless channel" script packs
**Body:**
The tool shines for faceless YouTube/TikTok channels. Ship 2–3 example script packs (e.g. motivation, finance facts, quotes) under `examples/script-packs/` so new users can batch-generate immediately.
- Each pack = a JSON of scripts with `[Visual:]` tags + voice config
- Add a README per pack
Labels: `good first issue`, `enhancement`
