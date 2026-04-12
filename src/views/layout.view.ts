import { BRAND_COLOR, PROJECT_NAME, DEFAULT_SITE_DESCRIPTION, DEFAULT_SITE_KEYWORDS, APP_VERSION } from '../constants/config';
import { HtmlOptions } from '../types/server.types';

// ─── HTML Escaping Utilities ───────────────────────────────────────────────────

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

export function serializeJsonLd(jsonLd?: Record<string, unknown> | Array<Record<string, unknown>>, cspNonce?: string): string {
    if (!jsonLd) {
        return '';
    }

    const items = Array.isArray(jsonLd) ? jsonLd : [jsonLd];
    const nonceAttribute = cspNonce ? ` nonce="${escapeHtml(cspNonce)}"` : '';
    return items
        .map((item) => `<script type="application/ld+json"${nonceAttribute}>${JSON.stringify(item).replace(/</g, '\\u003c')}</script>`)
        .join('');
}

// ─── Main Layout Shell ────────────────────────────────────────────────────────

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
    const jsonLd = serializeJsonLd(options.jsonLd, options.cspNonce);
    const nonceAttribute = options.cspNonce ? ` nonce="${escapeHtml(options.cspNonce)}"` : '';

    return `<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(title)}</title>
    <link rel="icon" type="image/png" href="/logo.png">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">

    <!-- SEO Meta -->
    <meta name="description" content="${escapeHtml(description)}">
    <meta name="keywords" content="${escapeHtml(keywords)}">
    <meta name="robots" content="${escapeHtml(robots)}">
    <meta name="theme-color" content="${BRAND_COLOR}">
    <meta name="generator" content="${PROJECT_NAME}">

    <!-- Open Graph -->
    <meta property="og:site_name" content="${PROJECT_NAME}">
    <meta property="og:title" content="${escapeHtml(title)}">
    <meta property="og:description" content="${escapeHtml(description)}">
    <meta property="og:type" content="${escapeHtml(ogType)}">
    ${ogUrl}
    ${imageMeta}

    <!-- Twitter Card -->
    <meta name="twitter:card" content="${twitterCard}">
    <meta name="twitter:title" content="${escapeHtml(title)}">
    <meta name="twitter:description" content="${escapeHtml(description)}">

    <!-- Links -->
    <link rel="alternate" type="text/plain" href="/llms.txt" title="LLMs summary">
    ${canonical}
    ${jsonLd}

    <!-- Theme Initialization Script -->
    <script${nonceAttribute}>
        (function() {
            const savedTheme = localStorage.getItem('theme');
            const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
            const theme = savedTheme || systemTheme;
            document.documentElement.setAttribute('data-theme', theme);
        })();
    </script>

<style>
/* ═══════════════════════════════════════════════════════════════════════════
   DESIGN TOKENS
   ═══════════════════════════════════════════════════════════════════════════ */

:root {
    /* Brand Colors */
    --brand: ${BRAND_COLOR};
    --brand-strong: #4338CA;
    --brand-soft: rgba(79, 70, 229, 0.1);
    
    /* Functional Colors */
    --success: #10B981;
    --success-soft: rgba(16, 185, 129, 0.1);
    --warning: #F59E0B;
    --error: #EF4444;
    
    /* Light Mode Surfaces */
    --slate-50: #F8FAFC;
    --slate-100: #F1F5F9;
    --slate-200: #E2E8F0;
    --slate-300: #CBD5E1;
    --slate-400: #94A3B8;
    --slate-500: #64748B;
    --slate-600: #475569;
    --slate-700: #334155;
    --slate-800: #1E293B;
    --slate-900: #0F172A;
    --slate-950: #020617;

    /* Semantic Variables */
    --shell: var(--slate-50);
    --surface: #FFFFFF;
    --surface-soft: var(--slate-100);
    --line: var(--slate-200);
    --line-strong: var(--slate-300);
    --ink: var(--slate-900);
    --muted: var(--slate-500);
    
    /* Shadows & Glass */
    --glass-bg: rgba(255, 255, 255, 0.7);
    --glass-border: rgba(226, 232, 240, 0.6);
    --shadow-sm: 0 1px 2px 0 rgb(0 0 0 / 0.05);
    --shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1);
    --shadow-lg: 0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1);
    --shadow-xl: 0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1);
    
    /* Radius */
    --radius-xl: 24px;
    --radius-lg: 16px;
    --radius-md: 12px;
    --radius-sm: 8px;

    /* Semantic Surface Variants */
    --surface-gradient: linear-gradient(180deg, #fffdf8, #fff5e9);
    --card-bg: rgba(255, 253, 248, 0.92);
}

[data-theme="dark"] {
    --shell: var(--slate-950);
    --surface: var(--slate-900);
    --surface-soft: var(--slate-800);
    --line: var(--slate-800);
    --line-strong: var(--slate-700);
    --ink: var(--slate-100);
    --muted: var(--slate-400);
    --glass-bg: rgba(2, 6, 23, 0.8);
    --glass-border: rgba(30, 41, 59, 0.5);
    
    /* Dark mode specific radial gradients */
    --radial-1: rgba(79, 70, 229, 0.15);
    --radial-2: rgba(16, 185, 129, 0.1);

    --surface-gradient: linear-gradient(180deg, var(--slate-900), #020617);
    --card-bg: var(--slate-900);
}

/* ═══════════════════════════════════════════════════════════════════════════
   RESET & BASE
   ═══════════════════════════════════════════════════════════════════════════ */

* { box-sizing: border-box; }

html {
    background-color: var(--shell);
    scroll-behavior: smooth;
}

body {
    margin: 0;
    font-family: 'Inter', system-ui, -apple-system, sans-serif;
    font-size: 16px;
    line-height: 1.6;
    color: var(--ink);
    background-color: var(--shell);
    background-image: 
        radial-gradient(at 0% 0%, var(--radial-1, rgba(79, 70, 229, 0.05)) 0px, transparent 50%),
        radial-gradient(at 100% 0%, var(--radial-2, rgba(16, 185, 129, 0.05)) 0px, transparent 50%);
    min-height: 100vh;
}

/* Subtle grid pattern overlay */
body::before {
    content: "";
    position: fixed;
    inset: 0;
    background-image:
        linear-gradient(rgba(255,255,255,.18) 1px, transparent 1px),
        linear-gradient(90deg, rgba(255,255,255,.12) 1px, transparent 1px);
    background-size: 64px 64px;
    opacity: .16;
    pointer-events: none;
}

/* ═══════════════════════════════════════════════════════════════════════════
   NAVIGATION
   ═══════════════════════════════════════════════════════════════════════════ */

.top-nav {
    background: var(--glass-bg);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    border-bottom: 1px solid var(--glass-border);
    position: sticky;
    top: 0;
    z-index: 100;
    padding: 12px 24px;
    box-shadow: var(--shadow-sm);
}

.nav-content {
    max-width: 1180px;
    margin: 0 auto;
    display: flex;
    justify-content: space-between;
    align-items: center;
}

.nav-brand {
    font-size: 1.25rem;
    font-weight: 800;
    color: var(--ink);
    text-decoration: none;
    display: flex;
    align-items: center;
    gap: 10px;
    transition: transform 0.2s ease;
    letter-spacing: -0.02em;
}
.nav-brand:hover { transform: scale(1.02); }

.nav-links { display: flex; gap: 24px; align-items: center; }

.nav-link {
    text-decoration: none;
    color: var(--muted);
    font-weight: 600;
    font-size: 0.95rem;
    transition: color 0.15s ease;
}
.nav-link:hover { color: var(--brand-strong); }

.nav-badge {
    background: var(--brand-soft);
    color: var(--brand);
    padding: 2px 10px;
    border-radius: 999px;
    font-size: 0.7rem;
    font-weight: 700;
    margin-left: 8px;
    border: 1px solid rgba(79, 70, 229, 0.2);
}

/* ═══════════════════════════════════════════════════════════════════════════
   PAGE LAYOUT
   ═══════════════════════════════════════════════════════════════════════════ */

main {
    max-width: 1180px;
    margin: 0 auto;
    padding: 32px 20px 56px;
    position: relative;
}

section { margin-bottom: 22px; }
a { color: inherit; }

/* ═══════════════════════════════════════════════════════════════════════════
   TYPOGRAPHY
   ═══════════════════════════════════════════════════════════════════════════ */

h1, h2, h3 {
    margin: 0 0 12px;
    font-weight: 800;
    letter-spacing: -0.04em;
    line-height: 1.1;
    color: var(--ink);
}
h1 { font-size: clamp(2.5rem, 5vw, 4.5rem); }
h2 { font-size: clamp(1.75rem, 3vw, 2.5rem); }
h3 { font-size: 1.25rem; }
p  { margin: 0 0 10px; }

.eyebrow {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 6px 14px;
    border-radius: 999px;
    background: var(--brand-soft);
    border: 1px solid rgba(79, 70, 229, 0.15);
    color: var(--brand);
    text-transform: uppercase;
    letter-spacing: 0.1em;
    font-size: 11px;
    font-weight: 700;
}

.lead       { font-size: 1.08rem; max-width: 58ch; color: #314157; }
.lead.small { font-size: 1rem; }
.muted      { color: var(--muted); }

/* ═══════════════════════════════════════════════════════════════════════════
   SURFACES & PANELS
   ═══════════════════════════════════════════════════════════════════════════ */

.hero-surface, .panel {
    background: var(--surface);
    border: 1px solid var(--line);
    box-shadow: var(--shadow-lg);
    border-radius: var(--radius-xl);
}
.hero-surface { padding: 40px; }
.panel        { padding: 32px; }
.panel.soft   { background: var(--surface-soft); }
.panel.glass  { 
    background: var(--glass-bg); 
    backdrop-filter: blur(12px); 
    -webkit-backdrop-filter: blur(12px);
    border: 1px solid var(--glass-border);
}

/* ═══════════════════════════════════════════════════════════════════════════
   GRID SYSTEMS
   ═══════════════════════════════════════════════════════════════════════════ */

.hero-grid, .layout-split, .watch-grid, .cards, .metric-grid,
.field-grid, .status-board, .feature-list, .recent-grid, .studio-grid {
    display: grid;
    gap: 14px;
}

.hero-grid    { grid-template-columns: minmax(0, 1.45fr) minmax(320px, .95fr); align-items: start; }
.layout-split { grid-template-columns: minmax(0, 1.35fr) minmax(300px, .9fr); }
.watch-grid   { grid-template-columns: minmax(0, 1.5fr) minmax(320px, .8fr); align-items: start; }
.cards        { grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); }
.metric-grid  { grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); }
.feature-list { grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); }
.status-board { grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); }

/* Studio 3-column grid */
.studio-grid { grid-template-columns: 1.2fr 1fr 1fr; gap: 24px; align-items: start; }
@media (max-width: 1100px) { .studio-grid { grid-template-columns: 1fr 1fr; } }
@media (max-width: 768px)  { .studio-grid { grid-template-columns: 1fr; } }

.field-grid.two-up { grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); }

/* Vertical stacks */
.stack, .form, .form-panel, .field, .script-shell,
.progress-shell, .timeline, .info-list {
    display: grid;
    gap: 16px;
}

/* ═══════════════════════════════════════════════════════════════════════════
   FLEX UTILITIES
   ═══════════════════════════════════════════════════════════════════════════ */

.toolbar, .row, .script-toolbar, .panel-head, .toggle-row, .info-row {
    display: flex;
    gap: 12px;
    flex-wrap: wrap;
    align-items: center;
}
.panel-head, .script-toolbar, .info-row { justify-content: space-between; }

/* ═══════════════════════════════════════════════════════════════════════════
   BUTTONS
   ═══════════════════════════════════════════════════════════════════════════ */

.button, button {
    appearance: none;
    border: 0;
    border-radius: var(--radius-md);
    padding: 12px 24px;
    background: var(--brand);
    color: #fff;
    font: inherit;
    font-weight: 600;
    cursor: pointer;
    text-decoration: none;
    box-shadow: var(--shadow);
    transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
}
.button:hover, button:hover {
    background: var(--brand-strong);
    transform: translateY(-1px);
    box-shadow: var(--shadow-lg);
}
.button.secondary, button.secondary {
    background: var(--surface-soft);
    color: var(--ink);
    border: 1px solid var(--line);
    box-shadow: var(--shadow-sm);
}
.button.secondary:hover, button.secondary:hover {
    background: var(--line);
}
.button.ghost {
    background: transparent;
    color: var(--ink);
    border: 1px solid var(--line-strong);
    box-shadow: none;
}

/* ═══════════════════════════════════════════════════════════════════════════
   CHIPS, PILLS & BADGES
   ═══════════════════════════════════════════════════════════════════════════ */

.status-chip, .pill, .helper-badge {
    display: inline-flex;
    align-items: center;
    padding: 7px 12px;
    border-radius: 999px;
    background: var(--surface-soft);
    border: 1px solid var(--line);
    font-size: 12px;
    font-weight: 700;
    color: var(--ink);
}
.helper-badge {
    padding: 6px 10px;
    background: var(--brand-soft);
    border-color: var(--glass-border);
    color: var(--brand);
}
.status-chip.ok   { border-color: rgba(16, 185, 129, 0.2); background: var(--success-soft); color: var(--success); }
.status-chip.warn { border-color: rgba(245, 158, 11, 0.2); background: rgba(245, 158, 11, 0.1); color: var(--warning); }

/* ═══════════════════════════════════════════════════════════════════════════
   CARDS & METRIC CARDS
   ═══════════════════════════════════════════════════════════════════════════ */

.metric-card, .status-card, .highlight-box {
    padding: 18px;
    border-radius: 20px;
    border: 1px solid var(--line);
    background: var(--surface-gradient) !important;
}
.metric-card strong, .status-card strong {
    display: block;
    margin-bottom: 4px;
    font-size: 1.75rem;
    font-weight: 800;
    letter-spacing: -0.04em;
}

.card {
    display: block;
    text-decoration: none;
    color: inherit;
    border: 1px solid var(--line);
    border-radius: 22px;
    overflow: hidden;
    background: var(--card-bg);
    box-shadow: var(--shadow-lg);
}
.thumb       { aspect-ratio: 9/16; background: #e9edf3 center/cover no-repeat; }
.card-body   { padding: 16px; }
.card-body h3 { margin-bottom: 6px; }

.small-card {
    display: grid;
    grid-template-columns: 110px 1fr;
    gap: 14px;
    padding: 12px;
    border: 1px solid var(--line);
    border-radius: 20px;
    background: var(--surface);
}
.small-thumb {
    aspect-ratio: 9/16;
    border-radius: 14px;
    background: #edf1f5 center/cover no-repeat;
}

/* ═══════════════════════════════════════════════════════════════════════════
   FORM ELEMENTS
   ═══════════════════════════════════════════════════════════════════════════ */

.field label { font-weight: 700; color: var(--ink); }
.field-help  { font-size: 14px; color: var(--muted); margin: 0; }

input, textarea, select {
    width: 100%;
    padding: 12px 16px;
    border: 1px solid var(--line);
    border-radius: var(--radius-md);
    font: inherit;
    background: var(--surface);
    color: var(--ink);
    transition: all 0.2s ease;
}
input:focus, textarea:focus, select:focus {
    outline: none;
    border-color: var(--brand);
    box-shadow: 0 0 0 4px var(--brand-soft);
}
textarea { min-height: 250px; resize: vertical; }

.script-guide {
    display: grid;
    gap: 10px;
    padding: 16px;
    border-radius: 18px;
    background: var(--surface-soft);
    border: 1px dashed var(--line);
}
.voice-search {
    font-size: 14px;
    padding: 10px 12px;
    border-color: var(--line);
    background: var(--surface);
}

.toggle-row {
    padding: 14px 16px;
    border-radius: 18px;
    background: var(--surface-soft);
    border: 1px solid var(--line);
}
.toggle-row input { width: auto; }

/* ═══════════════════════════════════════════════════════════════════════════
   STATUS & FEEDBACK
   ═══════════════════════════════════════════════════════════════════════════ */

.status         { padding: 14px 16px; border-radius: 16px; background: var(--surface-soft); border: 1px solid var(--line); }
.status.success { background: var(--success-soft); border-color: var(--success); }
.empty-state    { padding: 20px; border-radius: 20px; background: var(--surface-soft); border: 1px dashed var(--line-strong); }

.compact-list, .checklist { margin: 0; padding-left: 18px; color: var(--ink); opacity: 0.9; }
.compact-list li, .checklist li { margin: 0 0 8px; }

/* ═══════════════════════════════════════════════════════════════════════════
   PROGRESS BAR & TIMELINE
   ═══════════════════════════════════════════════════════════════════════════ */

.bar {
    height: 16px;
    background: var(--line);
    border-radius: 999px;
    overflow: hidden;
}
.bar > div {
    height: 100%;
    width: 0;
    background: linear-gradient(90deg, var(--brand), #f09a62);
    border-radius: inherit;
    transition: width .25s ease;
}

.timeline-step {
    display: flex;
    gap: 12px;
    align-items: flex-start;
    padding: 14px 16px;
    border-radius: 18px;
    background: var(--surface);
    border: 1px solid var(--line);
    transition: border-color .2s ease, transform .2s ease, box-shadow .2s ease;
}
.timeline-step span {
    display: grid;
    place-items: center;
    width: 34px;
    height: 34px;
    border-radius: 50%;
    background: var(--surface-soft);
    font-weight: 800;
    color: var(--muted);
    flex: 0 0 auto;
}
.timeline-step.active {
    border-color: var(--brand);
    background: var(--brand-soft);
    transform: translateX(4px);
    box-shadow: var(--shadow-lg);
}
.timeline-step.active span { background: var(--brand); color: #fff; }
.timeline-step.done        { border-color: var(--success); background: var(--success-soft); }
.timeline-step.done span   { background: var(--success); color: #fff; }

/* ═══════════════════════════════════════════════════════════════════════════
   VIDEO PLAYER
   ═══════════════════════════════════════════════════════════════════════════ */

.video-stage {
    padding: 18px;
    border-radius: 26px;
    background: linear-gradient(180deg, #1c2638, #0c1220);
    box-shadow: 0 24px 55px rgba(15,20,31,.26);
}
.video {
    width: 100%;
    display: block;
    border: 0;
    border-radius: 18px;
    background: #000;
}

/* ═══════════════════════════════════════════════════════════════════════════
   INFO ROWS & FOOTER
   ═══════════════════════════════════════════════════════════════════════════ */

.info-row { padding: 12px 0; border-bottom: 1px solid #eee0cf; }
.info-row:last-child { border-bottom: 0; }
.footer-note { font-size: 14px; }

/* ═══════════════════════════════════════════════════════════════════════════
   FILE BROWSER MODAL
   ═══════════════════════════════════════════════════════════════════════════ */

.browser-modal {
    position: fixed;
    inset: 0;
    background: rgba(23,32,51,.8);
    backdrop-filter: blur(8px);
    z-index: 1000;
    display: grid;
    place-items: center;
    padding: 20px;
    opacity: 0;
    pointer-events: none;
    transition: opacity .2s ease;
}
.browser-modal.open { opacity: 1; pointer-events: auto; }

.browser-content {
    background: var(--surface);
    width: 100%;
    max-width: 1000px;
    height: 85vh;
    border-radius: var(--radius-xl);
    display: grid;
    grid-template-columns: 250px 1fr;
    overflow: hidden;
    box-shadow: 0 40px 100px rgba(0,0,0,.4);
    border: 1px solid var(--line);
}

.browser-sidebar {
    background: var(--surface-soft);
    border-right: 1px solid var(--line);
    padding: 20px 0;
    display: flex;
    flex-direction: column;
    gap: 16px;
    overflow-y: auto;
}
.sidebar-section { padding: 0 20px; }
.sidebar-title {
    font-size: 11px;
    font-weight: 800;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: .1em;
    margin-bottom: 8px;
}
.sidebar-item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 12px;
    border-radius: 10px;
    cursor: pointer;
    font-size: 14px;
    font-weight: 600;
    transition: background .16s ease;
}
.sidebar-item:hover  { background: var(--brand-soft); }
.sidebar-item.active { background: var(--brand); color: #fff; }

.browser-main { display: flex; flex-direction: column; overflow: hidden; }

.browser-header {
    padding: 22px;
    border-bottom: 1px solid var(--line);
    background: var(--surface);
    display: flex;
    justify-content: space-between;
    align-items: center;
}
.browser-path-wrapper {
    display: flex;
    align-items: center;
    padding: 12px 20px;
    background: var(--surface-soft);
    border-bottom: 1px solid var(--line);
}
.browser-path {
    font-family: monospace;
    font-size: 13px;
    padding: 8px 12px;
    background: var(--surface);
    border-radius: 8px;
    border: 1px solid var(--line);
    flex: 1;
    color: var(--ink);
}
.browser-list { flex: 1; overflow-y: auto; padding: 12px; }

.browser-item {
    display: grid;
    grid-template-columns: 42px 1fr 100px;
    align-items: center;
    padding: 10px 14px;
    border-radius: 12px;
    cursor: pointer;
    transition: background .16s ease;
}
.browser-item:hover    { background: var(--brand-soft); }
.browser-item.disabled { opacity: .5; cursor: not-allowed; }
.browser-icon { font-size: 18px; display: flex; align-items: center; justify-content: center; }
.browser-preview {
    width: 34px;
    height: 34px;
    object-fit: cover;
    border-radius: 6px;
    background: var(--surface-soft);
}
.browser-name { font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.browser-size { font-size: 12px; color: var(--muted); text-align: right; }

.browser-footer {
    padding: 18px;
    border-top: 1px solid var(--line);
    background: var(--surface-soft);
    display: flex;
    justify-content: flex-end;
    gap: 12px;
}

/* ═══════════════════════════════════════════════════════════════════════════
   ASSET GALLERY
   ═══════════════════════════════════════════════════════════════════════════ */

.asset-gallery {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
    gap: 12px;
    margin-top: 10px;
}
.asset-item {
    padding: 8px;
    border: 1px solid var(--line);
    border-radius: 14px;
    background: var(--surface);
    position: relative;
    text-align: center;
    transition: transform .16s ease, border-color .16s ease;
}
.asset-item:hover {
    transform: translateY(-2px);
    border-color: var(--brand);
}
.asset-preview {
    width: 100%;
    aspect-ratio: 16/9;
    object-fit: cover;
    border-radius: 8px;
    margin-bottom: 8px;
    background: var(--surface-soft);
    display: block;
}
.asset-item .tag-copy {
    font-size: 11px;
    font-family: monospace;
    background: var(--surface-soft);
    padding: 4px;
    border-radius: 4px;
    display: block;
    margin-top: 4px;
    cursor: pointer;
    color: var(--ink);
}
.asset-item .tag-copy:hover { background: #efdfcf; }
.asset-item .delete-btn {
    position: absolute;
    top: -8px;
    right: -8px;
    width: 22px;
    height: 22px;
    background: #ff4d4d;
    color: #fff;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    font-size: 12px;
    font-weight: bold;
    border: 2px solid #fff;
    box-shadow: 0 2px 6px rgba(0,0,0,0.15);
    opacity: 0;
    transition: all .2s ease;
    z-index: 10;
}
.asset-item:hover .delete-btn {
    opacity: 1;
}
.asset-item .delete-btn:hover {
    transform: scale(1.1);
    background: #e60000;
}

/* ═══════════════════════════════════════════════════════════════════════════
   RESPONSIVE BREAKPOINTS
   ═══════════════════════════════════════════════════════════════════════════ */

@media (max-width: 980px) {
    .hero-grid, .layout-split, .watch-grid { grid-template-columns: 1fr; }
    main { padding: 24px 16px 48px; }
}

@media (max-width: 800px) {
    .browser-content { grid-template-columns: 1fr; }
    .browser-sidebar { display: none; }
}

@media (max-width: 640px) {
    body { font-size: 15px; }
    .hero-surface, .panel { padding: 18px; border-radius: 22px; }
    h1 { font-size: 2.15rem; }
    .small-card { grid-template-columns: 1fr; }
    .script-toolbar, .panel-head, .info-row { align-items: flex-start; }
}
</style>
</head>
<body>

<!-- ─── Top Navigation Bar ─── -->
<nav class="top-nav">
    <div class="nav-content">
        <a href="/" class="nav-brand">
            <img src="/logo.png" alt="Logo" style="height:32px; width:auto; border-radius:6px;">
            Automated Video Gen
        </a>
        <div class="nav-links">
            <a href="/" class="nav-link">Home</a>
            <a href="/#workspace" class="nav-link">Workspace</a>
            <a href="/#recent-videos" class="nav-link">Library</a>
            <a href="https://github.com/itsPremkumar/Automated-Video-Generator" target="_blank" class="nav-link" style="display:flex;align-items:center;">
                GitHub <span class="nav-badge">v${APP_VERSION}</span>
            </a>
            <button id="theme-toggle" class="button secondary small" style="padding: 8px 12px; border-radius: 999px; width: 40px; height: 40px; display: flex; align-items: center; justify-content: center; font-size: 18px;" aria-label="Toggle Theme">
                <span class="theme-icon">🌓</span>
            </button>
        </div>
    </div>
</nav>

<!-- ─── Page Content ─── -->
<main>${body}</main>

<!-- Global Theme Controller -->
<script${nonceAttribute}>
    (function() {
        const toggle = document.getElementById('theme-toggle');
        if (!toggle) return;

        toggle.addEventListener('click', () => {
            const current = document.documentElement.getAttribute('data-theme');
            const target = current === 'dark' ? 'light' : 'dark';
            document.documentElement.setAttribute('data-theme', target);
            localStorage.setItem('theme', target);
        });
    })();
</script>

${script ? `<script${nonceAttribute}>${script}</script>` : ''}
</body>
</html>`;
}
