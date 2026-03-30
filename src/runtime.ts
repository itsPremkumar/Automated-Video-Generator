import * as path from 'path';
import { format } from 'util';

export const projectRoot = path.resolve(__dirname, '..');

export function resolveProjectPath(...segments: string[]): string {
  return path.join(projectRoot, ...segments);
}

export function inMcpRuntime(): boolean {
  return process.env.AUTOMATED_VIDEO_GENERATOR_MCP === '1';
}

export function ensureProjectRootCwd(): void {
  if (process.cwd() !== projectRoot) {
    process.chdir(projectRoot);
  }
}

function writeLine(stream: NodeJS.WriteStream, message: string): void {
  stream.write(`${message}\n`);
}

function formatMessage(args: unknown[]): string {
  return format(...args);
}

export function logInfo(...args: unknown[]): void {
  const message = formatMessage(args);

  if (inMcpRuntime()) {
    writeLine(process.stderr, message);
    return;
  }

  console.log(message);
}

export function logWarn(...args: unknown[]): void {
  const message = formatMessage(args);

  if (inMcpRuntime()) {
    writeLine(process.stderr, message);
    return;
  }

  console.warn(message);
}

export function logError(...args: unknown[]): void {
  writeLine(process.stderr, formatMessage(args));
}

export function writeProgress(message: string): void {
  if (inMcpRuntime()) {
    process.stderr.write(message);
    return;
  }

  process.stdout.write(message);
}
