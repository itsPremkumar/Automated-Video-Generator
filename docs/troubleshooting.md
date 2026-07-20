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

### Portal doesn't open
- Check the terminal for errors
- Ensure port 3001 is not in use
- Try `http://localhost:3001/api/health` to verify the server is running

### TypeScript type errors
- Run `npx tsc --noEmit` for detailed error output
- Ensure you're using Node.js 18+

## Debugging

Enable verbose logging by checking the terminal output. The project logs to stdout and `logs.txt`.

## Getting Help

- Search [existing issues](https://github.com/itsPremkumar/Automated-Video-Generator/issues)
- Open a [new issue](https://github.com/itsPremkumar/Automated-Video-Generator/issues/new/choose)
- Check the [FAQ](./faq.md)
