#!/usr/bin/env bash
# scripts/add-news.sh
# ─────────────────────────────────────────────────────────────────────────────
# Manage the nextVillage platform "What's New" banner from the terminal.
#
# SETUP (one time):
#   1. Add NEWS_API_SECRET to your .env.local (any long random string)
#   2. Add the same NEWS_API_SECRET to your Vercel environment variables
#   3. chmod +x scripts/add-news.sh
#
# USAGE:
#   Add a news item:
#     ./scripts/add-news.sh add \
#       --title "New feature" \
#       --body  "We just shipped X" \
#       --emoji "✨" \
#       --link  "/tech-skills/microsoft-ai900" \
#       --label "Try it now →"
#
#   List active news:
#     ./scripts/add-news.sh list
#
#   Remove a news item (by ID shown in list):
#     ./scripts/add-news.sh remove 3
#
# ─────────────────────────────────────────────────────────────────────────────

set -e

# ── Config ────────────────────────────────────────────────────────────────────
# Load from .env.local if present
if [ -f ".env.local" ]; then
  export $(grep -v '^#' .env.local | xargs)
fi

BASE_URL="${PLATFORM_URL:-https://www.nextvillage.community}"
SECRET="${NEWS_API_SECRET:-}"
ENDPOINT="${BASE_URL}/api/platform-news"

if [ -z "$SECRET" ]; then
  echo "❌  NEWS_API_SECRET is not set. Add it to .env.local or export it first."
  echo "    e.g.  export NEWS_API_SECRET=your-secret-here"
  exit 1
fi

# ── Command router ────────────────────────────────────────────────────────────
CMD="${1:-help}"
shift 2>/dev/null || true

case "$CMD" in

  # ── add ──────────────────────────────────────────────────────────────────────
  add)
    TITLE="" BODY="" EMOJI="" LINK="" LABEL=""
    while [[ $# -gt 0 ]]; do
      case "$1" in
        --title) TITLE="$2"; shift 2 ;;
        --body)  BODY="$2";  shift 2 ;;
        --emoji) EMOJI="$2"; shift 2 ;;
        --link)  LINK="$2";  shift 2 ;;
        --label) LABEL="$2"; shift 2 ;;
        *) echo "Unknown option: $1"; exit 1 ;;
      esac
    done

    if [ -z "$TITLE" ] || [ -z "$BODY" ]; then
      echo "❌  --title and --body are required."
      echo "    Usage: ./scripts/add-news.sh add --title \"...\" --body \"...\""
      exit 1
    fi

    # Build JSON payload
    PAYLOAD=$(jq -n \
      --arg title  "$TITLE" \
      --arg body   "$BODY" \
      --arg emoji  "$EMOJI" \
      --arg link   "$LINK" \
      --arg label  "$LABEL" \
      '{
        title:      $title,
        body:       $body,
        emoji:      (if $emoji != "" then $emoji else null end),
        link:       (if $link  != "" then $link  else null end),
        link_label: (if $label != "" then $label else null end)
      }'
    )

    echo "📡  Posting to ${ENDPOINT}..."
    RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$ENDPOINT" \
      -H "Content-Type: application/json" \
      -H "x-news-secret: $SECRET" \
      -d "$PAYLOAD")

    HTTP_CODE=$(echo "$RESPONSE" | tail -1)
    BODY_TEXT=$(echo "$RESPONSE" | head -n -1)

    if [ "$HTTP_CODE" = "201" ]; then
      ID=$(echo "$BODY_TEXT" | jq -r '.id // "unknown"')
      echo "✅  News item added (id: $ID)"
      echo "    Title: $TITLE"
    else
      echo "❌  Failed (HTTP $HTTP_CODE)"
      echo "    $BODY_TEXT"
      exit 1
    fi
    ;;

  # ── list ─────────────────────────────────────────────────────────────────────
  list)
    echo "📋  Fetching active news items from ${ENDPOINT}..."
    RESPONSE=$(curl -s "$ENDPOINT")
    COUNT=$(echo "$RESPONSE" | jq 'length')

    if [ "$COUNT" = "0" ]; then
      echo "   (no active news items)"
    else
      echo "$RESPONSE" | jq -r '.[] | "  [\(.id)] \(.emoji // "  ") \(.title)\n       \(.body | .[0:80])...\n"'
    fi
    ;;

  # ── remove ───────────────────────────────────────────────────────────────────
  remove)
    ID="${1:-}"
    if [ -z "$ID" ]; then
      echo "❌  Provide the news item ID to remove."
      echo "    Usage: ./scripts/add-news.sh remove 3"
      exit 1
    fi

    echo "🗑️   Deactivating news item id=${ID}..."
    RESPONSE=$(curl -s -w "\n%{http_code}" -X DELETE "${ENDPOINT}?id=${ID}" \
      -H "x-news-secret: $SECRET")

    HTTP_CODE=$(echo "$RESPONSE" | tail -1)
    if [ "$HTTP_CODE" = "200" ]; then
      echo "✅  News item ${ID} deactivated (hidden from banner)."
    else
      BODY_TEXT=$(echo "$RESPONSE" | head -n -1)
      echo "❌  Failed (HTTP $HTTP_CODE): $BODY_TEXT"
      exit 1
    fi
    ;;

  # ── help ─────────────────────────────────────────────────────────────────────
  help|*)
    cat <<'EOF'
nextVillage — News Banner Manager
───────────────────────────────────────────────────────────────────────────────

  Add a news item:
    ./scripts/add-news.sh add \
      --title "Microsoft AI-900 prep is live" \
      --body  "Full Socratic cert prep, free Nigerian voucher pathway inside." \
      --emoji "🎓" \
      --link  "/tech-skills/microsoft-ai900" \
      --label "Start prep →"

  List active news:
    ./scripts/add-news.sh list

  Remove a news item (use ID from list):
    ./scripts/add-news.sh remove 3

  Required env vars (add to .env.local):
    NEWS_API_SECRET=your-random-secret   # same value in Vercel env vars
    PLATFORM_URL=https://www.nextvillage.community  # optional override

EOF
    ;;
esac
