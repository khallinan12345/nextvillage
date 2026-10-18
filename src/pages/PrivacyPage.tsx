// src/pages/PrivacyPage.tsx
//
// Public privacy notice, at /privacy. Written to be readable by a young learner. It must match
// what the platform does (docs/DATA-MAP.md, docs/VENDOR-REVIEW.md, docs/PRIVACY-COMPLIANCE-PLAN.md);
// update it whenever those change. The responsible party is an individual for now and should
// change when an organization is formed.

import React from 'react';
import { Link } from 'react-router-dom';

const UPDATED = '17 October 2026';
const CONTACT_EMAIL = 'confidenceonuoha416@gmail.com';

const H2: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <h2 className="text-xl font-semibold text-gray-900 mt-10 mb-3">{children}</h2>
);
const UL: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <ul className="list-disc pl-6 stack-y-1.5 text-gray-700">{children}</ul>
);

const PrivacyPage: React.FC = () => (
  <div className="min-h-screen bg-white">
    <header className="border-b border-gray-200">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
        <Link to="/" className="font-semibold text-gray-900">nextVillage</Link>
        <Link to="/login" className="text-sm text-blue-700 hover:underline">Log in / Sign up</Link>
      </div>
    </header>

    <main className="max-w-3xl mx-auto px-4 sm:px-6 py-10 text-gray-700 leading-relaxed">
      <h1 className="text-3xl font-bold text-gray-900">Privacy notice</h1>
      <p className="text-sm text-gray-500 mt-1">Last updated {UPDATED}</p>

      <p className="mt-6">
        nextVillage.community is a learning platform. Students use it to learn AI, coding and entrepreneurship skills
        and to do projects that help their own community. This page explains what information we keep about
        you, why, who else can see it, and what you can do about it. We have tried to write it in plain words.
      </p>

      <div className="mt-6 rounded-lg border border-emerald-200 bg-emerald-50 p-4">
        <p className="font-medium text-gray-900">The short version, for parents and guardians</p>
        <UL>
          <li>We ask your child for their name, school, town, and the year they were born. We keep what they write and make on the platform.</li>
          <li>A leader from their group approves them, and a parent or guardian’s permission is recorded for every learner under 18.</li>
          <li>AI helpers receive their typed text with names and contact details removed. A safety check reads the latest message as written so a leader can step in if a child may be at risk.</li>
          <li>Children under 13 get extra protections (listed below).</li>
          <li>We do not sell information and we do not show advertising.</li>
          <li>Want to know what your child will do and why? Read the <Link className="text-blue-700 underline" to="/my-path">My path handout</Link>.</li>
          <li>You can ask us to show, correct or delete everything. Parents without email can simply tell the group leader in person, or contact Confidence Onuoha (child protection lead) at <a className="text-blue-700 underline" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.</li>
        </UL>
      </div>

      <div className="mt-6 rounded-lg border border-sky-200 bg-sky-50 p-5" id="for-learners">
        <p className="text-lg font-semibold text-gray-900">For learners: your information, in simple words</p>
        <ul className="list-disc pl-6 mt-3 stack-y-2 text-gray-800 text-base">
          <li>This is your space to learn. We keep a little information about you so the site works: your name, your town, the year you were born, and what you write and make.</li>
          <li>Your leader and the nextVillage team can see your work so they can help you. Other learners cannot see your private work.</li>
          <li>When you talk to the AI, it does not need your phone number, your address, or your family’s secrets. <strong>Do not type them.</strong> If you do by mistake, tell your leader.</li>
          <li>The AI can be wrong. Check important things with a person you trust.</li>
          <li>Never share your password. If you forget it, press “Email me a link to reset my password.” Do not make a second account.</li>
          <li>If something online makes you feel scared, sad, or uncomfortable, tell your leader or an adult you trust, right away. You will not be in trouble.</li>
          <li>If you write that you are in danger or want to hurt yourself or someone else, a leader will be told so that they can help you.</li>
          <li>We never sell your information and we never show you advertising.</li>
          <li>Your parent or guardian can ask to see your information, change it, or delete it. You can ask your leader too.</li>
          <li>Want to ask a question about any of this? Ask your leader, or talk to Confidence Onuoha.</li>
        </ul>
      </div>

      <H2>Who is responsible</H2>
      <p>
        nextVillage.community (families may also know it as vAI lab; it works with the Davidson AI Futures Lab in Oloibiri) is run by
        <strong> Kevin Hallinan</strong>, 1629 E. 4th St., Dayton, OH 45403, USA. For any
        question or request, tell your group leader in person, or contact Confidence Onuoha, our child protection lead, by email at{' '}
        <a className="text-blue-700 underline" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> or on WhatsApp/phone at +234 806 417 7653. We expect to move the program into an organization, and this notice will say so
        when that happens.
      </p>

      <H2>What we collect</H2>
      <UL>
        <li><strong>About you:</strong> your name, email, school, town or city, country, the year you were born (not your full birthday), a picture if you add one, and which group you belong to.</li>
        <li><strong>What you do here:</strong> your answers, reflections and projects; chats with the AI helper; code you run; images, audio and video you make; certificates and scores.</li>
        <li><strong>Messages</strong> you send in Together rooms, where your group has them switched on.</li>
        <li><strong>About other people, only for community projects led by older learners and adults:</strong> for example a patient, farmer or business owner a trained helper supports. Learners under 13 cannot create these records. Only enter what your leader has told you to enter, and only with that person’s agreement.</li>
      </UL>
      <p className="mt-3">
        We use your birth year to give younger learners the right protections and to follow the law.
      </p>

      <H2>Children</H2>
      <p>
        Many of our learners are children. <strong>For every learner under 18, a parent or guardian’s
        permission is recorded by the learner’s group leader before they are approved</strong> (or, for learners
        who joined earlier, by the leader from the signed forms the program holds). Learners join through a
        leader, who approves each new member.
      </p>
      <p className="mt-3">For learners under 13 we add extra protections:</p>
      <UL>
        <li>Other learners see them as “Learner 1234”, not by name or photo.</li>
        <li>No messaging with other learners (unless their parents have been told and the program has chosen to allow it for a supervised group).</li>
        <li>Their typed text goes to only one AI provider, Anthropic. Image, voice and video tools and the other AI providers are switched off for them.</li>
        <li>They cannot enter information about other people.</li>
        <li>Their AI chat history and the files they make are deleted sooner (see “How long we keep it”).</li>
      </UL>

      <H2>Why we use it</H2>
      <p>
        To run your account, teach and give feedback, keep learners safe, show your leader how the group is
        doing, and report progress, in grouped form, to the people who fund the program. We do not sell
        personal information and we do not show advertising.
      </p>

      <H2>Who else receives it</H2>
      <p>
        Some services handle data for us. Before text is sent to an AI service we remove names and contact
        details from it. One exception, on purpose: a safety check reads your latest message as you wrote it,
        so that a leader can help if someone may be in danger.
      </p>
      <div className="overflow-x-auto mt-3">
        <table className="w-full text-sm border border-gray-200">
          <thead className="bg-gray-50 text-left">
            <tr><th className="p-2 border-b">Service</th><th className="p-2 border-b">What it does</th><th className="p-2 border-b">What it receives</th></tr>
          </thead>
          <tbody className="align-top">
            {[
              ['Supabase', 'Stores accounts, work and files (servers in Ohio, USA)', 'Everything described above'],
              ['Vercel', 'Runs the website', 'Web traffic'],
              ['Anthropic', 'AI tutor, feedback and the safety check', 'Cleaned chat text; learner work for feedback; the latest message as written, for the safety check'],
              ['OpenAI', 'Some task instructions, feedback and images', 'Learner prompts and code (not for learners under 13)'],
              ['Groq, Cerebras, Cloudflare, Mistral', 'Free AI tutor on some pages', 'Cleaned chat text (not for learners under 13)'],
              ['Replicate', 'Makes images, video and voice', 'Cleaned prompts and text (not for learners under 13)'],
              ['ElevenLabs, SpeechGen', 'Reads text aloud', 'The text to read (not for learners under 13)'],
              ['E2B', 'Runs the code you write in a safe sandbox', 'Your code'],
              ['StackBlitz', 'Live preview of your project', 'Your project code'],
              ['Resend', 'Sends emails, including safety alerts to leaders', 'Leaders’ email addresses and the alert text'],
            ].map(([a, b, c]) => (
              <tr key={a}><td className="p-2 border-b font-medium">{a}</td><td className="p-2 border-b">{b}</td><td className="p-2 border-b">{c}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3">
        These companies are in the United States or other countries, so your information is processed outside
        Nigeria and outside your home country. We prefer services that say they do not use customers’ content to train
        their AI models, and we are reviewing each service’s terms.
      </p>

      <H2>Who inside nextVillage can see it</H2>
      <p>
        Your leader and the administrators of your organization can see your work, your progress and safety
        alerts about you. Other learners can see your first name and last initial on leaderboards, and what
        you share in Together rooms. A certificate link can be opened by anyone you give it to.
      </p>

      <H2>Safety</H2>
      <p>
        Messages in Together rooms and AI chats are checked automatically for signs of self-harm, threats or
        hateful content. When something is flagged, your leader is told by email. Flagged items are kept for up
        to two years as a safety record.
      </p>

      <H2>How long we keep it</H2>
      <p>
        We keep each kind of information only as long as we need it for the reason shown, then delete it or
        make it anonymous. Younger children’s information is deleted sooner.
      </p>
      <UL>
        <li><strong>AI chat transcripts</strong> (so the tutor can continue your lesson and your leader can help): cleared 90 days after your last activity on that item (60 days for learners under 13). Your scores and evaluations stay, because they show your progress.</li>
        <li><strong>Together messages</strong> (so a group can work together): 12 months.</li>
        <li><strong>Images, audio and video you make, and files shared in Together</strong> (so you can use and share your work): 12 months (6 months for learners under 13).</li>
        <li><strong>Activity logs</strong> (to keep the service running): 180 days. <strong>Code-run logs</strong> (to prevent abuse): 30 days. <strong>Safety records</strong> (so leaders can protect learners): 2 years.</li>
        <li><strong>Health consultation records about other people</strong> (to help that person): the person’s name, village, phone number and notes are removed when a consultation is finished. We are bringing other community records under the same rule.</li>
        <li><strong>Assessment results</strong> (to show learning over time): kept for at least 3 years, then made anonymous.</li>
        <li><strong>Accounts that go unused for 12 months</strong> are reviewed by a leader and, if not kept, deleted 90 days later.</li>
        <li><strong>Consent records</strong> (to show that a parent or guardian agreed): kept while the learner has an account, and the signed paper form is kept by the group.</li>
        <li><strong>Deletion requests:</strong> we delete your account and files within 30 days. We cannot remove your name from another person’s own notes or messages, safety records already made, grouped statistics, or copies a service keeps under its own rules. Backups are overwritten on a regular schedule.</li>
      </UL>

      <H2>Your choices</H2>
      <p>
        You, or your parent or guardian, can ask to see, correct or delete your information, withdraw
        permission, or ask for a copy. If you have an account, go to <Link className="text-blue-700 underline" to="/profile">My Profile</Link> and
        use “Privacy and my data”. You can also email{' '}
        <a className="text-blue-700 underline" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>, or tell your group leader in person, who passes it to us the same day. We reply within 14 days (within 7 days if you only want a copy of your information). Deleting an account and its files is completed within 30 days.
        If you are under 18, your parent or guardian can make these requests for you.
      </p>
      <p className="mt-3">
        If you are not happy with our answer, you can complain to the data protection regulator where you
        live: in Nigeria, the Nigeria Data Protection Commission; in the United States, the Federal Trade
        Commission.
      </p>

      <H2>Security</H2>
      <p>
        Accounts need a password of at least 8 letters and numbers. Access to data is limited by role. A new
        member must be approved by a leader. Code you run is executed in an isolated sandbox. If we learn that
        personal information has been exposed, we will tell the people affected and the authorities as the law
        requires.
      </p>

      <H2>Changes</H2>
      <p>
        If we change this notice in a meaningful way, we will tell you in the app before it applies. The date
        at the top shows when it last changed.
      </p>
    </main>
  </div>
);

export default PrivacyPage;
