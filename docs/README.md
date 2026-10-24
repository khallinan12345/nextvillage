# nextVillage documents

| Folder | What is in it |
|---|---|
| `onboarding/` | Leader guide and training, core curriculum, and the guides for a new community |
| `child-protection/` | Child safeguarding policy and how the AI is kept safe |
| `privacy-and-legal/` | Privacy notice draft, learner privacy, and the public data-protection summary. The data map, DPIA, privacy plan, vendor and legal reviews are in the private repository |
| `fund-raising/` | Funder data-protection summary, impact summary, and how to let a funder try the platform |
| `evaluation/` | How students are evaluated |
| `platform-management/` | Change process, admin manual, duplicate-account runbook, process guides. The decision log, security program, scanner notes and incident runbook are in the private repository |
| `forms/` | Print-ready Word and PDF forms (consent, code of conduct, partnership agreement, My path card) |
| `templates/` | Markdown sources of those forms |

The document library on `/team` (`src/lib/teamDocs.ts`) and the review schedule in the database (`review_items.doc_path`) point at these paths. Update both when a file moves.

## Working documents are private

The data map, DPIA, privacy and compliance plan, vendor and legal reviews, security program and write-ups,
decision log and incident-response runbook are in the private repository `khallinan12345/nextvillage-private`,
with the same folder layout (`docs/privacy-and-legal/...`, `docs/platform-management/...`). Paths written in
other documents still refer to those files. The list of moved paths is `PRIVATE_PATHS` in
`src/lib/teamDocs.ts`; add a path there when you move another document, and the `/team` links follow.
Moving a file does not remove it from this repository's history, so never add real counts or personal
data to a public document.
