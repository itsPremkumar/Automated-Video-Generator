import { Request } from 'express';
import { 
    PROJECT_REPOSITORY_URL, 
    MAX_TITLE_LENGTH, 
    DEFAULT_FALLBACK_VIDEO, 
    DEMO_SCRIPT, 
    HELLO_WORLD_TITLE,
    HELLO_WORLD_SCRIPT,
    AVAILABLE_VOICES,
    PROJECT_NAME,
    DEFAULT_SITE_DESCRIPTION,
    DEFAULT_SITE_KEYWORDS
} from '../constants/config';
import { VideoRecord, SetupStatus } from '../types/server.types';
import { layout, escapeHtml } from './layout.view';
import { absoluteUrl } from '../services/video.service';

// ─── Helper: Build video library cards ─────────────────────────────────────────

function buildVideoCards(videos: VideoRecord[]): string {
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

function buildRecentCards(videos: VideoRecord[]): string {
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

function buildMusicOptions(musicFiles: string[]): string {
    if (musicFiles.length === 0) {
        return '<option value="">No music found in input/music</option>';
    }
    return musicFiles.map((file) => `<option value="${escapeHtml(file)}">${escapeHtml(file)}</option>`).join('');
}

function buildVoiceOptions(voicesList: Record<string, { male: string[]; female: string[] }>): string {
    return Object.entries(voicesList).map(([lang, voices]) => {
        const langName = lang.charAt(0).toUpperCase() + lang.slice(1);
        const femaleOpts = voices.female.map(v => `<option value="${v}">${v} (Female)</option>`).join('');
        const maleOpts = voices.male.map(v => `<option value="${v}">${v} (Male)</option>`).join('');
        return `<optgroup label="${langName}">${femaleOpts}${maleOpts}</optgroup>`;
    }).join('');
}

function buildLanguageOptions(voicesList: Record<string, { male: string[]; female: string[] }>): string {
    return Object.keys(voicesList).map(lang => {
        const langName = lang.charAt(0).toUpperCase() + lang.slice(1);
        return `<option value="${lang}">${langName}</option>`;
    }).join('');
}

// ─── Helper: Build setup status summary chips ──────────────────────────────────

function buildSetupSummary(setup: SetupStatus): string {
    return [
        `<span class="status-chip ${setup.hasPexelsKey ? 'ok' : 'warn'}">Pexels key: ${setup.hasPexelsKey ? 'Saved' : 'Missing'}</span>`,
        `<span class="status-chip ${setup.voiceGenerationReady ? 'ok' : 'warn'}">Voice engine: ${setup.voiceEngineMode === 'edge-tts' ? 'Edge-TTS ready' : setup.voiceEngineMode === 'windows-sapi-fallback' ? 'Windows voice ready' : setup.voiceEngineMode === 'gtts-fallback' ? 'Fallback mode' : 'Not ready'}</span>`,
        `<span class="status-chip ok">Portal workflow: Browser first</span>`,
    ].join('');
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN PAGE RENDERER
// ═══════════════════════════════════════════════════════════════════════════════

export function homePage(req: Request, videos: VideoRecord[], setup: SetupStatus, musicFiles: string[], cspNonce?: string): string {
    const defaultOgImage = absoluteUrl(req, '/og-image.svg');
    const voicesList = AVAILABLE_VOICES as Record<string, { male: string[]; female: string[] }>;
    const totalVoicePresets = Object.values(voicesList).reduce((count, group) => count + group.male.length + group.female.length, 0);
    const defaultTitle = videos.length === 0 ? HELLO_WORLD_TITLE : '';
    const defaultScript = videos.length === 0 ? HELLO_WORLD_SCRIPT : '';

    // Pre-build reusable fragments
    const cards = buildVideoCards(videos);
    const recentCards = buildRecentCards(videos);
    const musicOptions = buildMusicOptions(musicFiles);
    const voiceOptions = buildVoiceOptions(voicesList);
    const languageOptions = buildLanguageOptions(voicesList);
    const setupSummary = buildSetupSummary(setup);

    // ─── Page Body HTML ────────────────────────────────────────────────────────

    const body = `

    <!-- ═══════════════════════════════════════════════════════════════════════
         HERO SECTION
         ═══════════════════════════════════════════════════════════════════════ -->
    <section class="hero-surface">
        <div class="hero-grid">
            <div class="stack">
                <span class="eyebrow">Local AI Video Studio</span>
                <div>
                    <h1>Create videos from a script, not from folders</h1>
                    <p class="lead">Paste your idea, shape the voice and layout, then let the portal handle stock visuals, narration, subtitles, rendering, and delivery in one place.</p>
                    <p class="muted">This screen is designed for normal users. No need to manually edit the input or output folders during everyday use.</p>
                </div>
                <div class="toolbar">
                    <a class="button" href="#workspace">Open the workspace</a>
                    <a class="button secondary" href="${PROJECT_REPOSITORY_URL}" target="_blank" rel="noreferrer">View on GitHub</a>
                    <a class="button ghost" href="/llms.txt">Read AI summary</a>
                </div>
                <div class="metric-grid">
                    <div class="metric-card">
                        <strong>${videos.length}</strong>
                        <span class="muted">videos created in this portal</span>
                    </div>
                    <div class="metric-card">
                        <strong>${totalVoicePresets}+</strong>
                        <span class="muted">voice presets available before dynamic loading</span>
                    </div>
                    <div class="metric-card">
                        <strong>3 steps</strong>
                        <span class="muted">setup, create, watch or download</span>
                    </div>
                </div>
            </div>

            <!-- Simple Flow Sidebar -->
            <div class="highlight-box stack">
                <span class="eyebrow">Simple Flow</span>
                <h2>What users do here</h2>
                <div class="row">${setupSummary}</div>
                <ol class="checklist">
                    <li>Save the API keys once for this computer.</li>
                    <li>Paste or edit the script in the workspace below.</li>
                    <li>choose voice, layout, music, and subtitle options.</li>
                    <li>Start the render and wait on the live status page.</li>
                    <li>Watch or download the MP4 from the final delivery page.</li>
                </ol>
            </div>
        </div>
    </section>

    <!-- ═══════════════════════════════════════════════════════════════════════
         ONE-TIME SETUP SECTION
         ═══════════════════════════════════════════════════════════════════════ -->
    <section class="layout-split">
        <!-- Setup Status Panel -->
        <div class="panel tint stack">
            <div>
                <span class="eyebrow">One-Time Setup</span>
                <h2>Prepare this device once</h2>
                <p class="muted">Most users only need a Pexels API key. Save it here and the browser portal becomes the main way to use the project.</p>
            </div>
            <div class="row">${setupSummary}</div>
            <div id="setup-readiness" class="status-board"></div>
        </div>

        <!-- Setup Form Panel -->
        <div class="panel">
            <form id="setup-form" class="form">
                <div class="field-grid two-up">
                    <!-- Pexels Key -->
                    <div class="field">
                        <div class="row" style="justify-content:space-between">
                            <label for="setup-pexels">Pexels API key</label>
                            <div class="row">
                                <span id="setup-pexels-status" class="status-chip warn">Checking...</span>
                                <button type="button" id="setup-pexels-toggle" class="secondary" style="padding:4px 10px;font-size:12px;display:none" onclick="toggleFieldUpdate('pexels')">Change</button>
                            </div>
                        </div>
                        <input id="setup-pexels" type="password" placeholder="Recommended for stock video search">
                        <p class="field-help">Best source for usable portrait and landscape stock footage.</p>
                    </div>

                    <!-- Pixabay Key -->
                    <div class="field">
                        <div class="row" style="justify-content:space-between">
                            <label for="setup-pixabay">Pixabay API key</label>
                            <div class="row">
                                <span id="setup-pixabay-status" class="status-chip warn">Checking...</span>
                                <button type="button" id="setup-pixabay-toggle" class="secondary" style="padding:4px 10px;font-size:12px;display:none" onclick="toggleFieldUpdate('pixabay')">Change</button>
                            </div>
                        </div>
                        <input id="setup-pixabay" type="password" placeholder="Optional backup provider">
                        <p class="field-help">Optional secondary image and video source.</p>
                    </div>

                    <!-- Gemini Key -->
                    <div class="field">
                        <div class="row" style="justify-content:space-between">
                            <label for="setup-gemini">Gemini API key</label>
                            <div class="row">
                                <span id="setup-gemini-status" class="status-chip warn">Checking...</span>
                                <button type="button" id="setup-gemini-toggle" class="secondary" style="padding:4px 10px;font-size:12px;display:none" onclick="toggleFieldUpdate('gemini')">Change</button>
                            </div>
                        </div>
                        <input id="setup-gemini" type="password" placeholder="Optional AI helper">
                        <p class="field-help">Only needed if your workflows use Gemini-powered helpers.</p>
                    </div>
                </div>

                <div class="toolbar">
                    <button type="submit">Save Setup</button>
                    <span class="muted">Launcher users can open this page from <strong>Start-Automated-Video-Generator.bat</strong>.</span>
                </div>
            </form>
            <div id="setup-feedback" class="status" hidden></div>
        </div>
    </section>

    <!-- ═══════════════════════════════════════════════════════════════════════
         UNIFIED VIDEO STUDIO (WORKSPACE)
         ═══════════════════════════════════════════════════════════════════════ -->
    <section id="workspace" class="stack" style="margin-top:20px">
        <div class="panel-head">
            <div>
                <span class="eyebrow">Studio</span>
                <h2>Unified Video Studio</h2>
                <p class="muted">All your script and design controls in one place. Optimized for pro creation flow.</p>
            </div>
        </div>

        <form id="generate-form" class="studio-grid">
            <!-- Status Message (spans all columns) -->
            <div id="form-status" class="status" style="grid-column:1 / -1; margin-bottom:10px" hidden></div>

            <!-- ─── Step 1: Script & Story ─── -->
            <div class="panel form-panel">
                <div class="panel-head">
                    <div>
                        <span class="eyebrow">Step 1</span>
                        <h2>Script &amp; Story</h2>
                        <p class="muted small">Write the visual instructions using <strong>[Visual: ...]</strong> cues.</p>
                    </div>
                </div>

                <div class="field" style="background:rgba(16,185,129,0.1); padding:12px; border-radius:8px; border:1px solid rgba(16,185,129,0.2)">
                    <label for="ai-prompt" style="color:#10b981">✨ Generate script with AI</label>
                    <div class="row" style="flex-wrap:nowrap; gap:8px">
                        <input id="ai-prompt" placeholder="E.g. A short video about the history of space travel..." style="flex:1" onkeydown="if(event.key === 'Enter') { event.preventDefault(); document.getElementById('generate-ai').click(); }">
                        <button type="button" id="generate-ai" class="secondary" style="padding:8px 16px; border-color:rgba(16,185,129,0.5); color:#10b981">Generate</button>
                    </div>
                </div>

                <div class="field">
                    <label for="title">Video title</label>
                    <input id="title" value="${escapeHtml(defaultTitle)}" placeholder="How AI Is Changing Everyday Life" maxlength="${MAX_TITLE_LENGTH}" required>
                    <p class="field-help">Used for output page and filename.</p>
                </div>

                <div class="field">
                    <label for="script">Input script</label>
                    <div class="script-shell">
                        <div class="script-toolbar">
                            <span class="muted small">Editable input area</span>
                            <div id="script-metrics" class="row">
                                <span class="helper-badge">0 words</span>
                                <span class="helper-badge">0 sec est.</span>
                            </div>
                        </div>
                        <textarea id="script" placeholder="[Visual: futuristic robotics lab] AI is changing how people and robots work together.&#10;&#10;[Visual: doctor reviewing an AI dashboard] In healthcare, it helps spot patterns faster and supports earlier decisions." required>${escapeHtml(defaultScript)}</textarea>
                    </div>
                </div>

                <div class="row" style="margin-top:10px">
                    <button type="button" id="fill-sample" class="secondary" style="font-size:13px;padding:8px 14px">Use Sample</button>
                    <button type="button" id="fill-hello" class="secondary" style="font-size:13px;padding:8px 14px">Hello World</button>
                </div>
            </div>

            <!-- ─── Step 2: Voice & Layout ─── -->
            <div class="panel form-panel">
                <div>
                    <span class="eyebrow">Step 2</span>
                    <h2>Voice &amp; Layout</h2>
                    <p class="muted small">Detect language or lock the voice yourself.</p>
                </div>
                <div class="stack" style="gap:12px">
                    <div class="field">
                        <label for="orientation">Orientation</label>
                        <select id="orientation">
                            <option value="portrait">Portrait (9:16)</option>
                            <option value="landscape">Landscape (16:9)</option>
                        </select>
                    </div>
                    <div class="field">
                        <label>Narrator Mode</label>
                        <select id="narratorMode" onchange="document.getElementById('ai-voice-settings').style.display = this.value === 'ai' ? '' : 'none'; document.getElementById('personal-audio-settings').style.display = this.value === 'personal' ? '' : 'none';">
                            <option value="ai">AI Voice</option>
                            <option value="personal">Personal Audio</option>
                        </select>
                    </div>

                    <div id="ai-voice-settings" class="stack" style="gap:12px">
                        <div class="field">
                            <label for="language">Language</label>
                            <select id="language">
                                <option value="">Detect automatically</option>
                                ${languageOptions}
                            </select>
                        </div>
                        <div class="field">
                            <label for="voice-search">Search voice</label>
                            <input type="text" id="voice-search" class="voice-search" placeholder="Search voices...">
                        </div>
                        <div class="field">
                            <label for="voice">Voice override</label>
                            <select id="voice">
                                <option value="">Optional Override</option>
                                ${voiceOptions}
                            </select>
                            <p id="voice-hint" class="field-help" style="font-size:11px"></p>
                        </div>
                    </div>

                    <div id="personal-audio-settings" class="stack" style="gap:12px; display:none">
                        <div class="field">
                            <label for="personalAudio">Audio Recording</label>
                            <div class="row" style="flex-wrap:nowrap">
                                <select id="personalAudio" style="font-size:13px">
                                    <option value="">Select an audio file</option>
                                    ${musicOptions}
                                </select>
                                <button type="button" class="secondary" onclick="openSystemBrowser('personalAudio')" style="padding:8px 12px;font-size:13px">Browse</button>
                            </div>
                            <p class="field-help">Your recording roughly matching the script length.</p>
                        </div>
                    </div>
                </div>
            </div>

            <!-- ─── Step 3: Style & Output ─── -->
            <div class="panel form-panel">
                <div>
                    <span class="eyebrow">Step 3</span>
                    <h2>Style &amp; Output</h2>
                    <p class="muted small">Final touches before rendering the MP4.</p>
                </div>
                <div class="stack" style="gap:12px">
                    <div class="field">
                        <label for="backgroundMusic">Background music</label>
                        <div class="row" style="flex-wrap:nowrap">
                            <select id="backgroundMusic" style="font-size:13px">
                                <option value="">No music</option>
                                ${musicOptions}
                            </select>
                            <button type="button" class="secondary" onclick="openSystemBrowser('music')" style="padding:8px 12px;font-size:13px">Browse</button>
                        </div>
                    </div>
                    <div class="field">
                        <label for="defaultVideo">Fallback asset</label>
                        <input id="defaultVideo" value="${escapeHtml(DEFAULT_FALLBACK_VIDEO)}" placeholder="Fallback asset">
                    </div>
                    <label class="toggle-row" for="showText" style="padding:10px 12px">
                        <input id="showText" type="checkbox" checked onchange="document.getElementById('subtitle-config').style.display = this.checked ? '' : 'none'">
                        <div><strong>Show subtitles</strong></div>
                    </label>
                    <label class="toggle-row" for="enableReview" style="padding:10px 12px; border: 1px solid var(--accent); border-radius: 8px; margin-top: 4px; background: rgba(var(--accent-rgb), 0.05);">
                        <input id="enableReview" type="checkbox">
                        <div><strong>Enable Timeline Editor (Review Mode)</strong></div>
                    </label>

                    <div id="subtitle-config" class="panel soft" style="gap:12px; padding:16px; margin: 4px 0 12px;">
                        <div class="field-grid two-up" style="gap:16px">
                            <div class="field">
                                <label for="subtitle-animation" style="font-size:13px; margin-bottom:6px; display:block">Animation</label>
                                <select id="subtitle-animation">
                                    <option value="fade">Fade</option>
                                    <option value="slide">Slide Up</option>
                                    <option value="zoom">Zoom In</option>
                                    <option value="typewriter">Typewriter</option>
                                    <option value="pop">Pop (Elastic)</option>
                                </select>
                            </div>
                            <div class="field">
                                <label for="subtitle-position" style="font-size:13px; margin-bottom:6px; display:block">Position</label>
                                <select id="subtitle-position">
                                    <option value="bottom">Bottom</option>
                                    <option value="center">Center</option>
                                    <option value="top">Top</option>
                                </select>
                            </div>
                            <div class="field">
                                <label for="subtitle-color" style="font-size:13px; margin-bottom:6px; display:block">Color</label>
                                <input id="subtitle-color" type="color" value="#ffffff" style="height:44px; padding:4px">
                            </div>
                                <input id="subtitle-fontSize" type="number" value="52" min="10" max="120">
                            </div>
                            <div class="field">
                                <label for="subtitle-background" style="font-size:13px; margin-bottom:6px; display:block">Background Style</label>
                                <select id="subtitle-background">
                                    <option value="none">None</option>
                                    <option value="box">Dark Box</option>
                                    <option value="glass">Glassmorphism</option>
                                </select>
                            </div>
                            <div class="field">
                                <label class="toggle-row" for="subtitle-glow" style="margin-top:24px; padding:8px 12px; font-size:13px">
                                    <input id="subtitle-glow" type="checkbox">
                                    <div><strong>Glow Effect</strong></div>
                                </label>
                            </div>
                        </div>
                    </div>
                    <div class="stack" style="margin-top:4px">
                        <div class="row" style="justify-content:space-between;align-items:center">
                            <strong style="font-size:14px">Local Media</strong>
                            <button type="button" class="secondary" onclick="openSystemBrowser('media')" style="padding:6px 12px;font-size:12px">Add Library</button>
                        </div>
                        <div id="asset-gallery" class="asset-gallery"></div>
                    </div>
                </div>
            </div>

            <!-- Submit Button (spans all columns) -->
            <div class="toolbar" style="grid-column: 1 / -1; margin-top:20px; justify-content:center">
                <button type="submit" style="min-width:300px; padding:16px 32px">Start Rendering Video Studio</button>
            </div>
        </form>
    </section>

    <!-- ═══════════════════════════════════════════════════════════════════════
         TIPS & RECENT VIDEOS
         ═══════════════════════════════════════════════════════════════════════ -->
    <section class="layout-split">
        <div class="panel soft">
            <span class="eyebrow">Editing Tips</span>
            <h2>Creation checklist</h2>
            <ul class="compact-list">
                <li>Use one clear idea per sentence so voiceover stay readable.</li>
                <li>Add scene hints like <strong>[Visual: modern city]</strong> for better search results.</li>
                <li>Choose portrait for Shorts and landscape for YouTube.</li>
                <li>Use Fallback video to prevent render failure if stock fails.</li>
            </ul>
        </div>
        <div class="panel">
            <span class="eyebrow">Latest Outputs</span>
            <h2>Recent finished uploads</h2>
            <p class="muted">Quickly access the watch pages for your latest exports.</p>
            <div class="recent-grid">${recentCards}</div>
        </div>
    </section>

    <!-- ═══════════════════════════════════════════════════════════════════════
         VIDEO LIBRARY
         ═══════════════════════════════════════════════════════════════════════ -->
    <section id="recent-videos" class="panel">
        <div class="panel-head">
            <div>
                <span class="eyebrow">Library</span>
                <h2>Completed archives</h2>
                <p class="muted">All your history is saved here automatically.</p>
            </div>
        </div>
        <div class="cards">${cards}</div>
    </section>

    <!-- ═══════════════════════════════════════════════════════════════════════
         FILE BROWSER MODAL
         ═══════════════════════════════════════════════════════════════════════ -->
    <div id="browser-modal" class="browser-modal">
        <div class="browser-content">
            <div class="browser-sidebar">
                <div class="sidebar-section">
                    <div class="sidebar-title">Quick Access</div>
                    <div id="quick-access-list" class="stack" style="gap:4px">
                        <!-- JS populated -->
                    </div>
                </div>
                <div class="sidebar-section">
                    <div class="sidebar-title">Drives / This PC</div>
                    <div id="drives-list" class="stack" style="gap:4px">
                        <!-- JS populated -->
                    </div>
                </div>
            </div>
            <div class="browser-main">
                <div class="browser-header">
                    <h3 id="browser-title">Select File</h3>
                    <div class="row">
                        <button type="button" class="ghost" onclick="loadPath(currentParentPath)" title="Go up one level">⤴ Up</button>
                        <button type="button" class="secondary" onclick="closeSystemBrowser()">✕</button>
                    </div>
                </div>
                <div class="browser-path-wrapper">
                    <input id="browser-path" class="browser-path" placeholder="Path\\To\\Folder..." title="Type path and press Enter">
                    <button type="button" class="secondary" onclick="loadPath(document.getElementById('browser-path').value)" style="padding:6px 12px;margin-left:8px">Go</button>
                </div>
                <div id="browser-list" class="browser-list"></div>
                <div class="browser-footer">
                    <button type="button" class="secondary" onclick="closeSystemBrowser()">Cancel</button>
                </div>
            </div>
        </div>
    </div>`;

    // ─── Client-Side JavaScript ────────────────────────────────────────────────

    const script = `
// ─── Constants ─────────────────────────────────────────────────────────────────
const sampleScript = ${JSON.stringify(DEMO_SCRIPT)};
const helloWorldScript = ${JSON.stringify(HELLO_WORLD_SCRIPT)};

// ─── DOM References ────────────────────────────────────────────────────────────
const form          = document.getElementById('generate-form');
const status        = document.getElementById('form-status');
const setupForm     = document.getElementById('setup-form');
const setupFeedback = document.getElementById('setup-feedback');
const setupReadiness = document.getElementById('setup-readiness');
const generateAiBtn = document.getElementById('generate-ai');
const aiPromptInput = document.getElementById('ai-prompt');
const fillSample    = document.getElementById('fill-sample');
const fillHello     = document.getElementById('fill-hello');
const voiceSelect   = document.getElementById('voice');
const voiceSearch   = document.getElementById('voice-search');
const voiceHint     = document.getElementById('voice-hint');
const langSelect    = document.getElementById('language');
const scriptField   = document.getElementById('script');
const titleField    = document.getElementById('title');
const scriptMetrics = document.getElementById('script-metrics');
const narratorMode  = document.getElementById('narratorMode');
const personalAudioSelect = document.getElementById('personalAudio');
let allVoices = {};

// ─── Utility Functions ─────────────────────────────────────────────────────────

function setMessage(element, text, isSuccess) {
    element.hidden = false;
    element.textContent = text;
    element.classList.toggle('success', Boolean(isSuccess));
    if (element.id === 'form-status' && form) {
        window.scrollTo({ top: form.offsetTop - 20, behavior: 'smooth' });
    }
}

function estimateWordCount(text) {
    return text.trim() ? text.trim().split(/\\s+/).filter(Boolean).length : 0;
}

function estimateSceneCount(text) {
    const visualCount = (text.match(/\\[visual:/ig) || []).length;
    const paragraphCount = text.split(/\\n+/).map((line) => line.trim()).filter(Boolean).length;
    return Math.max(visualCount, Math.min(Math.max(paragraphCount, 1), 12));
}

function estimateDurationSeconds(text) {
    const words = estimateWordCount(text);
    return words === 0 ? 0 : Math.max(5, Math.round(words / 2.6));
}

function updateScriptMetrics() {
    const text = scriptField.value || '';
    const words = estimateWordCount(text);
    const scenes = estimateSceneCount(text);
    const seconds = estimateDurationSeconds(text);
    scriptMetrics.innerHTML =
        '<span class="helper-badge">' + words + ' words</span>' +
        '<span class="helper-badge">~' + scenes + ' scenes</span>' +
        '<span class="helper-badge">~' + seconds + ' sec est.</span>';
}

// ─── Setup Form: Field Toggle Logic ─────────────────────────────────────────────

function toggleFieldUpdate(id) {
    const input = document.getElementById('setup-' + id);
    const toggle = document.getElementById('setup-' + id + '-toggle');
    if (input.hasAttribute('readonly')) {
        input.removeAttribute('readonly');
        input.value = '';
        input.placeholder = 'Enter new key...';
        input.focus();
        toggle.textContent = 'Cancel';
    } else {
        input.setAttribute('readonly', 'true');
        input.value = '';
        input.placeholder = 'Already saved (Click Change to update)';
        toggle.textContent = 'Change';
    }
}

function updateFieldStatus(id, saved) {
    const el = document.getElementById('setup-' + id + '-status');
    const input = document.getElementById('setup-' + id);
    const toggle = document.getElementById('setup-' + id + '-toggle');
    if (!el) return;
    el.textContent = saved ? '✓ Saved' : '⚠ Missing';
    el.className = 'status-chip ' + (saved ? 'ok' : 'warn');
    if (toggle) {
        toggle.style.display = saved ? 'inline-flex' : 'none';
        toggle.textContent = 'Change';
    }
    if (saved && input) {
        input.setAttribute('readonly', 'true');
        input.value = '';
        input.placeholder = 'Already saved (Click Change to update)';
    } else if (input) {
        input.removeAttribute('readonly');
    }
}
window.toggleFieldUpdate = toggleFieldUpdate;

// ─── Setup Status Board ─────────────────────────────────────────────────────────

function renderSetupStatus(data) {
    const items = [
        ['Pexels API', data.hasPexelsKey, 'Needed for the strongest video search'],
        ['Voice engine', data.voiceGenerationReady, data.voiceEngineMessage || 'Needed for narration'],
        ['Ready to render', data.readyForGeneration, 'Main requirements satisfied']
    ];
    setupReadiness.innerHTML = items.map(([label, ok, help]) =>
        '<div class="status-card"><strong>' + label + '</strong>' +
        '<p class="muted">' + (ok ? 'Ready' : 'Not set') + '</p>' +
        '<p class="field-help">' + help + '</p></div>'
    ).join('');

    updateFieldStatus('pexels', data.hasPexelsKey);
    updateFieldStatus('pixabay', data.hasPixabayKey);
    updateFieldStatus('gemini', data.hasGeminiKey);
}

async function loadSetupStatus() {
    try {
        const res = await fetch('/api/setup/status', { cache: 'no-store' });
        const json = await res.json();
        if (json.success) {
            renderSetupStatus(json.data);
        }
    } catch (e) {
        console.error('Failed to load setup status', e);
    }
}

// ─── Voice Management ───────────────────────────────────────────────────────────

function renderVoices(filter = '') {
    if (!Object.keys(allVoices).length) {
        voiceHint.textContent = 'Using the built-in voice list. Dynamic voices were not loaded yet.';
        return;
    }
    voiceSelect.innerHTML = '<option value="">Select Voice (Optional Override)</option>';
    const query = filter.toLowerCase().trim();
    let results = 0;
    Object.entries(allVoices).forEach(([lang, voices]) => {
        const filtered = voices.filter((v) =>
            v.name.toLowerCase().includes(query) ||
            lang.toLowerCase().includes(query) ||
            v.gender.toLowerCase().includes(query)
        );
        if (filtered.length > 0) {
            const group = document.createElement('optgroup');
            group.label = lang;
            filtered.forEach((v) => {
                const opt = document.createElement('option');
                opt.value = v.name;
                opt.textContent = \`\${v.name} (\${v.gender})\`;
                group.appendChild(opt);
            });
            voiceSelect.appendChild(group);
            results += filtered.length;
        }
    });
    voiceHint.textContent = results > 0
        ? results + ' voices match your search.'
        : 'No voices match that search yet.';
}

async function loadAllVoices() {
    try {
        const res = await fetch('/api/voices');
        const json = await res.json();
        if (json.success) {
            allVoices = json.data;
            Object.keys(allVoices).sort().forEach((lang) => {
                const opt = document.createElement('option');
                opt.value = lang;
                opt.textContent = lang;
                if (![...langSelect.options].some((o) => o.value === lang)) {
                    langSelect.appendChild(opt);
                }
            });
            renderVoices(voiceSearch.value || '');
            const total = Object.values(allVoices).reduce((count, list) => count + list.length, 0);
            voiceHint.textContent = total + ' dynamic voices loaded from Edge-TTS.';
        }
    } catch (e) {
        console.error('Failed to load voices', e);
        voiceHint.textContent = 'Dynamic voice loading is unavailable right now. You can still use the built-in voice list.';
    }
}

// ─── Event Listeners ────────────────────────────────────────────────────────────

voiceSearch.addEventListener('input', (e) => renderVoices(e.target.value));
scriptField.addEventListener('input', updateScriptMetrics);

// Fill Sample Script
fillSample.addEventListener('click', () => {
    if (!titleField.value) {
        titleField.value = 'How AI Is Changing Everyday Life';
    }
    scriptField.value = sampleScript;
    langSelect.value = 'english';
    renderVoices(voiceSearch.value || '');
    updateScriptMetrics();
    window.scrollTo({ top: form.offsetTop - 20, behavior: 'smooth' });
});

// Fill Hello World Script
fillHello.addEventListener('click', () => {
    titleField.value = 'Hello World - My First Video';
    scriptField.value = helloWorldScript;
    langSelect.value = 'english';
    renderVoices(voiceSearch.value || '');
    updateScriptMetrics();
    window.scrollTo({ top: form.offsetTop - 20, behavior: 'smooth' });
});

// AI Script Generation
generateAiBtn?.addEventListener('click', async () => {
    const prompt = aiPromptInput.value.trim();
    if (!prompt) return;

    const originalText = generateAiBtn.textContent;
    generateAiBtn.textContent = 'Generating...';
    generateAiBtn.disabled = true;

    try {
        const res = await fetch('/api/ai/generate-script', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt })
        });
        const json = await res.json();
        
        if (!res.ok || !json.success) {
            throw new Error(json.error || 'Failed to generate script');
        }

        titleField.value = json.data.title || '';
        scriptField.value = json.data.script || '';
        updateScriptMetrics();
        setMessage(status, 'AI Script generated successfully. You can review and edit it below.', true);
        window.scrollTo({ top: titleField.offsetTop - 80, behavior: 'smooth' });
    } catch (err) {
        let errMsg = err instanceof Error ? err.message : 'Unknown error';
        if (errMsg.includes('GEMINI_API_KEY is not set')) {
            errMsg = 'Gemini API Key missing. Please set it in the One-Time Setup above.';
        }
        setMessage(status, 'AI Generation Error: ' + errMsg, false);
    } finally {
        generateAiBtn.textContent = originalText;
        generateAiBtn.disabled = false;
    }
});

// ─── Setup Form Submission ──────────────────────────────────────────────────────

setupForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {};
    ['pexels', 'pixabay', 'gemini'].forEach(id => {
        const input = document.getElementById('setup-' + id);
        if (!input.hasAttribute('readonly') && input.value.trim()) {
            payload[id.toUpperCase() + '_API_KEY'] = input.value.trim();
        }
    });
    if (Object.keys(payload).length === 0) {
        setMessage(setupFeedback, 'No new changes to save.', false);
        return;
    }
    setMessage(setupFeedback, 'Saving setup...', false);
    try {
        const res = await fetch('/api/setup/env', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const json = await res.json();
        if (!res.ok || !json.success) {
            throw new Error(json.error || 'Unable to save setup.');
        }
        setMessage(setupFeedback, 'Setup saved. This browser workspace is ready to use.', true);
        renderSetupStatus(json.data);
    } catch (err) {
        setMessage(setupFeedback, err instanceof Error ? err.message : 'Unable to save setup.', false);
    }
});

// ─── Generate Video Form Submission ─────────────────────────────────────────────

form.addEventListener('submit', async (e) => {
    e.preventDefault();
    setMessage(status, 'Starting render...', false);
    const payload = {
        title: document.getElementById('title').value,
        script: document.getElementById('script').value,
        orientation: document.getElementById('orientation').value,
        language: document.getElementById('narratorMode').value === 'ai' ? document.getElementById('language').value : undefined,
        voice: document.getElementById('narratorMode').value === 'ai' ? (document.getElementById('voice').value || undefined) : undefined,
        personalAudio: document.getElementById('narratorMode').value === 'personal' ? document.getElementById('personalAudio').value : undefined,
        backgroundMusic: document.getElementById('backgroundMusic').value,
        defaultVideo: document.getElementById('defaultVideo').value,
        showText: document.getElementById('showText').checked,
        skipReview: !document.getElementById('enableReview').checked,
        textConfig: {
            animation: document.getElementById('subtitle-animation').value,
            position: document.getElementById('subtitle-position').value,
            color: document.getElementById('subtitle-color').value,
            fontSize: parseInt(document.getElementById('subtitle-fontSize').value) || 52,
            background: document.getElementById('subtitle-background').value,
            glow: document.getElementById('subtitle-glow').checked
        }
    };
    try {
        const res = await fetch('/generate-video', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const json = await res.json();
        if (!res.ok || !json.success) {
            throw new Error(json.error || 'Unable to start render.');
        }
        window.location.href = json.data.statusPageUrl;
    } catch (err) {
        setMessage(status, err instanceof Error ? err.message : 'Unable to start render.', false);
    }
});

// ─── Initialization ─────────────────────────────────────────────────────────────

updateScriptMetrics();
loadSetupStatus();
loadAllVoices();
loadGalleryAssets();

// ─── File Browser Modal Logic ───────────────────────────────────────────────────

const browserModal   = document.getElementById('browser-modal');
const browserPath    = document.getElementById('browser-path');
const browserList    = document.getElementById('browser-list');
const assetGallery   = document.getElementById('asset-gallery');
const musicSelect    = document.getElementById('backgroundMusic');
const quickAccessList = document.getElementById('quick-access-list');
const drivesList     = document.getElementById('drives-list');
let currentBrowserType = 'media';
let currentParentPath = '';

window.openSystemBrowser = (type) => {
    currentBrowserType = type;
    browserModal.classList.add('open');
    loadSidebar();
    loadPath();
};
window.closeSystemBrowser = () => browserModal.classList.remove('open');

browserPath.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') loadPath(e.target.value);
});

async function loadSidebar() {
    try {
        const homeRes = await fetch('/api/fs/home');
        const homeJson = await homeRes.json();
        if (homeJson.success) {
            const h = homeJson.data;
            const items = [
                { name: 'Home', path: h.home, icon: '🏠' },
                { name: 'Desktop', path: h.desktop, icon: '🖥️' },
                { name: 'Downloads', path: h.downloads, icon: '⬇️' },
                { name: 'Videos', path: h.videos, icon: '🎬' },
                { name: 'Pictures', path: h.pictures, icon: '🖼️' }
            ];
            quickAccessList.innerHTML = items.map(i => \`<div class="sidebar-item" onclick="loadPath('\${i.path.replace(/\\\\/g, '\\\\\\\\')}')"><span>\${i.icon}</span> \${i.name}</div>\`).join('');
        }

        const drivesRes = await fetch('/api/fs/drives');
        const drivesJson = await drivesRes.json();
        if (drivesJson.success) {
            drivesList.innerHTML = drivesJson.data.map(d => \`<div class="sidebar-item" onclick="loadPath('\${d}\\\\')"><span>💽</span> \${d} Drive</div>\`).join('');
        }
    } catch (e) {
        console.error('Sidebar load failed', e);
    }
}

async function loadPath(path = '') {
    browserList.innerHTML = '<div class="muted" style="padding:20px">Loading...</div>';
    try {
        const res = await fetch('/api/fs/ls?path=' + encodeURIComponent(path));
        const json = await res.json();
        if (!json.success) throw new Error(json.error);

        const data = json.data;
        browserPath.value = data.currentPath;
        currentParentPath = data.parentPath;
        browserList.innerHTML = '';

        if (data.items.length === 0) {
            browserList.innerHTML = '<div class="empty-state" style="margin:20px"><p class="muted">This folder is empty.</p></div>';
            return;
        }

        data.items.forEach(item => {
            const div = document.createElement('div');
            const isSelectable = (currentBrowserType === 'music' || currentBrowserType === 'personalAudio')
                ? (item.ext === '.mp3' || item.ext === '.wav' || item.ext === '.m4a')
                : ['.mp4', '.mov', '.jpg', '.png', '.jpeg'].includes(item.ext);

            const isImage = ['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(item.ext);
            const isVideo = ['.mp4', '.mov', '.webm', '.ogg'].includes(item.ext);
            const viewUrl = \`/api/fs/view?path=\${encodeURIComponent(item.path)}\`;

            div.className = 'browser-item' + (!item.isDir && !isSelectable ? ' disabled' : '');
            div.innerHTML = \`
                <span class="browser-icon">
                    \${isImage 
                        ? \`<img src="\${viewUrl}" class="browser-preview">\` 
                        : isVideo 
                            ? \`<video src="\${viewUrl}" class="browser-preview" muted onmouseover="this.play()" onmouseout="this.pause();this.currentTime=0"></video>\`
                            : (item.isDir ? '📁' : '📄')}
                </span>
                <span class="browser-name">\${item.name}</span>
                <span class="browser-size">\${item.isDir ? '' : 'File'}</span>
            \`;

            if (item.isDir) {
                div.onclick = () => loadPath(item.path);
            } else if (isSelectable) {
                div.onclick = () => pickFile(item.path);
            }
            browserList.appendChild(div);
        });
    } catch (e) {
        browserList.innerHTML = '<div class="status" style="margin:20px"><strong>Error:</strong> ' + e.message + '</div>';
    }
}

async function pickFile(path) {
    try {
        const res = await fetch('/api/fs/pick', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sourcePath: path, type: currentBrowserType })
        });
        const json = await res.json();
        if (!json.success) throw new Error(json.error);

        if (currentBrowserType === 'music' || currentBrowserType === 'personalAudio') {
            const opt = document.createElement('option');
            opt.value = json.data.filename;
            opt.textContent = json.data.filename;
            if (currentBrowserType === 'music') {
                musicSelect.appendChild(opt);
                musicSelect.value = json.data.filename;
            } else {
                personalAudioSelect.appendChild(opt);
                personalAudioSelect.value = json.data.filename;
            }
        } else {
            addAssetToGallery(json.data);
        }
        closeSystemBrowser();
    } catch (e) {
        alert('Pick failed: ' + e.message);
    }
}

function addAssetToGallery(data) {
    const isImage = /\.(jpg|jpeg|png|gif|webp)$/i.test(data.filename);
    const div = document.createElement('div');
    div.className = 'asset-item';
    div.innerHTML = \`
        \${isImage ? \`<img src="\${data.assetUrl}" class="asset-preview" alt="\${data.filename}">\` : ''}
        <div style="font-size:12px;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">\${data.filename}</div>
        <div class="tag-copy" title="Click to insert into script">\${data.tag}</div>
        <div class="delete-btn" title="Remove asset">✕</div>
    \`;
    div.querySelector('.delete-btn').onclick = (e) => {
        e.stopPropagation();
        deleteAsset(data.filename, div);
    };
    div.querySelector('.tag-copy').onclick = () => {
        const script = document.getElementById('script');
        const pos = script.selectionStart;
        const text = script.value;
        script.value = text.slice(0, pos) + data.tag + text.slice(pos);
        updateScriptMetrics();
        script.focus();
    };
    assetGallery.appendChild(div);
}

async function deleteAsset(filename, element) {
    if (!confirm('Are you sure you want to permanently delete this asset?')) return;
    
    try {
        const res = await fetch('/api/fs/assets/' + encodeURIComponent(filename), {
            method: 'DELETE'
        });
        const json = await res.json();
        if (json.success) {
            element.remove();
        } else {
            alert('Failed to delete asset: ' + json.error);
        }
    } catch (e) {
        console.error('Delete failed', e);
        alert('Failed to delete asset. Check console for details.');
    }
}

async function loadGalleryAssets() {
    try {
        const res = await fetch('/api/fs/assets');
        const json = await res.json();
        if (json.success) {
            json.data.forEach(addAssetToGallery);
        }
    } catch (e) {
        console.error('Failed to load gallery assets', e);
    }
}
`;

    // ─── Return the final assembled page ───────────────────────────────────────

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
        script
    );
}
