export function domReferences(): string {
    return `
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
const voiceHint     = document.getElementById('voice-hint');
const langSelect    = document.getElementById('language');
const scriptField   = document.getElementById('script');
const titleField    = document.getElementById('title');
const scriptMetrics = document.getElementById('script-metrics');
const narratorMode  = document.getElementById('narratorMode');
const personalAudioSelect = document.getElementById('personalAudio');
const addMediaBtn    = document.getElementById('add-media-btn');
const browsePersonalAudioBtn = document.getElementById('browse-personal-audio-btn');
const browseMusicBtn  = document.getElementById('browse-music-btn');
const browserUpBtn    = document.getElementById('browser-up-btn');
const browserCloseBtn = document.getElementById('browser-close-btn');
const browserGoBtn    = document.getElementById('browser-go-btn');
const browserCancelBtn = document.getElementById('browser-cancel-btn');
`;
}
