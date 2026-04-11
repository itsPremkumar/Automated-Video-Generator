import { PROJECT_REPOSITORY_URL } from '../../../constants/config';

export function heroSection(totalVideos: number, totalVoices: number, setupSummary: string): string {
    return `
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
                        <strong>${totalVideos}</strong>
                        <span class="muted">videos created in this portal</span>
                    </div>
                    <div class="metric-card">
                        <strong>${totalVoices}+</strong>
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
    </section>`;
}
