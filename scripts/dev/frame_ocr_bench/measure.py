"""Run the frame reader as built on a clip and score it against reference.json.

Runs in the intelligence image:
    python measure.py <clip> <max_seconds> <reference_dir>
Prints one JSON line: engine minutes per video hour (decoding excluded) and
the share of the reference's lines the stored segments catch. A line is a
recognised line with whitespace removed after NFKC, at least 2 characters;
lines that differ only by recognition jitter (similarity 0.8) count as one.
"""
import difflib
import json
import os
import subprocess
import sys
import time
import unicodedata

sys.path.insert(0, "/app")
import app.workers.frame_ocr as frame_ocr  # noqa: E402
import app.workers.ocr as ocr  # noqa: E402


def norm(line: str) -> str:
    return "".join(unicodedata.normalize("NFKC", line).split())


def cluster(lines: set[str]) -> tuple[int, dict[str, int]]:
    reps: list[str] = []
    label: dict[str, int] = {}
    for line in sorted(lines, key=len, reverse=True):
        for i, rep in enumerate(reps):
            if abs(len(rep) - len(line)) > max(2, len(rep) * 0.3):
                continue
            m = difflib.SequenceMatcher(None, rep, line, autojunk=False)
            if m.real_quick_ratio() >= 0.8 and m.quick_ratio() >= 0.8 and m.ratio() >= 0.8:
                label[line] = i
                break
        else:
            label[line] = len(reps)
            reps.append(line)
    return len(reps), label


def timed(module, name, spent):
    original = getattr(module, name)

    def wrapper(*args, **kwargs):
        start = time.perf_counter()
        try:
            return original(*args, **kwargs)
        finally:
            spent[0] += time.perf_counter() - start

    setattr(module, name, wrapper)


def clip_seconds(path: str, limit: float) -> float:
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration",
         "-of", "csv=p=0", path], capture_output=True, text=True,
    ).stdout.strip()
    return min(float(out), limit)


def main() -> None:
    path, limit, ref_dir = sys.argv[1], float(sys.argv[2]), sys.argv[3]
    with open(os.path.join(ref_dir, "reference.json")) as f:
        reference = json.load(f)
    truth = {norm(l) for second in reference["seconds"] for l in second if len(norm(l)) >= 2}

    spent = [0.0]
    for module in (ocr, frame_ocr):
        for name in ("detect_boxes", "recognise_boxes"):
            if hasattr(module, name):
                timed(module, name, spent)

    trimmed = os.path.join("/tmp", "bench_" + os.path.basename(path))
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-t", str(limit), "-i", path,
                    "-map", "0:v:0", "-c", "copy", trimmed], check=True)
    result = frame_ocr._read_video(trimmed, paused=None)
    seen = {norm(l) for s in result.segments for l in s.text.split("\n") if len(norm(l)) >= 2}

    total, label = cluster(truth | seen)
    truth_ids = {label[l] for l in truth}
    caught = {label[l] for l in seen} & truth_ids
    seconds = clip_seconds(path, limit)
    print(json.dumps({
        "clip": os.path.basename(path),
        "seconds": round(seconds),
        "engine_min_per_hour": round(spent[0] / seconds * 60, 2),
        "caught_share": round(len(caught) / max(1, len(truth_ids)), 3),
        "segments": len(result.segments),
    }, ensure_ascii=False), flush=True)


if __name__ == "__main__":
    main()
