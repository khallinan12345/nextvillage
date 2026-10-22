# AI legal review for Ghana: child protection and data processing

**Date:** 20 October 2026. **Reviewer:** Claude (an AI). **For:** Kevin Hallinan, for vAI, and for Open Mind Africa. Impact Mining, Inc. (forming) is a US funding vehicle, not the platform operator.

## 0. What this is, and what it is not

This applies the method of `AI-LEGAL-REVIEW.md` (Nigeria, Kenya, US) to Ghana. It is **not legal advice**. An AI
cannot take responsibility for being right, appear before the regulator, or know of rulings and guidance
published after its sources. Use it to (a) fix what is plainly wrong, (b) take sharper questions to a Ghanaian
lawyer (section 8), and (c) show that the program takes its duties seriously.

**Sources read directly (primary text):**
- Ghana Data Protection Act, 2012 (Act 843), full text, from the Data Protection Commission's website.
- Ghana Children's Act, 1998 (Act 560), full text as published (sections 1, 2 and 17 relied on).

**Not read in primary form (treated as unverified, marked [verify]):**
- Amendments to either Act, and any replacement Data Protection Bill (reported as pending in 2025).
- The Cybersecurity Act, 2020 (Act 1038): known only from press and regulator summaries.
- Data Protection Commission (DPC) registration rules, fee schedules and guidance notes. The current rules on
  whether a controller with no Ghanaian office must register, and the fees, were not confirmed.
- Ghana Education Service (GES) and Ministry of Education rules on outside digital or AI tools. I found no
  published approval process for third-party tools; the Ministry's own 2025 AI apps for senior high schools
  went through a testing process run by the national curriculum agency (NaCCA). **[verify]**

Every row says what the law requires (with section), what we do, and a rating: **Meets**, **Partly**,
**Gap** or **Unclear**.

---

## 1. Bottom line

- **Act 843 is the key law, and it is stricter about children than the Nigerian or Kenyan Acts in one way.**
  Section 37 treats "a child who is under parental control" as **special personal data**, which may not be
  processed unless it is "necessary" or **the data subject consents** (s.37(2)). The Act does not say who gives
  consent for a child. The safe reading is the parent or guardian, which is what our rule already requires.
  Our "no new learner without a recorded guardian consent" rule is therefore not optional in Ghana.
- **The Act reaches us from the US.** It applies where processing is "in respect of information which
  originates partly or wholly from this country" (s.45(1)(c)). Ghanaian learners' data qualifies.
- **Registration is the most likely first step a regulator would check.** Section 27(1) and s.46(3) require
  a data controller to register with the DPC, s.53 bars processing without registration, and s.56 makes
  failing to register an offence (up to 250 penalty units or two years). Who must register here, vAI, the
  Ghanaian partner, or both, is the first question for a Ghanaian lawyer.
- **The Act is silent on sending data abroad, which helps and hurts.** It has no transfer rule like Nigeria's
  s.41 or Kenya's s.48. But the controller must still secure the data (s.28), bind every processor by a
  **written contract** (s.30(2)), and tell the parent who the recipients are (s.27(2)(g)). Vendor data
  agreements are therefore needed in Ghana just as elsewhere.
- **The platform's technical protections are strong. The weak points are paperwork**: registration, signed
  vendor agreements, consent wording that covers Ghana, and a Ghanaian version of the safeguarding contacts.
- **Overall assessment: moderate risk, fast to reduce.** Nothing here is a reason not to start with Open Mind
  Africa. Two items (registration and consent at scale) should be settled **before** the thousands of
  learners join, not after.

---

## 2. Which law applies to what

