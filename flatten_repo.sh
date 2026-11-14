#!/usr/bin/env bash
# flatten_repo.sh - Flatten git tracked files into a single text file
# Usage: ./flatten_repo.sh [output_file] [repo_path]

set -euo pipefail

OUTPUT="${1:-flattened_repo.txt}"
REPO="${2:-.}"
MAX_SIZE_KB="${MAX_SIZE_KB:-500}"  # Skip files larger than this

cd "$REPO"

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "Error: '$REPO' is not a git repository" >&2
  exit 1
fi

> "$OUTPUT"

# Binary/large/irrelevant files to skip
SKIP_PATTERNS=(
  '*.png' '*.jpg' '*.jpeg' '*.gif' '*.ico' '*.svg' '*.webp'
  '*.pdf' '*.zip' '*.tar' '*.gz' '*.bz2' '*.xz' '*.7z'
  '*.woff' '*.woff2' '*.ttf' '*.eot' '*.otf'
  '*.mp3' '*.mp4' '*.wav' '*.avi' '*.mov'
  '*.so' '*.dll' '*.dylib' '*.exe' '*.bin' '*.o' '*.a'
  '*.lock' 'package-lock.json' 'yarn.lock' 'pnpm-lock.yaml' 'poetry.lock' 'Cargo.lock'
  '*.min.js' '*.min.css' '*.map'
)

should_skip() {
  local file="$1"
  for pattern in "${SKIP_PATTERNS[@]}"; do
    # shellcheck disable=SC2053
    [[ "$file" == $pattern ]] && return 0
  done
  return 1
}

# Header
{
  echo "# Repository Flattened"
  echo
  echo "Generated: $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
  echo "Repo: $(basename "$(git rev-parse --show-toplevel)")"
  echo "Commit: $(git rev-parse --short HEAD 2>/dev/null || echo 'no commits')"
  echo
  echo "---"
  echo
} >> "$OUTPUT"

COUNT=0
SKIPPED=0

while IFS= read -r file; do
  [ -f "$file" ] || continue

  if should_skip "$file"; then
    SKIPPED=$((SKIPPED + 1))
    continue
  fi

  # Skip files larger than MAX_SIZE_KB
  size_kb=$(du -k "$file" | cut -f1)
  if [ "$size_kb" -gt "$MAX_SIZE_KB" ]; then
    echo "  (skipped: ${size_kb}KB > ${MAX_SIZE_KB}KB)" >> "$OUTPUT"
    SKIPPED=$((SKIPPED + 1))
    continue
  fi

  # Skip binary files
  if ! grep -Iq . "$file" 2>/dev/null; then
    SKIPPED=$((SKIPPED + 1))
    continue
  fi

  {
    echo "## File: $file"
    echo '```'
    cat "$file"
    echo '```'
    echo
  } >> "$OUTPUT"

  COUNT=$((COUNT + 1))
done < <(git ls-files)

echo "✓ Flattened $COUNT files (skipped $SKIPPED) into: $OUTPUT"
echo "  Size: $(du -h "$OUTPUT" | cut -f1)"