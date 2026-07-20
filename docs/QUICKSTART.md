# Quick Start — 5 Minutes to Your First Video

Choose the path that fits your setup:

---

## 🪟 Windows Desktop App (2 minutes)

1. Download the [latest Windows installer](https://github.com/itsPremkumar/Automated-Video-Generator/releases/latest)
2. Double-click the `.exe` file
3. The app launches the web portal at `http://localhost:3001`
4. Paste a script → Click **Generate Video** → Done

**No Node.js, Python, or terminal needed.** Everything is bundled.

---

## 📜 One-Click Launcher — Windows (3 minutes)

```powershell
.\Start-Automated-Video-Generator.bat
```

Or use PowerShell:

```powershell
.\Start-Automated-Video-Generator.ps1
```

**What it does automatically:**
- Installs Node.js and Python if missing (via `winget`)
- Creates `.env` from `.env.example`
- Installs all dependencies
- Starts the portal at `http://localhost:3001`

---

## 🛠️ Manual Setup — All Platforms (5 minutes)

```bash
# 1. Clone
git clone https://github.com/itsPremkumar/Automated-Video-Generator.git
cd Automated-Video-Generator

# 2. Install
npm install
pip install -r requirements.txt
cp .env.example .env

# 3. Add an API key (optional — Openverse works without one)
# Edit .env and set PEXELS_API_KEY=your_key

# 4. Start
npm run dev
```

Open **http://localhost:3001/** → Paste a script → Generate.

---

## 🐳 Docker (3 minutes)

```bash
docker run -p 3001:3001 \
  -v "$(pwd)/input:/app/input" \
  -v "$(pwd)/output:/app/output" \
  ghcr.io/itspremkumar/automated-video-generator
```

---

## 📦 npm / MCP Server (1 minute)

```bash
npx automated-video-generator
```

Connect Claude Desktop or Claude Code for AI-driven video creation.

---

## ⚡ Generate Your First Video

### Via Web Portal

1. Open `http://localhost:3001`
2. Save your `PEXELS_API_KEY` (or skip — Openverse works without one)
3. Paste this script:

```
Did you know that honey never spoils? Archaeologists have found pots of honey in ancient Egyptian tombs that are over 3,000 years old and still perfectly edible. The secret lies in honey's unique chemical composition — it's naturally acidic and low in moisture, creating an environment where bacteria simply cannot survive.
```

4. Click **Generate Video**
5. Wait for the progress to reach 100%
6. Watch or download your MP4

### Via CLI

Create `input/input-scripts.json`:

```json
[
  {
    "id": "quickstart-demo",
    "title": "My First Video",
    "orientation": "portrait",
    "language": "english",
    "script": "This is my first automated video. It was generated from a simple text script using free and open-source tools."
  }
]
```

Run:

```bash
npm run generate
```

Find your video in `output/quickstart-demo/final.mp4`.

---

## Next Steps

- [Explore examples →](../examples/)
- [Browse documentation →](../docs/)
- [View the roadmap →](./ROADMAP.md)
- [Learn how to contribute →](./CONTRIBUTING.md)
- [Star the repo →](https://github.com/itsPremkumar/Automated-Video-Generator)