| Law | Why it reaches us | Source |
|---|---|---|
| **Data Protection Act 2012 (Act 843)** | Applies to a controller that is established in Ghana, **or** uses a processor or equipment in Ghana, **or** processes information that "originates partly or wholly from this country" | Act 843 s.45(1) |
| **Children's Act 1998 (Act 560)** | A child is anyone under 18. The child's best interest is "paramount" for any "person, institution or other body". **Anyone with information** about child abuse or a child in need of care must report it to the Department (of Social Welfare) | Act 560 ss.1, 2, 17 |
| **Cybersecurity Act 2020 (Act 1038)** | Criminalises online abuse of children (grooming, exploitation material, sextortion) and lets the Cyber Security Authority act on child online protection. It does not regulate our data handling, but it is the reporting channel for online harm | Reported summaries **[verify]** |
| Nigeria, Kenya, US laws | Do **not** apply to Ghanaian learners. They remain relevant for learners in those places | `AI-LEGAL-REVIEW.md` |

One more clause matters: s.18(2) makes **Ghanaian processors** responsible for following a foreign
subject's home law. That concerns data sent *into* Ghana to be processed. It does not apply to us unless a
Ghanaian partner processes learner data from Nigeria or Kenya for us. If Open Mind Africa staff ever work on
other countries' learner data, ask the lawyer.

---

## 3. Penalty exposure

| Offence | Maximum | Source |
|---|---|---|
| Processing personal data without registration | Fine up to 250 penalty units or up to 2 years in prison, or both | Act 843 s.56 |
| Not complying with a Commission enforcement notice | Up to 150 penalty units or up to 1 year, or both | s.80(1) |
| Knowingly or recklessly disclosing information in breach of the Act | Up to 2,500 penalty units or up to 5 years | s.85(3) |
| Selling personal data | Up to 2,500 penalty units or up to 5 years | s.89 |
| Offences with no stated penalty | Up to 5,000 penalty units or up to 10 years | s.95 |

The value of a "penalty unit" is set elsewhere in Ghanaian law and changes. I did not check it **[verify]**.
Note that these are **criminal** penalties that can fall on individuals, which is a reason to name the
organisation and the responsible officers clearly in the partnership documents. Beyond fines, the Commission
may issue enforcement notices (s.78 and following), inspect premises (s.81) and cancel a registration (s.52).

---

## 4. Findings

### A. Children and consent

| # | Requirement | What we do | Rating |
|---|---|---|---|
| A1 | A child under parental control is **special personal data**; processing is allowed only where necessary or with **consent** (Act 843 s.37(1)(a), (2)). "Necessary" is narrowly defined (s.37(3)-(6)) and none of those cases covers running a learning platform | Every learner who is or may be under 18 needs a recorded guardian consent before approval; leaders record existing forms | **Meets** in design. **Partly** in practice until the forms are collected |
| A2 | The Act does not define who consents for a child or how to verify it | Signed form held by a local leader and attested on the platform; no parent ID check | **Partly.** Reasonable, but write down why it is proportionate. Lawyer question 4 |
| A3 | The data subject must be told, **before collection**: the nature of the data, the name and address of the person responsible, the purpose, whether supply is mandatory, the consequences of not supplying it, **the recipients**, the categories of data, and the right of access and correction (s.27(2)) | The public privacy notice and the full consent form cover most of these. The notice names vAI and a Dayton address. A **Ghanaian contact** is not yet named | **Partly.** Add the Open Mind Africa contact and safety officer to the Ghana consent form and My path card |
| A4 | Consent must be **prior** (s.20(1)) and the data subject may **object** at any time, after which processing must stop (s.20(2)-(3)) | Withdrawal is a stated right; a leader or administrator acts on it | **Meets** (process) |
| A5 | Publishing a child's name, image or voice: no special rule, but it is processing of special data and needs its own consent. Also the Children's Act "best interest" standard | Landing page shows winners by initials only; videos need signed releases; the media release is separate from platform consent (Part B of the full form) | **Meets** by default design. Confirm releases for any Ghanaian child shown |
| A6 | The educational institution's own duty: pupil records "shall not be disclosed except where the disclosure is required by law" (s.62(b)) | Applies to **schools** as controllers. If Open Mind Africa gives vAI pupil lists from the school system, that is a disclosure of pupil data | **Unclear. Important for scale.** See D2 and lawyer question 3 |
| A7 | Minimality and purpose (ss.19, 22-23) | Birth year only; scrubbing before AI; purpose stated | **Meets** |
| A8 | Under-13s | Tight guardrails, not exclusion (decision of 14 Oct 2026). Ghana sets no separate age tier; every child under 18 is "special" | **Meets** |

