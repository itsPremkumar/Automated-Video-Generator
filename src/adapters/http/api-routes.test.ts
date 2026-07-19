import { mock, test } from 'node:test';
import assert from 'node:assert/strict';

test('api-routes registers all expected routes', async () => {
  const schemaNames = [
    'assetFilenameParamsSchema',
    'generateScriptBodySchema',
    'jobIdParamsSchema',
    'listFilesQuerySchema',
    'pickFileBodySchema',
    'refineSceneBodySchema',
    'reorderScenesBodySchema',
    'sceneParamsSchema',
    'startJobBodySchema',
    'updateEnvBodySchema',
    'updateSceneBodySchema',
    'videoIdParamsSchema',
    'viewFileQuerySchema',
    'saveToBodySchema',
    'socialDownloadBodySchema',
  ];

  const fakeSchema = { parse: (v: unknown) => v, _def: {}, description: 'fake', isNullable: false };

  // --- Mock all dependencies before the module under test is loaded ---
  mock.module('../../constants/config', {
    namedExports: {
      RATE_LIMIT_MAX: 10,
      RATE_LIMIT_WINDOW_MS: 900_000,
    },
  });

  mock.module('../../lib/validation', {
    namedExports: {
      asyncHandler: (fn: unknown) => fn,
      validateRequest: () => (_req: unknown, _res: unknown, next: () => void) => next(),
    },
  });

  mock.module('../../middleware/local-only', {
    namedExports: {
      requireLocalAccess: (_req: unknown, _res: unknown, next: () => void) => next(),
    },
  });

  mock.module('../../middleware/rate-limit', {
    namedExports: {
      createMemoryRateLimiter: () => (_req: unknown, _res: unknown, next: () => void) => next(),
    },
  });

  // Controllers – provide the named exports referenced in api-routes.ts
  mock.module('./ai-controller', {
    namedExports: { getVoices: () => {}, generateScriptAI: () => {} },
  });
  mock.module('./files-controller', {
    namedExports: {
      listFiles: () => {},
      pickFile: () => {},
      saveTo: () => {},
      listDrives: () => {},
      getHomeDirs: () => {},
      listGalleryAssets: () => {},
      deleteAsset: () => {},
      viewFile: () => {},
    },
  });
  mock.module('./jobs-controller', {
    namedExports: {
      getJobStatus: () => {},
      confirmJobRender: () => {},
      cancelJobController: () => {},
      retryJobController: () => {},
      startJobController: () => {},
    },
  });
  mock.module('./scenes-controller', {
    namedExports: {
      getJobScenes: () => {},
      reorderScenes: () => {},
      updateJobScene: () => {},
      deleteScene: () => {},
      refineSceneWithAI: () => {},
    },
  });
  mock.module('./setup-controller', {
    namedExports: { healthCheck: () => {}, getStatus: () => {}, updateEnv: () => {} },
  });
  mock.module('./videos-controller', {
    namedExports: { getVideos: () => {}, getVideoById: () => {} },
  });
  mock.module('./video-download-controller', {
    namedExports: { processDownloadRequest: () => {} },
  });
  mock.module('./social-download-controller', {
    namedExports: { processSocialDownloadRequest: () => {} },
  });
  mock.module('./free-video-controller', {
    namedExports: { sources: () => {}, search: () => {}, download: () => {} },
  });

  // Schemas
  const schemaExports: Record<string, unknown> = {};
  for (const name of schemaNames) {
    schemaExports[name] = fakeSchema;
  }
  mock.module('../../schemas/api.schemas', { namedExports: schemaExports });

  // --- Import the module under test (dynamic – mocks are already registered) ---
  const apiRoutesModule = await import('./api-routes.js');
  const router = (apiRoutesModule as any).default;

  // --- Assertions ---
  assert.ok(router, 'Router should be exported as default');
  assert.ok(Array.isArray(router.stack), 'Router should have a stack array');
  assert.ok(
    router.stack.length >= 20,
    `Router should have at least 20 layers (got ${router.stack.length})`,
  );

  // Extract route info from Express Router stack
  interface RouteInfo {
    method: string;
    path: string;
  }

  function extractRoutes(): RouteInfo[] {
    const routes: RouteInfo[] = [];
    for (const layer of router.stack) {
      if (layer.route && typeof layer.route.path === 'string') {
        const methods = Object.keys(layer.route.methods).filter((m) => m !== '_all');
        for (const method of methods) {
          routes.push({ method: method.toUpperCase(), path: layer.route.path });
        }
      }
    }
    return routes;
  }

  const registered = extractRoutes();

  const expectedRoutes: RouteInfo[] = [
    { method: 'GET', path: '/health' },
    { method: 'GET', path: '/videos' },
    { method: 'GET', path: '/videos/:videoId' },
    { method: 'GET', path: '/voices' },
    { method: 'GET', path: '/setup/status' },
    { method: 'POST', path: '/setup/env' },
    { method: 'GET', path: '/jobs/:jobId' },
    { method: 'GET', path: '/jobs/:jobId/scenes' },
    { method: 'POST', path: '/jobs/:jobId/scenes/reorder' },
    { method: 'POST', path: '/jobs/:jobId/scenes/:sceneIndex' },
    { method: 'DELETE', path: '/jobs/:jobId/scenes/:sceneIndex' },
    { method: 'POST', path: '/jobs/:jobId/scenes/:sceneIndex/refine' },
    { method: 'POST', path: '/jobs/:jobId/confirm' },
    { method: 'POST', path: '/jobs/:jobId/cancel' },
    { method: 'POST', path: '/jobs/:jobId/retry' },
    { method: 'POST', path: '/jobs' },
    { method: 'POST', path: '/ai/generate-script' },
    { method: 'POST', path: '/video-download/process' },
    { method: 'POST', path: '/social-download/process' },
    { method: 'GET', path: '/free-video/sources' },
    { method: 'GET', path: '/free-video/search' },
    { method: 'POST', path: '/free-video/download' },
    { method: 'GET', path: '/fs/ls' },
    { method: 'POST', path: '/fs/pick' },
    { method: 'POST', path: '/fs/save-to' },
    { method: 'GET', path: '/fs/drives' },
    { method: 'GET', path: '/fs/home' },
    { method: 'GET', path: '/fs/assets' },
    { method: 'DELETE', path: '/fs/assets/:filename' },
    { method: 'GET', path: '/fs/view' },
  ];

  // Spot-check essential endpoints
  for (const expected of expectedRoutes) {
    const found = registered.some(
      (r) => r.method === expected.method && r.path === expected.path,
    );
    assert.ok(
      found,
      `Route ${expected.method} ${expected.path} should be registered`,
    );
  }

  // Verify all expected routes are registered with the correct count
  assert.equal(
    registered.length,
    expectedRoutes.length,
    `Expected ${expectedRoutes.length} routes but found ${registered.length}`,
  );

  // Verify middleware-only layers exist (rate limiters, validate, etc.)
  const middlewareLayers = router.stack.filter((l: any) => !l.route);
  assert.ok(
    middlewareLayers.length >= 2,
    `Should have at least 2 middleware-only layers (got ${middlewareLayers.length})`,
  );
});
