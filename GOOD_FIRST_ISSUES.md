# Good First Issues — Automated Video Generator

These are scoped, low-risk tasks ideal for new contributors. Each is self-contained
and does not touch the core generation pipeline. Pick one and open a PR!

---

## 1. Add a `workflow-demo.gif` to the README
- **Area:** Docs
- **Why:** The README references `assets/workflow-demo.gif` (terminal recording of
  `npm run generate` → progress → output MP4) but the file doesn't exist yet.
- **How:** Record with `vhs` (https://github.com/charmbracelet/vhs) or asciinema + agg.
  Keep it optimized (~3–5 MB max).
- **Files:** `README.md`, `assets/`
- **Labels:** `good first issue`, `documentation`

## 2. Add an architecture SVG diagram
- **Area:** Docs
- **Why:** The README has an ASCII architecture diagram. A clean SVG/PNG would read better.
- **How:** Create `assets/architecture.svg` showing Runtimes → Application →
  Infrastructure → Lib/Services with brand color `#4F46E5`.
- **Files:** `README.md`, `assets/`
- **Labels:** `good first issue`, `documentation`

## 3. Add a "Creative" theme using `assets/logo-creative.png`
- **Area:** UI
- **Why:** `assets/logo-creative.png` exists but is referenced nowhere in code.
- **How:** Add a theme toggle (or env flag `UI_THEME=creative`) that swaps the
  standard logo/accents for the creative variant.
- **Files:** `src/views/layout.view.ts`, `src/constants/config.ts`
- **Labels:** `good first issue`, `enhancement`

## 4. Write an end-to-end render smoke test for CI
- **Area:** Testing
- **Why:** Current integration tests cover parse→validate→workspace but not an actual
  Remotion render. A headless 1-scene render test would catch regressions.
- **How:** Add a CI job (or `test:e2e` script) that renders a single scene using a
  local asset + bundled `default.mp4`, skipping if ffmpeg/Remotion unavailable.
- **Files:** `src/`, `.github/workflows/ci.yml`
- **Labels:** `good first issue`, `testing`

## 5. Improve CLI help / `--help` output
- **Area:** DX
- **Why:** `npm run generate` accepts `--resume` and `--segment` but there's no
  built-in help describing all options and example `input-scripts.json` shapes.
- **How:** Print a usage block when `--help` is passed; document example configs.
- **Files:** `src/cli.ts`
- **Labels:** `good first issue`, `enhancement`

## 6. Add a CONTRIBUTING quickstart for non-Windows users
- **Area:** Docs
- **Why:** Setup docs lean Windows-heavy (`.bat`, `winget`). Linux/macOS users need
  a clear path.
- **How:** Add a "Linux / macOS" section to `QUICKSTART.md` covering Python venv +
  `pip install -r requirements.txt` + `npm run dev`.
- **Files:** `QUICKSTART.md`
- **Labels:** `good first issue`, `documentation`
