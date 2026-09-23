"""Record what a classifier answers, as the other side of the parity check.

Run inside the test image, against any revision:

    git show <sha>:backend/app/services/filetype.py > /tmp/parent.py
    python backend/scripts/record_classify_golden.py /tmp/parent.py > \
        backend/tests/fixtures/classify_golden.json

With no argument it records the working tree's own classifier, which makes the
fixture agree with the implementation and proves nothing. The point of the file
is that it came from a *different* implementation, so regenerate it from the
revision being compared against and diff the result.

The names are derived from a rule rather than listed, because a hand-listed set
is a set chosen where the claim survives: every probe here is one extension,
which is the one shape where `mimetypes.guess_type` and `Path.suffix` agree.
The compound names are what caught that.
"""

import importlib.util
import json
import mimetypes
import sys
from pathlib import Path

ENCODINGS = sorted(mimetypes.encodings_map)
COMPOUND_STEMS = ("notes.txt", "clip.mp4", "page.svg", "backup.tar", "sheet.csv")


def _load(path: str):
    spec = importlib.util.spec_from_file_location("classifier_under_record", path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def names(module) -> list[str]:
    exts = set(mimetypes.types_map) | set(mimetypes.common_types)
    exts |= set(getattr(module, "_EXTENSION_TABLE", {}))
    exts |= set(getattr(module, "_EXTRA_MIMES", {}))
    exts |= set(getattr(module, "_SUBTITLE_EXTENSIONS", ()))
    exts |= set(mimetypes.suffix_map)
    exts.add(".loft")

    out = ["sample" + e for e in sorted(exts)]
    # The dimension a one-extension probe cannot see.
    out += [stem + enc for stem in COMPOUND_STEMS for enc in ENCODINGS]
    # And the shapes an extension lookup can get wrong on its own.
    out += ["no-extension", ".gitignore", "trailing. ", "UPPER.MP4", "既定.md"]
    return out


def main() -> None:
    path = sys.argv[1] if len(sys.argv) > 1 else str(
        Path(__file__).resolve().parents[1] / "app" / "services" / "filetype.py"
    )
    module = _load(path)
    answers = {name: list(module.classify(name)) for name in names(module)}
    print(json.dumps(answers, indent=1, sort_keys=True))


if __name__ == "__main__":
    main()
