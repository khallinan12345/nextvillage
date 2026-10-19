# Data protection impact assessment (DPIA): nextVillage learner platform

**Version 1, 16 October 2026.** Required before high-risk processing by Nigeria NDPA s.28 and Kenya DPA
s.31 (and the Kenyan General Regulations, regs. 49-50). It is written from the platform as built
(`DATA-MAP.md`, `VENDOR-REVIEW.md`, `AI-LEGAL-REVIEW.md`). **Owner:** Kevin Hallinan, for vAI. **Review:** every year, and before any new feature that collects more about learners
or sends data to a new vendor. A draft, not legal advice; a lawyer should read it (see `LEGAL-REVIEW-BRIEF.md`).

## 1. Why a DPIA is needed

The processing is likely to be high-risk because of its **nature, scope, context and purpose** (NDPA
s.28(1)): the data subjects are mostly **children**, many in communities with few legal protections;
learners' own writing is sent to **AI services abroad**; the platform holds **safeguarding records** and,
for some adult community members, **health information**; and it **combines** learning, behavioural and
assessment data about the same child over time.

## 2. Systematic description of the processing (NDPA s.28(4)(a); Kenya s.31(2)(a))

| Item | Description |
|---|---|
| **Purpose** | Teach AI, coding and entrepreneurship skills; give feedback; help learners do community projects; keep learners safe; report grouped progress to funders and for research |
| **Who is affected** | Several hundred learners, mostly aged 10 to 17, some 8 to 12, in Nigeria (Oloibiri), Kenya and a small US group; leaders and teachers; adults helped through community projects (no accounts) |
| **Data** | Name, email, school, town, country, **birth year only**, optional photo; learning work; chats with the AI tutor; code; media created; messages in group rooms; scores and assessments; safety flags; guardian-consent records; privacy requests; for community projects, a helped person's name, village, phone and notes (health records have identifiers removed when finished) |
| **Sources** | The learner, their leader, the platform's own activity |
| **Where it goes** | Supabase (AWS Ohio, USA) stores everything; Vercel serves the site; AI and tool vendors receive scrubbed text, listed in `VENDOR-REVIEW.md`; Resend emails leader alerts |
| **Who sees it** | The learner; leaders and administrators of the learner's organization; classmates see first name, last initial and photo on leaderboards (under-13s: "Learner NNNN"); the public sees initials only |
| **Retention** | Enforced nightly (`DATA-MAP.md` section 4, privacy notice): AI transcripts 90 days (60 under 13), Together messages 12 months, media 12 months (6 under 13), inactive accounts 12 months then leader review, safety records 2 years, etc. |
| **Lawful basis** | Consent of a parent or guardian for every learner under 18, recorded by the group leader (Kenya s.33; NDPA s.31); for adults, consent or legitimate interest |

## 3. Necessity and proportionality (NDPA s.28(4)(b); Kenya s.31(2)(b))

- **Minimisation:** only the birth *year* is collected; no ID numbers, addresses or exact location; names
  and contact details are removed from text before it reaches AI services; the free-tier AI providers and
  all image/voice/video tools are off for children under 13.
- **Purpose limits:** learner data is not used for advertising and is not sold; research uses are
  anonymised in groups of five or more.
- **Storage limits:** the nightly deletion rules above; accounts unused for a year are reviewed.
- **Transparency:** a public, child-friendly privacy notice; a parent summary; a consent form (under review).
- **Alternatives considered:** (a) excluding children under 13: rejected because the platform is their main
  route to learning beyond five years of schooling (Kevin's decision, 14 Oct 2026); instead they get a
  tight under-13 tier. (b) A fully offline tool: not workable for AI tutoring.

## 4. Risks to people and how they are handled (NDPA s.28(4)(c)-(d); Kenya s.31(2)(c)-(d))

| # | Risk to learners | Likelihood | Severity | Measures in place | Residual |
|---|---|---|---|---|---|
| 1 | **Contact by an unsafe adult** through the platform (grooming, trafficking) | Low | Very high | Leader approval of every member; names/photos hidden for under-13s; no peer chat for under-13s by default; Together messages scanned and reportable, leaders alerted; no public listing of members | Medium: depends on leaders reading alerts. Needs the backup alert address (set 16 Oct) and leader training |
| 2 | **Self-harm or abuse disclosed** to the AI or a group chat and missed | Medium | Very high | Automatic classifier on AI chats and group messages, emails to leaders (retried), leaders' dashboard; backup alert address | Medium: classifier can miss or over-flag; human follow-up is essential |
| 3 | **Exposure of a child's identity** (public page, leaderboards, certificates) | Medium | High | Public page shows initials only; under-13s pseudonymised; names removed from winner texts; certificate links only shared by the learner | Low to medium: consent form wording not yet confirmed |
| 4 | **Personal details sent to an AI vendor** | Medium | Medium | Scrubbing before every AI call; one vendor only for under-13s; vendor terms reviewed; no vendor training on our data where terms say so | Medium: scrubbing is imperfect; vendor agreements not yet signed |
| 5 | **Data breach / unauthorised access** | Low | High | Role-based access in the database, leader approval, sandboxed code, locked-down functions, dependency audits, secret hygiene, incident runbook | Low |
| 6 | **Data kept too long** | Low | Medium | Nightly deletion; inactive-account review; deletion requests | Low |
| 7 | **Transfer to the US** without a recorded basis | Certain | Medium | Notice tells people; vendor terms reviewed; basis being recorded (`TRANSFER-BASIS.md`) | Medium until clauses are signed |
| 8 | **Sensitive information about non-users** (patients) recorded without their agreement | Medium | Medium to high | Learner must confirm the person agreed (added 16 Oct); under-13s cannot create these records; identifiers removed after a health consultation | Low to medium |
| 9 | **Invalid or missing parental consent** | Medium | High | Consent required to approve new learners; leaders record forms for existing learners; paper originals kept by leaders | Medium until all forms are recorded and stored safely |
| 10 | **Bias or harm from AI answers** (wrong health or farming advice) | Medium | Medium to high | Advisor tools labelled as support only; healthcare routed to the best model; guardrail text; outputs reviewed by helpers | Medium: inherent to AI |
| 11 | **Loss of access to learning** if the platform fails | Medium | Low | Offline tools (device-only); backups | Low |

## 5. Consultation

- **Learners and families:** consulted through leaders when consent is collected; the notice invites questions.
- **Regulators:** NDPA s.28(2) and Kenya s.31(3) require consulting the regulator beforehand only if
  high risk remains *after* the measures. Our judgement: residual risk is **medium, not high**, so prior
  consultation is not triggered. **A lawyer should confirm** (question 1 in `LEGAL-REVIEW-BRIEF.md`).
- **Data protection officer:** none designated yet (required only for controllers "of major importance").

## 6. Conclusion and actions

The processing can proceed with the measures above. Open items that reduce residual risk, in order:
(1) finish recording guardian consents and confirm the form's wording; (2) sign vendor data processing
agreements; (3) train leaders on alerts and consent; (4) record the transfer basis; (5) lawyer review.

## 7. Sign-off and review log

| Date | Version | By | Note |
|---|---|---|---|
| 16 Oct 2026 | 1 | Drafted by Claude (AI) for Kevin Hallinan | First assessment; awaiting lawyer review |
