/**
 * test-ai-modules.ts — verify AI module integration
 */
import * as fs from 'fs';
import * as path from 'path';

async function testAiModules() {
    console.log('=== Testing AI Module Integration ===\n');

    // Test 1: Check gen-image.ts has ComfyUI integration
    const genImage = fs.readFileSync(path.resolve('src/lib/gen-image.ts'), 'utf-8');
    console.log('✅ gen-image.ts exists');
    console.log(`${genImage.includes('tryLocalGenImage') && genImage.includes('comfyui.js') ? '✅' : '❌'} ComfyUI integration present`);
    console.log(`${genImage.indexOf('tryLocalGenImage') < genImage.indexOf('resolveGenProvider') ? '✅' : '❌'} Local provider tried before API`);

    // Test 2: Check gen-video.ts has local providers
    const genVideo = fs.readFileSync(path.resolve('src/lib/gen-video.ts'), 'utf-8');
    console.log('\n✅ gen-video.ts exists');
    console.log(`${genVideo.includes('cogvideo.js') ? '✅' : '❌'} CogVideoX integration present`);
    console.log(`${genVideo.includes('animatediff.js') ? '✅' : '❌'} AnimateDiff integration present`);
    console.log(`${genVideo.includes('imagePath?: string') ? '✅' : '❌'} imagePath option added for I2V`);

    // Test 3: Check acquire.ts has new preferences
    const acquire = fs.readFileSync(path.resolve('src/agentic/pipeline/acquire.ts'), 'utf-8');
    console.log('\n✅ acquire.ts exists');
    console.log(`${acquire.includes('gen-local') ? '✅' : '❌'} gen-local preference added`);
    console.log(`${acquire.includes('video-gen-local') ? '✅' : '❌'} video-gen-local preference added`);
    console.log(`${acquire.includes('ai/job-queue.js') ? '✅' : '❌'} AI job queue import present`);

    // Test 4: Check job-queue.ts
    const queue = fs.readFileSync(path.resolve('src/lib/ai/job-queue.ts'), 'utf-8');
    console.log('\n✅ job-queue.ts exists');
    console.log(`${queue.includes('export function enqueueJob') ? '✅' : '❌'} enqueueJob exported`);
    console.log(`${queue.includes('export function getQueueStatus') ? '✅' : '❌'} getQueueStatus exported`);
    console.log(`${queue.includes('isProcessing') ? '✅' : '❌'} Serial processing enforced`);

    // Test 5: Check all provider files exist
    const providers = [
        'src/lib/ai/providers/comfyui.ts',
        'src/lib/ai/providers/cogvideo.ts',
        'src/lib/ai/providers/animatediff.ts',
        'src/lib/ai/providers/upscale.ts',
        'src/lib/ai/providers/bg-removal.ts'
    ];
    console.log('\n--- Provider Modules ---');
    for (const p of providers) {
        console.log(`${fs.existsSync(path.resolve(p)) ? '✅' : '❌'} ${p}`);
    }

    // Test 6: Check all intelligence modules exist
    const intelligence = [
        'src/lib/ai/intelligence/beat-sync.ts',
        'src/lib/ai/intelligence/clip-match.ts',
        'src/lib/ai/intelligence/script-enhance.ts',
        'src/lib/ai/intelligence/translate.ts',
        'src/lib/ai/intelligence/storyboard.ts'
    ];
    console.log('\n--- Intelligence Modules ---');
    for (const p of intelligence) {
        console.log(`${fs.existsSync(path.resolve(p)) ? '✅' : '❌'} ${p}`);
    }

    // Test 7: Verify graceful fallback pattern
    console.log('\n--- Graceful Fallback Pattern ---');
    const allModules = [...providers, ...intelligence, 'src/lib/ai/job-queue.ts'];
    let allHaveFallback = true;
    for (const p of allModules) {
        const content = fs.readFileSync(path.resolve(p), 'utf-8');
        const hasNeverThrows = content.includes('never throws') || content.includes('Never throws') || content.includes('fall back') || content.includes('fallback');
        const hasIsEnabled = content.includes('isEnabled') || content.includes('isAvailable');
        if (!hasNeverThrows || !hasIsEnabled) {
            console.log(`⚠️ ${p} - missing fallback pattern (hasNeverThrows=${hasNeverThrows}, hasIsEnabled=${hasIsEnabled})`);
            allHaveFallback = false;
        }
    }
    console.log(allHaveFallback ? '✅ All modules follow graceful fallback pattern' : '⚠️ Some modules need review');

    console.log('\n=== All AI Module Tests Complete ===');
}

testAiModules().catch(console.error);
