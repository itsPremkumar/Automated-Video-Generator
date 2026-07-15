import { FfmpegSfxGenerator } from './generator.js';
import { LocalSfxProvider } from './local-provider.js';

export const ffmpegSfxGenerator = new FfmpegSfxGenerator();
export const localSfxProvider = new LocalSfxProvider();

export type { SfxClip, SfxKind, SfxProvider } from './models.js';
