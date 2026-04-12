import { MAX_TITLE_LENGTH, DEFAULT_FALLBACK_VIDEO } from '../../../constants/config';
import { escapeHtml } from '../../layout.view';

export function workspaceSection(
    defaultTitle: string,
    defaultScript: string,
    musicOptions: string,
    languageOptions: string
): string {
    return `
    <!-- ═══════════════════════════════════════════════════════════════════════
         UNIFIED VIDEO STUDIO (WORKSPACE)
         ═══════════════════════════════════════════════════════════════════════ -->
    <section id="workspace" class="stack" style="margin-top:40px">
        <div class="panel-head">
            <div>
                <span class="eyebrow">Studio</span>
                <h2>Unified Video Studio</h2>
                <p class="muted">All your script and design controls in one place. Optimized for pro creation flow.</p>
            </div>
        </div>

        <form id="generate-form" class="studio-grid">
            <!-- Status Message (spans all columns) -->
            <div id="form-status" class="status" style="grid-column:1 / -1; margin-bottom:10px" hidden></div>

            <!-- Progress Indicator -->
            <div style="grid-column:1 / -1; margin-bottom:32px; padding:24px; background:var(--brand-soft); border-radius:var(--radius-lg); border:1px solid rgba(79, 70, 229, 0.1)">
                <div class="row" style="justify-content:space-around; align-items:center; flex-wrap:wrap; gap:24px">
                    <div class="row" style="gap:12px; align-items:center">
                        <div style="width:36px; height:36px; border-radius:50%; background:var(--brand); color:white; display:flex; align-items:center; justify-content:center; font-weight:800; font-size:14px">1</div>
                        <span style="font-weight:700; font-size:15px; letter-spacing:-0.01em">Script & Media</span>
                    </div>
                    <div style="width:60px; height:2px; background:rgba(79, 70, 229, 0.2)"></div>
                    <div class="row" style="gap:12px; align-items:center">
                        <div style="width:36px; height:36px; border-radius:50%; background:var(--brand); color:white; display:flex; align-items:center; justify-content:center; font-weight:800; font-size:14px">2</div>
                        <span style="font-weight:700; font-size:15px; letter-spacing:-0.01em">Voice & Layout</span>
                    </div>
                    <div style="width:60px; height:2px; background:rgba(79, 70, 229, 0.2)"></div>
                    <div class="row" style="gap:12px; align-items:center">
                        <div style="width:36px; height:36px; border-radius:50%; background:var(--brand); color:white; display:flex; align-items:center; justify-content:center; font-weight:800; font-size:14px">3</div>
                        <span style="font-weight:700; font-size:15px; letter-spacing:-0.01em">Style & Render</span>
                    </div>
                </div>
            </div>

            <!-- ─── Step 1: Script & Story ─── -->
            <div class="panel form-panel">
                <div class="panel-head">
                    <div>
                        <span class="eyebrow">Step 1 of 3</span>
                        <h2>📝 Script & Media</h2>
                        <p class="muted small">Write your story and add local media. Use <strong>[Visual: ...]</strong> tags for visuals.</p>
                    </div>
                </div>

                <div class="field" style="background:var(--success-soft); padding:20px; border-radius:var(--radius-md); border:1px solid rgba(16, 185, 129, 0.15)">
                    <label for="ai-prompt" style="color:var(--success); font-weight:800; font-size:13px; text-transform:uppercase; letter-spacing:0.05em">✨ Generate script with AI</label>
                    <div class="row" style="flex-wrap:nowrap; gap:12px; margin-top:8px">
                        <input id="ai-prompt" placeholder="E.g. A short video about the history of space travel..." style="flex:1">
                        <button type="button" id="generate-ai" class="secondary" style="color:var(--success); border-color:rgba(16, 185, 129, 0.3)">Generate</button>
                    </div>
                </div>

                <div class="field">
                    <label for="title">Video title</label>
                    <input id="title" value="${escapeHtml(defaultTitle)}" placeholder="How AI Is Changing Everyday Life" maxlength="${MAX_TITLE_LENGTH}" required>
                    <p class="field-help">Used for output page and filename.</p>
                </div>

                <div class="field">
                    <label for="script">Input script</label>
                    <div class="script-shell">
                        <div class="script-toolbar">
                            <span class="muted small">Editable input area</span>
                            <div id="script-metrics" class="row">
                                <span class="helper-badge">0 words</span>
                                <span class="helper-badge">0 sec est.</span>
                            </div>
                        </div>
                        <textarea id="script" placeholder="[Visual: futuristic robotics lab] AI is changing how people and robots work together.&#10;&#10;[Visual: doctor reviewing an AI dashboard] In healthcare, it helps spot patterns faster and supports earlier decisions." required>${escapeHtml(defaultScript)}</textarea>
                    </div>
                </div>

                <div class="row" style="margin-top:10px">
                    <button type="button" id="fill-sample" class="secondary" style="font-size:13px;padding:8px 14px">Use Sample</button>
                    <button type="button" id="fill-hello" class="secondary" style="font-size:13px;padding:8px 14px">Hello World</button>
                </div>

                <div class="stack" style="margin-top:32px; padding:24px; background:var(--brand-soft); border-radius:var(--radius-lg); border:1px solid rgba(79, 70, 229, 0.1)">
                    <div class="row" style="justify-content:space-between;align-items:center">
                        <div>
                            <strong style="font-size:15px; color:var(--brand); letter-spacing:-0.01em">📁 Local Media Library</strong>
                            <p class="field-help" style="margin:4px 0 0 0; font-size:12px">Add your own images/videos. Click tags to insert into script above.</p>
                        </div>
                        <button type="button" id="add-media-btn" class="secondary" style="padding:8px 20px; border-color:rgba(79, 70, 229, 0.3)">+ Add Media</button>
                    </div>
                    <div id="asset-gallery" class="asset-gallery"></div>
                </div>
            </div>

            <!-- ─── Step 2: Voice & Layout ─── -->
            <div class="panel form-panel">
                <div class="panel-head">
                    <div>
                        <span class="eyebrow">Step 2 of 3</span>
                        <h2>🎤 Voice & Layout</h2>
                        <p class="muted small">Choose AI voice or upload your own audio. Select video orientation.</p>
                    </div>
                </div>
                <div class="stack" style="gap:12px">
                    <div class="field">
                        <label for="orientation">Orientation</label>
                        <select id="orientation">
                            <option value="portrait">Portrait (9:16)</option>
                            <option value="landscape">Landscape (16:9)</option>
                        </select>
                    </div>
                    <div class="field">
                        <label>Narrator Mode</label>
                        <select id="narratorMode">
                            <option value="ai">AI Voice</option>
                            <option value="personal">Personal Audio</option>
                        </select>
                    </div>

                    <div id="ai-voice-settings" class="stack" style="gap:12px">
                        <div class="field">
                            <label for="language">Language</label>
                            <select id="language">
                                <option value="">Detect automatically</option>
                                ${languageOptions}
                            </select>
                        </div>
                        <div class="field">
                            <label for="voice">Voice</label>
                            <select id="voice">
                                <option value="">Optional</option>
                            </select>
                            <p id="voice-hint" class="field-help" style="font-size:11px"></p>
                        </div>
                    </div>

                    <div id="personal-audio-settings" class="stack" style="gap:12px; display:none">
                        <div class="field">
                            <label for="personalAudio">Audio Recording</label>
                            <div class="row" style="flex-wrap:nowrap">
                                <select id="personalAudio" style="font-size:13px">
                                    <option value="">Select an audio file</option>
                                    ${musicOptions}
                                </select>
                                <button type="button" id="browse-personal-audio-btn" class="secondary" style="padding:8px 12px;font-size:13px">Browse</button>
                            </div>
                            <p class="field-help">Your recording roughly matching the script length.</p>
                        </div>
                    </div>
                </div>
            </div>

            <!-- ─── Step 3: Style & Output ─── -->
            <div class="panel form-panel">
                <div class="panel-head">
                    <div>
                        <span class="eyebrow">Step 3 of 3</span>
                        <h2>🎨 Style & Output</h2>
                        <p class="muted small">Add music, customize subtitles, and configure final output settings.</p>
                    </div>
                </div>
                <div class="stack" style="gap:12px">
                    <div class="field">
                        <label for="backgroundMusic">Background music</label>
                        <div class="row" style="flex-wrap:nowrap">
                            <select id="backgroundMusic" style="font-size:13px">
                                <option value="">No music</option>
                                ${musicOptions}
                            </select>
                            <button type="button" id="browse-music-btn" class="secondary" style="padding:8px 12px;font-size:13px">Browse</button>
                        </div>
                    </div>
                    <div class="field">
                        <label for="defaultVideo">Fallback asset</label>
                        <input id="defaultVideo" value="${escapeHtml(DEFAULT_FALLBACK_VIDEO)}" placeholder="Fallback asset">
                    </div>
                    <label class="toggle-row" for="showText" style="padding:10px 12px">
                        <input id="showText" type="checkbox" checked>
                        <div><strong>Show subtitles</strong></div>
                    </label>
                    <div id="subtitle-config" class="panel soft" style="gap:12px; padding:16px; margin: 4px 0 12px;">
                        <div class="field-grid two-up" style="gap:16px">
                            <div class="field">
                                <label for="subtitle-animation" style="font-size:13px; margin-bottom:6px; display:block">Animation</label>
                                <select id="subtitle-animation">
                                    <option value="fade">Fade</option>
                                    <option value="slide">Slide Up</option>
                                    <option value="zoom">Zoom In</option>
                                    <option value="typewriter">Typewriter</option>
                                    <option value="pop">Pop (Elastic)</option>
                                </select>
                            </div>
                            <div class="field">
                                <label for="subtitle-position" style="font-size:13px; margin-bottom:6px; display:block">Position</label>
                                <select id="subtitle-position">
                                    <option value="bottom">Bottom</option>
                                    <option value="center">Center</option>
                                    <option value="top">Top</option>
                                </select>
                            </div>
                            <div class="field">
                                <label for="subtitle-color" style="font-size:13px; margin-bottom:6px; display:block">Color</label>
                                <input id="subtitle-color" type="color" value="#ffffff" style="height:44px; padding:4px">
                            </div>
                            <div class="field">
                                <label for="subtitle-fontSize" style="font-size:13px; margin-bottom:6px; display:block">Font Size</label>
                                <input id="subtitle-fontSize" type="number" value="52" min="10" max="120">
                            </div>
                            <div class="field">
                                <label for="subtitle-background" style="font-size:13px; margin-bottom:6px; display:block">Background Style</label>
                                <select id="subtitle-background">
                                    <option value="none">None</option>
                                    <option value="box">Dark Box</option>
                                    <option value="glass">Glassmorphism</option>
                                </select>
                            </div>
                            <div class="field">
                                <label class="toggle-row" for="subtitle-glow" style="margin-top:24px; padding:8px 12px; font-size:13px">
                                    <input id="subtitle-glow" type="checkbox">
                                    <div><strong>Glow Effect</strong></div>
                                </label>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Submit Button (spans all columns) -->
            <div class="toolbar" style="grid-column: 1 / -1; margin-top:40px; padding:40px; background:var(--slate-900); border-radius:var(--radius-xl); justify-content:center; flex-direction:column; align-items:center; gap:24px; color:white; box-shadow:var(--shadow-xl)">
                <label class="toggle-row" for="enableReview" style="padding:16px 32px; border: 1px solid var(--slate-700); border-radius: var(--radius-lg); background: var(--slate-800); cursor:pointer">
                    <input id="enableReview" type="checkbox" style="width:20px; height:20px">
                    <div style="margin-left:12px"><strong style="font-size:15px">🔍 Enable Timeline Editor (Review Mode)</strong></div>
                </label>
                <button type="submit" style="min-width:380px; padding:20px 48px; font-size:18px; font-weight:800; background:var(--brand); border-radius:var(--radius-lg); box-shadow:0 20px 50px rgba(79, 70, 229, 0.4)">🎬 Start Rendering Video</button>
                <p class="muted" style="font-size:13px; text-align:center; color:var(--slate-400)">Your video will be processed and you'll be redirected to the status page</p>
            </div>
        </form>
    </section>`;
}
