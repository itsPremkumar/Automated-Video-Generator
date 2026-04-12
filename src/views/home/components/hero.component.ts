import { PROJECT_REPOSITORY_URL } from '../../../constants/config';

export function heroSection(totalVideos: number, totalVoices: number, setupSummary: string): string {
    return `
    <!-- ═══════════════════════════════════════════════════════════════════════
         HERO SECTION
         ═══════════════════════════════════════════════════════════════════════ -->
    <section class="hero-surface">
        <div class="hero-grid">
            <div class="stack" style="gap:24px">
                <div class="stack" style="gap:12px">
                    <span class="eyebrow"><i data-lucide="zap" style="width:12px;height:12px;margin-right:2px"></i> Local AI Video Studio</span>
                    <h1>Create videos from a script, not from folders</h1>
                    <p class="lead" style="color:var(--muted)">Paste your idea, shape the voice and layout, then let our studio handle stock visuals, narration, subtitles, and rendering in one high-performance pipeline.</p>
                </div>
                <div class="toolbar">
                    <a class="button" href="#workspace"><i data-lucide="terminal" style="width:18px;height:18px"></i> Open Workspace</a>
                    <a class="button secondary" href="${PROJECT_REPOSITORY_URL}" target="_blank" rel="noreferrer"><i data-lucide="github" style="width:18px;height:18px"></i> View Repository</a>
                    <a class="button ghost" href="/llms.txt"><i data-lucide="info" style="width:18px;height:18px"></i> AI Summary</a>
                </div>
                <div class="metric-grid" style="margin-top:12px">
                    <div class="metric-card">
                        <strong>${totalVideos}</strong>
                        <span class="muted">Videos Created</span>
                    </div>
                    <div class="metric-card">
                        <strong>${totalVoices}+</strong>
                        <span class="muted">Voice Presets</span>
                    </div>
                    <div class="metric-card">
                        <strong>3 steps</strong>
                        <span class="muted">Easy Flow</span>
                    </div>
                </div>
            </div>

            <!-- Simple Flow Sidebar -->
            <div class="panel glass stack" style="justify-content:center; gap:20px; border-radius:var(--radius-xl)">
                <div>
                    <span class="eyebrow" style="background:var(--brand); color:#fff; border:none; padding:4px 12px">Fast Workflow</span>
                    <h2 style="margin:12px 0 4px; font-size:1.5rem">What users do here</h2>
                </div>
                <div class="row" style="margin-bottom:4px">${setupSummary}</div>
                <ul class="checklist" style="list-style:none; padding:0; display:grid; gap:14px">
                    <li style="display:flex; gap:12px; font-size:14px; align-items:center"><i data-lucide="key" style="width:16px;height:16px;color:var(--brand)"></i> Save your API keys once.</li>
                    <li style="display:flex; gap:12px; font-size:14px; align-items:center"><i data-lucide="file-text" style="width:16px;height:16px;color:var(--brand)"></i> Paste your script in the studio.</li>
                    <li style="display:flex; gap:12px; font-size:14px; align-items:center"><i data-lucide="message-square" style="width:16px;height:16px;color:var(--brand)"></i> Choose voice and style.</li>
                    <li style="display:flex; gap:12px; font-size:14px; align-items:center"><i data-lucide="play-circle" style="width:16px;height:16px;color:var(--brand)"></i> Render and watch.</li>
                </ul>
            </div>
        </div>
    </section>
`;
}
