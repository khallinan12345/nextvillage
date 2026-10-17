# Request for a short legal review: children's data on an education platform (Nigeria, Kenya, US)

**For a volunteer (pro-bono) lawyer. Prepared 16 October 2026.** We are asking for **about one hour**,
focused on the five questions in section 3. The appendices are background you may skim or skip. Nothing
here is urgent or in dispute; we are a small program trying to do this properly, and an answer of "this is
fine" or "change this" in a few bullets is exactly what we need. We are not asking for a formal opinion.

## 1. Who we are and what we do

**nextVillage.community** is a free learning platform. Learners (mostly aged 10 to 17; some 8 to 12) learn
AI, coding and entrepreneurship with an AI tutor and do community projects. There are no ads and we do not
sell data.

- **Operator today:** Kevin Hallinan, individually, 1629 E. 4th St., Dayton, OH 45403, USA. He is forming
  **Impact Mining, Inc.**, an Ohio nonprofit (bank account in progress); the notice will move to it.
- **Nigeria (largest group, about 140 learners):** the **Davidson AI Futures Lab**, Oloibiri, Bayelsa State,
  a community learning center (families also know it as "vAI lab"). It has no street address. Local group
  leader: Divinegift Morris. Child-protection lead: Confidence Onuoha.
- **Kenya:** a partner, Maji Mazuri (small).
- **United States:** a small after-school group in Dayton (Back to Basics), about a dozen children aged 10 to
  12, with paper parental consent on file.
- **Where data lives:** the **United States** (Supabase, AWS Ohio). The website is hosted in the US. Text a
  learner types to an AI feature is sent, after names and contact details are removed, to US AI vendors.
  There is no data stored in Nigeria or Kenya.
- **Funding and budget:** volunteer-run. We cannot buy insurance or pay lawyers at this stage; our approach
  is to do the sensible things well and document them.

## 2. What we have already done

- **Consent:** every learner under 18 needs parent or guardian consent, collected on a **signed paper form
  by the local group leader**, who then records on the platform that they hold it, when, how, and a note (no
  guardian contact details are stored). A new learner under 18 cannot be approved without it. Existing
  learners are being brought in in batches. A new two-part form (required Part A: use of the platform, AI
  vendors, US storage and risks; optional Part B: images, voice, first name) is in Appendix B. Families who
  signed the older media-release form will sign a one-page add-on, because the old form did not cover the
  platform or the US transfer (see Appendix A, section 10).
- **Children under 13:** names and photos hidden from others, no peer chat by default, one vetted AI vendor,
  shorter retention, no records about other people. We deliberately did **not** exclude under-13s.
- **Retention enforced nightly:** chat transcripts, messages, media, inactive accounts, logs. Privacy
  requests (delete, withdraw, copy) are answered within 14 days (7 for a copy); a parent without email can
  ask a leader in person.
- **Public privacy notice** (https://www.nextvillage.community/privacy) and a **Data Protection Summary**
  written against Kenya's DPA 2019, Nigeria's NDPA 2023 and COPPA; a written vendor review; a data
  protection impact assessment; a security program; an incident-response runbook (72-hour clock).
- **Public display of children:** the landing page shows winners by initials only; names are removed from
  winner stories for every minor.
- Security reviews, access control, sandboxed code execution and dependency updates.
- An AI-assisted legal review of our position against the primary legal texts (Appendix A). It is **not**
  legal advice and says so; it is included so you can see our reasoning and correct it.

## 3. The five questions (please prioritise)

1. **Nigeria: registration and data protection officer.** Under the NDPA 2023 and the NDPC's GAID 2025, is
   anyone (Impact Mining, the Nigerian partner, or both) a "data controller of major importance" who must
   register with the NDPC, appoint a DPO and file an annual compliance return? What are the thresholds? And
   who is the **controller** for Nigerian learners: the US entity, the local center, or jointly? What does
   Kenya require of a small education nonprofit (registration with the ODPC)?
   *Our reading:* unclear; we could not read the GAID thresholds or Kenya's registration schedule in primary
   form (Appendix A, finding E2).
2. **Sending data to the US.** All Nigerian and Kenyan learners' data is processed in the US. We rely on (a)
   vendor data-processing clauses and (b) a parent's informed consent that names the US storage and the
   risks. Is that enough for Nigeria (NDPA s.41)? For Kenya, must safeguards be lodged with the ODPC (s.48),
   and is the health-status information we hold about a few community members "sensitive data" needing
   transfer consent (s.49)? Our record is Appendix C.
3. **Is a leader-held signed form enough to verify consent?** Both countries expect parental consent to be
   verified, not just claimed. Our model: the leader knows the family and holds the signed form (read aloud
   where needed; a mark with a witness if the parent cannot write). Is that sufficient? Is anything more
   needed (a phone call, an ID copy)? Is an in-person or WhatsApp withdrawal valid? Kenya's s.33 raises the
   same point.
4. **Public recognition of children.** Does a guardian consent need a separate, specific clause for showing a
   child's name, image or voice publicly (landing page, videos, donor reports)? Our new form makes this an
   optional Part B. Do two existing landing-page videos in which children speak need fresh releases?
5. **COPPA for the Dayton group.** Once the nonprofit exists, is it outside the FTC's COPPA Rule? If it
   applies, is the signed Dayton form sufficient for "verifiable parental consent"? (We follow the rule's
   spirit anyway.)

## 4. Smaller questions, if time allows

- Do we need a local representative in Nigeria or Kenya?
- A draft **partnership agreement** for new partner organizations (`docs/templates/PARTNERSHIP-AGREEMENT.md`) sets
  out services, cost sharing for AI usage, mentoring, branding, data protection roles and ending the
  relationship. Please flag anything that would not hold up, especially clauses 4, 8, 12 and 13 (costs, data
  roles, liability and governing law).
- What should a short controller / joint-controller agreement with each partner cover? (Draft template in
  the repository: `docs/templates/CONTROLLER-AGREEMENT-TEMPLATE.md`.)
- Is the incident runbook's 72-hour regulator clock and 48-hour processor clock adequate?
- Does the new parent form (Appendix B) read as plain, informed consent for a parent who may not read English
  well? Any clause that overstates or understates our position?
- Anything in the public notice that overstates or understates our position?

## 5. What we will do with your answers

We will fold them into the review, the DPIA, the transfer record and the notice, adjust the platform if
needed, and record that a lawyer looked. We do not expect you to accept any liability for the platform.

## 6. What is in this package

- **Appendix A:** AI legal review (16 Oct 2026), including a second-pass progress table and a review of the
  older Oloibiri media-release form.
- **Appendix B:** the new parent consent form and the one-page add-on (drafts).
- **Appendix C:** record of the legal basis for sending data abroad.
- **Available on request or in the public repository** (https://github.com/khallinan12345/nextvillage/tree/main/docs):
  data map, vendor review and vendor agreements checklist, DPIA, security program, incident runbook,
  leader guide, controller agreement template.
- **Live pages:** privacy notice https://www.nextvillage.community/privacy and Data Protection Summary
  https://www.nextvillage.community/docs/Data-Protection-Summary.html

## 7. Contact

Kevin Hallinan, kevin.hallinan@nextVillage.community, 1629 E. 4th St., Dayton, OH 45403, USA.
Child-protection lead (Nigeria): Confidence Onuoha, confidenceonuoha416@gmail.com, WhatsApp +234 806 417 7653.
