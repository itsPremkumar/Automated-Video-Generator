import { createVideoPipeline } from './index.js';
import type {
  VideoGenRequest, VideoGenResult,
  ScriptGenRequest, ScriptGenResult,
  LipSyncRequest, LipSyncResult,
  MusicGenRequest, MusicGenResult,
  TTSRequest, TTSResult,
  StoryboardRequest, StoryboardResult,
  PipelineRequest, PipelineResult,
} from './types.js';
import { FallbackChain } from './core/fallback-chain.js';
import {
  LTXVideoProvider, CogVideoXProvider, WanVideoProvider, StockMediaFallbackProvider, MockVideoProvider,
  OllamaScriptProvider, MockScriptProvider,
  OllamaStoryboardProvider, MockStoryboardProvider,
  InfiniteTalkProvider, MockLipSyncProvider,
  ACEStepMusicProvider, MockMusicProvider,
  EdgeTTSProvider, GTTSProvider, MockTTSProvider,
} from './index.js';
import { isNvidiaGpuAvailable, getGpuMemoryGB, isCommandAvailable, checkPython3Available } from './utils.js';

async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'help';

  switch (command) {
    case 'pipeline':
      await runPipeline(args.slice(1));
      break;
    case 'test-video':
      await testVideoProviders(args.slice(1));
      break;
    case 'test-script':
      await testScriptProviders(args.slice(1));
      break;
    case 'test-tts':
      await testTtsProviders(args.slice(1));
      break;
    case 'test-music':
      await testMusicProviders(args.slice(1));
      break;
    case 'test-storyboard':
      await testStoryboardProviders(args.slice(1));
      break;
    case 'test-lipsync':
      await testLipSyncProviders(args.slice(1));
      break;
    case 'diagnose':
      await diagnose();
      break;
    case 'test-all':
      await testAll();
      break;
    default:
      showHelp();
  }
}

function showHelp() {
  console.log(`
▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓
  Free Video Gen Lab - CLI Test Harness
▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓

Usage:
  npm run dev -- <command> [options]

Commands:
  pipeline <topic>       Run full video generation pipeline
  test-video [prompt]    Test all AI video providers with fallback chain
  test-script [topic]    Test script generation providers
  test-tts [text]        Test TTS providers
  test-music [mood]      Test music generation providers
  test-storyboard        Test storyboard providers
  test-lipsync           Test lip-sync providers
  diagnose               System diagnostics (GPU, Python, etc.)
  test-all               Run all provider tests
  help                   Show this help

Examples:
  npm run dev -- pipeline "The History of AI"
  npm run dev -- test-video "Cinematic sunset over mountains"
  npm run dev -- test-script "Climate change solutions"
  npm run dev -- test-tts "Hello, this is a test"
  npm run dev -- test-music "happy cinematic"
  npm run dev -- diagnose
  npm run dev -- test-all
`);
}

async function runPipeline(args: string[]) {
  const topic = args.join(' ') || 'The future of artificial intelligence';
  console.log(`\n🔧 Running full pipeline for: "${topic}"\n`);

  const pipeline = createVideoPipeline();
  const request: PipelineRequest = {
    topic,
    style: 'cinematic documentary',
    duration: 30,
    resolution: { width: 1080, height: 1920 },
    aspectRatio: '9:16',
    fps: 30,
    outputDir: './output',
  };

  const result = await pipeline.generateVideo(request);

  console.log(`\n${'═'.repeat(50)}`);
  console.log('PIPELINE RESULT');
  console.log(`${'═'.repeat(50)}`);
  console.log(`Title: ${result.script.title}`);
  console.log(`Scenes: ${result.scenes}`);
  console.log(`Total Duration: ${result.totalDuration}s`);
  console.log(`Providers Used: ${result.providersUsed.join(', ')}`);
  if (result.errors.length > 0) {
    console.log(`Errors: ${result.errors.join('\n  ')}`);
  }
  console.log(`Video: ${result.videoPath || 'N/A'}`);
  console.log(`Audio: ${result.audioPath || 'N/A'}`);
  console.log(`Music: ${result.musicPath || 'N/A'}`);
}

async function testVideoProviders(args: string[]) {
  const prompt = args.join(' ') || 'Cinematic aerial view of a mountain range at sunrise';

  console.log(`\n🎬 Testing AI Video Providers`);
  console.log(`${'─'.repeat(40)}`);
  console.log(`Prompt: "${prompt}"\n`);

  const providers = [
    new LTXVideoProvider(),
    new WanVideoProvider(),
    new CogVideoXProvider(),
    new StockMediaFallbackProvider(),
    new MockVideoProvider(),
  ];

  for (const provider of providers) {
    const available = await provider.isAvailable();
    console.log(`  ${available ? '✅' : '❌'} ${provider.name} (priority: ${provider.priority}, GPU needed: ${provider.capabilities.needsGpu})`);
  }

  console.log(`\nTesting fallback chain execution...`);
  const chain = new FallbackChain<VideoGenRequest, VideoGenResult>([
    () => new LTXVideoProvider(),
    () => new WanVideoProvider(),
    () => new CogVideoXProvider(),
    () => new StockMediaFallbackProvider(),
    () => new MockVideoProvider(),
  ]);

  const request: VideoGenRequest = { prompt, duration: 5 };
  const result = await chain.execute(request);

  console.log(`\nResult:`);
  console.log(`  Success: ${result.success}`);
  console.log(`  Provider: ${result.provider}`);
  console.log(`  Latency: ${result.latencyMs.toFixed(0)}ms`);
  if (result.data) {
    console.log(`  File: ${result.data.filePath}`);
    console.log(`  Duration: ${result.data.durationSeconds}s`);
    console.log(`  Resolution: ${result.data.width}x${result.data.height}`);
  }
  if (result.error) {
    console.log(`  Error: ${result.error}`);
  }
}

