import { mock, test } from 'node:test';
import assert from 'node:assert/strict';

/**
 * videos-controller.test.ts
 *
 * Node 22 mock API constraint: mock.module() for a given specifier can only be
 * registered ONCE per process. Register media-app.service exactly ONCE at
 * top-level with a mutable STATE the named exports read at call time.
 */

const serviceState: {
    listImpl: (req: unknown) => unknown[];
    getImpl: (id: string, req: unknown) => unknown;
} = {
    listImpl: () => [],
    getImpl: () => undefined,
};

mock.module('../../application/media-app.service', {
    namedExports: {
        mediaAppService: {
            listPublishedVideos: (req: unknown) => serviceState.listImpl(req),
            getPublishedVideo: (id: string, req: unknown) => serviceState.getImpl(id, req),
        },
    },
});

test('videos-controller getVideos returns success with data from service', async () => {
    const fakeVideos = [
        { id: 'v1', title: 'Test Video 1', url: '/media/v1.mp4' },
        { id: 'v2', title: 'Test Video 2', url: '/media/v2.mp4' },
    ];
    serviceState.listImpl = () => fakeVideos;

    const { getVideos } = await import('./videos-controller.js');

    let responseJson: unknown = null;
    const req = {};
    const res = { json: (data: unknown) => { responseJson = data; } };

    getVideos(req as any, res as any);

    assert.ok(responseJson, 'getVideos should call res.json');
    assert.deepStrictEqual(responseJson, { success: true, data: fakeVideos });
});

test('videos-controller getVideoById returns success with single video', async () => {
    const fakeVideo = { id: 'v42', title: 'Single Video', url: '/media/v42.mp4' };
    serviceState.getImpl = (id: string) => (id === 'v42' ? fakeVideo : undefined);

    const { getVideoById } = await import('./videos-controller.js');

    let responseJson: unknown = null;
    const req = { params: { videoId: 'v42' } };
    const res = { json: (data: unknown) => { responseJson = data; } };

    getVideoById(req as any, res as any);

    assert.ok(responseJson, 'getVideoById should call res.json');
    assert.deepStrictEqual(responseJson, { success: true, data: fakeVideo });
});

test('videos-controller getVideoById passes videoId from params to service', async () => {
    let capturedId = '';
    let capturedReq: unknown = null;
    serviceState.getImpl = (id: string, req: unknown) => {
        capturedId = id;
        capturedReq = req;
        return { id, title: 'Found' };
    };

    const { getVideoById } = await import('./videos-controller.js');

    const req = { params: { videoId: 'abc-123' } };
    const res = { json: (_data: unknown) => {} };

    getVideoById(req as any, res as any);

    assert.equal(capturedId, 'abc-123', 'should pass videoId from req.params');
    assert.strictEqual(capturedReq, req, 'should pass req to the service');
});
