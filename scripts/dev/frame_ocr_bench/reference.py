"""Read every second of a clip with the whole engine and store the answers.

Runs in the intelligence image:
    python reference.py <clip> <max_seconds> <out_dir>
Writes <out_dir>/reference.json: the lines of each second, and the decoded
size. measure.py and i2_check.py read it.
"""
import json
import os
import subprocess
import sys

from PIL import Image

sys.path.insert(0, "/app")
from app.video_frames import probe_geometry  # noqa: E402
from app.workers.frame_ocr import _ocr_image  # noqa: E402
from app.workers.ocr import _get_engine, run_engine  # noqa: E402


def main() -> None:
    path, limit, out = sys.argv[1], float(sys.argv[2]), sys.argv[3]
    os.makedirs(out, exist_ok=True)
    width, height, needs_scale = probe_geometry(path)
    vf = "fps=1" + (f",scale={width}:{height}" if needs_scale else "")
    process = subprocess.Popen(
        ["ffmpeg", "-v", "error", "-t", str(limit), "-i", path,
         "-map", "0:v:0", "-vf", vf, "-pix_fmt", "rgb24", "-f", "rawvideo", "-"],
        stdout=subprocess.PIPE,
    )
    engine = _get_engine()
    size = width * height * 3
    seconds = []
    while True:
        raw = process.stdout.read(size)
        if len(raw) < size:
            break
        image = _ocr_image(Image.frombytes("RGB", (width, height), raw))
        answer = run_engine(engine, image)
        seconds.append(list(getattr(answer, "txts", None) or ()))
    with open(os.path.join(out, "reference.json"), "w") as f:
        json.dump({"clip": os.path.basename(path), "seconds": seconds}, f,
                  ensure_ascii=False)
    print("reference", os.path.basename(path), len(seconds), flush=True)


if __name__ == "__main__":
    main()
