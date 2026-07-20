import { ProviderResult, ProviderCapabilities, ProviderPriority } from '../types.js';

export abstract class BaseProvider<TRequest, TResult> {
  abstract readonly name: string;
  abstract readonly priority: ProviderPriority;
  abstract readonly capabilities: ProviderCapabilities;

  protected abstract doExecute(request: TRequest): Promise<TResult>;
  protected abstract doCheckAvailability(): Promise<boolean>;

  private availabilityCache: { available: boolean; timestamp: number } | null = null;
  private readonly CACHE_TTL_MS = 60_000;

  async execute(request: TRequest): Promise<ProviderResult<TResult>> {
    const start = performance.now();
    try {
      const available = await this.isAvailable();
      if (!available) {
        return {
          success: false,
          data: null,
          provider: this.name,
          error: `${this.name} is not available`,
          latencyMs: performance.now() - start,
        };
      }
      const data = await this.doExecute(request);
      return {
        success: true,
        data,
        provider: this.name,
        latencyMs: performance.now() - start,
      };
    } catch (err: any) {
      return {
        success: false,
        data: null,
        provider: this.name,
        error: err.message || String(err),
        latencyMs: performance.now() - start,
      };
    }
  }

  async isAvailable(): Promise<boolean> {
    if (this.availabilityCache && (Date.now() - this.availabilityCache.timestamp) < this.CACHE_TTL_MS) {
      return this.availabilityCache.available;
    }
    const available = await this.doCheckAvailability();
    this.availabilityCache = { available, timestamp: Date.now() };
    return available;
  }

  clearCache(): void {
    this.availabilityCache = null;
  }
}
