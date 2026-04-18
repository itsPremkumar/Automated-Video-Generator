import { z } from 'zod';
import { MAX_TITLE_LENGTH } from '../constants/config';
import { pipelineJobRequestSchema } from '../shared/contracts/job.contract';

const safeFilenameSchema = z.string().trim().min(1).max(255).regex(/^[^\\/]+$/, 'Invalid filename.');

const textConfigSchema = z.object({
    animation: z.enum(['fade', 'slide', 'zoom', 'typewriter', 'pop']).optional(),
    background: z.enum(['none', 'box', 'glass']).optional(),
    color: z.string().trim().regex(/^#(?:[0-9a-fA-F]{3}){1,2}$/, 'Invalid subtitle color.').optional(),
    fontSize: z.number().int().min(16).max(144).optional(),
    glow: z.boolean().optional(),
    position: z.enum(['top', 'center', 'bottom']).optional(),
}).strict();

const voiceConfigSchema = z.object({
    pitch: z.number().int().min(-50).max(50).optional(),
    rate: z.number().int().min(-100).max(100).optional(),
    voice: z.string().trim().min(1).max(120).optional(),
}).strict();

export const startJobBodySchema = pipelineJobRequestSchema.omit({
    id: true,
    publicId: true,
});

export const updateEnvBodySchema = z.object({
    PEXELS_API_KEY: z.string().trim().max(300).optional(),
    PIXABAY_API_KEY: z.string().trim().max(300).optional(),
    GEMINI_API_KEY: z.string().trim().max(300).optional(),
    PUBLIC_BASE_URL: z.string().trim().url().max(500).optional(),
}).strict().refine((value) => Object.values(value).some((entry) => typeof entry === 'string' && entry.length > 0), {
    message: 'At least one environment value must be provided.',
});

export const jobIdParamsSchema = z.object({
    jobId: z.string().trim().min(1).max(128).regex(/^job_[a-zA-Z0-9_-]+$/, 'Invalid job ID.'),
}).strict();

export const videoIdParamsSchema = z.object({
    videoId: z.string().trim().min(1).max(128).regex(/^[a-zA-Z0-9_-]+$/, 'Invalid video ID.'),
}).strict();

export const sceneParamsSchema = z.object({
    jobId: z.string().trim().min(1).max(128).regex(/^job_[a-zA-Z0-9_-]+$/, 'Invalid job ID.'),
    sceneIndex: z.string().trim().regex(/^\d+$/, 'Invalid scene index.'),
}).strict();

export const reorderScenesBodySchema = z.object({
    fromIndex: z.number().int().min(0),
    toIndex: z.number().int().min(0),
}).strict();

export const updateSceneBodySchema = z.object({
    voiceoverText: z.string().trim().min(1).max(5000).optional(),
    searchKeywords: z.array(z.string().trim().min(1).max(60)).min(1).max(12).optional(),
    localAsset: safeFilenameSchema.optional(),
    duration: z.number().int().min(1).max(600).optional(),
    showText: z.boolean().optional(),
    voiceConfig: voiceConfigSchema.optional(),
}).strict().refine((value) => Object.keys(value).length > 0, {
    message: 'At least one scene field must be provided.',
});

export const refineSceneBodySchema = z.object({
    instruction: z.string().trim().min(1).max(500),
}).strict();

export const generateScriptBodySchema = z.object({
    prompt: z.string().trim().min(1).max(2000),
}).strict();

export const listFilesQuerySchema = z.object({
    path: z.string().trim().max(2048).optional(),
}).strict();

export const pickFileBodySchema = z.object({
    sourcePath: z.string().trim().min(1).max(2048),
    type: z.enum(['music', 'personalAudio', 'media', 'asset']).default('media'),
}).strict();

export const viewFileQuerySchema = z.object({
    path: z.string().trim().min(1).max(2048),
}).strict();

export const assetFilenameParamsSchema = z.object({
    filename: safeFilenameSchema,
}).strict();

export const saveToBodySchema = z.object({
    sourcePath: z.string().trim().min(1).max(2048),
    targetDirectory: z.string().trim().min(1).max(2048),
}).strict();

export const socialDownloadBodySchema = z.object({
    url: z.string().trim().url().min(1).max(2048),
    mode: z.enum(['both', 'video', 'audio']).default('both'),
}).strict();
