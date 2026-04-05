import { Request } from 'express';
import { 
    PROJECT_REPOSITORY_URL, 
    MAX_TITLE_LENGTH, 
    DEFAULT_FALLBACK_VIDEO, 
    DEMO_SCRIPT, 
    HELLO_WORLD_TITLE,
    HELLO_WORLD_SCRIPT,
    AVAILABLE_VOICES,
    PROJECT_NAME,
    DEFAULT_SITE_DESCRIPTION,
    DEFAULT_SITE_KEYWORDS
} from '../constants/config';
import { VideoRecord, SetupStatus } from '../types/server.types';
import { layout, escapeHtml } from './layout.view';
import { absoluteUrl } from '../services/video.service';

export function homePage(req: Request, videos: VideoRecord[], setup: SetupStatus, musicFiles: string[]): string {
    const defaultOgImage = absoluteUrl(req, '/og-image.svg');
    const cards = videos.length > 0
        ? videos.map((video) => `<a class="card" href="${video.watchUrl}"><div class="thumb"${video.thumbnailUrl ? ` style="background-image:url('${video.thumbnailUrl}')"` : ''}></div><div class="card-body"><h3>${escapeHtml(video.title)}</h3><p class="muted">${escapeHtml(video.orientation)} - ${video.fileSizeMB} MB</p><div class="row">${video.durationSeconds ? `<span class="pill">${Math.round(video.durationSeconds)} sec</span>` : ''}<span class="pill">${escapeHtml(new Date(video.createdAt).toLocaleString())}</span></div></div></a>`).join('')
        : '<div class="empty-state"><h3>No completed videos yet</h3><p class="muted">Your finished videos will appear here automatically after the first render.</p></div>';
    
    const recentCards = videos.length > 0
        ? videos.slice(0, 3).map((video) => `<a class="small-card" href="${video.watchUrl}"><div class="small-thumb"${video.thumbnailUrl ? ` style="background-image:url('${video.thumbnailUrl}')"` : ''}></div><div><h3>${escapeHtml(video.title)}</h3><p class="muted">${escapeHtml(video.orientation)} - ${video.fileSizeMB} MB</p><div class="row">${video.durationSeconds ? `<span class="pill">${Math.round(video.durationSeconds)} sec</span>` : ''}<span class="pill">${escapeHtml(new Date(video.createdAt).toLocaleDateString())}</span></div></div></a>`).join('')
        : '<div class="empty-state"><p class="muted">Start with a sample script and the first finished MP4 will show up here.</p></div>';

    const musicOptions = musicFiles.length > 0
        ? musicFiles.map((file) => `<option value="${escapeHtml(file)}">${escapeHtml(file)}</option>`).join('')
        : '<option value="">No music found in input/music</option>';

    const voicesList = AVAILABLE_VOICES as Record<string, { male: string[]; female: string[] }>;

    const voiceOptions = Object.entries(voicesList).map(([lang, voices]) => {
        const langName = lang.charAt(0).toUpperCase() + lang.slice(1);
        const maleOptions = voices.male.map(v => `<option value="${v}">${v} (Male)</option>`).join('');
        const femaleOptions = voices.female.map(v => `<option value="${v}">${v} (Female)</option>`).join('');
        return `<optgroup label="${langName}">${femaleOptions}${maleOptions}</optgroup>`;
    }).join('');

    const languageOptions = Object.keys(voicesList).map(lang => {
        const langName = lang.charAt(0).toUpperCase() + lang.slice(1);
        return `<option value="${lang}">${langName}</option>`;
    }).join('');

    const setupSummary = [
        `<span class="status-chip ${setup.hasPexelsKey ? 'ok' : 'warn'}">Pexels key: ${setup.hasPexelsKey ? 'Saved' : 'Missing'}</span>`,
        `<span class="status-chip ${setup.edgeTtsReady ? 'ok' : 'warn'}">Voice engine: ${setup.edgeTtsReady ? 'Ready' : 'Not ready'}</span>`,
        `<span class="status-chip ok">Portal workflow: Browser first</span>`,
    ].join('');
    
    const totalVoicePresets = Object.values(voicesList).reduce((count, group) => count + group.male.length + group.female.length, 0);

    const defaultTitle = videos.length === 0 ? HELLO_WORLD_TITLE : '';
    const defaultScript = videos.length === 0 ? HELLO_WORLD_SCRIPT : '';

    const body = `<section class="hero-surface"><div class="hero-grid"><div class="stack"><span class="eyebrow">Local AI Video Studio</span><div><h1>Create videos from a script, not from folders</h1><p class="lead">Paste your idea, shape the voice and layout, then let the portal handle stock visuals, narration, subtitles, rendering, and delivery in one place.</p><p class="muted">This screen is designed for normal users. No need to manually edit the input or output folders during everyday use.</p></div><div class="toolbar"><a class="button" href="#workspace">Open the workspace</a><a class="button secondary" href="${PROJECT_REPOSITORY_URL}" target="_blank" rel="noreferrer">View on GitHub</a><a class="button ghost" href="/llms.txt">Read AI summary</a></div><div class="metric-grid"><div class="metric-card"><strong>${videos.length}</strong><span class="muted">videos created in this portal</span></div><div class="metric-card"><strong>${totalVoicePresets}+</strong><span class="muted">voice presets available before dynamic loading</span></div><div class="metric-card"><strong>3 steps</strong><span class="muted">setup, create, watch or download</span></div></div></div><div class="highlight-box stack"><span class="eyebrow">Simple Flow</span><h2>What users do here</h2><div class="row">${setupSummary}</div><ol class="checklist"><li>Save the API keys once for this computer.</li><li>Paste or edit the script in the workspace below.</li><li>choose voice, layout, music, and subtitle options.</li><li>Start the render and wait on the live status page.</li><li>Watch or download the MP4 from the final delivery page.</li></ol></div></div></section><section class="layout-split"><div class="panel tint stack"><div><span class="eyebrow">One-Time Setup</span><h2>Prepare this device once</h2><p class="muted">Most users only need a Pexels API key. Save it here and the browser portal becomes the main way to use the project.</p></div><div class="row">${setupSummary}</div><div id="setup-readiness" class="status-board"></div></div><div class="panel"><form id="setup-form" class="form"><div class="field-grid two-up"><div class="field"><div class="row" style="justify-content:space-between"><label for="setup-pexels">Pexels API key</label><div class="row"><span id="setup-pexels-status" class="status-chip warn">Checking...</span><button type="button" id="setup-pexels-toggle" class="secondary" style="padding:4px 10px;font-size:12px;display:none" onclick="toggleFieldUpdate('pexels')">Change</button></div></div><input id="setup-pexels" type="password" placeholder="Recommended for stock video search"><p class="field-help">Best source for usable portrait and landscape stock footage.</p></div><div class="field"><div class="row" style="justify-content:space-between"><label for="setup-pixabay">Pixabay API key</label><div class="row"><span id="setup-pixabay-status" class="status-chip warn">Checking...</span><button type="button" id="setup-pixabay-toggle" class="secondary" style="padding:4px 10px;font-size:12px;display:none" onclick="toggleFieldUpdate('pixabay')">Change</button></div></div><input id="setup-pixabay" type="password" placeholder="Optional backup provider"><p class="field-help">Optional secondary image and video source.</p></div><div class="field"><div class="row" style="justify-content:space-between"><label for="setup-gemini">Gemini API key</label><div class="row"><span id="setup-gemini-status" class="status-chip warn">Checking...</span><button type="button" id="setup-gemini-toggle" class="secondary" style="padding:4px 10px;font-size:12px;display:none" onclick="toggleFieldUpdate('gemini')">Change</button></div></div><input id="setup-gemini" type="password" placeholder="Optional AI helper"><p class="field-help">Only needed if your workflows use Gemini-powered helpers.</p></div></div><div class="toolbar"><button type="submit">Save Setup</button><span class="muted">Launcher users can open this page from <strong>Start-Automated-Video-Generator.bat</strong>.</span></div></form><div id="setup-feedback" class="status" hidden></div></div></section><section id="workspace" class="layout-split"><div class="stack"><form id="generate-form" class="form"><div class="panel form-panel"><div class="panel-head"><div><span class="eyebrow">Step 1</span><h2>Write the story and visual instructions</h2><p class="muted">Use plain sentences. Add <strong>[Visual: ...]</strong> when you want to guide the stock footage for a scene.</p></div><button type="button" id="fill-sample" class="secondary">Use Sample Script</button></div><div class="field"><label for="title">Video title</label><input id="title" value="${escapeHtml(defaultTitle)}" placeholder="How AI Is Changing Everyday Life" maxlength="${MAX_TITLE_LENGTH}" required><p class="field-help">This title is used on the output page and for the final video filename.</p></div><div class="field"><label for="script">Input script</label><div class="script-shell"><div class="script-toolbar"><span class="muted">Editable input area for the full spoken script</span><div id="script-metrics" class="row"><span class="helper-badge">0 words</span><span class="helper-badge">0 sec est.</span></div></div><textarea id="script" placeholder="[Visual: futuristic robotics lab] AI is changing how people and robots work together.&#10;&#10;[Visual: doctor reviewing an AI dashboard] In healthcare, it helps spot patterns faster and supports earlier decisions." required>${escapeHtml(defaultScript)}</textarea><div class="script-guide"><strong>Good script format</strong><p class="muted">Short paragraphs and clear scene cues work best. One idea per line makes subtitles cleaner and helps the generator find stronger visuals.</p></div></div></div></div><div class="panel form-panel"><div><span class="eyebrow">Step 2</span><h2>Choose voice and video layout</h2><p class="muted">You can let the app detect the language automatically or lock the language and voice yourself.</p></div><div class="field-grid two-up"><div class="field"><label for="orientation">Output orientation</label><select id="orientation"><option value="portrait">Portrait (9:16)</option><option value="landscape">Landscape (16:9)</option></select><p class="field-help">Portrait is best for Shorts, Reels, and TikTok. Landscape is better for YouTube and presentations.</p></div><div class="field"><label for="language">Language</label><select id="language"><option value="">Detect language automatically</option>${languageOptions}</select><p class="field-help">Pick a language when you want more predictable voice selection.</p></div><div class="field"><label for="voice-search">Search voice</label><input type="text" id="voice-search" class="voice-search" placeholder="Search voices by name, language, or gender"><p id="voice-hint" class="field-help">The full voice list loads from Edge-TTS when available.</p></div><div class="field"><label for="voice">Voice override</label><select id="voice"><option value="">Select Voice (Optional Override)</option>${voiceOptions}</select><p class="field-help">Leave this empty if you want the app to choose a matching voice automatically.</p></div></div></div><div class="panel form-panel"><div><span class="eyebrow">Step 3</span><h2>Finish the output settings</h2><p class="muted">These options shape the final MP4 and help the generator recover cleanly when a stock video cannot be downloaded.</p></div><div class="field-grid two-up"><div class="field"><label for="backgroundMusic">Background music</label><div class="row" style="flex-wrap:nowrap"><select id="backgroundMusic"><option value="">No background music</option>${musicOptions}</select><button type="button" class="secondary" onclick="openSystemBrowser('music')">Browse</button></div><p class="field-help">Choose from <strong>input/music</strong> or click Browse to pick from your computer.</p></div><div class="field"><label for="defaultVideo">Fallback video asset</label><input id="defaultVideo" value="${escapeHtml(DEFAULT_FALLBACK_VIDEO)}" placeholder="Fallback asset"><p class="field-help">Used if stock video cannot be fetched for a scene. Keep a known-good local clip here.</p></div></div><div class="stack" style="margin-top:10px"><strong>Local Media Assets</strong><p class="muted small">Quickly add images or videos from your computer and use them in the script.</p><div class="toolbar"><button type="button" class="secondary" onclick="openSystemBrowser('media')">Add Local Media File</button></div><div id="asset-gallery" class="asset-gallery"></div></div><label class="toggle-row" for="showText" style="margin-top:16px"><input id="showText" type="checkbox" checked> <div><strong>Show subtitles</strong><p class="field-help">Keep this on for Shorts-style videos where readable captions matter.</p></div></label><div id="form-status" class="status" hidden></div><div class="toolbar"><button type="submit">Generate Video</button><span class="muted">After clicking generate, this page sends you to a live render status screen automatically.</span></div></div></form></div><div class="stack"><div class="panel soft"><span class="eyebrow">Editing Tips</span><h2>Make changes without confusion</h2><ul class="compact-list"><li>Use one clear idea per sentence so voiceover and subtitles stay readable.</li><li>Add scene hints like <strong>[Visual: busy modern factory]</strong> when you want stronger video search results.</li><li>Choose portrait for social shorts and landscape for traditional videos.</li><li>If a voice feels wrong, keep the same script and only change the voice override.</li><li>Fallback video is safer than image fallback when a stock clip fails to download.</li></ul></div><div class="panel"><span class="eyebrow">Latest Outputs</span><h2>Recent finished videos</h2><p class="muted">Users can return here anytime and open the delivery page again.</p><div class="recent-grid">${recentCards}</div></div></div></section><section id="recent-videos" class="panel"><div class="panel-head"><div><span class="eyebrow">Library</span><h2>Completed videos</h2><p class="muted">Each card opens a dedicated watch page with the final player and MP4 download button.</p></div><a class="button secondary" href="#workspace">Create another video</a></div><div class="cards">${cards}</div></section>
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
                            <button type="button" class="ghost" onclick="loadPath(currentParentPath)" title="Go up one level">⤴ Up</button>
                            <button type="button" class="secondary" onclick="closeSystemBrowser()">✕</button>
                        </div>
                    </div>
                    <div class="browser-path-wrapper">
                        <input id="browser-path" class="browser-path" placeholder="Path\To\Folder..." title="Type path and press Enter">
                        <button type="button" class="secondary" onclick="loadPath(document.getElementById('browser-path').value)" style="padding:6px 12px;margin-left:8px">Go</button>
                    </div>
                    <div id="browser-list" class="browser-list"></div>
                    <div class="browser-footer">
                        <button type="button" class="secondary" onclick="closeSystemBrowser()">Cancel</button>
                    </div>
                </div>
            </div>
        </div>`;

    const script = `const sampleScript=${JSON.stringify(DEMO_SCRIPT)};
const form=document.getElementById('generate-form');
const status=document.getElementById('form-status');
const setupForm=document.getElementById('setup-form');
const setupFeedback=document.getElementById('setup-feedback');
const setupReadiness=document.getElementById('setup-readiness');
const fillSample=document.getElementById('fill-sample');
const voiceSelect=document.getElementById('voice');
const voiceSearch=document.getElementById('voice-search');
const voiceHint=document.getElementById('voice-hint');
const langSelect=document.getElementById('language');
const scriptField=document.getElementById('script');
const titleField=document.getElementById('title');
const scriptMetrics=document.getElementById('script-metrics');
let allVoices={};
function setMessage(element,text,isSuccess){
    element.hidden=false;
    element.textContent=text;
    element.classList.toggle('success',Boolean(isSuccess));
}
function estimateWordCount(text){
    return text.trim()?text.trim().split(/\\s+/).filter(Boolean).length:0;
}
function estimateSceneCount(text){
    const visualCount=(text.match(/\\[visual:/ig)||[]).length;
    const paragraphCount=text.split(/\\n+/).map((line)=>line.trim()).filter(Boolean).length;
    return Math.max(visualCount,Math.min(Math.max(paragraphCount,1),12));
}
function estimateDurationSeconds(text){
    const words=estimateWordCount(text);
    return words===0?0:Math.max(5,Math.round(words/2.6));
}
function updateScriptMetrics(){
    const text=scriptField.value||'';
    const words=estimateWordCount(text);
    const scenes=estimateSceneCount(text);
    const seconds=estimateDurationSeconds(text);
    scriptMetrics.innerHTML=[
        '<span class="helper-badge">'+words+' words</span>',
        '<span class="helper-badge">'+scenes+' scenes est.</span>',
        '<span class="helper-badge">'+seconds+' sec est.</span>'
    ].join('');
}
function toggleFieldUpdate(id){
    const input=document.getElementById('setup-'+id);
    const toggle=document.getElementById('setup-'+id+'-toggle');
    if(!input || !toggle) return;
    if(input.hasAttribute('readonly')){
        input.removeAttribute('readonly');
        input.value='';
        input.focus();
        toggle.textContent='Cancel';
    } else {
        input.setAttribute('readonly','true');
        input.value='';
        input.placeholder='Already saved (Click Change to update)';
        toggle.textContent='Change';
    }
}
function updateFieldStatus(id,saved){
    const el=document.getElementById('setup-'+id+'-status');
    const input=document.getElementById('setup-'+id);
    const toggle=document.getElementById('setup-'+id+'-toggle');
    if(!el)return;
    el.textContent=saved?'✓ Saved':'⚠ Missing';
    el.className='status-chip '+(saved?'ok':'warn');
    if(toggle){
        toggle.style.display=saved?'inline-flex':'none';
        toggle.textContent='Change';
    }
    if(saved && input){
        input.setAttribute('readonly','true');
        input.value='';
        input.placeholder='Already saved (Click Change to update)';
    }else if(input){
        input.removeAttribute('readonly');
    }
}
window.toggleFieldUpdate=toggleFieldUpdate;
function renderSetupStatus(data){
    const items=[
        ['Pexels API',data.hasPexelsKey,'Needed for the strongest video search'],
        ['Voice engine',data.edgeTtsReady,'Needed for narration'],
        ['Ready to render',data.readyForGeneration,'Main requirements satisfied']
    ];
    setupReadiness.innerHTML=items.map(([label,ok,help])=>'<div class="status-card"><strong>'+label+'</strong><p class="muted">'+(ok?'Ready':'Not set')+'</p><p class="field-help">'+help+'</p></div>').join('');
    
    updateFieldStatus('pexels', data.hasPexelsKey);
    updateFieldStatus('pixabay', data.hasPixabayKey);
    updateFieldStatus('gemini', data.hasGeminiKey);
}
async function loadSetupStatus(){
    try{
        const res=await fetch('/api/setup/status',{cache:'no-store'});
        const json=await res.json();
        if(json.success){
            renderSetupStatus(json.data);
        }
    }catch(e){
        console.error('Failed to load setup status',e);
    }
}
function renderVoices(filter=''){
    if(!Object.keys(allVoices).length){
        voiceHint.textContent='Using the built-in voice list. Dynamic voices were not loaded yet.';
        return;
    }
    voiceSelect.innerHTML='<option value="">Select Voice (Optional Override)</option>';
    const query=filter.toLowerCase().trim();
    let results=0;
    Object.entries(allVoices).forEach(([lang,voices])=>{
        const filtered=voices.filter((v)=>v.name.toLowerCase().includes(query)||lang.toLowerCase().includes(query)||v.gender.toLowerCase().includes(query));
        if(filtered.length>0){
            const group=document.createElement('optgroup');
            group.label=lang;
            filtered.forEach((v)=>{
                const opt=document.createElement('option');
                opt.value=v.name;
                opt.textContent=\`\${v.name} (\${v.gender})\`;
                group.appendChild(opt);
            });
            voiceSelect.appendChild(group);
            results+=filtered.length;
        }
    });
    voiceHint.textContent=results>0?results+' voices match your search.':'No voices match that search yet.';
}
async function loadAllVoices(){
    try{
        const res=await fetch('/api/voices');
        const json=await res.json();
        if(json.success){
            allVoices=json.data;
            Object.keys(allVoices).sort().forEach((lang)=>{
                const opt=document.createElement('option');
                opt.value=lang;
                opt.textContent=lang;
                if(![...langSelect.options].some((o)=>o.value===lang)){
                    langSelect.appendChild(opt);
                }
            });
            renderVoices(voiceSearch.value||'');
            const total=Object.values(allVoices).reduce((count,list)=>count+list.length,0);
            voiceHint.textContent=total+' dynamic voices loaded from Edge-TTS.';
        }
    }catch(e){
        console.error('Failed to load voices',e);
        voiceHint.textContent='Dynamic voice loading is unavailable right now. You can still use the built-in voice list.';
    }
}
voiceSearch.addEventListener('input',(e)=>renderVoices(e.target.value));
scriptField.addEventListener('input',updateScriptMetrics);
fillSample.addEventListener('click',()=>{
    if(!titleField.value){
        titleField.value='How AI Is Changing Everyday Life';
    }
    scriptField.value=sampleScript;
    langSelect.value='english';
    renderVoices(voiceSearch.value||'');
    updateScriptMetrics();
    window.scrollTo({top:form.offsetTop-20,behavior:'smooth'});
});
setupForm.addEventListener('submit',async(e)=>{
    e.preventDefault();
    const payload={};
    ['pexels','pixabay','gemini'].forEach(id=>{
        const input=document.getElementById('setup-'+id);
        if(!input.hasAttribute('readonly') && input.value.trim()){
            payload[id.toUpperCase()+'_API_KEY']=input.value.trim();
        }
    });
    if(Object.keys(payload).length===0){
        setMessage(setupFeedback,'No new changes to save.',false);
        return;
    }
    setMessage(setupFeedback,'Saving setup...',false);
    try{
        const res=await fetch('/api/setup/env',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
        const json=await res.json();
        if(!res.ok||!json.success){
            throw new Error(json.error||'Unable to save setup.');
        }
        setMessage(setupFeedback,'Setup saved. This browser workspace is ready to use.',true);
        renderSetupStatus(json.data);
    }catch(err){
        setMessage(setupFeedback,err instanceof Error?err.message:'Unable to save setup.',false);
    }
});
form.addEventListener('submit',async(e)=>{
    e.preventDefault();
    setMessage(status,'Starting render...',false);
    const payload={
        title:document.getElementById('title').value,
        script:document.getElementById('script').value,
        orientation:document.getElementById('orientation').value,
        language:document.getElementById('language').value,
        voice:document.getElementById('voice').value||undefined,
        backgroundMusic:document.getElementById('backgroundMusic').value,
        defaultVideo:document.getElementById('defaultVideo').value,
        showText:document.getElementById('showText').checked
    };
    try{
        const res=await fetch('/generate-video',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
        const json=await res.json();
        if(!res.ok||!json.success){
            throw new Error(json.error||'Unable to start render.');
        }
        window.location.href=json.data.statusPageUrl;
    }catch(err){
        setMessage(status,err instanceof Error?err.message:'Unable to start render.',false);
    }
});
updateScriptMetrics();
loadSetupStatus();
loadAllVoices();

const browserModal = document.getElementById('browser-modal');
const browserPath = document.getElementById('browser-path');
const browserList = document.getElementById('browser-list');
const assetGallery = document.getElementById('asset-gallery');
const musicSelect = document.getElementById('backgroundMusic');
const quickAccessList = document.getElementById('quick-access-list');
const drivesList = document.getElementById('drives-list');
let currentBrowserType = 'media';
let currentParentPath = '';

window.openSystemBrowser = (type) => {
    currentBrowserType = type;
    browserModal.classList.add('open');
    loadSidebar();
    loadPath();
};
window.closeSystemBrowser = () => browserModal.classList.remove('open');

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
            drivesList.innerHTML = drivesJson.data.map(d => \`<div class="sidebar-item" onclick="loadPath('\${d}\\\\\\\\')"><span>💽</span> \${d} Drive</div>\`).join('');
        }
    } catch (e) {
        console.error('Sidebar load failed', e);
    }
}

async function loadPath(path = '') {
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
            const isSelectable = currentBrowserType === 'music' ? item.ext === '.mp3' : ['.mp4', '.mov', '.jpg', '.png', '.jpeg'].includes(item.ext);
            
            div.className = 'browser-item' + (!item.isDir && !isSelectable ? ' disabled' : '');
            div.innerHTML = \`
                <span class="browser-icon">\${item.isDir ? '📁' : (item.ext === '.mp4' || item.ext === '.mov' ? '🎬' : '🖼️')}</span> 
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
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({sourcePath: path, type: currentBrowserType})
        });
        const json = await res.json();
        if (!json.success) throw new Error(json.error);
        
        if (currentBrowserType === 'music') {
            const opt = document.createElement('option');
            opt.value = json.data.filename;
            opt.textContent = json.data.filename;
            musicSelect.appendChild(opt);
            musicSelect.value = json.data.filename;
        } else {
            addAssetToGallery(json.data);
        }
        closeSystemBrowser();
    } catch (e) {
        alert('Pick failed: ' + e.message);
    }
}

function addAssetToGallery(data) {
    const div = document.createElement('div');
    div.className = 'asset-item';
    div.innerHTML = \`
        <div style="font-size:12px;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">\${data.filename}</div>
        <div class="tag-copy" title="Click to insert into script">\${data.tag}</div>
    \`;
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
`;

    return layout(
        'Free Automated Video Generator | Open-Source Remotion Text-to-Video Tool',
        body,
        {
            canonical: absoluteUrl(req, '/'),
            description: DEFAULT_SITE_DESCRIPTION,
            imageUrl: videos[0]?.thumbnailUrl || defaultOgImage,
            jsonLd: [
                {
                    '@context': 'https://schema.org',
                    '@type': 'SoftwareApplication',
                    applicationCategory: 'MultimediaApplication',
                    description: DEFAULT_SITE_DESCRIPTION,
                    isAccessibleForFree: true,
                    name: PROJECT_NAME,
                    offers: {
                        '@type': 'Offer',
                        price: '0',
                        priceCurrency: 'USD',
                        },
                    operatingSystem: 'Windows, macOS, Linux',
                    sameAs: PROJECT_REPOSITORY_URL,
                    url: absoluteUrl(req, '/'),
                },
                {
                    '@context': 'https://schema.org',
                    '@type': 'SoftwareSourceCode',
                    codeRepository: PROJECT_REPOSITORY_URL,
                    description: DEFAULT_SITE_DESCRIPTION,
                    license: 'MIT',
                    name: PROJECT_NAME,
                    programmingLanguage: ['TypeScript', 'React'],
                    runtimePlatform: 'Node.js',
                },
            ],
            keywords: DEFAULT_SITE_KEYWORDS,
            ogType: 'website',
        },
        script
    );
}
