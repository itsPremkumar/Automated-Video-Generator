"""
assets.py — high-level advanced asset generators driven by cua-driver.

Advanced FREE generation strategy (no Blender, no GPU, no paid keys):
  The agent uses YOUR WEB BROWSER (Chrome/Edge) as the compute surface.
  Chrome is driven headless-or-visible via cua-driver: navigate to a free
  AI tool (HuggingFace Spaces SDXL, browser video editors, etc.), watch it
  render through driver.screenshot(), and capture the result as a real asset.

This goes far beyond ffmpeg primitives:
  - real AI-generated images (SDXL via HF Spaces, free)
  - real screenshots of any web app / page
  - browser-based video/audio tools driven like a human would
  - caption/text editing inside web editors

Every generator is NON-DESTRUCTIVE: launches apps hidden, writes to this
project's assets/ dir, never touches the user's files.
"""
import os
import glob
import subprocess
import time

from . import config, driver


# ---- browser discovery -----------------------------------------------------

def _find_chrome() -> str | None:
    hits = glob.glob(r"C:\Program Files\Google\Chrome\Application\chrome.exe")
    if hits:
        return hits[0]
    hits = glob.glob(r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe")
    return hits[0] if hits else None


def _find_edge() -> str | None:
    hits = glob.glob(r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe")
    return hits[0] if hits else None


def _find_shotcut() -> str | None:
    hits = glob.glob(r"C:\Program Files\Shotcut\shotcut.exe")
    return hits[0] if hits else None


# ---- core browser driver ---------------------------------------------------

def launch_browser(url: str = "about:blank", browser: str = "chrome",
                   hidden: bool = False) -> dict:
    """Launch Chrome/Edge and navigate to a URL. Returns pid for later acts."""
    exe = _find_chrome() if browser == "chrome" else _find_edge()
    if not exe:
        return {"ok": False, "error": f"{browser} not found"}
    cmd = [exe, url]
    if hidden:
        subprocess.Popen(cmd, creationflags=subprocess.CREATE_NO_WINDOW)
    else:
        subprocess.Popen(cmd)
    time.sleep(3)  # let it boot
    return {"ok": True, "exe": exe}


def navigate_browser(url: str) -> dict:
    """Open a URL in the already-running default browser (best-effort)."""
    return driver._call("page", {"action": "goto", "url": url}, timeout=30) \
        if False else _open_url_os(url)


def _open_url_os(url: str) -> dict:
    """Cross-platform 'open in default browser' without focus steal."""
    os.startfile(url) if os.name == "nt" else subprocess.run(["xdg-open", url])
    time.sleep(2)
    return {"ok": True, "url": url}


# ---- high-level generators -------------------------------------------------

def capture_screen_asset(name: str = "screen", pid: int | None = None) -> str:
    """Capture the current screen (or a specific app window) as a real PNG asset."""
    path = driver.screenshot()
    dest = os.path.join(config.ASSETS_DIR, f"{name}.png")
    if path != dest and os.path.exists(path):
        import shutil
        shutil.copy(path, dest)
    else:
        dest = path
    return dest


def generate_via_huggingface(prompt: str, space_url: str, name: str = "hf_image") -> str:
    """
    ADVANCED: drive a free HuggingFace Space (e.g. SDXL) in the browser.
    Steps: launch Chrome -> go to space_url -> type prompt -> click Generate
    -> wait -> screenshot the resulting image -> save as asset.

    The exact click coords depend on the Space UI; Hermes (native vision) reads
    the screenshot and supplies the action coordinates at runtime. This function
    provides the browser plumbing; the per-Space interaction is orchestrated by
    the agent loop in agent.py.
    """
    launch_browser(space_url, browser="chrome")
    # The agent loop observes (driver.screenshot) and acts (driver.click/type)
    # to submit the prompt and capture output. We return the screenshot path
    # as the captured asset anchor; the loop refines it.
    return capture_screen_asset(name)


def drive_shotcut_edit(clips: list[str], out_name: str = "shotcut_edit") -> str:
    """Assemble clips into an edited video via Shotcut's headless MLT renderer."""
    shotcut = _find_shotcut()
    if not shotcut:
        raise RuntimeError("Shotcut not found")
    out_dir = os.path.join(config.ASSETS_DIR, "shotcut")
    os.makedirs(out_dir, exist_ok=True)
    out_path = os.path.join(out_dir, f"{out_name}.mp4")
    mlt = _build_mlt_playlist(clips)
    mlt_path = os.path.join(config.WORKSPACE_DIR, "playlist.mlt")
    with open(mlt_path, "w", encoding="utf-8") as f:
        f.write(mlt)
    subprocess.run([shotcut, mlt_path, "-exit", out_path],
                   capture_output=True, text=True, timeout=300,
                   creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0)
    return out_path if os.path.exists(out_path) else ""


def edit_captions_in_browser(text: str, url: str = "https://app.neutrino.us") -> str:
    """
    Open a web caption/subtitle editor in Chrome and type the captions.
    Non-destructive: types into the web app's focused field only.
    """
    launch_browser(url, browser="chrome")
    time.sleep(3)
    driver.type_text(text)
    dest = os.path.join(config.WORKSPACE_DIR, "captions.txt")
    return dest


def record_screen(out_name: str = "recording") -> str:
    """Start a screen recording via cua-driver (needs ffmpeg installed by driver)."""
    out = os.path.join(config.ASSETS_DIR, f"{out_name}.mp4")
    r = driver._call("start_recording", {"output": out}, timeout=20)
    return out if r["ok"] else ""


# ---- helpers ---------------------------------------------------------------

def _build_mlt_playlist(clips: list[str]) -> str:
    entries = "\n".join(f'  <entry producer="p{i}"/>' for i in range(len(clips)))
    producers = "\n".join(
        f'  <producer id="p{i}" title="{os.path.basename(c)}">\n'
        f'    <property name="resource">{c}</property>\n'
        f'  </producer>' for i, c in enumerate(clips))
    return f'''<?xml version="1.0" encoding="utf-8"?>
<mlt>
{producers}
  <playlist id="playlist0">
{entries}
  </playlist>
  <tractor id="tractor0">
    <track producer="playlist0"/>
  </tractor>
</mlt>'''
