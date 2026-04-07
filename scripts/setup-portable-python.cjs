/**
 * Portable Python Setup Script
 * Downloads Python embeddable package and installs edge-tts into it.
 * This creates a fully self-contained Python with edge-tts that gets
 * bundled into the Electron app installer — so end users need ZERO setup.
 *
 * Usage: node scripts/setup-portable-python.cjs [--verbose]
 */
const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const PYTHON_VERSION = '3.12.7';
const PYTHON_ZIP_URL = `https://www.python.org/ftp/python/${PYTHON_VERSION}/python-${PYTHON_VERSION}-embed-amd64.zip`;
const PYTHON_ZIP_MIRROR = `https://www.python.org/ftp/python/${PYTHON_VERSION}/python-${PYTHON_VERSION}-embed-amd64.zip`;
const GET_PIP_URL = 'https://bootstrap.pypa.io/get-pip.py';
const GET_PIP_MIRROR = 'https://bootstrap.pypa.io/get-pip.py';
const PORTABLE_DIR = path.join(__dirname, '..', 'portable-python');
const PYTHON_EXE = path.join(PORTABLE_DIR, 'python.exe');
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;

const VERBOSE = process.argv.includes('--verbose');

function log(...args) {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}]`, ...args);
}

function debug(...args) {
    if (VERBOSE) {
        const timestamp = new Date().toISOString();
        console.log(`[${timestamp}] [DEBUG]`, ...args);
    }
}

function formatDuration(ms) {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60000).toFixed(1)}min`;
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function download(url, destPath, attempt = 1) {
    return new Promise((resolve, reject) => {
        log(`  Downloading (attempt ${attempt}/${MAX_RETRIES}): ${url}`);
        const startTime = Date.now();
        const file = fs.createWriteStream(destPath);
        const protocol = url.startsWith('https') ? https : http;

        const request = protocol.get(url, (response) => {
            // Handle redirects
            if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
                log(`  Redirect ${response.statusCode} → ${response.headers.location}`);
                file.close();
                try { fs.unlinkSync(destPath); } catch {}
                return download(response.headers.location, destPath, attempt).then(resolve).catch(reject);
            }

            if (response.statusCode !== 200) {
                file.close();
                try { fs.unlinkSync(destPath); } catch {}
                const errMsg = `HTTP ${response.statusCode} for ${url}`;
                log(`  ❌ ${errMsg}`);
                reject(new Error(errMsg));
                return;
            }

            const totalSize = parseInt(response.headers['content-length'] || '0', 10);
            let downloaded = 0;

            response.on('data', (chunk) => {
                downloaded += chunk.length;
                if (totalSize > 0) {
                    const pct = ((downloaded / totalSize) * 100).toFixed(0);
                    process.stdout.write(`\r  Progress: ${pct}% (${(downloaded / 1024 / 1024).toFixed(1)} MB / ${(totalSize / 1024 / 1024).toFixed(1)} MB)`);
                }
            });

            response.pipe(file);
            file.on('finish', () => {
                file.close();
                const elapsed = Date.now() - startTime;
                console.log('');
                log(`  ✅ Download complete in ${formatDuration(elapsed)} (${(downloaded / 1024 / 1024).toFixed(1)} MB)`);

                // Verify downloaded file
                try {
                    const stat = fs.statSync(destPath);
                    if (stat.size === 0) {
                        reject(new Error(`Downloaded file is zero bytes: ${destPath}`));
                        return;
                    }
                    if (totalSize > 0 && stat.size !== totalSize) {
                        log(`  ⚠ File size mismatch: expected ${totalSize}, got ${stat.size}`);
                    }
                    debug(`  File verified: ${stat.size} bytes`);
                } catch (statErr) {
                    reject(new Error(`Cannot verify downloaded file: ${statErr.message}`));
                    return;
                }

                resolve();
            });

            file.on('error', (err) => {
                file.close();
                try { fs.unlinkSync(destPath); } catch {}
                reject(new Error(`File write error: ${err.message}`));
            });
        });

        request.on('error', (err) => {
            file.close();
            try { fs.unlinkSync(destPath); } catch {}
            reject(new Error(`Network error: ${err.message}`));
        });

        request.setTimeout(60000, () => {
            request.destroy();
            file.close();
            try { fs.unlinkSync(destPath); } catch {}
            reject(new Error(`Download timed out after 60s: ${url}`));
        });
    });
}

