# Vendor data processing agreements: checklist

For the account holder (Kevin now; Impact Mining, Inc. later). The US rule (COPPA 312.8(c)) and both African
laws expect **written assurances** from every vendor that handles children's data. Most vendors build the
agreement into their terms, so the task is mostly **find it, accept it where needed, download a dated copy,
and file it**. Re-do each one in the entity's name when Impact Mining, Inc. is official.

**How to record each:** save the PDF (or screenshot with date) in a shared folder named "Vendor
agreements", and tick the box and add the date below.

| Vendor | What to do | Link or place | Done (date) |
|---|---|---|---|
| **Anthropic** | The DPA, with standard contractual clauses, is **built into the Commercial Terms** you accepted. Read it and save it | [How do I view and sign the DPA](https://privacy.claude.com/en/articles/7996862-how-do-i-view-and-sign-your-data-processing-addendum-dpa) | |
| **OpenAI** | Complete OpenAI's DPA form to get a signed copy (the January 2026 DPA is also incorporated into its services agreement). Read the clause on de-identified data | [DPA](https://cdn.openai.com/pdf/openai-data-processing-addendum.pdf), [enterprise privacy page](https://openai.com/enterprise-privacy/) | |
| **Supabase** | Accept/download the DPA in your organization settings; also request the SOC 2 summary if on a plan that includes it | [Supabase DPA](https://supabase.com/legal/customer-resources/data-processing-addendum) | |
| **Vercel** | The DPA is incorporated into the Terms; the public DPA states it applies to **Pro and Enterprise** plans, so check which plan the account is on | [Vercel DPA](https://vercel.com/legal/dpa) | |
| **Resend** | Pre-signed by Resend and effective when you signed up; download your signed copy from **Settings → Documents** | [Resend DPA](https://resend.com/legal/dpa) | |
| **Cloudflare** (Workers AI, email routing) | The customer DPA is incorporated into the self-serve terms; save a dated copy | [Cloudflare DPA](https://www.cloudflare.com/cloudflare-customer-dpa/) | |
| **Replicate** | No public DPA found; ask support for one in writing, and keep the page that states API data is deleted after one hour | [data retention](https://replicate.com/docs/topics/predictions/data-retention), [subprocessors](https://replicate.com/docs/topics/site-policy/subprocessors) | |
| **Groq** | Find the DPA in the console or legal page; switch on **Zero Data Retention** in Data Controls | Groq console → Data Controls | |
| **Cerebras** | Ask for or find the DPA; keep the privacy page statement on non-retention | cloud.cerebras.ai (legal pages) | |
| **Mistral** | Find the DPA; check the "use my data to improve" setting in the admin console and switch it off | Mistral admin console | |
| **ElevenLabs** | Find the DPA; check API data-use and retention settings; keep for under-13s off | elevenlabs.io (legal pages) | |
| **E2B** | Ask for the DPA; confirm region and retention in the Trust Center | trust.e2b.dev | |
| **StackBlitz** | Review terms and ask for a DPA | stackblitz.com (legal) | |
| **SpeechGen** | Review terms; consider removing if no DPA is available | speechgen.io | |
| **GitHub** (code, not learner data) | Accept GitHub's DPA for the organization | github.com legal | |

If a vendor will not provide an agreement, record that, and remove the vendor for children's data or
decide in writing to accept the risk. Update `VENDOR-REVIEW.md` and the privacy notice if the list changes.
