# How nextVillage.community protects learners' data and identity

**For partner organizations, parents and guardians, funders and regulators.** Prepared 16 October 2026.
Plain language on purpose. Where something is already in place we say so; where it depends on the signed
parent or guardian forms, or is still being finished, we say that too. "Identity protection" here means
protecting **personally identifiable information (PII)**: anything that could point to a particular child.

## 1. The short version

Most learners on the platform are children. We built the platform so that a child's identity stays
protected even if something goes wrong: we collect as little as we can, hide children's names from other
people, remove names and contact details before text reaches an AI service, delete old records
automatically, and put the decision to join in the hands of a parent or guardian.

| | What this means | Status |
|---|---|---|
| **We collect little** | Name, email, school, town, country, birth **year** only (never a full birthday), learning activity. No guardian names or phone numbers are stored on the platform. | In place |
| **Children's names are hidden** | Children under 13 appear to other learners as "Learner 1234". Public pages show learners by initials only. | In place |
| **Names are removed before AI sees text** | Other people's names, phone numbers, emails, addresses and school names are removed from what a learner types before an AI model reads it. | In place |
| **Old data is deleted automatically** | A written schedule runs every night: AI chats, messages, pictures and audio, inactive accounts, logs. | In place |
| **Every learner under 18 needs a parent or guardian's consent** | A leader collects a signed form and records it before the learner is approved. | In place; the revised form makes it complete (section 9) |
| **Parents can ask for deletion, a copy, or to withdraw** | In person to a group leader, by email, or on the platform. Reply in 14 days (7 for a copy); deletion within 30 days. | In place |
| **Safety alerts** | If a learner writes something that may show they are at risk, a leader is emailed within seconds. | In place |
| **Vendor agreements, regulator registration, lawyer review** | Paperwork that proves and completes the above. | In progress (section 12) |

## 2. What we collect, and what we do not

**We collect:** name, email, school, town or city and country, which group the learner belongs to, the
learner's **year of birth** (used to apply the right protections), what the learner does on the platform
(answers, projects, certificates), messages to the AI helper, messages in group rooms where a group has
switched them on, and pictures, audio or video the learner creates.

**We record about consent** (for learners under 18): who confirmed that a parent or guardian agreed, when,
how, and a short note.

**We do not collect or keep on the platform:** a full birthday, a guardian's name, phone number or address
(the signed forms stay with the local program), payment details, or location tracking. We do not show
advertising and we do not sell information.

**About other people:** older learners and adult helpers who support someone in the community (for example a
patient or a farmer) may record notes about that person, with that person's agreement confirmed before
saving. Children under 13 cannot create these records. Health records have identifiers removed when the
consultation ends.

## 3. Protecting a child's identity (PII)

1. **Younger children are shown without names.** A learner under 13 appears to others as "Learner 1234": no
   name, no photo, on leaderboards, cohort lists and winner stories. "Under 13" is decided from the birth
   year; a learner with no birth year in a group that includes young children is treated as under 13 until
   it is known.
2. **Public pages show initials only.** The public landing page shows weekly winners by initials. For every
   learner under 18, names are removed from the written winner stories in the database.
3. **Names are removed before text reaches an AI service** (section 5).
4. **The platform never needs a child's contact details.** Parents reach us through the local leader, by
   email or by WhatsApp; those details are not stored with the child's account.
5. **Research is anonymous.** Group results explored by young researchers are shown only for groups of five
   or more, so no one can pick out an individual. Assessment results will be de-identified after three
   years.
6. **No public use without permission.** A child's name, picture, voice or work is not published unless the
   signed form's optional section clearly allows it, and then only the items ticked.
7. **Duplicate accounts are controlled.** Each person should have one account. If someone forgets a password
   they reset it; they do not make a second account. Administrators can find and merge duplicates so a
   child's information is not scattered.

## 4. Who can see what

- **A learner sees their own information.** Other learners in the group see only what is meant to be shared
  (for example a leaderboard), and for younger children only "Learner 1234".
- **Leaders see only their own organization's learners.** A group leader sees the learners in their group, their
  progress, consent records, safety alerts and privacy requests, and nothing from another organization.
- **Every new member must be approved by a leader** who knows them. For a learner under 18, the leader first
  confirms the parent or guardian's consent.
- **Administrators** (the platform team) can see more, to fix problems and carry out deletions. Direct access
  to the database is limited to a very small number of people.
- The database itself enforces these limits (row-level security), so they do not depend only on the website
  working correctly. No one can change their own role or organization.

## 5. Removing identity before AI sees a message ("PII scrubbing")

Everything a learner types to an AI feature passes through two steps first:

