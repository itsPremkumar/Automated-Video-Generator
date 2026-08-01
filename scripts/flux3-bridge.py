#!/usr/bin/env python3
"""FLUX 3 bridge for the AVS pipeline — OPTIONAL backend, automatic fallback.

Runs under the Hermes Agent venv so it reuses Hermes' own Nous Portal auth and
the managed BFL tool-gateway transport (tools/flux3_video_tool.py) — the same
code path the bfl_flux3_* agent tools use, so "available" here means exactly
"available to Hermes" (free tier included since the 2026-07-31 open access).

The AVS TypeScript pipeline shells out to this script. FLUX 3 stays an option:
when the bridge reports unavailable, the pipeline falls back to its stock
visual stage unchanged.

Commands (JSON on stdout, exit 0):
  available
      -> {"available": true|false, "reason": "..."}
  generate --prompt P [--aspect 9:16|16:9|1:1|4:3|21:9|9:21|3:4|auto]
           [--duration 5..20] [--audio 0|1] [--out PATH]
      -> {"job_id", "status": "Ready", "saved_path"}
      or {"job_id", "status": "Failed|Timeout", "error": "..."}

Env:
  HERMES_REPO   hermes-agent checkout root (default: the standard Windows path)
  FLUX3_MAX_WAIT_SECONDS  total poll budget per clip (default 900)
"""
from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys
import time
from urllib.parse import quote

HERMES_REPO = os.environ.get("HERMES_REPO") or r"C:\Users\PREM KUMAR\AppData\Local\hermes\hermes-agent"
sys.path.insert(0, HERMES_REPO)

_ASPECTS = {"auto", "21:9", "16:9", "4:3", "1:1", "3:4", "9:16", "9:21"}


def _available() -> dict:
    try:
        from tools.flux3_video_tool import check_bfl_requirements

        ok = bool(check_bfl_requirements())
        return {"available": ok, "reason": "" if ok else "no Nous Portal sign-in (or gateway unreachable)"}
    except Exception as exc:  # pragma: no cover - defensive
        return {"available": False, "reason": f"{type(exc).__name__}: {exc}"}


async def _generate(prompt: str, aspect: str, duration: int, audio: bool, out: str) -> dict:
    from tools.flux3_video_tool import _endpoints, _handle_get_result, _submit

    endpoints = _endpoints()
    if endpoints is None:
        return {"error": "BFL video generation is not available in this build."}

    body = {
        "prompt": prompt,
        "aspect_ratio": aspect,
        "duration": duration,
        "generate_audio": audio,
        "resolution": "720p",
    }
    submit_resp = await _submit("text_to_video", body)
    try:
        payload = json.loads(submit_resp)
    except Exception as exc:
        return {"error": f"submit response unparsable: {type(exc).__name__}: {submit_resp[:400]}"}

    job_id = (payload.get("details") or {}).get("id")
    if not job_id:
        return {"error": f"submit did not return a job id: {submit_resp[:400]}"}

    deadline = time.monotonic() + int(os.environ.get("FLUX3_MAX_WAIT_SECONDS", "900"))
    last: dict = {}
    while time.monotonic() < deadline:
        raw = await _handle_get_result({"id": job_id, "save_to": out})
        try:
            payload = json.loads(raw)
        except Exception:
            payload = {}
        details = payload.get("details") or {}
        status = details.get("status")
        # The ready payload carries the path under details.saved_path (the
        # tool wrapper flattens it to top-level; the raw gateway payload does
        # not) — read both.
        saved = details.get("saved_path") or payload.get("saved_path")
        if status == "Ready" and saved:
            return {"job_id": job_id, "status": "Ready", "saved_path": saved}
        if status in ("Failed", "Error") or payload.get("error"):
            return {"job_id": job_id, "status": status or "Failed", "error": raw[:400]}
        last = payload
        await asyncio.sleep(5)

    return {"job_id": job_id, "status": "Timeout", "error": json.dumps(last)[:400] if last else "no poll response"}


def main() -> int:
    parser = argparse.ArgumentParser(description="FLUX 3 bridge for the AVS pipeline")
    sub = parser.add_subparsers(dest="command", required=True)

    sub.add_parser("available", help="report FLUX 3 availability")

    gen = sub.add_parser("generate", help="generate one FLUX 3 clip")
    gen.add_argument("--prompt", required=True)
    gen.add_argument("--aspect", default="16:9", choices=sorted(_ASPECTS))
    gen.add_argument("--duration", type=int, default=8)
    gen.add_argument("--audio", type=int, default=1, choices=(0, 1))
    gen.add_argument("--out", required=True)

    args = parser.parse_args()

    if args.command == "available":
        print(json.dumps(_available(), ensure_ascii=False))
        return 0

    if args.command == "generate":
        if args.duration < 5 or args.duration > 20:
            print(json.dumps({"error": "duration must be 5..20 seconds"}, ensure_ascii=False))
            return 1
        result = asyncio.run(
            _generate(args.prompt, args.aspect, args.duration, bool(args.audio), args.out)
        )
        print(json.dumps(result, ensure_ascii=False))
        return 0 if result.get("status") == "Ready" else 1

    return 1


if __name__ == "__main__":
    sys.exit(main())
