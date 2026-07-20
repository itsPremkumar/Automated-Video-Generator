const fs = require('fs');
const s = fs.readFileSync('src/agentic/enhancement.test.ts', 'utf8').split('\n');
const l = s[71];
console.log('RAW line 72:', JSON.stringify(l));
const m = l.match(/includes\('([^']*)'\)/);
console.log('expected literal:', JSON.stringify(m[1]));
console.log('backslash count in expected literal:', (m[1].match(/\\/g) || []).length);
// Now check the actual produced value from the function
const src = fs.readFileSync('src/agentic/orchestrate.ts', 'utf8').split('\n');
const fl = src[1726];
console.log('RAW orchestrate line 1727:', JSON.stringify(fl));
const fm = fl.match(/between\(t(\\*)\\,/);
console.log('backslash count in buildDuckExpression source before comma:', fm ? fm[1].length : 'NO MATCH');
