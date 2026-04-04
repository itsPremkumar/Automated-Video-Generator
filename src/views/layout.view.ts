import { BRAND_COLOR, PROJECT_NAME, DEFAULT_SITE_DESCRIPTION, DEFAULT_SITE_KEYWORDS } from '../constants/config';
import { HtmlOptions } from '../types/server.types';

export function escapeHtml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

export function normalizeMetaText(value: string): string {
    return value.replace(/\s+/g, ' ').trim();
}

export function truncateText(value: string, maxLength: number): string {
    const normalized = normalizeMetaText(value);
    if (normalized.length <= maxLength) {
        return normalized;
    }

    return `${normalized.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
}

export function serializeJsonLd(jsonLd?: Record<string, unknown> | Array<Record<string, unknown>>): string {
    if (!jsonLd) {
        return '';
    }

    const items = Array.isArray(jsonLd) ? jsonLd : [jsonLd];
    return items
        .map((item) => `<script type="application/ld+json">${JSON.stringify(item).replace(/</g, '\\u003c')}</script>`)
        .join('');
}

export function layout(title: string, body: string, options: HtmlOptions = {}, script = ''): string {
    const description = options.description || DEFAULT_SITE_DESCRIPTION;
    const keywords = options.keywords || DEFAULT_SITE_KEYWORDS;
    const robots = options.robots || 'index,follow,max-image-preview:large';
    const ogType = options.ogType || 'website';
    const canonical = options.canonical ? `<link rel="canonical" href="${escapeHtml(options.canonical)}">` : '';
    const ogUrl = options.canonical ? `<meta property="og:url" content="${escapeHtml(options.canonical)}">` : '';
    const imageMeta = options.imageUrl
        ? `<meta property="og:image" content="${escapeHtml(options.imageUrl)}"><meta name="twitter:image" content="${escapeHtml(options.imageUrl)}">`
        : '';
    const twitterCard = options.imageUrl ? 'summary_large_image' : 'summary';
    const jsonLd = serializeJsonLd(options.jsonLd);

    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(title)}</title><meta name="description" content="${escapeHtml(description)}"><meta name="keywords" content="${escapeHtml(keywords)}"><meta name="robots" content="${escapeHtml(robots)}"><meta name="theme-color" content="${BRAND_COLOR}"><meta name="generator" content="${PROJECT_NAME}"><meta property="og:site_name" content="${PROJECT_NAME}"><meta property="og:title" content="${escapeHtml(title)}"><meta property="og:description" content="${escapeHtml(description)}"><meta property="og:type" content="${escapeHtml(ogType)}">${ogUrl}${imageMeta}<meta name="twitter:card" content="${twitterCard}"><meta name="twitter:title" content="${escapeHtml(title)}"><meta name="twitter:description" content="${escapeHtml(description)}"><link rel="alternate" type="text/plain" href="/llms.txt" title="LLMs summary">${canonical}${jsonLd}<style>
:root{--shell:#f4ead9;--cream:#fff9ef;--surface:#fffdf8;--surface-soft:#fff7ec;--line:#e6d6be;--line-strong:#d9c3a8;--ink:#172033;--muted:#5c6677;--brand:${BRAND_COLOR};--brand-strong:#cf6b36;--accent:#1f3a56;--success:#2f7d5d;--shadow:0 24px 60px rgba(31,22,10,.08);--radius-xl:28px;--radius-lg:22px;--radius-md:16px}
* { box-sizing: border-box; }
html { background: linear-gradient(180deg, #f8efe2 0%, #f5ebde 100%); scroll-behavior: smooth; }
body { margin: 0; font: 16px/1.6 "Aptos", "Trebuchet MS", "Segoe UI", sans-serif; color: var(--ink); background: radial-gradient(circle at top left, rgba(212, 125, 55, .16), transparent 28%), radial-gradient(circle at top right, rgba(23, 58, 86, .12), transparent 28%), linear-gradient(180deg, #f8efe2 0%, #f3eadf 40%, #f8f5ef 100%); min-height: 100vh; }
.top-nav { background: rgba(255, 253, 248, 0.85); backdrop-filter: blur(12px); border-bottom: 1px solid rgba(230, 214, 190, 0.6); position: sticky; top: 0; z-index: 100; padding: 14px 20px; box-shadow: 0 4px 20px rgba(0,0,0,0.02); }
.nav-content { max-width: 1180px; margin: 0 auto; display: flex; justify-content: space-between; align-items: center; }
.nav-brand { font-family: "Georgia", "Times New Roman", serif; font-size: 1.25rem; font-weight: 700; color: var(--ink); text-decoration: none; display: flex; align-items: center; gap: 8px; transition: opacity 0.2s ease; }
.nav-brand:hover { opacity: 0.8; }
.nav-links { display: flex; gap: 24px; align-items: center; }
.nav-link { text-decoration: none; color: var(--muted); font-weight: 600; font-size: 0.95rem; transition: color 0.15s ease; }
.nav-link:hover { color: var(--brand-strong); }
.nav-badge { background: #fee2d5; color: #b74c1a; padding: 2px 8px; border-radius: 999px; font-size: 0.75rem; font-weight: 800; margin-left: 6px; }
body::before{content:"";position:fixed;inset:0;background-image:linear-gradient(rgba(255,255,255,.18) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.12) 1px,transparent 1px);background-size:64px 64px;opacity:.16;pointer-events:none}
main{max-width:1180px;margin:0 auto;padding:32px 20px 56px;position:relative}
section{margin-bottom:22px}
a{color:inherit}
h1,h2,h3{margin:0 0 10px;font-family:"Georgia","Times New Roman",serif;letter-spacing:-.02em;line-height:1.08}
h1{font-size:clamp(2.4rem,4vw,4.35rem)}
h2{font-size:clamp(1.6rem,2.8vw,2.35rem)}
h3{font-size:1.18rem}
p{margin:0 0 10px}
.hero-surface,.panel{background:rgba(255,251,244,.9);backdrop-filter:blur(10px);border:1px solid var(--line);box-shadow:var(--shadow);border-radius:var(--radius-xl)}
.hero-surface{padding:28px}
.panel{padding:22px}
.panel.soft{background:rgba(255,247,236,.94)}
.panel.tint{background:linear-gradient(135deg,rgba(255,248,238,.98),rgba(243,235,225,.95))}
.hero-grid,.layout-split,.watch-grid,.cards,.metric-grid,.field-grid,.status-board,.feature-list,.recent-grid{display:grid;gap:14px}
.hero-grid{grid-template-columns:minmax(0,1.45fr) minmax(320px,.95fr);align-items:start}
.layout-split{grid-template-columns:minmax(0,1.35fr) minmax(300px,.9fr)}
.watch-grid{grid-template-columns:minmax(0,1.5fr) minmax(320px,.8fr);align-items:start}
.cards{grid-template-columns:repeat(auto-fit,minmax(260px,1fr))}
.metric-grid{grid-template-columns:repeat(auto-fit,minmax(150px,1fr))}
.feature-list{grid-template-columns:repeat(auto-fit,minmax(200px,1fr))}
.field-grid.two-up{grid-template-columns:repeat(auto-fit,minmax(230px,1fr))}
.status-board{grid-template-columns:repeat(auto-fit,minmax(150px,1fr))}
.stack,.form,.form-panel,.field,.script-shell,.progress-shell,.timeline,.info-list{display:grid;gap:16px}
.eyebrow{display:inline-flex;align-items:center;gap:8px;padding:7px 12px;border-radius:999px;background:#fff3e4;border:1px solid #f1d2b7;color:#9a4716;text-transform:uppercase;letter-spacing:.08em;font-size:12px;font-weight:700}
.lead{font-size:1.08rem;max-width:58ch;color:#314157}
.lead.small{font-size:1rem}
.muted{color:var(--muted)}
.toolbar,.row,.script-toolbar,.panel-head,.toggle-row,.info-row{display:flex;gap:12px;flex-wrap:wrap;align-items:center}
.panel-head,.script-toolbar,.info-row{justify-content:space-between}
.button,button{appearance:none;border:0;border-radius:999px;padding:12px 18px;background:linear-gradient(135deg,var(--brand),var(--brand-strong));color:#fff;font:inherit;font-weight:700;cursor:pointer;text-decoration:none;box-shadow:0 10px 24px rgba(202,106,43,.24);transition:transform .16s ease,box-shadow .16s ease}
.button:hover,button:hover{transform:translateY(-1px);box-shadow:0 14px 30px rgba(202,106,43,.28)}
.button.secondary,button.secondary,a.secondary{background:#edf2f7;color:var(--ink);box-shadow:none}
.button.ghost{background:transparent;color:var(--ink);border:1px solid var(--line-strong);box-shadow:none}
.status-chip,.pill,.helper-badge{display:inline-flex;align-items:center;padding:7px 12px;border-radius:999px;background:#fff;border:1px solid var(--line);font-size:12px;font-weight:700;color:#324156}
.helper-badge{padding:6px 10px;background:#f5efe7;border-color:#eadac3;color:#5d6572}
.status-chip.ok{border-color:#c8e3d4;background:#eef9f2;color:#1d684b}
.status-chip.warn{border-color:#f3d4be;background:#fff2e7;color:#9a4716}
.metric-card,.status-card,.highlight-box{padding:18px;border-radius:20px;border:1px solid var(--line);background:linear-gradient(180deg,#fffdf8,#fff5e9)}
.metric-card strong,.status-card strong{display:block;margin-bottom:4px;font-size:1.45rem;font-family:"Georgia","Times New Roman",serif}
.card{display:block;text-decoration:none;color:inherit;border:1px solid var(--line);border-radius:22px;overflow:hidden;background:rgba(255,253,248,.92);box-shadow:0 12px 32px rgba(34,23,11,.06)}
.thumb{aspect-ratio:9/16;background:#e9edf3 center/cover no-repeat}
.card-body{padding:16px}
.card-body h3{margin-bottom:6px}
.small-card{display:grid;grid-template-columns:110px 1fr;gap:14px;padding:12px;border:1px solid var(--line);border-radius:20px;background:#fff}
.small-thumb{aspect-ratio:9/16;border-radius:14px;background:#edf1f5 center/cover no-repeat}
.field label{font-weight:700;color:#223048}
.field-help{font-size:14px;color:var(--muted);margin:0}
input,textarea,select{width:100%;padding:13px 15px;border:1px solid #d8ccb9;border-radius:16px;font:inherit;background:#fffdf9;color:var(--ink);box-shadow:inset 0 1px 2px rgba(0,0,0,.02)}
input:focus,textarea:focus,select:focus{outline:none;border-color:#cf7a46;box-shadow:0 0 0 4px rgba(207,122,70,.12)}
textarea{min-height:250px;resize:vertical}
.script-guide{display:grid;gap:10px;padding:16px;border-radius:18px;background:#fff7ee;border:1px dashed #e9c9ac}
.voice-search{font-size:14px;padding:10px 12px;border-color:#e1d2bc;background:#fffaf5}
.toggle-row{padding:14px 16px;border-radius:18px;background:#fff8ef;border:1px solid var(--line)}
.toggle-row input{width:auto}
.status{padding:14px 16px;border-radius:16px;background:#fff4eb;border:1px solid #efcfb8}
.status.success{background:#eef9f2;border-color:#c8e3d4}
.empty-state{padding:20px;border-radius:20px;background:#fff9f1;border:1px dashed #e4ccb0}
.compact-list,.checklist{margin:0;padding-left:18px;color:#354459}
.compact-list li,.checklist li{margin:0 0 8px}
.bar{height:16px;background:#eadfce;border-radius:999px;overflow:hidden}
.bar>div{height:100%;width:0;background:linear-gradient(90deg,var(--brand),#f09a62);border-radius:inherit;transition:width .25s ease}
.timeline-step{display:flex;gap:12px;align-items:flex-start;padding:14px 16px;border-radius:18px;background:#fff;border:1px solid var(--line);transition:border-color .2s ease,transform .2s ease,box-shadow .2s ease}
.timeline-step span{display:grid;place-items:center;width:34px;height:34px;border-radius:50%;background:#edf2f7;font-weight:800;color:#516074;flex:0 0 auto}
.timeline-step.active{border-color:#efbb96;background:#fff7ef;transform:translateX(4px);box-shadow:0 10px 24px rgba(202,106,43,.12)}
.timeline-step.active span{background:var(--brand);color:#fff}
.timeline-step.done{border-color:#c8e3d4;background:#eef9f2}
.timeline-step.done span{background:var(--success);color:#fff}
.video-stage{padding:18px;border-radius:26px;background:linear-gradient(180deg,#1c2638,#0c1220);box-shadow:0 24px 55px rgba(15,20,31,.26)}
.video{width:100%;display:block;border:0;border-radius:18px;background:#000}
.info-row{padding:12px 0;border-bottom:1px solid #eee0cf}
.info-row:last-child{border-bottom:0}
.footer-note{font-size:14px}
.browser-modal{position:fixed;inset:0;background:rgba(23,32,51,.8);backdrop-filter:blur(8px);z-index:1000;display:grid;place-items:center;padding:20px;opacity:0;pointer-events:none;transition:opacity .2s ease}
.browser-modal.open{opacity:1;pointer-events:auto}
.browser-content{background:var(--cream);width:100%;max-width:1000px;height:85vh;border-radius:var(--radius-xl);display:grid;grid-template-columns:250px 1fr;overflow:hidden;box-shadow:0 40px 100px rgba(0,0,0,.4);border:1px solid var(--line)}
.browser-sidebar{background:var(--surface-soft);border-right:1px solid var(--line);padding:20px 0;display:flex;flex-direction:column;gap:16px;overflow-y:auto}
.sidebar-section{padding:0 20px}
.sidebar-title{font-size:11px;font-weight:800;color:var(--muted);text-transform:uppercase;letter-spacing:.1em;margin-bottom:8px}
.sidebar-item{display:flex;align-items:center;gap:10px;padding:8px 12px;border-radius:10px;cursor:pointer;font-size:14px;font-weight:600;transition:background .16s ease}
.sidebar-item:hover{background:#fff3e4}
.sidebar-item.active{background:var(--brand);color:#fff}
.browser-main{display:flex;flex-direction:column;overflow:hidden}
.browser-header{padding:22px;border-bottom:1px solid var(--line);background:var(--surface);display:flex;justify-content:space-between;align-items:center}
.browser-path-wrapper{display:flex;align-items:center;padding:12px 20px;background:var(--surface-soft);border-bottom:1px solid var(--line)}
.browser-path{font-family:monospace;font-size:13px;padding:8px 12px;background:#fff;border-radius:8px;border:1px solid var(--line);flex:1}
.browser-list{flex:1;overflow-y:auto;padding:12px}
.browser-item{display:grid;grid-template-columns:32px 1fr 100px;align-items:center;padding:10px 14px;border-radius:12px;cursor:pointer;transition:background .16s ease}
.browser-item:hover{background:#fff3e4}
.browser-icon{font-size:18px}
.browser-name{font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.browser-size{font-size:12px;color:var(--muted);text-align:right}
.browser-footer{padding:18px;border-top:1px solid var(--line);background:var(--surface-soft);display:flex;justify-content:flex-end;gap:12px}
@media(max-width:800px){.browser-content{grid-template-columns:1fr}.browser-sidebar{display:none}}
.asset-gallery{display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:12px;margin-top:10px}
.asset-item{padding:8px;border:1px solid var(--line);border-radius:14px;background:#fff;position:relative;text-align:center}
.asset-item .tag-copy{font-size:11px;font-family:monospace;background:#f5efe7;padding:4px;border-radius:4px;display:block;margin-top:4px;cursor:pointer}
.asset-item .tag-copy:hover{background:#efdfcf}
.browser-item.disabled{opacity:.5;cursor:not-allowed}
@media(max-width:980px){.hero-grid,.layout-split,.watch-grid{grid-template-columns:1fr}main{padding:24px 16px 48px}}
@media(max-width:640px){body{font-size:15px}.hero-surface,.panel{padding:18px;border-radius:22px}h1{font-size:2.15rem}.small-card{grid-template-columns:1fr}.script-toolbar,.panel-head,.info-row{align-items:flex-start}}
</style></head><body>
<nav class="top-nav">
  <div class="nav-content">
    <a href="/" class="nav-brand">
      <span style="background: linear-gradient(135deg, var(--brand), var(--brand-strong)); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">🎬</span>
      Automated Video Gen
    </a>
    <div class="nav-links">
      <a href="/" class="nav-link">Home</a>
      <a href="/#workspace" class="nav-link">Workspace</a>
      <a href="/#recent-videos" class="nav-link">Library</a>
      <a href="https://github.com/itsPremkumar/Automated-Video-Generator" target="_blank" class="nav-link" style="display:flex;align-items:center;">GitHub <span class="nav-badge">v1.0</span></a>
    </div>
  </div>
</nav>
<main>${body}</main>${script ? `<script>${script}</script>` : ''}</body></html>`;
}
