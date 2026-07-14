#!/usr/bin/env node
/**
 * AVG Release Gate — Smoke Check
 * ----------------------------------------------------------------------------
 * Zero-dependency Node script (no tsx) that validates the publishable AVG
 * artifact before a release ships. Used by .github/workflows/release.yml and
 * desktop-release.yml as a blocking gate.
 *
 * Checks:
 *   B1  TypeScript compiles (npm run typecheck)
 *   B2  Unit tests green      (npm run test:unit)
 *   B3  Dependency audit      (npm audit --audit-level=high)
 *   B4  Package self-contained (npm pack --dry-run; bin/mcp.js parses)
 *   B5  MCP server boots (stdio) and answers initialize
 *   B6  HTTP server boots and GET /api/health == 200 (unless --artifact-only
 *       and AVG_HEALTH_URL is set, in which case it probes that URL)
 *
 * Usage:
 *   node scripts/release-smoke-check.cjs [--artifact-only]
 *   AVG_HEALTH_URL=http://host:port node scripts/release-smoke-check.cjs --artifact-only
 *
 * Exit 0 = gate passed. Non-zero = BLOCK the release.
 * ----------------------------------------------------------------------------
 */

'use strict';

const { execFileSync, spawn, spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

const projectRoot = path.resolve(__dirname, '..');
const isWindows = process.platform === 'win32';
const npmCmd = isWindows ? 'npm.cmd' : 'npm';
const ARTIFACT_ONLY = process.argv.includes('--artifact-only');

const results = [];
let blockingFailed = false;
let warned = false;

function npm(...args) {
    try {
        return spawnSync(npmCmd, args, {
            cwd: projectRoot,
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'pipe'],
            // allow generous time for typecheck/test
            timeout: 1000 * 60 * 8,
            windowsHide: true,
            shell: true,
        });
    } catch (e) {
        // Surface a spawn failure as a result object instead of crashing.
        return { status: 1, stdout: '', stderr: `spawn error: ${e.message}` };
    }
}

function record(name, status, detail) {
    results.push({ name, status, detail });
    if (status === 'FAIL') blockingFailed = true;
    if (status === 'WARN') warned = true;
    const icon = status === 'PASS' ? '✅' : status === 'WARN' ? '⚠️ ' : '❌';
    console.log(`${icon} ${name}: ${detail}`);
}

function runNpmGate(name, args, failDetail) {
    const res = npm(...args);
    const combined = (res.stdout || '') + (res.stderr || '');
    if (res.status === 0) {
        record(name, 'PASS', `exit 0 (${args.join(' ')})`);
        return true;
    }
    record(name, 'FAIL', `${failDetail}\n${combined.split('\n').slice(-12).join('\n')}`);
    return false;
}

// --- B4: package self-contained ---
function checkArtifact() {
    const res = npm('pack', '--dry-run', '--json');
    if (res.status !== 0) {
        record('B4 package self-contained', 'FAIL', 'npm pack --dry-run failed');
        return;
    }
    let parsed;
    try {
        parsed = JSON.parse(res.stdout);
    } catch (e) {
        record('B4 package self-contained', 'FAIL', 'could not parse npm pack json');
        return;
    }
    const pkgs = Array.isArray(parsed) ? parsed : [parsed];
    const files = new Set();
    let version = '?';
    for (const p of pkgs) {
        version = p.version || version;
        (p.files || []).forEach((f) => files.add(f.path));
    }
    const required = ['bin/mcp.js', 'src/mcp-server.ts', 'remotion/index.ts', 'package.json'];
    const missing = required.filter((f) => !files.has(f));
    if (missing.length) {
        record('B4 package self-contained', 'FAIL', `missing from tarball: ${missing.join(', ')}`);
        return;
    }
    // bin/mcp.js must be syntactically valid as plain JS (node --check)
    const binPath = path.join(projectRoot, 'bin', 'mcp.js');
    const check = spawnSync(process.execPath, ['--check', binPath], { encoding: 'utf8' });
    if (check.status !== 0) {
        record('B4 package self-contained', 'FAIL', `bin/mcp.js --check failed:\n${check.stderr}`);
        return;
    }
    record('B4 package self-contained', 'PASS', `version ${version}, ${files.size} files, bin/mcp.js valid`);
}

// --- B5: MCP server boots over stdio ---
function checkMcpBoot() {
    return new Promise((resolve) => {
        let child;
        try {
            // On Windows `npm` resolves to `npm.cmd`, which only spawns
            // successfully through a shell. `shell: true` makes this
            // cross-platform-safe and prevents a synchronous EINVAL throw
            // from crashing the entire gate.
            child = spawn(npmCmd, ['run', 'mcp'], {
                cwd: projectRoot,
                stdio: ['pipe', 'pipe', 'pipe'],
                windowsHide: true,
                shell: true,
                env: { ...process.env, AUTOMATED_VIDEO_GENERATOR_MCP: '1' },
            });
        } catch (e) {
            record('B5 MCP server boots', 'FAIL', `spawn error: ${e.message}`);
            resolve();
            return;
        }
        let out = '';
        let errOut = '';
        const timer = setTimeout(() => {
            child.kill('SIGKILL');
            record('B5 MCP server boots', 'FAIL', 'timed out waiting for MCP handshake');
            resolve();
        }, 20000);

        const sendInit = () => {
            const init = JSON.stringify({
                jsonrpc: '2.0',
                id: 1,
                method: 'initialize',
                params: {
                    protocolVersion: '2024-11-05',
                    capabilities: {},
                    clientInfo: { name: 'release-smoke', version: '1.0.0' },
                },
            });
            child.stdin.write(init + '\n');
        };

        child.stdout.on('data', (d) => {
            out += d.toString();
            if (out.includes('"jsonrpc"') || out.includes('"capabilities"')) {
                clearTimeout(timer);
                child.kill('SIGKILL');
                record('B5 MCP server boots', 'PASS', 'MCP server initialized over stdio');
                resolve();
            } else if (out.includes('MCP') || out.includes('server')) {
                // banner seen; send initialize
                sendInit();
            }
        });
        child.stderr.on('data', (d) => (errOut += d.toString()));
        child.on('error', (e) => {
            clearTimeout(timer);
            record('B5 MCP server boots', 'FAIL', `spawn error: ${e.message}`);
            resolve();
        });
        child.on('exit', (code) => {
            clearTimeout(timer);
            if (!out.includes('capabilities')) {
                record('B5 MCP server boots', 'FAIL', `exited ${code} before handshake\n${errOut.slice(-300)}`);
            }
            resolve();
        });
    });
}

