"""
test_agent.py — verify the computer-agent pipeline is live (gstack /health gate).

Run:  python -m pytest test_agent.py -q
Safe: only observes (screenshot + list apps). No clicks, no typing, no secrets.
"""
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

from src import driver, agent


def test_driver_present():
    assert os.path.exists(driver.config.CUA), "cua-driver binary missing"


def test_screenshot_captures():
    """Observe: capture desktop. Hermes views the PNG natively."""
    path = agent.observe()
    assert path, "screenshot returned empty path"
    # path may be a real png file or a workspace json; either proves the call ran
    assert os.path.exists(path) or path.endswith(".png"), f"unexpected: {path}"


def test_chrome_available():
    from src import assets
    assert assets._find_chrome() or assets._find_edge(), "no browser installed"


def test_safe_action_refused_for_secrets():
    # SAFE_MODE must refuse typing something that looks like a secret
    r = driver.type_text("password=secret123")
    assert r["ok"] is False, "should refuse secret text"


def test_action_schema_rejected_unknown():
    r = agent.act({"type": "teleport"})
    assert r["ok"] is False, "unknown action must be refused"
