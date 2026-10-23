# Vendor review: who sees learners' data, and on what terms

Date: 15 October 2026. Written from each vendor's public documentation (links at the bottom) and from
what our code sends (`docs/privacy-and-legal/DATA-MAP.md`). **Not legal advice.** Several points come from secondary
summaries and must be checked on the vendor's own page before they go in a published notice or a
contract. Nothing here has been signed or negotiated yet.

## Bottom line

1. **Under-13s only reach vendors that are fit for it.** Their text AI goes to Anthropic only. Image,
   voice and video generation, speech-to-text, translation to non-Anthropic providers and the free
   chain are all blocked for them (code, 14 Oct). Keep it that way.
2. **Groq, Cerebras and Cloudflare Workers AI** say they do not train on customer content and keep
   little or nothing. Acceptable for learners 13 and over.
3. **OpenRouter's free models are the weak link.** Whether a prompt is logged or trained on depends on
   which host serves the free model, and some do. Recommendation: remove OpenRouter from the chain. It
   already fails every time ("only available on agentic harnesses"), so nothing is lost.
4. **Mistral:** the sources disagree on whether API data is used for training. Keep it only after
   checking the training setting in Mistral's admin console (or remove it, as the chain still has four
   other providers plus Anthropic).
5. **Anthropic** has specific expectations for products used by children (below). We meet most of them.
   The gap is a public statement of how we comply.
6. **Nobody has a signed data-processing agreement on file for us.** Several are accepted by agreeing
   to online terms; Kevin should download and file each one. List at the end.
7. **Our database and files are in the US (AWS us-east-2, Ohio).** Learners are mostly in Nigeria, so
   the privacy notice must say data is stored in the US. A lawyer must confirm the legal basis for that
   transfer under Nigeria's NDPA.

## Vendor by vendor

