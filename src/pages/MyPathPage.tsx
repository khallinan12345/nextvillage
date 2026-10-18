// src/pages/MyPathPage.tsx
//
// Public parent and learner handout at /my-path: what nextVillage is for, the learner's path, how
// children are kept safe, and how families can help. Same content as the printable one-page card
// (public/docs/My-Path-Card.pdf; sources in docs/forms/). Keep the two in step with docs/CORE-CURRICULUM.md.
// The contact is vAI's Safety Officer. Other organizations hand out the blank template version of the
// card with their own child safety officer filled in.

import React from 'react';
import { Link } from 'react-router-dom';

const STEPS: { n: number; title: string; body: string; cert?: string }[] = [
  { n: 0, title: 'AI Discovery', body: 'About five short sessions: give AI clear instructions and make a robot, a character, a story and a game.' },
  { n: 1, title: 'AI Foundations', body: 'What AI is, how to ask it well, when it is wrong, and how to use it responsibly.', cert: 'AI Proficiency' },
  { n: 2, title: 'AI-Ready Skills', body: 'Thinking clearly, solving problems, creativity and communication, with AI as a partner.', cert: 'AI Ready Skills' },
  { n: 3, title: 'Vibe Coding', body: 'Build a working app by describing it, testing it and improving it.', cert: 'Vibe Coding' },
  { n: 4, title: 'Web Development', body: 'Understand and write real website code, line by line.', cert: 'Web Development' },
  { n: 5, title: 'Full-Stack Capstone', body: 'Build a complete application with a database and user accounts.', cert: 'Full-Stack' },
];

const H2: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <h2 className="text-xl font-semibold text-emerald-900 mt-8 mb-2">{children}</h2>
);

const MyPathPage: React.FC = () => (
  <div className="min-h-screen bg-white">
    <header className="border-b border-gray-200 print:hidden">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
        <Link to="/" className="font-semibold text-gray-900">nextVillage</Link>
        <Link to="/login" className="text-sm text-blue-700 hover:underline">Log in / Sign up</Link>
      </div>
    </header>

    <main className="max-w-3xl mx-auto px-4 sm:px-6 py-8 text-gray-700 leading-relaxed">
      <div className="rounded-2xl bg-emerald-900 text-white px-5 py-4">
        <h1 className="text-3xl font-extrabold">My path with nextVillage</h1>
        <p className="text-emerald-100 text-sm mt-1">Learning to think, build and lead with AI</p>
      </div>

      <div className="mt-5 rounded-lg border-l-8 border-amber-500 bg-amber-50 p-4 text-gray-900">
        <p>
          <strong className="text-amber-900">Why we are doing this.</strong> The world of work is changing fast, and AI is part of
          almost every job. Our goal is to prepare young people for the modern world: to build the thinking, communication and
          technical skills that <strong className="text-amber-900">employers and communities need</strong>, so they can earn, lead and
          create opportunity close to home.
        </p>
      </div>

      <H2>What is nextVillage?</H2>
      <p>
        A learning platform where young people work with an AI tutor, guided by a trusted leader in their own community. They learn
        to ask good questions, check what AI tells them, build real things, and use what they learn to help people around them. It is
        not a game or a shortcut. It is practice for real work.
      </p>

      <H2>The path, one step at a time</H2>
      <ol className="stack-y-2">
        {STEPS.map(s => (
          <li key={s.n} className="flex gap-3 border border-emerald-100 rounded-lg p-3">
            <span className="flex-shrink-0 w-7 h-7 rounded-full bg-emerald-100 text-emerald-900 font-bold flex items-center justify-center">{s.n}</span>
            <span>
              <strong className="text-gray-900">{s.title}.</strong> {s.body}
              {s.cert && <em className="text-gray-600"> Certificate: {s.cert}.</em>}
            </span>
          </li>
        ))}
      </ol>
      <p className="text-sm text-gray-600 mt-3">
        Each step opens when the one before is passed. Every learner moves at their own pace, and a certificate can be retaken until it is
        earned. Alongside the path: English, Math and Science practice, free exploring, and projects that help the community.
      </p>

      <div className="grid gap-6 md:grid-cols-2">
        <section>
          <H2>What your child gains</H2>
          <ul className="list-disc pl-6 stack-y-1">
            <li>Clear communication and critical thinking</li>
            <li>Problem solving and creativity</li>
            <li>Digital skills and using AI responsibly</li>
            <li>Real projects and certificates as proof of what they can do</li>
            <li>Confidence to lead, teach others and help the community</li>
          </ul>
        </section>
        <section>
          <H2>How we keep your child safe</H2>
          <ul className="list-disc pl-6 stack-y-1">
            <li>A parent or guardian signs a consent form for every learner under 18.</li>
            <li>A trained leader is present, and a named child safety officer follows up on any worry.</li>
            <li>Personal details are removed before text goes to the AI. We never sell information and never show advertisements.</li>
            <li>You can ask to see, correct or delete your child&rsquo;s information at any time.</li>
          </ul>
        </section>
      </div>

      <H2>How you can help at home</H2>
      <ul className="list-disc pl-6 stack-y-1">
        <li>Ask: &ldquo;What did you make or learn today?&rdquo; and ask them to show you.</li>
        <li>Encourage them to check what AI says before believing it.</li>
        <li>Remind them: never share a password, never type phone numbers or addresses to the AI, and tell a leader about anything that worries them.</li>
        <li>Celebrate each step finished. Progress matters more than speed.</li>
      </ul>

      <div className="mt-8 rounded-lg border-2 border-emerald-900 p-4">
        <p className="font-semibold text-gray-900">Questions or concerns?</p>
        <p>
          Talk to your group leader in person, or contact the Safety Officer:{' '}
          <strong>Confidence Onuoha</strong>, Safety Officer for vAI (Village AI), the organization behind nextVillage.community. Phone or WhatsApp +234 806 417 7653,{' '}
          <a className="text-blue-700 underline" href="mailto:confidenceonuoha416@gmail.com">confidenceonuoha416@gmail.com</a>.
        </p>
      </div>

      <p className="text-sm text-gray-600 mt-6 print:hidden">
        <a className="text-blue-700 underline" href="/docs/My-Path-Card.pdf" target="_blank" rel="noopener noreferrer">Print the one-page card (PDF)</a>
        {' · '}
        <Link className="text-blue-700 underline" to="/privacy">Privacy notice</Link>
      </p>
    </main>
  </div>
);

export default MyPathPage;
