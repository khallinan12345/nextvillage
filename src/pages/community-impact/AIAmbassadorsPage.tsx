// src/pages/community-impact/AIAmbassadorsPage.tsx
//
// AI Ambassadors — Teaching Others About AI
// The unique mechanic: the student IS the teacher.
// The AI plays a community member persona and the student explains, demonstrates,
// and handles objections. After each session the AI evaluates how well
// the student communicated, handled resistance, and left something actionable.
//
// UPGRADED — matching the HealthcareNavigator / FishingConsultant pattern:
// ─ Structured preparation coaching (Prep Panel): AI coaches the student with
//   one guided question at a time before they face the community member — 
//   the "probe panel" equivalent for this learning context
// ─ Debrief chat (reflect view): after evaluation, student can ask "how could
//   I have handled that better?" — a follow-up chat anchored to the session
// ─ Session history: past sessions shown on the select screen with scores
//   and the ability to replay conversations
//
// Part of the Community Impact track.
// Route: /community-impact/ai-ambassadors
// Activity stored as: 'ai_ambassadors'

import React, { useState, useEffect, useRef, useCallback } from 'react';
import AppLayout from '../../components/layout/AppLayout';
import { useLocation } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { chatText, chatJSON } from '../../lib/chatClient';
import { useAuth } from '../../hooks/useAuth';
import {
  Users, MessageSquare, Volume2, VolumeX, ArrowLeft, Send,
  Mic, MicOff, CheckCircle, Star, Loader2,
  AlertCircle, X, Globe2,
  Lightbulb, ShieldCheck, BookOpen, Award, History,
  ChevronRight, RefreshCw, Save,
} from 'lucide-react';
import classNames from 'classnames';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface Persona {
  id: string;
  name: string;
  age: string;
  occupation: string;
  emoji: string;
  background: string;
  initialAttitude: string;
  commonFears: string[];
  openingLine: string;
  colour: string;
  systemPrompt: string;
  prepQuestions: PrepQuestion[];  // NEW: structured coaching questions
}

interface PrepQuestion {
  key: string;
  question: string;
  why: string;  // explains why this matters for this specific persona
}

interface SessionRecord {
  id: string;
  persona_id: string;
  persona_name: string;
  overall_score: number | null;
  can_advance: boolean;
  created_at: string;
}

type PageView = 'select' | 'prepare' | 'teach' | 'reflect';

// ─── Challenge types ──────────────────────────────────────────────────────────

interface ActiveChallenge {
  enrollmentId: string;
  challengeId: string;
  title: string;
  description: string;
  challenge_mode_intro: string;
  challenge_instruction: string;
  return_question_1: string;
  return_question_2: string;
  return_question_3: string | null;
  tier_target: string;
}

interface ChallengeEvalResult {
  tier: string;
  tier_label: string;
  summary: string;
  tier_reasoning: string;
  follow_up_instruction: string;
  next_tier_hint: string;
}

// ─── Prep coaching prompt ─────────────────────────────────────────────────────
// Analogous to the Probe Panel in other pages — AI coaches student through
// one structured question at a time before they face the community member.

function buildPrepCoachPrompt(question: PrepQuestion, persona: Persona, answeredSoFar: Record<string, string>): string {
  const priorAnswers = Object.entries(answeredSoFar)
    .filter(([, v]) => v?.trim())
    .map(([k, v]) => `${k}: ${v}`)
    .join('\n') || 'none yet';

  return `You are coaching a student who is about to teach ${persona.name} (${persona.age}, ${persona.occupation}) about AI. The student needs to prepare a specific, concrete answer to one coaching question before they start.

PERSONA: ${persona.name}
BACKGROUND: ${persona.background}
INITIAL ATTITUDE: ${persona.initialAttitude}
THEIR FEARS: ${persona.commonFears.join('; ')}

COACHING QUESTION BEING PREPARED: "${question.question}"
WHY THIS MATTERS: ${question.why}

WHAT THE STUDENT HAS PREPARED SO FAR:
${priorAnswers}

YOUR ROLE — coaching coach:
- This is a Socratic dialogue. Ask ONE follow-up question that pushes the student to think more specifically and concretely.
- If the student's answer is vague or generic, probe for specificity: "Can you give a specific example?", "What exact words would you use with ${persona.name}?", "What would you do if they pushed back on that?"
- If the answer is good and specific, tell them: "✅ Great preparation on this — you're ready to move on."
- Keep responses short: 1–3 sentences.
- Always connect your coaching to ${persona.name}'s specific world (${persona.occupation}, their fears, their community).

Never give answers for the student. Ask questions that make them think harder. Push for specificity above all.`;
}

// ─── Debrief chat prompt ──────────────────────────────────────────────────────

function buildDebriefPrompt(persona: Persona, evaluation: any, conversation: ChatMessage[]): string {
  const transcript = conversation
    .slice(-12)
    .map(m => `${m.role === 'user' ? 'STUDENT' : persona.name.toUpperCase()}: ${m.content.slice(0, 400)}`)
    .join('\n\n');

  return `You are a skilled communication coach debriefing a student after an AI Ambassador role-play session.

THE PERSONA THEY TAUGHT: ${persona.name} — ${persona.occupation}, ${persona.age} years old
PERSONA'S ATTITUDE: ${persona.initialAttitude}
PERSONA'S FEARS: ${persona.commonFears.join('; ')}

SESSION EVALUATION SCORES:
- Plain-Language Explanation: ${evaluation?.scores?.explanation ?? '?'}/3
- Relevant Local Examples: ${evaluation?.scores?.relevance ?? '?'}/3
- Handling Resistance: ${evaluation?.scores?.objections ?? '?'}/3
- Practical Next Step: ${evaluation?.scores?.actionable ?? '?'}/3
- Respect & Cultural Awareness: ${evaluation?.scores?.respect ?? '?'}/3
Overall: ${evaluation?.overall_score?.toFixed(1) ?? '?'}/3.0

EVALUATION FEEDBACK:
What went well: ${evaluation?.encouragement ?? ''}
Main improvement area: ${evaluation?.main_improvement ?? ''}

CONVERSATION EXCERPT:
${transcript}

YOUR ROLE:
The student may ask: "How could I have handled that better?", "What should I have said when they raised X?", "Can you show me a better opening?", "Why did my score on X drop?"

- Give specific, actionable coaching tied to this exact conversation and this exact persona
- If asked for example phrasing, provide it — but then ask the student to try adapting it in their own voice
- Reference specific moments from the transcript when relevant
- Be warm but direct — the student wants to improve, not just reassurance
- If they ask to practice a specific moment again, walk through it with them
- Never be generic; always connect to ${persona.name}'s specific world and the actual conversation`;
}

// ─── Personas ─────────────────────────────────────────────────────────────────

