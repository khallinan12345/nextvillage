# AI legal review: nextVillage privacy and child-protection position

**Date:** 16 October 2026. **Reviewer:** Claude (an AI). **For:** Kevin Hallinan / Impact Mining, Inc. (forming).

## 0. What this is, and what it is not

This is a structured compliance review of what the platform does and says against the legal texts that
apply to it. It is **not legal advice**, and an AI cannot take responsibility for being right, appear
before a regulator, or know of rulings and guidance published after its sources. Use it to (a) fix the
things that are plainly wrong, (b) go to a human lawyer with sharper questions (section 7), and (c) show
that the program has taken its duties seriously.

**Sources read directly (primary text):**
- Nigeria Data Protection Act 2023 (NDPA), full text.
- Kenya Data Protection Act 2019 (Kenya DPA), full text; Kenya Data Protection (General) Regulations 2021;
  the ODPC *Guidance Note for Processing Children's Data* (2025).
- US COPPA Rule, 16 CFR 312.2, 312.4, 312.5, 312.8, 312.10 (current eCFR text).

**Not read in primary form (treated as unverified):** the Nigeria GAID 2025 (registration thresholds,
tiers, filing dates), Kenya's registration regulations and their Third Schedule, state children's privacy
laws, and the law of any other country where learners may live. Figures taken from press or law-firm
summaries are marked **[verify]**.

**Method:** every row below says what the law requires (with section), what we do (checked against the
code, database, or published pages), and a rating: **Meets**, **Partly**, **Gap**, or **Unclear**.

---

## 1. Bottom line

- The platform's **technical protections are strong** for a program of this size: access control,
  automatic deletion, scrubbing before AI calls, safety escalation, vendor limits, and special handling of
  children under 13 all exceed what these laws specifically require of a small controller.
- The **weak points are paperwork and consent quality**, not code. Both countries' regulators have
  punished organisations for exactly these: consent that was missing or did not cover the actual use, and
  children's names or images shown publicly.
- **Two real risks need action first:**
  1. **We publicly show children.** The landing page lists weekly champions by first name and last
     initial with a written reason, and embeds two videos of children speaking. Kenya's regulator fined a
     school KES 4.55 million for posting children's images without parental consent (see section 5).
     Whether our guardian consent covers *public* use is unknown; the form is not in the repository.
  2. **We promise 30 days to answer privacy requests.** Kenya's regulations require 7 days for access and
     14 days for several other requests. (Fixed in this change; see section 4, B2.)
- **No fine is likely to be small enough to ignore, but none looks imminent.** Enforcement so far targets
  large or complained-about organisations. One upset parent's complaint is the realistic trigger.

**Overall assessment:** moderate risk, fast to reduce. Eight items would move it to low (section 6).

---

## 2. Which law applies to what

| Law | Why it reaches us | Source |
|---|---|---|
| **Nigeria NDPA 2023** | Applies to a controller "not domiciled in, resident in, or operating in Nigeria, but ... processing personal data of a data subject in Nigeria" | NDPA s.2(2)(c) |
| **Kenya DPA 2019** | Applies to a controller "not established or ordinarily resident in Kenya, but processing personal data of data subjects located in Kenya" | Kenya DPA s.4(b)(ii) |
| **US COPPA** | Covers a *commercially operated* service collecting personal information from children under 13. A true nonprofit is likely outside the FTC's reach but the FTC encourages following it. The Dayton children make it relevant | 16 CFR 312.2 ("operator") **[verify status once the nonprofit is official]** |

So **a US-based controller is bound by the Nigerian and Kenyan Acts** for learners there. Being abroad
does not remove the duty; it mainly affects how a regulator would reach us in practice.

---

## 3. Penalty exposure

| Law | Maximum | Source |
|---|---|---|
| NDPA | Controller "of major importance": the greater of ₦10,000,000 or 2% of prior-year gross revenue. Others: the greater of ₦2,000,000 or 2%. Also compensation and orders to remedy | NDPA s.48(3)-(5) |
| Kenya DPA | Up to KES 5,000,000, or for an undertaking 1% of prior-year turnover, whichever is **lower** | Kenya DPA s.63 |
| COPPA | Civil penalties per violation, enforced by the FTC (high per-violation amounts, adjusted yearly) **[verify]** | FTC Act |

For a nonprofit with a small budget, the percentage limbs are small; the fixed amounts and the cost of
responding to a regulator are the practical exposure. The reputational and funder cost of a public finding
about *children's* data is larger than the fine.

---

## 4. Findings

### A. Children and consent

