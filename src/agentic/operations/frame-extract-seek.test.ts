/**
 * frame-extract-seek.test.ts — regression guard.
 *
 * BUG (fixed): frame/thumbnail/poster extraction placed `-ss` BEFORE `-i`,
 * which triggers ffmpeg's input-fast seek. On J-cut / -itsoffset / shifted
 * streams that returns an undecodeable (black/garbage) frame, silently feeding
 * the vision QA gate and critique model a wrong frame.
 *
 * FIX: `-ss` must appear AFTER `-i` (output-accurate seek) at every site that
 * extracts a still for verification, contact sheets, thumbnails, or posters.
 *
 * This test statically asserts the ffmpeg arg order in the source so the bug
 * cannot silently return. No ffmpeg execution required.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const srcRoot = join(process.cwd(), 'src');

// file -> regexes that would indicate the BAD order (-ss ... -i) in an
// extraction call. We match the specific arg fragments used at each site.
const badPatterns: { file: string; bad: RegExp[] }[] = [
    {
        file: 'agentic/pipeline/gate.ts',
        bad: [/'-ss',\s*'00:00:00\.5',\s*'-i'/],
    },
    {
        file: 'agentic/orchestrator/artifacts.ts',
        bad: [/'-ss',\s*'00:00:00\.1',\s*'-i'/],
    },
    {
        file: 'agentic/media/export.ts',
        bad: [/'-ss',\s*'00:00:01',\s*'-i'/],
    },
    {
        file: 'agentic/operations/export-fx.ts',
        bad: [/'-ss',\s*String\(atSec\),\s*'-i'/],
    },
    {
        file: 'agentic/operations/critique.ts',
        bad: [/'-ss',\s*String\(atSec\),\s*'-i'/],
    },
];

for (const { file, bad } of badPatterns) {
    test(`frame extraction in ${file} seeks AFTER -i (output-accurate)`, () => {
        const src = readFileSync(join(srcRoot, file), 'utf-8');
        for (const re of bad) {
            assert.ok(
                !re.test(src),
                `${file}: found '-ss' BEFORE '-i' (input-fast seek) — this returns undecodeable frames on shifted streams. Put '-ss' AFTER '-i'.`,
            );
        }
        // And assert the good order is present: '-i', <src>, '-ss'
        assert.match(
            src,
            /'-i',\s*[^,]+,\s*'-ss'/,
            `${file}: expected output-accurate '-i' ... '-ss' extraction order`,
        );
    });
}
