import * as fs from 'fs';
import * as path from 'path';
import { resolveRuntimePublicPath, resolveWorkspacePath } from './shared/runtime/paths';

export interface PipelineWorkspace {
    outputId: string;
    publicRoot: string;
    publicNamespace: string;
    workspaceDir: string;
    videosDir: string;
    audioDir: string;
    visualsDir: string;
}

export function sanitizeOutputId(value: string | undefined): string {
    const sanitized = (value || 'video')
        .replace(/[^a-zA-Z0-9_-]/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 80);

    return sanitized || 'video';
}

function normalizePreferredId(value: string | undefined, fallbackOutputDir: string): string {
    if (!value) {
        return path.basename(path.resolve(fallbackOutputDir));
    }

    const normalized = value.trim().replace(/\\/g, '/');
    const namespaceMatch = /^jobs\/([a-zA-Z0-9_-]+)$/.exec(normalized);
    if (namespaceMatch) {
        return namespaceMatch[1];
    }

    return normalized;
}

export function createPipelineWorkspace(outputDir: string, preferredId?: string): PipelineWorkspace {
    const derivedId = normalizePreferredId(preferredId, outputDir);
    const outputId = sanitizeOutputId(derivedId);
    const publicRoot = resolveRuntimePublicPath();
    const publicNamespace = `jobs/${outputId}`;
    const workspaceDir = resolveWorkspacePath(outputId);

    return {
        outputId,
        publicRoot,
        publicNamespace,
        workspaceDir,
        videosDir: path.join(workspaceDir, 'videos'),
        audioDir: path.join(workspaceDir, 'audio'),
        visualsDir: path.join(workspaceDir, 'visuals'),
    };
}

export function ensurePipelineWorkspace(workspace: PipelineWorkspace): void {
    for (const dir of [workspace.videosDir, workspace.audioDir, workspace.visualsDir]) {
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
    }
}

export function resolveAssetWorkspaceDir(assetNamespace: string): string {
    const normalized = assetNamespace.trim().replace(/\\/g, '/');
    const match = /^jobs\/([a-zA-Z0-9_-]+)$/.exec(normalized);

    if (!match) {
        throw new Error(`Invalid asset namespace: ${assetNamespace}`);
    }

    return resolveWorkspacePath(match[1]);
}

export function toPublicRelativePath(absolutePath: string): string {
    const publicRoot = resolveRuntimePublicPath();
    const relativeToPublic = path.relative(publicRoot, absolutePath);
    if (relativeToPublic !== '' && !relativeToPublic.startsWith('..') && !path.isAbsolute(relativeToPublic)) {
        return relativeToPublic.replace(/\\/g, '/');
    }

    const wsPrefix = resolveWorkspacePath();
    const relativeToWs = path.relative(wsPrefix, absolutePath);
    if (relativeToWs !== '' && !relativeToWs.startsWith('..') && !path.isAbsolute(relativeToWs)) {
        const m = /^([^\\/]+)[\\/](.+)$/.exec(relativeToWs);
        if (m) {
            return `jobs/${m[1]}/${m[2].replace(/\\/g, '/')}`;
        }
    }

    throw new Error(`Path is outside accessible directories: ${absolutePath}`);
}
