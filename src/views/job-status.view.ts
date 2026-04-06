import { Request } from 'express';
import { PROJECT_NAME } from '../constants/config';
import { layout, escapeHtml } from './layout.view';

// ═══════════════════════════════════════════════════════════════════════════════
// JOB STATUS PAGE — Premium Timeline Editor V3 (Studio Style)
// ═══════════════════════════════════════════════════════════════════════════════

export function jobPage(req: Request, jobId: string, cspNonce?: string): string {

    // ─── Premium UI Styles ──────────────────────────────────────────────────────

    const styles = `
    <style>
        .studio-header { margin-bottom: 30px; display: flex; justify-content: space-between; align-items: flex-end; }
        .studio-header h2 { margin: 0; font-size: 2.2rem; }
        
        #timeline-canvas { display: grid; gap: 24px; padding-bottom: 40px; }

        .scene-card {
            background: rgba(255, 255, 255, 0.7);
            backdrop-filter: blur(12px);
            border: 1px solid var(--line);
            border-radius: var(--radius-lg);
            padding: 24px;
            display: grid;
            grid-template-columns: 40px 1fr;
            gap: 20px;
            box-shadow: 0 12px 40px rgba(0,0,0,0.04);
            transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
            position: relative;
        }
        .scene-card:hover { border-color: var(--brand); transform: translateY(-2px); box-shadow: 0 20px 50px rgba(202,106,43,0.08); }
        .scene-card.dragging { opacity: 0.2; border: 2px dashed var(--brand); }
        .scene-card.updating { opacity: 0.5; pointer-events: none; }

        .drag-handle { 
            cursor: grab; display: flex; align-items: center; justify-content: center; 
            color: var(--line-strong); font-size: 22px; 
        }

        /* 2-Column Scene Body */
        .scene-body { display: grid; grid-template-columns: 320px 1fr; gap: 30px; }
        
        /* Media Section (Left) */
        .media-focus { display: flex; flex-direction: column; gap: 12px; }
        .scene-thumb-container {
            width: 100%; aspect-ratio: 16/9; border-radius: 14px; overflow: hidden;
            position: relative; border: 1px solid var(--line); background: #eee;
        }
        .scene-thumb-container img, .scene-thumb-container video { width: 100%; height: 100%; object-fit: cover; }
        .thumb-overlay { 
            position: absolute; inset: 0; background: rgba(0,0,0,0.3); 
            display: flex; align-items: center; justify-content: center;
            opacity: 0; transition: opacity 0.2s; cursor: pointer;
        }
        .scene-thumb-container:hover .thumb-overlay { opacity: 1; }

        /* Content Section (Right) */
        .content-focus { display: flex; flex-direction: column; gap: 16px; }
        .field-group { display: flex; flex-direction: column; gap: 6px; }
        .field-group label { font-size: 11px; font-weight: 800; text-transform: uppercase; color: var(--brand); letter-spacing: 0.05em; }
        
        .scene-input-large { 
            min-height: 100px; padding: 14px; border-radius: 12px; font-size: 15px; line-height:1.5;
            background: #fff; border: 1px solid var(--line); color: var(--ink);
        }

        /* Settings Bar (Bottom) */
        .settings-bar {
            grid-column: 1 / -1; margin-top: 10px; padding-top: 20px;
            border-top: 1px solid var(--line); display: grid; 
            grid-template-columns: 1fr 1fr 150px auto; gap: 30px; align-items: center;
        }

        .voice-slider-group { display: flex; flex-direction: column; gap: 8px; }
        .voice-slider-group label { font-size: 11px; font-weight: 700; color: var(--muted); display: flex; justify-content: space-between; }
        
        /* Interaction Buttons */
        .scene-actions { display: flex; gap: 12px; align-items: center; }
        .action-icon-btn { 
            background: #fff; border: 1px solid var(--line); border-radius: 10px; 
            width: 44px; height: 44px; display: flex; align-items: center; justify-content: center; 
            cursor: pointer; transition: all 0.2s;
        }
        .action-icon-btn:hover { border-color: var(--brand); color: var(--brand); background: var(--surface-soft); }
        .action-icon-btn.delete:hover { border-color: #e53e3e; color: #e53e3e; background: #fff5f5; }

        .btn-premium {
            padding: 12px 24px; border-radius: 12px; font-weight: 700; border: 0;
            cursor: pointer; display: inline-flex; align-items: center; gap: 8px;
            background: linear-gradient(135deg, var(--brand), var(--brand-strong)); color: #white;
        }

        /* Modal Redesign */
        #media-preview, #ai-modal, #gallery-modal {
            position: fixed; top: 0; left: 0; width: 100%; height: 100%; 
            background: rgba(23,32,51,0.85); backdrop-filter: blur(10px); 
            z-index: 5000; display: none; align-items: center; justify-content: center; padding: 40px;
        }
        .preview-box { background: #000; border-radius: 20px; overflow: hidden; max-width: 90vw; }
        .modal-body { background: #fff; padding: 30px; border-radius: 20px; width: 100%; max-width: 500px; position: relative; }
    </style>
    `;

    const body = `
    ${styles}
    <section class="hero-surface">
        <div class="hero-grid">
            <div class="stack">
                <span class="eyebrow">Project Hub</span>
                <div>
                    <h1 id="title">Working on video...</h1>
                    <p id="message" class="lead small">Check the progress or customize your scenes below.</p>
                </div>
                <div class="bar"><div id="progress"></div></div>
                <div class="metric-grid">
                    <div class="metric-card">
                        <strong id="percent">0%</strong>
                        <span class="muted">overall status</span>
                    </div>
                    <div class="metric-card">
                        <strong id="status-display">pending</strong>
                        <span class="muted">current stage</span>
                    </div>
                </div>
            </div>
            <div class="highlight-box stack" style="justify-content:center; align-items:center;">
                <div id="video-container" hidden></div>
                <div id="wait-placeholder" class="muted" style="text-align:center">
                    <span style="font-size:40px">🕒</span>
                    <p>Live preview will appear when rendering finishes.</p>
                </div>
                <div id="actions" class="toolbar" style="margin-top:20px;"></div>
            </div>
        </div>
    </section>

    <section id="editor-section" class="panel" hidden style="background: linear-gradient(180deg, #fffcf8, #fff); border: 2px solid var(--brand); padding: 32px;">
        <div class="studio-header">
            <div>
                <span class="eyebrow" style="background:#fff7ee; color:var(--brand);">Video Production Studio</span>
                <h2>Planning & Timeline</h2>
                <p class="muted">Edit the narrator's script, swap visuals, or adjust the voice personality.</p>
            </div>
            <div class="row">
                <div class="metric-card" style="padding:10px 20px; border-radius:12px; background:white;">
                    <span class="muted" style="font-size:11px">ESTIMATED LENGTH</span>
                    <strong id="total-duration-display" style="font-size:18px">0s</strong>
                </div>
                <button id="confirm-render" class="button accent" style="height:56px; padding: 0 32px;">Confirm & Finalize Video</button>
            </div>
        </div>

        <div id="timeline-canvas">
            <!-- Scenes injected here -->
        </div>
    </section>

    <!-- Modals -->
    <div id="media-preview" onclick="this.style.display='none'">
        <div class="preview-box" onclick="event.stopPropagation()" id="preview-content"></div>
    </div>

    <div id="ai-modal">
        <div class="modal-body">
            <button class="close-btn" onclick="document.getElementById('ai-modal').style.display='none'">✕</button>
            <h3>✨ AI Creative Assistant</h3>
            <p class="muted">Tell the AI how to improve this scene (e.g., "Make it more exciting").</p>
            <textarea id="ai-instruction" placeholder="Enter instructions..." style="min-height:120px; margin-top:15px;"></textarea>
            <div class="row" style="margin-top:20px; justify-content:flex-end;">
                <button id="apply-ai" class="button">Improve Scene</button>
            </div>
        </div>
    </div>

    <div id="gallery-modal">
        <div class="modal-body" style="max-width: 800px;">
            <button class="close-btn" onclick="document.getElementById('gallery-modal').style.display='none'">✕</button>
            <h3>🖼️ Video Library</h3>
            <p class="muted">Pick a different video clip or image for this scene.</p>
            <div id="gallery-grid" class="asset-gallery" style="margin-top:20px; max-height:400px; overflow-y:auto;"></div>
        </div>
    </div>
    `;

    const script = `
        const jobId = ${JSON.stringify(jobId)};
        let scenes = [];
        let currentIdx = -1;
        let draggedIdx = -1;
        let currentJob = null;
        const audioPlayer = new Audio();
        let lastSceneHash = '';

        function escapeHtml(value) {
            return String(value)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;');
        }

        async function requestJson(url, options) {
            const response = await fetch(url, options);
            let payload = null;

            try {
                payload = await response.json();
            } catch (error) {
                throw new Error('Unexpected server response.');
            }

            if (!response.ok || !payload.success) {
                throw new Error(payload.error || payload.message || 'Request failed.');
            }

            return payload;
        }

        function setStatusMessage(data) {
            document.getElementById('title').textContent = data.title || 'Working on video...';
            document.getElementById('message').textContent = data.message || 'Check the progress or customize your scenes below.';
            document.getElementById('percent').textContent = data.progress + '%';
            document.getElementById('progress').style.width = data.progress + '%';
            document.getElementById('status-display').textContent = data.status;
        }

        function updateEditorState(data) {
            const editor = document.getElementById('editor-section');
            const confirmButton = document.getElementById('confirm-render');

            if (data.status === 'awaiting_review') {
                editor.hidden = false;
                confirmButton.disabled = false;
                confirmButton.textContent = 'Confirm & Finalize Video';
                loadScenes();
                return;
            }

            editor.hidden = true;
            confirmButton.disabled = true;
            if (data.status === 'pending' && data.phase === 'render') {
                confirmButton.textContent = 'Render Queued';
            } else if (data.status === 'processing' && data.phase === 'render') {
                confirmButton.textContent = 'Rendering Video...';
            } else if (data.status === 'cancelling') {
                confirmButton.textContent = 'Cancelling...';
            } else {
                confirmButton.textContent = 'Confirm & Finalize Video';
            }
        }

        function renderPrimaryActions(data) {
            const actions = document.getElementById('actions');
            actions.innerHTML = '';

            if (data.status === 'completed' && data.downloadUrl) {
                const downloadLink = document.createElement('a');
                downloadLink.className = 'button';
                downloadLink.href = data.downloadUrl;
                downloadLink.textContent = 'Download MP4';
                actions.appendChild(downloadLink);
            }

            if (data.canRetry) {
                const retryButton = document.createElement('button');
                retryButton.className = 'button';
                retryButton.textContent = 'Retry Job';
                retryButton.onclick = () => runJobAction('/retry', retryButton, 'Retrying...', 'Retry failed');
                actions.appendChild(retryButton);
            }

            if (data.canCancel) {
                const cancelButton = document.createElement('button');
                cancelButton.className = 'button secondary';
                cancelButton.textContent = 'Cancel Job';
                cancelButton.onclick = () => runJobAction('/cancel', cancelButton, 'Cancelling...', 'Cancel failed');
                actions.appendChild(cancelButton);
            }

            const newProjectLink = document.createElement('a');
            newProjectLink.className = data.status === 'completed' ? 'button secondary' : 'button ghost';
            newProjectLink.href = '/';
            newProjectLink.textContent = 'New Project';
            actions.appendChild(newProjectLink);
        }

        async function runJobAction(pathname, button, busyText, errorPrefix) {
            const original = button.textContent;
            button.disabled = true;
            button.textContent = busyText;

            try {
                await requestJson('/api/jobs/' + jobId + pathname, { method: 'POST' });
                await refresh();
            } catch (error) {
                alert(errorPrefix + ': ' + error.message);
                button.disabled = false;
                button.textContent = original;
            }
        }

        async function refresh() {
            try {
                const json = await requestJson('/api/jobs/' + jobId);
                currentJob = json.data;
                setStatusMessage(currentJob);
                updateEditorState(currentJob);
                renderPrimaryActions(currentJob);

                if (currentJob.status === 'completed' && currentJob.videoUrl && currentJob.downloadUrl) {
                    showVideo(currentJob.videoUrl, currentJob.downloadUrl);
                    window.clearInterval(timer);
                }
            } catch (error) {
                document.getElementById('message').textContent = 'Unable to refresh the job right now.';
                console.error('Refresh failed:', error);
            }
        }

        async function loadScenes() {
            try {
                const json = await requestJson(\`/api/jobs/\${jobId}/scenes\`);
                const hash = JSON.stringify(json.data);
                if (hash !== lastSceneHash) {
                    scenes = json.data;
                    lastSceneHash = hash;
                    renderTimeline();
                }
            } catch (error) {
                console.error('Failed to load scenes:', error);
            }
        }

        document.getElementById('confirm-render').onclick = async () => {
            const btn = document.getElementById('confirm-render');
            btn.disabled = true;
            btn.textContent = 'Starting Render...';

            try {
                await requestJson(\`/api/jobs/\${jobId}/confirm\`, { method: 'POST' });
                document.getElementById('editor-section').hidden = true;
                await refresh();
            } catch (error) {
                alert('Confirm failed: ' + error.message);
                btn.disabled = false;
                btn.textContent = 'Confirm & Finalize Video';
            }
        };

        function renderTimeline() {
            const canvas = document.getElementById('timeline-canvas');
            canvas.innerHTML = '';
            let total = 0;
            scenes.forEach((s, idx) => {
                total += (s.duration || 0);
                canvas.appendChild(createCard(s, idx));
            });
            document.getElementById('total-duration-display').textContent = total + 's';
        }

        audioPlayer.onerror = (e) => {
            console.error("Audio Player Error:", audioPlayer.error, "Source:", audioPlayer.src);
        };

        function createCard(scene, idx) {
            const card = document.createElement('div');
            card.className = 'scene-card';
            card.draggable = true;

            const tbn = scene.visual && scene.visual.localPath ? \`/api/fs/view?path=\${encodeURIComponent(scene.visual.localPath)}\` : '';
            const aud = scene.audioPath ? \`/api/fs/view?path=\${encodeURIComponent(scene.audioPath)}\` : '';
            const isVid = scene.visual && scene.visual.type === 'video';
            const vc = scene.voiceConfig || { pitch: 0, rate: 0 };

            console.log(\`[SCENE-\${idx+1}] Media URLs:\`, { tbn, aud });

            card.innerHTML = \`
                <div class="drag-handle">≡</div>
                <div class="stack">
                    <div class="row" style="justify-content:space-between; align-items:center;">
                        <span class="eyebrow" style="background:#fff; border-color:var(--line);">SCENE #\${idx + 1}</span>
                        <button class="button ghost small" onclick="openAI(\${idx})">✨ AI Assistant</button>
                    </div>
                    
                    <div class="scene-body">
                        <div class="media-focus">
                            <div class="scene-thumb-container" onclick="previewMedia('\${tbn}', \${isVid}, '\${aud}')">
                                <div class="thumb-overlay"><span style="font-size:32px">▶️</span></div>
                                \${tbn ? (isVid ? \`<video src="\${tbn}" muted loop onmouseenter="this.play()" onmouseleave="this.pause()" onerror="console.error('Video Error (Card) Scene \${idx+1}:', this.error)"></video>\` : \`<img src="\${tbn}" onerror="console.error('Image Error Scene \${idx+1}:', '\${tbn}')">\`) : '<div style="padding:40px; font-size:10px">No Visual</div>'}
                            </div>
                            <div class="row" style="gap:8px;">
                                <button class="button secondary small" onclick="playAudio('\${aud}', this)" style="flex:1; border-radius:8px">🔊 Listen to Voice</button>
                                <button class="action-icon-btn" onclick="openGallery(\${idx})" title="Swap Clip">🖼️</button>
                            </div>
                        </div>

                        <div class="content-focus">
                            <div class="field-group">
                                <label>What the narrator says</label>
                                <textarea class="scene-input-large" data-field="script">\${escapeHtml(scene.voiceoverText || '')}</textarea>
                            </div>
                            <div class="field-group">
                                <label>Video Clips & Keywords</label>
                                <input class="scene-input" data-field="keywords" value="\${escapeHtml((scene.searchKeywords || []).join(', '))}">
                            </div>
                        </div>
                    </div>

                    <div class="settings-bar">
                        <div class="voice-slider-group">
                            <label>Voice Tone (Deep ↔ High) <span>\${vc.pitch}Hz</span></label>
                            <input type="range" class="voice-pitch" min="-20" max="20" value="\${vc.pitch}">
                        </div>
                        <div class="voice-slider-group">
                            <label>Talking Speed (Slow ↔ Fast) <span>\${vc.rate}%</span></label>
                            <input type="range" class="voice-rate" min="-50" max="50" step="5" value="\${vc.rate}">
                        </div>
                        <div class="voice-slider-group">
                            <label>Time (Seconds)</label>
                            <input type="number" class="scene-duration" value="\${scene.duration}" style="padding:8px; border-radius:8px">
                        </div>
                        <div class="scene-actions">
                            <button class="button small save-btn">Save Changes</button>
                            <button class="action-icon-btn delete" onclick="deleteScene(\${idx})">🗑️</button>
                        </div>
                    </div>
                </div>
            \`;

            // Events
            card.querySelector('.save-btn').onclick = () => save(idx, card);
            card.addEventListener('dragstart', () => { draggedIdx = idx; card.classList.add('dragging'); });
            card.addEventListener('dragend', () => { draggedIdx = -1; card.classList.remove('dragging'); });
            card.addEventListener('dragover', (e) => e.preventDefault());
            card.addEventListener('drop', () => { if(draggedIdx !== idx) reorder(draggedIdx, idx); });

            return card;
        }

        async function playAudio(url, btn) {
            if (!url) return alert('Voice not ready yet. Save the scene first!');
            if (audioPlayer.src.includes(url) && !audioPlayer.paused) {
                audioPlayer.pause();
                btn.textContent = '🔊 Listen to Voice';
            } else {
                audioPlayer.src = url;
                audioPlayer.play();
                btn.textContent = '⏸ Pause Voice';
                audioPlayer.onended = () => btn.textContent = '🔊 Listen to Voice';
            }
        }

        async function save(idx, card) {
            card.classList.add('updating');
            const updates = {
                voiceoverText: card.querySelector('[data-field="script"]').value,
                searchKeywords: card.querySelector('[data-field="keywords"]').value.split(',').map(s => s.trim()).filter(Boolean),
                duration: parseInt(card.querySelector('.scene-duration').value, 10),
                voiceConfig: {
                    pitch: parseInt(card.querySelector('.voice-pitch').value, 10),
                    rate: parseInt(card.querySelector('.voice-rate').value, 10)
                }
            };

            try {
                const json = await requestJson(\`/api/jobs/\${jobId}/scenes/\${idx}\`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(updates)
                });
                scenes[idx] = json.data;
                renderTimeline();
            } catch (error) {
                alert('Save failed: ' + error.message);
            } finally {
                card.classList.remove('updating');
            }
        }

        function previewMedia(url, isVid, audioUrl) {
            const box = document.getElementById('preview-content');
            box.innerHTML = \`
                <div style="background:#000; display:flex; flex-direction:column; align-items:center;">
                    \${isVid ? \`<video src="\${url}" id="pv" style="width:100%"></video>\` : \`<img src="\${url}" style="width:100%">\`}
                    <audio src="\${audioUrl}" id="pa"></audio>
                    <div class="row" style="padding:20px; gap:20px; background:#111; width:100%; justify-content:center">
                        <button class="button" onclick="playPreview()">▶️ Play Scene</button>
                        <button class="button secondary" onclick="stopPreview()">⏹ Stop</button>
                    </div>
                </div>
            \`;
            document.getElementById('media-preview').style.display = 'flex';
        }

        window.playPreview = () => {
            const v = document.getElementById('pv');
            const a = document.getElementById('pa');
            if(v) v.play();
            if(a) a.play();
        };

        window.stopPreview = () => {
            const v = document.getElementById('pv');
            const a = document.getElementById('pa');
            if(v) { v.pause(); v.currentTime = 0; }
            if(a) { a.pause(); a.currentTime = 0; }
        };

        async function reorder(from, to) {
            try {
                const json = await requestJson(\`/api/jobs/\${jobId}/scenes/reorder\`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ fromIndex: from, toIndex: to })
                });
                scenes = json.data;
                renderTimeline();
            } catch (error) {
                alert('Reorder failed: ' + error.message);
            }
        }

        function showVideo(url, dl) {
            document.getElementById('wait-placeholder').hidden = true;
            const container = document.getElementById('video-container');
            container.hidden = false;
            container.innerHTML = '';
            const video = document.createElement('video');
            video.src = url;
            video.controls = true;
            video.className = 'video';
            container.appendChild(video);

            if (currentJob) {
                renderPrimaryActions(currentJob);
            }
        }

        function openAI(idx) { currentIdx = idx; document.getElementById('ai-modal').style.display='flex'; }
        function openGallery(idx) { currentIdx = idx; loadGallery(); }

        async function loadGallery() {
            try {
                const json = await requestJson('/api/fs/assets');
                const grid = document.getElementById('gallery-grid');
                grid.innerHTML = '';
                json.data.forEach(item => {
                    const div = document.createElement('div');
                    div.className = 'asset-item';
                    div.innerHTML = \`<img src="\${item.assetUrl}" class="asset-preview"><span class="tag-copy">\${escapeHtml(item.filename)}</span>\`;
                    div.onclick = () => swap(item.filename);
                    grid.appendChild(div);
                });
                document.getElementById('gallery-modal').style.display='flex';
            } catch (error) {
                alert('Gallery failed: ' + error.message);
            }
        }

        async function swap(file) {
            try {
                const json = await requestJson(\`/api/jobs/\${jobId}/scenes/\${currentIdx}\`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ localAsset: file })
                });
                scenes[currentIdx] = json.data;
                renderTimeline();
                document.getElementById('gallery-modal').style.display='none';
            } catch (error) {
                alert('Swap failed: ' + error.message);
            }
        }

        async function deleteScene(idx) {
            try {
                const json = await requestJson(\`/api/jobs/\${jobId}/scenes/\${idx}\`, {
                    method: 'DELETE'
                });
                scenes = json.data;
                renderTimeline();
            } catch (error) {
                alert('Delete failed: ' + error.message);
            }
        }

        document.getElementById('apply-ai').onclick = async () => {
            const btn = document.getElementById('apply-ai');
            const instr = document.getElementById('ai-instruction').value;
            btn.disabled = true; btn.textContent = 'Assistant thinking...';

            try {
                const json = await requestJson(\`/api/jobs/\${jobId}/scenes/\${currentIdx}/refine\`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ instruction: instr })
                });
                scenes[currentIdx] = json.data;
                renderTimeline();
                document.getElementById('ai-modal').style.display='none';
            } catch (error) {
                alert('AI refine failed: ' + error.message);
            } finally {
                btn.disabled = false; btn.textContent = 'Improve Scene';
            }
        };

        const timer = setInterval(refresh, 3000);
        refresh();
    `;

    return layout(
        `Production Studio | ${PROJECT_NAME}`,
        body,
        {
            robots: 'noindex, nofollow',
            cspNonce,
        },
        script
    );
}
