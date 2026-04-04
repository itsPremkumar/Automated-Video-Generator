/**
 * Portable Python Setup Script
 * Downloads Python embeddable package and installs edge-tts into it.
 * This creates a fully self-contained Python with edge-tts that gets
 * bundled into the Electron app installer — so end users need ZERO setup.
 *
 * Usage: node scripts/setup-portable-python.cjs
 */
const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { createUnzip } = require('zlib');

const PYTHON_VERSION = '3.12.7';
const PYTHON_ZIP_URL = `https://www.python.org/ftp/python/${PYTHON_VERSION}/python-${PYTHON_VERSION}-embed-amd64.zip`;
const GET_PIP_URL = 'https://bootstrap.pypa.io/get-pip.py';
const PORTABLE_DIR = path.join(__dirname, '..', 'portable-python');
const PYTHON_EXE = path.join(PORTABLE_DIR, 'python.exe');

function download(url, destPath) {
    return new Promise((resolve, reject) => {
        console.log(`  Downloading: ${url}`);
        const file = fs.createWriteStream(destPath);
        const protocol = url.startsWith('https') ? https : http;

        const request = protocol.get(url, (response) => {
            // Handle redirects
            if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
                file.close();
                fs.unlinkSync(destPath);
                return download(response.headers.location, destPath).then(resolve).catch(reject);
            }

            if (response.statusCode !== 200) {
                file.close();
                fs.unlinkSync(destPath);
                reject(new Error(`HTTP ${response.statusCode} for ${url}`));
                return;
            }

            const totalSize = parseInt(response.headers['content-length'] || '0', 10);
            let downloaded = 0;

            response.on('data', (chunk) => {
                downloaded += chunk.length;
                if (totalSize > 0) {
                    const pct = ((downloaded / totalSize) * 100).toFixed(0);
                    process.stdout.write(`\r  Progress: ${pct}% (${(downloaded / 1024 / 1024).toFixed(1)} MB)`);
                }
            });

            response.pipe(file);
            file.on('finish', () => {
                file.close();
                console.log('');
                resolve();
            });
        });

        request.on('error', (err) => {
            file.close();
            try { fs.unlinkSync(destPath); } catch {}
            reject(err);
        });
    });
}

function unzipFile(zipPath, destDir) {
    console.log(`  Extracting to: ${destDir}`);
    // Use PowerShell to extract (available on all modern Windows)
    execSync(
        `powershell -NoProfile -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${destDir}' -Force"`,
        { stdio: 'inherit', windowsHide: true }
    );
}

async function main() {
    console.log('╔══════════════════════════════════════════════════════╗');
    console.log('║  Portable Python Setup for Automated Video Generator ║');
    console.log('╚══════════════════════════════════════════════════════╝\n');

    // Clean up previous portable python
    if (fs.existsSync(PORTABLE_DIR)) {
        console.log('🧹 Removing previous portable-python directory...');
        fs.rmSync(PORTABLE_DIR, { recursive: true, force: true });
    }
    fs.mkdirSync(PORTABLE_DIR, { recursive: true });

    // Step 1: Download Python embeddable
    console.log(`\n📦 Step 1: Downloading Python ${PYTHON_VERSION} embeddable...`);
    const zipPath = path.join(PORTABLE_DIR, 'python-embed.zip');
    await download(PYTHON_ZIP_URL, zipPath);
    unzipFile(zipPath, PORTABLE_DIR);
    fs.unlinkSync(zipPath);

    if (!fs.existsSync(PYTHON_EXE)) {
        throw new Error(`python.exe not found at ${PYTHON_EXE} after extraction`);
    }
    console.log('  ✅ Python extracted successfully');

    // Step 2: Enable pip by modifying the ._pth file
    console.log('\n🔧 Step 2: Enabling pip support...');
    const pthFiles = fs.readdirSync(PORTABLE_DIR).filter(f => f.endsWith('._pth'));
    for (const pthFile of pthFiles) {
        const pthPath = path.join(PORTABLE_DIR, pthFile);
        let content = fs.readFileSync(pthPath, 'utf8');
        // Uncomment "import site" line and add Lib/site-packages
        content = content.replace(/^#\s*import site/m, 'import site');
        if (!content.includes('Lib\\site-packages')) {
            content += '\nLib\\site-packages\n';
        }
        fs.writeFileSync(pthPath, content);
        console.log(`  Modified: ${pthFile}`);
    }

    // Step 3: Download and install pip
    console.log('\n📥 Step 3: Installing pip...');
    const getPipPath = path.join(PORTABLE_DIR, 'get-pip.py');
    await download(GET_PIP_URL, getPipPath);

    execSync(`"${PYTHON_EXE}" "${getPipPath}" --no-warn-script-location`, {
        stdio: 'inherit',
        cwd: PORTABLE_DIR,
        windowsHide: true,
    });
    fs.unlinkSync(getPipPath);
    console.log('  ✅ pip installed');

    // Step 4: Install edge-tts
    console.log('\n📥 Step 4: Installing edge-tts...');
    execSync(`"${PYTHON_EXE}" -m pip install edge-tts --no-warn-script-location`, {
        stdio: 'inherit',
        cwd: PORTABLE_DIR,
        windowsHide: true,
    });
    console.log('  ✅ edge-tts installed');

    // Step 5: Verify installation
    console.log('\n🔍 Step 5: Verifying edge-tts...');
    try {
        const result = execSync(`"${PYTHON_EXE}" -m edge_tts --help`, {
            encoding: 'utf8',
            cwd: PORTABLE_DIR,
            windowsHide: true,
        });
        console.log('  ✅ edge-tts is working!');
    } catch (err) {
        console.error('  ❌ edge-tts verification failed:', err.message);
        process.exit(1);
    }

    // Step 6: Cleanup unnecessary files to save space
    console.log('\n🧹 Step 6: Cleaning up to reduce size...');
    const dirsToClean = ['__pycache__', 'test', 'tests', 'Testing'];
    let cleanedSize = 0;
    function cleanDir(dir) {
        if (!fs.existsSync(dir)) return;
        for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
            const fullPath = path.join(dir, item.name);
            if (item.isDirectory()) {
                if (dirsToClean.includes(item.name)) {
                    const size = getDirSize(fullPath);
                    cleanedSize += size;
                    fs.rmSync(fullPath, { recursive: true, force: true });
                } else {
                    cleanDir(fullPath);
                }
            }
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
                    size += fs.statSync(fullPath).size;
                }
            }
        } catch {}
        return size;
    }
    cleanDir(PORTABLE_DIR);
    console.log(`  Cleaned ${(cleanedSize / 1024 / 1024).toFixed(1)} MB`);

    // Final summary
    const totalSize = getDirSize(PORTABLE_DIR);
    console.log('\n╔══════════════════════════════════════════════════════╗');
    console.log('║              ✅ Setup Complete!                       ║');
    console.log('╚══════════════════════════════════════════════════════╝');
    console.log(`  Python: ${PYTHON_VERSION}`);
    console.log(`  Location: ${PORTABLE_DIR}`);
    console.log(`  Total size: ${(totalSize / 1024 / 1024).toFixed(1)} MB`);
    console.log(`  edge-tts: installed`);
    console.log('\n  This directory will be bundled into the Electron app installer.');
}

main().catch(err => {
    console.error('\n❌ Setup failed:', err.message);
    process.exit(1);
});
