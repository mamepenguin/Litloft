"""Check SPEC-ADDON-123 I2 on real frames with the real engine.

Runs in the intelligence image:
    python i2_check.py <clip> <max_seconds> [every_n_seconds]
For every n-th second, the lines of one engine(image) call must equal
recognise_boxes(detect_boxes(...)) with dropped boxes removed, in order.
Exits 1 and prints the first differing frames when any differ.
"""
import subprocess
import sys

from PIL import Image

sys.path.insert(0, "/app")
from app.video_frames import probe_geometry  # noqa: E402
from app.workers.frame_ocr import _ocr_image  # noqa: E402
from app.workers.ocr import _get_engine, detect_boxes, recognise_boxes, run_engine  # noqa: E402


def main() -> None:
    path, limit = sys.argv[1], float(sys.argv[2])
    every = int(sys.argv[3]) if len(sys.argv) > 3 else 10
    width, height, needs_scale = probe_geometry(path)
    vf = f"fps=1/{every}" + (f",scale={width}:{height}" if needs_scale else "")
    process = subprocess.Popen(
        ["ffmpeg", "-v", "error", "-t", str(limit), "-i", path,
         "-map", "0:v:0", "-vf", vf, "-pix_fmt", "rgb24", "-f", "rawvideo", "-"],
        stdout=subprocess.PIPE,
    )
    engine = _get_engine()
    size = width * height * 3
    frames = differing = 0
    while True:
        raw = process.stdout.read(size)
        if len(raw) < size:
            break
        image = _ocr_image(Image.frombytes("RGB", (width, height), raw))
        whole = list(getattr(run_engine(engine, image), "txts", None) or ())
        split = [t for t in recognise_boxes(engine, image, detect_boxes(engine, image)) if t is not None]
        frames += 1
        if whole != split:
            differing += 1
            if differing <= 3:
                print("DIFF at", frames * every, whole, split, flush=True)
    print(f"i2 {path.rsplit('/', 1)[-1]}: {frames} frames, {differing} differ", flush=True)
    sys.exit(1 if differing else 0)


if __name__ == "__main__":
    main()
