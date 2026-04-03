# Quickstart Guide for Automated Video Generator

[Automated Video Generator](https://github.com/itsPremkumar/Automated-Video-Generator) now supports a browser-first workflow for normal users.

## Windows end-user flow

1. Double-click `Start-Automated-Video-Generator.bat`
2. Wait for the local browser portal to open
3. Save your `PEXELS_API_KEY` in the setup section
4. Click `Use Sample Script` or paste your own script
5. Click `Generate Video`
6. Wait on the live progress page
7. Open the watch page or download the MP4

## Developer flow

```bash
npm install
pip install -r requirements.txt
npm run dev
```

Then open:

```text
http://localhost:3001/
```

You can still use `input/input-scripts.json` with `npm run generate` for batch jobs, but the browser portal is now the easiest path for common users.
