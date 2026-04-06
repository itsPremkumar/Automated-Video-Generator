# Windows Desktop App and Installer Guide

This document explains how the Windows desktop app works, how it is packaged, and how to verify that releases are safe to ship.

## Overview

The Windows desktop app is designed so non-technical users can install a local video generator without manually setting up Node.js, Python, or FFmpeg.

The current desktop flow is more resilient than the original implementation:

- the app can open a setup wizard when repair is needed
- the setup wizard can now actually launch the app
- narration no longer depends only on a globally installed `edge-tts`
- packaged builds are verified before and after build output is created

## Desktop Runtime Architecture

The Windows app is made of these parts:

1. Electron main process
2. local Express server started as a child process
3. browser portal UI
4. bundled desktop resources in `resources/app-bundle`
5. bundled portable Python runtime for `Edge-TTS`

### Startup flow

At launch, the desktop app:

1. verifies whether a working voice engine exists
2. shows the setup window if repair may be needed
3. starts the backend server through Electron
4. opens the portal in the main desktop window
5. keeps the app available through the tray

### Setup wizard flow

The setup window is now a real control surface:

- `Install Missing Dependencies` repairs the bundled runtime when possible
- `Launch App` starts the backend and opens the portal
- `Skip` also starts the app instead of silently closing the setup window
- closing the setup window before launch exits cleanly instead of leaving the app half-open

## Voice Engine Strategy

Voice generation on Windows now follows this order:

1. bundled `edge-tts.exe`
2. bundled Python `-m edge_tts`
3. system `edge-tts`
4. Windows offline speech voices using `System.Speech`
5. Google TTS fallback when available

Why this matters:

- a developer laptop may already have Python and `edge-tts` installed
- a normal user laptop usually does not
- the desktop app must still work on the second machine

The new Windows offline speech fallback is especially important for fresh installs and partially broken voice runtimes.

## Security and Reliability Defaults

The desktop build now includes these protections:

- Electron windows run with `contextIsolation: true`
- Electron windows run with `sandbox: true`
- navigation and `window.open()` are guarded
- external URLs are allowlisted
- render Chromium web security is enabled by default
- release verification checks for bundled runtime files before shipping

If you must disable Chromium web security for debugging:

```bash
set REMOTION_DISABLE_WEB_SECURITY=1
```

Do not enable this in normal releases unless you fully understand the risk.

## Build and Packaging Workflow

### 1. Verify source bundle inputs

```bash
npm run electron:verify-bundle
```

This checks source-side requirements such as:

- `requirements.txt`
- `portable-python/python.exe`
- `portable-python/Scripts/edge-tts.exe`
- desktop icons
- setup HTML

### 2. Compile Electron code

```bash
npm run electron:compile
```

### 3. Build installer

```bash
npm run electron:build
```

This now performs:

1. source bundle verification
2. Electron TypeScript compilation
3. Electron build
4. unpacked release verification

### 4. Build unpacked app for testing

```bash
npm run electron:pack
```

The unpacked app is typically created in:

```text
release/win-unpacked/
```

### 5. Verify unpacked release manually

```bash
npm run electron:verify-release
```

This checks the unpacked release for:

- packaged executable
- packaged icons
- `resources/app-bundle/requirements.txt`
- packaged portable Python
- packaged `edge-tts.exe`

## Release Workflow

### Local release

```bash
npm run electron:release
```

This requires a valid `GH_TOKEN` for GitHub publishing.

### Tag-based GitHub release

1. Update the version in `package.json`
2. Commit the version change
3. Create and push a tag
4. Let GitHub Actions build and publish the installer

## Common Troubleshooting

### "Edge-TTS is not available"

The app should no longer stop at that single point of failure.

Check these in order:

1. open the setup wizard and repair dependencies
2. verify the bundled runtime with `npm run electron:verify-bundle`
3. verify the unpacked release with `npm run electron:verify-release`
4. confirm Windows has at least one speech voice installed

If Windows offline speech is available, the app can still narrate even when `Edge-TTS` is unavailable.

### App closes after setup

That behavior was fixed. If it happens again, treat it as a bug and check:

- whether the backend server failed during startup
- whether the unpacked release is missing bundled files
- whether the tray or main window was created successfully

### Blank screen or empty portal

Possible causes:

- backend server startup failure
- missing packaged dependencies
- incorrect release contents

Use:

```bash
npm run electron:verify-release
```

and inspect the startup error dialog if one appears.

### Works in dev, fails in packaged app

That usually means your dev machine is using globally installed tools that are not actually bundled.

Always verify the packaged output, not just the dev environment.

## Files Involved

Important desktop files:

- `electron/electron-main.ts`
- `electron/electron-preload.ts`
- `electron/electron-setup.html`
- `scripts/verify-desktop-bundle.cjs`
- `scripts/setup-portable-python.cjs`
- `electron-builder.config.js`
- `src/lib/voice-generator.ts`

## Related Docs

- [../QUICKSTART.md](../QUICKSTART.md)
- [SETUP.md](./SETUP.md)
- [PRODUCTION_HARDENING.md](./PRODUCTION_HARDENING.md)
