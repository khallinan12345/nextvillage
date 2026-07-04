import sys

FILE_PATH = "src/pages/DashboardPage.tsx"

def swap(src, old, new, label):
    count = src.count(old)
    if count != 1:
        print(f"❌ {label}: found {count} occurrence(s), expected exactly 1 — ABORTING, no changes written")
        sys.exit(1)
    print(f"✅ {label}")
    return src.replace(old, new, 1)

try:
    with open(FILE_PATH, "r") as f:
        src = f.read()
except FileNotFoundError:
    print(f"❌ Could not find {FILE_PATH} — run this from your repo root")
    sys.exit(1)

original = src

# ── Edit 1: drop the stale "Weekly" label, since the cadence is now 14 days ──
src = swap(
    src,
    '<span className="text-xs font-bold uppercase tracking-wide text-blue-600">Weekly Challenge</span>',
    '<span className="text-xs font-bold uppercase tracking-wide text-blue-600">Community Challenge</span>',
    "Edit 1/2 — drop stale 'Weekly' label",
)

# ── Edit 2: add a real end date alongside the existing "Xd left" countdown ──
old_countdown = '''                      {(() => {
                        const daysLeft = Math.ceil((new Date(weeklyChallenge.week_end).getTime() - Date.now()) / 86400000);
                        return daysLeft > 0
                          ? <span className="ml-auto text-xs text-gray-400">{daysLeft}d left</span>
                          : null;
                      })()}'''

new_countdown = '''                      {(() => {
                        const daysLeft = Math.ceil((new Date(weeklyChallenge.week_end).getTime() - Date.now()) / 86400000);
                        const endDateLabel = new Date(weeklyChallenge.week_end).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                        return daysLeft > 0
                          ? <span className="ml-auto text-xs text-gray-400">{daysLeft}d left · ends {endDateLabel}</span>
                          : null;
                      })()}'''

src = swap(src, old_countdown, new_countdown, "Edit 2/2 — add formatted end date next to countdown")

if src == original:
    print("\nNo changes made — something went wrong before any edits applied.")
    sys.exit(1)

with open(FILE_PATH, "w") as f:
    f.write(src)

print(f"\n✅ Both edits applied to {FILE_PATH}")
print("   Next: git diff src/pages/DashboardPage.tsx  (review before committing)")