async function testScriptProviders(args: string[]) {
  const topic = args.join(' ') || 'The future of renewable energy';

  console.log(`\n📝 Testing Script Generation Providers`);
  console.log(`${'─'.repeat(40)}`);
  console.log(`Topic: "${topic}"\n`);

  const providers = [
    new OllamaScriptProvider(),
    new MockScriptProvider(),
  ];

  for (const provider of providers) {
    const available = await provider.isAvailable();
    console.log(`  ${available ? '✅' : '❌'} ${provider.name}`);
  }

  const chain = new FallbackChain<ScriptGenRequest, ScriptGenResult>([
    () => new OllamaScriptProvider(),
    () => new MockScriptProvider(),
  ]);

  const request: ScriptGenRequest = { topic, duration: 20 };
  const result = await chain.execute(request);

  console.log(`\nResult:`);
  console.log(`  Success: ${result.success}`);
  console.log(`  Provider: ${result.provider}`);
  if (result.data) {
    console.log(`  Title: ${result.data.title}`);
    console.log(`  Scenes: ${result.data.scenes.length}`);
    result.data.scenes.forEach(s => {
      console.log(`    Scene ${s.sceneNumber}: ${s.narration.substring(0, 60)}...`);
    });
  }
}

async function testTtsProviders(args: string[]) {
  const text = args.join(' ') || 'Hello, this is a test of the text to speech system.';

  console.log(`\n🔊 Testing TTS Providers`);
  console.log(`${'─'.repeat(40)}`);
  console.log(`Text: "${text}"\n`);

  const providers = [
    new EdgeTTSProvider(),
    new GTTSProvider(),
    new MockTTSProvider(),
  ];

  for (const provider of providers) {
    const available = await provider.isAvailable();
    console.log(`  ${available ? '✅' : '❌'} ${provider.name}`);
  }

  const chain = new FallbackChain<TTSRequest, TTSResult>([
    () => new EdgeTTSProvider(),
    () => new GTTSProvider(),
    () => new MockTTSProvider(),
  ]);

  const result = await chain.execute({ text });

  console.log(`\nResult:`);
  console.log(`  Success: ${result.success}`);
  console.log(`  Provider: ${result.provider}`);
  if (result.data) {
    console.log(`  File: ${result.data.filePath}`);
    console.log(`  Voice: ${result.data.voice}`);
  }
}

async function testMusicProviders(args: string[]) {
  const mood = args[0] || 'cinematic';

  console.log(`\n🎵 Testing Music Generation Providers`);
  console.log(`${'─'.repeat(40)}`);
  console.log(`Mood: "${mood}"\n`);

  const providers = [
    new ACEStepMusicProvider(),
    new MockMusicProvider(),
  ];

  for (const provider of providers) {
    const available = await provider.isAvailable();
    console.log(`  ${available ? '✅' : '❌'} ${provider.name}`);
  }

  const chain = new FallbackChain<MusicGenRequest, MusicGenResult>([
    () => new ACEStepMusicProvider(),
    () => new MockMusicProvider(),
  ]);

  const result = await chain.execute({ mood, duration: 10 });

  console.log(`\nResult:`);
  console.log(`  Success: ${result.success}`);
  console.log(`  Provider: ${result.provider}`);
  if (result.data) {
    console.log(`  File: ${result.data.filePath}`);
    console.log(`  Duration: ${result.data.durationSeconds}s`);
  }
}

async function testStoryboardProviders(args: string[]) {
  console.log(`\n🎨 Testing Storyboard Providers`);
  console.log(`${'─'.repeat(40)}`);

  const mockScript = new MockScriptProvider();
  const scriptResult = await mockScript.execute({ topic: 'Test topic', duration: 15 });

  if (!scriptResult.data) {
    console.log('❌ Failed to generate test script');
    return;
  }

  const providers = [
    new OllamaStoryboardProvider(),
    new MockStoryboardProvider(),
  ];

  for (const provider of providers) {
    const available = await provider.isAvailable();
    console.log(`  ${available ? '✅' : '❌'} ${provider.name}`);
  }

  const chain = new FallbackChain<StoryboardRequest, StoryboardResult>([
    () => new OllamaStoryboardProvider(),
    () => new MockStoryboardProvider(),
  ]);

  const result = await chain.execute({
    scenes: scriptResult.data.scenes,
    style: 'cinematic',
    aspectRatio: '16:9',
  });

  console.log(`\nResult:`);
  console.log(`  Success: ${result.success}`);
  console.log(`  Provider: ${result.provider}`);
  if (result.data) {
    console.log(`  Storyboard scenes: ${result.data.scenes.length}`);
    result.data.scenes.forEach(s => {
      console.log(`    Scene ${s.sceneNumber}: ${s.imagePath}`);
    });
  }
}

