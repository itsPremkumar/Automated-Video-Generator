"""
LTX-Video Text-to-Video Generation
https://github.com/Lightricks/LTX-Video

Usage:
    python ltx_video_gen.py --prompt "A cat dancing" --output output.mp4 --width 768 --height 768 --frames 49

Requirements:
    pip install diffusers transformers torch accelerate
"""

import argparse
import sys
import os

def generate_video(prompt: str, output_path: str, width: int = 768, height: int = 768,
                   num_frames: int = 49, fps: int = 24, negative_prompt: str = "",
                   num_inference_steps: int = 50, guidance_scale: float = 7.5):
    try:
        import torch
        from diffusers import LTXPipeline
        from diffusers.utils import export_to_video
    except ImportError:
        print("ERROR: diffusers not installed. Run: pip install diffusers transformers torch accelerate")
        sys.exit(1)

    print(f"[LTX-Video] Loading model Lightricks/LTX-Video...")
    pipe = LTXPipeline.from_pretrained("Lightricks/LTX-Video", torch_dtype=torch.bfloat16)
    pipe.to("cuda")
    pipe.enable_model_cpu_offload()
    pipe.enable_attention_slicing()

    print(f"[LTX-Video] Generating video...")
    print(f"  Prompt: {prompt}")
    print(f"  Resolution: {width}x{height}")
    print(f"  Frames: {num_frames}")

    video_frames = pipe(
        prompt=prompt,
        negative_prompt=negative_prompt or "blurry, low quality, distorted, ugly",
        width=width,
        height=height,
        num_frames=num_frames,
        num_inference_steps=num_inference_steps,
        guidance_scale=guidance_scale,
    ).frames[0]

    os.makedirs(os.path.dirname(output_path) or '.', exist_ok=True)
    export_to_video(video_frames, output_path, fps=fps)

    duration = num_frames / fps
    print(f"[LTX-Video] ✅ Video saved to {output_path}")
    print(f"[LTX-Video] Duration: {duration:.1f}s")
    print(f"RESULT:duration={duration}")
    print(f"RESULT:fps={fps}")
    print(f"RESULT:width={width}")
    print(f"RESULT:height={height}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="LTX-Video Text-to-Video")
    parser.add_argument("--prompt", required=True, help="Text prompt")
    parser.add_argument("--output", default="output.mp4", help="Output path")
    parser.add_argument("--width", type=int, default=768)
    parser.add_argument("--height", type=int, default=768)
    parser.add_argument("--frames", type=int, default=49)
    parser.add_argument("--fps", type=int, default=24)
    parser.add_argument("--negative-prompt", default="blurry, low quality")
    parser.add_argument("--steps", type=int, default=50)
    parser.add_argument("--guidance-scale", type=float, default=7.5)

    args = parser.parse_args()
    generate_video(args.prompt, args.output, args.width, args.height,
                   args.frames, args.fps, args.negative_prompt,
                   args.steps, args.guidance_scale)
