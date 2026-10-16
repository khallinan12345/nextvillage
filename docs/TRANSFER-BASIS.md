# Record of the legal basis for sending data abroad

**Version 1, 16 October 2026.** Nigeria's Act requires the controller to **record the basis for each
transfer** and the adequacy of protection (NDPA s.41(2)). Kenya requires proof of safeguards (s.48) and, for
sensitive data, consent plus confirmed safeguards (s.49). This is that record. A draft for a lawyer to
confirm (`LEGAL-REVIEW-BRIEF.md`, question 2). It is **not** a statement that every basis below is already
fully in place; the "Status" column says what is missing.

## 1. What leaves Nigeria and Kenya, and where it goes

Everything the platform stores for learners in Nigeria and Kenya is held in the **United States** (Supabase,
AWS Ohio) and delivered through US-based services. Text typed to AI features is sent, after names and
contact details are removed, to the AI vendors in `VENDOR-REVIEW.md`, which are mostly in the US.

## 2. Basis relied on

| Law | Condition used | How it is met | Status |
|---|---|---|---|
| **NDPA s.41(1)(a)** | The recipient is subject to "contractual clauses ... that afford an adequate level of protection" | Vendor data processing agreements with standard contractual clauses, where the vendor offers them | **Not yet complete.** Agreements are being collected (`VENDOR-DPA-CHECKLIST.md`) |
| **NDPA s.41(1)(b), s.43(a)** | The data subject (here the parent or guardian for a child) consented "after having been informed of the possible risks" | The guardian consent form and the public notice state that data is stored and processed in the US and by named categories of vendor, and the risks | **To confirm** when the consent form is received; wording to be added if missing |
| **Kenya DPA s.48(a)-(b)** | Controller has "given proof to the Data Commissioner on the appropriate safeguards" | Safeguards: vendor clauses, scrubbing before AI calls, access controls, retention limits (`SECURITY-PROGRAM.md`) | **Not lodged** with the ODPC. Ask counsel whether lodging is required for this scale |
| **Kenya DPA s.49** | Transfer of **sensitive** personal data (health status; family details) only with the data subject's consent and confirmed safeguards | Health consultation records about community members are rare, identifiers are removed when finished, and the person must have agreed (confirmation added 16 Oct) | **Partly.** The agreement is confirmed by a tick box, not a signed consent |

## 3. Adequacy of protection (NDPA s.42)

The protection a vendor affords is judged on its terms, its security, and where it operates. Summary
position (details in `VENDOR-REVIEW.md`): Anthropic, Groq, Cerebras and Cloudflare say they do not train on
customer content and keep little; Replicate removes API data after one hour; Supabase and Vercel publish
data processing agreements and security attestations; open points are Mistral's training setting, ElevenLabs'
use of voice data, and E2B's region and retention.

## 4. Measures that reduce what is sent

- Names, phone numbers, emails, addresses and school names removed before AI calls.
- Birth year only, never a full date of birth.
- Children under 13: Anthropic only; image, voice and video tools off.
- Retention limits shorten how long data stays at any vendor we control.

## 5. Decision log

| Date | Decision |
|---|---|
| 16 Oct 2026 | Keep US hosting (Supabase does not offer an African region; moving is a large project). Rely on vendor clauses plus informed guardian consent. Revisit after lawyer review |
