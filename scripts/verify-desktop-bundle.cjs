#!/usr/bin/env node
/**
 * Desktop Bundle Verification Script
 * Validates that all required files exist for the Electron desktop build.
 *
 * Usage:
 *   node scripts/verify-desktop-bundle.cjs                    — verify source bundle
 *   node scripts/verify-desktop-bundle.cjs --release <dir>    — verify unpacked release
 */
const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');

// Track all results for summary
const results = [];
let hasErrors = false;
let hasWarnings = false;

function check(filePath, label, { required = true, minSize = 1 } = {}) {
    const exists = fs.existsSync(filePath);
    let size = 0;
    let sizeOk = true;

    if (exists) {
        try {
            const stat = fs.statSync(filePath);
            const isDir = stat.isDirectory();
            size = stat.size;
            // Directories always have size 0 from statSync — only check minSize for files
            if (!isDir && minSize > 0 && size < minSize) {
                sizeOk = false;
            }
        } catch (err) {
            results.push({ label, path: filePath, status: 'ERROR', detail: `Cannot stat: ${err.message}`, required });
            if (required) hasErrors = true;
            else hasWarnings = true;
            return false;
        }
    }

    if (!exists) {
        if (required) {
            results.push({ label, path: filePath, status: 'MISSING', detail: 'File not found', required });
            hasErrors = true;
        } else {
            results.push({ label, path: filePath, status: 'WARN', detail: 'Optional file not found', required });
            hasWarnings = true;
        }
        return false;
    }

    if (!sizeOk) {
        if (required) {
            results.push({ label, path: filePath, status: 'BAD', detail: `File is ${size} bytes (expected >= ${minSize})`, required });
            hasErrors = true;
        } else {
            results.push({ label, path: filePath, status: 'WARN', detail: `File is ${size} bytes (expected >= ${minSize})`, required });
            hasWarnings = true;
        }
        return false;
    }

    let sizeStr;
    try {
        const stat = fs.statSync(filePath);
        if (stat.isDirectory()) {
            sizeStr = 'directory';
        } else if (size > 1024 * 1024) {
            sizeStr = `${(size / 1024 / 1024).toFixed(1)} MB`;
        } else if (size > 1024) {
            sizeStr = `${(size / 1024).toFixed(1)} KB`;
        } else {
            sizeStr = `${size} B`;
        }
    } catch {
        sizeStr = `${size} B`;
    }
    results.push({ label, path: filePath, status: 'OK', detail: sizeStr, required });
    return true;
}

function parseArgs(argv) {
    const releaseFlagIndex = argv.indexOf('--release');
    if (releaseFlagIndex === -1) {
        return { releaseDir: null };
    }

    const releaseDir = argv[releaseFlagIndex + 1];
    if (!releaseDir) {
        throw new Error('Missing value for --release flag. Usage: --release <directory>');
    }

    return {
        releaseDir: path.resolve(projectRoot, releaseDir),
    };
}

function printSummary(title) {
    console.log('');
    console.log('┌' + '─'.repeat(90) + '┐');
    console.log('│ ' + title.padEnd(89) + '│');
    console.log('├' + '─'.repeat(6) + '┬' + '─'.repeat(35) + '┬' + '─'.repeat(47) + '┤');
    console.log('│ ' + 'STAT'.padEnd(5) + '│ ' + 'CHECK'.padEnd(34) + '│ ' + 'DETAIL'.padEnd(46) + '│');
    console.log('├' + '─'.repeat(6) + '┼' + '─'.repeat(35) + '┼' + '─'.repeat(47) + '┤');

    for (const r of results) {
        const icon = r.status === 'OK' ? ' ✅ '
            : r.status === 'WARN' ? ' ⚠️  '
            : ' ❌ ';
        const label = r.label.length > 33 ? r.label.slice(0, 30) + '...' : r.label;
        const detail = r.detail.length > 45 ? r.detail.slice(0, 42) + '...' : r.detail;
        console.log('│' + icon.padEnd(6) + '│ ' + label.padEnd(34) + '│ ' + detail.padEnd(46) + '│');
    }

    console.log('└' + '─'.repeat(6) + '┴' + '─'.repeat(35) + '┴' + '─'.repeat(47) + '┘');

    const okCount = results.filter(r => r.status === 'OK').length;
    const warnCount = results.filter(r => r.status === 'WARN').length;
    const failCount = results.filter(r => r.status === 'MISSING' || r.status === 'BAD' || r.status === 'ERROR').length;
    console.log(`\n  Total: ${results.length} checks | ✅ ${okCount} passed | ⚠️  ${warnCount} warnings | ❌ ${failCount} failed`);
}

