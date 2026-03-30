import * as fs from 'fs';
import * as path from 'path';

/**
 * Cleans up all files in the specified directories.
 * @param directories Array of absolute paths to directories to clean
 */
export async function cleanupAssets(directories: string[]): Promise<void> {
    // console.log('\n╔══════════════════════════════════════════╗');
    // console.log('║        CLEANING UP ASSETS                 ║');
    // console.log('╚══════════════════════════════════════════╝');

    for (const dir of directories) {
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
