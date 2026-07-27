"""
remove_bg.py — remove background from an image using rembg (on-device AI).

Usage:
    python tools/remove_bg.py <input> <output> [--model u2net|isnet-general-use]

Zero-cost, runs entirely offline. Downloads the model on first use (~200 MB).
"""
import sys
import os
import argparse

def main():
    parser = argparse.ArgumentParser(description="Remove image background via rembg")
    parser.add_argument("input", help="Path to input image")
    parser.add_argument("output", help="Path to output image (PNG recommended)")
    parser.add_argument("--model", default="u2net",
                        choices=["u2net", "u2net_human_seg", "u2netp", "isnet-general-use"],
                        help="Rembg model to use (default: u2net)")
    args = parser.parse_args()

    if not os.path.isfile(args.input):
        print(f"ERROR: input not found: {args.input}", file=sys.stderr)
        sys.exit(1)

    os.makedirs(os.path.dirname(args.output) or ".", exist_ok=True)

    try:
        from rembg import remove, new_session
        session = new_session(args.model)
        with open(args.input, "rb") as f:
            input_data = f.read()
        output_data = remove(input_data, session=session)
        with open(args.output, "wb") as f:
            f.write(output_data)
        print(f"OK: {args.input} -> {args.output}")
    except Exception as e:
        print(f"ERROR: {e}", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()
