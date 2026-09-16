// src/pages/tutorials/ResearchReportsMeetingsGuidePage.tsx
//
// A Guide built for the Kenya pilot site's requested workflow — Report
// Preparation, Research, Communication, Meeting Preparation, Documentation,
// Training Materials, Project Planning, Brainstorming, and Information
// Retrieval — mapped onto two tools nextVillage already has, rather than
// nine separate tracks:
//
//   1. Use Claude (/playground) — research, information retrieval,
//      brainstorming, project planning, and meeting strategy. Free-form
//      conversation, so it covers whatever the learner's real topic is.
//   2. Tech Skills → AI Content Creation & Document Studio
//      (/tech-skills/ai-content-creation, /tech-skills/document-studio) —
//      turning that research into a real, polished, exportable report or
//      training document.
//
// The presentation step stays inside Use Claude too: Claude can build an
// HTML slide deck as an artifact directly in the chat, so "meeting
// preparation" ends with an actual file, not just talking points.
//
// Same step/checkbox/cumulative-unlock pattern as AddNewGuidePage.tsx —
// reference material meant to be read and acted on, not a narrated
// walkthrough, and no on-page AI calls: every AI step is a copy-paste
// swivel into /playground.

import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AppLayout from '../../components/layout/AppLayout';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../lib/supabaseClient';
import {
  Check, ChevronDown, ChevronRight, Compass, Lock, Loader2, Copy, CheckCheck,
} from 'lucide-react';

const TRACK = 'research-reports-meetings';

interface CopyBlock {
  label: string;
  text: string;
}

interface GuideStep {
  id: string;
  title: string;
  blurb: string;
  body: string[];
  copyBlocks?: CopyBlock[];
  checkpoint: string;
}

const STEPS: GuideStep[] = [
  {
    id: 'pick-topic',
    title: 'Pick a real topic and start researching',
    blurb: 'Information retrieval and brainstorming, in one place: Use Claude.',
    body: [
      "Pick something real you actually need right now — a question from work, a topic for a report, a problem you're trying to plan around. This whole Guide works best on a real topic, not a practice one.",
      "Go to Use Claude (/playground) and open a new chat. This is where research, information retrieval, and brainstorming all happen — ask Claude what it knows, ask it to list options or angles you haven't thought of, ask follow-up questions the way you would with a knowledgeable colleague.",
      "Keep this chat open and keep working in it as you go — don't start a new chat for every question. Claude remembers everything said earlier in the same chat, so your report, your meeting prep, and your presentation later in this Guide can all build on the research you do here.",
    ],
    copyBlocks: [{
      label: 'Prompt to start research',
      text: `I need to research and eventually write a report on: [YOUR TOPIC]

Here's what I already know or have to work with: [WHAT YOU KNOW SO FAR — or "nothing yet"]

Please:
1. Give me a clear overview of the topic
2. List the key questions I should be trying to answer
3. Brainstorm angles or sub-topics I might not have thought of
4. Flag anything where you're not fully certain, so I know what to double-check elsewhere

Ask me questions if you need more context on my audience or purpose.`,
    }],
    checkpoint: "You have a live chat in Use Claude with real research on your actual topic — an overview, key questions, and a few angles you hadn't considered.",
  },
  {
    id: 'draft-report',
    title: 'Turn the research into a written report',
    blurb: 'Report preparation and documentation — using AI Content Creation.',
    body: [
      'Go to Tech Skills → AI Content Creation. This is a guided workshop — Understand, Create, Polish — built for exactly this: turning research into a real written piece with feedback along the way, not just one AI reply you have to accept as-is.',
      "When it asks what you're writing, describe your report or documentation piece and paste in the research summary Claude gave you in the previous step — you don't have to start from a blank page.",
      "Work through Create and Polish for real — use the in-chat critique option on anything you're unsure about, and read what it tells you before moving on.",
      "If what you actually need is a finished, formatted document (not just written content) — a PDF report, a training handout — take your polished writing into Tech Skills → Document Studio next and lay it out there.",
    ],
    checkpoint: 'You have a written report or training document draft that has been through at least one round of Polish feedback.',
  },
  {
    id: 'meeting-prep',
    title: 'Prepare for the meeting where you\'ll present this',
    blurb: 'Meeting preparation and communication strategy — back in Use Claude.',
    body: [
      "Go back to the same Use Claude chat from step one — it already has your research and knows your topic, so you don't need to re-explain any of it.",
      'Ask Claude to help you plan how to present this: who\'s in the room, what they care about, what they\'re likely to push back on, and what you want them to walk away deciding or doing.',
      "Push on the pushback — ask Claude to argue the other side or play a skeptical audience member for a minute, so you're not walking in only having heard your own argument back to you.",
    ],
    copyBlocks: [{
      label: 'Prompt for meeting strategy',
      text: `I need to present this research/report at a meeting. Help me prepare.

Who's in the room and what they care about: [AUDIENCE]
What I want them to decide or do afterward: [YOUR GOAL]

Please:
1. Suggest a clear structure for presenting this (opening, key points, close)
2. Predict the toughest questions or pushback I'm likely to get, and help me prepare answers
3. Play a skeptical audience member for a minute so I can practice responding

Keep this grounded in the research we already discussed above.`,
    }],
    checkpoint: "You have a presentation structure and at least one tough question you've already practiced answering.",
  },
  {
    id: 'build-slides',
    title: "Turn it into an actual slide deck",
    blurb: "Ask Claude to build the presentation file itself, right in the chat.",
    body: [
      "Still in the same Use Claude chat — ask Claude to build the presentation itself as an HTML slide deck. Claude can create this as a file you view right there in the chat window, not just a text outline.",
      "Once it's built, ask for changes the normal way — \"make slide 3 shorter,\" \"add a slide comparing the two options,\" \"make the title slide bigger text.\" Claude will update the same file rather than starting over.",
    ],
    copyBlocks: [{
      label: 'Prompt to build the slide deck',
      text: `Based on everything we've discussed, please build me a slide deck for this presentation as an HTML artifact I can view here in the chat — one slide per screen, clean and readable, using the structure we agreed on above (opening, key points, close).

Keep each slide short — headline and a few supporting points, not paragraphs. I'll ask for edits after I see the first version.`,
    }],
    checkpoint: 'Claude has produced a slide deck file in the chat, and you\'ve asked for at least one real revision to it.',
  },
  {
    id: 'wrap-up',
    title: 'Bring it all together',
    blurb: "Report, meeting prep, and slides — all from one topic, one chat.",
    body: [
      "You now have three things from one piece of research: a written report or documentation piece, a meeting strategy with anticipated questions, and a slide deck — all traceable back to the same Use Claude chat, so nothing had to be re-explained along the way.",
      "If any of it needs to leave the platform (emailed, printed, shared with someone who doesn't have an account), download or copy it out now — the report from AI Content Creation / Document Studio, the slides from the Use Claude chat.",
      "Next time you have a real research-to-meeting task, you can skip straight back to step one — the same three-tool path works for any topic.",
    ],
    checkpoint: "You have all three outputs — report, meeting prep notes, and slide deck — and know where each one lives.",
  },
];

