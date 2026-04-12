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
        .job-progress-shell { display:grid; gap:12px; }
        .job-progress-meta { display:flex; justify-content:space-between; align-items:center; font-weight:700; color:var(--muted); font-size:14px; }
        .job-progress-meta strong { color: var(--ink); }
        .job-progress-label { color: var(--brand); font-weight: 800; }
        
        .studio-header { 
            margin-bottom: 40px; 
            display: flex; 
            justify-content: space-between; 
            align-items: flex-end; 
            padding: 0 8px;
        }
        .studio-header h2 { margin: 0; font-size: 2.5rem; letter-spacing: -0.04em; }
        
        #timeline-canvas { display: grid; gap: 32px; padding-bottom: 60px; }

        .scene-card {
            background: var(--surface);
            border: 1px solid var(--line);
            border-radius: var(--radius-xl);
            padding: 32px;
            display: grid;
            grid-template-columns: 48px 1fr;
            gap: 24px;
            box-shadow: var(--shadow-lg);
            transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
            position: relative;
        }
        .scene-card:hover { 
            border-color: var(--brand); 
            transform: translateY(-4px); 
            box-shadow: var(--shadow-xl); 
        }
        .scene-card.dragging { opacity: 0.2; border: 2px dashed var(--brand); }
        .scene-card.updating { opacity: 0.5; pointer-events: none; }

        .drag-handle { 
            cursor: grab; 
            display: flex; 
            align-items: center; 
            justify-content: center; 
            color: var(--line-strong); 
            font-size: 24px;
            transition: color 0.2s;
        }
        .scene-card:hover .drag-handle { color: var(--brand); }

        /* 2-Column Scene Body */
        .scene-body { display: grid; grid-template-columns: 360px 1fr; gap: 40px; }
        
        /* Media Section (Left) */
        .media-focus { display: flex; flex-direction: column; gap: 16px; }
        .scene-thumb-container {
            width: 100%; 
            aspect-ratio: 16/9; 
            border-radius: var(--radius-lg); 
            overflow: hidden;
            position: relative; 
            border: 1px solid var(--line); 
            background: var(--surface-soft);
            box-shadow: var(--shadow-sm);
        }
        .scene-thumb-container img, .scene-thumb-container video { width: 100%; height: 100%; object-fit: cover; }
        .thumb-overlay { 
            position: absolute; 
            inset: 0; 
            background: rgba(0,0,0,0.4); 
            display: flex; 
            align-items: center; 
            justify-content: center;
            opacity: 0; 
            transition: opacity 0.3s; 
            cursor: pointer;
            backdrop-filter: blur(4px);
        }
        .scene-thumb-container:hover .thumb-overlay { opacity: 1; }

        /* Content Section (Right) */
        .content-focus { display: flex; flex-direction: column; gap: 24px; }
        .field-group { display: flex; flex-direction: column; gap: 8px; }
        .field-group label { 
            font-size: 11px; 
            font-weight: 800; 
            text-transform: uppercase; 
            color: var(--brand); 
            letter-spacing: 0.1em; 
        }
        
        .scene-input-large { 
            min-height: 120px; 
            padding: 16px; 
            border-radius: var(--radius-md); 
            font-size: 15px; 
            line-height: 1.6;
            background: var(--surface); 
            border: 1px solid var(--line); 
            color: var(--ink);
            transition: all 0.2s;
        }
        .scene-input-large:focus {
            border-color: var(--brand);
            box-shadow: 0 0 0 4px var(--brand-soft);
            outline: none;
        }

        /* Settings Bar (Bottom) */
        .settings-bar {
            grid-column: 1 / -1; 
            margin-top: 20px; 
            padding-top: 32px;
            border-top: 1px solid var(--line); 
            display: grid; 
            grid-template-columns: 1.2fr 1.2fr 180px auto; 
            gap: 40px; 
            align-items: start;
        }

        .voice-slider-group { display: flex; flex-direction: column; gap: 10px; }
        .voice-slider-group label { 
            font-size: 12px; 
            font-weight: 700; 
            color: var(--muted); 
            display: flex; 
            justify-content: space-between; 
            align-items: center;
        }
        .voice-slider-group label span {
            background: var(--brand-soft);
            color: var(--brand);
            padding: 2px 8px;
            border-radius: 6px;
            font-size: 11px;
        }
        
        /* Interaction Buttons */
        .scene-actions { display: flex; gap: 16px; align-items: center; }
        .action-icon-btn { 
            background: var(--surface); 
            border: 1px solid var(--line); 
            border-radius: var(--radius-md); 
            width: 48px; 
            height: 48px; 
            display: flex; 
            align-items: center; 
            justify-content: center; 
            cursor: pointer; 
            transition: all 0.2s;
            font-size: 20px;
        }
        .action-icon-btn:hover { 
            border-color: var(--brand); 
            color: var(--brand); 
            background: var(--brand-soft);
            transform: translateY(-1px);
        }
        .action-icon-btn.delete:hover { 
            border-color: var(--error); 
            color: var(--error); 
            background: rgba(239, 68, 68, 0.1); 
        }

        .save-btn {
            background: var(--brand);
            color: white;
            padding: 12px 24px;
            border-radius: var(--radius-md);
            font-weight: 700;
            border: none;
            cursor: pointer;
            transition: all 0.2s;
            box-shadow: var(--shadow);
        }
        .save-btn:hover {
            background: var(--brand-strong);
            transform: translateY(-1px);
            box-shadow: var(--shadow-lg);
        }

        /* Modal Redesign */
        #media-preview, #ai-modal, #gallery-modal {
            position: fixed; top: 0; left: 0; width: 100%; height: 100%; 
            background: rgba(2, 6, 23, 0.85); 
            backdrop-filter: blur(12px); 
            z-index: 5000; 
            display: none; 
            align-items: center; 
            justify-content: center; 
            padding: 40px;
        }
        .preview-box { 
            background: #000; 
            border-radius: var(--radius-xl); 
            overflow: hidden; 
            max-width: 90vw; 
            box-shadow: var(--shadow-xl);
        }
        .modal-body { 
            background: var(--surface); 
            padding: 40px; 
            border-radius: var(--radius-xl); 
            width: 100%; 
            max-width: 550px; 
            position: relative; 
            box-shadow: var(--shadow-xl);
            border: 1px solid var(--line);
        }
        .close-btn {
            position: absolute;
            top: 24px;
            right: 24px;
            width: 36px;
            height: 36px;
            border-radius: 50%;
            border: 1px solid var(--line);
            background: var(--surface-soft);
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.2s;
        }
        .close-btn:hover {
            background: var(--line);
            transform: rotate(90deg);
        }
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
                    <p id="error-detail" class="muted" style="display:none; color:#b45309; font-weight:600;"></p>
                </div>
                <div class="job-progress-shell">
                    <div class="job-progress-meta">
                        <span>Job progress</span>
                        <strong id="progress-label" class="job-progress-label">0%</strong>
                    </div>
                    <div class="bar"><div id="progress"></div></div>
                </div>
                <div class="metric-grid">
                    <div class="metric-card">
                        <strong id="percent">0%</strong>
                        <span class="muted">overall progress</span>
                    </div>
                    <div class="metric-card">
                        <strong id="status-display">queued</strong>
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

    <section id="editor-section" class="panel glass" hidden style="border: 2px solid var(--brand); padding: 48px; margin-top: 40px">
        <div class="studio-header">
            <div>
                <span class="eyebrow">Video Production Studio</span>
                <h2 style="margin-top:12px">Planning & Timeline</h2>
                <p class="muted">Edit the narrator's script, swap visuals, or adjust the voice personality.</p>
            </div>
            <div class="row" style="gap:24px">
                <div class="metric-card" style="padding:12px 24px; border-radius:var(--radius-md); background:var(--surface);">
                    <span class="muted" style="font-size:11px; text-transform:uppercase; letter-spacing:0.05em">ESTIMATED LENGTH</span>
                    <strong id="total-duration-display" style="font-size:22px; margin:0">0s</strong>
                </div>
                <button id="confirm-render" class="button" style="height:64px; padding: 0 40px; font-size:16px; font-weight:800; border-radius:var(--radius-lg)">Confirm & Finalize Video</button>
            </div>
        </div>

        <div id="timeline-canvas">
            <!-- Scenes injected here -->
        </div>
    </section>

    <!-- Modals -->
    <div id="media-preview">
        <div class="preview-box" id="preview-content"></div>
    </div>

    <div id="ai-modal">
        <div class="modal-body">
            <button class="close-btn" id="close-ai-modal">✕</button>
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
            <button class="close-btn" id="close-gallery-modal">✕</button>
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
            const progressValue = Math.max(0, Math.min(100, Number(data.progress) || 0));
            document.getElementById('title').textContent = data.title || 'Working on video...';
            document.getElementById('message').textContent = data.message || 'Check the progress or customize your scenes below.';
            document.getElementById('percent').textContent = progressValue + '%';
            document.getElementById('progress-label').textContent = progressValue + '%';
            document.getElementById('progress').style.width = progressValue + '%';
            document.getElementById('status-display').textContent = formatStageLabel(data);
            const errorDetail = document.getElementById('error-detail');
            if (data.error) {
                errorDetail.style.display = 'block';
                errorDetail.textContent = 'Latest issue: ' + data.error;
            } else {
                errorDetail.style.display = 'none';
                errorDetail.textContent = '';
            }
        }

        function formatStageLabel(data) {
            if (data.status === 'completed') return 'completed';
            if (data.status === 'failed') return 'failed';
            if (data.status === 'cancelled') return 'cancelled';
            if (data.status === 'cancelling') return 'cancelling';
            if (data.status === 'awaiting_review') return 'review';
            if (data.phase === 'render') return 'rendering';
            if (data.phase === 'generate') return data.status === 'pending' ? 'queued' : 'generating';
            return data.status || 'pending';
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
                retryButton.addEventListener('click', () => runJobAction('/retry', retryButton, 'Retrying...', 'Retry failed'));
                actions.appendChild(retryButton);
            }

            if (data.canCancel) {
                const cancelButton = document.createElement('button');
                cancelButton.className = 'button secondary';
                cancelButton.textContent = 'Cancel Job';
                cancelButton.addEventListener('click', () => runJobAction('/cancel', cancelButton, 'Cancelling...', 'Cancel failed'));
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
                refreshActions(currentJob);

                if (currentJob.status === 'completed' && currentJob.videoUrl && currentJob.downloadUrl) {
                    showVideo(currentJob.videoUrl, currentJob.downloadUrl);
                    window.clearInterval(timer);
                }
            } catch (error) {
                console.error('Refresh failed:', error);
            }
        }

        function refreshActions(data) {
             renderPrimaryActions(data);
        }

        async function loadScenes() {
            try {
                const json = await requestJson('/api/jobs/' + jobId + '/scenes');
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

        document.getElementById('confirm-render').addEventListener('click', async () => {
            const btn = document.getElementById('confirm-render');
            btn.disabled = true;
            btn.textContent = 'Starting Render...';

            try {
                await requestJson('/api/jobs/' + jobId + '/confirm', { method: 'POST' });
                document.getElementById('editor-section').hidden = true;
                await refresh();
            } catch (error) {
                alert('Confirm failed: ' + error.message);
                btn.disabled = false;
                btn.textContent = 'Confirm & Finalize Video';
            }
        });

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

            const tbn = scene.visual && scene.visual.localPath ? '/api/fs/view?path=' + encodeURIComponent(scene.visual.localPath) : '';
            const aud = scene.audioPath ? '/api/fs/view?path=' + encodeURIComponent(scene.audioPath) : '';
            const isVid = scene.visual && scene.visual.type === 'video';
            const vc = scene.voiceConfig || { pitch: 0, rate: 0 };

            let thumbHtml = '';
            if (tbn) {
               if (isVid) {
                   thumbHtml = '<video src="' + tbn + '" muted loop></video>';
               } else {
                   thumbHtml = '<img src="' + tbn + '">';
               }
            } else {
               thumbHtml = '<div style="padding:40px; font-size:10px">No Visual</div>';
            }

            card.innerHTML = 
                '<div class="drag-handle">≡</div>' +
                '<div class="stack">' +
                    '<div class="row" style="justify-content:space-between; align-items:center;">' +
                        '<span class="eyebrow" style="background:#fff; border-color:var(--line);">SCENE #' + (idx + 1) + '</span>' +
                        '<button class="button ghost small trigger-ai" data-idx="' + idx + '">✨ AI Assistant</button>' +
                    '</div>' +
                    
                    '<div class="scene-body">' +
                        '<div class="media-focus">' +
                            '<div class="scene-thumb-container trigger-preview">' +
                                '<div class="thumb-overlay"><span style="font-size:32px">▶️</span></div>' +
                                thumbHtml +
                            '</div>' +
                            '<div class="row" style="gap:8px;">' +
                                '<button class="button secondary small trigger-audio" style="flex:1; border-radius:8px">🔊 Listen to Voice</button>' +
                                '<button class="action-icon-btn trigger-gallery" title="Swap Clip">🖼️</button>' +
                            '</div>' +
                        '</div>' +

                        '<div class="content-focus">' +
                            '<div class="field-group">' +
                                '<label>What the narrator says</label>' +
                                '<textarea class="scene-input-large" data-field="script">' + escapeHtml(scene.voiceoverText || '') + '</textarea>' +
                            '</div>' +
                            '<div class="field-group">' +
                                '<label>Video Clips & Keywords</label>' +
                                '<input class="scene-input" data-field="keywords" value="' + escapeHtml((scene.searchKeywords || []).join(', ')) + '">' +
                            '</div>' +
                        '</div>' +
                    '</div>' +

                    '<div class="settings-bar">' +
                        '<div class="voice-slider-group">' +
                            '<label>Voice Tone (Deep ↔ High) <span>' + vc.pitch + 'Hz</span></label>' +
                            '<input type="range" class="voice-pitch" min="-20" max="20" value="' + vc.pitch + '">' +
                        '</div>' +
                        '<div class="voice-slider-group">' +
                            '<label>Talking Speed (Slow ↔ Fast) <span>' + vc.rate + '%</span></label>' +
                            '<input type="range" class="voice-rate" min="-50" max="50" step="5" value="' + vc.rate + '">' +
                        '</div>' +
                        '<div class="voice-slider-group">' +
                            '<label>Time (Seconds)</label>' +
                            '<input type="number" class="scene-duration" value="' + scene.duration + '" style="padding:8px; border-radius:8px">' +
                        '</div>' +
                        '<div class="scene-actions">' +
                            '<button class="button small save-btn">Save Changes</button>' +
                            '<button class="action-icon-btn delete trigger-delete">🗑️</button>' +
                        '</div>' +
                    '</div>' +
                '</div>';

            // Hover effects for video
            const vid = card.querySelector('video');
            if (vid) {
                card.querySelector('.scene-thumb-container').addEventListener('mouseenter', () => vid.play());
                card.querySelector('.scene-thumb-container').addEventListener('mouseleave', () => vid.pause());
            }

            // Click events
            card.querySelector('.trigger-ai').addEventListener('click', () => openAI(idx));
            card.querySelector('.trigger-preview').addEventListener('click', () => previewMedia(tbn, isVid, aud));
            card.querySelector('.trigger-audio').addEventListener('click', (e) => playAudio(aud, e.currentTarget));
            card.querySelector('.trigger-gallery').addEventListener('click', () => openGallery(idx));
            card.querySelector('.trigger-delete').addEventListener('click', () => deleteScene(idx));
            card.querySelector('.save-btn').addEventListener('click', () => save(idx, card));

            // Drag Events
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
                const json = await requestJson('/api/jobs/' + jobId + '/scenes/' + idx, {
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
            
            let previewHtml = '';
            if (isVid) {
                previewHtml = '<video src="' + url + '" id="pv" style="width:100%"></video>';
            } else {
                previewHtml = '<img src="' + url + '" style="width:100%">';
            }

            box.innerHTML = 
                '<div style="background:#000; display:flex; flex-direction:column; align-items:center;">' +
                    previewHtml +
                    '<audio src="' + audioUrl + '" id="pa"></audio>' +
                    '<div class="row" style="padding:20px; gap:20px; background:#111; width:100%; justify-content:center">' +
                        '<button class="button" id="start-preview-btn">▶️ Play Scene</button>' +
                        '<button class="button secondary" id="stop-preview-btn">⏹ Stop</button>' +
                    '</div>' +
                '</div>';
            
            document.getElementById('start-preview-btn').addEventListener('click', () => {
                const v = document.getElementById('pv');
                const a = document.getElementById('pa');
                if(v) v.play();
                if(a) a.play();
            });
            
            document.getElementById('stop-preview-btn').addEventListener('click', () => {
                const v = document.getElementById('pv');
                const a = document.getElementById('pa');
                if(v) { v.pause(); v.currentTime = 0; }
                if(a) { a.pause(); a.currentTime = 0; }
            });

            document.getElementById('media-preview').style.display = 'flex';
        }

        document.getElementById('media-preview').addEventListener('click', (e) => {
            if (e.target.id === 'media-preview') {
                e.target.style.display = 'none';
            }
        });

        document.getElementById('close-ai-modal').addEventListener('click', () => {
            document.getElementById('ai-modal').style.display = 'none';
        });

        document.getElementById('close-gallery-modal').addEventListener('click', () => {
            document.getElementById('gallery-modal').style.display = 'none';
        });

        async function reorder(from, to) {
            try {
                const json = await requestJson('/api/jobs/' + jobId + '/scenes/reorder', {
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
                    div.innerHTML = '<img src="' + item.assetUrl + '" class="asset-preview"><span class="tag-copy">' + escapeHtml(item.filename) + '</span>';
                    div.addEventListener('click', () => swap(item.filename));
                    grid.appendChild(div);
                });
                document.getElementById('gallery-modal').style.display='flex';
            } catch (error) {
                alert('Gallery failed: ' + error.message);
            }
        }

        async function swap(file) {
            try {
                const json = await requestJson('/api/jobs/' + jobId + '/scenes/' + currentIdx, {
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
            if (!confirm('Are you sure you want to delete this scene?')) return;
            try {
                const json = await requestJson('/api/jobs/' + jobId + '/scenes/' + idx, {
                    method: 'DELETE'
                });
                scenes = json.data;
                renderTimeline();
            } catch (error) {
                alert('Delete failed: ' + error.message);
            }
        }

        document.getElementById('apply-ai').addEventListener('click', async () => {
            const btn = document.getElementById('apply-ai');
            const instr = document.getElementById('ai-instruction').value;
            btn.disabled = true; btn.textContent = 'Assistant thinking...';

            try {
                const json = await requestJson('/api/jobs/' + jobId + '/scenes/' + currentIdx + '/refine', {
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
        });

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
