import { parseScript } from './src/lib/script-parser';

async function test() {
    console.log('--- Test Case: Multiple Tags on One Line ---');
    const script = '[Visual: a.jpg][Visual: b.jpg][Visual: c.jpg]';
    const res = await parseScript(script);
    console.log('Scenes:', res.scenes.length);
    res.scenes.forEach(s => console.log(`  Scene ${s.sceneNumber}: "${s.voiceoverText}" with ${s.localAsset || 'no asset'}`));

    console.log('\n--- Test Case: Mixed Tags and Text ---');
    const script2 = '[Visual: d.jpg]This is first[Visual: e.jpg]This is second';
    const res2 = await parseScript(script2);
    console.log('Scenes:', res2.scenes.length);
    res2.scenes.forEach(s => console.log(`  Scene ${s.sceneNumber}: "${s.voiceoverText}" with ${s.localAsset || 'no asset'}`));
}

test().catch(console.error);
