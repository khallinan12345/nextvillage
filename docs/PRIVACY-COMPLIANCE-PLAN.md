# nextVillage privacy and child-protection plan: United States and Nigeria

> A detailed review of this plan and the platform against the primary legal texts is in `docs/AI-LEGAL-REVIEW.md` (16 Oct 2026). Where the two differ, the review is newer.
> Same-day follow-ups: `DPIA.md`, `SECURITY-PROGRAM.md`, `TRANSFER-BASIS.md`, `VENDOR-DPA-CHECKLIST.md`, `LEADER-GUIDE.md`, `templates/CONTROLLER-AGREEMENT-TEMPLATE.md`.

Draft for Kevin, 15 October 2026. **Not legal advice.** Items marked **[verify]** come from law-firm
commentary or secondary summaries and must be confirmed against the statute, the regulator's own text, or
by an attorney before we rely on them. Facts about what the platform does today come from
`docs/DATA-MAP.md`, `docs/VENDOR-REVIEW.md` and the code.

## 1. The short version

- We serve children (about 8 to 17) in Nigeria, plus a US group of 10 to 12 year olds in Dayton.
- **One standard for everyone:** apply the strictest rule that either country sets, to every learner,
  wherever they live. That is simpler to run than two systems and is what a funder or regulator would
  expect from a program for children.
- **The strictest rules are:**
  - **US (COPPA):** parental consent before collecting personal information from a child under 13, plus
    a written security program and a written retention policy.
  - **Nigeria (NDPA 2023):** consent from a parent or guardian for **anyone under 18**, with the
    controller checking the child's age and that the consent is genuine; breach notice to the regulator
    within 72 hours; registration and a data protection officer if we count as a "data controller of
    major importance".
- **Where we stand:** the technical protections are largely built (under-13 tier, retention, deletion
  requests, incident runbook, vendor review). What is missing is mostly **paperwork, people and
  decisions:** a published notice, a named responsible person, regulator registration, consent for
  13 to 17 year olds, signed vendor agreements, and legal review.

## 2. Which laws apply

| Law | Applies because | What it asks for (in short) | Confidence |
|---|---|---|---|
| **COPPA** (US federal; amended rule, compliance date 22 April 2026) | The Dayton group is under 13 and we know their ages | Notice to parents, verifiable parental consent, parental access and deletion, security program, written retention policy, limits on sharing | The Act covers commercially operated services; most true nonprofits are outside it but the FTC encourages them to follow it. **Our legal status decides this: ask the attorney.** Treat it as applying either way **[verify]** |
| **State children's privacy laws** (Ohio and others) | US learners | Varies; none confirmed for us yet | **[verify]**; attorney |
| **FERPA / state student-privacy laws** | Only if a US school gives us student records | Not triggered today | Re-check if a school partner is added |
| **Nigeria Data Protection Act 2023 (NDPA)** and the NDPC's **GAID 2025** (effective 19 Sept 2025) | We process personal data of people in Nigeria, even though our servers are in the US | Lawful basis; notice; **a child is anyone under 18; consent from parent or guardian, with age and consent verified**; breach notice to the regulator within 72 hours; transfer rules for sending data abroad; DPO and registration for "major importance" controllers; annual compliance audit return | NDPA text: good. GAID thresholds and filing dates: **[verify]** |
| **Kenya DPA 2019, South Africa POPIA** | Any learners there | Similar principles; children's consent rules | Only if we enrol learners there: later |

## 3. What the Nigerian "child under 18" rule means for us

Today: guardian consent is recorded only for **new learners who count as under 13**; older learners
rely on their leader's approval. Under the NDPA reading above, **every learner under 18** needs a
parent or guardian's consent, and we must take reasonable steps to check age and that the consent is
real. Two things soften this, both **[verify]** with a Nigerian attorney:

1. The Act reportedly lets processing go ahead without parental consent where it is needed for
   **education or social services** under professional confidentiality, or to protect the child's vital
   interests. A program delivered through a school or an accountable community leader may fit.
2. The regulator is to issue specific guidance for children aged **13 and over** using online services.

**Practical design (proposed):**

- **Group-level consent for community cohorts:** the organization leader (Divinegift for Oloibiri)
  collects and holds a consent form from each learner's parent or guardian, and records on the platform
  that she holds it. We already have the record and the confirmation screen for under-13s; extend it to
  all learners under 18.
