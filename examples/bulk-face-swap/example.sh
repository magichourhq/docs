#!/usr/bin/env bash
# Requires curl 7.76+ and jq. Save as example.sh; run: bash example.sh
set -euo pipefail
: "${MAGIC_HOUR_API_KEY:?Set MAGIC_HOUR_API_KEY}"
API="https://api.magichour.ai/v1"

# Edit these request settings first.
# Set PROJECT_ID to resume a submitted job without creating another.
if [ -z "${PROJECT_ID:-}" ]; then
  : "${SOURCE_FACE_URL:?Set SOURCE_FACE_URL}"
  : "${TARGET_IMAGE_URL:?Set TARGET_IMAGE_URL}"
  payload=$(jq -n --arg SOURCE_FACE_URL "$SOURCE_FACE_URL" --arg TARGET_IMAGE_URL "$TARGET_IMAGE_URL" \
    '{
  "assets": {
    "face_swap_mode": "all-faces",
    "source_file_path": "",
    "target_file_path": ""
  },
  "name": "Batch Face Swap photo"
} | .assets.source_file_path = $SOURCE_FACE_URL | .assets.target_file_path = $TARGET_IMAGE_URL')
fi

retry_after_seconds() {
  value=$1
  case "$value" in
    "") return 1 ;;
    *[!0-9]*)
      if epoch=$(TZ=UTC date -d "$value" +%s 2>/dev/null) ||
        epoch=$(TZ=UTC date -j -f "%a, %d %b %Y %T GMT" "$value" +%s 2>/dev/null); then
        now=$(date +%s)
        seconds=$((epoch - now))
        if [ "$seconds" -lt 0 ]; then seconds=0; fi
        printf '%s' "$seconds"
        return 0
      fi
      return 1 ;;
    *) printf '%s' "$value" ;;
  esac
}

if [ -z "${PROJECT_ID:-}" ]; then
  # No automatic POST retries: a timeout can hide an accepted job.
  job=$(curl --fail-with-body --silent --show-error --max-time 60 \
    "$API/face-swap-photo" \
    -H "Authorization: Bearer $MAGIC_HOUR_API_KEY" \
    -H "Content-Type: application/json" --data "$payload")
  PROJECT_ID=$(printf '%s' "$job" | jq -er '.id')
  printf 'PROJECT_ID=%s\n' "$PROJECT_ID"
fi

deadline=$((SECONDS + 900))
delay=2
response_file=$(mktemp)
headers_file=$(mktemp)
trap 'rm -f "$response_file" "$headers_file"' EXIT
while [ "$SECONDS" -lt "$deadline" ]; do
  remaining=$((deadline - SECONDS))
  retry_budget=$((remaining * 1000 + 1))
  http_status=$(curl --silent --show-error --max-time 60 \
    --retry "$retry_budget" --retry-all-errors --retry-max-time "$remaining" \
    --dump-header "$headers_file" --output "$response_file" --write-out '%{http_code}' \
    "$API/image-projects/$PROJECT_ID" \
    -H "Authorization: Bearer $MAGIC_HOUR_API_KEY")
  result=$(<"$response_file")
  case "$http_status" in
    2??) ;;
    408|429|5??)
      remaining=$((deadline - SECONDS))
      [ "$remaining" -gt 0 ] || break
      retry_after=$(awk 'index($0, "HTTP/") == 1 { value="" } tolower($1) == "retry-after:" { $1=""; sub(/^[[:space:]]*/, ""); sub(/\r$/, ""); value=$0 } END { print value }' "$headers_file")
      if wait=$(retry_after_seconds "$retry_after"); then :; else wait=$delay; fi
      if [ "$wait" -lt "$remaining" ]; then sleep "$wait"; else sleep "$remaining"; fi
      delay=$((delay * 2))
      if [ "$delay" -gt 15 ]; then delay=15; fi
      continue ;;
    *) printf 'HTTP %s: %s\n' "$http_status" "$result" >&2; exit 1 ;;
  esac
  if ! status=$(printf '%s' "$result" | jq -er '.status'); then
    remaining=$((deadline - SECONDS))
    [ "$remaining" -gt 0 ] || break
    if [ "$delay" -lt "$remaining" ]; then sleep "$delay"; else sleep "$remaining"; fi
    delay=$((delay * 2))
    if [ "$delay" -gt 15 ]; then delay=15; fi
    continue
  fi
  case "$status" in
    complete)
      printf '%s' "$result" | jq -e '.downloads | length > 0' >/dev/null
      printf '%s' "$result" | jq '{id, status, credits_charged, downloads}'
      exit 0 ;;
    error|canceled)
      printf '%s\n' "$result" >&2
      exit 1 ;;
  esac
  sleep "$delay"
  delay=$((delay * 2))
  if [ "$delay" -gt 15 ]; then delay=15; fi
done
printf 'Still processing. Resume with PROJECT_ID=%s\n' "$PROJECT_ID" >&2
exit 1
