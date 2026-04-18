import { Request } from 'express';
import { layout } from './layout.view';
import { absoluteUrl } from '../shared/http/public-url';
import { PROJECT_NAME, DEFAULT_SITE_DESCRIPTION, DEFAULT_SITE_KEYWORDS } from '../constants/config';
import { browserModalComponent } from './home/components/browser-modal.component';

export function videoDownloadPage(req: Request, cspNonce?: string): string {
    const body = `
        <header class="hero-surface" style="margin-bottom: 24px; padding: 32px;">
            <div class="stack" style="gap: 12px;">
                <div class="eyebrow"><i data-lucide="download" style="width:14px;height:14px;"></i> Asset Downloader</div>
                <h1>Video Download <span style="color: var(--brand);">AI</span></h1>
                <p class="lead">Enter your script below. Our AI will analyze the scenes, generate search keywords, and download high-quality stock videos and images for you.</p>
            </div>
        </header>

        <div class="studio-grid">
            <!-- Left Column: Input -->
            <div class="panel stack" style="grid-column: span 1;">
                <div class="panel-head">
                    <div class="stack" style="gap:4px;">
                        <h3>1. Your Script</h3>
                        <p class="field-help">Write or paste the script you want to find assets for.</p>
                    </div>
                </div>

                <div class="field">
                    <textarea id="download-script" placeholder="Example: A futuristic city with flying cars and blue neon lights. People walking in the rain." style="min-height: 350px;"></textarea>
                </div>

                <div class="field-grid two-up">
                    <div class="field">
                        <label>Orientation</label>
                        <select id="download-orientation">
                            <option value="portrait" selected>Portrait (9:16)</option>
                            <option value="landscape">Landscape (16:9)</option>
                        </select>
                    </div>
                    <div class="field">
                        <label>Media Source</label>
                        <select id="download-source">
                            <option value="all" selected>All (Pexels + Pixabay)</option>
                            <option value="pexels">Pexels Only</option>
                            <option value="pixabay">Pixabay Only</option>
                        </select>
                    </div>
                </div>

                <button id="process-download" class="button" style="width: 100%;">
                    <i data-lucide="sparkles"></i> Analyze & Download Media
                </button>
            </div>

            <!-- Right Column: Results -->
            <div class="panel stack" style="grid-column: span 2;">
                <div class="panel-head">
                    <div class="stack" style="gap:4px;">
                        <h3>2. Assets Processed</h3>
                        <p class="field-help">Results will appear here after analysis.</p>
                    </div>
                    <div id="processing-status" class="status-chip" style="display:none;">
                        <i data-lucide="loader-2" class="spin" style="width:14px;height:14px;margin-right:6px;"></i> Processing...
                    </div>
                </div>

                <div id="download-results" class="stack" style="gap: 20px;">
                    <div class="empty-state" style="text-align: center; padding: 60px 20px;">
                        <i data-lucide="image" style="width: 48px; height: 48px; color: var(--muted); margin-bottom: 16px;"></i>
                        <h3 class="muted">Waiting for script analysis</h3>
                        <p class="muted">Enter your script on the left and click the button to start.</p>
                    </div>
                </div>
            </div>
        </div>

        <!-- NEW: Social Media Downloader Section -->
        <div class="panel stack" style="margin-top: 24px;">
            <div class="panel-head">
                <div class="stack" style="gap:4px;">
                    <h3><i data-lucide="share-2" style="width:18px;height:18px;vertical-align:middle;margin-right:8px;"></i> Method 2: Social Media Downloader</h3>
                    <p class="field-help">Download videos from YouTube, Instagram, Twitter/X, and more by pasting the URL.</p>
                </div>
            </div>

            <div class="field-grid" style="grid-template-columns: 1fr 200px auto;">
                <div class="field">
                    <input type="text" id="social-url" placeholder="https://www.youtube.com/watch?v=..." style="padding: 14px;">
                </div>
                <div class="field">
                    <select id="social-mode" style="height: 48px;">
                        <option value="both" selected>Video + Audio</option>
                        <option value="video">Video Only</option>
                        <option value="audio">Audio Only</option>
                    </select>
                </div>
                <button id="process-social" class="button" style="height: 48px;">
                    <i data-lucide="download-cloud"></i> Download
                </button>
            </div>

            <div id="social-results" class="stack" style="margin-top: 10px;">
                <!-- Social results will appear here -->
            </div>
            
            <div id="social-status" class="status-chip" style="display:none; width: fit-content;">
                <i data-lucide="loader-2" class="spin" style="width:14px;height:14px;margin-right:6px;"></i> <span id="social-status-text">Processing...</span>
            </div>
        </div>

        ${browserModalComponent()}

        <style>
            .spin { animation: spin 2s linear infinite; }
            @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
            
            .scene-result-card {
                background: var(--surface-soft);
                border: 1px solid var(--line);
                border-radius: var(--radius-lg);
                padding: 20px;
                display: grid;
                grid-template-columns: 180px 1fr;
                gap: 20px;
            }
            .scene-preview-container {
                width: 180px;
                aspect-ratio: 9/16;
                border-radius: var(--radius-md);
                background: #000;
                overflow: hidden;
                position: relative;
            }
            .scene-preview-container.landscape { aspect-ratio: 16/9; }
            .scene-preview-container img, .scene-preview-container video {
                width: 100%;
                height: 100%;
                object-fit: cover;
            }
            .scene-info { display: flex; flex-direction: column; gap: 10px; }
            .keyword-tag {
                display: inline-flex;
                padding: 4px 10px;
                background: var(--brand-soft);
                color: var(--brand);
                border-radius: 6px;
                font-size: 12px;
                font-weight: 600;
                margin-right: 6px;
                margin-bottom: 6px;
            }

            .browser-modal { display:none; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.8); z-index:1000; align-items:center; justify-content:center; padding: 20px; }
            .browser-modal.open { display:flex; }
            .browser-content { background:var(--surface); border:1px solid var(--line); border-radius:12px; display:grid; grid-template-columns: 240px 1fr; width:1000px; max-width:100%; height:600px; overflow:hidden; }
            .browser-sidebar { background:var(--bg); border-right:1px solid var(--line); padding:20px; display:flex; flex-direction:column; gap:20px; }
            .sidebar-title { font-size:11px; font-weight:700; color:var(--muted); text-transform:uppercase; margin-bottom:10px; }
            .sidebar-item { padding:8px 12px; border-radius:6px; font-size:14px; cursor:pointer; display:flex; gap:10px; align-items:center; transition:0.2s; }
            .sidebar-item:hover { background:var(--brand-soft); color:var(--brand); }
            .browser-main { display:flex; flex-direction:column; }
            .browser-header { padding:16px 20px; border-bottom:1px solid var(--line); display:flex; justify-content:space-between; align-items:center; }
            .browser-path-wrapper { padding:10px 20px; border-bottom:1px solid var(--line); background:var(--bg); display:flex; }
            .browser-path { flex:1; background:transparent; border:none; color:var(--fg); font-size:13px; font-family:var(--font-mono); }
            .browser-list { flex:1; overflow-y:auto; padding:10px; display:grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap:10px; align-content:start; }
            .browser-item { padding:12px; border-radius:8px; border:1px solid transparent; text-align:center; transition:0.2s; cursor:pointer; }
            .browser-item:hover { background:var(--surface-soft); border-color:var(--line); }
            .browser-icon { display:block; font-size:24px; margin-bottom:8px; }
            .browser-name { display:block; font-size:12px; font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
            .browser-size { display:block; font-size:10px; color:var(--muted); }
            .browser-footer { padding:16px 20px; border-top:1px solid var(--line); display:flex; justify-content:space-between; }
        </style>

        <script nonce="${cspNonce}">
            (function() {
                const btn = document.getElementById('process-download');
                const scriptInput = document.getElementById('download-script');
                const orientationSelect = document.getElementById('download-orientation');
                const sourceSelect = document.getElementById('download-source');
                const resultsContainer = document.getElementById('download-results');
                const statusIndicator = document.getElementById('processing-status');

                if (!btn) {
                    console.error('[VIDEO-DOWNLOAD] Process button not found!');
                    return;
                }

                btn.addEventListener('click', async () => {
                    const script = scriptInput.value.trim();
                    if (!script) {
                        alert('Please enter a script first.');
                        return;
                    }

                    console.log('[VIDEO-DOWNLOAD] Starting analysis for script:', script.substring(0, 50) + '...');
                    btn.disabled = true;
                    statusIndicator.style.display = 'inline-flex';
                    resultsContainer.innerHTML = '<div class="stack" style="text-align:center;padding:40px;"><div class="spin" style="font-size:32px;margin-bottom:12px;">⏳</div><h3>AI is analyzing your script...</h3><p class="muted">Fetching best matching assets from stock libraries.</p></div>';

                    try {
                        const response = await fetch('/api/video-download/process', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                script,
                                orientation: orientationSelect.value,
                                source: sourceSelect.value
                            })
                        });

                        const result = await response.json();
                        console.log('[VIDEO-DOWNLOAD] API Response:', result);
                        
                        if (result.success) {
                            renderResults(result.data, orientationSelect.value);
                        } else {
                            resultsContainer.innerHTML = '<div class="status error">Error: ' + result.error + '</div>';
                        }
                    } catch (err) {
                        resultsContainer.innerHTML = '<div class="status error">Failed to process request. Check console for details.</div>';
                        console.error('[VIDEO-DOWNLOAD] Fetch error:', err);
                    } finally {
                        btn.disabled = false;
                        statusIndicator.style.display = 'none';
                    }
                });

                // --- Social Media Downloader Logic ---
                const socialBtn = document.getElementById('process-social');
                const socialUrl = document.getElementById('social-url');
                const socialMode = document.getElementById('social-mode');
                const socialResults = document.getElementById('social-results');
                const socialStatus = document.getElementById('social-status');
                const socialStatusText = document.getElementById('social-status-text');

                // Browser Modal Refs
                const browserModal = document.getElementById('browser-modal');
                const browserList = document.getElementById('browser-list');
                const browserPathInput = document.getElementById('browser-path');
                const browserGoBtn = document.getElementById('browser-go-btn');
                const browserUpBtn = document.getElementById('browser-up-btn');
                const browserCloseBtn = document.getElementById('browser-close-btn');
                const browserCancelBtn = document.getElementById('browser-cancel-btn');
                const quickAccessList = document.getElementById('quick-access-list');
                const drivesList = document.getElementById('drives-list');
                const browserTitle = document.getElementById('browser-title');

                let currentVideoToSave = null;
                let currentParentPath = '';

                if (socialBtn) {
                    console.log('[SOCIAL-DOWNLOAD] Controller initialized.');
                    socialBtn.addEventListener('click', async () => {
                        const url = socialUrl.value.trim();
                        if (!url) {
                            alert('Please enter a video URL.');
                            return;
                        }

                        console.log('[SOCIAL-DOWNLOAD] User requested download for URL:', url);
                        socialBtn.disabled = true;
                        socialStatus.style.display = 'inline-flex';
                        socialStatusText.innerText = 'Initializing engine...';
                        socialResults.innerHTML = '';

                        try {
                            console.log('[SOCIAL-DOWNLOAD] Calling API /api/social-download/process with mode:', socialMode.value);
                            const response = await fetch('/api/social-download/process', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ url, mode: socialMode.value })
                            });

                            if (!response.ok) {
                                throw new Error('Server responded with ' + response.status + ': ' + response.statusText);
                            }

                            const result = await response.json();
                            console.log('[SOCIAL-DOWNLOAD] API response received:', result);
                            
                            if (result.success) {
                                currentVideoToSave = result.data.absolutePath;
                                console.log('[SOCIAL-DOWNLOAD] Success! Filename:', result.data.filename);
                                socialResults.innerHTML = '<div class="status success stack" style="gap: 12px; padding: 20px;">' +
                                    '<div class="row" style="justify-content: space-between; align-items: center;">' +
                                        '<div>' +
                                            '<h4 style="margin:0;">✅ Download Success!</h4>' +
                                            '<p style="margin:4px 0 0; font-size: 14px; color: var(--muted);">' + result.data.filename + '</p>' +
                                        '</div>' +
                                        '<div class="row" style="gap: 8px;">' +
                                            '<button id="save-to-folder-btn" class="button secondary small">' +
                                                '<i data-lucide="folder" style="width:14px;height:14px;margin-right:4px;"></i> Save to Local Folder' +
                                            '</button>' +
                                            '<a href="' + result.data.localPath + '" download class="button small">' +
                                                '<i data-lucide="download" style="width:14px;height:14px;margin-right:4px;"></i> Download to Device' +
                                            '</a>' +
                                        '</div>' +
                                    '</div>' +
                                    '<div class="video-stage" style="background: #000; border-radius: var(--radius-md); overflow: hidden; display: flex; justify-content: center;">' +
                                        '<video src="' + result.data.localPath + '" controls style="max-height: 400px; max-width: 100%;"></video>' +
                                    '</div>' +
                                '</div>';

                                document.getElementById('save-to-folder-btn')?.addEventListener('click', () => {
                                    openFolderBrowser();
                                });

                            } else {
                                console.warn('[SOCIAL-DOWNLOAD] API reported failure:', result.error);
                                socialResults.innerHTML = '<div class="status error">Error: ' + result.error + '</div>';
                            }
                        } catch (err) {
                            console.error('[SOCIAL-DOWNLOAD] Exception during process:', err);
                            socialResults.innerHTML = '<div class="status error">Failed to download video. ' + err.message + '</div>';
                        } finally {
                            socialBtn.disabled = false;
                            socialStatus.style.display = 'none';
                            if (typeof lucide !== 'undefined') lucide.createIcons();
                        }
                    });
                } else {
                    console.error('[SOCIAL-DOWNLOAD] Button "process-social" not found in DOM.');
                }

                // --- Browser Logic ---
                function openFolderBrowser() {
                    browserModal.classList.add('open');
                    browserTitle.innerText = 'Select Destination Folder';
                    loadSidebar();
                    loadPath(browserPathInput.value || '');
                    
                    // Add "Select This Folder" button if not exists
                    if (!document.getElementById('browser-select-folder-btn')) {
                        const footer = document.querySelector('.browser-footer');
                        const selectBtn = document.createElement('button');
                        selectBtn.type = 'button';
                        selectBtn.id = 'browser-select-folder-btn';
                        selectBtn.className = 'button primary';
                        selectBtn.innerText = 'Select This Folder';
                        selectBtn.style.marginLeft = 'auto';
                        selectBtn.addEventListener('click', onSelectFolder);
                        footer.appendChild(selectBtn);
                    }
                }

                function closeBrowser() {
                    browserModal.classList.remove('open');
                }

                async function onSelectFolder() {
                    const targetDir = browserPathInput.value;
                    if (!targetDir) return;

                    try {
                        const res = await fetch('/api/fs/save-to', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                sourcePath: currentVideoToSave,
                                targetDirectory: targetDir
                            })
                        });
                        const json = await res.json();
                        if (json.success) {
                            alert('Success! Video saved to:\\n' + json.targetPath);
                            closeBrowser();
                        } else {
                            alert('Error: ' + json.error);
                        }
                    } catch (e) {
                        alert('Failed to save video: ' + e.message);
                    }
                }

                browserCloseBtn?.addEventListener('click', closeBrowser);
                browserCancelBtn?.addEventListener('click', closeBrowser);
                browserGoBtn?.addEventListener('click', () => loadPath(browserPathInput.value));
                browserUpBtn?.addEventListener('click', () => loadPath(currentParentPath));
                
                [quickAccessList, drivesList].forEach(list => {
                    list?.addEventListener('click', (e) => {
                        const item = e.target.closest('.sidebar-item');
                        if (item && item.dataset.path) {
                            loadPath(item.dataset.path);
                        }
                    });
                });

                browserList?.addEventListener('click', (e) => {
                    const item = e.target.closest('.browser-item');
                    if (!item) return;
                    if (item.dataset.isDir === 'true') {
                        loadPath(item.dataset.path);
                    }
                });

                async function loadSidebar() {
                    try {
                        const hRes = await fetch('/api/fs/home');
                        const hJson = await hRes.json();
                        if (hJson.success) {
                            const h = hJson.data;
                            const items = [
                                { name: 'Home', path: h.home, icon: '🏠' },
                                { name: 'Desktop', path: h.desktop, icon: '🖥️' },
                                { name: 'Downloads', path: h.downloads, icon: '⬇️' },
                                { name: 'Videos', path: h.videos, icon: '🎬' }
                            ];
                            quickAccessList.innerHTML = items.map(i => 
                                '<div class="sidebar-item" data-path="' + i.path.replace(/\\\\/g, '\\\\\\\\') + '"><span>' + i.icon + '</span> ' + i.name + '</div>'
                            ).join('');
                        }
                        const dRes = await fetch('/api/fs/drives');
                        const dJson = await dRes.json();
                        if (dJson.success) {
                            drivesList.innerHTML = dJson.data.map(d => 
                                '<div class="sidebar-item" data-path="' + d.replace(/\\\\/g, '\\\\\\\\') + '"><span>💽</span> ' + d + ' Drive</div>'
                            ).join('');
                        }
                    } catch (e) {}
                }

                async function loadPath(path = '') {
                    browserList.innerHTML = '<div class="muted">Loading...</div>';
                    try {
                        const res = await fetch('/api/fs/ls?path=' + encodeURIComponent(path));
                        const json = await res.json();
                        if (json.success) {
                            const data = json.data;
                            browserPathInput.value = data.currentPath;
                            currentParentPath = data.parentPath;
                            browserList.innerHTML = '';
                            data.items.filter(i => i.isDir).forEach(item => {
                                const div = document.createElement('div');
                                div.className = 'browser-item';
                                div.dataset.path = item.path;
                                div.dataset.isDir = 'true';
                                div.innerHTML = '<span class="browser-icon">📁</span><span class="browser-name">' + item.name + '</span>';
                                browserList.appendChild(div);
                            });
                        }
                    } catch (e) {
                        browserList.innerHTML = '<div class="error">Error loading path</div>';
                    }
                }

                function renderResults(data, orientation) {
                    if (data.scenes.length === 0) {
                        resultsContainer.innerHTML = '<div class="empty-state">No scenes were identified in the script.</div>';
                        return;
                    }

                    resultsContainer.innerHTML = '<h3>Identified ' + data.scenes.length + ' Scenes</h3>';
                    
                    data.scenes.forEach((scene, index) => {
                        const card = document.createElement('div');
                        card.className = 'scene-result-card';
                        
                        const keywordsHtml = scene.searchKeywords.map(k => '<span class="keyword-tag">' + k + '</span>').join('');
                        
                        let mediaHtml = '<div class="stack" style="justify-content:center;align-items:center;height:100%;"><i data-lucide="help-circle" class="muted"></i></div>';
                        let downloadLink = '';

                        if (scene.visual) {
                            if (scene.visual.type === 'video') {
                                mediaHtml = '<video src="' + scene.visual.localPath + '" autoplay muted loop></video>';
                                downloadLink = '<a href="' + scene.visual.localPath + '" download class="button secondary small" style="padding:6px 12px;font-size:13px;"><i data-lucide="download"></i> Download Video</a>';
                            } else {
                                mediaHtml = '<img src="' + scene.visual.url + '" />';
                                downloadLink = '<a href="' + scene.visual.url + '" target="_blank" class="button secondary small" style="padding:6px 12px;font-size:13px;"><i data-lucide="external-link"></i> View Original</a>';
                            }
                        }

                        card.innerHTML = \`
                            <div class="scene-preview-container \${orientation}">
                                \${mediaHtml}
                            </div>
                            <div class="scene-info">
                                <div class="row" style="justify-content:space-between;align-items:flex-start;">
                                    <strong>Scene \${index + 1}</strong>
                                    \${downloadLink}
                                </div>
                                <p style="font-size:14px;">\${scene.voiceoverText}</p>
                                <div style="margin-top:auto;">
                                    <div style="font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;margin-bottom:6px;">Keywords</div>
                                    <div>\${keywordsHtml}</div>
                                </div>
                            </div>
                        \`;
                        resultsContainer.appendChild(card);
                    });
                    
                    if (typeof lucide !== 'undefined') {
                        lucide.createIcons();
                    }
                }
            })();
        </script>
    `;

    return layout(
        'Download Assets for Script | ' + PROJECT_NAME,
        body,
        {
            canonical: absoluteUrl(req, '/video-download'),
            cspNonce,
            description: 'Analyze your video script with AI and download matching high-quality stock videos and images.',
            keywords: DEFAULT_SITE_KEYWORDS + ', asset downloader, stock footage finder',
            ogType: 'website',
        }
    );
}
