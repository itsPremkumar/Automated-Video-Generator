export function setupLogic(): string {
    return `
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
`;
}
