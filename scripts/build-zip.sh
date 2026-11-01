#!/usr/bin/env bash
# Builds the Chrome Web Store upload ZIP with only the files the extension needs.
set -euo pipefail
cd "$(dirname "$0")/.."

version=$(python3 -c "import json; print(json.load(open('manifest.json'))['version'])")
out="dist/seo-checklist-v${version}.zip"
files=(manifest.json background.js popup.html popup.css popup.js report-print.js LICENSE
       icons/icon16.png icons/icon48.png icons/icon128.png)

for f in "${files[@]}"; do
  [ -f "$f" ] || { echo "Missing: $f" >&2; exit 1; }
done

mkdir -p dist
rm -f "$out"
zip -qX "$out" "${files[@]}"
echo "Built $out ($(du -h "$out" | cut -f1))"
