import { restructurePlan, loopPlan } from '../src/agentic/operations/structure.js';
import type { Plan } from '../src/agentic/types.js';

function makePlan(): Plan {
    return {
        jobId: 't', title: 't', orientation: 'portrait', voice: 'v', musicQuery: 'm', totalDurationSec: 9,
        scenes: [
            { sceneNumber: 1, voiceoverText: 'a', searchKeywords: ['a'], visualPreference: 'image', durationSec: 3 },
            { sceneNumber: 2, voiceoverText: 'b', searchKeywords: ['b'], visualPreference: 'image', durationSec: 3 },
            { sceneNumber: 3, voiceoverText: 'c', searchKeywords: ['c'], visualPreference: 'image', durationSec: 3 },
        ],
    };
}

let pass = 0, fail = 0;
const check = (n: string, ok: boolean) => { console.log(`${ok ? '✅' : '❌'} ${n}`); ok ? pass++ : fail++; };

const r = restructurePlan(makePlan(), { sceneOrder: [2, 0, 1], deleteScenes: [1] });
check('reorder[2,0,1]+delete[1] → (c,a)', JSON.stringify(r.scenes.map((s) => s.voiceoverText)) === JSON.stringify(['c', 'a']));
check('reorder+delete → 2 scenes', r.scenes.length === 2);

const lp = loopPlan(makePlan(), 2);
check('loop x2 → 6 scenes', lp.scenes.length === 6);
check('loop x2 → 18s', lp.totalDurationSec === 18);

const r2 = restructurePlan(makePlan(), { deleteScenes: [2] });
check('delete scene3 (0-based idx 2) → 2 scenes', r2.scenes.length === 2);
check('delete scene3 leaves (a,b)', JSON.stringify(r2.scenes.map((s) => s.voiceoverText)) === JSON.stringify(['a', 'b']));

console.log(`\n=== ${pass} passed, ${fail} failed ===`);
process.exit(fail === 0 ? 0 : 1);
