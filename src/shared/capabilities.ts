import { ForbiddenError } from '../lib/errors';

export const capabilities = {
    desktop: {
        canRepair: true,
        hasTray: true,
        canAccessLocalFS: true,
        safeMode: false,
    },
    browser: {
        canRepair: false,
        hasTray: false,
        canAccessLocalFS: false,
        safeMode: false,
    },
    cli: {
        canRepair: false,
        hasTray: false,
        canAccessLocalFS: true,
        interactiveUI: false,
        safeMode: false,
    },
    mcp: {
        canRepair: false,
        hasTray: false,
        canAccessLocalFS: true,
        interactiveUI: false,
        safeMode: true,
    },
} as const;

export type RuntimeCapabilityName = keyof typeof capabilities;
export type RuntimeCapability = keyof typeof capabilities.desktop;

export function getRuntimeCapabilities(runtime: RuntimeCapabilityName) {
    return capabilities[runtime];
}

export function hasRuntimeCapability(runtime: RuntimeCapabilityName, capability: RuntimeCapability): boolean {
    return Boolean(getRuntimeCapabilities(runtime)[capability]);
}

export function assertRuntimeCapability(
    runtime: RuntimeCapabilityName,
    capability: RuntimeCapability,
    message = `Runtime "${runtime}" does not support "${capability}".`,
): void {
    if (!hasRuntimeCapability(runtime, capability)) {
        throw new ForbiddenError(message);
    }
}

export function assertSafeMutationAllowed(
    runtime: RuntimeCapabilityName,
    operation: string,
): void {
    const runtimeCapabilities = getRuntimeCapabilities(runtime);
    if (!runtimeCapabilities.safeMode) {
        return;
    }

    if (process.env.ALLOW_UNSAFE_MCP_TOOLS === '1') {
        return;
    }

    throw new ForbiddenError(
        `Runtime "${runtime}" is in safe mode and cannot ${operation}. Set ALLOW_UNSAFE_MCP_TOOLS=1 to enable this intentionally.`,
    );
}
