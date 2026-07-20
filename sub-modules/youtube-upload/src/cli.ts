#!/usr/bin/env node
/**
 * CLI for the YouTube upload adapter.
 *
 * Modes:
 *   auth        Build the OAuth consent URL (dry-run prints a fake URL).
 *   upload      Upload a local MP4. Use --dry-run (default) to validate without posting.
 *
 * Examples:
 *   tsx src/cli.ts auth --client-id X --client-secret Y --redirect-uri http://localhost:3001/oauth/callback
 *   tsx src/cli.ts upload ./output/my-video/final.mp4 --title "My Video" --dry-run
 */
import { YouTubeAuth, uploadVideo, saveTokens, loadTokens } from './index.js';
import type { UploadMetadata, YouTubeCredentials } from './types.js';

function arg(name: string, def?: string): string | undefined {
    const i = process.argv.indexOf(`--${name}`);
    return i >= 0 ? process.argv[i + 1] : def;
}

function boolArg(name: string): boolean {
    return process.argv.includes(`--${name}`);
}

async function main(): Promise<void> {
    const command = process.argv[2];
    const dryRun = !boolArg('live');
    const mode = boolArg('live') ? 'live' : boolArg('sandbox') ? 'sandbox' : 'dry-run';

    if (command === 'auth') {
        const creds: YouTubeCredentials = {
            clientId: arg('client-id', 'DRYRUN_CLIENT_ID')!,
            clientSecret: arg('client-secret', 'DRYRUN_SECRET')!,
            redirectUri: arg('redirect-uri', 'http://localhost:3001/oauth/callback')!,
        };
        const auth = new YouTubeAuth(creds, dryRun);
        const url = await auth.buildAuthUrl();
        console.log(`\n🔑 Authorize the app by visiting:\n${url}\n`);
        console.log(`Then run: tsx src/cli.ts exchange <CODE> --client-id ... --client-secret ... --redirect-uri ...\n`);
        return;
    }

    if (command === 'exchange') {
        const code = process.argv[3];
        if (!code) throw new Error('Missing authorization code argument.');
        const creds: YouTubeCredentials = {
            clientId: arg('client-id', 'DRYRUN_CLIENT_ID')!,
            clientSecret: arg('client-secret', 'DRYRUN_SECRET')!,
            redirectUri: arg('redirect-uri', 'http://localhost:3001/oauth/callback')!,
        };
        const auth = new YouTubeAuth(creds, dryRun);
        const tokens = await auth.exchangeCode(code);
        saveTokens(tokens);
        console.log(`\n✅ Tokens ${dryRun ? '(mocked) ' : ''}saved to .yt-tokens.json\n`);
        return;
    }

    if (command === 'upload') {
        const videoPath = process.argv[3];
        if (!videoPath) throw new Error('Missing video path argument.');

        const metadata: UploadMetadata = {
            title: arg('title', 'Untitled Video')!,
            description: arg('description', ''),
            tags: arg('tags')?.split(',').map((t) => t.trim()).filter(Boolean),
            privacyStatus: (arg('privacy', 'private') as UploadMetadata['privacyStatus']),
            thumbnailPath: arg('thumbnail'),
        };

        const tokens = loadTokens();
        if (!tokens && mode === 'live') throw new Error('No tokens found. Run `auth` then `exchange` first.');

        const result = await uploadVideo({
            videoPath,
            metadata,
            tokens: tokens ?? { accessToken: 'dryrun', scope: '', tokenType: 'Bearer' },
            mode,
            clientId: arg('client-id'),
            clientSecret: arg('client-secret'),
            redirectUri: arg('redirect-uri'),
        });

        console.log(`\n📤 Upload ${result.dryRun ? '(DRY-RUN, not posted) ' : ''}complete:`);
        console.log(`   Video ID: ${result.videoId}`);
        console.log(`   URL:      ${result.url}\n`);
        return;
    }

    console.log('Usage:');
    console.log('  tsx src/cli.ts auth     [--client-id X --client-secret Y --redirect-uri Z]');
    console.log('  tsx src/cli.ts exchange <CODE> [--client-id X --client-secret Y --redirect-uri Z]');
    console.log('  tsx src/cli.ts upload <VIDEO.mp4> [--title T --tags a,b --privacy private --dry-run|--live]');
}

main().catch((err) => {
    console.error(`\n❌ ${err.message}\n`);
    process.exit(1);
});
