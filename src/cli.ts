import { generateVideo } from './video-generator';
import { renderVideo } from './render';
import { cleanupAssets } from './lib/cleaner';
import { resetInMemoryCache } from './lib/visual-fetcher';
import * as path from 'path';
import * as fs from 'fs';

const INPUT_DIR = path.join(process.cwd(), 'input');
const INPUT_SCRIPTS_FILE = path.join(INPUT_DIR, 'input-scripts.json');

interface VideoJob {
    id?: string;
    title: string;
    script: string;
    settings?: any;
    orientation?: 'portrait' | 'landscape';
    voice?: string;
    showText?: boolean;
    defaultVideo?: string;
    backgroundMusic?: string;
    musicVolume?: number;
    language?: string;
    textConfig?: {
        color?: string;
        fontSize?: number;
        position?: 'top' | 'center' | 'bottom';
        animation?: 'fade' | 'slide' | 'zoom' | 'typewriter';
    };
}


function parseArgs() {
    const args = process.argv.slice(2);
    const landscape = args.includes('--landscape');
    
    // Find --music flag and its value
    const musicIdx = args.indexOf('--music');
    const music = (musicIdx !== -1 && args[musicIdx + 1] && !args[musicIdx + 1].startsWith('--')) 
        ? args[musicIdx + 1] 
        : undefined;

    return {
        landscape,
        music
    };
}

function getEnvOrientation(): 'portrait' | 'landscape' {
    const envOrientation = process.env.VIDEO_ORIENTATION?.toLowerCase();
    if (envOrientation === 'landscape' || envOrientation === 'portrait') {
        return envOrientation;
    }
    return 'portrait';
}

function sanitizeFilename(name: string): string {
    return name.replace(/[^a-z0-9]/gi, '_').toLowerCase();
}

async function main() {
    console.log('🎬 Video Generator CLI (Advanced Batch Mode)\n');

    const { landscape, music } = parseArgs();
    const envOrientation = getEnvOrientation();
    // CLI flag overrides env var
    const globalOrientation = landscape ? 'landscape' : envOrientation;
    const globalMusic = music;

    // console.log(`🎬 Orientation: ${globalOrientation.toUpperCase()}`);

    // ═══════════════════════════════════════════════════════════════════
    // STARTUP CLEANUP: Delete old audio, video files, AND CACHE
    // ═══════════════════════════════════════════════════════════════════
    // Check for --resume flag to skip cleanup
    const resume = process.argv.includes('--resume');

    if (resume) {
        console.log('⏩ [STARTUP] Resume mode active: Skipping asset cleanup to preserve existing files.');
    } else {
        console.log('🧹 [STARTUP] Cleaning old assets to avoid conflicts...');
        const videoDir = path.join(process.cwd(), 'public', 'videos');
        const audioDir = path.join(process.cwd(), 'public', 'audio');
        await cleanupAssets([videoDir, audioDir]);

        // Clean video cache to ensure fresh high-quality results
        console.log('🧹 [STARTUP] Resetting .video-cache.json for fresh run');
        resetInMemoryCache();
    }

    let jobs: VideoJob[] = [];

    // Check for input-scripts.json
    if (fs.existsSync(INPUT_SCRIPTS_FILE)) {
        // console.log(`📄 Found batch jobs file: ${INPUT_SCRIPTS_FILE}`);
        try {
            const content = fs.readFileSync(INPUT_SCRIPTS_FILE, 'utf-8');
            jobs = JSON.parse(content);
            // console.log(`📊 Loaded ${jobs.length} jobs to process.`);
        } catch (e: any) {
            // console.error(`❌ Error parsing input-scripts.json: ${e.message}`);
            process.exit(1);
        }
    } else {
        // console.error('❌ Error: No input found!');
        // console.error(`   Please create: ${INPUT_SCRIPTS_FILE}`);
        process.exit(1);
    }

    // Process Jobs
    for (let i = 0; i < jobs.length; i++) {
        const job = jobs[i];

        // Determine orientation for this job:
        // 1. Job specific setting
        // 2. Global CLI flag
        // 3. Default to portrait
        const jobOrientation = job.orientation || globalOrientation;

        console.log(`\n▶️ Processing Job ${i + 1}/${jobs.length}: "${job.title}" (${jobOrientation})`);
        console.log('━'.repeat(50));

        // Determine output folder: output/{id} (or output/{title} if id missing)
        const folderName = sanitizeFilename(job.id || job.title || `video_${i + 1}`);
        const jobOutputDir = path.join(process.cwd(), 'output', folderName);

        if (!fs.existsSync(jobOutputDir)) {
            fs.mkdirSync(jobOutputDir, { recursive: true });
        }
        // console.log(`   📂 Target: ${jobOutputDir}`);

        // SEGMENT MODE: Skip generation, just render/stitch
        const segmentOnly = process.argv.includes('--segment');

        if (segmentOnly) {
            console.log('⏩ [SEGMENT MODE] Skipping generation, jumping to assembly...');

            // Check if scene data exists
            const sceneDataPath = path.join(jobOutputDir, 'scene-data.json');
            if (!fs.existsSync(sceneDataPath)) {
                console.error(`❌ [SEGMENT MODE] No scene data found in "${jobOutputDir}". Run 'npm run generate' first.`);
                continue;
            }

            try {
                console.log(`   🚀 Starting Render/Assembly...`);
                await renderVideo(jobOutputDir);
                console.log(`   ✨ Job "${job.title}" Assembled.`);
            } catch (renderError: any) {
                console.error(`   ❌ Assembly Failed: ${renderError.message}`);
                console.error(renderError);
            }
            continue; // Skip the rest of the loop for this job
        }

        // Save Script to file
        const scriptPath = path.join(jobOutputDir, 'script.txt');
        fs.writeFileSync(scriptPath, job.script);
        // console.log(`   📝 Saved script to: ${scriptPath}`);

        // Generate
        try {
            const result = await generateVideo(job.script, jobOutputDir, {
                orientation: jobOrientation as 'portrait' | 'landscape',
                voice: job.voice,
                language: job.language,
                title: job.title,
                showText: job.showText !== false,
                defaultVideo: job.defaultVideo,
                backgroundMusic: job.backgroundMusic || globalMusic,
                musicVolume: job.musicVolume,
                textConfig: job.textConfig
            });


            if (result.success) {
                // console.log(`   ✅ Generation Successful for "${job.title}"`);

                // Render
                try {
                    // console.log(`   🚀 Starting Render...`);
                    await renderVideo(jobOutputDir);
                    console.log(`   ✨ Job "${job.title}" Completed.`);
                } catch (renderError: any) {
                    console.error(`   ❌ Render Failed: ${renderError.message}`);
                }
            } else {
                console.error(`   ❌ Generation Failed for "${job.title}":`, result.error);
            }
        } catch (genError: any) {
            console.error(`   ❌ Critical Error in "${job.title}":`, genError.message);
        } finally {
            // Ensure cleanup happens even if generation failed
            const videoDir = path.join(process.cwd(), 'public', 'videos');
            const audioDir = path.join(process.cwd(), 'public', 'audio');
            await cleanupAssets([videoDir, audioDir]);
        }
    }

    // console.log('\n🏁 Processing Complete.');
    // console.log(`📂 Find your videos in the "output" folder.`);
}

main().catch(() => { });
// main().catch(console.error);