| # | Requirement | What we do | Rating |
|---|---|---|---|
| A1 | Consent of a parent or guardian before processing a child's data. NDPA s.31(1) (where consent is the basis); Kenya DPA s.33(1)(a) (always, plus best-interests). ODPC guidance: parental consent "must be obtained ... regardless of the legal basis" | Every learner who is or may be under 18 needs a recorded guardian consent to be approved; leaders are recording existing learners' forms in batches | **Partly** (recording still in progress) |
| A2 | Verify age and consent "taking into consideration available technology" (NDPA s.31(2); a government ID is "appropriate", s.31(3), but not the only way). Kenya s.33(2)-(3): mechanisms scaled to technology, volume, share of children, and risk of harm. Kenya General Regulations: the person exercising a child's rights must be "appropriately identified" | Birth year entered by the learner or a leader; consent verified by a signed form held by a local leader who knows the family, attested on the platform. No parent ID check | **Partly.** Reasonable for an off-grid community, but "proportionate to technology" must be written down, and the high share of children (nearly 100%) points to the stricter end. Lawyer question 3 |
| A3 | Content of the consent. Kenya General Regulations (child's rights): the parent must be "informed of the inherent risks in processing and the safeguards". NDPA s.43(a): consent to a foreign transfer must follow being informed of the risks. Consent must be specific and informed (ODPC) | The paper form is not in the repository, so its wording is **unknown** | **Unclear. High priority.** See action 1 |
| A4 | Consent for **public** display of a child's name, image, scores or voice must be specific to that use. ODPC guidance, Example 1 (school publishing a student's name, photo and scores needs specific parental consent). Enforcement: Roma School KES 4.55m; Nova Pioneer KES 750k | The public landing page shows **weekly champions** (first name and last initial, or "Learner NNNN" under 13) with the reason, and embeds **two YouTube videos** in which children speak. Peers in a group also see first name, last initial and photo on leaderboards. Certificate links are shareable | **Gap or Unclear. High priority.** Depends on what the form and any media releases say. See action 2 |
| A5 | Education exception (NDPA s.31(4)(b)): consent not needed where processing is for education/social care "undertaken by or under the responsibility of a professional or similar service provider owing a duty of confidentiality" | We do **not** rely on it | **Meets** (conservative). Kenya has no equivalent for education (s.33(4) covers only counselling/child protection) |
| A6 | Best interests and privacy by default. Kenya s.33(1)(b), s.41 | Under-13 tier (names hidden, no peer chat, one AI vendor, shorter retention, no records about others); minimal collection (birth year only) | **Meets** |
| A7 | COPPA (Dayton, ages 10 to 12): direct notice and verifiable consent (312.4(c), 312.5). A signed form returned by mail or scan is an approved method. Parents must be told what is collected, third-party disclosures, and that they may consent to collection *without* consenting to disclosure unless disclosure is integral | Signed consents exist and are recorded for the 14 children. Form content unknown. Third parties (AI vendors) are integral to the service | **Partly.** Check the form against 312.4(c)(1) **[verify with counsel]** |

### B. Transparency and rights