1. **A pattern step** removes phone numbers, email addresses and social media handles, in common Nigerian,
   Kenyan and international formats. This always runs.
2. **A language step** finds other people's names and replaces them with a relationship ("my brother", "my
   neighbour", "my patient"), and removes school names, exact ages and addresses. The learner's own first
   name is the only name left in.

**The honest limit.** The language step itself is performed by Anthropic's Claude, so the platform sends it
text that has already been cleaned by the pattern step. The accurate promise is therefore: *every AI
provider other than Anthropic sees only cleaned text; Anthropic sees text with phone numbers and emails
already removed, solely to find and remove the rest.* Anthropic does not use this content to train its
models, and deletes it after a short period.

**Children under 13** reach Anthropic only. All other AI providers, and the image, voice and video tools,
are switched off for them, and the server refuses those requests even if someone tries to call them directly.

## 6. Where information is kept, and where it travels

- **Stored in the United States** (Ohio): the database, sign-in and files (Supabase on Amazon Web Services).
  The website runs on Vercel, also in the US. Nothing is stored on the platform's own computers.
- **Sent for processing**: cleaned text to the AI providers (Anthropic first; a free-tier chain for older
  learners on some pages), code to a sandbox service, email to an email service. All are outside Africa.
- Nigeria's, Kenya's and Ghana's laws expect a lawful basis for this. Ours is: contract terms with each service
  provider that protect the data, **and the parent or guardian's informed consent**, which the revised form
  asks for in plain words, naming the US storage and the risks. See sections 9 and 12.
- Every service provider and what it receives is listed in the appendix and in our privacy notice
  (www.nextvillage.community/privacy).

## 7. Security controls

| Control | In place |
|---|---|
| Encryption | Data is encrypted in transit (TLS) and at rest. |
| Sign-in | Required for AI features. Passwords of at least 8 letters and numbers, checked against leaked passwords; sessions time out. |
| Access limits | Row-level security in the database; leader approval of members; role and organization cannot be self-changed; sensitive functions are locked from signed-out visitors. |
| Running learners' code | Only in an isolated cloud sandbox with rate limits, never on our servers. |
| Secrets | Keys live in protected settings, not in code. |
| Software upkeep | Automatic weekly proposals for security updates; dependency check at zero known vulnerabilities. |
| Code scanning | GitHub's automated scanner checks every change. In October 2026 it found 30 items; the real ones (including cross-site-scripting in two text displays and a local-development helper) were fixed and the rest were reviewed and recorded as harmless. |
| Removing what we do not need | Four unused upload functions and an unused AI vendor were removed. |
| Written plans | Security program with a yearly checklist; incident-response runbook; data map; data protection impact assessment. |

## 8. How long we keep things

| Data | Kept for | Children under 13 |
|---|---|---|
| AI chat transcripts | Cleared 90 days after last activity (scores stay) | 60 days |
| Group messages | 12 months | Chat is off unless the group opts in |
| Pictures, audio, video | 12 months, then the file and its link are deleted | 6 months |
| Health records about others | Identifiers removed when the consultation ends | Not available |
| Inactive accounts | After 12 months a leader decides keep or remove; removed accounts are deleted after 90 days | Same |
| Withdrawn accounts and deletion requests | Deleted within 30 days | Same |
| Activity and code logs | 180 days and 30 days | Same |
| Safety-alert records | 2 years (a longer safeguarding period) | Same |
| Assessment results | At least 3 years, then made anonymous | Same |

Deletion runs automatically every night. Backups are overwritten on the host's normal schedule. What cannot
be removed: a person's name inside someone else's own notes, safety records already made, and anonymous
research that has already been combined into a group of five or more.

## 9. Parent and guardian consent: what is in place, and what the revised forms complete

**In place now.** A parent or guardian's consent is required for every learner under 18. The local leader
collects a signed form, keeps the original safe, and records on the platform that they hold it. The platform
will not let a leader approve a new learner under 18 without that record, and the leader screens warn that a
media-only form is not enough.

**Completed by the revised forms.** The older parent form covered pictures, voice and first name for sharing.
It did not cover use of the platform, AI services, or storage in the United States. The revised forms do:

- **Part A (required):** use of the platform, the AI services, storage and processing in the US, and the risks,
  in plain words, so the parent's consent is *informed*. This is what makes the transfer to the US lawful.
- **Part B (optional, ticked item by item):** pictures, voice, first name for awareness, social media or
  donor reports. Saying no does not affect the child's access.
- **Part C:** the child's own agreement, for children 10 and older.
- **Withdrawal:** in person to the group leader, by email or by WhatsApp. Leaders are guided to read the form
  aloud in the family's language; a parent who cannot write can make a mark with a witness.