### B. Transparency and rights

| # | Requirement | What we do | Rating |
|---|---|---|---|
| B1 | Access: confirm whether data is held, describe it, say who has had access; comply "promptly and in any event within **forty days**" (Act 843 ss.32, 35(10)) | We promise **14 days** (7 for a copy) | **Meets** (stricter than Ghana) |
| B2 | Correction and deletion on request: the controller must comply or give "credible evidence", tell anyone it disclosed the data to, and notify the requester of the action taken (s.33) | A leader or administrator handles requests; vendors are told to delete | **Meets** in process. Document how vendors are told |
| B3 | Right to be informed of processing and its recipients (s.35(1)) | Notice lists vendors by category | **Meets** |
| B4 | The Commission may order compliance if a controller fails to answer (s.35(11)) | No complaints so far | **Meets** |

### C. Security, vendors, breach, retention

| # | Requirement | What we do | Rating |
|---|---|---|---|
| C1 | Appropriate technical and organisational measures; identify foreseeable risks, set safeguards, **verify them regularly**, keep them current; follow accepted security practice (s.28) | Strong controls; `SECURITY-PROGRAM.md` has a coordinator and an annual cycle (first due Oct 2027) | **Meets** on paper |
| C2 | Processors: must act only on the controller's authority and keep data confidential (s.29). **A written contract is mandatory** (s.30(2)), and it must require confidentiality and security (s.30(3)) | Vendor review done; **signed vendor agreements not yet filed** | **Gap.** Same fix as elsewhere (`VENDOR-DPA-CHECKLIST.md`) |
| C3 | **Breach notice:** notify the Commission **and** the data subject "as soon as reasonably practicable" after reasonable grounds to believe unauthorised access occurred; the processor must also notify (s.31(1)-(2)). Tell people enough to protect themselves (s.31(6)). The Commission can order publicity (s.31(8)) | Runbook uses 72 hours for Nigeria and Kenya | **Meets** if the Ghana row is added: Commission **and** families, without waiting 72 hours. Add the Ghana DPC contact to the runbook |
| C4 | Retention only as long as necessary (s.24); exceptions for research/statistics need safeguards | Nightly retention schedule; purposes stated in the notice | **Meets** |
| C5 | The data subject must be told of a breach **by registered mail, email, website notice or media** (s.31(5)) | We can email leaders and post notices; many families have no email | **Partly.** Plan how a Ghanaian parent without email is told (through the school or safety officer, plus the website) |
| C6 | Data originates from outside Ghana: Act 843 does not apply to data that "merely transits" (s.45(4)) | Not relevant; Ghanaian learners' data is stored in the US, not merely transiting | n/a |

### D. Sending data abroad and using school data

| # | Requirement | What we do | Rating |
|---|---|---|---|
| D1 | Act 843 has **no provision on transfers outside Ghana**. Secondary sources disagree on whether consent or "adequate protection" is expected; I could not find either in the text. The practical rules are s.28 (security), s.30 (written processor contract) and s.27(2)(g) (tell people the recipients) | Everything processed in the US; notice says so. No signed vendor clauses | **Partly.** Record the basis in `TRANSFER-BASIS.md` (Ghana row, below) and obtain vendor agreements. Lawyer question 2 |
| D2 | If the **school system** supplies pupil lists or records, the school is the controller of those records and s.62(b) restricts their disclosure | Today learners sign themselves up with a join code; no school data is imported | **Unclear.** Do **not** import school rosters or results without written authority from the school and the guardian. See section 6 |
| D3 | A **data protection supervisor** may be appointed (s.58). It is optional ("may") | Security coordinator is named in the program | **Meets.** Consider appointing one if the DPC asks |

