#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');

function assertExists(filePath, label) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`${label} is missing: ${filePath}`);
  }
}

function parseArgs(argv) {
  const releaseFlagIndex = argv.indexOf('--release');
  if (releaseFlagIndex === -1) {
    return { releaseDir: null };
  }

  const releaseDir = argv[releaseFlagIndex + 1];
  if (!releaseDir) {
    throw new Error('Missing value for --release');
  }

  return {
    releaseDir: path.resolve(projectRoot, releaseDir),
  };
}

function verifySourceBundle() {
  const portablePythonDir = path.join(projectRoot, 'portable-python');
  const pythonExe = path.join(portablePythonDir, 'python.exe');
  const edgeTtsExe = path.join(portablePythonDir, 'Scripts', 'edge-tts.exe');
  const requirementsFile = path.join(projectRoot, 'requirements.txt');
  const setupHtml = path.join(projectRoot, 'electron', 'electron-setup.html');
  const iconPath = path.join(projectRoot, 'assets', 'icon.ico');
  const trayIconPath = path.join(projectRoot, 'assets', 'tray-icon.png');

  assertExists(requirementsFile, 'requirements.txt');
  assertExists(setupHtml, 'Electron setup page');
  assertExists(iconPath, 'Desktop icon');
  assertExists(trayIconPath, 'Tray icon');
  assertExists(portablePythonDir, 'portable-python directory');
  assertExists(pythonExe, 'Bundled python.exe');
  assertExists(edgeTtsExe, 'Bundled edge-tts.exe');
}

function verifyReleaseBundle(releaseDir) {
  const resourcesDir = path.join(releaseDir, 'resources');
  const bundledAppDir = path.join(resourcesDir, 'app-bundle');
  const releaseExe = path.join(releaseDir, 'Automated Video Generator.exe');

  assertExists(releaseDir, 'Release directory');
  assertExists(releaseExe, 'Packaged desktop executable');
  assertExists(path.join(resourcesDir, 'icon.ico'), 'Packaged icon');
  assertExists(path.join(resourcesDir, 'tray-icon.png'), 'Packaged tray icon');
  assertExists(path.join(bundledAppDir, 'requirements.txt'), 'Packaged requirements.txt');
  assertExists(path.join(bundledAppDir, 'portable-python'), 'Packaged portable-python directory');
  assertExists(path.join(bundledAppDir, 'portable-python', 'python.exe'), 'Packaged python.exe');
  assertExists(path.join(bundledAppDir, 'portable-python', 'Scripts', 'edge-tts.exe'), 'Packaged edge-tts.exe');
}

function main() {
  const { releaseDir } = parseArgs(process.argv.slice(2));
  verifySourceBundle();

  if (releaseDir) {
    verifyReleaseBundle(releaseDir);
    console.log(`Desktop bundle verification passed for source and release: ${releaseDir}`);
    return;
  }

  console.log('Desktop bundle verification passed for source files.');
}

try {
  main();
} catch (error) {
  console.error(String(error.message || error));
  process.exit(1);
}
