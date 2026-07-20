import { FallbackChain } from './core/fallback-chain.js';
import { VideoPipeline } from './core/pipeline.js';
import type {
  ScriptGenRequest, ScriptGenResult,
  StoryboardRequest, StoryboardResult,
  VideoGenRequest, VideoGenResult,
  LipSyncRequest, LipSyncResult,
  MusicGenRequest, MusicGenResult,
  TTSRequest, TTSResult,
  PipelineRequest, PipelineResult,
} from './types.js';

// AI Video providers
import { LTXVideoProvider } from './providers/ai-video/ltx-video.js';
import { CogVideoXProvider } from './providers/ai-video/cogvideox.js';
import { WanVideoProvider } from './providers/ai-video/wan.js';
import { StockMediaFallbackProvider } from './providers/ai-video/stock-media.js';
import { MockVideoProvider } from './providers/ai-video/mock.js';

// Script providers
import { OllamaScriptProvider } from './providers/script-gen/ollama.js';
import { MockScriptProvider } from './providers/script-gen/mock.js';

// Storyboard providers
import { OllamaStoryboardProvider } from './providers/storyboard/ollama.js';
import { MockStoryboardProvider } from './providers/storyboard/mock.js';

// LipSync providers
import { InfiniteTalkProvider } from './providers/lipsync/infinite-talk.js';
import { MockLipSyncProvider } from './providers/lipsync/mock.js';

// Music providers
import { ACEStepMusicProvider } from './providers/music/ace-step.js';
import { MockMusicProvider } from './providers/music/mock.js';

// TTS providers
import { EdgeTTSProvider } from './providers/tts/edge-tts.js';
import { GTTSProvider } from './providers/tts/gtts.js';
import { MockTTSProvider } from './providers/tts/mock.js';

export interface PipelineOptions {
  /** Use only mock providers (no GPU/API calls) */
  mockOnly?: boolean;
}

export function createVideoPipeline(options?: PipelineOptions): VideoPipeline {
  const isMock = options?.mockOnly ?? false;

  const scriptChain = new FallbackChain<ScriptGenRequest, ScriptGenResult>(
    isMock
      ? [() => new MockScriptProvider()]
      : [() => new OllamaScriptProvider(), () => new MockScriptProvider()]
  );

  const storyboardChain = new FallbackChain<StoryboardRequest, StoryboardResult>(
    isMock
      ? [() => new MockStoryboardProvider()]
      : [() => new OllamaStoryboardProvider(), () => new MockStoryboardProvider()]
  );

  const videoChain = new FallbackChain<VideoGenRequest, VideoGenResult>(
    isMock
      ? [() => new MockVideoProvider()]
      : [
          () => new LTXVideoProvider(),
          () => new WanVideoProvider(),
          () => new CogVideoXProvider(),
          () => new StockMediaFallbackProvider(),
          () => new MockVideoProvider(),
        ]
  );

  const lipsyncChain = new FallbackChain<LipSyncRequest, LipSyncResult>(
    isMock
      ? [() => new MockLipSyncProvider()]
      : [() => new InfiniteTalkProvider(), () => new MockLipSyncProvider()]
  );

  const musicChain = new FallbackChain<MusicGenRequest, MusicGenResult>(
    isMock
      ? [() => new MockMusicProvider()]
      : [() => new ACEStepMusicProvider(), () => new MockMusicProvider()]
  );

  const ttsChain = new FallbackChain<TTSRequest, TTSResult>(
    isMock
      ? [() => new MockTTSProvider()]
      : [() => new EdgeTTSProvider(), () => new GTTSProvider(), () => new MockTTSProvider()]
  );

  return new VideoPipeline(
    scriptChain,
    storyboardChain,
    videoChain,
    lipsyncChain,
    musicChain,
    ttsChain,
  );
}

export {
  VideoPipeline,
  FallbackChain,
  // Providers
  LTXVideoProvider,
  CogVideoXProvider,
  WanVideoProvider,
  StockMediaFallbackProvider,
  MockVideoProvider,
  OllamaScriptProvider,
  MockScriptProvider,
  OllamaStoryboardProvider,
  MockStoryboardProvider,
  InfiniteTalkProvider,
  MockLipSyncProvider,
  ACEStepMusicProvider,
  MockMusicProvider,
  EdgeTTSProvider,
  GTTSProvider,
  MockTTSProvider,
};
