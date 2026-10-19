# Wiring the Tutorials tab

Four edits, then it runs. Everything below assumes the conventions already in
`WebsiteBuilderPage.tsx` — `AppLayout`, `useAuth`, `supabaseClient`, `useVoice`,
lucide-react icons, Tailwind.

## 1. Files

```
src/pages/tutorials/TutorialsPage.tsx            new
src/pages/tutorials/FishMarketTutorialPage.tsx   new
public/tutorials/slides/*.png                    copy from the slides folder
public/tutorials/audio/                          empty for now (see §5)
```

## 2. Routes

Alongside the other lazy page imports:

```tsx
const TutorialsPage          = lazy(() => import('./pages/tutorials/TutorialsPage'));
const FishMarketTutorialPage = lazy(() => import('./pages/tutorials/FishMarketTutorialPage'));
```

```tsx
<Route path="/tutorials"              element={<TutorialsPage />} />
<Route path="/tutorials/fish-market"  element={<FishMarketTutorialPage />} />
```

## 3. Nav item

Wherever the nav array lives, between the AI section and Tech Skills:

```tsx
{ label: 'Tutorials', path: '/tutorials', icon: BookOpen },
```

## 4. Database

Run `sql/tutorial_progress.sql` in the Supabase SQL editor. It creates the table,
enables RLS with own-row-only policies, and adds a `tutorial_progress_summary`
view for cohort tracking.

## 5. Two route paths to check

The page opens two internal routes in a second tab. Confirm these match your
router and change the two string literals if not:

- `/ai-playground` — every swivel button
- `/website-builder` — the "Open the Website Builder" button on `do` steps

They are the only hard-coded paths in the component.

## 6. Narration

Narration uses `useVoice` — no audio files required, and the Pidgin toggle works
out of the box. Any step may set `audioUrl` to play a real recording instead;
if the file is missing or fails to load, it falls back to TTS silently.

Two steps are marked for a real recording rather than TTS, because a peer saying
*I could not do this either* does not survive being synthesised:

- `ep0-welcome` → `/tutorials/audio/divinegift-intro.mp3`
- the closing step of Episode 4, when it is written

## What is built and what is not

Episode 0 and Episode 1 are complete — 23 steps, four swivels, two gates.
Episodes 2–4 are listed with `available: false` so students see the shape of the
whole track without being able to skip ahead. Adding one is editing the `steps`
array; no component changes.

## Design decisions worth knowing before you edit

**Steps unlock in order.** A step is open only if every step before it is done.
This mirrors the gating on TechSkillsPage. It rules out skimming to the prompts
and pasting them without the reasoning, which is exactly what the track is
trying to prevent.

**Gates need artifacts, not checkboxes.** Episode 0 ends by asking for a GitHub
username; Episode 1 ends by asking for the published site URL, validated to
contain `/sites/`. Both are trivially checkable by a facilitator and impossible
to fake by clicking. When Episode 3 lands, its gate should be the
`github.io` address.

**Progress is local-first.** Everything writes to `localStorage` immediately and
mirrors to Supabase when signed in; the cloud copy is merged as a union, never
as a replacement, so work done on a bad connection is never lost. A signed-out
student can complete the whole track on one device.

**Swivels copy before they navigate.** The clipboard write happens first, then
the new tab opens. If the clipboard API is blocked, the visible copy button on
the prompt block is still there — the flow degrades rather than breaking.