### E. Registration and governance

| # | Requirement | What we do | Rating |
|---|---|---|---|
| E1 | A data controller "who intends to process personal data shall register with the Commission" (ss.27(1), 46(3), 53). A controller **not incorporated in Ghana "shall register as an external company"** (s.45(2)). Renewal every two years (s.50) | Not registered in Ghana | **Gap or Unclear. Highest priority.** Who is the controller? Lawyer question 1 |
| E2 | Roles. Where Open Mind Africa decides purposes with vAI, both are controllers; where it only collects forms on vAI's behalf, it may be a processor (s.29-30) | Template `CONTROLLER-AGREEMENT-TEMPLATE.md` and `PARTNERSHIP-AGREEMENT.md` Schedule A-F | **Partly.** Fill in the Ghana parties |
| E3 | DPIA: no express requirement in Act 843 | `DPIA.md` exists; add a Ghana annex | **Meets** |
| E4 | Staff training | One-page leader guide; live session planned | **Partly** |
| E5 | Health data about community members (the advisor tools): "health" is special data (s.37(1)(b)); consent needed | Tick-box confirmation before saving; identifiers removed after | **Partly.** As elsewhere |

### F. Child protection beyond data

| # | Requirement | What we do | Rating |
|---|---|---|---|
| F1 | **Anyone with information on child abuse, or a child in need of care and protection, shall report it to the Department** of Social Welfare (Children's Act s.17) | `CHILD-SAFEGUARDING-POLICY.md` has a safety officer, escalation and local-authority reporting. The Ghanaian authority and numbers are not filled in | **Partly.** Name the Department of Social Welfare office and add the Ghana child helpline (Ghana's police domestic violence and victim support unit and the Cyber Security Authority child-online-protection contacts **[verify numbers]**) to the Ghana My path card |
| F2 | Online harm: the Cybersecurity Act criminalises grooming and exploitation material **[verify]** | AI safety escalation, no peer chat for under-13s, human review of flagged safety events | **Meets** by design. Add the Cyber Security Authority as a reporting contact |
| F3 | Best interests are paramount in any matter concerning a child (Children's Act s.2) | Under-13 tier, minimal collection, human safety officer required, approval gate | **Meets** |
| F4 | Child labour rules (Children's Act Part V) apply to employment; learners are not employed | The Core Path is learning, not paid work | **Meets.** If a learner ever earns from the platform's tools, ask counsel |

---

## 5. What I would not say yet

- I did not find a Ghana-specific **children's data guidance note** from the DPC. If one exists, it would sit on
  the Commission's site. Ask the lawyer and ask the DPC directly.
- I could not confirm whether the **Data Protection Bill** has replaced or amended Act 843. If it has, the
  numbering here changes. Check before relying on section numbers in anything outward-facing.
- Whether Open Mind Africa is a registered Ghanaian entity (company limited by guarantee, NGO, or trust)
  changes who must register. I do not know.

---

## 6. The decision most specific to Open Mind Africa: 13,000 learners through the school system

Nothing in Ghanaian law stops a partner from introducing learners through schools. These points decide whether
it can be done **safely at that scale**:

1. **Consent first, enrolment second.** Section 37 makes each child's data special. The platform's gate (no
   approval without a recorded guardian form) must stay. At 13,000 learners this is a paper job larger than
   the platform itself. Ask whether schools can collect the form at enrolment, with the My path card attached.
2. **Do not import school records.** Sign-up through the join code keeps vAI out of s.62(b) trouble. If Open Mind
   Africa wants to load class lists, get written authority from each school and the Ghana Education Service
   office first.
3. **Start with a pilot cohort**, one or two schools and a few hundred learners. Consent collection, safety
   officer capacity and support all scale poorly if everyone starts at once. (My suggestion, not an existing policy.)
4. **A child safety officer per school or per cluster.** One officer cannot know 13,000 children. The platform
   requires one named officer per organisation; Open Mind Africa should name a head officer and a deputy per
   school or district, who can receive safety alerts. Agree the arrangement in Schedule B of the partnership agreement.
5. **Ministry and school-head approval.** I found no published approval process for outside learning tools, but
   the Ministry runs its own AI apps for senior high schools. A written letter of support from GES or the
   school heads protects everyone. Ask Open Mind Africa what approval they already hold.
6. **Language.** English is the language of instruction, but parent forms may need Twi, Ewe, Ga, Dagbani or
   others. A fluent speaker should check any translation before families use it.
7. **Reporting channel.** Replace the Nigeria and Kenya contact rows in the safeguarding documents with the
   Ghana ones (Department of Social Welfare, police victim support, Cyber Security Authority).

---

## 7. Prioritised actions (cheapest first within each tier)

**Before any Ghanaian learner is approved**
1. **Ghana lawyer** answers questions 1 and 4 below (registration, consent).
2. **Ghana consent form:** use `Parent consent form - full`, with Open Mind Africa named, the Ghana safety
   officer's name, email and WhatsApp filled in, and the DPC named as the complaints authority.
3. **My path card** filled in with the Ghana contacts (blank partner copy is in the bundle).
4. **Name the Open Mind Africa roles** in the partnership agreement: site leader(s) and child safety officer(s).

**Before scale-up**
5. File **vendor data agreements** (needed everywhere; Ghana s.30(2) makes them mandatory).
6. Add a Ghana row to the breach runbook: notify the **DPC and the families**, as soon as reasonably practicable.
7. Add Ghana to `TRANSFER-BASIS.md`: no transfer rule in Act 843; relied on ss.27-30 and the vendor contract.
8. Pilot-cohort plan and consent-collection plan agreed in writing with Open Mind Africa.

---

## 8. Questions for a Ghanaian lawyer

1. **Registration (E1).** Who must register with the Data Protection Commission: vAI (a US-based controller
   whose processing "originates from" Ghana), Open Mind Africa, or both? Does s.45(2) ("register as an external
   company") require vAI to register a presence in Ghana, or only to register as a controller? What are the
   current fees and renewal terms?
2. **Transfers (D1).** Does current DPC practice expect consent or standard clauses for sending Ghanaian
   learners' data to the US and to AI vendors, even though Act 843 has no transfer section? Is there a
   replacement Bill that adds one?
3. **School data (D2, A6).** If Open Mind Africa's schools supply names or results, who is the controller, and
   does s.62(b) require written authority from the school or the GES before disclosure?
4. **Consent (A1, A2).** Is a signed form from a parent or guardian, held by a school or site leader and
   attested on the platform, sufficient consent under s.37 for a child under 18? Is a child aged 16 or 17
   able to consent alone?
5. **Reporting (F1).** What is the correct route and phone number for reporting child abuse under s.17
   (Department of Social Welfare and the child helpline) and for online harm (Cyber Security Authority)?
6. **Approvals.** Does a program like this need approval from GES or the school heads before entering schools?

## 9. Summary of ratings

Meets: A1 (design), A4, A5, A7, A8, B1-B4, C1, C3 (once Ghana row added), C4, D3, E3, F2, F3, F4.
Partly: A1 (practice), A2, A3, C5, D1, E2, E4, E5, F1. Gap: C2. Unclear: A6, D2, E1.

---

## 10. Sources

- Ghana Data Protection Act, 2012 (Act 843), the Data Protection Commission's published PDF
  (`dataprotection.org.gh`), read in full on 20 October 2026.
- Ghana Children's Act, 1998 (Act 560), as published, read for ss.1, 2 and 17.
- Press and regulator summaries for the Cybersecurity Act 2020 (Act 1038) and the Ministry of Education's 2025 AI
  apps for senior high schools. Not primary, so marked **[verify]**.
