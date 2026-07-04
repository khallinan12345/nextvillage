#!/usr/bin/env python3
"""
patch_sonnet5_everywhere.py — replaces every occurrence of the retired
model string with Sonnet 5, across every file found by:

    grep -rln "claude-sonnet-4-20250514" supabase/ src/

Run from your repo root. Reports exactly what happened in each file —
how many occurrences were found and replaced. Does not guess: if a file
has zero occurrences (already fixed, or grep result is stale), it says so
and moves on rather than silently doing nothing.
"""

import sys

OLD_MODEL = "claude-sonnet-4-20250514"
NEW_MODEL = "claude-sonnet-4-6"

FILES = [
    "supabase/functions/weekly-champion-and-challenge/index.ts",
    "supabase/functions/evaluate-grand-challenge/index.ts",
    "supabase/functions/_archive_quick-responder/index.ts",
    "supabase/functions/evaluate-challenge-submission/index.ts",
    "supabase/functions/generate-weekly-challenges/index.ts",
    "supabase/functions/generate-champion-community-challenge-weekly/index.ts",
    "supabase/functions/select-grand-challenge-winner/index.ts",
    "src/pages/research/ResearchDataExplorer.tsx",
]

total_replacements = 0
files_touched = 0
files_missing = 0

for path in FILES:
    try:
        with open(path, "r") as f:
            content = f.read()
    except FileNotFoundError:
        print(f"⚠️  {path} — file not found, skipping")
        files_missing += 1
        continue

    count = content.count(OLD_MODEL)
    if count == 0:
        print(f"·  {path} — 0 occurrences (already fixed, or grep result was stale)")
        continue

    new_content = content.replace(OLD_MODEL, NEW_MODEL)
    with open(path, "w") as f:
        f.write(new_content)

    print(f"✅ {path} — replaced {count} occurrence(s)")
    total_replacements += count
    files_touched += 1

print(f"\nDone. {files_touched} file(s) updated, {total_replacements} total replacement(s), {files_missing} file(s) not found.")
print("Next: git diff  (review every change before committing — some of these files")
print("were never read in full during diagnosis, worth a real look before shipping.)")
