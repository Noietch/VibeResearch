#!/usr/bin/env bash
# Download the bundled embedding model (Xenova/all-MiniLM-L6-v2) from Hugging Face.
# Run this after cloning if the models/ directory is missing or incomplete.

set -euo pipefail

MODEL_DIR="$(cd "$(dirname "$0")/.." && pwd)/models/Xenova/all-MiniLM-L6-v2"
BASE_URL="https://huggingface.co/Xenova/all-MiniLM-L6-v2/resolve/main"

mkdir -p "$MODEL_DIR/onnx"

FILES=(
  "config.json"
  "tokenizer_config.json"
  "tokenizer.json"
  "onnx/model.onnx"
)

for file in "${FILES[@]}"; do
  dest="$MODEL_DIR/$file"
  if [ -f "$dest" ]; then
    echo "✓ $file already exists, skipping"
  else
    echo "↓ Downloading $file ..."
    curl -L --progress-bar -o "$dest" "$BASE_URL/$file"
    echo "✓ $file downloaded"
  fi
done

echo ""
echo "All model files are ready in $MODEL_DIR"
