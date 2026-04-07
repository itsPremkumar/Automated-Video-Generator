import * as fs from 'fs';
import * as path from 'path';
import { resolveProjectPath, resolveRuntimePublicPath } from '../shared/runtime/paths';

function isPathWithin(parentPath: string, candidatePath: string): boolean {
    const relative = path.relative(path.resolve(parentPath), path.resolve(candidatePath));
    return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function canCleanupDirectory(directory: string): boolean {
    const allowedRoots = [
        resolveProjectPath('tmp'),
        resolveRuntimePublicPath('jobs'),
    ];

    return allowedRoots.some((root) => isPathWithin(root, directory));
}

/**
 * Cleans up all files in the specified directories.
 * @param directories Array of absolute paths to directories to clean
 */
export async function cleanupAssets(directories: string[]): Promise<void> {
    // console.log('\n╔══════════════════════════════════════════╗');
    // console.log('║        CLEANING UP ASSETS                 ║');
    // console.log('╚══════════════════════════════════════════╝');

    for (const dir of directories) {
        if (!canCleanupDirectory(dir)) {
            continue;
        }

        if (fs.existsSync(dir)) {
            // console.log(`🧹 Cleaning directory: ${dir}`);
            try {
                const files = fs.readdirSync(dir);
                let deletedCount = 0;

                for (const file of files) {
                    // Skip .gitkeep
                    if (file === '.gitkeep') continue;

                    const filePath = path.join(dir, file);
                    const stats = fs.statSync(filePath);

                    if (stats.isDirectory()) {
                        fs.rmSync(filePath, { recursive: true, force: true });
                        deletedCount++;
                    } else {
                        fs.unlinkSync(filePath);
                        deletedCount++;
                    }
                }
                // console.log(`   ✅ Deleted ${deletedCount} item(s)`);
            } catch (error: any) {
                // console.error(`   ❌ Error cleaning ${dir}: ${error.message}`);
            }
        } else {
            // console.log(`   ⚠️ Directory not found: ${dir}`);
        }
    }
    // console.log('✨ Cleanup complete\n');
}
