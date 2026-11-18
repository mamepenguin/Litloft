#!/bin/bash
# Shipping gate of SPEC-ADDON-133/123 (spec item 10). Run on the host that holds
# the addon image to be measured:
#   run.sh <image> <clip_dir> <out_dir>
# <clip_dir> holds the seven clips under the names below. The container mounts
# only the clips (read only), this directory and <out_dir>; no data directory.
set -euo pipefail
image=$1; clips=$2; out=$3
here=$(cd "$(dirname "$0")" && pwd)
mkdir -p "$out"
run() {
  docker run --rm --entrypoint python -v "$clips":/clips:ro -v "$here":/bench:ro \
    -v "$out":/out -w /app "$image" "$@" 2>>"$out/stderr.log"
}
for spec in cooking:600 digimon:600 zoo:600 anime_en:600 timee:400 iosdc:600 java:600; do
  name=${spec%%:*}; limit=${spec##*:}
  [ -f "$out/$name/reference.json" ] || run /bench/reference.py "/clips/$name.mp4" "$limit" "/out/$name"
  run /bench/measure.py "/clips/$name.mp4" "$limit" "/out/$name" | tee -a "$out/measure.jsonl"
  status=0
  run /bench/i2_check.py "/clips/$name.mp4" "$limit" 10 | tee -a "$out/i2.txt" || status=$?
  echo "i2_check $name exit $status" | tee -a "$out/i2.txt"
done
