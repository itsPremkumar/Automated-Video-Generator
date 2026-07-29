# Troubleshooting

## Common Issues

### "py" command not found on Windows
Try `python` instead of `py`, or install Python from [python.org](https://python.org).

### Edge-TTS voice generation fails
- Ensure Python dependencies are installed: `pip install -r requirements.txt`
- Check that `edge-tts` is installed: `python -m edge_tts --help`
- On Windows, the desktop app can fall back to offline speech synthesis

### No visuals found for scenes
- Check your `PEXELS_API_KEY` is set correctly in `.env`
- Ensure `OPENVERSE_ENABLED=true` for CC image fallback (no key required)
- Add local assets to `input/visuals/` as a fallback

### Remotion rendering hangs or crashes
- Ensure sufficient memory is available
- Check that FFmpeg is accessible (the project bundles `ffmpeg-static`)
- For Docker: ensure Chromium is installed

### GPU acceleration not working (`--gpu` flag)
- Run with `--verbose` to see encoder selection logs
- Check your GPU: AMD (AMF), NVIDIA (NVENC), or Intel (QSV) required
- Falls back to software encoding automatically if no GPU detected
- Set `GPU_ACCEL=true` in `.env` for persistent GPU mode

### Pipeline hangs or takes too long
- The built-in 30-minute watchdog (`AGENTIC_MAX_RUN_MS`) will abort stuck runs
- Check network connectivity for media downloads
- Set `AGENTIC_MAX_RUN_MS=0` to disable the watchdog (not recommended)
- Run with `--dry-run` to verify the plan before full execution

### Placeholder images appearing in output (solid colors)
- The pipeline now auto-rejects uniform-color images via `isUniformPlaceholderImage`
- This happens when stock providers return low-quality or missing visuals
- Try adding `PEXELS_API_KEY` for better stock media quality
- Add local assets to `input/visuals/` as a fallback

### Source attribution says "unknown" in rendered frames
- The pipeline now derives provider names from URL hosts (`sourceFromUrl`)
- If a URL doesn't match known providers, it falls back to `unknown`
- This is cosmetic only — the video renders correctly

### Portal doesn't open
- Check the terminal for errors
- Ensure port 3001 is not in use
- Try `http://localhost:3001/api/health` to verify the server is running

### TypeScript type errors
- Run `npx tsc --noEmit` for detailed error output
- Ensure you're using Node.js 18+

### agentic:clean leaves some files
- Run with `npm run agentic:clean` to clean temp workspace files
- Old workspaces up to `AGENTIC_KEEP_WORKSPACES` (default 25) are preserved
- Manually delete `workspace/jobs/` if disk space is critical

## Debugging

Enable verbose logging:
- Set `DEBUG_FF=1` in `.env` for verbose ffmpeg stderr
- Pass `--verbose` to `npm run agentic` for detailed pipeline logs
- Check `workspace/jobs/<jobId>/decisions-report.txt` for asset decisions

The project logs to stdout and `logs.txt`.

## Getting Help

- Search [existing issues](https://github.com/itsPremkumar/Automated-Video-Generator/issues)
- Open a [new issue](https://github.com/itsPremkumar/Automated-Video-Generator/issues/new/choose)
- Check the [FAQ](./faq.md)