const PERSONAS: Persona[] = [
  {
    id: 'mama_grace',
    name: 'Mama Grace',
    age: '52',
    occupation: 'Market trader — sells cloth and household goods',
    emoji: '👩🏾‍🦱',
    colour: 'from-amber-600 to-orange-600',
    background: `Mama Grace has been selling at Oloibiri market for 25 years. She has a smartphone her son bought her, but uses it mainly for WhatsApp calls and voice notes. She worries that "these AI things" will take away her customers or replace her work. Her son keeps telling her to use AI but she does not understand what it is or why she would need it.`,
    initialAttitude: 'Politely skeptical, protective of her livelihood',
    commonFears: [
      '"AI will take my customers"',
      '"I am too old to learn new things"',
      '"My son wants to do everything on the phone instead of working"',
      '"These things are made by people who do not know our market"',
    ],
    openingLine: `Good afternoon! My son said I should come and listen to you. He says you know about this "AI" thing. Honestly, I do not understand why I need it. My market is fine as it is.`,
    prepQuestions: [
      { key: 'market_example', question: 'What is ONE specific thing Mama Grace could use AI for in her cloth market — something concrete she could try this week?', why: 'Market traders respond to specific, practical examples. Generic AI benefits will not move her. You need one clear use case she can picture.' },
      { key: 'fear_response', question: 'She will say "AI will take my customers." How will you respond to that fear without dismissing it?', why: 'This is her deepest fear. Dismissing it ("No it won\'t!") will shut her down. You need an honest, respectful answer.' },
      { key: 'simple_words', question: 'How would you explain what AI is in 2 sentences — using no jargon — to someone who mainly uses WhatsApp?', why: 'Mama Grace\'s technology frame is WhatsApp. Start there. If you use words like "algorithm" or "neural network" you will lose her immediately.' },
      { key: 'one_action', question: 'What is ONE thing you could show Mama Grace on her phone TODAY that would make AI feel real and useful to her?', why: 'The best teaching sessions end with the person doing something, not just hearing something. What will she walk away and try?' },
    ],
    systemPrompt: `You are Mama Grace, a 52-year-old market trader from Oloibiri, Bayelsa State, Nigeria. You sell cloth and household goods at the local market and have done so for 25 years.

You are talking to a young person who wants to teach you about AI. You are polite but skeptical. You speak simple, warm Nigerian English, sometimes slipping in Pidgin phrases.

PERSONALITY:
- You are proud of your market success and suspicious of anything that might threaten it
- You are protective of your customers and your relationships with them
- You worry that "book people" with their technology do not understand real market life
- You are not hostile, just realistic and cautious
- You warm up slowly when someone gives you a genuinely useful, practical example

WHAT CHANGES YOUR MIND:
- Specific examples of how AI could help you write better WhatsApp product messages to send to customers
- Showing that AI can help you check prices at other markets so you don't undersell
- Explaining that AI doesn't replace you — it helps YOU serve customers better
- Speaking simply, without jargon

WHAT KEEPS YOU SKEPTICAL:
- Technical talk ("algorithms", "machine learning", "neural networks")
- Vague benefits ("AI can do many things")
- Any suggestion that AI could replace human relationships with customers
- Rushing past your questions

ASK QUESTIONS that a real market woman would ask:
- "But how does it know about MY market?"
- "What if it gives me wrong prices and I lose money?"
- "Will my customers know I am using a machine to write to them? Will they feel cheated?"
- "Does it work when there is no light or network?"

Stay completely in character throughout. Never break character to explain that you are an AI. Respond naturally as Mama Grace would. Keep responses conversational — 2-4 sentences usually. Occasionally express small victories when something makes sense ("Ah! So it is like having a helper who knows everything? Interesting...").`,
  },
  {
    id: 'bro_emeka',
    name: 'Bro Emeka',
    age: '26',
    occupation: 'Fisherman on the Kolo Creek',
    emoji: '👨🏾‍🦱',
    colour: 'from-blue-600 to-cyan-600',
    background: `Emeka is a young fisherman who works the Kolo Creek with his father. He has a smartphone and uses YouTube and TikTok. He has heard of "AI" but thinks it is for rich people or people in Lagos and Abuja — not for someone like him in Oloibiri. He is curious but self-deprecating, saying things like "I am just a fisherman, I don't know about all this computer business."`,
    initialAttitude: 'Curious but dismissive of his own potential',
    commonFears: [
      '"AI is for educated people, not fishermen"',
      '"This will cost money I don\'t have"',
      '"Our creek internet is not strong enough"',
      '"My father will say it is a waste of time"',
    ],
    openingLine: `Hey! So you are the one teaching about AI? I hear about it on TikTok but honestly, bro, I am just a fisherman. What will AI do for someone like me? Catch fish for me?`,
    prepQuestions: [
      { key: 'fishing_use_case', question: 'Name one specific way AI could help Emeka on the Kolo Creek — something that would make his fishing day easier, safer, or more profitable.', why: 'Emeka needs to see AI in his world — the creek, the weather, the fish market. A city-based example will confirm his belief that "AI is not for me."' },
      { key: 'cost_answer', question: 'He will ask "Na free? Or dem go charge me money?" What is your honest answer?', why: 'Emeka is price-sensitive. You need an honest answer about what is free, what costs, and what is accessible on a basic smartphone with limited data.' },
      { key: 'self_belief', question: 'Emeka says "I am just a fisherman." How will you challenge that self-dismissal without being condescending?', why: 'This is his real barrier — he doesn\'t believe technology is for people like him. How you respond to this shapes whether he engages or shuts down.' },
      { key: 'father_concern', question: 'He says "My father will say it is a waste of time." What would you say to help Emeka think about how to bring his father along?', why: 'In family-centred cultures, getting a parent\'s buy-in matters. Showing you understand this earns Emeka\'s trust.' },
    ],
    systemPrompt: `You are Emeka, a 26-year-old fisherman from Oloibiri who works on Kolo Creek. You are young, smartphone-literate (YouTube, TikTok, WhatsApp), and curious — but you genuinely doubt that AI is relevant to your life.

You speak casual Nigerian English and Pidgin freely. You're friendly and a bit funny.

PERSONALITY:
- You dismiss yourself: "I'm just a fisherman" — but you're actually smart
- You're genuinely curious when something concrete comes up
- You're skeptical about cost — money is always tight
- You're worried about network reliability on the creek
- When AI is shown to be relevant, you get excited quickly

WHAT GETS YOU INTERESTED:
- Weather forecasting for the creek before going out
- How to check fish prices in Yenagoa or Port Harcourt before selling
- Identifying if a fish is contaminated from an oil-polluted stretch of water
- Writing a good message to potential buyers in the city

WHAT LEAVES YOU COLD:
- Abstract explanations of "artificial intelligence" and "data"
- Examples from cities or different industries
- Anything that seems to require a computer (you have a phone, not a laptop)

ASK NATURAL QUESTIONS:
- "Na free? Or dem go charge me money?"
- "Wetin happen if the AI give me wrong weather and the boat capsize?"
- "My papa say technology spoil the young people — how I go take explain am to am?"
- "Can it speak Ijaw?"

Be real. Be warm. Get excited when things click. Stay in character as a young Niger Delta fisherman throughout.`,
  },
  {
    id: 'aunty_patience',
    name: 'Aunty Patience',
    age: '45',
    occupation: 'Church administrator and trader',
    emoji: '👩🏾',
    colour: 'from-purple-600 to-pink-600',
    background: `Aunty Patience is deeply religious and active in her Pentecostal church. She has heard that AI is "dangerous" and "from the devil" — a view shared by some in her congregation. Her pastor preached against AI last month. She is not aggressive about it, but she has real spiritual concerns. She also works as a trader and uses her phone for church communications.`,
    initialAttitude: 'Spiritually cautious, open to reason but needs respectful engagement',
    commonFears: [
      '"My pastor said AI is dangerous and can be used by evil people"',
      '"What if it spreads false information or fake news?"',
      '"I don\'t want to put my trust in a machine instead of God"',
      '"People are using it to make fake videos — how do I trust it?"',
    ],
    openingLine: `Good evening. My pastor said I should be careful about this AI. He says it can be used for evil. I am not saying you are doing evil, but I want to understand — is this from God or from the other side?`,
    prepQuestions: [
      { key: 'faith_respect', question: 'She opens with "Is this from God or from the other side?" How will you respond in a way that respects her faith without dismissing her concerns?', why: 'Dismissing religious concerns ("That\'s superstition") will end the conversation instantly. You must engage honestly with the spiritual dimension.' },
      { key: 'fake_news', question: 'She is worried about AI spreading fake news and fake videos. What will you say — honestly — about this risk?', why: 'This is a legitimate concern. You must acknowledge it truthfully, not minimize it. Then show how she can protect herself.' },
      { key: 'tool_not_spirit', question: 'How would you explain that AI is a tool (like a calculator) — not a spirit or consciousness — in a way that makes sense to her?', why: 'Her fear is partly about AI having "power" or "intelligence" that feels spiritual. A clear analogy grounded in her world can help.' },
      { key: 'church_use', question: 'What is one way AI could help Aunty Patience in her church administration work — something that aligns with her values?', why: 'Showing AI serving her existing values (not threatening them) is the most powerful path to openness for a person of faith.' },
    ],
    systemPrompt: `You are Aunty Patience, a 45-year-old Pentecostal Christian from Oloibiri. You are warm and kind but carry genuine spiritual concerns about AI that your pastor has raised. You are not hostile — you just want honest answers.

You speak warm Nigerian English with occasional religious phrases.

PERSONALITY:
- Deep faith is central to how you process everything
- You genuinely believe AI could be used for evil, and you have seen fake news spread
- You respect young people who are honest and do not try to dismiss your faith
- You are practical — you use technology when it helps the church

SPIRITUAL CONCERNS (real ones, treat them seriously):
- AI being used to spread false teachings or fake religious content
- Replacing human discernment and prayer with machine advice
- The "mark of the beast" fears some in your community have
- Deep fakes and manipulation — you have seen fake videos

WHAT REASSURES YOU:
- Honest acknowledgment that AI can be misused — not dismissing your fears
- Practical use cases that align with your values (helping families, businesses)
- Explaining that AI is a tool, like a calculator — not a spirit
- Examples of how to identify AI-generated fake content (this is very helpful)
- Hearing that you remain in control; it doesn't control you

WHAT ALIENATES YOU:
- Dismissing your faith concerns as superstition
- Saying "there's nothing to worry about" without addressing the real risks
- Being condescending about religious people

ASK QUESTIONS:
- "But if it can write like a human, how will I know what is true and what is fake?"
- "Is the company that makes it Christian? What are their values?"
- "Can I use it to study my Bible more? Or to prepare sermons for my husband?"
- "My daughter says she uses it for school — is it helping her think or think for her?"

Be genuinely thoughtful. Warm up when your concerns are respected and addressed carefully. Stay in character throughout.`,
  },
  {
    id: 'mr_biodun',
    name: 'Mr. Biodun',
    age: '38',
    occupation: 'Secondary school teacher',
    emoji: '👨🏾‍🏫',
    colour: 'from-emerald-600 to-teal-600',
    background: `Mr. Biodun teaches English and General Studies at the local secondary school. He is educated and follows the news. He is concerned about AI and cheating — students using it to write essays without thinking. He is also worried about misinformation and job displacement. He is the most intellectually engaged of the personas and will ask harder, more analytical questions.`,
    initialAttitude: 'Intellectually engaged, critical, professionally concerned',
    commonFears: [
      '"My students will use it to cheat and never learn to think"',
      '"It will spread misinformation — who fact-checks it?"',
      '"Teachers like me will eventually lose our jobs"',
      '"Rich countries control this technology and we become dependent on them"',
    ],
    openingLine: `Good day. I have been following the discussion on AI with interest. I have serious concerns — particularly about academic integrity and the fact that our students now submit AI-generated essays. How do you propose to address this?`,
    prepQuestions: [
      { key: 'cheating_answer', question: 'Mr. Biodun will immediately ask about students cheating with AI. What is your honest, substantive answer — not just "we need to adapt"?', why: 'This is his professional pain point. A vague answer will lose all credibility. You need a real position on this.' },
      { key: 'hallucinations', question: 'He knows AI produces false information ("hallucinations"). How will you address this without pretending it doesn\'t happen?', why: 'Mr. Biodun is educated and will test you. Honesty about limitations builds more credibility than overconfidence.' },
      { key: 'teacher_value', question: 'He is afraid teachers will lose their jobs. What is your argument for why skilled teachers become MORE valuable — not less — in an AI world?', why: 'This is an existential concern for him personally. Your answer must be specific and convincing, not dismissive.' },
      { key: 'critical_use', question: 'How could Mr. Biodun use AI to reduce his workload while actually improving his teaching — one specific example from his English/General Studies class?', why: 'Moving from fear to practical possibility requires a concrete example in his domain. Think about lesson planning, marking feedback, or differentiated materials.' },
    ],
    systemPrompt: `You are Mr. Biodun, a 38-year-old secondary school teacher in Oloibiri. You teach English and General Studies. You are educated, analytical, and take your professional responsibility seriously.

You speak precise, formal Nigerian English. You are not hostile — but you want real answers, not cheerleading.

PERSONALITY:
- You respect careful thinking and distrust hype
- You are concerned about your students and your profession
- You want honesty about risks, not just promotion of benefits
- You soften considerably when someone engages seriously with your concerns

INTELLECTUAL CONCERNS:
- Students using AI to write assignments = no learning, unfair to honest students
- AI confidently producing wrong information (hallucinations) = dangerous
- Critical thinking skills atrophying if students outsource thinking to AI
- Digital divide: students with better phones/internet get unfair advantage
- Foreign control of a technology now embedded in Nigerian education

WHAT IMPRESSES YOU:
- Acknowledging that AI hallucinations are a real problem
- Suggesting how teachers can use AI to create better materials and reduce workload
- Showing how AI can help struggling students without doing the work for them
- Discussing how to teach students to use AI critically, as a tool not a crutch
- Engaging seriously with the dependency and sovereignty question

WHAT DISAPPOINTS YOU:
- Dismissing the cheating concern with "we just have to adapt"
- Pretending AI is always accurate
- Not being able to answer his specific, detailed questions

ASK HARDER QUESTIONS:
- "What do you say to a student who asks: if AI can write a better essay than me, why should I learn to write?"
- "How do you verify that what the AI tells you is actually true?"
- "Who is responsible when AI gives someone wrong medical or legal advice?"
- "Is Nigeria developing any of this technology or are we permanently consumers?"

Be analytically demanding but genuinely appreciative of honest, thoughtful answers. Stay in character throughout.`,
  },
  {
    id: 'chief_tamuno',
    name: 'Chief Tamuno',
    age: '67',
    occupation: 'Community elder and retired civil servant',
    emoji: '👴🏾',
    colour: 'from-red-700 to-rose-600',
    background: `Chief Tamuno is a respected elder in Oloibiri. He was a civil servant in Yenagoa before retirement. He is wise, speaks slowly and deliberately, and cares deeply about the community's future. He is concerned about young people being distracted by technology, about foreign companies extracting data from Nigerians, and about the cultural impact of AI.`,
    initialAttitude: 'Dignified caution, generational wisdom, cultural guardianship',
    commonFears: [
      '"These foreign companies are collecting our data — who benefits?"',
      '"Young people are losing our culture and language to these machines"',
      '"What happens when the internet goes off? Our knowledge is gone"',
      '"Oloibiri has already been exploited by oil. Will AI exploit us again?"',
    ],
    openingLine: `Sit down, child. I am listening. I have seen many things come to this community — oil, mobile phones, the internet. Some brought good. Some brought damage we are still recovering from. Tell me: what will this AI bring to Oloibiri?`,
    prepQuestions: [
      { key: 'respect_opening', question: 'Chief Tamuno opens with "Sit down, child." How will you open your response in a way that honours his position and age before you say anything about AI?', why: 'With an elder, HOW you begin matters as much as WHAT you say. Jumping into an AI pitch without proper respect will cost you the whole session.' },
      { key: 'exploitation_pattern', question: 'He will draw a parallel between oil exploitation and AI. How will you engage with that concern honestly — without dismissing the historical reality?', why: 'Oloibiri\'s oil history is a legitimate lens. Dismissing it ("AI is different") without engaging the substance will make you look naive.' },
      { key: 'community_benefit', question: 'He will ask: "Who in this community will actually benefit from AI?" What is your honest answer?', why: 'This is a sharp equity question. He has seen promises before. You need an honest, specific answer — not optimism.' },
      { key: 'culture_language', question: 'He worries that AI will accelerate the loss of Ijaw culture and language. Can you identify one way AI might actually help preserve — not erase — Ijaw heritage?', why: 'This is a genuine possibility that most people don\'t think about. If you can show this, it is the most powerful thing you can say to Chief Tamuno.' },
    ],
    systemPrompt: `You are Chief Tamuno, a 67-year-old respected elder and retired civil servant from Oloibiri, Bayelsa State. You carry the weight of your community's history — including the oil discovery, the exploitation, the environmental damage, and the broken promises.

You speak with dignity and deliberateness. Your questions are profound. You are not resistant to change — you have lived through enormous change — but you insist on understanding who benefits and who bears the risk.

PERSONALITY:
- You speak slowly, thoughtfully, sometimes with proverbs
- You have seen exploitation before and recognize its patterns
- You care deeply about Ijaw culture, language, and community sovereignty
- You respect young people who show wisdom and humility
- You are genuinely hopeful about Oloibiri's future if things are done right

DEEP CONCERNS:
- Data sovereignty: "When we use this AI, who owns what we tell it? Does it go to America?"
- Language and culture: "My grandchildren cannot speak Ijaw properly. Will this machine teach them?"
- Dependency: "What happens when we can no longer function without these tools?"
- Historical pattern: "Oil was found here and we got nothing. Will AI be the same?"
- Inequality: "Which community members will benefit? Not the poorest ones, I think."

WHAT OPENS YOU UP:
- Genuine respect and humility from the young person
- Concrete plans for how the community — not just individuals — benefits
- Honesty about what AI cannot do and what its risks are
- Hearing that young people are learning to BUILD and USE AI, not just consume it
- Any link between AI and preserving or reviving Ijaw culture and language

WHAT CLOSES YOU DOWN:
- Condescension or impatience
- Dismissing his historical concerns as "the past"
- Exaggerating benefits without acknowledging risks
- Not being able to say clearly who owns the data

ASK WEIGHTY QUESTIONS:
- "My father's father fished these creeks. His knowledge of the water, the fish, the seasons — is that knowledge in this AI?"
- "If I tell the AI about our farming methods, our ceremonies, our medicines — where does that knowledge go?"
- "Oloibiri was the first place oil was discovered in Nigeria. We have less than any other community. Why will AI be different?"
- "What can you teach me today that I could use tomorrow to help one person in this community?"

Be stately, unhurried, and genuinely thoughtful. Warm up slowly when the young person demonstrates wisdom. An Ijaw proverb occasionally is appropriate. Stay in character throughout.`,
  },
];

