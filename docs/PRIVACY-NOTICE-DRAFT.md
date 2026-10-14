# nextVillage privacy notice: DRAFT for attorney review

Status: working draft, 14 October 2026. Written from `docs/DATA-MAP.md` (what we hold, who else sees it,
how long we keep it). **Not legal advice and not yet published.** Items in **[brackets]** are decisions
or facts Kevin must confirm before this goes live. A privacy attorney should read it before it is
published or before we open in the US, UK or EU (COPPA, GDPR Article 8, UK Children's Code, state
children's privacy laws; Nigeria NDPA, Kenya DPA, South Africa POPIA for the current footprint).

The notice is written to be readable by a 13-year-old. A shorter version for parents follows at the end.

---

## What nextVillage is

nextVillage is a learning platform run by **[legal entity name, address, contact email]**. Students use
it to learn AI, coding and entrepreneurship skills and to do projects that help their own community.

## What we collect

- **About you:** your name, email, username, school, town or city, country, the year you were born,
  your picture if you add one, and which group (organization) you belong to.
- **What you do here:** your answers, reflections, projects, chats with the AI helper, code you run,
  images, audio and video you make, certificates, scores, and which pages you visit.
- **Messages to other learners** in Together rooms.
- **About other people, if you enter it for a community project:** for example a patient, farmer or
  business owner you help. Only enter what your leader has told you to enter, and only with that
  person's agreement. **[Practice and wording for consent at the point of entry: decision needed.]**

We ask only for your **birth year**, not your full birthday. We use it to give younger learners
age-appropriate protections and to follow the law.

## Why we use it

To run your account, teach and give feedback, keep learners safe, show your leader how the group is
doing, and report progress (in grouped form) to the people who fund the program. **We do not sell
personal information and we do not show advertising.**

## Who else receives it

Some services handle data for us. We remove names and contact details from what you type before it is
sent to an AI service. One exception, on purpose: a safety check reads your latest message as you wrote
it, so that a leader can help if someone may be in danger.

| Service | What it does | Receives |
|---|---|---|
| Supabase | stores accounts, work and files | everything above |
| Vercel | runs the website | web traffic |
| Anthropic | AI tutor, feedback, safety check | cleaned chat text; learner work for feedback; raw latest message for safety |
| OpenAI | some task instructions and feedback | learner prompts and code |
| Free AI services (Groq, Cerebras, Cloudflare, OpenRouter, Mistral) | AI tutor on free pages | cleaned chat text **[vendor terms not yet reviewed]** |
| E2B | runs the code you write in a safe sandbox | your code |
| Replicate | makes images, video, voice | cleaned prompts and text |
| ElevenLabs / SpeechGen | reads text aloud | the text to read **[confirm]** |
| Resend | sends emails | leader emails; safety alerts |
| StackBlitz | live preview of your project | your project code |

Most of these are in the United States, so your information may be stored or processed outside your
country. **[Transfer mechanism wording depends on the regions we serve: attorney.]**

## Who inside nextVillage can see it

Your leader and the administrators of your organization can see your work, your progress, and safety
alerts about you. Other learners can see your first name and last initial on leaderboards, and what you
share in Together rooms. A certificate link can be opened by anyone you give it to.

## Safety

Messages in Together rooms and AI chats are checked automatically for signs of self-harm, threats or
hateful content. When something is flagged, your leader is told. Flagged items are kept for up to two
years as a safety record.

## How long we keep it

- Activity logs: 180 days. Code-run logs: 30 days. Cost logs lose the link to you after 13 months.
- Safety records: 2 years.
- Your account and learning work: while your account exists. **[Proposed shorter limits for AI chats
  (90 days), Together messages (12 months), and images/audio/video (12 months): decision needed. Do not
  publish these figures until they are enforced.]**
- When you ask us to delete your account, we delete it within 30 days. We cannot remove your name from
  another person's own notes or messages, safety records already made, grouped statistics, or copies a
  service keeps under its own rules.

## Your choices

You (or your parent or guardian) can ask to see, correct or delete your information, or ask us to stop
using it, by emailing **[privacy contact address: not yet set up]**. We answer within **[30]** days.
If you are under the age where consent from a parent is required, your parent or guardian can make
these requests for you.

## Children

**[Decision needed: do we have or expect learners under 13? Under 16 in the EU? This section changes
depending on the answer.]** Where the law requires a parent's or guardian's permission, we ask for it
before we collect personal information from that child, and parents can review and delete it.
Learners join through a leader of their organization, who approves each new member.

## Security

Accounts need a password of at least 8 letters and numbers. Access to data is limited by role. A new
member must be approved by a leader. Code you run is executed in an isolated sandbox. If we learn that
personal information has been exposed, we will tell the people affected and the authorities as the law
requires. **[Incident runbook: to be written.]**

## Changes

If we change this notice in a meaningful way, we will tell you in the app before it applies.

---

## Short version for parents and guardians

- We ask your child for their name, school, town, and birth year, and we keep what they make and write
  on the platform.
- A leader from their organization approves them and can see their work and safety alerts.
- AI helpers get their typed text with names and contact details removed. A safety check reads the
  latest message as written so a leader can step in if a child may be at risk.
- We do not sell their information or show ads.
- You can ask to see, fix or delete everything: **[contact address]**.

---

## Gaps found while drafting (to close before publishing)

1. No legal entity, address or privacy contact exists yet. Needed on the notice and for deletion requests.
2. No consent practice for non-users entered in community records (patients especially).
3. Under-13 / under-16 stance undecided; parental consent flow not built.
4. Retention figures for learner content are proposals, not enforced.
5. Vendor terms and data-processing agreements not yet reviewed for OpenAI, the free-tier chain,
   ElevenLabs/SpeechGen, E2B; regions of Supabase and E2B unconfirmed.
6. No in-app way to see "my data" or request deletion (administrators run `npm run user:delete`).
