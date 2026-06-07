import re, sys

path = "src/pages/DashboardPage.tsx"

with open(path, "r") as f:
    content = f.read()

# Remove conflict markers, keep HEAD side (between <<<<<<< and =======)
def resolve_keep_ours(text):
    pattern = re.compile(
        r"<<<<<<< [^\n]*\n(.*?)=======\n.*?>>>>>>> [^\n]*\n",
        re.DOTALL
    )
    resolved = pattern.sub(r"\1", text)
    remaining = len(re.findall(r"^<<<<<<<|^=======|^>>>>>>>", resolved, re.MULTILINE))
    return resolved, remaining

resolved, remaining = resolve_keep_ours(content)

if remaining > 0:
    print(f"WARNING: {remaining} conflict markers still remain — review manually.")
    sys.exit(1)

with open(path, "w") as f:
    f.write(resolved)

print("Done — conflict resolved, HEAD side kept.")
