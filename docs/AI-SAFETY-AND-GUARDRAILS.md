# How the AI is kept safe for children

**Who this is for.** Parents and guardians, group leaders, partner organizations, funders, and the team.
It describes the protections around the AI as they are built today, and it says plainly what they cannot
do.

Version 1, 17 October 2026. Written from the platform's code and settings.

## 1. The short version

The AI on nextVillage is a tutor, not a friend, a doctor or a counsellor. Several layers of protection
surround it:

1. **Rules the AI must follow** on every page.
2. **A separate safety checker** reads each learner message and alerts a person when it sees a clear risk.
3. **Personal details are removed** before messages are sent on.
4. **Younger learners get stricter settings.**
5. **A person is always the final safety net.** Leaders follow up on alerts and talk to the child.

No layer is perfect. Together they lower the risk; they do not remove it. That is why the leader in the
room matters.

## 2. Layer 1: rules the AI must follow

Every request to the AI carries a safety section that is added by our server, so no page can leave it
out. It tells the AI:

- Never give instructions or encouragement for violence, weapons, dangerous substances or self-harm.
- Never produce content that sexualizes, demeans or discriminates against anyone, including racist or
  sexist content.
- Never help harass, bully, threaten or plan harm against another person.
- If a user shows distress, self-harm or danger, respond with care and point to a trusted adult or local
  support, and never brush past it.

**Limit:** these are instructions to a language model, so they are strong but not absolute. That is why
the second layer exists.

## 3. Layer 2: an independent safety checker

A separate AI call, with its own fixed instructions that the learner cannot talk it out of, reads each
message a learner sends and labels it one of:

- fine,
- possible self-harm or serious personal crisis,
- a threat or plan to harm another person,
- hateful or discriminatory content.

If it is not "fine", an email goes at once to the leaders of the learner's organization and to a fallback
address held by the platform team. The email shows the learner's name, the community, the page, the time
and the flagged message, and it says clearly that an AI flagged it and that a person has not yet reviewed
it. The alert is also recorded in the platform's event log. The learner's own chat is not interrupted.

**Design choices and limits:**

- It is built to flag clear cases and leave borderline ones alone, to avoid flooding leaders with false
  alarms. It will miss some things.
- If the checker is down, learners can still use the platform; the failure is logged so the team sees it.
  A silent gap in the net is a gap the team must fix.
- It checks the **original** message before personal details are removed, so the leader gets the full
  context.
- If a learner has no leader yet, the fallback address receives the alert.
- It reads text. It does not read images, drawings or voice, and it cannot see what happens off the
  platform.

## 4. Layer 3: personal details removed

Before a conversation goes to the AI, the platform removes phone numbers, email addresses, social handles,
exact addresses, school names, exact ages and birthdates. Other people's names are replaced with a
relationship word ("my brother", "my neighbour"). The learner's own first name is kept so the tutor can
be friendly. Pages where the conversation is about a real person in the community keep neighbourhood-level
detail, because that is the point of the exercise, but still remove phone numbers, exact addresses and the
learner's last name.

**Limit:** To find what must be removed, the text goes to the AI provider (Anthropic) once for that
cleaning step. So the guarantee is that **everyone other than that provider sees only cleaned text**, not
that personal information never leaves the platform. The provider's terms limit what it may do with it.
Some evaluation routes still send the learner's name; this is listed as an open item in the student
evaluation document.

## 5. Layer 4: stricter settings for younger learners

A learner is treated as "young" when their birth year says they could be under 13, or when they have no
birth year yet and belong to an organization whose youngest learners are under 13. Young learners:

- **have no peer chat**, unless their organization explicitly allows it;
- **have names and photos hidden** from other learners;
- **use only our reviewed main AI provider (Anthropic)**, not the free-tier providers or other vendors we
  have not vetted;
- **cannot record third-party information** such as private details about other people;
- are protected on a "fail closed" basis: if the platform cannot tell a learner's age, it applies the
  stricter rule.

Health-related conversations always go to the main reviewed provider and never to a free-tier provider.

## 6. Layer 5: the people

- **Leaders** read and act on alerts the same day (see the safeguarding policy).
- **The child-protection lead** (Confidence Onuoha) is the escalation point for every concern.
- **The team** reviews the event log, checks that alert emails arrive, and improves the checker when it
  misses something. Any change to the checker or the AI's rules is a tier B or C change.

## 7. What the AI is not allowed to be

- A replacement for a doctor, nurse, counsellor or teacher. Health pages give first-level guidance and
  point to a clinic.
- A source of private information about other people.
- A place for learners to share personal details. Learners are told not to type phone numbers, addresses
  or other people's private details.
- A secret. Conversations may be seen by the learner's leaders and the platform team.

## 8. What can still go wrong

We would rather say this than pretend otherwise:

- **The AI can say something wrong,** or something unsuitable, despite the rules. Learners are taught to
  check what AI says (this is one of the skills we teach).
- **The safety checker can miss a message,** or flag one that is harmless.
- **A cleaning step can fail to remove a detail,** especially an unusual one.
- **A leader may not see an alert** if the email goes to spam. Leaders should check their spam folder and
  tell the team if alerts do not arrive.
- **Children can find ways around rules.** They are creative. Leaders should watch for it.

Anything that goes wrong is treated as a reason to improve, and serious cases are logged in the decision
log. A real incident follows the incident runbook.

## 9. Frequently asked questions

**Can my child talk to strangers on the platform?** Not by default. Learners under 13 have no peer chat
unless the organization turns it on.

**Does the AI know who my child is?** It sees the learner's first name and what they type, with personal
details removed. It has no access to their address, school or family details unless they type them in
(which we tell them not to do).

**What happens if my child writes something worrying?** A leader is alerted by email, talks to the child
in person, and, if there is a real concern, follows the safeguarding policy.

**Who can see my child's conversations?** The learner, the leaders of their organization, and the platform
team for support and safety. Research uses anonymous, combined results only.

**Can I ask for the conversations to be deleted?** Yes. Tell the group leader in person, or contact
Confidence Onuoha. See the privacy notice for the details.

## 10. Where to find the details

| Topic | Where |
|-------|-------|
| Safety rules and checker | `api/_lib/safetyGuardrails.js` |
| Removing personal details | `api/_lib/piiScrubbing.js` |
| Younger-learner rules | `api/_lib/youngLearner.js` and the database functions it mirrors |
| What happens after a flag | Child safeguarding policy, section 6 |
| Incidents | `docs/runbooks/incident-response.md` |
| AI providers and data flows | `docs/VENDOR-REVIEW.md`, `docs/DATA-MAP.md` |
| How a change to any of this is decided | `docs/CHANGE-PROCESS.md` |
