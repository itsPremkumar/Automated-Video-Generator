# Troubleshooting

Common issues and solutions for Automated Video Generator.

## FFmpeg Not Found

The project bundles `ffmpeg-static` and `ffprobe-static`. If they fail to load, ensure your system has FFmpeg installed globally:

- **Windows**: `winget install FFmpeg`
- **macOS**: `brew install ffmpeg`
- **Linux**: `sudo apt install ffmpeg`

## Voice Generation Fails

Ensure Python dependencies are installed:

```bash
pip install -r requirements.txt
```

On Windows, the desktop app falls back to offline Windows speech synthesis automatically.

## Portal Not Loading

Check that port 3001 is not in use. Set `PORT=3002` in `.env` to change it.

## Type Errors

Run `npm run typecheck` to verify TypeScript compilation.

For crash troubleshooting, see [CRASH-TROUBLESHOOTING.md](./CRASH-TROUBLESHOOTING.md).
