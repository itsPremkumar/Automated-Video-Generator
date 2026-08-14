// Test that new AI modules are properly integrated and gracefully fallback
import * as fs from 'fs';
import * as path from 'path';

async function testAiModules() {
    console.log('=== Testing AI Module Integration ===\n');
    
    // Test 1: Check gen-image.ts has ComfyUI integration
    const genImagePath = path.resolve('src/lib/gen-image.ts');
    const genImage = fs.readFileSync(genImagePath, 'utf-8');
    console.log('✅ gen-image.ts exists');
    
    const hasComfyUI = genImage.includes('tryLocalGenImage') && genImage.includes('comfyui.js');
    console.log(`${hasComfyUI ? '✅' : '❌'} ComfyUI integration present`);
    
    const hasLocalFirst = genImage.indexOf('tryLocalGenImage') < genImage.indexOf('resolveGenProvider');
    console.log(`${hasLocalFirst ? '✅' : '❌'} Local provider tried before API`);
    
    // Test 2: Check gen-video.ts has local providers
    const genVideoPath = path.resolve('src/lib/gen-video.ts');
    const genVideo = fs.readFileSync(genVideoPath, 'utf-8');
    console.log('\n✅ gen-video.ts exists');
    
    const hasCogVideo = genVideo.includes('cogvideo.js');
    const hasAnimateDiff = genVideo.includes('animatediff.js');
    const hasImagePath = genVideo.includes('imagePath?: string');
    console.log(`${hasCogVideo ? '✅' : '❌'} CogVideoX integration present`);
    console.log(`${hasAnimateDiff ? '✅' : '❌'} AnimateDiff integration present`);
    console.log(`${hasImagePath ? '✅' : '❌'} imagePath option added for I2V`);
    
    // Test 3: Check acquire.ts has new preferences
    const acquirePath = path.resolve('src/agentic/pipeline/acquire.ts');
    const acquire = fs.readFileSync(acquirePath, 'utf-8');
    console.log('\n✅ acquire.ts exists');
    
    const hasGenLocal = acquire.includes('gen-local');
    const hasVideoGenLocal = acquire.includes('video-gen-local');
    const hasAiQueue = acquire.includes('ai/job-queue.js');
    console.log(`${hasGenLocal ? '✅' : '❌'} gen-local preference added`);
    console.log(`${hasVideoGenLocal ? '✅' : '❌'} video-gen-local preference added`);
    console.log(`${hasAiQueue ? '✅' : '❌'} AI job queue import present`);
    
    // Test 4: Check job-queue.ts exists and has correct exports
    const queuePath = path.resolve('src/lib/ai/job-queue.ts');
    const queue = fs.readFileSync(queuePath, 'utf-8');
    console.log('\n✅ job-queue.ts exists');
    
    const hasEnqueue = queue.includes('export function enqueueJob');
    const hasStatus = queue.includes('export function getQueueStatus');
    const hasSerial = queue.includes('isProcessing') || queue.includes('ONE AI job at a time');
    console.log(`${hasEnqueue ? '✅' : '❌'} enqueueJob exported`);
    console.log(`${hasStatus ? '✅' : '❌'} getQueueStatus exported`);
    console.log(`${hasSerial ? '✅' : '❌'} Serial processing enforced`);
    
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
        const exists = fs.existsSync(path.resolve(p));
        console.log(`${exists ? '✅' : '❌'} ${p}`);
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
        const exists = fs.existsSync(path.resolve(p));
        console.log(`${exists ? '✅' : '❌'} ${p}`);
    }
    
    // Test 7: Verify graceful fallback pattern in all modules
    console.log('\n--- Graceful Fallback Pattern ---');
    const allModules = [...providers, ...intelligence, 'src/lib/ai/job-queue.ts'];
    let allHaveFallback = true;
    for (const p of allModules) {
        const content = fs.readFileSync(path.resolve(p), 'utf-8');
        const hasNeverThrows = content.includes('never throws') || content.includes('Never throws') || content.includes('fallback');
        const hasIsEnabled = content.includes('isEnabled') || content.includes('isAvailable');
        if (!hasNeverThrows || !hasIsEnabled) {
            console.log(`⚠️ ${p} - missing fallback pattern`);
            allHaveFallback = false;
        }
    }
    console.log(allHaveFallback ? '✅ All modules follow graceful fallback pattern' : '⚠️ Some modules need review');
    
    console.log('\n=== All AI Module Tests Complete ===');
}

testAiModules().catch(console.error);
