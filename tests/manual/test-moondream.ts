import { generateScriptFromPrompt, refineSceneAI } from '../../src/services/ai.service';

async function main() {
    console.log('=== Test 1: Script Generation ===');
    const result = await generateScriptFromPrompt('Create a short 10-second video about the benefits of drinking water.');
    console.log('Title:', result.title);
    console.log('---Script---');
    console.log(result.script);
    console.log('\\n=== Test 2: Refine Scene ===');
    try {
        const refined = await refineSceneAI(
            'Drinking water helps your skin stay healthy and hydrated.',
            ['water', 'skin', 'health'],
            'Make it more exciting about sports hydration'
        );
        console.log('Voiceover:', refined.voiceoverText);
        console.log('Keywords:', refined.searchKeywords);
    } catch (e) {
        console.log('Refine failed (expected with moondream):', e instanceof Error ? e.message : e);
    }
}
main().catch(console.error);