"""Optional torch import.

The VoiceBox server historically ``import torch`` at module load, which forces
the full PyTorch runtime (and ~1.5GB RAM) to be present even when only the
Kokoro / onnxruntime engines are used. On RAM-constrained or partially-broken
Python environments (e.g. a torch install whose native DLLs fail to load), that
hard dependency prevents the server from booting at all.

This shim imports real torch when it is usable, and otherwise exposes a benign
stub whose GPU queries all return ``False``/``None``. The Kokoro backend runs on
onnxruntime and never needs torch, so the server boots and serves multi-voice
TTS without the heavy dependency.
"""

from __future__ import annotations

import types


def _make_stub() -> types.ModuleType:
    stub = types.ModuleType("torch")

    class _Cuda:
        @staticmethod
        def is_available() -> bool:
            return False

        @staticmethod
        def get_device_name(_: int = 0) -> str:
            return ""

        @staticmethod
        def memory_allocated() -> int:
            return 0

    class _Backends:
        mps = _Cuda()

    class _Version:
        hip = None

    class _Xpu:
        @staticmethod
        def is_available() -> bool:
            return False

        @staticmethod
        def get_device_name(_: int = 0) -> str:
            return ""

    stub.cuda = _Cuda()
    stub.backends = _Backends()
    stub.version = _Version()
    stub.xpu = _Xpu()
    return stub


try:
    import torch  # type: ignore
    # Touch the attributes we rely on so a broken install raises here too.
    _ = (torch.cuda, torch.backends, torch.version, torch.xpu)
except Exception:  # pragma: no cover - environment without usable torch
    torch = _make_stub()  # type: ignore
