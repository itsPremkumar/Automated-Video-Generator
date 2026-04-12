import { VideoRecord, SetupStatus } from '../../types/server.types';
import { LOCALE_TO_LANGUAGE_NAME } from '../../constants/config';
import { escapeHtml } from '../layout.view';

// ─── Helper: Build video library cards ─────────────────────────────────────────

export function buildVideoCards(videos: VideoRecord[]): string {
    if (videos.length === 0) {
        return `
            <div class="empty-state">
                <h3>No completed videos yet</h3>
                <p class="muted">Your finished videos will appear here automatically after the first render.</p>
            </div>`;
    }

    return videos.map((video) => `
        <a class="card" href="${video.watchUrl}">
            <div class="thumb"${video.thumbnailUrl ? ` style="background-image:url('${video.thumbnailUrl}')"` : ''}></div>
            <div class="card-body">
                <h3>${escapeHtml(video.title)}</h3>
                <p class="muted">${escapeHtml(video.orientation)} - ${video.fileSizeMB} MB</p>
                <div class="row">
                    ${video.durationSeconds ? `<span class="pill">${Math.round(video.durationSeconds)} sec</span>` : ''}
                    <span class="pill">${escapeHtml(new Date(video.createdAt).toLocaleString())}</span>
                </div>
            </div>
        </a>`).join('');
}

// ─── Helper: Build recent sidebar cards ────────────────────────────────────────

export function buildRecentCards(videos: VideoRecord[]): string {
    if (videos.length === 0) {
        return `
            <div class="empty-state">
                <p class="muted">Start with a sample script and the first finished MP4 will show up here.</p>
            </div>`;
    }

    return videos.slice(0, 3).map((video) => `
        <a class="small-card" href="${video.watchUrl}">
            <div class="small-thumb"${video.thumbnailUrl ? ` style="background-image:url('${video.thumbnailUrl}')"` : ''}></div>
            <div>
                <h3>${escapeHtml(video.title)}</h3>
                <p class="muted">${escapeHtml(video.orientation)} - ${video.fileSizeMB} MB</p>
                <div class="row">
                    ${video.durationSeconds ? `<span class="pill">${Math.round(video.durationSeconds)} sec</span>` : ''}
                    <span class="pill">${escapeHtml(new Date(video.createdAt).toLocaleDateString())}</span>
                </div>
            </div>
        </a>`).join('');
}

// ─── Helper: Build select options ──────────────────────────────────────────────

export function buildMusicOptions(musicFiles: string[]): string {
    const options = ['<option value="">No music</option>'];
    if (musicFiles.length === 0) {
        options.push('<option value="" disabled>No music found in input/music</option>');
        return options.join('');
    }
    musicFiles.forEach(file => {
        options.push(`<option value="${escapeHtml(file)}">${escapeHtml(file)}</option>`);
    });
    return options.join('');
}

export function buildVoiceOptions(voiceFiles: string[]): string {
    const options = ['<option value="">Select an audio file</option>'];
    if (voiceFiles.length === 0) {
        options.push('<option value="" disabled>No recordings found in input/voice</option>');
        return options.join('');
    }
    voiceFiles.forEach(file => {
        options.push(`<option value="${escapeHtml(file)}">${escapeHtml(file)}</option>`);
    });
    return options.join('');
}

export function buildLanguageOptions(voicesList: Record<string, { male: string[]; female: string[] }>): string {
    return Object.keys(voicesList).map(lang => {
        const langName = LOCALE_TO_LANGUAGE_NAME[lang] || (lang.charAt(0).toUpperCase() + lang.slice(1));
        return `<option value="${lang}">${langName}</option>`;
    }).join('');
}

// ─── Helper: Build setup status summary chips ──────────────────────────────────

export function buildSetupSummary(setup: SetupStatus): string {
    return [
        `<span class="status-chip ${setup.hasPexelsKey ? 'ok' : 'warn'}">Pexels key: ${setup.hasPexelsKey ? 'Saved' : 'Missing'}</span>`,
        `<span class="status-chip ${setup.voiceGenerationReady ? 'ok' : 'warn'}">Voice engine: ${setup.voiceEngineMode === 'edge-tts' ? 'Edge-TTS ready' : setup.voiceEngineMode === 'windows-sapi-fallback' ? 'Windows voice ready' : setup.voiceEngineMode === 'gtts-fallback' ? 'Fallback mode' : 'Not ready'}</span>`,
        `<span class="status-chip ok">Portal workflow: Browser first</span>`,
    ].join('');
}