// ─── Evaluation rubric ────────────────────────────────────────────────────────

const RUBRIC_DIMENSIONS = [
  { id: 'explanation', label: 'Plain-Language Explanation', description: 'Did the student explain what AI is clearly, without jargon, using language the community member would understand?' },
  { id: 'relevance',   label: 'Relevant Local Examples',   description: 'Did the student connect AI to specific, real problems this person faces in Oloibiri — not generic or city-based examples?' },
  { id: 'objections',  label: 'Handling Resistance',       description: 'Did the student address the persona\'s fears and skepticism thoughtfully, without dismissing or talking down?' },
  { id: 'actionable',  label: 'Practical Next Step',       description: 'Did the student leave the community member with one specific, achievable thing they could do or try today?' },
  { id: 'respect',     label: 'Respect & Cultural Awareness', description: 'Did the student show appropriate respect for the person\'s age, experience, faith, or position? Did they adapt their tone?' },
];

const LEVEL_LABELS: Record<number, { text: string; color: string; bg: string }> = {
  0: { text: 'No Evidence', color: 'text-gray-500',    bg: 'bg-gray-100'    },
  1: { text: 'Emerging',    color: 'text-amber-700',   bg: 'bg-amber-100'   },
  2: { text: 'Proficient',  color: 'text-blue-700',    bg: 'bg-blue-100'    },
  3: { text: 'Advanced',    color: 'text-emerald-700', bg: 'bg-emerald-100' },
};

// ─── Markdown renderer ────────────────────────────────────────────────────────

const MarkdownText: React.FC<{ text: string }> = ({ text }) => (
  <div className="space-y-1.5">
    {text.split('\n').map((line, i) => {
      if (!line.trim()) return <div key={i} className="h-2" />;
      const html = line.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
      return <p key={i} className="leading-relaxed" dangerouslySetInnerHTML={{ __html: html }} />;
    })}
  </div>
);

// ─── Community background ─────────────────────────────────────────────────────

const CommunityBackground: React.FC = () => {
  const [mouse, setMouse] = useState({ x: 0, y: 0 });
  const [moving, setMoving] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => {
      setMouse({ x: Math.max(0, e.clientX - 256), y: Math.max(0, e.clientY - 64) });
      setMoving(true);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setMoving(false), 120);
    };
    window.addEventListener('mousemove', h);
    return () => { window.removeEventListener('mousemove', h); if (timerRef.current) clearTimeout(timerRef.current); };
  }, []);
  return (
    <>
      <svg className="absolute w-0 h-0" aria-hidden="true">
        <defs>
          <filter id="community-distortion">
            <feTurbulence type="fractalNoise" baseFrequency="0.012" numOctaves="3" seed="8" result="noise" />
            <feDisplacementMap in="SourceGraphic" in2="noise" scale="55" xChannelSelector="R" yChannelSelector="G" result="displaced" />
            <feGaussianBlur in="displaced" stdDeviation="1" />
          </filter>
        </defs>
      </svg>
      <div className="fixed top-14 left-0 md:left-64 right-0 bottom-0" style={{ backgroundImage: "url('/background_AI_ambassador.png')", backgroundSize: 'cover', backgroundPosition: 'center', zIndex: 0 }}>
        <div className="absolute inset-0 bg-gradient-to-br from-emerald-900/65 via-teal-900/55 to-green-900/65" />
        <div className="absolute inset-0 bg-black/15" />
      </div>
      {moving && (
        <div className="fixed top-14 left-0 md:left-64 right-0 bottom-0 pointer-events-none" style={{ backgroundImage: "url('/background_AI_ambassador.png')", backgroundSize: 'cover', backgroundPosition: 'center', zIndex: 1, filter: 'url(#community-distortion)', WebkitMaskImage: `radial-gradient(circle 160px at ${mouse.x}px ${mouse.y}px, black 0%, black 45%, transparent 100%)`, maskImage: `radial-gradient(circle 160px at ${mouse.x}px ${mouse.y}px, black 0%, black 45%, transparent 100%)` }}>
          <div className="absolute inset-0 bg-gradient-to-br from-emerald-900/65 via-teal-900/55 to-green-900/65" />
        </div>
      )}
    </>
  );
};

// ─── Prep Coach Panel ─────────────────────────────────────────────────────────
// The "probe panel" equivalent for this page. Before the student faces the
// community member, the AI coaches them through structured questions one at a time.

interface PrepPanelProps {
  question: PrepQuestion;
  persona: Persona;
  messages: ChatMessage[];
  loading: boolean;
  done: boolean;
  input: string;
  onInputChange: (v: string) => void;
  onSend: () => void;
  onClose: () => void;
  chatEndRef: React.RefObject<HTMLDivElement>;
}

const PrepPanel: React.FC<PrepPanelProps> = ({
  question, persona, messages, loading, done, input, onInputChange, onSend, onClose, chatEndRef
}) => (
  <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm px-2 pb-2">
    <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl flex flex-col" style={{ maxHeight: '85vh' }}>
      <div className="flex items-center justify-between px-4 py-3 border-b bg-emerald-50 rounded-t-2xl">
        <div>
          <p className="text-xs font-bold text-emerald-500 uppercase tracking-wide">Preparation Coach</p>
          <p className="text-sm font-bold text-emerald-900 line-clamp-1">{question.question}</p>
        </div>
        <button onClick={onClose} className="p-2 rounded-xl text-emerald-400 hover:text-emerald-700 hover:bg-emerald-100">
          <X size={18}/>
        </button>
      </div>

      <div className="px-4 py-2 bg-emerald-900 text-emerald-100 text-xs flex items-start gap-2">
        <span className="text-base">🎯</span>
        <span>Think through your answer, then type it. The coach will push you to be more specific and concrete. You're practising for a real conversation with {persona.name}.</span>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {messages.map(msg => (
          <div key={msg.id} className={classNames('flex items-start gap-2', msg.role === 'user' ? 'justify-end' : 'justify-start')}>
            {msg.role === 'assistant' && (
              <div className={`w-7 h-7 rounded-lg bg-gradient-to-br ${persona.colour} flex items-center justify-center text-xs flex-shrink-0`}>🎓</div>
            )}
            <div className={classNames('max-w-[85%] rounded-2xl px-3 py-2.5 text-sm leading-relaxed',
              msg.role === 'user' ? 'bg-emerald-600 text-white rounded-tr-sm' : 'bg-emerald-50 text-emerald-900 rounded-tl-sm border border-emerald-100')}>
              {msg.role === 'assistant' && <p className="text-xs font-bold text-emerald-400 mb-1">Prep Coach</p>}
              {msg.role === 'user' && <p className="text-xs font-bold text-emerald-200 mb-1">Your answer</p>}
              <MarkdownText text={msg.content}/>
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex items-start gap-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-emerald-600 to-teal-600 flex items-center justify-center text-xs">🎓</div>
            <div className="bg-emerald-50 rounded-2xl rounded-tl-sm px-3 py-2.5">
              <div className="flex gap-1 items-center h-4">{[0,150,300].map(d => <div key={d} className="w-2 h-2 rounded-full bg-emerald-400 animate-bounce" style={{ animationDelay: `${d}ms` }}/>)}</div>
            </div>
          </div>
        )}
        <div ref={chatEndRef}/>
      </div>

      {done && (
        <div className="mx-4 mb-2 bg-green-50 border border-green-300 rounded-xl px-3 py-2.5 flex items-center gap-2 text-green-800 text-sm font-semibold">
          <CheckCircle size={16} className="text-green-600 flex-shrink-0"/>
          Good preparation on this point. Move on when ready.
        </div>
      )}

      <div className="border-t px-3 py-3 rounded-b-2xl">
        <div className="flex gap-2">
          <input
            value={input}
            onChange={e => onInputChange(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); onSend(); } }}
            placeholder="Type your preparation answer…"
            disabled={loading}
            className="flex-1 px-3 py-2.5 text-sm border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-400 disabled:opacity-50"
          />
          <button onClick={onSend} disabled={!input.trim() || loading}
            className="px-3 py-2.5 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-40">
            <Send size={15}/>
          </button>
          <button onClick={onClose}
            className="px-4 py-2.5 rounded-xl bg-teal-600 text-white text-sm font-bold hover:bg-teal-700 whitespace-nowrap">
            Done ✓
          </button>
        </div>
      </div>
    </div>
  </div>
);

