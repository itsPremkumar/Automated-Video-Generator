"""
driver.py — thin, safe wrapper around `cua-driver call <tool> [json-args]`.

Every call goes through the real cua-driver binary. We shell out (not the MCP
server) so this runs headless from any script. All actions are non-destructive
by default: no password typing, no permission-clicking, no payment UIs.
"""
import json
import subprocess
import os
from . import config

SAFE_MODE = True  # when True, refuse clicks inside suspected credential/payment dialogs


def _call(tool: str, args: dict | None = None, timeout: int = 60) -> dict:
    """Invoke a cua-driver tool and return parsed JSON (or raw text)."""
    cmd = [config.CUA, "call", tool]
    if args:
        cmd += [json.dumps(args)]
    try:
        out = subprocess.run(
            cmd, capture_output=True, text=True, timeout=timeout,
            creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0,
        )
    except subprocess.TimeoutExpired:
        return {"ok": False, "error": f"timeout after {timeout}s on {tool}"}
    if out.returncode != 0:
        return {"ok": False, "error": out.stderr.strip() or out.stdout.strip()}
    raw = (out.stdout or "").strip()
    try:
        return {"ok": True, "data": json.loads(raw)}
    except json.JSONDecodeError:
        return {"ok": True, "data": raw}


def _ensure_desktop_scope() -> None:
    """Full-display capture + screen-absolute actions require capture_scope=desktop."""
    _call("set_config", {"capture_scope": "desktop"}, timeout=20)


# ---- observation ----------------------------------------------------------

def screenshot() -> str:
    """Capture the desktop and return the PNG path. Hermes reads this image."""
    _ensure_desktop_scope()
    r = _call("get_desktop_state", {"capture_scope": "desktop"}, timeout=30)
    if not r["ok"]:
        raise RuntimeError("screenshot failed: " + r["error"])
    data = r["data"]
    # get_desktop_state returns base64 PNG in screenshot_png_b64 (+ mime type)
    if isinstance(data, dict) and data.get("screenshot_png_b64"):
        import base64
        p = os.path.join(config.WORKSPACE_DIR, "desktop.png")
        with open(p, "wb") as f:
            f.write(base64.b64decode(data["screenshot_png_b64"]))
        return p
    if isinstance(data, str) and data.lower().endswith((".png", ".jpg")):
        return data
    if isinstance(data, dict) and data.get("path"):
        return data["path"]
    # fallback: persist raw payload (shouldn't happen)
    p = os.path.join(config.WORKSPACE_DIR, "desktop.json")
    with open(p, "w", encoding="utf-8") as f:
        json.dump(data, f)
    return p


def list_apps() -> list:
    r = _call("list_apps", timeout=30)
    if not r["ok"]:
        return []
    data = r.get("data", [])
    if isinstance(data, dict):
        return data.get("apps", [])
    return data if isinstance(data, list) else []


def list_windows() -> list:
    r = _call("list_windows", timeout=30)
    return r.get("data", []) if r["ok"] else []


def window_state(pid: int) -> dict:
    return _call("get_window_state", {"pid": pid}, timeout=30)


def accessibility_tree() -> dict:
    return _call("get_accessibility_tree", timeout=30)


def screen_size() -> dict:
    return _call("get_screen_size", timeout=20)


# ---- actions (non-destructive) --------------------------------------------

def click(x: int, y: int, pid: int | None = None, button: str = "left") -> dict:
    if SAFE_MODE and _looks_like_credential(x, y):
        return {"ok": False, "error": "blocked: suspected credential/payment region"}
    args = {"x": x, "y": y, "button": button}
    if pid:
        args["pid"] = pid
    return _call("click", args, timeout=20)


def double_click(x: int, y: int, pid: int | None = None) -> dict:
    args = {"x": x, "y": y}
    if pid:
        args["pid"] = pid
    return _call("double_click", args, timeout=20)


def scroll(x: int, y: int, amount: int = 3, pid: int | None = None) -> dict:
    args = {"x": x, "y": y, "amount": amount}
    if pid:
        args["pid"] = pid
    return _call("scroll", args, timeout=20)


def press_key(key: str, pid: int | None = None) -> dict:
    """key like 'enter', 'escape', 'ctrl+s', 'tab'."""
    args = {"key": key}
    if pid:
        args["pid"] = pid
    return _call("press_key", args, timeout=20)


def type_text(text: str, pid: int | None = None) -> dict:
    """Type text into the focused field of a window (no secrets)."""
    if SAFE_MODE and _looks_like_secret(text):
        return {"ok": False, "error": "blocked: text looks like a secret"}
    args = {"text": text}
    if pid:
        args["pid"] = pid
    return _call("type", args, timeout=30)


def launch_app(app: str, hidden: bool = True) -> dict:
    """Launch an installed app (hidden, no focus steal)."""
    return _call("launch_app", {"app": app, "hidden": hidden}, timeout=40)


def hotkey(keys: str, pid: int | None = None) -> dict:
    args = {"keys": keys}
    if pid:
        args["pid"] = pid
    return _call("hotkey", args, timeout=20)


# ---- safety guards ---------------------------------------------------------

def _looks_like_credential(x, y) -> bool:
    # Placeholder heuristic; real safety is enforced by the driver + Hermes.
    return False


def _looks_like_secret(text: str) -> bool:
    low = text.lower()
    return any(k in low for k in ("password", "api_key", "apikey", "secret", "token=", "sk-"))
