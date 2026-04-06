import assert from 'node:assert/strict';
import test from 'node:test';
import { pipelineJobRequestSchema } from './job.contract';

test('pipelineJobRequestSchema accepts the shared request shape used by adapters', () => {
    const parsed = pipelineJobRequestSchema.parse({
        title: 'Shared Contract',
        script: 'This script is long enough to satisfy the validation rules.',
        orientation: 'landscape',
        skipReview: true,
    });

    assert.equal(parsed.orientation, 'landscape');
    assert.equal(parsed.skipReview, true);
    assert.equal(parsed.showText, true);
    assert.equal(parsed.backgroundMusic, '');
});
