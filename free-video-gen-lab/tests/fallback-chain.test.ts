import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { FallbackChain } from '../src/core/fallback-chain.js';
import { BaseProvider } from '../src/providers/base-provider.js';
import { ProviderCapabilities } from '../src/types.js';

class AlwaysFailsProvider extends BaseProvider<string, string> {
  readonly name = 'always-fails';
  readonly priority = 1;
  readonly capabilities: ProviderCapabilities = {
    canGenerateVideo: false, canGenerateImage: false, canGenerateAudio: false,
    canGenerateScript: false, canLipSync: false, canEditVideo: false,
    needsGpu: false, needsApiKey: false, needsModelDownload: false,
    maxVideoLengthSeconds: 0, supportedResolutions: [],
  };

  protected async doCheckAvailability(): Promise<boolean> { return true; }
  protected async doExecute(request: string): Promise<string> {
    throw new Error('I always fail');
  }
}

class AlwaysSucceedsProvider extends BaseProvider<string, string> {
  readonly name = 'always-succeeds';
  readonly priority = 2;
  readonly capabilities: ProviderCapabilities = {
    canGenerateVideo: false, canGenerateImage: false, canGenerateAudio: false,
    canGenerateScript: false, canLipSync: false, canEditVideo: false,
    needsGpu: false, needsApiKey: false, needsModelDownload: false,
    maxVideoLengthSeconds: 0, supportedResolutions: [],
  };

  protected async doCheckAvailability(): Promise<boolean> { return true; }
  protected async doExecute(request: string): Promise<string> {
    return `processed: ${request}`;
  }
}

class UnavailableProvider extends BaseProvider<string, string> {
  readonly name = 'unavailable';
  readonly priority = 0;
  readonly capabilities: ProviderCapabilities = {
    canGenerateVideo: false, canGenerateImage: false, canGenerateAudio: false,
    canGenerateScript: false, canLipSync: false, canEditVideo: false,
    needsGpu: false, needsApiKey: false, needsModelDownload: false,
    maxVideoLengthSeconds: 0, supportedResolutions: [],
  };

  protected async doCheckAvailability(): Promise<boolean> { return false; }
  protected async doExecute(request: string): Promise<string> {
    return 'should not reach here';
  }
}

describe('FallbackChain', () => {
  it('should succeed with first available provider', async () => {
    const chain = new FallbackChain<string, string>([
      () => new AlwaysSucceedsProvider(),
    ]);
    const result = await chain.execute('hello');
    assert.equal(result.success, true);
    assert.equal(result.data, 'processed: hello');
    assert.equal(result.provider, 'always-succeeds');
  });

  it('should fall through when first provider fails', async () => {
    const chain = new FallbackChain<string, string>([
      () => new AlwaysFailsProvider(),
      () => new AlwaysSucceedsProvider(),
    ]);
    const result = await chain.execute('hello');
    assert.equal(result.success, true);
    assert.equal(result.data, 'processed: hello');
    assert.equal(result.provider, 'always-succeeds');
  });

  it('should fail when all providers fail', async () => {
    const chain = new FallbackChain<string, string>([
      () => new AlwaysFailsProvider(),
    ]);
    const result = await chain.execute('hello');
    assert.equal(result.success, false);
    assert.equal(result.data, null);
  });

  it('should skip unavailable providers', async () => {
    const chain = new FallbackChain<string, string>([
      () => new UnavailableProvider(),
      () => new AlwaysSucceedsProvider(),
    ]);
    const result = await chain.execute('hello');
    assert.equal(result.success, true);
    assert.equal(result.provider, 'always-succeeds');
    assert.equal(result.data, 'processed: hello');
  });

  it('should order providers by priority', async () => {
    const chain = new FallbackChain<string, string>([
      () => new AlwaysSucceedsProvider(), // priority 2
      () => new AlwaysFailsProvider(),     // priority 1 (should come first)
    ]);
    const names = chain.getProviderNames();
    assert.equal(names[0], 'always-fails');   // priority 1
    assert.equal(names[1], 'always-succeeds'); // priority 2
  });

  it('should report error from previous providers on success', async () => {
    const chain = new FallbackChain<string, string>([
      () => new AlwaysFailsProvider(),
      () => new AlwaysSucceedsProvider(),
    ]);
    const result = await chain.execute('test');
    assert.equal(result.success, true);
    assert.ok(result.error?.includes('always-fails'));
    assert.ok(result.error?.includes('always-succeeds'));
  });
});

describe('BaseProvider', () => {
  it('should cache availability check', async () => {
    let callCount = 0;
    class TestProvider extends BaseProvider<string, string> {
      readonly name = 'test';
      readonly priority = 1;
      readonly capabilities: ProviderCapabilities = {
        canGenerateVideo: false, canGenerateImage: false, canGenerateAudio: false,
        canGenerateScript: false, canLipSync: false, canEditVideo: false,
        needsGpu: false, needsApiKey: false, needsModelDownload: false,
        maxVideoLengthSeconds: 0, supportedResolutions: [],
      };
      protected async doCheckAvailability(): Promise<boolean> {
        callCount++;
        return true;
      }
      protected async doExecute(request: string): Promise<string> {
        return request;
      }
    }

    const provider = new TestProvider();
    await provider.isAvailable();
    await provider.isAvailable();
    await provider.isAvailable();
    assert.equal(callCount, 1); // Cached after first call
  });

  it('should return error result when unavailable', async () => {
    class UnavailProvider extends BaseProvider<string, string> {
      readonly name = 'unavail';
      readonly priority = 1;
      readonly capabilities: ProviderCapabilities = {
        canGenerateVideo: false, canGenerateImage: false, canGenerateAudio: false,
        canGenerateScript: false, canLipSync: false, canEditVideo: false,
        needsGpu: false, needsApiKey: false, needsModelDownload: false,
        maxVideoLengthSeconds: 0, supportedResolutions: [],
      };
      protected async doCheckAvailability(): Promise<boolean> { return false; }
      protected async doExecute(request: string): Promise<string> { return request; }
    }

    const provider = new UnavailProvider();
    const result = await provider.execute('test');
    assert.equal(result.success, false);
    assert.ok(result.error?.includes('not available'));
  });

  it('should report latency in result', async () => {
    class SlowProvider extends BaseProvider<string, string> {
      readonly name = 'slow';
      readonly priority = 1;
      readonly capabilities: ProviderCapabilities = {
        canGenerateVideo: false, canGenerateImage: false, canGenerateAudio: false,
        canGenerateScript: false, canLipSync: false, canEditVideo: false,
        needsGpu: false, needsApiKey: false, needsModelDownload: false,
        maxVideoLengthSeconds: 0, supportedResolutions: [],
      };
      protected async doCheckAvailability(): Promise<boolean> { return true; }
      protected async doExecute(request: string): Promise<string> {
        await new Promise(r => setTimeout(r, 50));
        return request;
      }
    }

    const provider = new SlowProvider();
    const result = await provider.execute('test');
    assert.equal(result.success, true);
    assert.ok(result.latencyMs >= 40, `Expected >= 40ms, got ${result.latencyMs}`);
  });
});