async function downloadWithRetry(url, destPath, mirrorUrl = null) {
    let lastError;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            await download(url, destPath, attempt);
            return;
        } catch (err) {
            lastError = err;
            log(`  ⚠ Download attempt ${attempt}/${MAX_RETRIES} failed: ${err.message}`);

            if (attempt < MAX_RETRIES) {
                log(`  Retrying in ${RETRY_DELAY_MS / 1000}s...`);
                await sleep(RETRY_DELAY_MS);
            }
        }
    }

    // Try mirror URL if primary failed
    if (mirrorUrl && mirrorUrl !== url) {
        log(`  Trying mirror URL: ${mirrorUrl}`);
        for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
            try {
                await download(mirrorUrl, destPath, attempt);
                return;
            } catch (err) {
                lastError = err;
                log(`  ⚠ Mirror attempt ${attempt}/${MAX_RETRIES} failed: ${err.message}`);
                if (attempt < MAX_RETRIES) {
                    await sleep(RETRY_DELAY_MS);
                }
            }
        }
    }

    throw new Error(`All download attempts failed. Last error: ${lastError.message}`);
}

function execWithLogging(command, options, label) {
    log(`  Running: ${command}`);
    const startTime = Date.now();
    try {
        const result = execSync(command, {
            ...options,
            encoding: 'utf8',
            stdio: VERBOSE ? 'inherit' : ['pipe', 'pipe', 'pipe'],
        });
        const elapsed = Date.now() - startTime;
        log(`  ✅ ${label} completed in ${formatDuration(elapsed)}`);
        if (!VERBOSE && result && typeof result === 'string') {
            debug('  Output (last 500 chars):', result.trim().slice(-500));
        }
        return result;
    } catch (err) {
        const elapsed = Date.now() - startTime;
        log(`  ❌ ${label} failed after ${formatDuration(elapsed)}`);
        if (err.stderr) {
            log(`  Stderr: ${String(err.stderr).trim().slice(0, 500)}`);
        }
        if (err.stdout) {
            log(`  Stdout: ${String(err.stdout).trim().slice(-300)}`);
        }
        throw err;
    }
}

function assertFileExists(filePath, label) {
    if (!fs.existsSync(filePath)) {
        throw new Error(`${label} not found at: ${filePath}`);
    }
    const stat = fs.statSync(filePath);
    if (stat.size === 0) {
        throw new Error(`${label} is zero bytes at: ${filePath}`);
    }
    debug(`  Verified: ${label} (${(stat.size / 1024).toFixed(1)} KB)`);
}

function unzipFile(zipPath, destDir) {
    log(`  Extracting to: ${destDir}`);
    const startTime = Date.now();

    // Verify zip file before extraction
    assertFileExists(zipPath, 'ZIP file');

    // Use PowerShell to extract (available on all modern Windows)
    try {
        execSync(
            `powershell -NoProfile -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${destDir}' -Force"`,
            { stdio: VERBOSE ? 'inherit' : 'pipe', windowsHide: true, timeout: 120000 }
        );
    } catch (err) {
        log(`  ❌ PowerShell Expand-Archive failed: ${err.message}`);
        // Fallback: try tar (available on Windows 10+)
        log('  Trying fallback: tar xf ...');
        try {
            execSync(`tar xf "${zipPath}" -C "${destDir}"`, {
                stdio: VERBOSE ? 'inherit' : 'pipe',
                windowsHide: true,
                timeout: 120000,
            });
        } catch (tarErr) {
            log(`  ❌ tar fallback also failed: ${tarErr.message}`);
            throw new Error(`Failed to extract ${zipPath}. PowerShell error: ${err.message}. tar error: ${tarErr.message}`);
        }
    }

    const elapsed = Date.now() - startTime;
    log(`  ✅ Extraction complete in ${formatDuration(elapsed)}`);
}