- **Verification:** age by leader's knowledge of the child plus birth year; consent by a signed form or
  an in-person record, noted with date and method. A government ID is a possible but heavy option, and
  not realistic in Oloibiri.
- **Existing learners:** collect consent in batches through the leaders over a set period, without
  switching anyone off (your earlier decision not to disrupt current learners). New learners cannot be
  approved without it.

## 4. Gap list, in the order I would do it

| # | Requirement | US | Nigeria | Today | Action | Owner | When |
|---|---|---|---|---|---|---|---|
| 1 | **Name a responsible person and a legal entity** | yes | yes | Not set | Decide the entity name and a privacy lead; publish a contact address | Kevin | Week 1 |
| 2 | **Public privacy notice** | yes | yes | Draft only | Update the draft to match what is live; publish at `/privacy`; link from signup and footer | Claude drafts; attorney reviews | Weeks 1 to 3 |
| 3 | **Attorney review** (US and Nigerian) | yes | yes | None | One engagement covering COPPA status, the under-18 rule, cross-border transfer, notice | Kevin | Weeks 1 to 4 |
| 4 | **Parent notice and consent: under 13 (US)** | yes | yes | Built; only for new learners; Dayton consents backfilled | Keep; add a parent-facing notice text to give with the form | Claude, Kevin | Week 3 |
| 5 | **Guardian consent for everyone under 18 (Nigeria)** | n/a | yes | **Built 16 Oct 2026** (Kevin's decision: every learner under 18 needs guardian consent; forms are already collected offline). New learners cannot be approved without it; leaders record forms already on file in bulk from the dashboard; nobody is switched off | Leaders record the forms they hold (Divinegift: Davidson AI Futures Lab; others) and keep the paper originals | Leaders | Weeks 1 to 4 |
| 6 | **Determine whether we must register with the NDPC** and appoint a DPO | n/a | probably (we process many children's records) | Not assessed | Attorney or licensed compliance organization to decide the tier; if yes, register and name a DPO | Kevin, attorney | Weeks 2 to 6 |
| 7 | **Data transfer to the US** | n/a | yes | Supabase is in us-east-2 (Ohio); stated nowhere | Choose and document the legal basis (contract clauses, consent, adequacy); say it in the notice | Attorney | Weeks 2 to 6 |
| 8 | **Breach response** | state laws | **72 hours to the regulator** | Runbook written; deadlines table unconfirmed | Update the runbook with the NDPC contact and the 72-hour step; run one practice drill | Claude, Kevin | Week 4 |
| 9 | **Written security program and retention policy** | yes (COPPA) | yes | Retention live; security controls exist but are not written as a program | Turn `DATA-MAP.md` and the runbook into two short controlled documents | Claude | Weeks 3 to 5 |
| 10 | **Vendor agreements** | yes | yes | None filed; list in `VENDOR-REVIEW.md` | Collect and file DPAs; switch on zero retention where offered | Kevin | Weeks 2 to 6 |
| 11 | **Data protection impact assessment** for children's data | recommended | expected for high-risk processing | None | Short written assessment using the data map | Claude drafts | Weeks 4 to 6 |
| 12 | **Access, correction, deletion, withdrawal** | yes | yes | Built (profile buttons, leader card, `user:delete`) | Test end to end; confirm answer time (30 days) | Claude, Kevin | Week 3 |
| 13 | **Training for leaders** | good practice | expected | None | One short session and a one-page guide for Divinegift's team | Kevin | Weeks 4 to 6 |
| 14 | **Annual cycle** | annual review | compliance audit return, reported as due **31 March** for larger controllers **[verify]** | None | Put dates in a calendar; yearly review of the data map and vendor list | Kevin | Ongoing |

## 5. What is already built (so we do not redo it)

Guardian consent record for every learner under 18 (16 Oct); under-13 protections (names and photos hidden, no peer chat, one vetted AI vendor, no records about
other people, guardian consent for new learners); birth-year collection and leader entry; leader approval
of every member; safety flagging to leaders; retention for chats, media, health records and inactive
accounts, run nightly; privacy requests (delete, withdraw, copy); placement of members who joined without
a group; incident runbook; data map; vendor review.

## 6. Decisions I need from you

1. **Who is the legal entity, and its address and contact email?** Needed for the notice and any
   regulator registration.
2. **Who is the named privacy lead?** For Nigeria a DPO may need to be formally designated; it can be an
   outside organization. Candidate in-country contact: Divinegift.
3. **Do we adopt "under 18 needs guardian consent" for every learner**, collected by leaders, as in
   section 3? This is the main design choice.
4. **Budget and timing for one attorney engagement** (US and Nigeria). The plan above assumes four weeks.
5. **Whether to keep serving learners in other countries** until this is done, or only add Nigeria and the
   US for now.

## 7. Sources (read 15 Oct 2026; secondary unless stated)

- NDPA children's provisions: [KPMG copy of the Act](https://assets.kpmg.com/content/dam/kpmg/ng/pdf/nigeria-data-protection-act2023.pdf), [commentary](https://uubo.org/document/personal-data-of-a-minor-what-you-must-know)
- GAID 2025: [Mondaq summary](https://www.mondaq.com/nigeria/privacy-protection/1627428/key-regulatory-updates-under-the-2025-general-application-and-implementation-directive-gaid-issued-by-the-nigeria-data-protection-commission-ndpc), [LawPavilion guide](https://blog.lawpavilion.com/ndp-act-2023-gaid-2025-a-comprehensive-guide-to-nigerias-new-data-protection-landscape)
- Breach and transfers: [Lex Mundi Nigeria guide](https://www.lexmundi.com/guides/data-privacy-guide/jurisdictions/africa/nigeria/), [Mondaq 2025 guide](https://www.mondaq.com/nigeria/data-protection/1666780/nigeria-data-privacy-law-2025-ndpa-gaid-guide)
- COPPA amended rule: [Federal Register](https://www.federalregister.gov/documents/2025/04/22/2025-05904/childrens-online-privacy-protection-rule), [Davis Polk note](https://www.davispolk.com/insights/client-update/ftc-prioritizes-coppa-enforcement-new-compliance-obligations-take-effect)
- COPPA consent and schools: [FTC FAQ summary (FPF)](https://fpf.org/blog/ftc-updates-coppa-faqs/)
- Nonprofits and COPPA: [commentary](https://www.churchlawandtax.com/?p=723)

## 8. Future action: when Impact Mining, Inc. becomes official

Kevin is forming **Impact Mining, Inc.**, an Ohio nonprofit corporation (bank account in progress, 16 Oct
2026). **When Kevin says it is official, do these in order.** Until then the privacy notice names Kevin
Hallinan as an individual.

1. **Collect the facts:** exact legal name, Ohio filing date, registered address, officers/board, EIN, and
   a privacy contact address (ideally a role address such as `privacy@nextvillage.community`).
2. **Public documents:** change the responsible party in `src/pages/PrivacyPage.tsx` (and its date); update
   the roles table in `public/docs/Data-Protection-Summary.html` (and the copy in `docs/`); update this plan,
   `DATA-MAP.md` and `VENDOR-REVIEW.md`; fix the landing-page footer and copyright line (it currently names
   the Davidson AI Innovation Center only).
3. **Move the accounts to the entity:** vendor accounts and billing are probably in Kevin's name today
   (Supabase, Vercel, GitHub, Anthropic, OpenAI, Resend, Replicate, ElevenLabs, E2B, Cloudflare, the domain
   `nextvillage.community`). Transfer or re-create them under Impact Mining, Inc. and **re-accept each
   data processing agreement in the entity's name**.
4. **Agreement with the Nigerian partner:** a short written agreement between Impact Mining, Inc. and the
   Davidson AI Innovation Center (and Maji Mazuri in Kenya) saying who is the controller, who holds the signed
   guardian consent forms, who answers requests, and who reports a breach and how fast.
5. **Re-check the legal questions:** COPPA status of a nonprofit (it may fall outside the FTC's reach but
   the platform follows it anyway), Nigerian registration/DPO for a foreign nonprofit processing Nigerian
   children's data, and whether a local representative is needed.
6. **Optional, later:** federal tax-exempt (501(c)(3)) status, board-level insurance, a named board member
   responsible for privacy.
7. **Update the security tracker** and the memory notes so future sessions use the entity name.
