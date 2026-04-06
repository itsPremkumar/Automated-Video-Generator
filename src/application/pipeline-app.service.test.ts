import assert from 'node:assert/strict';
import test from 'node:test';
import { PipelineAppService } from './pipeline-app.service';

test('PipelineAppService.createJob normalizes defaults and delegates to shared job execution', async () => {
    let captured: any;

    const service = new PipelineAppService({
        createAndRunJob: async (jobId, publicId, title, script, options) => {
            captured = { jobId, publicId, title, script, options };
        },
        registerJobForRender: () => {
            throw new Error('not used');
        },
        continueJobToRender: async () => ({ alreadyQueued: false, mode: 'render' }),
        cancelJob: async () => ({ completed: true, pending: false }),
        retryJob: async () => ({ alreadyQueued: false, mode: 'generate' }),
        getJob: () => undefined,
        listJobs: () => [],
        setup: {
            getSetupStatus: () => ({ readyForGeneration: true }),
            getDiagnostics: () => ({ overall: 'healthy' }),
            repairRuntimeDependencies: async () => ({ ok: false, supported: false, message: 'noop' }),
            updateEnvValues: () => ({ readyForGeneration: true }),
        } as any,
    });

    const result = await service.createJob({
        title: 'Demo Video',
        script: 'This is a valid test script with enough length.',
        orientation: 'portrait',
        backgroundMusic: '',
        showText: true,
        skipReview: false,
    });

    assert.equal(result.title, 'Demo Video');
    assert.ok(result.jobId.startsWith('job_'));
    assert.ok(result.publicId.startsWith('demo_video_'));
    assert.equal(captured.title, 'Demo Video');
    assert.equal(captured.options.language, 'english');
    assert.equal(captured.options.showText, true);
});

test('PipelineAppService.waitForJobCompletion resolves terminal job state', async () => {
    let attempts = 0;

    const service = new PipelineAppService({
        createAndRunJob: async () => undefined,
        registerJobForRender: () => undefined,
        continueJobToRender: async () => ({ alreadyQueued: false, mode: 'render' }),
        cancelJob: async () => ({ completed: true, pending: false }),
        retryJob: async () => ({ alreadyQueued: false, mode: 'generate' }),
        getJob: () => {
            attempts += 1;
            return attempts > 1
                ? {
                    id: 'job_1',
                    status: 'completed',
                    phase: 'completed',
                    progress: 100,
                    message: 'done',
                    startTime: Date.now(),
                    updatedAt: Date.now(),
                    cancelRequested: false,
                    retryCount: 0,
                }
                : {
                    id: 'job_1',
                    status: 'processing',
                    phase: 'generate',
                    progress: 10,
                    message: 'working',
                    startTime: Date.now(),
                    updatedAt: Date.now(),
                    cancelRequested: false,
                    retryCount: 0,
                };
        },
        listJobs: () => [],
        setup: {
            getSetupStatus: () => ({ readyForGeneration: true }),
            getDiagnostics: () => ({ overall: 'healthy' }),
            repairRuntimeDependencies: async () => ({ ok: false, supported: false, message: 'noop' }),
            updateEnvValues: () => ({ readyForGeneration: true }),
        } as any,
    });

    const result = await service.waitForJobCompletion('job_1', { intervalMs: 1, timeoutMs: 100 });
    assert.equal(result.status, 'completed');
});