// --- B6: HTTP server /api/health ---
function httpGet(url) {
    return new Promise((resolve, reject) => {
        const req = http.get(url, (res) => {
            let data = '';
            res.on('data', (c) => (data += c));
            res.on('end', () => resolve({ status: res.statusCode, body: data }));
        });
        req.on('error', reject);
        req.setTimeout(5000, () => req.destroy(new Error('timeout')));
    });
}

async function checkHttpHealth() {
    if (ARTIFACT_ONLY && process.env.AVG_HEALTH_URL) {
        try {
            const u = new URL(process.env.AVG_HEALTH_URL);
            u.pathname = (u.pathname || '').replace(/\/$/, '') + '/api/health';
            const r = await httpGet(u.toString());
            if (r.status === 200 && /video-generator/.test(r.body)) {
                record('B6 HTTP /api/health', 'PASS', `${u} -> 200`);
            } else {
                record('B6 HTTP /api/health', 'FAIL', `${u} -> ${r.status}: ${r.body.slice(0, 120)}`);
            }
        } catch (e) {
            record('B6 HTTP /api/health', 'FAIL', `probe error: ${e.message}`);
        }
        return;
    }
    if (ARTIFACT_ONLY) {
        record('B6 HTTP /api/health', 'WARN', 'skipped (artifact-only, no AVG_HEALTH_URL set)');
        return;
    }
    // Boot the dev server and probe it.
    const port = 3999;
    const srv = spawn(npmCmd, ['run', 'dev'], {
        cwd: projectRoot,
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
        shell: true,
        env: { ...process.env, PORT: String(port), HOST: '127.0.0.1' },
    });
    const cleanup = () => {
        try {
            srv.kill('SIGKILL');
        } catch {
            /* noop */
        }
    };
    const timer = setTimeout(() => {
        cleanup();
        record('B6 HTTP /api/health', 'FAIL', 'dev server did not become ready in 40s');
    }, 45000);

    let ready = false;
    srv.stderr.on('data', () => {});
    srv.stdout.on('data', (d) => {
        if (!ready && /running on|portal running/i.test(d.toString())) {
            ready = true;
            setTimeout(async () => {
                clearTimeout(timer);
                try {
                    const r = await httpGet(`http://127.0.0.1:${port}/api/health`);
                    if (r.status === 200 && /video-generator/.test(r.body)) {
                        record('B6 HTTP /api/health', 'PASS', `127.0.0.1:${port}/api/health -> 200`);
                    } else {
                        record('B6 HTTP /api/health', 'FAIL', `-> ${r.status}: ${r.body.slice(0, 120)}`);
                    }
                } catch (e) {
                    record('B6 HTTP /api/health', 'FAIL', `probe error: ${e.message}`);
                }
                cleanup();
            }, 1500);
        }
    });
    srv.on('exit', () => {
        clearTimeout(timer);
    });
}

async function main() {
    console.log('╔══════════════════════════════════════════════════════════╗');
    console.log('║   AVG Release Gate — Smoke Check                         ║');
    console.log('╚══════════════════════════════════════════════════════════╝');
    console.log(`  project: ${projectRoot}`);
    console.log(`  mode: ${ARTIFACT_ONLY ? 'artifact-only' : 'full'}\n`);

    runNpmGate('B1 typecheck', ['run', 'typecheck'], 'TypeScript typecheck failed.');
    runNpmGate('B2 unit tests', ['run', 'test:unit'], 'Unit tests failed.');
    runNpmGate('B3 npm audit (high)', ['audit', '--audit-level=high'], 'High/critical vulnerabilities found.');
    checkArtifact();
    await checkMcpBoot();
    await checkHttpHealth();

    console.log('\n─────────────── RELEASE GATE SUMMARY ───────────────');
    const pass = results.filter((r) => r.status === 'PASS').length;
    const warn = results.filter((r) => r.status === 'WARN').length;
    const fail = results.filter((r) => r.status === 'FAIL').length;
    console.log(`  ${results.length} checks | ✅ ${pass} | ⚠️  ${warn} | ❌ ${fail}`);

    if (blockingFailed) {
        console.log('\n❌ GATE FAILED — do NOT publish this release.\n');
        process.exit(1);
    }
    if (warned) {
        console.log('\n⚠️  GATE PASSED WITH WARNINGS — review warnings, then proceed.\n');
        process.exit(0);
    }
    console.log('\n✅ GATE PASSED — release may proceed.\n');
    process.exit(0);
}

main().catch((e) => {
    console.error('Smoke check crashed:', e);
    process.exit(1);
});