async function testLipSyncProviders(args: string[]) {
  console.log(`\n👄 Testing LipSync Providers`);
  console.log(`${'─'.repeat(40)}`);

  const providers = [
    new InfiniteTalkProvider(),
    new MockLipSyncProvider(),
  ];

  for (const provider of providers) {
    const available = await provider.isAvailable();
    console.log(`  ${available ? '✅' : '❌'} ${provider.name}`);
  }

  const chain = new FallbackChain<LipSyncRequest, LipSyncResult>([
    () => new InfiniteTalkProvider(),
    () => new MockLipSyncProvider(),
  ]);

  const result = await chain.execute({
    audioFilePath: '/tmp/test-audio.mp3',
    imageFilePath: '/tmp/test-image.jpg',
  });

  console.log(`\nResult:`);
  console.log(`  Success: ${result.success}`);
  console.log(`  Provider: ${result.provider}`);
  if (result.data) {
    console.log(`  File: ${result.data.videoFilePath}`);
  }
}

async function diagnose() {
  console.log(`\n🔍 System Diagnostics`);
  console.log(`${'═'.repeat(50)}`);

  // GPU
  const hasGPU = isNvidiaGpuAvailable();
  const vram = getGpuMemoryGB();
  console.log(`\n🎮 GPU:`);
  console.log(`  NVIDIA GPU: ${hasGPU ? '✅' : '❌'}`);
  if (hasGPU) console.log(`  VRAM: ${vram}GB`);

  // Python
  const hasPython = checkPython3Available();
  console.log(`\n🐍 Python:`);
  console.log(`  Available: ${hasPython ? '✅' : '❌'}`);

  // Ollama
  const hasOllama = isCommandAvailable('ollama');
  console.log(`\n🦙 Ollama:`);
  console.log(`  Available: ${hasOllama ? '✅' : '❌'}`);

  // Docker
  const { isDockerAvailable } = await import('./utils.js');
  console.log(`\n🐳 Docker:`);
  console.log(`  Available: ${isDockerAvailable() ? '✅' : '❌'}`);

  // Provider availability summary
  console.log(`\n📦 Provider Availability:`);
  const allProviders: Array<{ name: string; fn: () => Promise<boolean> }> = [
    { name: 'LTX-Video', fn: () => new LTXVideoProvider().isAvailable() },
    { name: 'CogVideoX', fn: () => new CogVideoXProvider().isAvailable() },
    { name: 'Wan2.1', fn: () => new WanVideoProvider().isAvailable() },
    { name: 'Ollama Script', fn: () => new OllamaScriptProvider().isAvailable() },
    { name: 'Ollama Storyboard', fn: () => new OllamaStoryboardProvider().isAvailable() },
    { name: 'InfiniteTalk', fn: () => new InfiniteTalkProvider().isAvailable() },
    { name: 'ACE-Step Music', fn: () => new ACEStepMusicProvider().isAvailable() },
    { name: 'Edge-TTS', fn: () => new EdgeTTSProvider().isAvailable() },
    { name: 'gTTS', fn: () => new GTTSProvider().isAvailable() },
  ];

  for (const p of allProviders) {
    const available = await p.fn();
    console.log(`  ${available ? '✅' : '❌'} ${p.name}`);
  }

  console.log(`\n💡 How to enable providers:`);
  console.log(`  - GPU models: Install CUDA, PyTorch, diffusers`);
  console.log(`  - Ollama: Install from https://ollama.ai`);
  console.log(`  - Edge-TTS: pip install edge-tts`);
  console.log(`  - gTTS: pip install gtts`);
  console.log(`  - Docker: docker pull <model-image>`);
}

async function testAll() {
  console.log(`\n🧪 Running ALL Provider Tests`);
  console.log(`${'═'.repeat(50)}`);

  await testVideoProviders([]);
  console.log(`\n${'─'.repeat(50)}`);

  await testScriptProviders([]);
  console.log(`\n${'─'.repeat(50)}`);

  await testTtsProviders([]);
  console.log(`\n${'─'.repeat(50)}`);

  await testMusicProviders([]);
  console.log(`\n${'─'.repeat(50)}`);

  await testStoryboardProviders([]);
  console.log(`\n${'─'.repeat(50)}`);

  await testLipSyncProviders([]);
  console.log(`\n${'─'.repeat(50)}`);

  await diagnose();
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