const TOTAL_STEPS = STEPS.length;

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text).catch(() => {});
        setCopied(true);
        setTimeout(() => setCopied(false), 1400);
      }}
      className="flex items-center gap-1 rounded-md border border-amber-300 px-2 py-1 text-[11px] font-bold text-amber-700 hover:bg-amber-100"
    >
      {copied ? <CheckCheck className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}

const ResearchReportsMeetingsGuidePage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const userId = user?.id ?? null;

  const [done, setDone] = useState<Set<string>>(new Set());
  const [openStep, setOpenStep] = useState<string>(STEPS[0].id);
  const [loaded, setLoaded] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const lsKey = `tutorial:${TRACK}`;

  useEffect(() => {
    try {
      const raw = localStorage.getItem(lsKey);
      if (raw) setDone(new Set<string>(JSON.parse(raw).completed ?? []));
    } catch { /* corrupt cache is not worth failing over */ }
    setLoaded(true);
  }, [lsKey]);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('tutorial_progress')
        .select('completed_steps')
        .eq('user_id', userId)
        .eq('track', TRACK)
        .maybeSingle();
      if (cancelled || !data) return;
      setDone(prev => new Set<string>([...prev, ...(data.completed_steps ?? [])]));
    })();
    return () => { cancelled = true; };
  }, [userId]);

  const persist = useCallback((nextDone: Set<string>) => {
    try {
      localStorage.setItem(lsKey, JSON.stringify({ completed: [...nextDone], updated: Date.now() }));
    } catch { /* private browsing, quota — progress still works in memory */ }
    if (!userId) return;
    setSyncing(true);
    supabase
      .from('tutorial_progress')
      .upsert({
        user_id: userId,
        track: TRACK,
        completed_steps: [...nextDone],
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id,track' })
      .then(() => setSyncing(false), () => setSyncing(false));
  }, [lsKey, userId]);

  const firstIncompleteIndex = useCallback((): number => {
    const idx = STEPS.findIndex(s => !done.has(s.id));
    return idx === -1 ? STEPS.length : idx;
  }, [done]);

  const isUnlocked = (index: number) => index <= firstIncompleteIndex();

  const markDone = (stepId: string) => {
    const next = new Set(done);
    next.add(stepId);
    setDone(next);
    persist(next);
  };

  const doneCount = STEPS.filter(s => done.has(s.id)).length;
  const pct = Math.min(100, Math.round((doneCount / TOTAL_STEPS) * 100));

  if (!loaded) {
    return (
      <AppLayout>
        <div className="flex h-64 items-center justify-center text-gray-400">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="mx-auto max-w-4xl px-4 pb-24 pt-6">

        {/* header */}
        <div className="mb-6 rounded-2xl bg-gradient-to-br from-slate-900 to-slate-800 p-6 text-white">
          <p className="text-xs font-bold uppercase tracking-widest text-cyan-300">For Team Members</p>
          <h1 className="mt-1 text-3xl font-extrabold">Maji Mazuri Onboarding Activity</h1>
          <p className="mt-1 max-w-xl text-sm text-slate-300">
            One real topic, carried through five steps: research and brainstorm it in Use Claude,
            write it up in AI Content Creation, prepare your meeting strategy, and have Claude
            build the slide deck — all in the same chat, so nothing gets re-explained twice.
          </p>

          <div className="mt-5">
            <div className="mb-1.5 flex items-center justify-between text-xs text-slate-400">
              <span>{doneCount} of {TOTAL_STEPS} steps complete</span>
              <span className="flex items-center gap-1.5">
                {syncing && <Loader2 className="h-3 w-3 animate-spin" />}
                {pct}%
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-700">
              <div className="h-full rounded-full bg-gradient-to-r from-amber-400 to-cyan-400 transition-all duration-500" style={{ width: `${pct}%` }} />
            </div>
          </div>
        </div>

        {/* steps */}
        {STEPS.map((step, idx) => {
          const unlocked = isUnlocked(idx);
          const isDone = done.has(step.id);
          const open = unlocked && openStep === step.id;

          return (
            <div key={step.id} className="mb-4 overflow-hidden rounded-2xl border border-gray-200 bg-white">
              <button
                onClick={() => unlocked && setOpenStep(open ? '' : step.id)}
                disabled={!unlocked}
                className={`flex w-full items-center gap-4 p-5 text-left transition-colors ${unlocked ? 'hover:bg-gray-50' : 'cursor-not-allowed opacity-60'}`}
              >
                <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-lg font-extrabold ${
                  isDone ? 'bg-green-600 text-white' : unlocked ? 'bg-amber-100 text-amber-800' : 'bg-gray-100 text-gray-400'}`}>
                  {isDone ? <Check className="h-6 w-6" /> : unlocked ? idx + 1 : <Lock className="h-5 w-5" />}
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="text-lg font-bold text-gray-900">{step.title}</h2>
                  <p className="truncate text-sm text-gray-500">{step.blurb}</p>
                  {!unlocked && <p className="mt-1 text-xs font-semibold text-gray-400">Finish the previous step to unlock</p>}
                </div>
                {unlocked && (open ? <ChevronDown className="h-5 w-5 text-gray-400" /> : <ChevronRight className="h-5 w-5 text-gray-400" />)}
              </button>

              {open && (
                <div className="border-t border-gray-100 p-5">
                  <div className="mb-4 space-y-2.5 text-sm leading-relaxed text-gray-700">
                    {step.body.map((p, i) => <p key={i}>{p}</p>)}
                  </div>

                  {step.copyBlocks?.map((cb, i) => (
                    <div key={i} className="mb-4 overflow-hidden rounded-lg border border-amber-200 bg-amber-50">
                      <div className="flex items-center justify-between px-3 py-2">
                        <span className="text-[10px] font-bold uppercase tracking-wide text-amber-700">{cb.label}</span>
                        <CopyButton text={cb.text} />
                      </div>
                      <pre className="whitespace-pre-wrap break-words px-3 pb-3 font-mono text-[13px] leading-relaxed text-gray-800">{cb.text}</pre>
                    </div>
                  ))}

                  <div className="flex items-start gap-2 rounded-lg bg-teal-50 p-3 text-sm text-teal-900">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-teal-600" />
                    <span><b className="font-bold">You'll know it worked when</b> — {step.checkpoint}</span>
                  </div>

                  {!isDone && (
                    <button
                      onClick={() => markDone(step.id)}
                      className="mt-4 rounded-lg bg-slate-900 px-4 py-2 text-sm font-bold text-white hover:bg-slate-800"
                    >
                      Mark this step done
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {doneCount === TOTAL_STEPS && (
          <div className="mt-2 rounded-2xl border border-green-200 bg-green-50 p-5 text-center">
            <p className="font-bold text-green-800">Report, meeting prep, and slides — all done.</p>
            <p className="mt-1 text-sm text-green-700">
              Use this same path — Use Claude → AI Content Creation → Use Claude — the next time you have real research to turn into a report and a presentation.
            </p>
          </div>
        )}

        <div className="mt-6">
          <button onClick={() => navigate('/tutorials')} className="flex items-center gap-1.5 text-sm font-semibold text-gray-500 hover:text-gray-800">
            <Compass className="h-4 w-4" /> All guides
          </button>
        </div>
      </div>
    </AppLayout>
  );
};

export default ResearchReportsMeetingsGuidePage;
