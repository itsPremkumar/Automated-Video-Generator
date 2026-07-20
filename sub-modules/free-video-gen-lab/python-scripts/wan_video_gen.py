"""
Wan2.1 Text-to-Video Generation
https://github.com/Wan-Video/Wan2.1

Usage:
    python wan_video_gen.py --prompt "A cat in a garden" --output output.mp4

Requirements:
    pip install diffusers transformers torch accelerate
"""

import argparse
import os
import sys

def generate_video(prompt: str, output_path: str, width: int = 480, height: int = 480,
                   num_frames: int = 81, fps: int = 16, negative_prompt: str = "",
                   num_inference_steps: int = 50, guidance_scale: float = 5.0,
                   model_id: str = "Wan-AI/Wan2.1-T2V-1.3B"):
    try:
        import torch
        from diffusers import WanPipeline
        from diffusers.utils import export_to_video
    except ImportError:
        print("ERROR: diffusers not installed. Run: pip install diffusers transformers torch accelerate")
        sys.exit(1)

    print(f"[Wan2.1] Loading model {model_id}...")
    pipe = WanPipeline.from_pretrained(model_id, torch_dtype=torch.float16)
    pipe.to("cuda")
    pipe.enable_model_cpu_offload()

    print(f"[Wan2.1] Generating video...")
    print(f"  Prompt: {prompt}")
    print(f"  Resolution: {width}x{height}")

    video = pipe(
        prompt=prompt,
        negative_prompt=negative_prompt or "blurry, low quality",
        num_frames=num_frames,
        width=width,
        height=height,
        num_inference_steps=num_inference_steps,
        guidance_scale=guidance_scale,
    ).frames[0]

    os.makedirs(os.path.dirname(output_path) or '.', exist_ok=True)
    export_to_video(video, output_path, fps=fps)

    duration = num_frames / fps
    print(f"[Wan2.1] ✅ Video saved to {output_path}")
    print(f"[Wan2.1] Duration: {duration:.1f}s")
    print(f"RESULT:duration={duration}")
    print(f"RESULT:fps={fps}")
    print(f"RESULT:width={width}")
    print(f"RESULT:height={height}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Wan2.1 Text-to-Video")
    parser.add_argument("--prompt", required=True, help="Text prompt")
    parser.add_argument("--output", default="output.mp4", help="Output path")
    parser.add_argument("--width", type=int, default=480)
    parser.add_argument("--height", type=int, default=480)
    parser.add_argument("--frames", type=int, default=81)
    parser.add_argument("--fps", type=int, default=16)
    parser.add_argument("--negative-prompt", default="blurry, low quality")
    parser.add_argument("--steps", type=int, default=50)
    parser.add_argument("--model", default="Wan-AI/Wan2.1-T2V-1.3B")

    args = parser.parse_args()
    generate_video(args.prompt, args.output, args.width, args.height,
                   args.frames, args.fps, args.negative_prompt,
                   args.steps, args.model)
