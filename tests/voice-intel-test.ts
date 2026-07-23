import { buildVoiceConfigs, applyVoiceConfigsToPlan, dubScript } from '../src/agentic/operations/voice-intel.js';

let pass = 0, fail = 0;
function check(name: string, cond: boolean) { if (cond) { pass++; console.log(`  ✅ ${name}`); } else { fail++; console.log(`  ❌ ${name}`); } }

// buildVoiceConfigs: speed clamp + per-scene voice + dialogue
const cfgs = buildVoiceConfigs(3, { baseVoice: 'en-US-GuyNeural', voiceSpeed: 0.9, voicePitchSemitones: 3, dialogueVoices: ['A', 'B'], ttsStyle: 'cheerful' });
check('3 configs built', cfgs.length === 3);
check('rate clamped to >=0.5', cfgs[0].rate === 0.9);
check('pitch passed', cfgs[0].pitch === 3);
check('dialogue alternates A/B', cfgs[0].voice === 'A' && cfgs[1].voice === 'B' && cfgs[2].voice === 'A');
check('style carried', cfgs[0].style === 'cheerful');

// overspeed clamps
const c2 = buildVoiceConfigs(1, { voiceSpeed: 99 })[0];
check('rate clamped to <=2', c2.rate === 2);

// per-scene voice override precedence
const c3 = buildVoiceConfigs(2, { baseVoice: 'base', voicesByScene: { 1: 'sceneVoice' } });
check('voicesByScene overrides', c3[1].voice === 'sceneVoice' && c3[0].voice === 'base');

// applyVoiceConfigsToPlan mutates scene.voiceOverride
const plan: any = { scenes: [{ voiceOverride: undefined }, { voiceOverride: undefined }] };
applyVoiceConfigsToPlan(plan, [{ voice: 'X', rate: 1 }, { voice: 'Y', rate: 1 }]);
check('plan voiceOverride applied', plan.scenes[0].voiceOverride === 'X' && plan.scenes[1].voiceOverride === 'Y');

// dubScript offline translation
check('dub hi prefix', dubScript('Hello', 'hi').startsWith('नमस्ते'));
check('dub ta prefix', dubScript('Hello', 'ta').startsWith('வணக்கம்'));
check('dub unknown passthrough', dubScript('Hello', 'xx') === 'Hello');

// voiceAging preset → semitone shift (zero-cost, no neural backend)
const agYoung = buildVoiceConfigs(1, { voiceAging: 'younger' })[0];
check('voiceAging younger → +4 semitones', agYoung.pitch === 4);
const agOld = buildVoiceConfigs(1, { voiceAging: 'older' })[0];
check('voiceAging older → -4 semitones', agOld.pitch === -4);
const agCombine = buildVoiceConfigs(1, { voicePitchSemitones: 2, voiceAging: 'younger' })[0];
check('voiceAging combines with explicit pitch', agCombine.pitch === 6);

console.log(`\nvoice-intel: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
