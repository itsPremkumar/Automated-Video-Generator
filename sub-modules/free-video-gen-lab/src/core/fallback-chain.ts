import { BaseProvider } from '../providers/base-provider.js';
import { ProviderResult } from '../types.js';

export type ProviderFactory<TRequest, TResult> = () => BaseProvider<TRequest, TResult>;

export class FallbackChain<TRequest, TResult> {
  private providers: BaseProvider<TRequest, TResult>[] = [];

  constructor(providerFactories: ProviderFactory<TRequest, TResult>[]) {
    this.providers = providerFactories
      .map(fn => fn())
      .sort((a, b) => a.priority - b.priority);
  }

  async execute(request: TRequest): Promise<ProviderResult<TResult>> {
    const errors: string[] = [];

    for (const provider of this.providers) {
      const result = await provider.execute(request);
      if (result.success && result.data !== null) {
        return {
          ...result,
          error: errors.length > 0
            ? `Previous providers failed: ${errors.join('; ')}. ${provider.name} succeeded.`
            : undefined,
        };
      }
      if (result.error) {
        errors.push(`${provider.name}: ${result.error}`);
      }
    }

    return {
      success: false,
      data: null,
      provider: 'fallback-chain',
      error: `All ${this.providers.length} providers failed. Errors: ${errors.join('; ')}`,
      latencyMs: 0,
    };
  }

  async getAvailableProviders(): Promise<BaseProvider<TRequest, TResult>[]> {
    const available: BaseProvider<TRequest, TResult>[] = [];
    for (const p of this.providers) {
      if (await p.isAvailable()) {
        available.push(p);
      }
    }
    return available;
  }

  getProviderNames(): string[] {
    return this.providers.map(p => p.name);
  }
}
