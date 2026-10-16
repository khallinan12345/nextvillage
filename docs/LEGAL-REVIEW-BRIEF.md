# Request for a short legal review: children's data on an education platform (Nigeria, Kenya, US)

For a volunteer or low-cost lawyer. **We are asking for about 30 to 60 minutes**, focused on the three
questions in section 3. Everything else is background you may skim or skip. Nothing here is urgent or in
dispute; we are a small program trying to do this properly.

## 1. Who we are and what we do

nextVillage is a learning platform run by a US nonprofit in formation (Impact Mining, Inc., Ohio) with
community partners in Oloibiri, Bayelsa State, Nigeria (the Davidson AI Innovation Center), a partner in
Kenya (Maji Mazuri), and a small after-school group in Dayton, Ohio. Learners are mostly aged 10 to 17;
some are 8 to 12. They learn AI, coding and entrepreneurship, with an AI tutor, and do community projects.
There are no ads and we do not sell data.

Data is stored in the **United States** (AWS Ohio, via Supabase). AI vendors are mostly in the US. A few
hundred learners are registered; a large share are under 18 and some are under 13.

## 2. What we have already done

- **Consent:** a parent or guardian's consent is collected on a signed form by the learner's group leader,
  and the platform records who confirmed it, when, how, and a note (no guardian contact details). A new
  learner under 18 cannot be approved without it. Existing learners are being recorded in batches.
- **Children under 13:** names and photos hidden from other learners, no peer chat by default, one vetted
  AI vendor, shorter retention, no records about other people.
- **Retention schedule enforced nightly** (chat transcripts, messages, media, inactive accounts, logs) and a
  deletion/withdrawal request process (30 days).
- **Public privacy notice** and a Data Protection Summary written against Kenya's DPA 2019, the Nigeria
  Data Protection Act 2023, and COPPA; a written vendor review; an incident-response runbook.
- Security reviews and fixes (access control, sandboxing, dependency updates).

## 3. The three questions (please prioritise)

1. **Nigeria: registration and DPO.** Under the NDPA 2023 and the NDPC's GAID 2025, are we (or our Nigerian
   partner) a "data controller of major importance" that must register with the NDPC, appoint a data
   protection officer, and file annual compliance returns? We process children's records for several
   hundred learners, with the controller based in the US. Who is the controller: Impact Mining, Inc., the
   Nigerian partner, or both jointly?
2. **Cross-border transfer.** All Nigerian and Kenyan learners' data is processed in the US. Which basis
   should we rely on and document (standard contractual clauses with vendors, consent, adequacy, other)?
   Is the plain-language notice plus vendor data processing agreements enough?
3. **Consent for minors.** The NDPA treats everyone under 18 as a child and expects parental or guardian
   consent whose authenticity is verified. Our model is: the local group leader holds a signed form and
   confirms it on the platform. Is that "verification" sufficient? Does the education or social-services
   exception help us? Kenya's DPA s.33 raises the same point.

## 4. Smaller questions, if time allows

- COPPA: we expect a US nonprofit to be largely outside the FTC's reach but follow the rule anyway. Any
  reason to treat the Dayton group (about a dozen children aged 10 to 12, parental consent on file)
  differently?
- Do we need a local representative in Nigeria or Kenya?
- Is a short controller/joint-controller agreement with the Nigerian and Kenyan partners advisable? What
  should it cover?
- Breach notification timing (Nigeria 72 hours to the regulator): is our runbook adequate?
- Anything in the public notice that overstates or understates our position?

## 5. Documents to read (all in the project repository, or sent with this brief)

1. Public privacy notice: https://www.nextvillage.community/privacy
2. Data Protection Summary (Kenya-focused, updated 16 Oct 2026):
   https://www.nextvillage.community/docs/Data-Protection-Summary.html
3. Privacy and child-protection plan (US and Nigeria): `docs/PRIVACY-COMPLIANCE-PLAN.md`
4. Data map (what we hold, retention): `docs/DATA-MAP.md`
5. Vendor review (who receives data, their terms): `docs/VENDOR-REVIEW.md`
6. Incident response runbook: `docs/runbooks/incident-response.md`

## 6. Contact

Kevin Hallinan, kevin.hallinan@nextVillage.community, Dayton, Ohio.
