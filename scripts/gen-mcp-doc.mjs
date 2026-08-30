#!/usr/bin/env node
/**
 * scripts/gen-mcp-doc.mjs — Re-generate docs/MCP_TOOL_REFERENCE.md from the
 * real `server.registerTool(...)` / `server.tool(...)` calls in
 * `src/adapters/mcp/register-*.ts`. Run as part of CI to ensure the doc
 * stays in lockstep with the source — never edit the generated doc by hand.
 *
 *   npx tsx scripts/gen-mcp-doc.mjs            # regenerate
 *   npx tsx scripts/gen-mcp-doc.mjs --check    # exit 1 if out of date (CI mode)
 *
 * The generator parses each register-*.ts file with a lightweight regex
 * (TS is too heavy to spin up just for this) and extracts:
 *   - tool name (1st arg)
 *   - title (under `title:`)
 *   - description (under `description:`)
 *   - input schema (under `inputSchema:`) — captured as a raw block and
 *     rendered as fenced TypeScript for human reading. Full Zod parsing
 *     is intentionally out of scope; we only need the doc to faithfully
 *     mirror what the code accepts.
 *
 * If the parser can't find any tools in a file, that file is skipped (with
 * a warning), not failed — so the script remains useful even when a register
 * file is refactored to a different registration style.
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = resolve(fileURLToPath(import.meta.url), '..');
const ROOT = resolve(__dirname, '..');
const MCP_DIR = join(ROOT, 'src', 'adapters', 'mcp');
const OUT = join(ROOT, 'docs', 'MCP_TOOL_REFERENCE.md');

const CHECK = process.argv.includes('--check');

/**
 * Try to extract every `server.registerTool('name', { title, description, inputSchema }, handler)`
 * block from a single source file. Falls back to `server.tool('name', ...)`
 * lines for files using the simpler legacy signature.
 */
