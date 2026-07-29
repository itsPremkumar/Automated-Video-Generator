/**
 * motion-resolver.ts — resolve a `[Motion: ...]` tag (or `motionByScene`
 * entry) into a concrete Remotion composition + entry location.
 *
 * This enables the ADVANCED, location-configurable setup the user asked for:
 * a single `[Motion:]` tag can target ANY Remotion library folder, not just
 * the bundled one. Syntax:
 *
 *   [Motion: NeuralNetwork]            -> default library ("creation")
 *   [Motion: BarChartInfographic@create] -> library named "create"
 *
 * `motionLibrary` in AgenticConfig maps a library NAME -> folder relative to
 * the project root (the folder that holds that library's index.ts).
 * Default: { "creation": "remotion-creation" }.
 *
 * No deps beyond fs/path + project path resolution. Pure, offline, deterministic.
 */
import * as fs from 'fs';
import * as path from 'path';
import { resolveProjectPath } from '../../shared/runtime/paths.js';

export interface ResolvedMotion {
  /** Composition id, e.g. 'NeuralNetwork'. */
  composition: string;
  /** Library name (for diagnostics). */
  library: string;
  /** Absolute path to the library's index.ts entry. */
  entryPoint: string;
}

const DEFAULT_LIBRARIES: Record<string, string> = {
  creation: 'remotion-creation',
};

/**
 * Parse a raw `[Motion:]` token value.
 * Returns { composition, library } where library is the named library or
 * 'creation' (default). Supports `Name@library` and bare `Name`.
 */
export function parseMotionTag(raw: string): { composition: string; library: string } {
  const cleaned = raw.trim().replace(/^\[?Motion:\s*/i, '').replace(/[[\]]/g, '').trim();
  const at = cleaned.lastIndexOf('@');
  if (at > 0) {
    const composition = cleaned.slice(0, at).trim();
    const library = cleaned.slice(at + 1).trim();
    return { composition, library: library || 'creation' };
  }
  return { composition: cleaned, library: 'creation' };
}

/**
 * Resolve a motion reference (from a tag or motionByScene) to a concrete
 * entry point. Throws a clear error if the library folder or index.ts is
 * missing so the caller can fall back to stock/user assets.
 */
export function resolveMotion(
  raw: string,
  libraries: Record<string, string> | undefined,
): ResolvedMotion {
  const { composition, library } = parseMotionTag(raw);
  const map = libraries && Object.keys(libraries).length ? libraries : DEFAULT_LIBRARIES;
  const folder = map[library];
  if (!folder) {
    throw new Error(
      `[Motion] unknown library "${library}". Known: ${Object.keys(map).join(', ')}. ` +
        `Add it via config.motionLibrary = { "${library}": "relative/folder" }.`,
    );
  }
  const entryPoint = resolveProjectPath(folder, 'index.ts');
  if (!fs.existsSync(entryPoint)) {
    throw new Error(
      `[Motion] entry not found for library "${library}": ${entryPoint}. ` +
        `Expected an index.ts in that folder.`,
    );
  }
  return { composition, library, entryPoint };
}

/** Validate that a library folder exists (used by config validation / tests). */
export function libraryExists(library: string, libraries?: Record<string, string>): boolean {
  const map = libraries && Object.keys(libraries).length ? libraries : DEFAULT_LIBRARIES;
  const folder = map[library];
  if (!folder) return false;
  return fs.existsSync(resolveProjectPath(folder, 'index.ts'));
}

/** Absolute path to a library folder (for the renderer to list compositions). */
export function libraryFolder(library: string, libraries?: Record<string, string>): string {
  const map = libraries && Object.keys(libraries).length ? libraries : DEFAULT_LIBRARIES;
  return resolveProjectPath(map[library] ?? 'remotion-creation');
}
