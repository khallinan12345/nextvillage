// src/pages/AboutPage.tsx

import React from 'react';
import AppLayout from '../components/layout/AppLayout';
import {
  Award, Globe, Code, Code2, Brain, Lightbulb, Puzzle, Monitor, MessageSquare, Shield, CheckCircle,
  Volume2, BookOpen, BarChart, Database, Film, ImagePlus, Mic, Cpu, Briefcase,
  Users, Sprout, Fish, Heart, PawPrint, ExternalLink,
} from 'lucide-react';

const AboutPage: React.FC = () => {
  const foundations = [
    {
      name: 'English Skills',
      icon: <BookOpen className="h-7 w-7" />,
      color: 'from-amber-400 to-orange-400',
      description: "AI-coached conversation practice through staged difficulty levels — with a Pidgin/English toggle so you can hear the coach in the language you're most comfortable with.",
    },
    {
      name: 'Math Skills',
      icon: <BarChart className="h-7 w-7" />,
      color: 'from-amber-400 to-orange-400',
      description: "Seven staged modules from number sense through algebra and geometry — each stage unlocks once you've mastered the last.",
    },
    {
      name: 'Science Skills',
      icon: <Brain className="h-7 w-7" />,
      color: 'from-amber-400 to-orange-400',
      description: 'Five Scientific Reasoning stages open the door to parallel Life Sciences and Physical Sciences pathways.',
    },
  ];

  const certifications = [
    {
      name: 'AI Proficiency',
      icon: <Award className="h-8 w-8" />,
      color: 'from-purple-600 to-pink-600',
      measures: 'Your ability to use AI tools to solve problems, reason about when and how to use AI, and reflect on its limitations.',
      frameworks: 'UNESCO AI Competency Framework, ISTE Standards for Students',
      matters: "Employers are looking for people who can work with AI, not just around it.",
    },
    {
      name: 'AI Ready Skills',
      icon: <Lightbulb className="h-8 w-8" />,
      color: 'from-yellow-500 to-orange-600',
      measures: 'Five essential skill areas working together: Critical Thinking, Problem-Solving, Creativity, Digital Fluency, and Communication — the human skills that decide whether AI use actually helps.',
      frameworks: 'UNESCO Transversal Competencies, ISTE Standards, Partnership for 21st Century Skills, DigComp 2.2, Classical Rhetoric',
      matters: 'AI amplifies whatever thinking you bring to it — this is the skillset that makes the amplification worth something.',
    },
    {
      name: 'Vibe Coding',
      icon: <Code className="h-8 w-8" />,
      color: 'from-blue-600 to-cyan-600',
      measures: 'Your ability to design algorithms, write logic, use prompts to generate code, and debug effectively with AI assistance.',
      frameworks: 'CSTA K–12 Computer Science Standards, ISTE Computational Thinker',
      matters: "Shows you're ready for tech-related roles — even if you're just starting out.",
    },
    {
      name: 'Web Dev Certification',
      icon: <Code2 className="h-8 w-8" />,
      color: 'from-sky-600 to-blue-600',
      measures: 'Your ability to design, build, and deploy a real website using React and Vite — from layout to working features.',
      frameworks: 'CSTA K–12 Computer Science Standards, ISTE Computational Thinker',
      matters: 'A live website is proof you can build for the web, not just talk about it.',
    },
    {
      name: 'Full-Stack Certification',
      icon: <Database className="h-8 w-8" />,
      color: 'from-blue-700 to-indigo-700',
      measures: 'Your ability to pair a working frontend with a real backend — data modeling, forms, and security rules on Supabase/PostgreSQL.',
      frameworks: 'CSTA K–12 Computer Science Standards, ISTE Computational Thinker',
      matters: 'Full-stack skills are what separate a hobby project from a job-ready one.',
    },
    {
      name: 'AI Video Production Certification',
      icon: <Film className="h-8 w-8" />,
      color: 'from-rose-600 to-red-600',
      measures: 'Your ability to generate, edit, and assemble AI video into a finished, watchable piece.',
      frameworks: 'ISTE Creative Communicator, UNESCO Digital Literacy Global Framework',
      matters: 'Video is how most people learn and share online — this proves you can make it, not just watch it.',
    },
    {
      name: 'AI Image Creation Certification',
      icon: <ImagePlus className="h-8 w-8" />,
      color: 'from-fuchsia-600 to-pink-600',
      measures: 'Your ability to direct AI image generation with intention — prompting, iterating, and choosing the right image for the message.',
      frameworks: 'ISTE Creative Communicator, UNESCO Creative Competency',
      matters: 'Visual communication is a real skill employers and communities notice immediately.',
    },
    {
      name: 'AI Voice Creation Certification',
      icon: <Mic className="h-8 w-8" />,
      color: 'from-violet-600 to-purple-600',
      measures: 'Your ability to generate clear, natural AI voice and narration for real use — training material, announcements, storytelling.',
      frameworks: 'ISTE Creative Communicator, Classical Rhetoric',
      matters: "Voice reaches people text can't — including those who read less than they listen.",
    },
    {
      name: 'AI Workflow Dev Certification',
      icon: <Cpu className="h-8 w-8" />,
      color: 'from-teal-600 to-emerald-600',
      measures: 'Your ability to build a working app with a live AI agent at its core — planned, built, secured, and deployed.',
      frameworks: 'CSTA K–12 Computer Science Standards, ISTE Computational Thinker',
      matters: 'This is what it looks like to ship a real AI product, not just use one.',
    },
    {
      name: 'AI for Business Certification',
      icon: <Briefcase className="h-8 w-8" />,
      color: 'from-slate-600 to-gray-700',
      measures: 'Your ability to apply AI strategically to a real business problem — from discovery through launch.',
      frameworks: 'UNESCO Transversal Competencies, ISTE Innovative Designer',
      matters: 'Turns AI skill into income — the difference between knowing AI and using it to earn.',
    },
  ];

  const communityImpact = [
    {
      name: 'AI Ambassadors',
      icon: <Users className="h-7 w-7" />,
      description: 'Practice teaching AI to real community personas — Mama Grace, Bro Emeka, and others — and get evaluated on how clearly and persuasively you explain it.',
      hasCert: true,
    },
    {
      name: 'Agriculture Consultant',
      icon: <Sprout className="h-7 w-7" />,
      description: 'Advise Oloibiri farmers on crop disease, pest damage, and affordable, locally-adapted solutions.',
      hasCert: true,
    },
    {
      name: 'Fishing Consultant',
      icon: <Fish className="h-7 w-7" />,
      description: 'Advise on catch problems, aquaculture, fish processing, and food safety for fishermen and traders.',
      hasCert: true,
    },
    {
      name: 'Healthcare Navigator',
      icon: <Heart className="h-7 w-7" />,
      description: "Run structured clinical assessments modeled on Nigeria's CHIPS Agents program — triage, danger signs, and referral writing.",
      hasCert: true,
    },
    {
      name: 'Entrepreneurship Consultant',
      icon: <Briefcase className="h-7 w-7" />,
      description: 'Advise young entrepreneurs in Oloibiri and Ibiade on registration, pricing, marketing, and savings.',
      hasCert: true,
    },
    {
      name: 'Animal Husbandry Advisor',
      icon: <PawPrint className="h-7 w-7" />,
      description: 'Triage livestock health issues by urgency, and guide isolation, vaccination checks, and vet escalation.',
      hasCert: false,
    },
  ];

  const voices = [
    {
      name: 'Solomon Matthias Solomon',
      role: 'Lead Community Health Navigator · Oloibiri, Nigeria',
      description: 'Writing about healthcare navigation, community trust-building, and what it means to bring AI into a place where formal health systems barely reach.',
      href: 'https://substack.com/@solomonmatthiassolomon',
    },
    {
      name: 'AI for Equity in Education',
      role: 'Kevin Hallinan & Bennywhite Davidson · UD / vAI',
      description: 'The story of a vacant room in rural Nigeria becoming a laboratory for human potential — written by an Emeritus Professor in Dayton and a community leader in Oloibiri, in equal voice.',
      href: 'https://kevinhallinan.substack.com',
    },
  ];

  return (
    <AppLayout>
      <div className="max-w-6xl mx-auto">
        {/* Hero Section */}
        <div className="bg-gradient-to-r from-purple-600 to-pink-600 rounded-2xl p-12 mb-8 text-white shadow-xl">
          <Globe className="h-16 w-16 mx-auto mb-4" />
          <h1 className="text-5xl font-bold mb-6 text-center">About This Platform</h1>
          <div className="max-w-4xl mx-auto text-lg space-y-4">
            <p className="text-purple-100">
              AI is changing everything — how we learn, work, and solve problems. But using AI isn't enough.
              To stand out, you need to prove what you can do with it.
            </p>
            <p className="text-purple-100">
              This platform takes you from foundational skills, through hands-on tech and AI training, to
              real certifications and real community impact — built to work wherever you are.
            </p>
          </div>
        </div>

        {/* Key Features */}
        <div className="grid md:grid-cols-2 gap-6 mb-8">
          <div className="bg-white rounded-xl p-6 shadow-lg">
            <div className="flex items-start gap-3">
              <CheckCircle className="h-6 w-6 text-green-500 flex-shrink-0 mt-1" />
              <div>
                <h3 className="font-bold text-lg text-gray-800 mb-2">Skill-based</h3>
                <p className="text-gray-600">Built to measure what you can actually do</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl p-6 shadow-lg">
            <div className="flex items-start gap-3">
              <CheckCircle className="h-6 w-6 text-green-500 flex-shrink-0 mt-1" />
              <div>
                <h3 className="font-bold text-lg text-gray-800 mb-2">Globally grounded</h3>
                <p className="text-gray-600">Aligned to standards from UNESCO, ISTE, CSTA, and other leading frameworks</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl p-6 shadow-lg">
            <div className="flex items-start gap-3">
              <CheckCircle className="h-6 w-6 text-green-500 flex-shrink-0 mt-1" />
              <div>
                <h3 className="font-bold text-lg text-gray-800 mb-2">Resume-ready</h3>
                <p className="text-gray-600">Designed to showcase real-world readiness for school, work, or entrepreneurship</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl p-6 shadow-lg">
            <div className="flex items-start gap-3">
              <CheckCircle className="h-6 w-6 text-green-500 flex-shrink-0 mt-1" />
              <div>
                <h3 className="font-bold text-lg text-gray-800 mb-2">Built for your context</h3>
                <p className="text-gray-600">Designed to work on mobile or laptop, with or without stable internet</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl p-6 shadow-lg md:col-span-2">
            <div className="flex items-start gap-3">
              <Volume2 className="h-6 w-6 text-green-500 flex-shrink-0 mt-1" />
              <div>
                <h3 className="font-bold text-lg text-gray-800 mb-2">Speaks your language</h3>
                <p className="text-gray-600">Any on-screen text can be translated into Nigerian Pidgin and read aloud — so you're never locked out by formal English.</p>
              </div>
            </div>
          </div>
        </div>

        {/* Foundations */}
        <div className="mb-8">
          <h2 className="text-4xl font-bold text-gray-800 mb-6 flex items-center gap-3">
            <BookOpen className="h-10 w-10 text-amber-500" />
            Foundations
          </h2>
          <div className="grid md:grid-cols-3 gap-6">
            {foundations.map((item) => (
              <div key={item.name} className="bg-white rounded-xl p-6 shadow-lg hover:shadow-xl transition-shadow">
                <div className={`inline-flex bg-gradient-to-r ${item.color} text-white rounded-lg p-3 mb-3`}>
                  {item.icon}
                </div>
                <h3 className="text-xl font-bold text-gray-800 mb-2">{item.name}</h3>
                <p className="text-gray-600">{item.description}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Certifications We Offer */}
        <div className="mb-8">
          <h2 className="text-4xl font-bold text-gray-800 mb-6 flex items-center gap-3">
            <Award className="h-10 w-10 text-purple-600" />
            Certifications We Offer
          </h2>

          <div className="space-y-6">
            {certifications.map((cert) => (
              <div
                key={cert.name}
                className="bg-white rounded-xl p-6 shadow-lg hover:shadow-xl transition-shadow"
              >
                <div className="flex items-start gap-4 mb-4">
                  <div className={`bg-gradient-to-r ${cert.color} text-white rounded-lg p-3`}>
                    {cert.icon}
                  </div>
                  <h3 className="text-2xl font-bold text-gray-800 mt-2">{cert.name}</h3>
                </div>

                <div className="space-y-3 ml-16">
                  <div>
                    <p className="text-sm font-semibold text-gray-500 mb-1">What it measures:</p>
                    <p className="text-gray-700">{cert.measures}</p>
                  </div>

                  <div>
                    <p className="text-sm font-semibold text-gray-500 mb-1">Frameworks:</p>
                    <p className="text-gray-700 italic">{cert.frameworks}</p>
                  </div>

                  <div>
                    <p className="text-sm font-semibold text-gray-500 mb-1">Why it matters:</p>
                    <p className="text-gray-700">{cert.matters}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Community Impact */}
        <div className="mb-8">
          <h2 className="text-4xl font-bold text-gray-800 mb-6 flex items-center gap-3">
            <Globe className="h-10 w-10 text-emerald-600" />
            Community Impact
          </h2>
          <div className="grid md:grid-cols-2 gap-6">
            {communityImpact.map((item) => (
              <div key={item.name} className="bg-white rounded-xl p-6 shadow-lg hover:shadow-xl transition-shadow">
                <div className="flex items-start gap-3">
                  <div className="inline-flex bg-gradient-to-r from-emerald-500 to-teal-500 text-white rounded-lg p-2.5 flex-shrink-0">
                    {item.icon}
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-gray-800 mb-1">{item.name}</h3>
                    <p className="text-gray-600">{item.description}</p>
                    {item.hasCert && (
                      <p className="text-xs font-semibold text-emerald-600 mt-2 uppercase tracking-wide">Certification available</p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Voices from the Community */}
        <div className="mb-8">
          <h2 className="text-4xl font-bold text-gray-800 mb-2 flex items-center gap-3">
            <MessageSquare className="h-10 w-10 text-teal-600" />
            Voices from the Community
          </h2>
          <p className="text-gray-600 mb-6 max-w-3xl">
            The people closest to this work are writing about it — from Oloibiri, Nigeria and Dayton, Ohio.
            These are first-person accounts from the people living the work, not reports written about them.
          </p>
          <div className="grid md:grid-cols-2 gap-6">
            {voices.map((voice) => (
              <a
                key={voice.name}
                href={voice.href}
                target="_blank"
                rel="noopener noreferrer"
                className="bg-white rounded-xl p-6 shadow-lg hover:shadow-xl transition-shadow block"
              >
                <h3 className="text-lg font-bold text-gray-800 mb-1">{voice.name}</h3>
                <p className="text-xs font-semibold text-teal-600 mb-3 uppercase tracking-wide">{voice.role}</p>
                <p className="text-gray-600 mb-4">{voice.description}</p>
                <div className="flex items-center gap-1.5 text-sm font-semibold text-teal-600">
                  <BookOpen className="h-4 w-4" /> Read on Substack <ExternalLink className="h-3.5 w-3.5" />
                </div>
              </a>
            ))}
          </div>
        </div>

        {/* Certification You Can Trust */}
        <div className="bg-gradient-to-r from-blue-600 to-purple-600 rounded-2xl p-8 text-white shadow-xl">
          <div className="flex items-center gap-3 mb-6">
            <Shield className="h-10 w-10" />
            <h2 className="text-3xl font-bold">Certification You Can Trust</h2>
          </div>

          <p className="text-lg text-blue-100 mb-6">
            Our certification program is built from the ground up to be:
          </p>

          <div className="grid md:grid-cols-2 gap-4">
            <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4">
              <h4 className="font-bold text-lg mb-2">Meaningful</h4>
              <p className="text-sm text-blue-100">Tied to real-world expectations</p>
            </div>

            <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4">
              <h4 className="font-bold text-lg mb-2">Portable</h4>
              <p className="text-sm text-blue-100">Ready for your CV, resume, LinkedIn, or scholarship application</p>
            </div>

            <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4">
              <h4 className="font-bold text-lg mb-2">Defensible</h4>
              <p className="text-sm text-blue-100">Scored based on performance and verified criteria</p>
            </div>

            <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4">
              <h4 className="font-bold text-lg mb-2">Inclusive</h4>
              <p className="text-sm text-blue-100">Usable on mobile or desktop, even with limited access</p>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
};

export default AboutPage;
