# Desktop App Crash Troubleshooting Guide

> A comprehensive guide for diagnosing and fixing crashes in the Automated Video Generator Windows desktop app.

---

## Table of Contents

1. [Fixed Crash: EPIPE Broken Pipe](#fixed-crash-epipe-broken-pipe)
2. [Where to Find Crash Logs](#where-to-find-crash-logs)
3. [Common Crash Scenarios & Fixes](#common-crash-scenarios--fixes)
4. [Step-by-Step Debugging Workflow](#step-by-step-debugging-workflow)
5. [Video Render Failures](#video-render-failures)
6. [Developer Quick Reference](#developer-quick-reference)

---

## Fixed Crash: EPIPE Broken Pipe

### What Was Happening

The packaged Windows desktop app (`.exe` installer or `win-unpacked`) was crashing silently approximately 60–90 seconds after launch. The app would either:
- Close completely with no error message
- Show a recovery dialog saying "The desktop shell hit an unexpected error"

### Root Cause

**Error:** `EPIPE: broken pipe, write` (uncaught exception)

In a **packaged** Electron app on Windows, `process.stdout` and `process.stderr` are **pipes** — not a real console/TTY like in dev mode. When the pipe reader disappears (because there's no console window attached to a packaged `.exe`), any call to `console.log()` or `console.error()` tries to write to the broken pipe and throws an `EPIPE` error.

The app's logging system (`electron/app-logger.ts`) patches all `console.*` methods to also write to a desktop log file. However, after writing to the log file, it still calls the **original** `console.log/error`, which writes to `process.stdout/stderr`. In packaged mode, this write fails with EPIPE, and since nothing caught it, it became an **uncaught exception** that crashed the entire Electron shell.

**Why dev mode worked fine:** In dev mode (`npm run electron:dev`), the app runs from a terminal window that provides a real console — `process.stdout`/`process.stderr` are connected to the terminal, so writes always succeed.

### The Fix (3 Files Changed)

#### 1. `electron/app-logger.ts` — Core Fix

Wrapped the original `console.*` method calls in a try-catch that silently swallows `EPIPE` errors. The log message is already persisted to the desktop log file before the original call, so no data is lost.

```typescript
// BEFORE (crashed in packaged mode):
const wrapped = (...args: unknown[]) => {
    const message = format(...args);
    writeDesktopLog(level, message);
    original(...args);  // ← This writes to broken process.stdout/stderr pipe = CRASH
};

// AFTER (safe):
const wrapped = (...args: unknown[]) => {
    const message = format(...args);
    writeDesktopLog(level, message);
    try {
        original(...args);
    } catch (err: any) {
        if (err?.code !== 'EPIPE') {
            throw err;  // Only swallow EPIPE, re-throw everything else
        }
    }
};
```

#### 2. `electron/electron-main.ts` — Defense in Depth

**Stream error handlers:** Added `error` event handlers on `process.stdout` and `process.stderr` to absorb EPIPE at the stream level, preventing it from ever becoming an uncaught exception:

```typescript
for (const stream of [process.stdout, process.stderr]) {
    stream?.on?.('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'EPIPE') return;
        writeDesktopLog('error', `[Electron] stdout/stderr stream error: ${err.message}`);
    });
}
```

**EPIPE filter in uncaughtException handler:** Added early-return so EPIPE errors don't trigger the recovery dialog (which would itself try to `console.log` and potentially recurse):

```typescript
process.on('uncaughtException', (error: Error & { code?: string }) => {
    if (error.code === 'EPIPE') {
        writeDesktopLog('warn', '[Electron] Suppressed EPIPE uncaught exception');
        return;  // Don't show recovery dialog for harmless pipe errors
    }
    // ... rest of error handling
});
```

#### 3. `electron/server-manager.ts` — Server Stdin Pipe

Added an `error` handler on the spawned server process's stdin pipe. When the server dies, any buffered write to stdin fails with EPIPE:

```typescript
this.serverProcess.stdin?.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EPIPE') return;
    console.warn(tag, 'Server stdin error:', err.message);
});
```

---

## Where to Find Crash Logs

When the app crashes or behaves unexpectedly, check these locations:

| Log Type | Location |
|----------|----------|
| **Desktop Log** | `%APPDATA%\automated-video-generator\logs\desktop-*.log` |
| **Chromium Log** | `%APPDATA%\automated-video-generator\logs\chromium-*.log` |
| **Crash Dumps** | `%APPDATA%\automated-video-generator\crashDumps\` |
| **Diagnostic Snapshots** | `%APPDATA%\automated-video-generator\diagnostics\` |
| **Failure Snapshots** | `%APPDATA%\automated-video-generator\diagnostics\failure-*.json` |

### How to Read the Logs

1. **Open the logs folder:**
   - From the app: Click the system tray icon → "Open Desktop Log"
   - Manually: Open `%APPDATA%\automated-video-generator\logs\` in File Explorer

2. **Find the latest log:** Sort by "Date Modified" — the most recent `desktop-*.log` file is from the latest session.

3. **Search for errors:**
   ```powershell
   # Find all errors in the latest log
   $log = Get-ChildItem "$env:APPDATA\automated-video-generator\logs\desktop-*" | Sort-Object LastWriteTime -Descending | Select-Object -First 1
   Select-String -Path $log.FullName -Pattern "UNCAUGHT|CRASHED|fatal|EPIPE|EXCEPTION" -CaseSensitive:$false
   ```

4. **Read failure snapshots:** These JSON files contain full diagnostic info including error stack traces, dependency states, and runtime states:
   ```powershell
   Get-ChildItem "$env:APPDATA\automated-video-generator\diagnostics\failure-*" | Sort-Object LastWriteTime -Descending
   ```

---

## Common Crash Scenarios & Fixes

### 1. EPIPE: broken pipe, write

**Symptoms:** App crashes ~60-90s after launch in packaged mode (not dev mode).

**Status:** ✅ **FIXED** (see above)

**If it ever reappears:** The fix is in `app-logger.ts`, `electron-main.ts`, and `server-manager.ts`. Ensure all three files have the EPIPE guards described above.

---

### 2. Server Startup Failure (tsx not found)

**Symptoms:** Dialog says "The backend server could not start" with error about `tsx CLI not found`.

**Cause:** `node_modules` are missing or incompletely installed in the packaged app.

**Fix:**
1. Open Setup Wizard from the error dialog
2. Click "Install" next to "Node.js Dependencies"
3. Or manually run: `npm install` in the app root directory

---

### 3. Server Runtime Crash (Out of Memory)

**Symptoms:** App suddenly shows "The backend server has stopped unexpectedly" dialog during video generation.

**Cause:** Video rendering consumes too much memory (especially with high-resolution assets).

**Fix:**
1. Click "Restart Server" in the crash dialog
2. Try rendering with fewer scenes or lower resolution
3. Close other memory-intensive applications
4. The app auto-restarts up to 3 times before showing the dialog

---

### 4. Renderer Process Crash

**Symptoms:** The main window goes blank/white or shows "Aw, Snap!" error.

**Cause:** The Chromium renderer process crashed (memory, GPU, or JavaScript error).

**Built-in recovery:** The app automatically reloads the main window after 2 seconds when a renderer crash is detected (see `window-manager.ts` → `render-process-gone` handler).

**If it keeps happening:**
1. Try disabling hardware acceleration: Add `--disable-gpu` flag
2. Check GPU drivers are up to date
3. Look at the Chromium log for details

---

### 5. Voice Engine Not Found

**Symptoms:** Warning dialog at startup about "bundled voice engine could not be verified".

**Cause:** The bundled Python + edge-tts setup is missing or corrupted.

**Fix:**
1. Click "Install Dependencies" from the warning dialog
2. The Setup Wizard will auto-repair the bundled voice engine
3. Or install edge-tts manually: `pip install edge-tts`

---

### 6. Video Render Failures (Scene Errors)

**Symptoms:** Error message like "Too many scene render failures (5/8). Aborting render."

**Cause:** Individual scene renders are crashing — usually due to missing assets, Chromium download issues, or memory pressure.

**Fix:**
1. Check that Chromium Headless Shell downloaded successfully (first render triggers this download)
2. Ensure internet connectivity for stock media fetching
3. Check the desktop log for per-scene error details:
   ```powershell
   $log = Get-ChildItem "$env:APPDATA\automated-video-generator\logs\desktop-*" | Sort-Object LastWriteTime -Descending | Select-Object -First 1
   Select-String -Path $log.FullName -Pattern "Scene.*failed|❌ Scene"
   ```
4. Try "Retry Job" — the renderer has resume capability and will skip already-completed segments
5. Reduce the number of scenes in the video script

---

## Step-by-Step Debugging Workflow

When the app crashes and you need to investigate:

### Step 1: Reproduce & Collect Logs

```powershell
# 1. Clear old diagnostics
Remove-Item "$env:APPDATA\automated-video-generator\diagnostics\failure-*" -Force -ErrorAction SilentlyContinue

# 2. Run the app (dev mode for console output):
cd C:\one\Automated-Video-Generator
npm run electron:debug

# 3. Or run the packaged version:
& "C:\one\Automated-Video-Generator\release\win-unpacked\Automated Video Generator.exe"
```

### Step 2: Check for Crash Artifacts

```powershell
# Check for failure snapshots (most useful)
Get-ChildItem "$env:APPDATA\automated-video-generator\diagnostics\failure-*" -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending

# Read the latest failure snapshot
$failure = Get-ChildItem "$env:APPDATA\automated-video-generator\diagnostics\failure-*" | Sort-Object LastWriteTime -Descending | Select-Object -First 1
if ($failure) { Get-Content $failure.FullName -Raw }

# Check the latest desktop log
$log = Get-ChildItem "$env:APPDATA\automated-video-generator\logs\desktop-*" | Sort-Object LastWriteTime -Descending | Select-Object -First 1
Get-Content $log.FullName -Tail 30
```

### Step 3: Search for the Error

```powershell
# Search for error patterns in the log
$log = Get-ChildItem "$env:APPDATA\automated-video-generator\logs\desktop-*" | Sort-Object LastWriteTime -Descending | Select-Object -First 1

# All errors
Select-String -Path $log.FullName -Pattern "error|crash|fatal|UNCAUGHT|EXCEPTION|failed" -CaseSensitive:$false | Select-Object -First 20 | ForEach-Object { $_.Line.Substring(0, [Math]::Min(200, $_.Line.Length)) }

# Key milestones (did the app get this far?)
Select-String -Path $log.FullName -Pattern "Server reported ready|Portal is ready|Main window.*created|launch.*complete" -CaseSensitive:$false
```

### Step 4: Fix & Test

```powershell
# 1. Make code changes

# 2. Compile
npm run electron:compile

# 3. Test in dev mode first
npm run electron:dev

# 4. Copy to release build for packaged testing
Copy-Item "dist-electron\*.js" "release\win-unpacked\resources\app\dist-electron\" -Force
Copy-Item "dist-electron\*.js.map" "release\win-unpacked\resources\app\dist-electron\" -Force

# 5. Test packaged build
& "release\win-unpacked\Automated Video Generator.exe"

# 6. Verify no crashes
Start-Sleep -Seconds 30
$failures = Get-ChildItem "$env:APPDATA\automated-video-generator\diagnostics\failure-*" -ErrorAction SilentlyContinue
if ($failures) { Write-Host "CRASHES FOUND:"; $failures | ForEach-Object { $_.Name } } else { Write-Host "NO CRASHES - Fix verified!" }
```

---

## Developer Quick Reference

### Key Files

| File | Purpose |
|------|---------|
| `electron/electron-main.ts` | App entry point, lifecycle, error handling |
| `electron/app-logger.ts` | Console patching, desktop log file writes |
| `electron/server-manager.ts` | Backend server process spawn/restart |
| `electron/window-manager.ts` | BrowserWindow creation, tray, navigation |
| `electron/dependency-service.ts` | Python, FFmpeg, edge-tts dependency checks |
| `electron/debug-runtime.ts` | Diagnostic snapshots, DevTools |
| `src/render.ts` | Video rendering pipeline (Remotion) |
| `src/server.ts` | Express backend server entry point |

### Build Commands

```bash
npm run electron:compile    # Compile TypeScript → dist-electron/
npm run electron:dev        # Compile + run in dev mode
npm run electron:debug      # Compile + run with remote debugging
npm run electron:pack       # Create unpacked release (fast, for testing)
npm run electron:build      # Create full installer (.exe)
```

### Important: Dev vs Packaged Differences

| Aspect | Dev Mode | Packaged Mode |
|--------|----------|---------------|
| `app.isPackaged` | `false` | `true` |
| `process.stdout/stderr` | Real TTY (terminal) | **Pipes** (no console) |
| `__dirname` | `dist-electron/` | `resources/app/dist-electron/` |
| `process.resourcesPath` | `node_modules/electron/dist/resources` | `resources/` |
| Icon/asset paths | `assets/` relative to project root | `resources/` in app package |
| `console.log` output | Visible in terminal | **Only** in desktop log file |

> **Critical:** Always test fixes in **both** dev mode AND packaged mode. Many crashes (like EPIPE) only occur in packaged mode because `process.stdout`/`process.stderr` behave differently.
