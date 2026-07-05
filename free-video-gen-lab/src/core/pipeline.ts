import type {
  ScriptGenRequest, ScriptGenResult,
  StoryboardRequest, StoryboardResult,
  VideoGenRequest, VideoGenResult,
  LipSyncRequest, LipSyncResult,
  MusicGenRequest, MusicGenResult,
  TTSRequest, TTSResult,
  PipelineRequest, PipelineResult, ProviderResult,
} from '../types.js';
import { FallbackChain } from './fallback-chain.js';
import type { BaseProvider } from '../providers/base-provider.js';

export class VideoPipeline {
  private scriptChain: FallbackChain<ScriptGenRequest, ScriptGenResult>;
  private storyboardChain: FallbackChain<StoryboardRequest, StoryboardResult>;
  private videoChain: FallbackChain<VideoGenRequest, VideoGenResult>;
  private lipsyncChain: FallbackChain<LipSyncRequest, LipSyncResult>;
  private musicChain: FallbackChain<MusicGenRequest, MusicGenResult>;
  private ttsChain: FallbackChain<TTSRequest, TTSResult>;

  constructor(
    scriptChain: FallbackChain<ScriptGenRequest, ScriptGenResult>,
    storyboardChain: FallbackChain<StoryboardRequest, StoryboardResult>,
    videoChain: FallbackChain<VideoGenRequest, VideoGenResult>,
    lipsyncChain: FallbackChain<LipSyncRequest, LipSyncResult>,
    musicChain: FallbackChain<MusicGenRequest, MusicGenResult>,
    ttsChain: FallbackChain<TTSRequest, TTSResult>,
  ) {
    this.scriptChain = scriptChain;
    this.storyboardChain = storyboardChain;
    this.videoChain = videoChain;
    this.lipsyncChain = lipsyncChain;
    this.musicChain = musicChain;
    this.ttsChain = ttsChain;
  }

  async generateVideo(request: PipelineRequest): Promise<PipelineResult> {
    const providersUsed: string[] = [];
    const errors: string[] = [];
    const outputDir = request.outputDir || './output';

    // Step 1: Generate script from topic
    console.log(`\n📝 Step 1: Generating script for topic: "${request.topic}"`);
    let scriptResult: ProviderResult<ScriptGenResult>;
    try {
      scriptResult = await this.scriptChain.execute({
        topic: request.topic,
        style: request.style,
        duration: request.duration,
      });
      if (!scriptResult.success || !scriptResult.data) {
        throw new Error(`Script generation failed: ${scriptResult.error}`);
      }
      providersUsed.push(scriptResult.provider);
      console.log(`   ✅ Script generated (${scriptResult.data.scenes.length} scenes) via ${scriptResult.provider}`);
    } catch (err: any) {
      errors.push(`Script gen: ${err.message}`);
      return {
        videoPath: '',
        script: { title: '', scenes: [], fullScript: '', provider: 'error' },
        storyboard: { scenes: [], provider: 'error' },
        scenes: 0, totalDuration: 0,
        providersUsed, errors,
      };
    }

    // Step 2: Generate storyboard / scene visuals
    console.log(`\n🎨 Step 2: Generating storyboard...`);
    let storyboardResult: ProviderResult<StoryboardResult>;
    try {
      storyboardResult = await this.storyboardChain.execute({
        scenes: scriptResult.data.scenes,
        style: request.style,
        aspectRatio: request.aspectRatio,
      });
      if (!storyboardResult.success || !storyboardResult.data) {
        throw new Error(`Storyboard generation failed: ${storyboardResult.error}`);
      }
      providersUsed.push(storyboardResult.provider);
      console.log(`   ✅ Storyboard generated (${storyboardResult.data.scenes.length} scenes) via ${storyboardResult.provider}`);
    } catch (err: any) {
      errors.push(`Storyboard: ${err.message}`);
      storyboardResult = {
        success: true, data: { scenes: [], provider: 'none' },
        provider: 'none', latencyMs: 0,
      };
    }

    // Step 3: Generate voiceover (TTS)
    console.log(`\n🔊 Step 3: Generating voiceover...`);
    let ttsPaths: string[] = [];
    try {
      for (const scene of scriptResult.data.scenes) {
        const ttsResult = await this.ttsChain.execute({
          text: scene.narration,
        });
        if (ttsResult.success && ttsResult.data) {
          ttsPaths.push(ttsResult.data.filePath);
          if (!providersUsed.includes(ttsResult.provider)) {
            providersUsed.push(ttsResult.provider);
          }
        }
      }
      console.log(`   ✅ Voiceover generated (${ttsPaths.length} scenes)`);
    } catch (err: any) {
      errors.push(`TTS: ${err.message}`);
    }

    // Step 4: Generate background music
    console.log(`\n🎵 Step 4: Generating background music...`);
    let musicPath: string | undefined;
    try {
      const musicResult = await this.musicChain.execute({
        mood: request.style || 'cinematic',
        duration: request.duration || 30,
      });
      if (musicResult.success && musicResult.data) {
        musicPath = musicResult.data.filePath;
        providersUsed.push(musicResult.provider);
        console.log(`   ✅ Music generated via ${musicResult.provider}`);
      }
    } catch (err: any) {
      errors.push(`Music: ${err.message}`);
    }

    // Step 5: Generate video for each scene
    console.log(`\n🎬 Step 5: Generating scene videos...`);
    const videoPaths: string[] = [];
    try {
      for (const scene of scriptResult.data.scenes) {
        const videoResult = await this.videoChain.execute({
          prompt: scene.visualPrompt,
          duration: scene.duration,
          resolution: request.resolution,
          fps: request.fps,
        });
        if (videoResult.success && videoResult.data) {
          videoPaths.push(videoResult.data.filePath);
          if (!providersUsed.includes(videoResult.provider)) {
            providersUsed.push(videoResult.provider);
          }
          console.log(`   ✅ Scene ${scene.sceneNumber} video via ${videoResult.provider}`);
        }
      }
    } catch (err: any) {
      errors.push(`Video gen: ${err.message}`);
    }

    const totalDuration = scriptResult.data.scenes.reduce((sum, s) => sum + s.duration, 0);

    console.log(`\n📊 Pipeline complete!`);
    console.log(`   Scenes: ${scriptResult.data.scenes.length}`);
    console.log(`   Duration: ${totalDuration}s`);
    console.log(`   Providers used: ${providersUsed.join(', ')}`);
    if (errors.length > 0) {
      console.log(`   ⚠️ Errors: ${errors.join('; ')}`);
    }

    return {
      videoPath: videoPaths[0] || '',
      script: scriptResult.data,
      storyboard: storyboardResult.data || { scenes: [], provider: '' },
      audioPath: ttsPaths[0],
      musicPath,
      scenes: scriptResult.data.scenes.length,
      totalDuration,
      providersUsed,
      errors,
    };
  }
}
