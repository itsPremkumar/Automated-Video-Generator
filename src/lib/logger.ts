import { logError, logInfo, logWarn } from '../shared/logging/runtime-logging';

/**
 * Simple logger interface with support for context/trace fields
 */
export interface Logger {
    info(message: string, context?: Record<string, unknown>, ...args: unknown[]): void;
    warn(message: string, context?: Record<string, unknown>, ...args: unknown[]): void;
    error(message: string, context?: Record<string, unknown>, ...args: unknown[]): void;
    child(context: Record<string, unknown>): Logger;
}

/**
 * Default application logger implementation
 */
class AppLogger implements Logger {
    constructor(private readonly context: Record<string, unknown> = {}) {}

    private format(message: string, context?: Record<string, unknown>): string {
        const merged = { ...this.context, ...context };
        const meta = Object.keys(merged).length > 0 ? ` ${JSON.stringify(merged)}` : '';
        return `[${new Date().toISOString()}] ${message}${meta}`;
    }

    info(message: string, context?: Record<string, unknown>, ...args: unknown[]): void {
        logInfo(this.format(message, context), ...args);
    }

    warn(message: string, context?: Record<string, unknown>, ...args: unknown[]): void {
        logWarn(this.format(message, context), ...args);
    }

    error(message: string, context?: Record<string, unknown>, ...args: unknown[]): void {
        logError(this.format(message, context), ...args);
    }

    child(context: Record<string, unknown>): Logger {
        return new AppLogger({ ...this.context, ...context });
    }
}

export const appLogger: Logger = new AppLogger();