function verifySourceBundle() {
    console.log('\n📋 Verifying source bundle files...\n');

    const portablePythonDir = path.join(projectRoot, 'portable-python');
    const pythonExe = path.join(portablePythonDir, 'python.exe');
    const edgeTtsExe = path.join(portablePythonDir, 'Scripts', 'edge-tts.exe');
    const requirementsFile = path.join(projectRoot, 'requirements.txt');
    const setupHtml = path.join(projectRoot, 'electron', 'electron-setup.html');
    const iconPath = path.join(projectRoot, 'assets', 'icon.ico');
    const trayIconPath = path.join(projectRoot, 'assets', 'tray-icon.png');
    const preloadTs = path.join(projectRoot, 'electron', 'electron-preload.ts');
    const mainTs = path.join(projectRoot, 'electron', 'electron-main.ts');

    // Required files
    check(requirementsFile, 'requirements.txt');
    check(setupHtml, 'Electron setup page', { minSize: 100 });
    check(iconPath, 'Desktop icon (.ico)', { minSize: 1000 });
    check(mainTs, 'Electron main entry', { minSize: 100 });
    check(preloadTs, 'Electron preload script', { minSize: 100 });
    check(portablePythonDir, 'portable-python directory');
    check(pythonExe, 'Bundled python.exe', { minSize: 10000 });
    check(edgeTtsExe, 'Bundled edge-tts.exe', { minSize: 1000 });

    // Optional but recommended
    check(trayIconPath, 'Tray icon (.png)', { required: false, minSize: 100 });
}

function verifyReleaseBundle(releaseDir) {
    console.log(`\n📋 Verifying release bundle at: ${releaseDir}\n`);

    const resourcesDir = path.join(releaseDir, 'resources');
    const bundledAppDir = path.join(resourcesDir, 'app-bundle');
    const releaseExe = path.join(releaseDir, 'Automated Video Generator.exe');

    // Required release files
    check(releaseDir, 'Release directory');
    check(releaseExe, 'Packaged desktop executable', { minSize: 10000 });
    check(path.join(resourcesDir, 'icon.ico'), 'Packaged icon', { minSize: 1000 });
    check(path.join(bundledAppDir, 'requirements.txt'), 'Packaged requirements.txt');
    check(path.join(bundledAppDir, 'portable-python'), 'Packaged portable-python dir');
    check(path.join(bundledAppDir, 'portable-python', 'python.exe'), 'Packaged python.exe', { minSize: 10000 });
    check(path.join(bundledAppDir, 'portable-python', 'Scripts', 'edge-tts.exe'), 'Packaged edge-tts.exe', { minSize: 1000 });

    // Optional release files
    check(path.join(resourcesDir, 'tray-icon.png'), 'Packaged tray icon', { required: false, minSize: 100 });
}

function main() {
    console.log('╔══════════════════════════════════════════════════════╗');
    console.log('║       Desktop Bundle Verification                    ║');
    console.log('╚══════════════════════════════════════════════════════╝');
    console.log(`  Project root: ${projectRoot}`);

    const { releaseDir } = parseArgs(process.argv.slice(2));

    verifySourceBundle();

    if (releaseDir) {
        verifyReleaseBundle(releaseDir);
        printSummary('Verification Results (Source + Release)');
    } else {
        printSummary('Verification Results (Source Only)');
    }

    if (hasErrors) {
        console.log('\n❌ Verification FAILED — required files are missing or invalid.');
        console.log('   Fix the issues above before building the installer.\n');
        process.exit(1);
    }

    if (hasWarnings) {
        console.log('\n⚠️  Verification passed with warnings — optional files are missing.');
        console.log('   The build will proceed but some features may use fallbacks.\n');
    } else {
        console.log('\n✅ All verification checks passed!\n');
    }
}

try {
    main();
} catch (error) {
    console.error('\n❌ Verification script error:', String(error.message || error));
    if (error.stack) {
        console.error('Stack:', error.stack);
    }
    process.exit(1);
}