async function main() {
    const totalStartTime = Date.now();

    console.log('╔══════════════════════════════════════════════════════╗');
    console.log('║  Portable Python Setup for Automated Video Generator ║');
    console.log('╚══════════════════════════════════════════════════════╝\n');
    log(`Python version: ${PYTHON_VERSION}`);
    log(`Target directory: ${PORTABLE_DIR}`);
    log(`Verbose mode: ${VERBOSE}`);

    // Clean up previous portable python
    if (fs.existsSync(PORTABLE_DIR)) {
        log('🧹 Removing previous portable-python directory...');
        try {
            fs.rmSync(PORTABLE_DIR, { recursive: true, force: true });
            log('  Previous directory removed');
        } catch (cleanErr) {
            log(`  ⚠ Failed to remove previous directory: ${cleanErr.message}`);
            log('  Continuing anyway...');
        }
    }
    fs.mkdirSync(PORTABLE_DIR, { recursive: true });

    // Step 1: Download Python embeddable
    const step1Start = Date.now();
    log(`\n📦 Step 1: Downloading Python ${PYTHON_VERSION} embeddable...`);
    const zipPath = path.join(PORTABLE_DIR, 'python-embed.zip');
    await downloadWithRetry(PYTHON_ZIP_URL, zipPath, PYTHON_ZIP_MIRROR);
    unzipFile(zipPath, PORTABLE_DIR);
    try { fs.unlinkSync(zipPath); } catch {}

    assertFileExists(PYTHON_EXE, 'python.exe');
    log(`  ✅ Python extracted successfully (Step 1: ${formatDuration(Date.now() - step1Start)})`);

    // Step 2: Enable pip by modifying the ._pth file
    const step2Start = Date.now();
    log('\n🔧 Step 2: Enabling pip support...');
    const pthFiles = fs.readdirSync(PORTABLE_DIR).filter(f => f.endsWith('._pth'));
    if (pthFiles.length === 0) {
        log('  ⚠ No ._pth files found — pip configuration may not work correctly');
    }
    for (const pthFile of pthFiles) {
        const pthPath = path.join(PORTABLE_DIR, pthFile);
        let content = fs.readFileSync(pthPath, 'utf8');
        const originalContent = content;
        // Uncomment "import site" line and add Lib/site-packages
        content = content.replace(/^#\s*import site/m, 'import site');
        if (!content.includes('Lib\\site-packages')) {
            content += '\nLib\\site-packages\n';
        }
        fs.writeFileSync(pthPath, content);
        log(`  Modified: ${pthFile}`);
        debug(`  Before:\n${originalContent}`);
        debug(`  After:\n${content}`);
    }
    log(`  ✅ pip support enabled (Step 2: ${formatDuration(Date.now() - step2Start)})`);

    // Step 3: Download and install pip
    const step3Start = Date.now();
    log('\n📥 Step 3: Installing pip...');
    const getPipPath = path.join(PORTABLE_DIR, 'get-pip.py');
    await downloadWithRetry(GET_PIP_URL, getPipPath, GET_PIP_MIRROR);

    assertFileExists(getPipPath, 'get-pip.py');

    execWithLogging(
        `"${PYTHON_EXE}" "${getPipPath}" --no-warn-script-location`,
        { cwd: PORTABLE_DIR, windowsHide: true, timeout: 120000 },
        'pip installation'
    );

    try { fs.unlinkSync(getPipPath); } catch {}

    // Verify pip is working
    log('  Verifying pip...');
    try {
        execSync(`"${PYTHON_EXE}" -m pip --version`, { encoding: 'utf8', stdio: 'pipe', timeout: 15000 });
        log('  ✅ pip is working');
    } catch (pipVerifyErr) {
        log(`  ❌ pip verification failed: ${pipVerifyErr.message}`);
        throw new Error('pip installation succeeded but pip --version fails. The Python environment may be corrupted.');
    }
    log(`  (Step 3: ${formatDuration(Date.now() - step3Start)})`);

    // Step 4: Install edge-tts
    const step4Start = Date.now();
    log('\n📥 Step 4: Installing edge-tts...');
    execWithLogging(
        `"${PYTHON_EXE}" -m pip install edge-tts --no-warn-script-location`,
        { cwd: PORTABLE_DIR, windowsHide: true, timeout: 120000 },
        'edge-tts installation'
    );

    // Verify edge-tts.exe exists
    const edgeTtsExe = path.join(PORTABLE_DIR, 'Scripts', 'edge-tts.exe');
    if (fs.existsSync(edgeTtsExe)) {
        log(`  ✅ edge-tts.exe found at: ${edgeTtsExe}`);
    } else {
        log(`  ⚠ edge-tts.exe not found at expected location: ${edgeTtsExe}`);
        log('  Will verify via Python module instead');
    }
    log(`  (Step 4: ${formatDuration(Date.now() - step4Start)})`);

    // Step 5: Verify installation
    const step5Start = Date.now();
    log('\n🔍 Step 5: Verifying edge-tts...');
    try {
        const result = execSync(`"${PYTHON_EXE}" -m edge_tts --help`, {
            encoding: 'utf8',
            cwd: PORTABLE_DIR,
            windowsHide: true,
            timeout: 15000,
        });
        log('  ✅ edge-tts module is working!');
        debug('  Help output (first 200 chars):', result.slice(0, 200));
    } catch (err) {
        log(`  ❌ edge-tts module verification failed: ${err.message}`);
        if (err.stderr) {
            log(`  Stderr: ${String(err.stderr).trim().slice(0, 300)}`);
        }
        process.exit(1);
    }

    // Also verify via executable if it exists
    if (fs.existsSync(edgeTtsExe)) {
        try {
            execSync(`"${edgeTtsExe}" --help`, { encoding: 'utf8', stdio: 'pipe', timeout: 15000 });
            log('  ✅ edge-tts.exe is also working!');
        } catch (exeErr) {
            log(`  ⚠ edge-tts.exe exists but --help failed: ${exeErr.message}`);
        }
    }
    log(`  (Step 5: ${formatDuration(Date.now() - step5Start)})`);

    // Step 6: Cleanup unnecessary files to save space
    const step6Start = Date.now();
    log('\n🧹 Step 6: Cleaning up to reduce size...');
    const dirsToClean = ['__pycache__', 'test', 'tests', 'Testing'];
    let cleanedSize = 0;
    let cleanedCount = 0;

    function cleanDir(dir) {
        if (!fs.existsSync(dir)) return;
        try {
            for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
                const fullPath = path.join(dir, item.name);
                if (item.isDirectory()) {
                    if (dirsToClean.includes(item.name)) {
                        const size = getDirSize(fullPath);
                        cleanedSize += size;
                        cleanedCount++;
                        fs.rmSync(fullPath, { recursive: true, force: true });
                        debug(`  Removed: ${fullPath} (${(size / 1024).toFixed(1)} KB)`);
                    } else {
                        cleanDir(fullPath);
                    }
                }
            }
        } catch (cleanErr) {
            log(`  ⚠ Error cleaning ${dir}: ${cleanErr.message}`);
        }
    }

    function getDirSize(dir) {
        let size = 0;
        try {
            for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
                const fullPath = path.join(dir, item.name);
                if (item.isDirectory()) {
                    size += getDirSize(fullPath);
                } else {
                    try {
                        size += fs.statSync(fullPath).size;
                    } catch {}
                }
            }
        } catch {}
        return size;
    }

    cleanDir(PORTABLE_DIR);
    log(`  Cleaned ${cleanedCount} directories, freed ${(cleanedSize / 1024 / 1024).toFixed(1)} MB`);
    log(`  (Step 6: ${formatDuration(Date.now() - step6Start)})`);

    // Final summary
    const totalSize = getDirSize(PORTABLE_DIR);
    const totalElapsed = Date.now() - totalStartTime;

    console.log('\n╔══════════════════════════════════════════════════════╗');
    console.log('║              ✅ Setup Complete!                       ║');
    console.log('╚══════════════════════════════════════════════════════╝');
    log(`  Python: ${PYTHON_VERSION}`);
    log(`  Location: ${PORTABLE_DIR}`);
    log(`  Total size: ${(totalSize / 1024 / 1024).toFixed(1)} MB`);
    log(`  edge-tts: installed`);
    log(`  edge-tts.exe: ${fs.existsSync(edgeTtsExe) ? 'present' : 'not present (module-only)'}`);
    log(`  Total setup time: ${formatDuration(totalElapsed)}`);
    console.log('\n  This directory will be bundled into the Electron app installer.');
}

main().catch(err => {
    log(`\n❌ Setup failed: ${err.message}`);
    if (err.stack) {
        log('Stack trace:');
        log(err.stack);
    }
    process.exit(1);
});
