# Letting a funder try the platform

**For:** Kevin Hallinan (and whoever helps him). **Set up:** 19 October 2026.

Funders see only the landing page. Sometimes a funder wants to try the platform before encouraging a
community they already support to use it. For that, there is a separate organization called
**nextVillage Funders**. A funder joins it with a join code and is approved as a **student**, so they see
exactly what a learner sees. They never see any other organization's learners, and nobody else sees them.

- **Organization:** nextVillage Funders
- **Organization id:** `0fddc609-fdfd-4d92-a576-0c8ae7dcae1f`
- **Leader (the person who approves):** Kevin's platform-administrator account
- **Child safety officer on record:** Kevin Hallinan (the platform will not let a leader approve anyone until
  one is named)
- **What they can use:** the same five areas as the Oloibiri learners (Foundations, AI Proficiency, Tech
  Skills, Creative AI, Community Impact AI). No chat between members.
- **Join code:** **not written here on purpose.** This repository is public, and a join code is a key. Look it
  up with the first step below.

## Giving a funder access (step by step)

1. **Look up the join code.** In Supabase (project "AI and Skills Credential Certification"), open the SQL
   editor and run:
   `select join_code from organizations where id = '0fddc609-fdfd-4d92-a576-0c8ae7dcae1f';`
2. **Send the funder** the website address (nextvillage.community), the code, and the short note below.
   Send the code privately (email or message), never in a group or a public post.
3. **They sign up** and enter the code in their profile. They choose **Student** as their role. They stay
   "pending" and cannot do anything yet.
4. **You approve them.** Sign in, open the admin student dashboard, and find the pending members card. Approve
   the person. If they chose a role other than student, change it to **student**.
5. **Enter their birth year.** On the same dashboard, use the card "learners without a birth year". Until a
   birth year is known the platform treats the person as possibly under 13: names are hidden and some features
   are limited. A funder is an adult, so enter a real year (ask them) or any year that makes them an adult.
6. **Tell them it is ready.** They sign in and use it like a learner.

### Short note to send with the code

> Here is how to try nextVillage as a learner. Go to nextvillage.community, create an account, choose
> **Student** as your role, and enter the code **[the code]** in your profile. I will approve you within a
> day. You will see what a learner sees. Please use a first name or nickname as your display name if you
> prefer. Nothing you do here is shared with the communities we work with.

## After the trial

- **Remove a person who is finished:** delete their account from the admin student dashboard, or from the
  terminal: `npm run user:delete -- <their profile id>` (add `--confirm` to do it; without it, it only shows
  what would go).
- **If the code gets around:** change it. In Supabase run:
  `update organizations set join_code = 'NEWCODE', join_codes = array['NEWCODE'] where id = '0fddc609-fdfd-4d92-a576-0c8ae7dcae1f';`
  Anyone already approved keeps access; only new sign-ups need the new code.

## Things to keep in mind

- **Cost.** A funder's AI use costs money like anyone's. A few sessions are cheap; check the cost log if a
  trial runs long.
- **Counts.** Leave this organization out of any "number of learners" or impact figure you give funders, so
  the real numbers stay honest. The monthly assessment and the leaders' progress reports already ignore it.
- **Privacy.** Funders are adults who gave a name and email. The same privacy notice applies. Delete them on
  request, as above.
- **Adults only.** Never give this code to a child or to a community's learners. Learners join their own
  organization with its own code.

## Where this came from

Kevin's decision, 19 October 2026: funders are enrolled only as students, in one shared organization, so they
experience the platform as a learner would. It was created directly in the database, the same way the UD-OLLI
group was. This note is the only written record, so keep it up to date if the setup changes.
