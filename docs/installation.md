---
title: Installation Guide — Automated Video Generator
description: How to install and run the Automated Video Generator on Windows, macOS, and Linux. Includes standalone installer, one-click launcher, manual setup, and Docker.
---
# Installation Guide

How to install and run the Automated Video Generator on Windows, macOS, and Linux.

## Windows Standalone (Easiest)

Download the latest `.exe` installer from the [Releases page](https://github.com/itsPremkumar/Automated-Video-Generator/releases/latest). Double-click and follow the setup wizard. No Node.js or Python required.

## One-Click Launcher (Windows)

Clone the repo and double-click `Start-Automated-Video-Generator.bat`. The launcher handles dependency installation and starts the web portal automatically.

## Manual Setup (All Platforms)

```bash
git clone https://github.com/itsPremkumar/Automated-Video-Generator.git
cd Automated-Video-Generator
npm install
pip install -r requirements.txt
cp .env.example .env
npm run dev
```

Open `http://localhost:3001/` in your browser.

## Agentic Pipeline (Zero API Keys)

After `npm install`, you can generate videos immediately without any API keys:

```bash
npm run agentic -- --topic "5 benefits of drinking water" --orientation portrait
```

Output: `workspace/jobs/<jobId>/render/<jobId>.mp4`

See the [CLI Reference](cli-reference.md) for all 50+ commands and flags.

## Docker

```bash
docker compose up -d
```

## Next Steps

- [Usage Guide](usage.md) — Learn how to generate videos
- [Configuration](configuration.md) — Set up voices, API keys, and output settings
- [Troubleshooting](troubleshooting.md) — Fix common issues

See [SETUP.md](./SETUP.md) for detailed instructions.
