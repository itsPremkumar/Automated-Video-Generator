export function setupSection(setupSummary: string): string {
    return `
    <!-- ═══════════════════════════════════════════════════════════════════════
         ONE-TIME SETUP SECTION
         ═══════════════════════════════════════════════════════════════════════ -->
    <section class="layout-split">
        <!-- Setup Status Panel -->
        <div class="panel tint stack">
            <div>
                <span class="eyebrow">One-Time Setup</span>
                <h2>Prepare this device once</h2>
                <p class="muted">Most users only need a Pexels API key. Save it here and the browser portal becomes the main way to use the project.</p>
            </div>
            <div class="row">${setupSummary}</div>
            <div id="setup-readiness" class="status-board"></div>
        </div>

        <!-- Setup Form Panel -->
        <div class="panel">
            <form id="setup-form" class="form">
                <div class="field-grid two-up">
                    <!-- Pexels Key -->
                    <div class="field">
                        <div class="row" style="justify-content:space-between">
                            <label for="setup-pexels">Pexels API key</label>
                            <div class="row">
                                <span id="setup-pexels-status" class="status-chip warn">Checking...</span>
                                <button type="button" id="setup-pexels-toggle" class="secondary" style="padding:4px 10px;font-size:12px;display:none" onclick="toggleFieldUpdate('pexels')">Change</button>
                            </div>
                        </div>
                        <input id="setup-pexels" type="password" placeholder="Recommended for stock video search">
                        <p class="field-help">Best source for usable portrait and landscape stock footage.</p>
                    </div>

                    <!-- Pixabay Key -->
                    <div class="field">
                        <div class="row" style="justify-content:space-between">
                            <label for="setup-pixabay">Pixabay API key</label>
                            <div class="row">
                                <span id="setup-pixabay-status" class="status-chip warn">Checking...</span>
                                <button type="button" id="setup-pixabay-toggle" class="secondary" style="padding:4px 10px;font-size:12px;display:none" onclick="toggleFieldUpdate('pixabay')">Change</button>
                            </div>
                        </div>
                        <input id="setup-pixabay" type="password" placeholder="Optional backup provider">
                        <p class="field-help">Optional secondary image and video source.</p>
                    </div>

                    <!-- Gemini Key -->
                    <div class="field">
                        <div class="row" style="justify-content:space-between">
                            <label for="setup-gemini">Gemini API key</label>
                            <div class="row">
                                <span id="setup-gemini-status" class="status-chip warn">Checking...</span>
                                <button type="button" id="setup-gemini-toggle" class="secondary" style="padding:4px 10px;font-size:12px;display:none" onclick="toggleFieldUpdate('gemini')">Change</button>
                            </div>
                        </div>
                        <input id="setup-gemini" type="password" placeholder="Optional AI helper">
                        <p class="field-help">Only needed if your workflows use Gemini-powered helpers.</p>
                    </div>
                </div>

                <div class="toolbar">
                    <button type="submit">Save Setup</button>
                    <span class="muted">Launcher users can open this page from <strong>Start-Automated-Video-Generator.bat</strong>.</span>
                </div>
            </form>
            <div id="setup-feedback" class="status" hidden></div>
        </div>
    </section>`;
}
