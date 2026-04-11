export function utilityFunctions(): string {
    return `
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
`;
}
