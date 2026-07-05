"""
CogVideoX Text-to-Video Generation
https://github.com/THUDM/CogVideo

Usage:
    python cogvideo_gen.py --prompt "A cat walking" --output output.mp4

Requirements:
    pip install diffusers transformers torch accelerate
"""

import argparse
import os
import sys

def generate_video(prompt: str, output_path: str, width: int = 720, height: int = 480,
                   num_frames: int = 49, fps: int = 8, negative_prompt: str = "",
                   num_inference_steps: int = 50, guidance_scale: float = 7.0,
                   model_id: str = "THUDM/CogVideoX-2B"):
    try:
        import torch
        from diffusers import CogVideoXPipeline
        from diffusers.utils import export_to_video
    except ImportError:
        print("ERROR: diffusers not installed. Run: pip install diffusers transformers torch accelerate")
        sys.exit(1)

    print(f"[CogVideoX] Loading model {model_id}...")
    pipe = CogVideoXPipeline.from_pretrained(model_id, torch_dtype=torch.float16)
    pipe.to("cuda")
    pipe.enable_model_cpu_offload()
    pipe.enable_attention_slicing()

    print(f"[CogVideoX] Generating video...")
    print(f"  Prompt: {prompt}")
    print(f"  Resolution: {width}x{height}")

    video = pipe(
        prompt=prompt,
        negative_prompt=negative_prompt or "blurry, low quality",
        num_videos_per_prompt=1,
        num_inference_steps=num_inference_steps,
        num_frames=num_frames,
        guidance_scale=guidance_scale,
        width=width,
        height=height,
    ).frames[0]

    os.makedirs(os.path.dirname(output_path) or '.', exist_ok=True)
    export_to_video(video, output_path, fps=fps)

    duration = num_frames / fps
    print(f"[CogVideoX] ✅ Video saved to {output_path}")
    print(f"[CogVideoX] Duration: {duration:.1f}s")
    print(f"RESULT:duration={duration}")
    print(f"RESULT:fps={fps}")
    print(f"RESULT:width={width}")
    print(f"RESULT:height={height}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="CogVideoX Text-to-Video")
    parser.add_argument("--prompt", required=True, help="Text prompt")
    parser.add_argument("--output", default="output.mp4", help="Output path")
    parser.add_argument("--width", type=int, default=720)
    parser.add_argument("--height", type=int, default=480)
    parser.add_argument("--frames", type=int, default=49)
    parser.add_argument("--fps", type=int, default=8)
    parser.add_argument("--negative-prompt", default="blurry, low quality")
    parser.add_argument("--steps", type=int, default=50)
    parser.add_argument("--model", default="THUDM/CogVideoX-2B")

    args = parser.parse_args()
    generate_video(args.prompt, args.output, args.width, args.height,
                   args.frames, args.fps, args.negative_prompt,
                   args.steps, args.model)
