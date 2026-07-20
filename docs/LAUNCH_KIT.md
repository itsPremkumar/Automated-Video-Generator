# 🚀 Launch Kit — Automated Video Generator

Copy-paste these. Post spaced over 2–3 weeks. Customize the [brackets].

---

## 1. Product Hunt (Ship on a Tuesday–Thursday, ~12:30pm PT)

**Title:** Automated Video Generator
**Tagline:** Turn any script into a narrated, stock-footage video — free, local, no API key.
**First comment:**
> Most "video generators" are SaaS paywalls. This one runs 100% on your machine:
> - Paste a script → get an MP4 with AI voiceover + stock media
> - No API key, no watermark, no monthly limit
> - Web portal, CLI, and MCP server for AI agents
> - MIT licensed
>
> Built with Remotion + Edge-TTS. Would love feedback from the PH community!

---

## 2. Hacker News — "Show HN"

**Title:** Show HN: A local, no-API-key tool that turns text scripts into videos

**Body:**
> I got tired of paying for video tools that watermark everything and cap my renders. So I built a pipeline that runs entirely locally:
>
> - Input: a text script (with `[Visual:]` tags) or a JSON job
> - It parses scenes, generates voiceovers via Edge-TTS, fetches Creative-Commons stock media (Pexels/Pixabay/Openverse), and renders with Remotion
> - Output: an MP4 + thumbnail, ready for YouTube Shorts / TikTok
>
> No cloud, no API key, MIT licensed. There's also a web portal and an MCP server so AI agents can drive it.
>
> Would appreciate thoughts on the architecture (hexagonal, four entry points) and what to add next.
>
> Repo: https://github.com/itsPremkumar/Automated-Video-Generator

---

## 3. Reddit (post separately to each, tailor the opener)

**r/selfhosted**
> Self-hosted an "AI video generator" that needs zero cloud accounts. Scripts in → MP4 out. MIT. Thoughts on the setup?

**r/YouTubeAutomation**
> Been using this open-source tool to batch-make faceless Shorts. No API key needed, runs locally, free. Sharing in case it helps others building channels.

**r/opensource**
> Released v5 of my MIT-licensed text-to-video pipeline. Looking for contributors — especially on the YouTube/TikTok upload adapters and more voice providers.

**r/SideProject**
> Built a tool that turns a script into a video in minutes, locally. Here's the demo + repo. What would make you actually use it?

---

## 4. X / Twitter (thread)

1/ Built a video generator that doesn't spy on you or charge you.
Paste a script → get a narrated, stock-footage MP4.
Local. No API key. MIT.
🧵👇

2/ Why? Every "AI video" tool is a subscription. This one:
• Runs on your laptop
• Edge-TTS voiceover (free)
• CC stock media (Pexels/Pixabay/Openverse)
• Remotion render
• Web UI + CLI + MCP

3/ Faceless YouTube / TikTok channels are the obvious use case.
Batch 30 Shorts from a niche script list while you sleep.

4/ It's open source. If you've wanted to start a content channel but hated the editing — this removes that step.
Repo: https://github.com/itsPremkumar/Automated-Video-Generator
Star it if useful ⭐

---

## 5. dev.to / Hashnode (blog post)

**Title:** "How I built a local, no-API-key text-to-video pipeline with Remotion + Edge-TTS"
Outline:
- The problem with SaaS video tools
- Architecture (hexagonal, 4 entry points)
- Parsing scripts into scenes
- Voiceover via Edge-TTS (Python)
- Stock media fetch + licensing
- Remotion render
- Lessons / what's next
Link the repo at the top and bottom.

---

## Pre-launch checklist
- [ ] Repo public, README sharp (done)
- [ ] Demo visual in README (done — assets/demo-flow.svg)
- [ ] Star History badge (done)
- [ ] At least 1 released binary / tag (tag v5.1)
- [ ] 3–5 good-first-issues open (see GOOD_FIRST_ISSUES.md)
- [ ] Reply to every comment within 24h for first 2 weeks

## Post-launch
- Pin a "what's next" comment asking for features → turn top requests into issues
- Thank every new contributor publicly
