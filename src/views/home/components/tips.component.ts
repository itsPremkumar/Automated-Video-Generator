export function tipsSection(recentCards: string): string {
    return `
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
    </section>`;
}
