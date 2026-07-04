# Quick Start

## 1. Windows Desktop App (Easiest)

Download the [latest Windows installer](https://github.com/itsPremkumar/Automated-Video-Generator/releases/latest), double-click, and the app opens the web portal automatically.

## 2. One-Click Launcher (Windows)

```powershell
.\Start-Automated-Video-Generator.bat
```

This installs dependencies and opens the portal at `http://localhost:3001`.

## 3. Manual Setup

```bash
git clone https://github.com/itsPremkumar/Automated-Video-Generator.git
cd Automated-Video-Generator
npm install
pip install -r requirements.txt
cp .env.example .env
# Add PEXELS_API_KEY to .env
npm run dev
```

Open `http://localhost:3001`, paste your script, and generate.

## 4. Docker

```bash
docker run -p 3001:3001 ghcr.io/itspremkumar/automated-video-generator
```

## Next Steps

- Edit `input/input-scripts.json` with your scripts
- Run `npm run generate` for CLI batch mode
- See [docs/](docs/) for detailed guides
