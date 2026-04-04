# Windows Desktop App & Installer Documentation

This document providing a comprehensive guide to building, packaging, and distributing the **Automated Video Generator** as a standalone Windows application.

## 🚀 Overview

The Windows version is a **zero-setup, self-contained application**. It enables users to generate AI videos without needing to manually install Node.js, Python, or manage environment variables.

### Key Features
- **Standalone Runtime**: Embedded Node.js and Python.
- **Embedded Dependencies**: Pre-installed `edge-tts` and `pip` in a portable Python environment.
- **One-Click Installer**: Provided as a standard `.exe` (NSIS).
- **Background Server**: Automatically launches the Express portal on startup.

---

## 🛠️ Development & Building

### Prerequisites
- Node.js (v18+)
- Python (v3.12 recommended)
- `npm`

### 1. Compiling the App
Before building the installer, you must compile the TypeScript code for the Electron main process:
```bash
npm run electron:compile
```
This generates the `dist-electron/electron-main.js` file.

### 2. Building the Installer Locally
To generate the `.exe` setup file on your machine without publishing to GitHub:
```bash
npm run electron:build
```
The output will be found in the `release/` folder as `Automated Video Generator Setup 1.0.0.exe`.

### 3. Testing the Unpacked App
To test the app without running a full installer (faster for debugging):
```bash
npm run electron:pack
```
The unpacked application will be in `release/win-unpacked/Automated Video Generator.exe`.

---

## 🌎 Releasing to GitHub

The application is configured to automatically upload builds to GitHub Releases.

### Option A: Automatic via GitHub Actions (Recommended)
This repo includes a CI/CD workflow that builds and releases the app whenever you push a version tag.
1. Update `"version"` in `package.json` (e.g., `1.0.1`).
2. Commit and push:
   ```bash
   git tag v1.0.1
   git push origin v1.0.1
   ```
3. GitHub will start the "Release" Action, build the app, and attach the `.exe` to a new release automatically.

### Option B: Manual Release Script
If you want to push a release directly from your local machine:
```bash
npm run electron:release
```
**Required**: You must have a `GH_TOKEN` environment variable set with GitHub "repo" permissions.

---

## 🏗️ Technical Architecture

### 1. Portable Python Setup
The app uses a script (`scripts/setup-portable-python.cjs`) that:
- Downloads the official Python 3.12 embeddable package.
- Installs `pip` using `get-pip.py`.
- Installs `edge-tts` and its dependencies into the local `portable-python` directory.
- This directory is then bundled into the installer's `resources` folder.

### 2. The Electron Main Process
The `electron/electron-main.ts` file is the brain of the app:
- It spawns a child process of itself using `ELECTRON_RUN_AS_NODE=1` to run the `src/server.ts` backend.
- It detects the portable Python location and sets it in the environment.
- It displays a native "Startup Error" dialog if the background server fails to bind its port.

### 3. Path Resolution
All file paths (for assets, music, and voice generation) are resolved relative to `process.resourcesPath` when packaged. This allows the app to find its internal files regardless of where the user installs it.

---

## ❓ Troubleshooting

### Blank Screen on Startup
If the app opens to a white/blank screen, it usually means the backend server crashed silently.
- **Cause**: Usually a module resolution error (e.g., `Cannot find module 'express'`).
- **Fix**: Ensure all dependencies are included in the `files` array in `electron-builder.config.js`. I have already unified these into the `app/` directory to prevent this.

### Python Errors
If voice generation fails inside the app:
- Check if `portable-python/` exists in the local project directory before building.
- Ensure the `voice-generator.ts` is looking for the `edge-tts` script inside the bundled resources.

---

## 📜 Version History
- **v1.0.0**: Initial Desktop App release. Zero-setup implementation with bundled Python and automated GitHub releases.