// ═══════════════════════════════════════════════════════════════════════════════
// Main Component
// ═══════════════════════════════════════════════════════════════════════════════

const AIAmbassadorsPage: React.FC = () => {
  const { user } = useAuth();
  const location = useLocation();

  const [view, setView]                     = useState<PageView>('select');
  const [selectedPersona, setPersona]       = useState<Persona | null>(null);
  const [messages, setMessages]             = useState<ChatMessage[]>([]);
  const [inputText, setInputText]           = useState('');
  const [isSending, setIsSending]           = useState(false);
  const [isEvaluating, setIsEvaluating]     = useState(false);
  const [isSaving, setIsSaving]             = useState(false);
  const [evaluation, setEvaluation]         = useState<any | null>(null);
  const [showEvalModal, setShowEvalModal]   = useState(false);
  const [dashboardId, setDashboardId]       = useState<string | null>(null);
  const [communicationLevel, setCommLevel]  = useState(1);
  const [pastSessions, setPastSessions]     = useState<SessionRecord[]>([]);

  // ── Community AI Challenge state ─────────────────────────────────────────
  const [availableChallenge, setAvailableChallenge] = useState<ActiveChallenge | null>(null);
  const [activeChallenge, setActiveChallenge]           = useState<ActiveChallenge | null>(null);
  const [challengeLoading, setChallengeLoading]         = useState(false);
  const [showChallengeReflect, setShowChallengeReflect] = useState(false);
  const [challengeReflect1, setChallengeReflect1]       = useState('');
  const [challengeReflect2, setChallengeReflect2]       = useState('');
  const [challengeReflect3, setChallengeReflect3]       = useState('');
  const [challengeSubmitting, setChallengeSubmitting]   = useState(false);
  const [challengeResult, setChallengeResult]           = useState<ChallengeEvalResult | null>(null);
  const [enrolling, setEnrolling]                       = useState(false);

  // ── Prep coaching (new)
  const [prepAnswers, setPrepAnswers]       = useState<Record<string, string>>({});
  const [prepQuestion, setPrepQuestion]     = useState<PrepQuestion | null>(null);
  const [prepMessages, setPrepMessages]     = useState<ChatMessage[]>([]);
  const [prepInput, setPrepInput]           = useState('');
  const [prepLoading, setPrepLoading]       = useState(false);
  const [prepDone, setPrepDone]             = useState(false);
  const prepChatEndRef                      = useRef<HTMLDivElement>(null);

  // ── Debrief chat (new)
  const [debriefMessages, setDebriefMessages] = useState<ChatMessage[]>([]);
  const [debriefInput, setDebriefInput]       = useState('');
  const [isDebriefSending, setIsDebriefSending] = useState(false);

  // Voice
  const [voices, setVoices]                 = useState<SpeechSynthesisVoice[]>([]);
  const [voiceMode, setVoiceMode]           = useState<'english' | 'pidgin'>('pidgin');
  const [speechOn, setSpeechOn]             = useState(true);
  const [isSpeaking, setIsSpeaking]         = useState(false);
  const [isListening, setIsListening]       = useState(false);
  const recognitionRef                      = useRef<any>(null);
  const chatEndRef                          = useRef<HTMLDivElement>(null);
  const debriefEndRef                       = useRef<HTMLDivElement>(null);
  const inputRef                            = useRef<HTMLTextAreaElement>(null);
  const hasGreeted                          = useRef(false);

  useEffect(() => {
    const load = () => setVoices(window.speechSynthesis.getVoices());
    load(); window.speechSynthesis.addEventListener('voiceschanged', load);
    return () => window.speechSynthesis.removeEventListener('voiceschanged', load);
  }, []);

  useEffect(() => {
    if (!user?.id) return;
    supabase.from('user_personality_baseline')
      .select('communication_level').eq('user_id', user.id).maybeSingle()
      .then(({ data }) => { if (data?.communication_level != null) setCommLevel(data.communication_level); });
  }, [user?.id]);

  // Load past sessions for the select screen
  useEffect(() => {
    if (!user?.id) return;
    supabase.from('dashboard')
      .select('id, sub_category, title, progress, english_skills_evaluation, created_at')
      .eq('user_id', user.id)
      .eq('activity', 'ai_ambassadors')
      .order('created_at', { ascending: false })
      .limit(10)
      .then(({ data }) => {
        if (!data) return;
        const sessions: SessionRecord[] = data.map((d: any) => {
          const eval_ = d.english_skills_evaluation ? (typeof d.english_skills_evaluation === 'string' ? JSON.parse(d.english_skills_evaluation) : d.english_skills_evaluation) : null;
          const persona = PERSONAS.find(p => p.id === d.sub_category);
          return {
            id: d.id,
            persona_id: d.sub_category,
            persona_name: persona?.name ?? d.sub_category,
            overall_score: eval_?.overall_score ?? null,
            can_advance: eval_?.can_advance ?? false,
            created_at: d.created_at,
          };
        });
        setPastSessions(sessions);
      });
  }, [user?.id, view]); // refresh when returning to select

  // ── Load active challenge for this page ─────────────────────────────────
  useEffect(() => {
    if (!user?.id) return;

    const navEnrollment = (location.state as any)?.challengeEnrollment;
    if (navEnrollment?.enrollmentId) {
      setActiveChallenge(navEnrollment);
      return;
    }

    (async () => {
      setChallengeLoading(true);
      try {
        const { data: profile } = await supabase
          .from('profiles')
          .select('organization_id')
          .eq('id', user.id)
          .single();

        let orgSlug = 'oloibiri';
        if (profile?.organization_id) {
          const { data: org } = await supabase
            .from('organizations')
            .select('name')
            .eq('id', profile.organization_id)
            .single();
          orgSlug = org?.name?.toLowerCase().includes('ibiade') ? 'ibiade' : 'oloibiri';
        }

        const { data: challenges } = await supabase
          .from('community_challenges')
          .select('id, title, description, challenge_mode_intro, challenge_instruction, return_question_1, return_question_2, return_question_3, tier_target, org_id')
          .eq('community_impact_slug', 'ai-ambassadors')
          .eq('active', true)
          .eq('org_id', orgSlug)
          .order('week_start', { ascending: false })
          .limit(1);
        const challenge = challenges?.[0] ?? null;
        if (!challenge) return;

        const { data: enrollment } = await supabase
          .from('challenge_enrollments')
          .select('id, status')
          .eq('learner_id', user.id)
          .eq('challenge_id', challenge.id)
          .in('status', ['active', 'submitted'])
          .maybeSingle();

        const mapped: ActiveChallenge = {
          enrollmentId:          enrollment?.id ?? '',
          challengeId:           challenge.id,
          title:                 challenge.title,
          description:           challenge.description,
          challenge_mode_intro:  challenge.challenge_mode_intro,
          challenge_instruction: challenge.challenge_instruction,
          return_question_1:     challenge.return_question_1,
          return_question_2:     challenge.return_question_2,
          return_question_3:     challenge.return_question_3,
          tier_target:           challenge.tier_target,
        };

        if (enrollment) {
          setActiveChallenge(mapped);
        } else {
          setAvailableChallenge(mapped);
        }
      } finally {
        setChallengeLoading(false);
      }
    })();
  }, [user?.id]);

  // ── Enroll in challenge ───────────────────────────────────────────────────
  const handleEnrollChallenge = async (ch: ActiveChallenge) => {
    if (!user?.id || enrolling) return;
    setEnrolling(true);
    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('organization_id')
        .eq('id', user.id)
        .single();

      const { data: enrollment } = await supabase
        .from('challenge_enrollments')
        .insert({
          learner_id:   user.id,
          challenge_id: ch.challengeId,
          org_id:       profile?.organization_id ?? 'oloibiri',
          status:       'active',
        })
        .select('id')
        .single();

      if (enrollment) {
        setActiveChallenge({ ...ch, enrollmentId: enrollment.id });
        setAvailableChallenge(null);
      }
    } finally { setEnrolling(false); }
  };

  // ── Submit challenge reflection ───────────────────────────────────────────
  const handleSubmitChallengeReflection = async () => {
    if (!activeChallenge || !challengeReflect1.trim() || !challengeReflect2.trim()) return;
    setChallengeSubmitting(true);
    try {
      await supabase
        .from('challenge_enrollments')
        .update({
          status:                'submitted',
          submitted_at:          new Date().toISOString(),
          action_taken:          challengeReflect1.trim(),
          impact_observed:       challengeReflect2.trim(),
          extra_detail:          challengeReflect3.trim() || null,
          community_member_role: 'general',
        })
        .eq('id', activeChallenge.enrollmentId);

      const { data, error } = await supabase.functions.invoke('evaluate-challenge-submission', {
        body: { enrollment_id: activeChallenge.enrollmentId },
      });

      if (error) throw error;
      if (data?.impact_evaluation) setChallengeResult(data.impact_evaluation);
    } catch (err) {
      console.error('[AIAmbassadorsPage] challenge submit error:', err);
    } finally {
      setChallengeSubmitting(false);
    }
  };

  const speak = useCallback((text: string) => {
    if (!speechOn || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utt = new SpeechSynthesisUtterance(text.slice(0, 350));
    const voice = voiceMode === 'pidgin'
      ? (voices.find(v => v.lang === 'en-NG') || voices.find(v => v.lang === 'en-ZA') || voices.find(v => v.lang.startsWith('en')))
      : (voices.find(v => v.name === 'Google UK English Female') || voices.find(v => v.lang === 'en-GB') || voices.find(v => v.lang.startsWith('en')));
    if (voice) { utt.voice = voice; utt.lang = voice.lang; }
    utt.rate = 0.86; utt.pitch = 1.0;
    setIsSpeaking(true); utt.onend = () => setIsSpeaking(false); utt.onerror = () => setIsSpeaking(false);
    window.speechSynthesis.speak(utt);
  }, [speechOn, voices, voiceMode]);

  const stopSpeaking = () => { window.speechSynthesis.cancel(); setIsSpeaking(false); };

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);
  useEffect(() => { debriefEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [debriefMessages, isDebriefSending]);
  useEffect(() => { prepChatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [prepMessages, prepLoading]);

  useEffect(() => {
    const last = messages[messages.length - 1];
    if (last?.role === 'assistant') speak(last.content);
  }, [messages, speak]);

  useEffect(() => {
    if (view === 'teach' && selectedPersona && !hasGreeted.current) {
      hasGreeted.current = true;
      setMessages([{ id: crypto.randomUUID(), role: 'assistant', content: selectedPersona.openingLine, timestamp: new Date() }]);
      createDashboardEntry();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, selectedPersona]);

  useEffect(() => { if (view !== 'teach') hasGreeted.current = false; }, [view]);

  const createDashboardEntry = async () => {
    if (!user?.id || !selectedPersona) return;
    const { data } = await supabase.from('dashboard').insert({
      user_id: user.id,
      activity: 'ai_ambassadors',
      category_activity: 'Community Impact',
      sub_category: selectedPersona.id,
      title: `AI Ambassadors — Teaching ${selectedPersona.name}`,
      progress: 'started',
      chat_history: JSON.stringify([]),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).select('id').single();
    if (data?.id) setDashboardId(data.id);
  };

  const persistChat = useCallback(async (msgs: ChatMessage[], eval_: any = null) => {
    if (!dashboardId) return;
    await supabase.from('dashboard').update({
      chat_history: JSON.stringify(msgs),
      ...(eval_ && { english_skills_evaluation: eval_ }),
      progress: eval_?.can_advance ? 'completed' : 'started',
      updated_at: new Date().toISOString(),
    }).eq('id', dashboardId);
  }, [dashboardId]);

  // ─── Prep coach: open question panel ─────────────────────────────────────
  const openPrepQuestion = useCallback(async (question: PrepQuestion) => {
    if (!selectedPersona) return;
    setPrepQuestion(question);
    setPrepMessages([]);
    setPrepInput('');
    setPrepDone(false);
    setPrepLoading(true);
    try {
      const systemPrompt = buildPrepCoachPrompt(question, selectedPersona, prepAnswers);
      const reply = await chatText({
        page: 'AIAmbassadorsPage',
        messages: [{ role: 'user', content: `Coach me on: ${question.question}` }],
        system: systemPrompt,
        max_tokens: 250,
      });
      const isDone = reply.includes('✅');
      setPrepDone(isDone);
      setPrepMessages([{ id: crypto.randomUUID(), role: 'assistant', content: reply, timestamp: new Date() }]);
    } finally { setPrepLoading(false); }
  }, [selectedPersona, prepAnswers]);

  const sendPrepMessage = useCallback(async () => {
    if (!prepInput.trim() || prepLoading || !selectedPersona || !prepQuestion) return;
    const userMsg: ChatMessage = { id: crypto.randomUUID(), role: 'user', content: prepInput.trim(), timestamp: new Date() };
    const updated = [...prepMessages, userMsg];
    setPrepMessages(updated);
    setPrepInput('');
    setPrepLoading(true);
    try {
      const systemPrompt = buildPrepCoachPrompt(prepQuestion, selectedPersona, prepAnswers);
      const reply = await chatText({
        page: 'AIAmbassadorsPage',
        messages: updated.map(m => ({ role: m.role, content: m.content })),
        system: systemPrompt,
        max_tokens: 250,
      });
      const isDone = reply.includes('✅');
      setPrepDone(isDone);
      setPrepMessages(prev => [...prev, { id: crypto.randomUUID(), role: 'assistant', content: reply, timestamp: new Date() }]);
    } finally { setPrepLoading(false); }
  }, [prepInput, prepLoading, prepMessages, selectedPersona, prepQuestion, prepAnswers]);

  const closePrepQuestion = useCallback(() => {
    if (prepQuestion && prepMessages.length > 0) {
      const summary = prepMessages.slice(-6).map(m => `${m.role === 'assistant' ? 'Coach' : 'Me'}: ${m.content.slice(0, 300)}`).join('\n');
      setPrepAnswers(prev => ({ ...prev, [prepQuestion.key]: summary }));
    }
    setPrepQuestion(null);
    setPrepMessages([]);
    setPrepDone(false);
  }, [prepQuestion, prepMessages]);

  // ─── Teaching chat ────────────────────────────────────────────────────────
  const sendMessage = async () => {
    if (!inputText.trim() || isSending || !selectedPersona) return;
    const userText = inputText.trim();
    setInputText(''); setIsSending(true);
    window.speechSynthesis.cancel();
    const userMsg: ChatMessage = { id: crypto.randomUUID(), role: 'user', content: userText, timestamp: new Date() };
    const withUser = [...messages, userMsg];
    setMessages(withUser);
    try {
      const reply = await chatText({
        page: 'AIAmbassadorsPage',
        messages: withUser.map(m => ({ role: m.role, content: m.content })),
        system: selectedPersona.systemPrompt,
        max_tokens: 600,
      });
      const aiMsg: ChatMessage = { id: crypto.randomUUID(), role: 'assistant', content: reply, timestamp: new Date() };
      const finalMsgs = [...withUser, aiMsg];
      setMessages(finalMsgs);
      await persistChat(finalMsgs);
    } catch {
      setMessages(prev => [...prev, { id: crypto.randomUUID(), role: 'assistant', content: 'Apologies — small technical problem. Please try again.', timestamp: new Date() }]);
    } finally { setIsSending(false); setTimeout(() => inputRef.current?.focus(), 100); }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  const toggleListening = () => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return;
    if (isListening) { recognitionRef.current?.stop(); return; }
    const rec = new SR(); recognitionRef.current = rec;
    rec.lang = 'en-NG'; rec.continuous = false; rec.interimResults = false;
    rec.onresult = (e: any) => { setInputText(prev => prev ? `${prev} ${e.results[0][0].transcript}` : e.results[0][0].transcript); };
    rec.onend = () => setIsListening(false); rec.onerror = () => setIsListening(false);
    rec.start(); setIsListening(true);
  };

  // ─── Evaluate ─────────────────────────────────────────────────────────────
  const handleEvaluate = async () => {
    if (isEvaluating || !selectedPersona || messages.length < 4) return;
    setIsEvaluating(true);
    const userTurns = messages.filter(m => m.role === 'user');
    const conversation = messages.slice(-10).map(m =>
      `${m.role === 'user' ? 'STUDENT (Ambassador)' : `COMMUNITY MEMBER (${selectedPersona.name})`}: ${m.content.slice(0, 500)}`
    ).join('\n\n');
    try {
      const result = await chatJSON({
        page: 'AIAmbassadorsPage',
        messages: [{
          role: 'user', content: `You are evaluating a student's performance as an AI Ambassador — someone teaching a community member about AI.

The community member persona: ${selectedPersona.name} — ${selectedPersona.occupation}, ${selectedPersona.age} years old.
Their initial attitude: ${selectedPersona.initialAttitude}
Their common fears/concerns: ${selectedPersona.commonFears.join('; ')}

Full conversation:
${conversation}

Number of student turns: ${userTurns.length}

Evaluate the student on these five dimensions (score 0-3 each):
1. Plain-Language Explanation: Did they explain AI without jargon, in terms this community member understands?
2. Relevant Local Examples: Did they use specific Oloibiri/Niger Delta examples relevant to this person's life and work?
3. Handling Resistance: Did they address this person's specific fears and skepticism thoughtfully?
4. Practical Next Step: Did they leave the community member with one concrete, achievable action?
5. Respect & Cultural Awareness: Did they show appropriate respect for this person's age, position, faith, or experience?

Also provide:
- overall_score: average of the five scores (0-3)
- can_advance: true if average >= 2.0
- encouragement: 2-3 warm, specific sentences about what the student did well
- main_improvement: 1-2 sentences on the single most important thing to improve

Respond ONLY as valid JSON:
{
  "scores": { "explanation": <0-3>, "relevance": <0-3>, "objections": <0-3>, "actionable": <0-3>, "respect": <0-3> },
  "evidence": { "explanation": "<1-2 sentences>", "relevance": "<1-2 sentences>", "objections": "<1-2 sentences>", "actionable": "<1-2 sentences>", "respect": "<1-2 sentences>" },
  "overall_score": <0.0-3.0>,
  "can_advance": <true/false>,
  "encouragement": "<2-3 warm sentences>",
  "main_improvement": "<1-2 sentences>"
}`,
        }],
        system: 'You are an expert educator evaluating community engagement skills. Be specific, fair, and constructive. Keep each evidence field to 1-2 sentences maximum.',
        max_tokens: 1200,
      });
      setEvaluation(result);
      await persistChat(messages, result);
      setShowEvalModal(true);
    } catch (err) { console.error('[AIAmbassadorsPage] handleEvaluate error:', err); }
    finally { setIsEvaluating(false); }
  };

  // ─── Open debrief chat (new: reflect view) ────────────────────────────────
  const openDebrief = () => {
    if (!selectedPersona || !evaluation) return;
    const opener: ChatMessage = {
      id: crypto.randomUUID(), role: 'assistant',
      content: `Ready to help you debrief this session with **${selectedPersona.name}**.\n\nYour overall score was **${evaluation.overall_score?.toFixed(1)}/3.0**. ${evaluation.encouragement}\n\nYour main area to improve: ${evaluation.main_improvement}\n\nAsk me anything — "How could I have handled the ${selectedPersona.commonFears[0].replace(/"/g, '')} objection better?", "Show me a better opening line", or "Why did I score low on local examples?"`,
      timestamp: new Date(),
    };
    setDebriefMessages([opener]);
    setShowEvalModal(false);
    setView('reflect');
  };

  const sendDebriefMessage = async () => {
    if (!debriefInput.trim() || isDebriefSending || !selectedPersona || !evaluation) return;
    const userMsg: ChatMessage = { id: crypto.randomUUID(), role: 'user', content: debriefInput.trim(), timestamp: new Date() };
    setDebriefMessages(prev => [...prev, userMsg]);
    setDebriefInput('');
    setIsDebriefSending(true);
    try {
      const history = [...debriefMessages, userMsg];
      const systemPrompt = buildDebriefPrompt(selectedPersona, evaluation, messages);
      const reply = await chatText({
        page: 'AIAmbassadorsPage',
        messages: history.map(m => ({ role: m.role, content: m.content })),
        system: systemPrompt,
        max_tokens: 600,
      });
      setDebriefMessages(prev => [...prev, { id: crypto.randomUUID(), role: 'assistant', content: reply, timestamp: new Date() }]);
    } catch {
      setDebriefMessages(p => [...p, { id: crypto.randomUUID(), role: 'assistant', content: 'Technical issue — please try again.', timestamp: new Date() }]);
    } finally { setIsDebriefSending(false); }
  };

  const handleDebriefKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendDebriefMessage(); }
  };

  const handleNewSession = () => {
    window.speechSynthesis.cancel();
    setMessages([]); setEvaluation(null); setShowEvalModal(false);
    setDashboardId(null); setPersona(null); setPrepAnswers({});
    setDebriefMessages([]); setDebriefInput('');
    setView('select');
  };

  const handleSave = async () => {
    setIsSaving(true);
    await persistChat(messages);
    setIsSaving(false);
  };

  const userTurnCount = messages.filter(m => m.role === 'user').length;
  const prepCompletedCount = Object.keys(prepAnswers).length;

  // ════════════════════════════════════════════════════════════════════════════
  // VIEW: SELECT PERSONA
  // ════════════════════════════════════════════════════════════════════════════

  if (view === 'select') {
    return (
      <AppLayout>
        <CommunityBackground />
        <div className="relative z-10 max-w-4xl mx-auto px-6 py-10">
          <div className="bg-black/30 backdrop-blur-sm rounded-2xl p-6 mb-8">
            <div className="flex items-center gap-3 mb-2">
              <Users className="h-10 w-10 text-emerald-300" />
              <h1 className="text-4xl font-bold text-white">AI Ambassadors</h1>
            </div>
            <p className="text-xl text-emerald-100">
              {communicationLevel <= 1
                ? 'Learn how to teach others in your community about AI — by practising with a real community member.'
                : 'Develop the skills to explain AI accessibly, handle skepticism, and connect technology to real community needs in Oloibiri.'}
            </p>
          </div>

          {/* ── Challenge Banner — available (not enrolled) ── */}
          {!challengeLoading && availableChallenge && !activeChallenge && (
            <div className="bg-teal-900/80 backdrop-blur-sm border border-teal-400/50 rounded-2xl p-5 mb-6 shadow-lg">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-teal-400/20 flex items-center justify-center flex-shrink-0">
                  <Award size={20} className="text-teal-300" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-bold text-teal-300 uppercase tracking-wide">Community AI Challenge — This Week</span>
                    <span className="text-xs bg-teal-400/20 text-teal-200 px-2 py-0.5 rounded-full">{availableChallenge.tier_target}</span>
                  </div>
                  <p className="text-white font-bold text-base mb-1">{availableChallenge.title}</p>
                  <p className="text-teal-100 text-sm leading-relaxed mb-3">{availableChallenge.description}</p>
                  <button
                    onClick={() => handleEnrollChallenge(availableChallenge)}
                    disabled={enrolling}
                    className="w-full py-2.5 rounded-xl bg-teal-500 hover:bg-teal-400 disabled:opacity-50 text-white font-bold text-sm transition-colors flex items-center justify-center gap-2"
                  >
                    {enrolling
                      ? <><Loader2 size={14} className="animate-spin" /> Checking out…</>
                      : <><ChevronRight size={16} /> Check out this challenge</>
                    }
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ── Challenge Banner — enrolled ── */}
          {activeChallenge && (
            <div className="bg-emerald-900/80 backdrop-blur-sm border border-emerald-400/50 rounded-2xl p-5 mb-6 shadow-lg">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-400/20 flex items-center justify-center flex-shrink-0">
                  <Award size={20} className="text-emerald-300" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-bold text-emerald-300 uppercase tracking-wide">Community AI Challenge — Active</span>
                    <span className="text-xs bg-emerald-400/20 text-emerald-200 px-2 py-0.5 rounded-full">{activeChallenge.tier_target}</span>
                  </div>
                  <p className="text-white font-bold text-base mb-1">{activeChallenge.title}</p>
                  <p className="text-emerald-100 text-sm leading-relaxed mb-2">{activeChallenge.challenge_mode_intro}</p>
                  <div className="bg-emerald-800/60 rounded-xl p-3 mb-3">
                    <p className="text-xs font-bold text-emerald-300 mb-1">Your mission:</p>
                    <p className="text-emerald-100 text-sm">{activeChallenge.challenge_instruction}</p>
                  </div>
                  <button
                    onClick={() => setShowChallengeReflect(true)}
                    className="w-full py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-white font-bold text-sm transition-colors flex items-center justify-center gap-2"
                  >
                    <CheckCircle size={16} /> I've done it — submit my reflection
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ── Challenge Reflection Modal ── */}
          {showChallengeReflect && activeChallenge && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
              <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl">
                {challengeResult ? (
                  <div className="p-6">
                    <div className="text-center mb-6">
                      <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-3">
                        <Award size={32} className="text-emerald-600" />
                      </div>
                      <h2 className="text-2xl font-black text-gray-900">{challengeResult.tier_label}</h2>
                      <p className="text-sm text-emerald-600 font-bold uppercase tracking-wide mt-1">{challengeResult.tier} tier earned</p>
                    </div>
                    <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 mb-4">
                      <p className="text-sm font-bold text-emerald-800 mb-1">What you achieved</p>
                      <p className="text-sm text-emerald-700 leading-relaxed">{challengeResult.summary}</p>
                    </div>
                    <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-4">
                      <p className="text-sm font-bold text-blue-800 mb-1">Why you earned this tier</p>
                      <p className="text-sm text-blue-700 leading-relaxed">{challengeResult.tier_reasoning}</p>
                    </div>
                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4">
                      <p className="text-sm font-bold text-amber-800 mb-1">What to do next</p>
                      <p className="text-sm text-amber-700 leading-relaxed">{challengeResult.follow_up_instruction}</p>
                    </div>
                    <div className="bg-gray-50 rounded-xl p-3 mb-5">
                      <p className="text-xs text-gray-500">{challengeResult.next_tier_hint}</p>
                    </div>
                    <button
                      onClick={() => { setShowChallengeReflect(false); setChallengeResult(null); setActiveChallenge(null); }}
                      className="w-full py-3 rounded-xl bg-emerald-600 text-white font-bold hover:bg-emerald-700 transition-colors"
                    >
                      Done
                    </button>
                  </div>
                ) : (
                  <div className="p-6">
                    <div className="flex items-center justify-between mb-5">
                      <div>
                        <p className="text-xs font-bold text-emerald-500 uppercase tracking-wide mb-0.5">Challenge Reflection</p>
                        <h2 className="text-xl font-black text-gray-900">{activeChallenge.title}</h2>
                      </div>
                      <button onClick={() => setShowChallengeReflect(false)} className="text-gray-400 hover:text-gray-600 p-1">
                        <X size={20} />
                      </button>
                    </div>
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-bold text-gray-800 mb-1.5">{activeChallenge.return_question_1}</label>
                        <textarea value={challengeReflect1} onChange={e => setChallengeReflect1(e.target.value)} rows={3}
                          placeholder="Describe what you did…"
                          className="w-full px-4 py-3 text-sm border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-400 resize-none leading-relaxed"/>
                      </div>
                      <div>
                        <label className="block text-sm font-bold text-gray-800 mb-1.5">{activeChallenge.return_question_2}</label>
                        <textarea value={challengeReflect2} onChange={e => setChallengeReflect2(e.target.value)} rows={3}
                          placeholder="What happened…"
                          className="w-full px-4 py-3 text-sm border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-400 resize-none leading-relaxed"/>
                      </div>
                      {activeChallenge.return_question_3 && (
                        <div>
                          <label className="block text-sm font-bold text-gray-800 mb-1.5">{activeChallenge.return_question_3}</label>
                          <textarea value={challengeReflect3} onChange={e => setChallengeReflect3(e.target.value)} rows={2}
                            placeholder="Additional details…"
                            className="w-full px-4 py-3 text-sm border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-400 resize-none leading-relaxed"/>
                        </div>
                      )}
                    </div>
                    <button
                      onClick={handleSubmitChallengeReflection}
                      disabled={!challengeReflect1.trim() || !challengeReflect2.trim() || challengeSubmitting}
                      className="w-full mt-6 py-3.5 rounded-xl font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
                    >
                      {challengeSubmitting
                        ? <><Loader2 size={16} className="animate-spin" /> Evaluating your impact…</>
                        : <><CheckCircle size={16} /> Submit reflection</>
                      }
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* How it works */}
          <div className="bg-white/90 backdrop-blur-sm rounded-2xl p-6 mb-8 shadow-lg">
            <h2 className="text-2xl font-bold text-gray-900 mb-4 flex items-center gap-2">
              <Globe2 className="h-6 w-6 text-emerald-600" /> How This Works
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-4">
              {[
                { icon: '👤', title: 'Choose a persona', desc: 'Mama Grace, Bro Emeka, Aunty Patience, Mr. Biodun, or Chief Tamuno — each with real concerns.' },
                { icon: '🎯', title: 'Prepare with AI coaching', desc: 'New: work through 4 guided prep questions before you start. The coach pushes you to think more specifically.' },
                { icon: '🎭', title: 'You are the teacher', desc: 'The AI plays the community member. Explain AI, handle their questions, and leave them with something useful.' },
                { icon: '💬', title: 'Debrief & improve', desc: 'New: after your evaluation, open a debrief chat. Ask "how could I have handled that better?" and practise specific moments.' },
              ].map((step, i) => (
                <div key={i} className="bg-emerald-50 rounded-xl p-4">
                  <div className="text-3xl mb-2">{step.icon}</div>
                  <h3 className="font-bold text-gray-900 text-base mb-1">{step.title}</h3>
                  <p className="text-sm text-gray-600">{step.desc}</p>
                </div>
              ))}
            </div>
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
              <p className="text-sm text-amber-800">
                <strong>💡 Ambassador tip:</strong> The best AI teachers in Oloibiri don't talk about technology — they talk about people's real problems and show how AI helps solve them. Mama Grace doesn't care about "machine learning." She cares about selling more cloth.
              </p>
            </div>
          </div>

          {/* Persona grid */}
          <h2 className="text-2xl font-bold text-white mb-4">Choose who you want to teach today:</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
            {PERSONAS.map(p => {
              const sessions = pastSessions.filter(s => s.persona_id === p.id);
              const bestScore = sessions.reduce((max, s) => s.overall_score != null && s.overall_score > max ? s.overall_score : max, 0);
              return (
                <button key={p.id} onClick={() => { setPersona(p); setPrepAnswers({}); setView('prepare'); }}
                  className="text-left bg-white/90 backdrop-blur-sm rounded-2xl p-5 shadow-lg hover:shadow-xl hover:scale-[1.02] transition-all border-2 border-transparent hover:border-emerald-400">
                  <div className={`w-14 h-14 rounded-xl bg-gradient-to-br ${p.colour} flex items-center justify-center text-3xl mb-3`}>
                    {p.emoji}
                  </div>
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <h3 className="text-xl font-bold text-gray-900">{p.name}</h3>
                    {sessions.length > 0 && (
                      <span className={classNames('text-xs font-bold px-2 py-0.5 rounded-full flex-shrink-0', bestScore >= 2 ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700')}>
                        Best: {bestScore.toFixed(1)}/3
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-500 mb-2">{p.age} years · {p.occupation}</p>
                  <p className="text-sm text-gray-700 leading-relaxed">{p.initialAttitude}</p>
                  <div className="mt-3 flex flex-wrap gap-1">
                    {p.commonFears.slice(0, 2).map((f, i) => (
                      <span key={i} className="text-[11px] bg-gray-100 text-gray-600 rounded-full px-2 py-0.5">{f}</span>
                    ))}
                  </div>
                  {sessions.length > 0 && (
                    <p className="text-xs text-gray-400 mt-2 flex items-center gap-1">
                      <History size={11}/> {sessions.length} session{sessions.length !== 1 ? 's' : ''}
                    </p>
                  )}
                </button>
              );
            })}
          </div>

          {/* Past sessions */}
          {pastSessions.length > 0 && (
            <div className="bg-white/90 backdrop-blur-sm rounded-2xl p-5 shadow-lg">
              <h3 className="text-base font-bold text-gray-900 mb-3 flex items-center gap-2">
                <History size={16} className="text-emerald-600"/> Recent Sessions
              </h3>
              <div className="space-y-2">
                {pastSessions.slice(0, 5).map(session => {
                  const persona = PERSONAS.find(p => p.id === session.persona_id);
                  return (
                    <div key={session.id} className="flex items-center justify-between bg-gray-50 rounded-xl px-4 py-3">
                      <div className="flex items-center gap-3">
                        <span className="text-xl">{persona?.emoji ?? '👤'}</span>
                        <div>
                          <p className="text-sm font-semibold text-gray-900">{session.persona_name}</p>
                          <p className="text-xs text-gray-500">{new Date(session.created_at).toLocaleDateString('en-NG', { day: 'numeric', month: 'short' })}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {session.overall_score != null ? (
                          <span className={classNames('text-xs font-bold px-2 py-1 rounded-full', session.can_advance ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700')}>
                            {session.overall_score.toFixed(1)}/3.0 {session.can_advance ? '✅' : '🌱'}
                          </span>
                        ) : (
                          <span className="text-xs text-gray-400">In progress</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </AppLayout>
    );
  }

  // ════════════════════════════════════════════════════════════════════════════
  // VIEW: PREPARE — with structured prep coaching questions
  // ════════════════════════════════════════════════════════════════════════════

  if (view === 'prepare' && selectedPersona) {
    return (
      <AppLayout>
        <CommunityBackground />

        {/* Prep Coach Panel Modal */}
        {prepQuestion && (
          <PrepPanel
            question={prepQuestion}
            persona={selectedPersona}
            messages={prepMessages}
            loading={prepLoading}
            done={prepDone}
            input={prepInput}
            onInputChange={setPrepInput}
            onSend={sendPrepMessage}
            onClose={closePrepQuestion}
            chatEndRef={prepChatEndRef}
          />
        )}

        <div className="relative z-10 max-w-2xl mx-auto px-6 py-10">
          <button onClick={() => setView('select')} className="flex items-center gap-2 text-emerald-200 hover:text-white mb-6 transition-colors">
            <ArrowLeft size={18} /> Back to all personas
          </button>

          <div className="bg-white/93 backdrop-blur-sm rounded-2xl shadow-xl overflow-hidden">
            {/* Header */}
            <div className={`bg-gradient-to-r ${selectedPersona.colour} p-6`}>
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-2xl bg-white/20 flex items-center justify-center text-4xl">{selectedPersona.emoji}</div>
                <div>
                  <h2 className="text-3xl font-bold text-white">{selectedPersona.name}</h2>
                  <p className="text-white/80">{selectedPersona.age} years · {selectedPersona.occupation}</p>
                </div>
              </div>
            </div>

            <div className="p-6 space-y-5">
              {/* Background */}
              <div>
                <h3 className="font-bold text-gray-900 text-lg mb-2 flex items-center gap-2"><BookOpen size={18} className="text-emerald-600" /> Their Story</h3>
                <p className="text-gray-700 leading-relaxed">{selectedPersona.background}</p>
              </div>

              {/* Concerns */}
              <div>
                <h3 className="font-bold text-gray-900 text-lg mb-2 flex items-center gap-2"><AlertCircle size={18} className="text-amber-600" /> What They're Worried About</h3>
                <ul className="space-y-1.5">
                  {selectedPersona.commonFears.map((f, i) => (
                    <li key={i} className="flex items-start gap-2 text-gray-700">
                      <span className="text-amber-500 mt-0.5">•</span>{f}
                    </li>
                  ))}
                </ul>
              </div>

              {/* Prep coaching questions — the new pattern */}
              <div>
                <h3 className="font-bold text-gray-900 text-lg mb-1 flex items-center gap-2">
                  <Lightbulb size={18} className="text-emerald-600" /> Prepare with AI Coaching
                </h3>
                <p className="text-sm text-gray-500 mb-3">
                  Tap <strong>🎯 Prep</strong> on each question. The AI will coach you to think through a specific, concrete answer before you face {selectedPersona.name}. Completing at least 2 is recommended.
                </p>
                <div className="space-y-2">
                  {selectedPersona.prepQuestions.map(q => {
                    const done = !!prepAnswers[q.key];
                    return (
                      <div key={q.key} className={classNames('flex items-start gap-3 px-4 py-3 rounded-xl border transition-colors',
                        done ? 'bg-emerald-50 border-emerald-300' : 'bg-gray-50 border-gray-200')}>
                        <div className="flex-shrink-0 mt-0.5">
                          {done
                            ? <CheckCircle size={16} className="text-emerald-600"/>
                            : <div className="w-4 h-4 rounded-full border-2 border-gray-300"/>}
                        </div>
                        <p className="text-sm text-gray-800 flex-1 leading-snug">{q.question}</p>
                        <button
                          onClick={() => openPrepQuestion(q)}
                          className={classNames('px-3 py-1.5 rounded-lg text-xs font-bold border flex-shrink-0 transition-colors',
                            done
                              ? 'bg-emerald-100 text-emerald-700 border-emerald-300 hover:bg-emerald-200'
                              : 'bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-700'
                          )}
                        >
                          {done ? '🎯 Redo' : '🎯 Prep'}
                        </button>
                      </div>
                    );
                  })}
                </div>
                {prepCompletedCount > 0 && (
                  <p className="text-xs text-emerald-700 mt-2 font-semibold">
                    {prepCompletedCount}/{selectedPersona.prepQuestions.length} questions prepared ✓
                  </p>
                )}
              </div>

              {/* Opening line preview */}
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
                <p className="text-xs font-bold text-gray-500 uppercase mb-2">How {selectedPersona.name} will open:</p>
                <p className="text-gray-800 italic">"{selectedPersona.openingLine}"</p>
              </div>

              {/* Voice selector */}
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium text-gray-600 flex items-center gap-1"><Volume2 size={15} /> Voice:</span>
                <div className="flex rounded-lg overflow-hidden border border-gray-300">
                  {(['english', 'pidgin'] as const).map(m => (
                    <button key={m} onClick={() => setVoiceMode(m)}
                      className={`px-3 py-1.5 text-sm font-bold border-r border-gray-300 last:border-0 transition-all ${voiceMode === m ? (m === 'english' ? 'bg-blue-600 text-white' : 'bg-green-600 text-white') : 'bg-white text-gray-500 hover:bg-gray-50'}`}>
                      {m === 'english' ? '🇬🇧 English' : '🇳🇬 Pidgin'}
                    </button>
                  ))}
                </div>
              </div>

              <button onClick={() => setView('teach')}
                className={`w-full py-4 rounded-xl text-xl font-bold text-white bg-gradient-to-r ${selectedPersona.colour} hover:opacity-95 hover:scale-[1.01] transition-all shadow-lg flex items-center justify-center gap-2`}>
                <MessageSquare size={22} /> Start Teaching {selectedPersona.name}
                {prepCompletedCount === 0 && <span className="text-sm font-normal opacity-80 ml-1">(or prepare first above)</span>}
              </button>
            </div>
          </div>
        </div>
      </AppLayout>
    );
  }

  // ════════════════════════════════════════════════════════════════════════════
  // VIEW: TEACH — role-play chat (unchanged structure, minor additions)
  // ════════════════════════════════════════════════════════════════════════════

  if (view === 'teach' && selectedPersona) {
    return (
      <AppLayout>
        <CommunityBackground />
        <div className="relative z-10 max-w-[67%] mx-auto px-6 py-8">

          {/* Evaluation Modal */}
          {showEvalModal && evaluation && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
              <div className="bg-white rounded-2xl w-full max-w-xl max-h-[88vh] overflow-y-auto shadow-2xl">
                <div className={`sticky top-0 bg-gradient-to-r ${selectedPersona.colour} px-6 py-4 rounded-t-2xl flex items-center justify-between`}>
                  <h2 className="text-white font-bold text-lg">Session Evaluation</h2>
                  <button onClick={() => setShowEvalModal(false)} className="text-white/80 hover:text-white"><X size={22} /></button>
                </div>
                <div className="p-6 space-y-4">
                  <div className="text-center p-4 bg-gray-50 rounded-xl">
                    <p className="text-sm text-gray-500 uppercase font-bold mb-1">Overall Score</p>
                    <p className="text-5xl font-black text-gray-900">{evaluation.overall_score?.toFixed(1)}<span className="text-2xl font-normal text-gray-400">/3.0</span></p>
                    <p className={classNames('text-base font-bold mt-1', evaluation.can_advance ? 'text-emerald-600' : 'text-amber-600')}>
                      {evaluation.can_advance ? '✅ Proficient — ready to teach real community members' : '🌱 Keep practising — try one more session'}
                    </p>
                  </div>

                  <div className="space-y-3">
                    {RUBRIC_DIMENSIONS.map(dim => {
                      const score = evaluation.scores?.[dim.id] ?? 0;
                      const ll = LEVEL_LABELS[score];
                      const evidence = evaluation.evidence?.[dim.id];
                      return (
                        <div key={dim.id} className={`rounded-xl p-4 ${ll.bg}`}>
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-semibold text-gray-900 text-base">{dim.label}</span>
                            <span className={`text-sm font-bold px-2 py-0.5 rounded-full bg-white ${ll.color}`}>{score}/3 — {ll.text}</span>
                          </div>
                          <div className="w-full bg-white/60 rounded-full h-1.5 mb-1.5">
                            <div className={`h-full rounded-full transition-all ${score === 3 ? 'bg-emerald-500' : score === 2 ? 'bg-blue-500' : score === 1 ? 'bg-amber-500' : 'bg-gray-300'}`} style={{ width: `${(score / 3) * 100}%` }} />
                          </div>
                          {evidence && <p className="text-sm text-gray-700">{evidence}</p>}
                        </div>
                      );
                    })}
                  </div>

                  <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
                    <p className="text-sm font-bold text-emerald-800 mb-1">🌟 What you did well</p>
                    <p className="text-sm text-emerald-700 leading-relaxed">{evaluation.encouragement}</p>
                  </div>

                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                    <p className="text-sm font-bold text-amber-800 mb-1">🎯 Focus here next</p>
                    <p className="text-sm text-amber-700 leading-relaxed">{evaluation.main_improvement}</p>
                  </div>

                  {/* New: debrief chat option */}
                  <div className="flex gap-3 pt-2">
                    <button onClick={handleNewSession} className="flex-1 py-3 rounded-xl font-bold text-white bg-gray-700 hover:bg-gray-800 transition-colors">
                      Try Another Persona
                    </button>
                    <button onClick={openDebrief}
                      className={`flex-1 py-3 rounded-xl font-bold text-white bg-gradient-to-r ${selectedPersona.colour} hover:opacity-95 transition-all flex items-center justify-center gap-2`}>
                      <MessageSquare size={16}/> Debrief with AI Coach
                    </button>
                  </div>
                  <button onClick={() => { setShowEvalModal(false); setView('teach'); }}
                    className="w-full py-2 text-sm text-gray-500 hover:text-gray-700 underline">
                    Continue this session
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Challenge mode indicator strip */}
          {activeChallenge && (
            <div className="bg-emerald-800/70 backdrop-blur-sm rounded-xl px-4 py-2.5 mb-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Award size={15} className="text-emerald-300 flex-shrink-0" />
                <p className="text-emerald-100 text-sm">
                  <span className="font-bold">Challenge active:</span> {activeChallenge.challenge_instruction}
                </p>
              </div>
              <button
                onClick={() => setShowChallengeReflect(true)}
                className="flex-shrink-0 text-xs bg-emerald-500 hover:bg-emerald-400 text-white font-bold px-3 py-1.5 rounded-lg transition-colors"
              >
                I've done it
              </button>
            </div>
          )}

          {/* Header */}
          <div className="bg-black/50 backdrop-blur-sm rounded-2xl shadow-lg p-5 mb-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-3">
                <button onClick={() => { window.speechSynthesis.cancel(); setView('prepare'); }} className="text-white/70 hover:text-white p-1">
                  <ArrowLeft size={20} />
                </button>
                <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${selectedPersona.colour} flex items-center justify-center text-2xl`}>
                  {selectedPersona.emoji}
                </div>
                <div>
                  <h2 className="text-xl font-bold text-white drop-shadow">Teaching {selectedPersona.name}</h2>
                  <p className="text-sm text-white/80 font-medium">{selectedPersona.occupation}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <div className="flex rounded-lg overflow-hidden border border-gray-300">
                  {(['english', 'pidgin'] as const).map(m => (
                    <button key={m} onClick={() => { stopSpeaking(); setVoiceMode(m); }}
                      className={`px-2.5 py-1.5 text-xs font-bold border-r border-gray-300 last:border-0 transition-all ${voiceMode === m ? (m === 'english' ? 'bg-blue-600 text-white' : 'bg-green-600 text-white') : 'bg-white text-gray-500 hover:bg-gray-50'}`}>
                      {m === 'english' ? '🇬🇧' : '🇳🇬'}
                    </button>
                  ))}
                </div>
                <button onClick={() => { setSpeechOn(s => !s); if (speechOn) stopSpeaking(); }}
                  className={`p-2 rounded-lg transition-all ${speechOn ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-400'}`}>
                  {speechOn ? <Volume2 size={16} /> : <VolumeX size={16} />}
                </button>
                <button onClick={handleSave} disabled={isSaving || messages.length < 2}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white/80 hover:text-white border border-white/40 hover:border-white/70 rounded-lg transition-colors disabled:opacity-40">
                  {isSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Save
                </button>
                <button onClick={handleEvaluate} disabled={isEvaluating || userTurnCount < 3}
                  title={userTurnCount < 3 ? 'Have at least 3 exchanges before evaluating' : 'Evaluate your teaching session'}
                  className={classNames('flex items-center gap-1.5 px-3 py-1.5 text-sm font-bold rounded-lg transition-colors',
                    userTurnCount >= 3 && !isEvaluating ? `bg-gradient-to-r ${selectedPersona.colour} text-white hover:opacity-90` : 'bg-gray-200 text-gray-400 cursor-not-allowed')}>
                  {isEvaluating ? <Loader2 size={14} className="animate-spin" /> : <Star size={14} />}
                  {isEvaluating ? 'Evaluating…' : 'Evaluate'}
                </button>
              </div>
            </div>
          </div>

          {/* Tip */}
          <div className="bg-white/80 backdrop-blur-sm rounded-xl px-4 py-2.5 mb-4 flex items-center gap-2">
            <ShieldCheck size={16} className="text-emerald-600 flex-shrink-0" />
            <p className="text-sm text-gray-700">
              <strong>Remember:</strong> You are the teacher. Ask about their life first. Connect AI to their specific work. Use simple language. Evaluate after at least 3 exchanges.
            </p>
          </div>

          {/* Chat panel */}
          <div className="bg-white rounded-2xl shadow-lg mb-4 flex flex-col" style={{ height: '520px' }}>
            <div className="flex items-center flex-wrap gap-2 px-5 py-3 border-b bg-gray-50 text-sm text-gray-600 flex-shrink-0 rounded-t-2xl">
              <span className="font-semibold text-gray-700">Role-play:</span>
              <span className="text-gray-500">{selectedPersona.emoji} {selectedPersona.name} is played by AI — you are the teacher</span>
              <span className="ml-auto text-gray-400">{userTurnCount} turn{userTurnCount !== 1 ? 's' : ''} · {userTurnCount >= 3 ? '✅ Ready to evaluate' : `${3 - userTurnCount} more to evaluate`}</span>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {messages.map(msg => (
                <div key={msg.id} className={classNames('flex items-start gap-3', msg.role === 'user' ? 'justify-end' : 'justify-start')}>
                  {msg.role === 'assistant' && (
                    <div className={`flex-shrink-0 w-10 h-10 rounded-xl bg-gradient-to-br ${selectedPersona.colour} flex items-center justify-center text-xl`}>
                      {selectedPersona.emoji}
                    </div>
                  )}
                  <div className={classNames('max-w-[75%] rounded-2xl px-4 py-3 text-base leading-relaxed',
                    msg.role === 'user' ? 'bg-emerald-600 text-white rounded-tr-sm' : 'bg-gray-100 text-gray-900 rounded-tl-sm')}>
                    {msg.role === 'assistant'
                      ? <><p className="text-xs font-bold mb-1 opacity-60">{selectedPersona.name}</p><MarkdownText text={msg.content} /></>
                      : <><p className="text-xs font-bold mb-1 opacity-75">You (Ambassador)</p><MarkdownText text={msg.content} /></>}
                  </div>
                  {msg.role === 'user' && (
                    <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-emerald-600 flex items-center justify-center">
                      <Users size={18} className="text-white" />
                    </div>
                  )}
                </div>
              ))}
              {isSending && (
                <div className="flex items-start gap-3">
                  <div className={`flex-shrink-0 w-10 h-10 rounded-xl bg-gradient-to-br ${selectedPersona.colour} flex items-center justify-center text-xl`}>{selectedPersona.emoji}</div>
                  <div className="bg-gray-100 rounded-2xl rounded-tl-sm px-4 py-3">
                    <div className="flex gap-1.5 items-center h-5">
                      {[0, 150, 300].map(d => <div key={d} className="w-2 h-2 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: `${d}ms` }} />)}
                    </div>
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            <div className="border-t p-4 rounded-b-2xl">
              <div className="flex items-end gap-2">
                <textarea ref={inputRef} value={inputText} onChange={e => setInputText(e.target.value)} onKeyDown={handleKeyDown} rows={3}
                  placeholder={`Speak to ${selectedPersona.name}… (Enter to send, Shift+Enter for new line)`}
                  disabled={isSending}
                  className="flex-1 px-4 py-3 text-lg border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-400 resize-none leading-relaxed disabled:opacity-50" />
                <div className="flex flex-col gap-2">
                  <button onClick={toggleListening}
                    className={classNames('p-3 rounded-xl transition-all', isListening ? 'bg-red-500 text-white animate-pulse' : 'bg-gray-100 text-gray-500 hover:bg-gray-200')}>
                    {isListening ? <MicOff size={18} /> : <Mic size={18} />}
                  </button>
                  <button onClick={sendMessage} disabled={!inputText.trim() || isSending}
                    className={classNames('p-3 rounded-xl transition-all', inputText.trim() && !isSending ? `bg-gradient-to-br ${selectedPersona.colour} text-white hover:opacity-90` : 'bg-gray-100 text-gray-400 cursor-not-allowed')}>
                    <Send size={18} />
                  </button>
                </div>
              </div>
            </div>
          </div>

          {userTurnCount >= 3 && !showEvalModal && (
            <div className="bg-white/90 backdrop-blur-sm rounded-xl p-4 flex items-center justify-between shadow">
              <div className="flex items-center gap-2">
                <Award size={20} className="text-emerald-600" />
                <p className="text-base font-semibold text-gray-800">Good session! Get your evaluation when you're ready.</p>
              </div>
              <button onClick={handleEvaluate} disabled={isEvaluating}
                className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-white bg-gradient-to-r ${selectedPersona.colour} hover:opacity-90 transition-all`}>
                {isEvaluating ? <><Loader2 size={16} className="animate-spin" /> Evaluating…</> : <><Star size={16} /> Evaluate Session</>}
              </button>
            </div>
          )}

          <div className="mt-3 flex justify-center">
            <button onClick={handleNewSession} className="text-sm text-white/60 hover:text-white/90 underline transition-colors">
              Start over with a different persona
            </button>
          </div>
        </div>
      </AppLayout>
    );
  }

  // ════════════════════════════════════════════════════════════════════════════
  // VIEW: REFLECT — debrief chat with AI coach (new)
  // ════════════════════════════════════════════════════════════════════════════

  if (view === 'reflect' && selectedPersona && evaluation) {
    return (
      <AppLayout>
        <CommunityBackground />
        <div className="relative z-10 max-w-2xl mx-auto px-6 py-8">
          <div className="bg-white/93 backdrop-blur-sm rounded-2xl shadow-lg p-5 mb-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-3">
                <button onClick={() => setView('teach')} className="text-gray-400 hover:text-gray-700 p-1"><ArrowLeft size={20}/></button>
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-600 to-teal-600 flex items-center justify-center text-lg">🎓</div>
                <div>
                  <h2 className="text-base font-bold text-gray-900">Debrief — {selectedPersona.name}</h2>
                  <p className="text-xs text-gray-500">Session score: {evaluation.overall_score?.toFixed(1)}/3.0 · Ask how to improve</p>
                </div>
              </div>
              <button onClick={handleNewSession}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-bold rounded-lg text-white bg-gradient-to-r ${selectedPersona.colour} hover:opacity-90`}>
                <RefreshCw size={13}/> New session
              </button>
            </div>
          </div>

          <div className="bg-white/80 backdrop-blur-sm rounded-xl px-4 py-2.5 mb-4 flex items-center gap-2">
            <Lightbulb size={14} className="text-emerald-700 flex-shrink-0"/>
            <p className="text-xs text-gray-700">Ask "How could I have handled the fear about X better?", "Show me a better opening line", or "Why did I score low on local examples?" The coach will give specific, honest feedback tied to your actual session.</p>
          </div>

          <div className="bg-white rounded-2xl shadow-lg mb-4 flex flex-col" style={{ height: '480px' }}>
            <div className="flex items-center justify-between px-5 py-3 border-b bg-gray-50 rounded-t-2xl text-xs text-gray-500">
              <span className="font-semibold text-gray-700 flex items-center gap-1.5">🎓 AI Debrief Coach</span>
              <span>{debriefMessages.filter(m => m.role === 'user').length} questions asked</span>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {debriefMessages.map(msg => (
                <div key={msg.id} className={classNames('flex items-start gap-3', msg.role === 'user' ? 'justify-end' : 'justify-start')}>
                  {msg.role === 'assistant' && (
                    <div className="flex-shrink-0 w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-600 to-teal-600 flex items-center justify-center text-lg">🎓</div>
                  )}
                  <div className={classNames('max-w-[78%] rounded-2xl px-4 py-3 text-sm leading-relaxed',
                    msg.role === 'user' ? 'bg-emerald-600 text-white rounded-tr-sm' : 'bg-gray-100 text-gray-900 rounded-tl-sm')}>
                    {msg.role === 'assistant' && <p className="text-xs font-bold mb-1 opacity-50">Debrief Coach</p>}
                    {msg.role === 'user' && <p className="text-xs font-bold mb-1 opacity-75">You</p>}
                    <MarkdownText text={msg.content}/>
                  </div>
                  {msg.role === 'user' && (
                    <div className="flex-shrink-0 w-9 h-9 rounded-xl bg-emerald-600 flex items-center justify-center">
                      <Users size={15} className="text-white"/>
                    </div>
                  )}
                </div>
              ))}
              {isDebriefSending && (
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-600 to-teal-600 flex items-center justify-center text-lg">🎓</div>
                  <div className="bg-gray-100 rounded-2xl rounded-tl-sm px-4 py-3">
                    <div className="flex gap-1.5 items-center h-4">{[0,150,300].map(d => <div key={d} className="w-2 h-2 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: `${d}ms` }}/>)}</div>
                  </div>
                </div>
              )}
              <div ref={debriefEndRef}/>
            </div>
            <div className="border-t p-4 rounded-b-2xl">
              <div className="flex items-end gap-2">
                <textarea
                  value={debriefInput}
                  onChange={e => setDebriefInput(e.target.value)}
                  onKeyDown={handleDebriefKeyDown}
                  rows={2}
                  placeholder={`Ask how to improve your session with ${selectedPersona.name}…`}
                  disabled={isDebriefSending}
                  className="flex-1 px-4 py-3 text-sm border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-400 resize-none leading-relaxed disabled:opacity-50"
                />
                <button onClick={sendDebriefMessage} disabled={!debriefInput.trim() || isDebriefSending}
                  className={classNames('p-2.5 rounded-xl transition-all',
                    debriefInput.trim() && !isDebriefSending ? 'bg-gradient-to-br from-emerald-600 to-teal-600 text-white hover:opacity-90' : 'bg-gray-100 text-gray-400 cursor-not-allowed')}>
                  <Send size={16}/>
                </button>
              </div>
            </div>
          </div>
        </div>
      </AppLayout>
    );
  }

  return null;
};

export default AIAmbassadorsPage;