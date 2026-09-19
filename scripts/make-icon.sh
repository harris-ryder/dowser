#!/bin/sh
# Renders public/icon.svg to a 512x512 PNG for the Muse submission form (limit: 256 KiB).
set -e
cd "$(dirname "$0")/.."
if command -v rsvg-convert >/dev/null 2>&1; then
  rsvg-convert -w 512 -h 512 public/icon.svg -o public/icon.png
elif command -v convert >/dev/null 2>&1; then
  convert -background none -density 192 public/icon.svg -resize 512x512 public/icon.png
else
  echo "Need rsvg-convert (brew install librsvg) or ImageMagick to render the PNG." >&2
  exit 1
fi
ls -l public/icon.png