function parseRegisterFile(src) {
    const tools = [];

    // Pattern 1: server.registerTool('name', { ... }, handler)
    // Match across multiple lines so we capture the full { ... } options object.
    const re = /server\.registerTool\(\s*['"]([^'"]+)['"]\s*,\s*\{([\s\S]*?)\}\s*,/g;
    let m;
    while ((m = re.exec(src)) !== null) {
        const name = m[1];
        const block = m[2];
        const title = matchField(block, 'title');
        const description = matchField(block, 'description');
        const inputSchema = matchField(block, 'inputSchema', /* multiline */ true);
        tools.push({ name, title, description, inputSchema, kind: 'registerTool' });
    }

    // Pattern 2: server.tool('name', 'description', async () => {)
    const re2 = /server\.tool\(\s*['"]([^'"]+)['"]\s*,\s*['"]([^'"]+)['"]/g;
    while ((m = re2.exec(src)) !== null) {
        // Only add if not already added by Pattern 1.
        if (!tools.some((t) => t.name === m[1])) {
            tools.push({ name: m[1], description: m[2], title: null, inputSchema: null, kind: 'tool' });
        }
    }

    return tools;
}

/** Match a top-level field inside a `{ ... }` block. Strips quotes + trims. */
function matchField(block, key, multiline = false) {
    let re;
    if (multiline) {
        // Greedy multiline match — captures everything up to the next field or end-of-block.
        re = new RegExp(`${key}\\s*:\\s*([\\s\\S]*?)(?:,\\s*[a-zA-Z][a-zA-Z0-9_]*\\s*:|\\s*\\}\\s*$)`);
    } else {
        // Single-line: matches the rest of the line, then strips leading/trailing quotes/backticks.
        re = new RegExp(`${key}\\s*:\\s*(.+?)\\s*$`, 'm');
    }
    const m = block.match(re);
    if (!m) return null;
    let v = (m[1] ?? '').trim();
    // Strip exactly one pair of surrounding quotes/backticks if present.
    if (v.length >= 2) {
        const first = v[0];
        const last = v[v.length - 1];
        if ((first === '"' || first === "'" || first === '`') && first === last) {
            v = v.slice(1, -1);
        }
    }
    v = v.replace(/\\'/g, "'").replace(/\\"/g, '"').replace(/\\n/g, '\n');
    // The single-line regex captures up to EOL, which usually includes a
    // trailing comma (field separator). Strip that first.
    v = v.replace(/,\s*$/, '');
    // Then strip stray wrapping quotes that survived. Apply up to 3 times so
    // double-wrapped strings like `'(...)'` collapse cleanly.
    for (let i = 0; i < 3; i++) {
        if (v.length < 2) break;
        const first = v[0];
        const last = v[v.length - 1];
        if ((first === '"' || first === "'" || first === '`') && first === last) {
            v = v.slice(1, -1);
        } else {
            break;
        }
    }
    return v || null;
}

/** Render a single tool as a Markdown table row. */
function renderTableRow(t) {
    let desc = (t.description || t.title || '').replace(/\n/g, ' ').slice(0, 200);
    // Strip a trailing comma + whitespace that the regex captures from the
    // field separator (e.g. `description: 'foo',`).
    desc = desc.replace(/,\s*$/, '');
    const schema = t.inputSchema
        ? '`' + t.inputSchema.replace(/\s+/g, ' ').slice(0, 80).replace(/`/g, '') + '`'
        : '—';
    return `| \`${t.name}\` | ${desc} | ${schema} |`;
}

/** Render the full doc as Markdown. */
function renderDoc(families) {
    const totalTools = families.reduce((s, f) => s + f.tools.length, 0);
    const lines = [];
    lines.push('# MCP Tool Reference — Automated Video Generator v1.2.0');
    lines.push('');
    lines.push(
        '> **Auto-generated reference for MCP clients** (Claude Desktop, Claude Code, OpenClaw, Hermes Agent, any MCP 1.0+ host).',
    );
    lines.push(
        '>',
    );
    lines.push(
        '> Regenerate with `npx tsx scripts/gen-mcp-doc.mjs`. The doc is the canonical contract',
    );
    lines.push(
        '> that consumers (Claude/OpenClaw/Hermes) read — keep `register-*.ts` and this doc in lockstep.',
    );
    lines.push('');
    lines.push('## Tool families');
    lines.push('');
    lines.push('| Family | File | # tools |');
    lines.push('|---|---|---|');
    for (const f of families) {
        lines.push(`| **${f.label}** | \`${f.file}\` | ${f.tools.length} |`);
    }
    lines.push('');
    lines.push(`**Total tools exposed:** ${totalTools}.`);
    lines.push('');
    lines.push(
        'Every tool name is `snake_case`; every input uses a Zod schema validated by the server before the handler runs. Mutating tools call `assertSafeMutationAllowed(\'mcp\', <op>)` — disabling that gate blocks writes.',
    );
    lines.push('');
    for (const f of families) {
        lines.push(`## ${f.label} — \`${f.file}\``);
        lines.push('');
        lines.push(`_${f.description}_`);
        lines.push('');
        lines.push('| Tool | Description | Input shape |');
        lines.push('| :--- | :--- | :--- |');
        for (const t of f.tools) lines.push(renderTableRow(t));
        lines.push('');
    }
    lines.push('---');
    lines.push('');
    lines.push(
        '**Maintaining this doc:** run `npx tsx scripts/gen-mcp-doc.mjs` after every change to `src/adapters/mcp/register-*.ts`. CI mode (`--check`) exits non-zero if the doc is out of date.',
    );
    return lines.join('\n') + '\n';
}

// Map each register file to a human label + 1-line description.
const FAMILY_META = [
    { file: 'register-admin-tools.ts', label: 'Admin', description: 'System / config / diagnostics.' },
    { file: 'register-input-tools.ts', label: 'Input', description: 'Scripts + local asset upload.' },
    { file: 'register-job-tools.ts', label: 'Job', description: 'Generate / monitor / batch.' },
    { file: 'register-output-tools.ts', label: 'Output', description: 'List / read / delete outputs.' },
    { file: 'register-free-video-tools.ts', label: 'Free video', description: 'Search + download CC video.' },
    { file: 'register-agentic-tools.ts', label: 'Agentic', description: 'Hermes-driven plan→acquire→gate→render.' },
    { file: 'register-operations-tools.ts', label: 'Operations', description: 'Single-task video edits (merge, trim, …).' },
];

function main() {
    const families = [];
    for (const meta of FAMILY_META) {
        const file = join(MCP_DIR, meta.file);
        if (!exists(file)) {
            console.warn(`⚠ missing ${meta.file}; skipping`);
            continue;
        }
        const src = readFileSync(file, 'utf8');
        const tools = parseRegisterFile(src);
        if (tools.length === 0) {
            console.warn(`⚠ ${meta.file}: no tools parsed (signature may have changed)`);
        }
        families.push({ ...meta, tools });
    }
    const doc = renderDoc(families);
    if (CHECK) {
        const existing = readFileSync(OUT, 'utf8');
        if (existing === doc) {
            console.log(`✓ ${path_(OUT)} is up to date (${families.reduce((s, f) => s + f.tools.length, 0)} tools across ${families.length} families)`);
            process.exit(0);
        }
        console.error(`✖ ${path_(OUT)} is OUT OF DATE — run \`npx tsx scripts/gen-mcp-doc.mjs\` to regenerate.`);
        console.error(`  expected: ${doc.length} chars  actual: ${existing.length} chars`);
        process.exit(1);
    }
    writeFileSync(OUT, doc, 'utf8');
    const total = families.reduce((s, f) => s + f.tools.length, 0);
    console.log(`✓ wrote ${path_(OUT)} — ${total} tools across ${families.length} families`);
}

function exists(p) {
    try { statSync(p); return true; } catch { return false; }
}
function path_(p) { return p.replace(ROOT + '\\', '').replace(ROOT + '/', ''); }

main();