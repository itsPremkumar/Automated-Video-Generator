import { Request } from 'express';
import {
    AVAILABLE_VOICES,
    HELLO_WORLD_TITLE,
    HELLO_WORLD_SCRIPT,
    DEFAULT_SITE_DESCRIPTION,
    PROJECT_NAME,
    PROJECT_REPOSITORY_URL,
    DEFAULT_SITE_KEYWORDS
} from '../../constants/config';
import { VideoRecord, SetupStatus } from '../../types/server.types';
import { layout } from '../layout.view';
import { absoluteUrl } from '../../shared/http/public-url';

import {
    buildVideoCards,
    buildRecentCards,
    buildMusicOptions,
    buildLanguageOptions,
    buildSetupSummary
} from './helpers';

import { heroSection } from './components/hero.component';
import { setupSection } from './components/setup.component';
import { workspaceSection } from './components/workspace.component';
import { tipsSection } from './components/tips.component';
import { librarySection } from './components/library.component';
import { browserModalComponent } from './components/browser-modal.component';

import { assembleHomeScript } from './scripts/index';

export function homePage(req: Request, videos: VideoRecord[], setup: SetupStatus, musicFiles: string[], cspNonce?: string): string {
    const defaultOgImage = absoluteUrl(req, '/og-image.svg');
    const voicesList = AVAILABLE_VOICES as Record<string, { male: string[]; female: string[] }>;
    const totalVoicePresets = Object.values(voicesList).reduce((count, group) => count + group.male.length + group.female.length, 0);
    const defaultTitle = videos.length === 0 ? HELLO_WORLD_TITLE : '';
    const defaultScript = videos.length === 0 ? HELLO_WORLD_SCRIPT : '';

    // Build reusable fragments
    const cards = buildVideoCards(videos);
    const recentCards = buildRecentCards(videos);
    const musicOptions = buildMusicOptions(musicFiles);
    const languageOptions = buildLanguageOptions(voicesList);
    const voicesJson = JSON.stringify(
        Object.fromEntries(
            Object.entries(voicesList).map(([lang, groups]) => [
                lang,
                [
                    ...groups.female.map(n => ({ name: n, gender: 'Female' })),
                    ...groups.male.map(n => ({ name: n, gender: 'Male' }))
                ]
            ])
        )
    );
    const setupSummary = buildSetupSummary(setup);

    // Assemble components
    const body = `
        ${heroSection(videos.length, totalVoicePresets, setupSummary)}
        ${setupSection(setupSummary)}
        ${workspaceSection(defaultTitle, defaultScript, musicOptions, languageOptions)}
        ${tipsSection(recentCards)}
        ${librarySection(cards)}
        ${browserModalComponent()}
    `;

    // Final page layout
    return layout(
        'Free Automated Video Generator | Open-Source Remotion Text-to-Video Tool',
        body,
        {
            canonical: absoluteUrl(req, '/'),
            cspNonce,
            description: DEFAULT_SITE_DESCRIPTION,
            imageUrl: videos[0]?.thumbnailUrl || defaultOgImage,
            jsonLd: [
                {
                    '@context': 'https://schema.org',
                    '@type': 'SoftwareApplication',
                    applicationCategory: 'MultimediaApplication',
                    description: DEFAULT_SITE_DESCRIPTION,
                    isAccessibleForFree: true,
                    name: PROJECT_NAME,
                    offers: {
                        '@type': 'Offer',
                        price: '0',
                        priceCurrency: 'USD',
                    },
                    operatingSystem: 'Windows, macOS, Linux',
                    sameAs: PROJECT_REPOSITORY_URL,
                    url: absoluteUrl(req, '/'),
                },
                {
                    '@context': 'https://schema.org',
                    '@type': 'SoftwareSourceCode',
                    codeRepository: PROJECT_REPOSITORY_URL,
                    description: DEFAULT_SITE_DESCRIPTION,
                    license: 'MIT',
                    name: PROJECT_NAME,
                    programmingLanguage: ['TypeScript', 'React'],
                    runtimePlatform: 'Node.js',
                },
            ],
            keywords: DEFAULT_SITE_KEYWORDS,
            ogType: 'website',
        },
        assembleHomeScript(voicesJson)
    );
}
