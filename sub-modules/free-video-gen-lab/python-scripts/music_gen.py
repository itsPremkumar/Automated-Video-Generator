"""
Music Generation using MusicGen (Audiocraft)
https://github.com/facebookresearch/audiocraft

Usage:
    python music_gen.py --description "cinematic orchestral" --output output.wav --duration 10

Requirements:
    pip install audiocraft torch soundfile
"""

import argparse
import os
import sys

def generate_music(description: str, output_path: str, duration: int = 10,
                   model_size: str = "small"):
    try:
        import torch
        import soundfile as sf
        from audiocraft.models import MusicGen
    except ImportError:
        print("ERROR: audiocraft not installed. Run: pip install audiocraft torch soundfile")
        sys.exit(1)

    print(f"[MusicGen] Loading model facebook/musicgen-{model_size}...")
    model = MusicGen.get_pretrained(f'facebook/musicgen-{model_size}')
    model.set_generation_params(duration=duration)

    print(f"[MusicGen] Generating music...")
    print(f"  Description: {description}")
    print(f"  Duration: {duration}s")

    wav = model.generate([description])

    os.makedirs(os.path.dirname(output_path) or '.', exist_ok=True)
    sf.write(output_path, wav[0].cpu().numpy().T, 32000)

    print(f"[MusicGen] ✅ Music saved to {output_path}")
    print(f"RESULT:duration={duration}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Music Generation")
    parser.add_argument("--description", required=True, help="Music description")
    parser.add_argument("--output", default="output.wav", help="Output path")
    parser.add_argument("--duration", type=int, default=10)
    parser.add_argument("--model", default="small", choices=["small", "medium", "large"])

    args = parser.parse_args()
    generate_music(args.description, args.output, args.duration, args.model)
