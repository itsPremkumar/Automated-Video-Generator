# Quickstart Guide

This guide covers the fastest working paths for both normal users and developers.

## Choose Your Path

### Windows desktop app

Use this if you want the easiest local install:

1. Download the latest Windows installer from the GitHub releases page.
2. Install `Automated Video Generator`.
3. Launch the app.
4. If the setup wizard appears, click `Install Missing Dependencies` or `Launch App`.
5. In the browser portal, save your `PEXELS_API_KEY`.
6. Paste a script or use the sample script.
7. Click `Generate Video`.
8. Stay on the live status page until the MP4 is ready.

Important notes:

- The desktop app bundles its own runtime.
- Voice generation prefers bundled `Edge-TTS`.
- If `Edge-TTS` is unavailable on Windows, the app now falls back to Windows offline speech.
- If neither is available and `gtts` is usable, Google TTS is used as a later fallback.

See [docs/WINDOWS_INSTALLER.md](./docs/WINDOWS_INSTALLER.md) for the full desktop flow.

### Windows repo launcher

Use this if you cloned the repository and want the browser-first workflow:

```powershell
.\Start-Automated-Video-Generator.bat
```

If you prefer PowerShell:

```powershell
.\Start-Automated-Video-Generator.ps1
```

The launcher can:

- create `.env` from `.env.example`
- install Node dependencies
- install Python voice dependencies
- start the local portal
- open the browser automatically

### Developer setup

Use this if you are modifying the codebase:

```bash
npm install
python -m pip install -r requirements.txt
npm run dev
```

Then open:

```text
http://localhost:3001/
```

If `python` is not available on Windows, try:

```bash
py -m pip install -r requirements.txt
```

## Recommended Verification

For local development:

```bash
npx tsc -p tsconfig.json --noEmit
```

For Electron main process changes:

```bash
cmd /c node_modules\.bin\tsc.cmd -p tsconfig.electron.json --noEmit
```

For desktop bundle sanity:

```bash
npm run electron:verify-bundle
```

If you already built the unpacked Windows app:

```bash
npm run electron:verify-release
```

## Health Checks

Start the portal:

```bash
npm run dev
```

Then open:

```text
http://localhost:3001/health
```

Use the setup page and health endpoint to confirm:

- Pexels key is saved
- voice engine is ready
- FFmpeg is available
- the portal is running normally

## Troubleshooting

### Desktop app says the voice engine is unavailable

- Open the setup wizard and repair dependencies.
- On Windows, make sure at least one speech voice is installed in system speech settings.
- See [docs/WINDOWS_INSTALLER.md](./docs/WINDOWS_INSTALLER.md) for the repair flow.

### Render works on one machine but not another

- Run the typechecks.
- Run `npm run electron:verify-bundle`.
- If testing a packaged build, run `npm run electron:verify-release`.
- Compare the `/health` output between both machines.

### Need the full setup details

Use these docs:

- [docs/SETUP.md](./docs/SETUP.md)
- [docs/WINDOWS_INSTALLER.md](./docs/WINDOWS_INSTALLER.md)
- [docs/PRODUCTION_HARDENING.md](./docs/PRODUCTION_HARDENING.md)
