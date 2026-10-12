// src/pages/research/ResearchNewProjectPage.tsx
import React, { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../lib/supabaseClient';
import { chatText } from '../../lib/chatClient';
import {
  ChevronRight, ChevronLeft, Lightbulb, Shield, Globe,
  TrendingUp, Lock, Heart, CheckCircle, Plus, Trash2,
  Loader2, AlertTriangle, FlaskConical, Send
} from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────
interface GuidingQuestion {
  title:             string;
  domain:            string;
  research_question: string;
  icon:              string;
  color_hex:         string;
}

interface Proposal {
  title:                string;
  description:          string;
  submitter_name:       string;
  submitter_institution:string;
  sites:                string[];
  guiding_questions:    GuidingQuestion[];
}

const EMPTY_PROPOSAL: Proposal = {
  title:                 '',
  description:           '',
  submitter_name:        '',
  submitter_institution: '',
  sites:                 [''],
  guiding_questions:     [{ title: '', domain: '', research_question: '', icon: '🔬', color_hex: '#6366f1' }],
};

const DOMAIN_COLORS: Record<string, string> = {
  'Youth Impact':        '#2A7B88',
  'Community Impact':    '#5B7A6A',
  'Health':              '#C8963E',
  'Education':           '#6366f1',
  'Environment':         '#16a34a',
  'Economic Empowerment':'#d97706',
  'Technology':          '#7c3aed',
  'Other':               '#64748b',
};

const DOMAIN_ICONS: Record<string, string> = {
  'Youth Impact':        '🌱',
  'Community Impact':    '🏘️',
  'Health':              '🏥',
  'Education':           '📚',
  'Environment':         '🌍',
  'Economic Empowerment':'💡',
  'Technology':          '💻',
  'Other':               '🔬',
};

const STEPS = [
  { id: 1, label: 'Your Details',      icon: <FlaskConical size={16} /> },
  { id: 2, label: 'The Research',      icon: <Lightbulb size={16} />    },
  { id: 3, label: 'Communities',       icon: <Globe size={16} />        },
  { id: 4, label: 'Guiding Questions', icon: <TrendingUp size={16} />   },
  { id: 5, label: 'Equity Review',     icon: <Shield size={16} />       },
];

// ── Component ─────────────────────────────────────────────────────────────────
const ResearchNewProjectPage: React.FC = () => {
  const navigate   = useNavigate();
  const { user, session } = useAuth();

  const [step, setStep]           = useState(1);
  const [proposal, setProposal]   = useState<Proposal>(EMPTY_PROPOSAL);
  const [aiHint, setAiHint]       = useState('');
  const [hintLoading, setHintLoading] = useState(false);
  const [equityReview, setEquityReview] = useState('');
  const [reviewLoading, setReviewLoading] = useState(false);
  const [reviewPassed, setReviewPassed]   = useState<boolean | null>(null);
  const [submitting, setSubmitting]       = useState(false);
  const [submitted, setSubmitted]         = useState(false);
  const [error, setError]                 = useState('');

  // ── Helpers ────────────────────────────────────────────────────────────────
  const updateProposal = (patch: Partial<Proposal>) =>
    setProposal(prev => ({ ...prev, ...patch }));

  const updateSite = (i: number, val: string) => {
    const sites = [...proposal.sites];
    sites[i] = val;
    updateProposal({ sites });
  };

  const addSite = () => updateProposal({ sites: [...proposal.sites, ''] });

  const removeSite = (i: number) =>
    updateProposal({ sites: proposal.sites.filter((_, idx) => idx !== i) });

  const updateQuestion = (i: number, patch: Partial<GuidingQuestion>) => {
    const qs = [...proposal.guiding_questions];
    qs[i] = { ...qs[i], ...patch };
    if (patch.domain) {
      qs[i].color_hex = DOMAIN_COLORS[patch.domain] || '#6366f1';
      qs[i].icon      = DOMAIN_ICONS[patch.domain]  || '🔬';
    }
    updateProposal({ guiding_questions: qs });
  };

  const addQuestion = () =>
    updateProposal({
      guiding_questions: [
        ...proposal.guiding_questions,
        { title: '', domain: '', research_question: '', icon: '🔬', color_hex: '#6366f1' },
      ],
    });

  const removeQuestion = (i: number) =>
    updateProposal({ guiding_questions: proposal.guiding_questions.filter((_, idx) => idx !== i) });

  // ── AI hint for description ────────────────────────────────────────────────
  const getAiHint = useCallback(async () => {
    if (!proposal.description || proposal.description.length < 50) return;
    setHintLoading(true); setAiHint('');
    try {
      const hint = await chatText({
        page: 'ResearchNewProjectPage',
        system: `You are an equity-focused research advisor for the vAI Open Research Network. 
Your role is to help researchers strengthen their proposals so that youth in off-grid communities 
are empowered co-researchers, not subjects. Be brief, direct, and specific.`,
        messages: [{
          role: 'user',
          content: `A researcher has written this description for a proposed study:

"${proposal.description}"

In 3–4 sentences: (1) What's strongest about this from a youth empowerment perspective? 
(2) What is the biggest risk of exploitation or harm that needs addressing? 
(3) One concrete suggestion to make it more community-led.`,
        }],
        max_tokens: 350,
        temperature: 0.4,
      });
      setAiHint(hint);
    } catch (e) { console.error(e); }
    finally { setHintLoading(false); }
  }, [proposal.description]);

  // ── AI question suggestions ────────────────────────────────────────────────
  const suggestQuestions = useCallback(async () => {
    if (!proposal.description) return;
    setHintLoading(true);
    try {
      const raw = await chatText({
        page: 'ResearchNewProjectPage',
        system: 'You are a research methodologist. Respond ONLY with valid JSON — no markdown, no preamble.',
        messages: [{
          role: 'user',
          content: `Based on this research description, suggest 2 guiding questions. 
Return JSON array: [{"title":"short title","domain":"one of: Youth Impact|Community Impact|Health|Education|Environment|Economic Empowerment|Technology|Other","research_question":"full question sentence"}]

Description: "${proposal.description}"`,
        }],
        max_tokens: 400,
        temperature: 0.3,
      });
      const suggestions = JSON.parse(raw.trim().replace(/^```json|```$/g, ''));
      if (Array.isArray(suggestions)) {
        const newQs = suggestions.map((s: any) => ({
          title:             s.title || '',
          domain:            s.domain || 'Other',
          research_question: s.research_question || '',
          icon:              DOMAIN_ICONS[s.domain] || '🔬',
          color_hex:         DOMAIN_COLORS[s.domain] || '#6366f1',
        }));
        updateProposal({ guiding_questions: [...proposal.guiding_questions, ...newQs] });
      }
    } catch (e) { console.error(e); }
    finally { setHintLoading(false); }
  }, [proposal.description, proposal.guiding_questions]);

  // ── Equity review ──────────────────────────────────────────────────────────
  const runEquityReview = useCallback(async () => {
    setReviewLoading(true); setEquityReview(''); setReviewPassed(null);
    try {
      const questionsText = proposal.guiding_questions
        .filter(q => q.research_question)
        .map((q, i) => `${i + 1}. [${q.domain}] ${q.title}: "${q.research_question}"`)
        .join('\n');

      const review = await chatText({
        page: 'ResearchNewProjectPage',
        system: `You are the vAI equity pre-screener. You assess research proposals before they go to the board.
Be honest and direct. Youth empowerment is non-negotiable.`,
        messages: [{
          role: 'user',
          content: `Pre-screen this research proposal for equity, empowerment, and harm prevention.

Title: ${proposal.title}
Description: ${proposal.description}
Communities: ${proposal.sites.filter(Boolean).join(', ')}
Guiding questions:
${questionsText}

Give a brief assessment (4–6 sentences) covering:
- Does this genuinely empower youth as co-researchers?
- Are there exploitation risks?
- Will it produce real community benefit?
- Are there identity/privacy/harm concerns?

End your response with exactly one line: VERDICT: READY FOR BOARD or VERDICT: NEEDS REVISION`,
        }],
        max_tokens: 500,
        temperature: 0.3,
      });

      setEquityReview(review);
      setReviewPassed(review.includes('VERDICT: READY FOR BOARD'));
    } catch (e) { console.error(e); setEquityReview('Review failed. Please try again.'); }
    finally { setReviewLoading(false); }
  }, [proposal]);

  // ── Submit ─────────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!session?.access_token) { setError('Please sign in to submit.'); return; }
    setSubmitting(true); setError('');
    try {
      const res = await fetch('/api/research-submit', {
        method: 'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(proposal),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Submission failed');
      setSubmitted(true);
    } catch (e: any) { setError(e.message); }
    finally { setSubmitting(false); }
  };

  // ── Step validation ────────────────────────────────────────────────────────
  const canAdvance = () => {
    if (step === 1) return proposal.submitter_name.trim() && proposal.submitter_institution.trim();
    if (step === 2) return proposal.title.trim().length > 10 && proposal.description.trim().length > 80;
    if (step === 3) return proposal.sites.some(s => s.trim());
    if (step === 4) return proposal.guiding_questions.some(q => q.research_question.trim().length > 10);
    if (step === 5) return reviewPassed === true;
    return false;
  };

  // ── Success screen ─────────────────────────────────────────────────────────
  if (submitted) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <div className="max-w-lg w-full bg-white rounded-2xl shadow-lg p-10 text-center">
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-5">
          <CheckCircle size={32} className="text-green-600" />
        </div>
        <h2 className="text-2xl font-bold text-gray-900 mb-3">Proposal Submitted</h2>
        <p className="text-gray-500 leading-relaxed mb-2">
          Your proposal has been sent to the vAI Research Review Board along with a full AI equity review.
          Board members will receive a detailed memo covering youth empowerment, non-exploitation safeguards,
          broader impact, scalability, identity protection, and harm prevention.
        </p>
        <p className="text-sm text-gray-400 mb-8">You will be contacted when the board has reviewed it.</p>
        <button onClick={() => navigate('/research/ai-learning-lab')}
          className="px-6 py-3 bg-indigo-600 text-white rounded-xl font-semibold text-sm hover:bg-indigo-700 transition-colors">
          Back to Research
        </button>
      </div>
    </div>
  );

  // ── Main render ────────────────────────────────────────────────────────────
  const inputCls = "w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-800 focus:outline-hidden focus:ring-2 focus:ring-indigo-300 focus:border-transparent bg-white";
  const labelCls = "block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5";

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto px-4 py-10">

        {/* Header */}
        <div className="mb-8">
          <div className="text-xs font-bold text-indigo-500 uppercase tracking-widest mb-1">vAI Open Research Network</div>
          <h1 className="text-2xl font-bold text-gray-900 mb-1">Propose a Research Project</h1>
          <p className="text-sm text-gray-500 leading-relaxed">
            All proposals are AI-reviewed and board-approved before activation.
            Youth participants are co-researchers, not subjects.
          </p>
        </div>

        {/* Step indicator */}
        <div className="flex items-center gap-1 mb-8">
          {STEPS.map((s, i) => (
            <React.Fragment key={s.id}>
              <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
                step === s.id
                  ? 'bg-indigo-600 text-white'
                  : step > s.id
                  ? 'bg-indigo-100 text-indigo-600'
                  : 'bg-gray-100 text-gray-400'
              }`}>
                {step > s.id ? <CheckCircle size={12} /> : s.icon}
                <span className="hidden sm:inline">{s.label}</span>
              </div>
              {i < STEPS.length - 1 && (
                <div className={`flex-1 h-px ${step > s.id ? 'bg-indigo-200' : 'bg-gray-200'}`} />
              )}
            </React.Fragment>
          ))}
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-xs border border-gray-100 p-7 mb-5">

          {/* Step 1: Your details */}
          {step === 1 && (
            <div className="stack-y-5">
              <h2 className="font-bold text-gray-800 text-lg">Your Details</h2>
              <div>
                <label className={labelCls}>Your Name</label>
                <input className={inputCls} value={proposal.submitter_name}
                  onChange={e => updateProposal({ submitter_name: e.target.value })}
                  placeholder="Dr. Jane Smith" />
              </div>
              <div>
                <label className={labelCls}>Institution or Organisation</label>
                <input className={inputCls} value={proposal.submitter_institution}
                  onChange={e => updateProposal({ submitter_institution: e.target.value })}
                  placeholder="University of Dayton / Independent Researcher" />
              </div>
              <div className="p-4 bg-indigo-50 rounded-xl border border-indigo-100">
                <div className="flex gap-2 items-start">
                  <Shield size={16} className="text-indigo-500 mt-0.5 flex-shrink-0" />
                  <p className="text-xs text-indigo-700 leading-relaxed">
                    All proposals are reviewed by the vAI Research Board. Only approved projects
                    become active. The board prioritises research that empowers youth communities
                    and produces lasting local benefit.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Step 2: The research */}
          {step === 2 && (
            <div className="stack-y-5">
              <h2 className="font-bold text-gray-800 text-lg">The Research</h2>
              <div>
                <label className={labelCls}>Research Title</label>
                <input className={inputCls} value={proposal.title}
                  onChange={e => updateProposal({ title: e.target.value })}
                  placeholder="e.g. Youth-Led Climate Monitoring in Off-Grid Communities" />
              </div>
              <div>
                <label className={labelCls}>Description</label>
                <textarea className={`${inputCls} resize-none`} rows={6}
                  value={proposal.description}
                  onChange={e => updateProposal({ description: e.target.value })}
                  placeholder="Describe the research: what you want to learn, why it matters to the community, and how youth will lead the inquiry — not just participate in it." />
                <div className="flex justify-between items-center mt-1.5">
                  <span className="text-xs text-gray-400">{proposal.description.length} chars · min 80</span>
                  <button onClick={getAiHint} disabled={hintLoading || proposal.description.length < 50}
                    className="text-xs font-semibold text-indigo-500 hover:text-indigo-700 disabled:opacity-40 flex items-center gap-1 transition-colors">
                    {hintLoading ? <Loader2 size={12} className="animate-spin" /> : <Lightbulb size={12} />}
                    Get AI feedback
                  </button>
                </div>
              </div>
              {aiHint && (
                <div className="p-4 bg-amber-50 border border-amber-100 rounded-xl">
                  <div className="text-xs font-bold text-amber-600 uppercase tracking-wider mb-1.5">AI Advisor Feedback</div>
                  <p className="text-sm text-amber-800 leading-relaxed">{aiHint}</p>
                </div>
              )}
            </div>
          )}

          {/* Step 3: Communities */}
          {step === 3 && (
            <div className="stack-y-5">
              <h2 className="font-bold text-gray-800 text-lg">Target Communities</h2>
              <p className="text-sm text-gray-500 leading-relaxed">
                Which communities would participate? Remember — communities choose to join approved studies.
                They are never assigned.
              </p>
              <div className="stack-y-2.5">
                {proposal.sites.map((site, i) => (
                  <div key={i} className="flex gap-2">
                    <input className={`${inputCls} flex-1`} value={site}
                      onChange={e => updateSite(i, e.target.value)}
                      placeholder="e.g. Oloibiri, Nigeria" />
                    {proposal.sites.length > 1 && (
                      <button onClick={() => removeSite(i)}
                        className="p-2.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                        <Trash2 size={15} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <button onClick={addSite}
                className="flex items-center gap-1.5 text-sm font-semibold text-indigo-500 hover:text-indigo-700 transition-colors">
                <Plus size={15} /> Add community
              </button>
              <div className="p-4 bg-green-50 rounded-xl border border-green-100">
                <div className="flex gap-2 items-start">
                  <Globe size={15} className="text-green-600 mt-0.5 flex-shrink-0" />
                  <p className="text-xs text-green-700 leading-relaxed">
                    The vAI network currently operates in Oloibiri and Ibiade, Nigeria.
                    The iGiTREE network operates in Kigali, Accra, and Dar es Salaam.
                    You may propose research in these or other communities — community consent is always required.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Step 4: Guiding questions */}
          {step === 4 && (
            <div className="stack-y-5">
              <div className="flex items-center justify-between">
                <h2 className="font-bold text-gray-800 text-lg">Guiding Questions</h2>
                <button onClick={suggestQuestions} disabled={hintLoading}
                  className="flex items-center gap-1.5 text-xs font-semibold text-indigo-500 hover:text-indigo-700 disabled:opacity-40 transition-colors">
                  {hintLoading ? <Loader2 size={12} className="animate-spin" /> : <Lightbulb size={12} />}
                  AI suggest questions
                </button>
              </div>
              <p className="text-sm text-gray-500">
                What specific questions will the research answer? Each should be answerable through community participation.
              </p>
              <div className="stack-y-4">
                {proposal.guiding_questions.map((q, i) => (
                  <div key={i} style={{ borderLeft: `3px solid ${q.color_hex}` }}
                    className="pl-4 stack-y-2.5 pb-4 border-b border-gray-50 last:border-0">
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-bold text-gray-400">Question {i + 1}</span>
                      {proposal.guiding_questions.length > 1 && (
                        <button onClick={() => removeQuestion(i)}
                          className="p-1 text-red-400 hover:text-red-600 transition-colors">
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                    <select className={inputCls} value={q.domain}
                      onChange={e => updateQuestion(i, { domain: e.target.value })}>
                      <option value="">Select domain…</option>
                      {Object.keys(DOMAIN_COLORS).map(d => (
                        <option key={d} value={d}>{DOMAIN_ICONS[d]} {d}</option>
                      ))}
                    </select>
                    <input className={inputCls} value={q.title}
                      onChange={e => updateQuestion(i, { title: e.target.value })}
                      placeholder="Short title (e.g. Learning Outcomes Study)" />
                    <textarea className={`${inputCls} resize-none`} rows={2} value={q.research_question}
                      onChange={e => updateQuestion(i, { research_question: e.target.value })}
                      placeholder="Full research question (e.g. Does sustained engagement produce measurable gains in…?)" />
                  </div>
                ))}
              </div>
              <button onClick={addQuestion}
                className="flex items-center gap-1.5 text-sm font-semibold text-indigo-500 hover:text-indigo-700 transition-colors">
                <Plus size={15} /> Add question
              </button>
            </div>
          )}

          {/* Step 5: Equity review */}
          {step === 5 && (
            <div className="stack-y-5">
              <h2 className="font-bold text-gray-800 text-lg">Equity Pre-Screen</h2>
              <p className="text-sm text-gray-500 leading-relaxed">
                Before your proposal goes to the board, Claude reviews it for youth empowerment,
                exploitation risk, community benefit, and harm prevention. You must pass this
                screen before submitting.
              </p>

              {!equityReview && (
                <button onClick={runEquityReview} disabled={reviewLoading}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-indigo-600 text-white text-sm font-bold hover:bg-indigo-700 disabled:opacity-60 transition-colors">
                  {reviewLoading
                    ? <><Loader2 size={16} className="animate-spin" /> Running equity review…</>
                    : <><Shield size={16} /> Run AI Equity Review</>}
                </button>
              )}

              {equityReview && (
                <>
                  <div className={`p-4 rounded-xl border ${
                    reviewPassed
                      ? 'bg-green-50 border-green-200'
                      : 'bg-amber-50 border-amber-200'
                  }`}>
                    <div className={`text-xs font-bold uppercase tracking-wider mb-2 ${
                      reviewPassed ? 'text-green-600' : 'text-amber-600'
                    }`}>
                      {reviewPassed ? '✓ Ready for Board Review' : '⚠ Needs Revision'}
                    </div>
                    <p className="text-sm leading-relaxed text-gray-700 whitespace-pre-line">
                      {equityReview.replace(/VERDICT:.*$/, '').trim()}
                    </p>
                  </div>

                  {!reviewPassed && (
                    <div className="stack-y-3">
                      <p className="text-xs text-gray-500">
                        Revise your description or questions based on the feedback above, then re-run the review.
                      </p>
                      <div className="flex gap-2">
                        <button onClick={() => { setStep(2); setEquityReview(''); setReviewPassed(null); }}
                          className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors">
                          Edit Description
                        </button>
                        <button onClick={() => { setStep(4); setEquityReview(''); setReviewPassed(null); }}
                          className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors">
                          Edit Questions
                        </button>
                      </div>
                      <button onClick={runEquityReview} disabled={reviewLoading}
                        className="w-full py-2.5 rounded-xl bg-indigo-50 border border-indigo-200 text-sm font-semibold text-indigo-600 hover:bg-indigo-100 disabled:opacity-60 transition-colors flex items-center justify-center gap-2">
                        {reviewLoading ? <Loader2 size={14} className="animate-spin" /> : <Shield size={14} />}
                        Re-run review
                      </button>
                    </div>
                  )}

                  {reviewPassed && (
                    <div className="p-4 bg-indigo-50 rounded-xl border border-indigo-100">
                      <div className="flex gap-2 items-start">
                        <Lock size={14} className="text-indigo-500 mt-0.5 flex-shrink-0" />
                        <p className="text-xs text-indigo-700 leading-relaxed">
                          Submitting will send your full proposal plus a detailed AI review memo to all board members.
                          The memo covers youth empowerment, non-exploitation safeguards, broader impact, scalability,
                          identity protection, and harm prevention. You will be notified of the board's decision.
                        </p>
                      </div>
                    </div>
                  )}
                </>
              )}

              {error && (
                <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl">
                  <AlertTriangle size={15} className="text-red-500 flex-shrink-0" />
                  <p className="text-sm text-red-600">{error}</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Navigation */}
        <div className="flex gap-3">
          {step > 1 && (
            <button onClick={() => setStep(s => s - 1)}
              className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors">
              <ChevronLeft size={15} /> Back
            </button>
          )}
          <div className="flex-1" />
          {step < 5 ? (
            <button onClick={() => setStep(s => s + 1)} disabled={!canAdvance()}
              className="flex items-center gap-1.5 px-6 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-bold hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
              Next <ChevronRight size={15} />
            </button>
          ) : (
            <button onClick={handleSubmit}
              disabled={!reviewPassed || submitting}
              className="flex items-center gap-2 px-7 py-2.5 rounded-xl bg-green-600 text-white text-sm font-bold hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
              {submitting
                ? <><Loader2 size={15} className="animate-spin" /> Submitting…</>
                : <><Send size={15} /> Submit to Board</>}
            </button>
          )}
        </div>

      </div>
    </div>
  );
};

export default ResearchNewProjectPage;