| # | Requirement | What we do | Rating |
|---|---|---|---|
| B1 | Clear, child-friendly notice (ODPC checklist). COPPA online notice (312.4(d)) must give each operator's name, address, **phone number and email**, what is collected, whether children can make information public, disclosures, a retention policy, and parental rights, linked prominently where information is collected | Public notice at `/privacy`, linked on landing, login and signup. Has name, address, email, retention rules, parental rights, vendors. **No phone number.** Not linked on the birth-year prompt or profile page | **Partly.** Add a phone or a short note; add links |
| B2 | Response times. Kenya General Regulations: access within **7 days**; rectification, restriction and objection within **14 days**; a refusal explained in writing within 7 days (rectification). NDPA: "without constraint or unreasonable delay" (s.34) | The notice said "we reply within 30 days", and the leader card said "within 30 days" | **Gap for Kenyan learners.** **Fixed in this change:** the notice now says 14 days (7 for a copy) and the card says 14 days. Deletion of the account and files is still completed within 30 days **[verify Kenya's erasure deadline]** |
| B3 | Child's rights exercised through a parent: identify the person; inform the parent of risks and safeguards (Kenya General Regulations) | Requests come from the learner's account or by email; leader verifies by knowing the family | **Partly** |
| B4 | Learner and parent access to what we hold (NDPA s.34; Kenya s.26) | In-app "send me a copy" request, handled by a leader or administrator | **Meets** (process); **Partly** (no tooling yet to produce the copy; the administrator exports it by hand) |

### C. Security, vendors, breach, retention

| # | Requirement | What we do | Rating |
|---|---|---|---|
| C1 | Appropriate technical and organisational measures (NDPA s.24(1)(f), s.24(2); Kenya s.41). **COPPA 312.8(b): a written security program** with a designated person, an annual risk assessment, testing and an annual review | Controls are strong (access control, sandboxing, dependency audits, scrubbing). There is no single written program with a named owner and an annual cycle | **Partly.** Write a two-page program (action 5) |
| C2 | Processor safeguards. COPPA 312.8(c): obtain **written assurances** from third parties. ODPC checklist: vet processors, written contracts, audit them | Vendor review done (15 Oct); **no signed data processing agreements on file** | **Gap** (action 4) |
| C3 | Breach notice. NDPA s.40(2): regulator **within 72 hours**; data subjects if high risk; keep a record of all breaches (s.40(8)). Kenya s.43: Commissioner within 72 hours, data subject in writing; a processor must tell the controller "within forty-eight hours" where practicable | Incident runbook exists; its regulator-deadline table says "needs attorney confirmation"; vendor 48-hour expectation not in any contract | **Partly.** Update the runbook with these exact deadlines and the two regulators' contacts; keep a breach log |
| C4 | Retention. NDPA s.24(1)(d); Kenya s.39 (delete, erase, anonymise or pseudonymise when no longer needed). COPPA 312.10: a **written retention policy** stating the purposes, the business need, and a deletion timeframe, included in the online notice | Retention schedule enforced nightly; published in the notice | **Meets** (practice). **Partly** (COPPA wants purposes and business need stated beside each period) |
| C5 | Data minimisation (NDPA s.24(1)(c)) | Birth year only; PII scrubbed before AI; deletion rules | **Meets** |
| C6 | Accountability and proof of consent. NDPA s.24(3) (demonstrate accountability); **s.26(1): the controller bears the burden of proving consent** | Consent record on the platform; **originals are paper forms held by local leaders** | **Partly.** The paper is the proof: store it safely, index it, and keep copies |

### D. Sending data abroad

| # | Requirement | What we do | Rating |
|---|---|---|---|
| D1 | NDPA s.41(1)-(2): transfer only where the recipient is under a law, binding rules or **contractual clauses** giving adequate protection, or a s.43 condition applies (including consent given "after having been informed of the possible risks"); the controller "shall record the basis for transfer" and the adequacy of protection | Everything is processed in the US. The notice says so. **No recorded legal basis; no signed clauses** | **Gap** (actions 3, 4) |
| D2 | Kenya s.48: transfer only where the controller "has given proof to the Data Commissioner on the appropriate safeguards" (or a listed necessity applies). s.49: **sensitive** personal data (health status, family details including children's names, biometric data) may be sent abroad only with the data subject's **consent** and confirmed safeguards; the Commissioner may suspend a transfer | US hosting; health consultation records exist (identifiers are removed when finished); no proof lodged with the ODPC; no transfer-specific consent on record | **Gap or Unclear.** Lawyer question 2 |

### E. Governance

| # | Requirement | What we do | Rating |
|---|---|---|---|
| E1 | **Data protection impact assessment** before processing likely to be high-risk: NDPA s.28; Kenya s.31 and Regulation 49-50 (template in the Third Schedule). The ODPC checklist asks for one for children's data | Not done | **Gap.** High value, cheap: I can draft it from the data map (action 6) |
| E2 | Data protection officer and registration. NDPA s.32 and s.44 apply to a controller "of major importance": one "domiciled, resident in, or operating in Nigeria" that processes data of more than a number the Commission prescribes, or a designated class. Kenya: registration depends on turnover (nonprofits: utilised annual budget), staff numbers, or listed activities | The numeric thresholds are in the GAID and Kenya's schedules, which I did not read in primary form. A US-based controller may fall outside the Nigerian definition; the **Nigerian partner**, which operates there, may fall inside | **Unclear.** Lawyer question 1 |
| E3 | Roles. A controller and a partner that jointly decide purposes are joint controllers; each needs to know its duties | The Nigerian and Kenyan partners issue join codes, hold the consent forms and receive safety alerts. No written agreement | **Gap** (action 7; already on the plan) |
| E4 | Staff training (ODPC checklist) | None yet for leaders | **Gap** (small) |
| E5 | Sensitive data about non-users (health records). NDPA s.30: consent, or the non-profit exception, which covers only *members and persons with regular contact*; Kenya ss.44-46 (health data is sensitive) | Learners record patients' names, village, phone, notes; only an instruction to "enter only with that person's agreement". Identifiers are removed when the consultation finishes. Under-13s cannot create these records | **Partly.** A short consent line at the point of entry and a minimal-data rule would close this |

---

## 5. Enforcement examples that match our risk profile

- **Nigeria:** the regulator fined MultiChoice Nigeria ₦766.2 million in 2025 for unauthorised
  processing and cross-border transfers, and opened a probe of 1,369 organisations. **[press reports;
  verify]**
- **Kenya:** the ODPC fined Roma School Uthiru KES 4.55 million for posting children's images for
  marketing without parental consent, and Nova Pioneer KES 750,000 for a minor's images in advertising.
  **[law-firm reports; verify]**

Both point at the two things above: consent that does not cover the use, and public display of children.

---

## 6. Prioritised actions (cheapest first within each tier)

**Do first (this month)**
1. **Review the guardian consent form** against A3, A4, A7, D1. It should say, in plain words: what is
   collected; that learners' text goes to AI services abroad (named categories) and is stored in the US,
   and the risks; the safeguards (scrubbing, deletion schedule, leaders' access, under-13 rules); that the
   parent may withdraw; **separately** whether the child's first name/initial, photo, voice or work may be
   shown publicly or to peers; and a contact. *Kevin: share the current form; I will draft a model.*
2. **Public display of children.** Confirm signed releases exist for the two videos. Until the form
   explicitly covers public recognition, show champions on the public page by **initials or pseudonym**
   only, and keep peer-visible names inside the group. (A small code change I can make.)
3. **Record the transfer basis** (NDPA s.41(2)): add a section to the data map saying which s.41/s.43
   basis is used for each vendor and why. (I can write it.)
4. **Collect and file vendor data processing agreements** (COPPA 312.8(c), NDPA s.41, ODPC checklist).
5. **Write the security program** (COPPA 312.8): two pages, a named owner, an annual risk review.
6. **Draft the DPIA** (NDPA s.28, Kenya s.31). (I can write it from the data map.)

**Then**
7. Controller agreement with the Nigerian and Kenyan partners (already planned for the entity transition).
8. Update the breach runbook (72 hours to the NDPC and ODPC, 48 hours from processors, breach log).
9. Add a consent line for community records at the point of entry; add a phone/contact method to the notice.
10. Short training session and one-page guide for leaders; store paper consent forms safely and index them.

---

## 7. Questions for a human lawyer (the ones this review cannot settle)

1. **Registration and DPO (E2).** With the controller in the US and a Nigerian partner operating in
   Oloibiri, is anyone a controller "of major importance" under the NDPA/GAID? What are the numeric
   thresholds? What does Kenya require of a small education nonprofit?
2. **Transfers (D1, D2).** Is a signed set of vendor clauses plus an informed guardian consent a sufficient
   basis for Nigeria? For Kenya, must safeguards be lodged with the ODPC, and is health-status data we
   hold about community members "sensitive data" needing transfer consent?
3. **Verification of consent (A2).** Is a signed form held by a local leader and attested on the platform
   enough to "verify" parental consent in Nigeria and Kenya, given the circumstances?
4. **Public recognition (A4).** Does a guardian consent need a separate, specific clause for showing a
   child's name or voice publicly? Do the existing videos need fresh releases?
5. **COPPA status (A7).** Once the entity is a nonprofit, does COPPA apply to the Dayton group? If so, is
   the signed form sufficient?

## 8. Summary of ratings

Meets: A5, A6, B4 (process), C4 (practice), C5. Partly: A1, A2, A7, B1, B3, C1, C3, C6, E5.
Gap: B2 (fixed), C2, D1, E1, E3, E4. Unclear: A3, A4, D2, E2.

---

## 9. Progress after the first review (16 Oct 2026, second pass)

Closed or reduced the same day, using only what did not depend on the consent form or a lawyer:

| Finding | What was done | Rating now |
|---|---|---|
| **A4** public display of children | The landing page now shows winners by **initials only** (under-13s stay "Learner NNNN"); the written reason has the learner's name replaced with "this learner" in the page and, in the database, for **every minor** (not just under-13s). Videos and consent wording still to confirm | **Partly** |
| **B1** notice content | Privacy link added where birth year is collected and on the profile privacy card; the purpose of each retention period is now stated beside it (COPPA 312.10). **A phone number or other contact method is still missing** | **Partly** |
| **B2** reply times | 14 days (7 for a copy) in the notice, both request screens and the Data Protection Summary | **Meets** (Kenya's erasure deadline to verify) |
| **C1** written security program | `SECURITY-PROGRAM.md`: coordinator, safeguards, annual checklist, third-party rule, review log | **Meets** on paper; the first yearly cycle is due October 2027 |
| **C2** vendor assurances | `VENDOR-DPA-CHECKLIST.md` with verified links; **Kevin must accept, download and file each** | **Gap** (action needs the account holder) |
| **C3** breach deadlines | Runbook now cites NDPA s.40 and Kenya s.43 (72 hours; 48 hours from processors), adds "effects on people" to the log. **Regulator contact addresses to be filled in** | **Meets** (contacts pending) |
| **C4** retention policy | Purposes stated with each period in the public notice | **Meets** |
| **D1** transfer basis | `TRANSFER-BASIS.md` records the basis relied on and what is missing (signed clauses; consent wording) | **Partly** |
| **E1** DPIA | `DPIA.md` drafted: description, necessity, 11 risks with measures, residual risk, consultation decision | **Partly** (needs lawyer read and sign-off) |
| **E3** partner agreement | Template at `templates/CONTROLLER-AGREEMENT-TEMPLATE.md`; to sign once the entity is official | **Partly** |
| **E4** leader training | `LEADER-GUIDE.md` (one page); a short live session is still to do | **Partly** |
| **E5** records about non-users | The three advisor forms now require the helper to confirm the person knows and agreed before saving | **Partly** |

**Still waiting on others:** the guardian consent form (A3, A7, parts of A4 and D1); the lawyer (A2, D2, E2,
and everything in section 7); filing the vendor agreements (C2); a phone or contact method for COPPA's
notice (B1); the Nigerian and Kenyan regulator contact addresses for the runbook (C3).

---

## 10. Review of the Oloibiri parent form (received 16 Oct 2026)

**The document received** is titled "vAI lab media and publication consent form". It is a **media release**,
not consent to the platform's processing of a child's data. It asks the parent to allow: (1) recording and
using the child's image, voice and first name "only for awareness"; (2) publishing on Substack, LinkedIn,
YouTube, the vAI lab website and donor reports; (3) with the child's surname, school name, uniform logos, home
address and village name excluded. The parent acknowledges it is voluntary, that consent can be withdrawn "by
emailing" (the address is **blank**), and that vAI lab "will store this signed form securely and will not sell
or share my child's data".

**What it does well:** it is specific about what is shown and where, voluntary, excludes the most identifying
details, and states withdrawal. That is close to what the ODPC's own example requires for publishing a
child's name and picture (finding A4). It would cover the two landing-page videos **if** the child in each
appears with a signed form, and the first-name use, the donor reports and the social channels it names.

**What it does not do (finding A3 stands):**

| Gap | Why it matters | Fix |
|---|---|---|
| **No consent to use the platform or to process the child's data** (name, school, birth year, AI chats, work, scores, safety checks, leader access) | NDPA s.31(1) and Kenya s.33(1) require parental consent to process a child's data. A media release covers publication, not the platform | New Part A in `templates/PARENT-CONSENT-FORM.md`, or the one-page add-on for families who already signed |
| **No mention of AI vendors, US storage, or the risks** | Kenya's regulations require the parent be told "the inherent risks in processing and the safeguards"; NDPA s.43(a) requires consent to a foreign transfer to follow being informed of the possible risks | Part A states them in plain words |
| **"will not sell or share my child's data"** | Not accurate. Typed text goes (scrubbed) to AI vendors and data is held by hosting providers. An inaccurate promise weakens consent and the notice | Replace with: not sold, shared only with the service providers needed to run the platform, as described |
| **Withdrawal email is blank** | A right that cannot be exercised is not meaningful (Kenya General Regulations; COPPA 312.4(d)) | Print a real address and a phone/WhatsApp number |
| **Heading typo** ("complaint" for "compliant") and no named organisation, address or contact | The parent cannot tell who is responsible. The notice also needs the controller's contact | Name the Davidson AI Innovation Center and the US entity once formed, with addresses |
| **No year of birth, no relationship to child, no language/explanation line, no witness** | We need the birth year; the person signing must be the parent or guardian; many parents may be read to | Added to the new form |
| **No retention period or what withdrawal does to published material** | Informed consent includes how long and what withdrawal means | Added to Part B |
| **Mixed purposes in one signature** | Kenya requires consent to be specific; bundling media with platform use makes it less free | New form separates required Part A from optional Part B |

**Practical consequence:** do **not** record these media releases on the platform as guardian consent for
platform use. The leader dashboards say "a signed consent form is on file"; that must mean a form covering use
of the platform. Until Part A (or the add-on) is signed, leave those learners unrecorded. They are not
switched off in the meantime (the platform never blocks learners already in).

**Rating after this review:** A3 (consent content): **Gap**, now concrete. A4 (public display): **Partly**:
the media release covers first name, image, voice and the named channels, and the platform now shows
initials only, which is stricter than the form allows.
