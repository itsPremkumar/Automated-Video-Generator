export function formLogic(): string {
    return `
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

// ─── AI Script Generation ───────────────────────────────────────────────────────

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

// ─── Preset Fill Listeners ──────────────────────────────────────────────────────

fillSample.addEventListener('click', () => {
    if (!titleField.value) {
        titleField.value = 'How AI Is Changing Everyday Life';
    }
    scriptField.value = sampleScript;
    langSelect.value = 'english';
    renderVoices();
    updateScriptMetrics();
    window.scrollTo({ top: form.offsetTop - 20, behavior: 'smooth' });
});

fillHello.addEventListener('click', () => {
    titleField.value = 'Hello World - My First Video';
    scriptField.value = helloWorldScript;
    langSelect.value = 'english';
    renderVoices();
    updateScriptMetrics();
    window.scrollTo({ top: form.offsetTop - 20, behavior: 'smooth' });
});

langSelect.addEventListener('change', () => renderVoices());
scriptField.addEventListener('input', updateScriptMetrics);
narratorMode.addEventListener('change', () => {
    const isAi = narratorMode.value === 'ai';
    document.getElementById('ai-voice-settings').style.display = isAi ? 'flex' : 'none';
    document.getElementById('personal-audio-settings').style.display = isAi ? 'none' : 'flex';
});
`;
}
