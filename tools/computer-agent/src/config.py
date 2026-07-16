"""
computer-agent — Advanced FREE asset generation by driving your laptop's apps
via cua-driver (computer_use). No paid AI keys: the agent "sees" through Hermes'
native vision on the captured screenshot, and acts through cua-driver clicks/keys.

Architecture
-----------
    Hermes (orchestrator, native vision)
        -> driver.py  (wraps `cua-driver call ...`)
            -> get_desktop_state  : capture screenshot (I look at it)
            -> click/scroll/type/press_key/launch_app : act on any app
        -> assets.py : high-level generators
            - capture_screen_asset   : screenshot of any window/app
            - drive_blender_render   : launch Blender, render a 3D scene -> video/image
            - drive_shotcut_edit     : launch Shotcut, assemble clips -> edited video
            - edit_captions_in_app   : open a caption/editor app, type subtitles
            - record_screen          : (optional) screen recording via start_recording
"""
import os

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ASSETS_DIR = os.path.join(PROJECT_ROOT, "assets")
WORKSPACE_DIR = os.path.join(PROJECT_ROOT, "workspace")
CUA = r"C:\Users\PREM KUMAR\AppData\Local\Programs\Cua\cua-driver\bin\cua-driver.exe"

for d in (ASSETS_DIR, WORKSPACE_DIR):
    os.makedirs(d, exist_ok=True)
