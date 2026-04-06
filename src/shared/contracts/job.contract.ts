import { z } from 'zod';
import { MAX_TITLE_LENGTH } from '../../constants/config';

export const safeFilenameSchema = z.string().trim().min(1).max(255).regex(/^[^\\/]+$/, 'Invalid filename.');

export const textConfigSchema = z.object({
    animation: z.enum(['fade', 'slide', 'zoom', 'typewriter', 'pop']).optional(),
    background: z.enum(['none', 'box', 'glass']).optional(),
    color: z.string().trim().regex(/^#(?:[0-9a-fA-F]{3}){1,2}$/, 'Invalid subtitle color.').optional(),
    fontSize: z.number().int().min(16).max(144).optional(),
    glow: z.boolean().optional(),
    position: z.enum(['top', 'center', 'bottom']).optional(),
}).strict();

export const pipelineJobRequestSchema = z.object({
    id: z.string().trim().min(1).max(128).optional(),
    publicId: z.string().trim().min(1).max(128).optional(),
    title: z.string().trim().min(1).max(MAX_TITLE_LENGTH),
    script: z.string().trim().min(10).max(5000),
    orientation: z.enum(['portrait', 'landscape']).default('portrait'),
    language: z.string().trim().min(1).max(50).optional(),
    voice: z.string().trim().min(1).max(120).optional(),
    backgroundMusic: safeFilenameSchema.or(z.literal('')).optional().default(''),
    personalAudio: safeFilenameSchema.or(z.literal('')).optional(),
    defaultVideo: safeFilenameSchema.optional(),
    showText: z.boolean().optional().default(true),
    skipReview: z.boolean().optional().default(false),
    textConfig: textConfigSchema.optional(),
}).strict();

export const pipelineJobStatusSchema = z.object({
    jobId: z.string(),
    title: z.string(),
    publicId: z.string(),
    statusUrl: z.string().optional(),
    statusPageUrl: z.string().optional(),
});

export type JobTextConfig = z.infer<typeof textConfigSchema>;

export type JobRequestOptions = {
    orientation: 'portrait' | 'landscape';
    language: string;
    voice?: string;
    showText: boolean;
    backgroundMusic: string;
    personalAudio?: string;
    defaultVideo?: string;
    skipReview?: boolean;
    textConfig?: JobTextConfig;
};

export type StoredJobRequest = {
    title: string;
    script: string;
    options: JobRequestOptions;
};

export type JobState = 'pending' | 'processing' | 'awaiting_review' | 'cancelling' | 'cancelled' | 'completed' | 'failed';
export type JobPhase = 'generate' | 'review' | 'render' | 'completed';

export type JobStatus = {
    id: string;
    title?: string;
    publicId?: string;
    status: JobState;
    phase: JobPhase;
    progress: number;
    message: string;
    outputPath?: string;
    error?: string;
    errorDetails?: string;
    startTime: number;
    updatedAt: number;
    endTime?: number;
    cancelRequested: boolean;
    retryCount: number;
    request?: StoredJobRequest;
};

export type PipelineJobRequest = z.infer<typeof pipelineJobRequestSchema>;
export type PipelineJobAccepted = z.infer<typeof pipelineJobStatusSchema>;
