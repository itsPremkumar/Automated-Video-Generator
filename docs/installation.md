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

## Docker

```bash
docker compose up -d
```

## Next Steps

- [Usage Guide](usage) — Learn how to generate videos
- [Configuration](configuration) — Set up voices, API keys, and output settings
- [Troubleshooting](troubleshooting) — Fix common issues

See [SETUP.md](./SETUP.md) for detailed instructions.
