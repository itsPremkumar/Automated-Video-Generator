"""
demo_record.py — LIVE PROOF: open a website, navigate + type via computer_use,
and record the screen to an MP4 (free, no paid keys).

Steps:
  1. Launch Chrome to a target URL (cua-driver launch_app / os.open).
  2. Observe (screenshot) so Hermes can see the page.
  3. Act: focus the address bar / a text field and TYPE (real computer_use).
  4. While driving, record the desktop with ffmpeg gdigrab -> MP4.
  5. Stop, save the video asset.

Recording uses ffmpeg `gdigrab` (built into ffmpeg-static) so it works without
the driver's optional recorder. Safe: types only non-secret text.
"""
import os
import time
import subprocess

from src import config, driver, assets


def record_desktop(out_path: str, seconds: int, fps: int = 10) -> str:
    """Record the primary display to MP4 via ffmpeg gdigrab (Windows)."""
    ffmpeg = _ffmpeg_path()
    if not ffmpeg:
        raise RuntimeError("ffmpeg-static not found")
    cmd = [
        ffmpeg, "-y",
        "-f", "gdigrab", "-framerate", str(fps), "-i", "desktop",
        "-t", str(seconds),
        "-pix_fmt", "yuv420p", "-c:v", "libx264", "-preset", "ultrafast",
        out_path,
    ]
    proc = subprocess.Popen(cmd, creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0)
    return proc  # caller waits/terminates


def _ffmpeg_path() -> str | None:
    try:
        import ffmpeg_static
        return ffmpeg_static.find() if hasattr(ffmpeg_static, "find") else ffmpeg_static.ffmpeg
    except Exception:
        # fallback: walk up to the asset-creator node_modules (shared ffmpeg-static)
        import glob
        hits = glob.glob(r"C:\one\asset-creator\node_modules\ffmpeg-static\ffmpeg.exe")
        return hits[0] if hits else None


def run(target_url: str, type_text: str, record_seconds: int = 8,
        browser: str = "chrome") -> dict:
    result = {"steps": [], "video": ""}
    # 1) open website
    r = assets.launch_browser(target_url, browser=browser)
    result["steps"].append(("open", r))
    time.sleep(4)
    # 2) observe (Hermes sees the page)
    shot = driver.screenshot()
    result["steps"].append(("observe", shot))
    # 3) start recording BEFORE interacting
    vid = os.path.join(config.ASSETS_DIR, "recorded_session.mp4")
    os.makedirs(config.ASSETS_DIR, exist_ok=True)
    proc = record_desktop(vid, record_seconds)
    result["steps"].append(("record_start", vid))
    # 4) navigate: focus address bar (Ctrl+L) and type a search, then Enter
    driver.press_key("ctrl+l")
    time.sleep(1)
    driver.type_text(target_url)  # ensure URL present
    driver.press_key("enter")
    time.sleep(2)
    # 5) type into the page (e.g. a search box) — non-secret demo text
    driver.type_text(type_text)
    time.sleep(2)
    driver.press_key("enter")
    time.sleep(2)
    # 6) stop recording
    proc.wait(timeout=record_seconds + 10)
    result["steps"].append(("record_stop", vid))
    result["video"] = vid if os.path.exists(vid) and os.path.getsize(vid) > 0 else ""
    return result


if __name__ == "__main__":
    out = run(
        target_url="https://www.wikipedia.org",
        type_text="automated video generation",
        record_seconds=8,
    )
    print("VIDEO:", out["video"], "exists=", os.path.exists(out["video"]))
    for s in out["steps"]:
        print("STEP:", s[0], s[1] if isinstance(s[1], str) else "ok")
