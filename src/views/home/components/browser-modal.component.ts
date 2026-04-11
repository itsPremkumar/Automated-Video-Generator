export function browserModalComponent(): string {
    return `
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
                        <button type="button" id="browser-up-btn" class="ghost" title="Go up one level">⤴ Up</button>
                        <button type="button" id="browser-close-btn" class="secondary">✕</button>
                    </div>
                </div>
                <div class="browser-path-wrapper">
                    <input id="browser-path" class="browser-path" placeholder="Path\\\\To\\\\Folder..." title="Type path and press Enter">
                    <button type="button" id="browser-go-btn" class="secondary" style="padding:6px 12px;margin-left:8px">Go</button>
                </div>
                <div id="browser-list" class="browser-list"></div>
                <div class="browser-footer">
                    <button type="button" id="browser-cancel-btn" class="secondary">Cancel</button>
                </div>
            </div>
        </div>
    </div>`;
}
