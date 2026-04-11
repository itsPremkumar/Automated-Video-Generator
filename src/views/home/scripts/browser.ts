export function browserLogic(): string {
    return `
// ─── File Browser Modal Logic ───────────────────────────────────────────────────

window.openSystemBrowser = (type) => {
    currentBrowserType = type;
    browserModal.classList.add('open');
    loadSidebar();
    loadPath();
};
window.closeSystemBrowser = () => browserModal.classList.remove('open');

addMediaBtn?.addEventListener('click', () => window.openSystemBrowser('media'));
browsePersonalAudioBtn?.addEventListener('click', () => window.openSystemBrowser('personalAudio'));
browseMusicBtn?.addEventListener('click', () => window.openSystemBrowser('music'));

browserUpBtn?.addEventListener('click', () => loadPath(currentParentPath));
browserCloseBtn?.addEventListener('click', () => window.closeSystemBrowser());
browserCancelBtn?.addEventListener('click', () => window.closeSystemBrowser());
browserGoBtn?.addEventListener('click', () => loadPath(browserPath.value));

browserPath.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') loadPath(e.target.value);
});

async function loadSidebar() {
    try {
        const homeRes = await fetch('/api/fs/home');
        const homeJson = await homeRes.json();
        if (homeJson.success) {
            const h = homeJson.data;
            const items = [
                { name: 'Home', path: h.home, icon: '🏠' },
                { name: 'Desktop', path: h.desktop, icon: '🖥️' },
                { name: 'Downloads', path: h.downloads, icon: '⬇️' },
                { name: 'Videos', path: h.videos, icon: '🎬' },
                { name: 'Pictures', path: h.pictures, icon: '🖼️' }
            ];
            quickAccessList.innerHTML = items.map(i => \`<div class="sidebar-item" onclick="loadPath('\${i.path.replace(/\\\\/g, '\\\\\\\\')}')"><span>\${i.icon}</span> \${i.name}</div>\`).join('');
        }

        const drivesRes = await fetch('/api/fs/drives');
        const drivesJson = await drivesRes.json();
        if (drivesJson.success) {
            drivesList.innerHTML = drivesJson.data.map(d => \`<div class="sidebar-item" onclick="loadPath('\${d}\\\\')"><span>💽</span> \${d} Drive</div>\`).join('');
        }
    } catch (e) {
        console.error('Sidebar load failed', e);
    }
}

async function loadPath(path = '') {
    window.loadPath = loadPath;
    browserList.innerHTML = '<div class="muted" style="padding:20px">Loading...</div>';
    try {
        const res = await fetch('/api/fs/ls?path=' + encodeURIComponent(path));
        const json = await res.json();
        if (!json.success) throw new Error(json.error);

        const data = json.data;
        browserPath.value = data.currentPath;
        currentParentPath = data.parentPath;
        browserList.innerHTML = '';

        if (data.items.length === 0) {
            browserList.innerHTML = '<div class="empty-state" style="margin:20px"><p class="muted">This folder is empty.</p></div>';
            return;
        }

        data.items.forEach(item => {
            const div = document.createElement('div');
            const isSelectable = (currentBrowserType === 'music' || currentBrowserType === 'personalAudio')
                ? (item.ext === '.mp3' || item.ext === '.wav' || item.ext === '.m4a')
                : ['.mp4', '.mov', '.jpg', '.png', '.jpeg'].includes(item.ext);

            const isImage = ['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(item.ext);
            const isVideo = ['.mp4', '.mov', '.webm', '.ogg'].includes(item.ext);
            const viewUrl = \`/api/fs/view?path=\${encodeURIComponent(item.path)}\`;

            div.className = 'browser-item' + (!item.isDir && !isSelectable ? ' disabled' : '');
            div.innerHTML = \`
                <span class="browser-icon">
                    \${isImage 
                        ? \`<img src="\${viewUrl}" class="browser-preview">\` 
                        : isVideo 
                            ? \`<video src="\${viewUrl}" class="browser-preview" muted onmouseover="this.play()" onmouseout="this.pause();this.currentTime=0"></video>\`
                            : (item.isDir ? '📁' : '📄')}
                </span>
                <span class="browser-name">\${item.name}</span>
                <span class="browser-size">\${item.isDir ? '' : 'File'}</span>
            \`;

            if (item.isDir) {
                div.onclick = () => loadPath(item.path);
            } else if (isSelectable) {
                div.onclick = () => pickFile(item.path);
            }
            browserList.appendChild(div);
        });
    } catch (e) {
        browserList.innerHTML = '<div class="status" style="margin:20px"><strong>Error:</strong> ' + e.message + '</div>';
    }
}

async function pickFile(path) {
    try {
        const res = await fetch('/api/fs/pick', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sourcePath: path, type: currentBrowserType })
        });
        const json = await res.json();
        if (!json.success) throw new Error(json.error);

        if (currentBrowserType === 'music' || currentBrowserType === 'personalAudio') {
            const opt = document.createElement('option');
            opt.value = json.data.filename;
            opt.textContent = json.data.filename;
            if (currentBrowserType === 'music') {
                musicSelect.appendChild(opt);
                musicSelect.value = json.data.filename;
            } else {
                personalAudioSelect.appendChild(opt);
                personalAudioSelect.value = json.data.filename;
            }
        } else {
            addAssetToGallery(json.data);
        }
        closeSystemBrowser();
    } catch (e) {
        alert('Pick failed: ' + e.message);
    }
}

function addAssetToGallery(data) {
    const isImage = /\.(jpg|jpeg|png|gif|webp)$/i.test(data.filename);
    const div = document.createElement('div');
    div.className = 'asset-item';
    div.innerHTML = \`
        \${isImage ? \`<img src="\${data.assetUrl}" class="asset-preview" alt="\${data.filename}">\` : ''}
        <div style="font-size:12px;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">\${data.filename}</div>
        <div class="tag-copy" title="Click to insert into script">\${data.tag}</div>
        <div class="delete-btn" title="Remove asset">✕</div>
    \`;
    div.querySelector('.delete-btn').onclick = (e) => {
        e.stopPropagation();
        deleteAsset(data.filename, div);
    };
    div.querySelector('.tag-copy').onclick = () => {
        const script = document.getElementById('script');
        const pos = script.selectionStart;
        const text = script.value;
        script.value = text.slice(0, pos) + data.tag + text.slice(pos);
        updateScriptMetrics();
        script.focus();
    };
    assetGallery.appendChild(div);
}

async function deleteAsset(filename, element) {
    if (!confirm('Are you sure you want to permanently delete this asset?')) return;
    
    try {
        const res = await fetch('/api/fs/assets/' + encodeURIComponent(filename), {
            method: 'DELETE'
        });
        const json = await res.json();
        if (json.success) {
            element.remove();
        } else {
            alert('Failed to delete asset: ' + json.error);
        }
    } catch (e) {
        console.error('Delete failed', e);
        alert('Failed to delete asset. Check console for details.');
    }
}

async function loadGalleryAssets() {
    try {
        const res = await fetch('/api/fs/assets');
        const json = await res.json();
        if (json.success) {
            json.data.forEach(addAssetToGallery);
        }
    } catch (e) {
        console.error('Failed to load gallery assets', e);
    }
}
`;
}
