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

See [SETUP.md](./SETUP.md) for detailed instructions.
