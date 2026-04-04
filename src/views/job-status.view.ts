import { Request } from 'express';
import { PROJECT_NAME } from '../constants/config';
import { layout, escapeHtml } from './layout.view';
import { absoluteUrl } from '../services/video.service';

export function jobPage(req: Request, jobId: string): string {
    const body = `<section class="hero-surface"><div class="hero-grid"><div class="stack"><span class="eyebrow">Live Render Status</span><div><h1 id="title">Render in progress</h1><p id="message" class="lead small">This page refreshes automatically while the generator downloads assets, creates voiceover, and renders the final MP4.</p></div><div class="bar"><div id="progress"></div></div><div class="metric-grid"><div class="metric-card"><strong id="percent">0%</strong><span class="muted">overall progress</span></div><div class="metric-card"><strong id="status">pending</strong><span class="muted">current status</span></div><div class="metric-card"><strong>3 sec</strong><span class="muted">auto refresh interval</span></div></div></div><div class="highlight-box stack"><span class="eyebrow">Job Details</span><div class="row"><span class="status-chip ok">Watching live</span><span class="pill">${escapeHtml(jobId)}</span></div><p id="wait-message" class="muted">Keep this tab open. When the job finishes, the final video and MP4 download button will appear here automatically.</p><div id="video-container" class="video-stage" hidden style="margin: 10px 0; padding: 0; box-shadow: none; background: transparent; border: 1px solid var(--line); overflow: hidden;"></div><div id="actions" class="toolbar"></div><div id="error-container" hidden><div id="error" class="status" style="margin-bottom: 12px"></div><div style="background: #fff; border: 1px solid #efcfb8; border-radius: 12px; padding: 12px;"><div class="row" style="justify-content: space-between; margin-bottom: 8px;"><strong>Detailed Error Log</strong><button type="button" id="copy-error" class="secondary" style="padding: 6px 12px; font-size: 13px;">Copy Stack Trace</button></div><pre id="error-details" class="muted" style="white-space: pre-wrap; font-family: monospace; font-size: 12px; max-height: 300px; overflow-y: auto; margin: 0;"></pre></div></div></div></div></section><section class="layout-split"><div class="panel"><span class="eyebrow">Pipeline</span><h2>What the app is doing now</h2><div class="timeline"><div class="timeline-step" data-step="queued"><span>1</span><div><strong>Queued</strong><p class="muted">The job has been accepted and is waiting to begin.</p></div></div><div class="timeline-step" data-step="assets"><span>2</span><div><strong>Assets and voiceover</strong><p class="muted">The generator prepares scenes, downloads stock footage, and creates narration.</p></div></div><div class="timeline-step" data-step="render"><span>3</span><div><strong>Final render</strong><p class="muted">Remotion assembles the scenes into a single MP4 file.</p></div></div><div class="timeline-step" data-step="ready"><span>4</span><div><strong>Ready to watch</strong><p class="muted">Your delivery page and download link are prepared.</p></div></div></div></div><div class="panel soft"><span class="eyebrow">While You Wait</span><h2>Helpful notes</h2><ul class="compact-list"><li>The longest step is usually stock download and video rendering.</li><li>You can leave this tab open instead of watching the terminal.</li><li>If a stock clip fails, the generator can use fallback video before falling back to an image.</li><li>When finished, the video player and a direct MP4 download button will appear.</li></ul></div></section>`;

    const script = `const id=${JSON.stringify(jobId)};
const title=document.getElementById('title');
const message=document.getElementById('message');
const status=document.getElementById('status');
const percent=document.getElementById('percent');
const progress=document.getElementById('progress');
const actions=document.getElementById('actions');
const errorContainer=document.getElementById('error-container');
const error=document.getElementById('error');
const errorDetails=document.getElementById('error-details');
const copyError=document.getElementById('copy-error');
const steps=[...document.querySelectorAll('[data-step]')];
if(copyError){
    copyError.addEventListener('click', () => {
        navigator.clipboard.writeText(errorDetails.textContent);
        copyError.textContent = 'Copied!';
        setTimeout(() => copyError.textContent = 'Copy Stack Trace', 2000);
    });
}
function setStepState(current){
    const order=['queued','assets','render','ready'];
    const currentIndex=order.indexOf(current);
    steps.forEach((step)=>{
        const index=order.indexOf(step.dataset.step);
        step.classList.toggle('active',index===currentIndex);
        step.classList.toggle('done',currentIndex>index);
    });
}
function mapStep(data){
    if(data.status==='completed'){
        return 'ready';
    }
    if(data.status==='pending'){
        return 'queued';
    }
    if(data.progress>=75){
        return 'render';
    }
    return 'assets';
}
async function refresh(){
    try{
        const res=await fetch('/api/jobs/'+encodeURIComponent(id),{cache:'no-store'});
        const json=await res.json();
        if(!res.ok||!json.success){
            throw new Error(json.error||'Unable to load job.');
        }
        const data=json.data;
        title.textContent=data.title||'Render in progress';
        message.textContent=data.message||'Working on your video.';
        status.textContent=String(data.status);
        percent.textContent=String(data.progress)+'%';
        progress.style.width=Math.max(0,Math.min(100,Number(data.progress)||0))+'%';
        setStepState(mapStep(data));
        if(data.status==='completed'){
            const waitMessage = document.getElementById('wait-message');
            if (waitMessage) waitMessage.hidden = true;
            
            const videoContainer = document.getElementById('video-container');
            if (videoContainer && data.videoUrl) {
                videoContainer.hidden = false;
                const posterStr = (data.video && data.video.thumbnailUrl) ? 'poster="'+data.video.thumbnailUrl+'"' : '';
                videoContainer.innerHTML = '<video class="video" controls playsinline preload="metadata" ' + posterStr + ' style="max-height: 350px; width: 100%; object-fit: contain; background: #000; border-radius: 12px;"><source src="' + data.videoUrl + '" type="video/mp4"></video>';
            }
            
            actions.innerHTML='<a class="button" href="'+data.downloadUrl+'">Download MP4</a><a class="button secondary" href="'+data.watchUrl+'">Watch Page Overview</a><a class="button ghost" href="/">Back to Portal</a>';
            window.clearInterval(timer);
        }
        if(data.status==='failed'){
            errorContainer.hidden=false;
            error.textContent=data.error||'Render failed.';
            errorDetails.textContent=data.errorDetails||data.error||'No additional details provided.';
            window.clearInterval(timer);
        }
    }catch(err){
        error.hidden=false;
        error.textContent=err instanceof Error?err.message:'Unable to load job.';
    }
}
const timer=window.setInterval(refresh,3000);
refresh();`;

    return layout(
        `Render Job ${jobId} | ${PROJECT_NAME}`,
        body,
        {
            canonical: absoluteUrl(req, `/jobs/${encodeURIComponent(jobId)}`),
            description: 'Track a video rendering job in Automated Video Generator.',
            ogType: 'website',
            robots: 'noindex, nofollow',
        },
        script
    );
}
