// CI coverage gate: fails if V8 line coverage (from `node --test
// --experimental-test-coverage`) drops below a seeded floor. Run the coverage
// command, pipe its TAP/table to this script's stdin.
//
// Usage: npm run test:coverage | node scripts/check-coverage.mjs
//   (or: node --test --experimental-test-coverage ... | node scripts/check-coverage.mjs)
//
// The "all files | line% | branch% | funcs%" summary row is parsed; the line
// percentage is compared against MIN_LINE_COVERAGE (default 80). Keeping the
// floor slightly below the current ~82% means a genuine regression (not
// harmless refactors) turns CI red, satisfying the empirical-proof bar that
// production changes must not silently erode coverage.

import { readFileSync } from 'node:fs';

const input = readFileSync(0, 'utf8');
const floor = Number(process.env.MIN_LINE_COVERAGE ?? '80');

const row = input.match(/all files\s*\|\s*([\d.]+)\s*\|\s*([\d.]+)\s*\|\s*([\d.]+)/i);
if (!row) {
    console.error('check-coverage: could not find "all files" coverage summary row');
    process.exit(1);
}
const linePct = Number(row[1]);
const branchPct = Number(row[2]);
const funcPct = Number(row[3]);

console.log(`coverage: lines=${linePct}% branch=${branchPct}% funcs=${funcPct}% (floor=${floor}%)`);

if (linePct < floor) {
    console.error(`check-coverage: LINE coverage ${linePct}% is below floor ${floor}% — failing CI`);
    process.exit(1);
}
console.log('check-coverage: OK');
