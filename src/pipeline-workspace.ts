import * as fs from 'fs';
import * as path from 'path';
import { resolveProjectPath } from './runtime';

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

export function createPipelineWorkspace(outputDir: string, preferredId?: string): PipelineWorkspace {
  const derivedId = preferredId || path.basename(path.resolve(outputDir));
  const outputId = sanitizeOutputId(derivedId);
  const publicRoot = resolveProjectPath('public');
  const publicNamespace = `jobs/${outputId}`;
  const workspaceDir = path.join(publicRoot, 'jobs', outputId);

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

export function toPublicRelativePath(absolutePath: string): string {
  const publicRoot = resolveProjectPath('public');
  const relativePath = path.relative(publicRoot, absolutePath);

  if (!relativePath || relativePath.startsWith('..')) {
    throw new Error(`Path is outside the public directory: ${absolutePath}`);
  }

  return relativePath.replace(/\\/g, '/');
}

