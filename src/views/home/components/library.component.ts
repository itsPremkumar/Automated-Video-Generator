export function librarySection(cards: string): string {
    return `
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
    </section>`;
}
