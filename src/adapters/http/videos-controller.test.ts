import { mock, test } from 'node:test';
import assert from 'node:assert/strict';

test('videos-controller getVideos returns success with data from service', async () => {
  const fakeVideos = [
    { id: 'v1', title: 'Test Video 1', url: '/media/v1.mp4' },
    { id: 'v2', title: 'Test Video 2', url: '/media/v2.mp4' },
  ];

  mock.module('../../application/media-app.service', {
    namedExports: {
      mediaAppService: {
        listPublishedVideos: (_req: unknown) => fakeVideos,
        getPublishedVideo: (_id: string, _req: unknown) => fakeVideos[0],
      },
    },
  });

  const { getVideos, getVideoById } = await import('./videos-controller.js');

  // --- getVideos ---
  let responseJson: unknown = null;
  const req = {};
  const res = {
    json: (data: unknown) => {
      responseJson = data;
    },
  };

  getVideos(req as any, res as any);

  assert.ok(responseJson, 'getVideos should call res.json');
  assert.deepStrictEqual(responseJson, {
    success: true,
    data: fakeVideos,
  });
});

test('videos-controller getVideoById returns success with single video', async () => {
  const fakeVideo = { id: 'v42', title: 'Single Video', url: '/media/v42.mp4' };

  mock.module('../../application/media-app.service', {
    namedExports: {
      mediaAppService: {
        listPublishedVideos: (_req: unknown) => [],
        getPublishedVideo: (id: string, _req: unknown) =>
          id === 'v42' ? fakeVideo : undefined,
      },
    },
  });

  const { getVideoById } = await import('./videos-controller.js');

  let responseJson: unknown = null;
  const req = { params: { videoId: 'v42' } };
  const res = {
    json: (data: unknown) => {
      responseJson = data;
    },
  };

  getVideoById(req as any, res as any);

  assert.ok(responseJson, 'getVideoById should call res.json');
  assert.deepStrictEqual(responseJson, {
    success: true,
    data: fakeVideo,
  });
});

test('videos-controller getVideoById passes videoId from params to service', async () => {
  let capturedId = '';
  let capturedReq: unknown = null;

  mock.module('../../application/media-app.service', {
    namedExports: {
      mediaAppService: {
        listPublishedVideos: (_req: unknown) => [],
        getPublishedVideo: (id: string, req: unknown) => {
          capturedId = id;
          capturedReq = req;
          return { id, title: 'Found' };
        },
      },
    },
  });

  const { getVideoById } = await import('./videos-controller.js');

  const req = { params: { videoId: 'abc-123' } };
  const res = {
    json: (_data: unknown) => {},
  };

  getVideoById(req as any, res as any);

  assert.equal(capturedId, 'abc-123', 'should pass videoId from req.params');
  assert.strictEqual(capturedReq, req, 'should pass req to the service');
});
