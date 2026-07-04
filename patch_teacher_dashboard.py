import sys

FILE_PATH = "src/App.tsx"

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

# ── Edit 1: remove the now-unused AdminDashboard import ─────────────────────
src = swap(
    src,
    "import AdminDashboard from './pages/AdminDashboard';\n",
    "",
    "Edit 1/2 — remove unused AdminDashboard import",
)

# ── Edit 2: redirect the orphaned /teacher-dashboard route instead of ───────
#            rendering the mock-data page. Same pattern already used for
#            every other legacy route in this file.
src = swap(
    src,
    '<Route path="/teacher-dashboard" element={<AdminDashboard />} />',
    '<Route path="/teacher-dashboard" element={<Navigate to="/admin/student-dashboard" replace />} />',
    "Edit 2/2 — redirect /teacher-dashboard to the real admin dashboard",
)

if src == original:
    print("\nNo changes made — something went wrong before any edits applied.")
    sys.exit(1)

with open(FILE_PATH, "w") as f:
    f.write(src)

print(f"\n✅ Both edits applied to {FILE_PATH}")
print("   Next: git diff src/App.tsx  (review before committing)")
print("   After confirming, src/pages/AdminDashboard.tsx can be deleted entirely.")
