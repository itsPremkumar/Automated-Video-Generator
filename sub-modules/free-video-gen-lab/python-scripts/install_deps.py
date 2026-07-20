"""
One-click dependency installer for all AI video generation models.

Usage:
    python install_deps.py [--all | --minimal | --gpu-only]

Options:
    --all        Install all dependencies (default)
    --minimal    Install only essential: edge-tts, gtts
    --gpu-only   Install GPU model dependencies (diffusers, torch with CUDA)
"""

import subprocess
import sys
import platform

PACKAGES = {
    "core": [
        "edge-tts",
        "gtts",
    ],
    "gpu-models": [
        "torch",
        "torchvision",
        "torchaudio",
        "diffusers",
        "transformers",
        "accelerate",
        "huggingface-hub",
        "sentencepiece",
        "protobuf",
    ],
    "music": [
        "audiocraft",
        "soundfile",
    ],
    "extra": [
        "opencv-python",
        "imageio",
        "imageio-ffmpeg",
        "moviepy",
    ],
}

def run_pip(package: str):
    print(f"  Installing {package}...")
    result = subprocess.run(
        [sys.executable, "-m", "pip", "install", package],
        capture_output=True, text=True
    )
    if result.returncode != 0:
        print(f"  ⚠️ Failed: {result.stderr.split(chr(10))[-2]}")
        return False
    return True

def main():
    mode = sys.argv[1] if len(sys.argv) > 1 else "--all"

    print(f"{'='*60}")
    print(f"  Free Video Gen Lab - Dependency Installer")
    print(f"  Platform: {platform.system()} {platform.release()}")
    print(f"  Python: {sys.version.split()[0]}")
    print(f"  Mode: {mode}")
    print(f"{'='*60}\n")

    if mode in ("--all", "--minimal"):
        print("\n📦 Installing core packages...")
        for pkg in PACKAGES["core"]:
            run_pip(pkg)

    if mode in ("--all", "--gpu-only"):
        print("\n🎮 Installing GPU model dependencies...")
        print("  NOTE: This installs PyTorch with CUDA. "
              "For CPU-only, visit https://pytorch.org")

        # Check CUDA
        try:
            result = subprocess.run(["nvidia-smi"], capture_output=True, text=True)
            if result.returncode == 0:
                print("  ✅ NVIDIA GPU detected")
            else:
                print("  ⚠️ No NVIDIA GPU detected - models will run on CPU (slow)")
        except FileNotFoundError:
            print("  ⚠️ nvidia-smi not found - no GPU detected")

        for pkg in PACKAGES["gpu-models"]:
            run_pip(pkg)

        print("\n🎵 Installing music generation...")
        for pkg in PACKAGES["music"]:
            run_pip(pkg)

    if mode == "--all":
        print("\n🔧 Installing extra utilities...")
        for pkg in PACKAGES["extra"]:
            run_pip(pkg)

    print(f"\n{'='*60}")
    print("  ✅ Installation complete!")
    print(f"  Run 'python -c \"import torch; print(torch.cuda.is_available())\"' to verify GPU")
    print(f"{'='*60}")

if __name__ == "__main__":
    main()