| Vendor | What it receives from us | Training on our data | Retention | Children | Verdict |
|---|---|---|---|---|---|
| **Anthropic** (tutor, feedback, safety check, young learners' only AI) | chat text with names/contacts removed; learner work for feedback; the raw latest message for the safety check | Not on commercial/API content (commercial terms) | API logs auto-deleted after 7 or 30 days (sources differ: confirm in the DPA); longer only if we opt in | Operator must add age checks, content filtering, monitoring, and may use Anthropic's child-safety system prompt; operator is responsible for COPPA and local rules | **Keep.** Close the gaps below. |
| **OpenAI** (task instructions, some feedback, image generation) | learner prompts, code | Not since March 2023 unless we opt in | Abuse-monitoring logs up to 30 days; zero retention only by approval | Not for under-13s; we block them. Work for 13 to 17 needs parental consent in the consumer product; API customers carry the responsibility | **Keep for 13+.** Confirm age terms; sign the DPA. |
| **Groq** (free-tier chat) | cleaned chat text | Reported: no | None by default; abuse/reliability logs up to 30 days; zero-retention toggle exists in the console | Not designed for children; 13+ only on our side | **Keep for 13+.** Turn on zero retention in Data Controls. |
| **Cerebras** (free-tier chat) | cleaned chat text | Terms reported to bar it | Says it does not retain inputs/outputs; logs kept "as needed", no fixed limit | Same | **Keep for 13+.** |
| **Cloudflare Workers AI** (free-tier chat) | cleaned chat text | No, without consent | No period stated; stored only if we use their storage | Same | **Keep for 13+.** Daily free quota runs out (seen in triage). |
| **OpenRouter** (free-tier chat) | cleaned chat text | Depends on the host of the free model; some train | Prompts not logged by OpenRouter by default; the host's policy governs | Same | **Remove.** |
| **Mistral** (free-tier chat) | cleaned chat text | Sources conflict | About 30 days for abuse monitoring; zero retention by request | Same | **Check setting, or remove.** |
| **Replicate** (images, video, some voice) | cleaned prompts, text, learner-chosen images | Not stated; models are third-party | API predictions deleted after 1 hour by default | Blocked for under-13s | **Keep for 13+.** Good retention. |
| **Microsoft Azure AI Speech** (read-aloud; replaces SpeechGen once its key is set) | a few sentences of text to read | Microsoft's standard cloud terms; confirm the Speech data-use and no-logging settings | Not stored by the service after synthesis (confirm) | Blocked for under-13s (same rule as SpeechGen) | **Keep for 13+ once its DPA is signed.** Microsoft offers a standard DPA. |
| **ElevenLabs / SpeechGen** (read-aloud, voice) | text to read | May use voice data to improve systems (secondary source) | Not confirmed | Says its service is not directed to under 13s | **Keep for 13+.** Confirm API data-use and retention; SpeechGen not reviewed. |
| **E2B** (runs learners' code) | the code, and anything a learner typed in it | Not stated | Not found | Isolated virtual machines; SOC 2 Type II reported | **Keep.** Confirm the region (US, EU or APAC offered) and retention in the Trust Center. |
| **Supabase** (everything stored) | all account and learning data | n/a (our own database) | We control it (`DATA-MAP.md`) | n/a | **Keep.** Region **us-east-2 (Ohio)**. DPA and SOC 2 Type 2 available. Backups, logs and edge functions may sit outside the chosen region. |
| **Vercel** (website and API routes) | web traffic, request bodies in transit | n/a | not reviewed | n/a | **Not reviewed.** Get the DPA. |
| **Resend** (emails: leader alerts) | leader emails, safety-alert text including a learner's flagged message | not reviewed | not reviewed | n/a | **Not reviewed.** Alert emails can contain a child's words; confirm retention and get the DPA. |
| **StackBlitz** (live project preview) | project code | not reviewed | not reviewed | n/a | **Not reviewed.** |

## Anthropic's expectations for products used by children, and where we stand

From Anthropic's guidance for organizations serving minors (March 2026):

| Expectation | Ours |
|---|---|
| Age verification, so only intended users get in | Leader approval of every member; birth year recorded; guardian-consent confirmation for new young learners. |
| Content moderation and filtering | Safety classifier on messages; safety flags to leaders; a safety floor added to prompts. |
| Monitoring and reporting | Flags emailed to leaders; Together reports. |
| Anthropic's child-safety system prompt, if offered | **Open:** check whether Anthropic offers it for our use and add it for young learners. |
| Comply with COPPA and local rules, and state compliance publicly | **Open:** the public privacy page, once published, should describe this. |

## Decisions and actions

- **Remove OpenRouter** from the free-tier chain (code change, low risk).
- **Mistral:** check the "use my data to improve" setting in the admin console. If it cannot be turned off, remove it.
- **Groq:** switch on zero data retention in Data Controls.
- **Ask Anthropic** whether the child-safety system prompt applies to our API use, and add it for young learners.
- **Collect and file DPAs** (account holder): Anthropic, OpenAI, Supabase, Vercel, Resend, Replicate, ElevenLabs, E2B, Groq, Cerebras. Most are accepted in the account terms; save a dated copy.
- **Review the four vendors not yet read:** Vercel, Resend, StackBlitz, SpeechGen.
- **Attorney:** transfer of Nigerian and Kenyan learners' data to the US; COPPA for the Dayton group; under-18 terms of OpenAI and ElevenLabs.

## Sources (read 15 Oct 2026; check the primary pages before relying on any figure)

- Anthropic: [guidelines for organizations serving minors](https://support.claude.com/en/articles/9307344-responsible-use-of-anthropic-s-models-guidelines-for-organizations-serving-minors), [child safety guidance for developers](https://support.claude.com/en/articles/15591275-child-safety-guidance-for-developers), [API data retention (secondary)](https://www.getvoibe.com/resources/claude-api-data-retention/)
- OpenAI: [your data](https://developers.openai.com/api/docs/guides/your-data)
- Groq: [your data](https://console.groq.com/docs/your-data)
- OpenRouter: [logging and privacy](https://openrouter.ai/docs/guides/privacy/logging)
- Cerebras: [privacy policy](https://cloud.cerebras.ai/privacy)
- Cloudflare: [Workers AI privacy](https://developers.cloudflare.com/workers-ai/platform/privacy/)
- Mistral: summaries only ([waimakers](https://www.waimakers.com/en/resources/gdpr-compliance/mistral-ai), [meetily](https://meetily.ai/llm-privacy/mistral)); primary pages to be read
- Replicate: [data retention](https://replicate.com/docs/topics/predictions/data-retention)
- ElevenLabs: [terms of use](https://elevenlabs.io/es/terms-of-use) and secondary summaries of its privacy policy
- E2B: [security](https://e2b.dev/security)
- Supabase: [data residency FAQ](https://supabase.com/legal/privacy-resources/data-residency-and-transfers-faq), [DPA](https://supabase.com/legal/customer-resources/data-processing-addendum), [SOC 2](https://supabase.com/docs/guides/security/soc-2-compliance)
