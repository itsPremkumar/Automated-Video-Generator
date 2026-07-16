# computer-agent — Advanced FREE asset generation via computer_use

Drive your laptop's apps (especially the **Chrome browser**) with cua-driver to
generate advanced assets — NO paid AI keys, NO GPU. The agent "sees" the screen
through Hermes' native vision on the captured screenshot, and acts via
cua-driver clicks/keys.

## Why this is "advanced" vs the ffmpeg-only asset-creator
`asset-creator` (ffmpeg) makes gradients/text/sine-tones. This project uses YOUR
COMPUTER as the compute surface:
- Launch **Chrome** → open free AI tools (HuggingFace Spaces SDXL, browser
  video/audio editors) → watch them render → capture the result as a real asset.
- Screenshot **any** app/window → real PNG image asset.
- Drive **Shotcut** (installed) headlessly via MLT → real multi-track video edit.
- Record the screen via cua-driver.

## Architecture
```
Hermes (orchestrator, native vision on screenshot)
   └─ src/driver.py  → wraps `cua-driver call <tool>`
        observe(): get_desktop_state (base64 PNG decoded to file)
        act():     click / scroll / type / press_key / launch_app / hotkey
   └─ src/assets.py → high-level generators
        launch_browser(url)        · generate_via_huggingface(prompt, space)
        capture_screen_asset()     · drive_shotcut_edit(clips)
        edit_captions_in_browser() · record_screen()
   └─ src/agent.py  → orchestrator loop (observe / act / generate)
```

## Verified facts (this machine)
- cua-driver 0.7.1 installed at `C:\Users\PREM KUMAR\AppData\Local\Programs\Cua\cua-driver\bin\cua-driver.exe`
- Chrome: `C:\Program Files\Google\Chrome\Application\chrome.exe` ✅
- Edge: `C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe` ✅
- Shotcut: `C:\Program Files\Shotcut\shotcut.exe` ✅
- Blender: NOT installed (removed per user instruction)
- 328 drivable apps discovered (Chrome, Edge, Clipchamp, Notepad, etc.)

## Critical gotcha (fixed)
`get_desktop_state` returns **base64 PNG** (`screenshot_png_b64`), NOT a file
path. `driver.screenshot()` decodes it to a real PNG. (Earlier bug wrote the
JSON dict into a .png → corrupt file; now fixed & tested.)

## Tests (gstack /health gate)
```
python -m pytest test/test_agent.py -q   # 5 passed
```
Covers: driver present, live screenshot capture (valid PNG), Chrome available,
safe-refuse-secret-typing, unknown-action refusal.

## Usage example (Hermes drives it)
```python
from src import agent
agent.generate("browser", url="https://huggingface.co/spaces/runwayml/stable-diffusion-v1-5")
shot = agent.observe()               # Hermes views the page
agent.act({"type":"click","x":..,"y":..})  # submit prompt in the Space
asset = agent.generate("capture_screen", name="ai_image")  # save result
```

## Safety
- SAFE_MODE refuses typing anything matching password/api_key/token/sk-.
- Never clicks credential/payment dialogs (guard hook present).
- All outputs go to this project's assets/ + workspace/ dirs — never your files.
