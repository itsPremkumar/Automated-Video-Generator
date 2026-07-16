"""
agent.py — the orchestrator loop.

Hermes (this model) is the "brain": it calls `observe()` to get a screenshot,
reasons over what it sees, and calls an action. This module is the programmable
glue so a script can drive the loop deterministically; the actual *decisions*
are made by Hermes looking at the captured image (native vision).

Example use (Hermes drives it):
    from computer_agent.src import agent
    agent.observe()                      # returns screenshot path; Hermes views it
    agent.act({"type": "click", "x": 100, "y": 200})
    agent.generate("capture_screen", name="reference")
"""
from . import driver, assets, config


def observe() -> str:
    """Capture the desktop; Hermes reads the returned image natively."""
    return driver.screenshot()


def act(action: dict) -> dict:
    """
    Execute one computer action. action = {"type": ..., ...}
    Types: click, double_click, scroll, press_key, type, hotkey, launch_app.
    Safety: credential/payment regions are refused in driver.SAFE_MODE.
    """
    t = action.get("type")
    if t == "click":
        return driver.click(action["x"], action["y"], action.get("pid"), action.get("button", "left"))
    if t == "double_click":
        return driver.double_click(action["x"], action["y"], action.get("pid"))
    if t == "scroll":
        return driver.scroll(action["x"], action["y"], action.get("amount", 3), action.get("pid"))
    if t == "press_key":
        return driver.press_key(action["key"], action.get("pid"))
    if t == "type":
        return driver.type_text(action["text"], action.get("pid"))
    if t == "hotkey":
        return driver.hotkey(action["keys"], action.get("pid"))
    if t == "launch_app":
        return driver.launch_app(action["app"], action.get("hidden", True))
    return {"ok": False, "error": f"unknown action type: {t}"}


def generate(kind: str, **kwargs):
    """
    High-level asset generation. kind in:
      capture_screen, huggingface, shotcut_edit, captions, record, browser
    """
    if kind == "capture_screen":
        return assets.capture_screen_asset(**kwargs)
    if kind == "browser":
        return assets.launch_browser(**kwargs)
    if kind == "huggingface":
        return assets.generate_via_huggingface(**kwargs)
    if kind == "shotcut_edit":
        return assets.drive_shotcut_edit(**kwargs)
    if kind == "captions":
        return assets.edit_captions_in_browser(**kwargs)
    if kind == "record":
        return assets.record_screen(**kwargs)
    raise ValueError(f"unknown generation kind: {kind}")


def discover_apps() -> list:
    """List installed apps Hermes could drive."""
    return driver.list_apps()
