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
                <div class="metric-grid" style="margin-top:32px">
                    <div class="metric-card">
                        <strong>${totalVideos}</strong>
                        <span class="muted">videos created</span>
                    </div>
                    <div class="metric-card">
                        <strong>${totalVoices}+</strong>
                        <span class="muted">voice presets</span>
                    </div>
                    <div class="metric-card">
                        <strong>3 steps</strong>
                        <span class="muted">easy flow</span>
                    </div>
                </div>
            </div>

            <!-- Simple Flow Sidebar -->
            <div class="panel glass stack" style="justify-content:center;">
                <span class="eyebrow" style="background:var(--brand); color:#fff; border:none">Simple Flow</span>
                <h2 style="margin-top:12px">What users do here</h2>
                <div class="row" style="margin-bottom:12px">${setupSummary}</div>
                <ul class="checklist" style="list-style:none; padding:0">
                    <li style="margin-bottom:12px; display:flex; gap:10px; font-size:14px"><span style="color:var(--brand)">✓</span> Save your API keys once.</li>
                    <li style="margin-bottom:12px; display:flex; gap:10px; font-size:14px"><span style="color:var(--brand)">✓</span> Paste your script in the studio.</li>
                    <li style="margin-bottom:12px; display:flex; gap:10px; font-size:14px"><span style="color:var(--brand)">✓</span> Choose voice and visual style.</li>
                    <li style="margin-bottom:12px; display:flex; gap:10px; font-size:14px"><span style="color:var(--brand)">✓</span> Render and watch your video.</li>
                </ul>
            </div>
        </div>
    </section>`;
}