- **A one-page add-on** for families who already signed the older form.

As families sign, leaders record each form on the platform. This is being done in batches, and no child loses
access while it is under way.

## 10. What happens if something goes wrong

- **A child may be at risk.** The platform checks each AI message and group-room message for self-harm,
  threats and hate. A leader is emailed with the category and an excerpt, and sees the flag on their
  dashboard. It is automatic and can be wrong; a trained adult talks to the child in person, kindly, the same
  day. A backup address catches alerts for any learner without a leader.
- **A data breach or a lost device.** Leaders tell us within 24 hours so the legal deadline to the regulator
  (72 hours in Nigeria and Kenya) can be met. We keep an incident log and notify affected families.
- **A privacy request.** Handled as in section 8; a leader can lock the account at once.

## 11. Who is responsible for what

| | The partner organization | The platform (vAI) |
|---|---|---|
| Consent forms | Collects, stores the signed originals, records consent | Provides the forms and the recording screens |
| Approving members | Approves only learners it knows | Enforces the approval |
| Requests from parents | Accepts them in any way, passes them on the same day | Replies in 14 days; deletes within 30 |
| Safety alerts | Child-protection contact follows up the same day | Sends the alert and keeps the log |
| Security and privacy settings | Keeps logins private, reports lost devices | Maintains the controls in this document |
| Training | Leaders attend a short session and use the one-page leader guide | Provides both |

## 12. What is still being finished, and what we cannot yet promise

We would rather say this plainly than overstate our position.

- **Vendor agreements:** signed data processing agreements with each service provider are being collected.
  Until they are on file, the contract protection behind the US transfer is not complete.
- **A lawyer's review.** An AI-assisted review against the laws of Nigeria, Kenya and the US has been done
  and is being checked by a volunteer lawyer. Questions include whether a leader-held signed form is enough
  to verify consent, and whether any organization must register with its data protection regulator.
- **Ghana:** a new partner, Open Mind Africa, is joining. Ghana's Data Protection Act 2012 has not yet been
  reviewed in full, and children there should not be enrolled until it has.
- **Remaining PII gaps:** a few background evaluation functions call an AI service without the scrubbing
  step; this is being closed. Address recognition is a safety net and depends partly on the language step.
- **Signed forms still to come:** about 140 learners in Oloibiri are covered by the older form until their
  families sign the add-on. Recording of their consents is not yet complete.
- **Legal status of the operator:** the platform is run today by Kevin Hallinan individually, for vAI (the program
  run by the Davidson AI Futures Lab together with Kevin). Impact Mining, Inc., an Ohio nonprofit now being
  formed, will raise funds for vAI and does not own the platform. This document and the privacy notice will
  be updated if the legally responsible party changes.
- **No promise of perfection.** No system is risk-free. We promise to reduce risk with real controls, to
  tell families the truth about what we do, and to fix problems quickly.

## 13. Your rights and how to reach us

A learner, or a parent or guardian, can ask to see, correct or delete information, ask for a copy, or
withdraw permission, at any time: **in person to the group leader**, by **email**, or on the platform
("Privacy and my data" on the profile page). If you are not satisfied, you can complain to the data protection
regulator in your country.

- **Child-protection lead (Nigeria):** Confidence Onuoha, WhatsApp +234 806 417 7653, confidenceonuoha416@gmail.com
- **Platform operator:** Kevin Hallinan, 1629 E. 4th St., Dayton, OH 45403, USA, kevin.hallinan@nextVillage.community
- **Public notice:** www.nextvillage.community/privacy

---

## Appendix. Service providers and what they receive

| Provider | What it does | What it receives | Children under 13 |
|---|---|---|---|
| Supabase (Ohio, US) | Database, sign-in, file storage | All stored learner information | Yes |
| Vercel (US) | Runs the website and its functions | Traffic and requests | Yes |
| Anthropic | AI tutor, assessment, name-removal and safety checks | Cleaned text (and the original message for safety checks only) | Yes: the only AI provider |
| OpenAI | Task instructions and feedback | Cleaned text | No |
| Groq, Cerebras, Cloudflare, Mistral | Free-tier AI chat on defined pages | Cleaned text | No |
| Replicate, ElevenLabs, SpeechGen | Image, video and voice; read-aloud | Prompts and text | No |
| E2B, StackBlitz | Run and preview code learners write | The code | Limited |
| Resend | Sends email, including safety alerts to leaders | Leaders' email addresses and the alert text | Yes (leaders only) |

*Sources and detail: Data Protection Summary (www.nextvillage.community/docs/Data-Protection-Summary.html),
data map, vendor review, security program, data protection impact assessment and incident runbook, kept with
the project's documents.*
