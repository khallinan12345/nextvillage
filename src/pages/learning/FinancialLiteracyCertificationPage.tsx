// src/pages/learning/FinancialLiteracyCertificationPage.tsx
//
// Financial Literacy — certification page.
//
// Same flow as AIReadySkillsCertificationPage (overview → define context →
// independent written challenge → evaluation → certificate), with:
// - Assessments read from certification_assessments where
//   certification_name = 'Financial Literacy' (one row per area in
//   src/lib/financialLiteracy.ts; seeded by the migration).
// - Challenges built around REAL AMOUNTS in the learner's currency, with at
//   least one calculation; the evaluator recomputes the learner's math.
// - Scores stored in dashboard.rubric_scores (jsonb, keyed by assessment slug)
//   on one row per learner (activity = 'Financial Literacy Certification').
// - Certificate eligibility = Proficient (2)+ on every assessment.

import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import {
  ArrowLeft, ArrowRight, Award, Brain, CheckCircle, ClipboardList, Download,
  GraduationCap, Loader2, AlertCircle, RefreshCw, Sparkles, Store, Trophy,
  Volume2, VolumeX, Wand2, ShieldCheck,
} from 'lucide-react';

import AppLayout from '../../components/layout/AppLayout';
import { VoiceFallback } from '../../components/VoiceFallback';
import { supabase } from '../../lib/supabaseClient';
import { chatText, chatJSON } from '../../lib/chatClient';
import { upsertEvaluationCriterion } from '../../lib/evaluations';
import { useBranding, addBrandingToPDF } from '../../lib/useBranding';
import { useAuth } from '../../hooks/useAuth';
import { useVoice } from '../../hooks/useVoice';
import {
  CertContext, FINLIT_CATEGORY, FINLIT_CERT_ACTIVITY, FINLIT_CERT_NAME, FINLIT_CHAT_PAGE,
  Levels, PersonalityBaselineLike, SCORE_LABELS,
  buildCertChallengePrompt, buildCertEvaluationPrompt, getFinLitAreaBySubCategory,
  getFinLitLocale, slug,
} from '../../lib/financialLiteracy';

// ─────────────────────────────────────────────────────────────────────────────
// Types & helpers
// ─────────────────────────────────────────────────────────────────────────────
interface Assessment {
  id: string;
  assessment_name: string;
  description: string;
  certification_prompt: string;
  certification_level0_metric: string;
  certification_level1_metric: string;
  certification_level2_metric: string;
  certification_level3_metric: string;
}

type ScoreMap = Record<string, { score: number; evidence: string; updated_at?: string }>;
type View = 'overview' | 'define-context' | 'take' | 'results' | 'certificate';

const levelsOf = (a: Assessment): Levels => [
  a.certification_level0_metric,
  a.certification_level1_metric,
  a.certification_level2_metric,
  a.certification_level3_metric,
];

const emptyContext: CertContext = { topic: '', setting: '', constraints: '', audience: '', livelihood: '' };

const markdown = {
  h2: ({ children }: any) => <h2 className="text-lg font-bold text-ink mb-2 mt-4">{children}</h2>,
  h3: ({ children }: any) => <h3 className="font-semibold text-ink mb-2 mt-3">{children}</h3>,
  p: ({ children }: any) => <p className="text-ink mb-3 leading-relaxed">{children}</p>,
  strong: ({ children }: any) => <strong className="font-semibold text-gray-900">{children}</strong>,
  ul: ({ children }: any) => <ul className="list-disc ml-5 space-y-1 mb-3 text-ink">{children}</ul>,
  ol: ({ children }: any) => <ol className="list-decimal ml-5 space-y-2 mb-3 text-ink">{children}</ol>,
  a: ({ href, children }: any) => <Link to={href || '#'} className="text-accent hover:underline font-medium">{children}</Link>,
};

// Builds "1. Label\n\n[Answer Here]" blocks from the challenge's numbered questions.
const buildAnswerTemplate = (prompt: string): string => {
  const labels = prompt
    .split('\n')
    .map(l => l.match(/^\s*(\d+)[.)]\s+\*{0,2}([^*\n—–:]+)/))
    .filter((m): m is RegExpMatchArray => !!m)
    .map(m => m[2].trim());
  const list = labels.length ? labels : ['', '', '', ''];
  return list.map((label, i) => `${i + 1}. ${label}\n\n[Show your working and reasons here]\n\n`).join('\n');
};

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────
const FinancialLiteracyCertificationPage: React.FC = () => {
  const { user } = useAuth();
  const branding = useBranding();

  const [view, setView] = useState<View>('overview');
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [scores, setScores] = useState<ScoreMap>({});
  const [certRowId, setCertRowId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Assessment | null>(null);

  const [country, setCountry] = useState<string | null>(null);
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [baseline, setBaseline] = useState<PersonalityBaselineLike | null>(null);
  const [commLevel, setCommLevel] = useState(1);
  const locale = useMemo(() => getFinLitLocale(country), [country]);

  const [ctx, setCtx] = useState<CertContext>(emptyContext);
  const [challenge, setChallenge] = useState('');
  const [response, setResponse] = useState('');
  const [result, setResult] = useState<{ score: number; evidence: string } | null>(null);
  const [advice, setAdvice] = useState('');
  const [certificateName, setCertificateName] = useState('');

  const [loading, setLoading] = useState(false);
  const [isImproving, setIsImproving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [voiceMode, setVoiceMode] = useState<'english' | 'pidgin'>('english');
  const { speak, cancel, speaking, fallbackText, clearFallback } = useVoice(voiceMode === 'pidgin');

  // ── Load ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!user?.id) return;
    (async () => {
      const [{ data: prof }, { data: b }, { data: rows, error: aErr }] = await Promise.all([
        supabase.from('profiles').select('country, organization_id').eq('id', user.id).single(),
        supabase.from('user_personality_baseline')
          .select('communication_strategy, learning_strategy, communication_level')
          .eq('user_id', user.id).maybeSingle(),
        supabase.from('certification_assessments').select('*')
          .eq('certification_name', FINLIT_CERT_NAME).order('assessment_name'),
      ]);
      setCountry(prof?.country ?? null);
      setOrganizationId(prof?.organization_id ?? null);
      setVoiceMode(prof?.country === 'Nigeria' ? 'pidgin' : 'english');
      if (b) {
        setBaseline({ communicationStrategy: b.communication_strategy ?? null, learningStrategy: b.learning_strategy ?? null });
        setCommLevel(b.communication_level ?? 1);
      }
      if (aErr) setError('Failed to load the certification. Please refresh the page.');
      setAssessments(rows ?? []);
      await loadScores();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const loadScores = async () => {
    if (!user?.id) return;
    const { data } = await supabase
      .from('dashboard')
      .select('id, rubric_scores')
      .eq('user_id', user.id)
      .eq('activity', FINLIT_CERT_ACTIVITY)
      .maybeSingle();
    setCertRowId(data?.id ?? null);
    setScores((data?.rubric_scores ?? {}) as ScoreMap);
  };

  const scoreOf = (a: Assessment) => scores[slug(a.assessment_name)]?.score ?? null;
  const allPassed = assessments.length > 0 && assessments.every(a => (scoreOf(a) ?? -1) >= 2);
  const remaining = assessments.filter(a => (scoreOf(a) ?? -1) < 2);

  // ── Challenge ────────────────────────────────────────────────────────────
  const startAssessment = (a: Assessment) => {
    setSelected(a);
    setResult(null);
    setAdvice('');
    setError(null);
    setView('define-context');
  };

  const generateChallenge = async () => {
    if (!selected) return;
    if (!ctx.topic || !ctx.setting || !ctx.constraints || !ctx.audience) {
      setError('Please fill in Topic, Setting, Constraints, and Audience.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const text = await chatText({
        page: FINLIT_CHAT_PAGE,
        system: 'You design fair, contextualised financial literacy certification challenges. Always honour the communication level — it controls vocabulary AND number difficulty.',
        messages: [{
          role: 'user',
          content: buildCertChallengePrompt({
            assessmentName: selected.assessment_name,
            anchorPrompt: selected.certification_prompt,
            levels: levelsOf(selected),
            ctx, locale, communicationLevel: commLevel, baseline,
          }),
        }],
        max_tokens: 1000,
        temperature: 0.7,
      });
      const finalText = text?.trim() || selected.certification_prompt;
      setChallenge(finalText);
      setResponse(buildAnswerTemplate(finalText));
      setView('take');
    } catch (err) {
      console.error('[FinLit Cert] Challenge generation failed:', err);
      setError('Could not prepare your challenge. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const improveEnglish = async () => {
    if (!response.trim() || isImproving) return;
    setIsImproving(true);
    try {
      const r = await chatJSON({
        page: FINLIT_CHAT_PAGE,
        system: 'You are an English language coach. Return only valid JSON.',
        messages: [{
          role: 'user',
          content: `A student in ${locale.country} wrote this certification answer:
"""${response}"""
Fix grammar and spelling only. Keep every idea, the numbered structure, and every line break.
NEVER change, add, or correct any number, amount, or calculation — copy them exactly, even if wrong.
Return ONLY JSON: {"improved_text": "..."}`,
        }],
        max_tokens: 1500,
        temperature: 0.2,
      });
      if (r?.improved_text) setResponse(r.improved_text);
    } catch (err) {
      console.error('[FinLit Cert] Improve English failed:', err);
    } finally {
      setIsImproving(false);
    }
  };

  // ── Evaluate & save ──────────────────────────────────────────────────────
  const recommendModules = async (assessmentName: string) => {
    let q = supabase
      .from('learning_modules')
      .select('learning_module_id, title, description')
      .eq('category', FINLIT_CATEGORY)
      .eq('sub_category', assessmentName)
      .eq('public', 1)
      .limit(3);
    q = organizationId ? q.or(`organization_id.eq.${organizationId},organization_id.is.null`) : q.is('organization_id', null);
    const { data } = await q;
    return data ?? [];
  };

  const saveScore = async (a: Assessment, score: number, evidence: string) => {
    if (!user?.id) return;
    const key = slug(a.assessment_name);
    const next: ScoreMap = { ...scores, [key]: { score, evidence, updated_at: new Date().toISOString() } };
    const eligible = assessments.every(x => (next[slug(x.assessment_name)]?.score ?? -1) >= 2);
    const payload = {
      rubric_scores: next,
      certification_evaluation_score: eligible ? Math.min(...assessments.map(x => next[slug(x.assessment_name)].score)) : null,
      progress: eligible ? 'completed' : 'started',
      updated_at: new Date().toISOString(),
    };

    let rowId = certRowId;
    if (rowId) {
      const { error: e } = await supabase.from('dashboard').update(payload).eq('id', rowId);
      if (e) throw e;
    } else {
      const { data, error: e } = await supabase
        .from('dashboard')
        .insert({ user_id: user.id, activity: FINLIT_CERT_ACTIVITY, category_activity: 'Certification', ...payload })
        .select('id')
        .single();
      if (e) throw e;
      rowId = data.id;
      setCertRowId(rowId);
    }
    setScores(next);

    if (rowId) {
      upsertEvaluationCriterion(user.id, rowId, 'financial_literacy_certification',
        { key, label: a.assessment_name, score, evidence }, 3)
        .catch(err => console.warn('[FinLit Cert] evaluations dual-write failed:', err));
    }
  };

  const submit = async () => {
    if (!selected || !response.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const r = await chatJSON({
        page: FINLIT_CHAT_PAGE,
        system: 'You are a fair financial literacy assessor. Recompute every calculation. Return only valid JSON with a markdown "evidence" field.',
        messages: [{
          role: 'user',
          content: buildCertEvaluationPrompt({
            assessmentName: selected.assessment_name,
            description: selected.description,
            challenge, response, levels: levelsOf(selected), ctx, locale,
          }),
        }],
        max_tokens: 1200,
        temperature: 0.2,
      });
      const score = Math.max(0, Math.min(3, Math.round(Number(r?.score) || 0)));
      const evidence = String(r?.evidence ?? '');
      await saveScore(selected, score, evidence);
      setResult({ score, evidence });

      // Advice + practice modules
      const levelHint = commLevel <= 1 ? 'Use very simple words and short sentences.' : 'Use clear, standard English.';
      const [adviceText, modules] = await Promise.all([
        chatText({
          page: FINLIT_CHAT_PAGE,
          system: 'You are an encouraging money coach for young learners.',
          messages: [{
            role: 'user',
            content: `A learner in ${locale.country} scored ${score}/3 (${SCORE_LABELS[score]}) on the Financial Literacy assessment "${selected.assessment_name}".
Assessor feedback:
${evidence}

Next level up is: ${score < 3 ? levelsOf(selected)[score + 1] : 'already at the top level'}.
Give ${score === 3 ? '3 points celebrating what they did and how to teach it to someone in their community' : '3–4 specific, practical steps to reach the next level, each with a small example in ' + locale.currencyName}.
${levelHint} Markdown bullets.`,
          }],
          max_tokens: 700,
          temperature: 0.6,
        }).catch(() => ''),
        score < 3 ? recommendModules(selected.assessment_name) : Promise.resolve([]),
      ]);

      let full = adviceText || '';
      if (modules.length) {
        full += '\n\n**📚 Practise with these activities:**\n\n' +
          modules.map((m: any, i: number) => `${i + 1}. **${m.title}** — ${m.description ?? ''}`).join('\n') +
          `\n\n[Open Financial Literacy practice →](/learning/financial-literacy?area=${getFinLitAreaBySubCategory(selected.assessment_name)?.id ?? ''})`;
      }
      setAdvice(full);

      if (score >= 2) {
        const confetti = await import('canvas-confetti').catch(() => null);
        confetti?.default?.({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
      }
      setView('results');
    } catch (err) {
      console.error('[FinLit Cert] Evaluation failed:', err);
      setError('Could not evaluate your response. Please try again — your answer is still here.');
    } finally {
      setLoading(false);
    }
  };

  // ── Certificate PDF ──────────────────────────────────────────────────────
  const generateCertificate = async () => {
    if (!allPassed || !certificateName.trim()) return;
    setGenerating(true);
    setError(null);
    try {
      const mod = await import('jspdf');
      const doc = new mod.jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
      const W = doc.internal.pageSize.getWidth();
      const H = doc.internal.pageSize.getHeight();
      const minScore = Math.min(...assessments.map(a => scoreOf(a) ?? 0));
      const level = SCORE_LABELS[minScore];
      const firstName = certificateName.trim().split(' ')[0];

      // Optional watermark — public/Skills_Financial_Literacy_Watermark.png
      try {
        const res = await fetch('/Skills_Financial_Literacy_Watermark.png');
        if (res.ok) {
          const blob = await res.blob();
          const b64 = await new Promise<string>((resolve, reject) => {
            const r = new FileReader();
            r.onloadend = () => resolve(r.result as string);
            r.onerror = () => reject(new Error('read failed'));
            r.readAsDataURL(blob);
          });
          doc.addImage(b64, 'PNG', (W - 180) / 2, (H - 126) / 2 + 5, 180, 126, undefined, 'NONE');
        }
      } catch { /* watermark is optional */ }

      doc.setLineWidth(3); doc.setDrawColor(138, 43, 226); doc.rect(10, 10, W - 20, H - 20);
      doc.setLineWidth(1); doc.setDrawColor(219, 112, 147); doc.rect(15, 15, W - 30, H - 30);

      doc.setFont('helvetica', 'bold'); doc.setFontSize(34); doc.setTextColor(138, 43, 226);
      doc.text('Financial Literacy Certification', W / 2, 30, { align: 'center' });
      doc.setFontSize(20); doc.setTextColor(80, 80, 80);
      doc.text(`Level of Achievement: ${level}`, W / 2, 42, { align: 'center' });
      doc.setFont('helvetica', 'normal'); doc.setFontSize(14);
      doc.text('This certificate is proudly presented to', W / 2, 53, { align: 'center' });
      doc.setFont('helvetica', 'bold'); doc.setFontSize(34); doc.setTextColor(0, 0, 0);
      doc.text(certificateName.trim(), W / 2, 66, { align: 'center' });

      doc.setFont('helvetica', 'italic'); doc.setFontSize(12); doc.setTextColor(60, 60, 60);
      const blurb =
        'This certification is aligned with the OECD/INFE Core Competencies Framework on Financial Literacy for Youth and with national financial inclusion priorities. The holder demonstrated, through independent written challenges set in their own community and currency, the ability to budget, save, borrow wisely, transact safely, and run a small enterprise at a profit.';
      const blurbLines = doc.splitTextToSize(blurb, W - 50);
      let y = 76;
      blurbLines.forEach((l: string) => { doc.text(l, W / 2, y, { align: 'center' }); y += 4.8; });

      // Competency statements generated in parallel
      const statements = await Promise.all(assessments.map(async a => {
        const s = scores[slug(a.assessment_name)];
        try {
          const t = await chatText({
            page: FINLIT_CHAT_PAGE,
            system: 'You write concise, professional competency statements for certificates.',
            messages: [{
              role: 'user',
              content: `Write ONE sentence starting "${firstName} demonstrated" that summarises this ${a.assessment_name} evidence (level ${SCORE_LABELS[s.score]}). Evidence: ${s.evidence.slice(0, 1500)}. Return only the sentence.`,
            }],
            max_tokens: 120,
            temperature: 0.5,
          });
          return { a, s, text: t.trim() };
        } catch {
          return { a, s, text: `${firstName} demonstrated ${SCORE_LABELS[s.score].toLowerCase()} skill in ${a.assessment_name.toLowerCase()}.` };
        }
      }));

      y += 5;
      doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.setTextColor(138, 43, 226);
      doc.text('Assessment Competencies:', 20, y);
      y += 7;
      const colW = W / 2 - 25;
      const half = Math.ceil(statements.length / 2);
      const startY = y;
      statements.forEach((st, i) => {
        if (i === half) y = startY;
        const x = i < half ? 20 : W / 2 + 5;
        doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(40, 40, 40);
        doc.text(`${st.a.assessment_name}: ${st.s.score}/3 - ${SCORE_LABELS[st.s.score]}`, x, y);
        y += 5;
        doc.setFont('helvetica', 'normal'); doc.setFontSize(10.5); doc.setTextColor(60, 60, 60);
        doc.splitTextToSize(st.text, colW).forEach((l: string) => { doc.text(l, x, y); y += 4.4; });
        y += 3;
      });

      const footerY = H - 34.35;
      await addBrandingToPDF({ doc, pageWidth: W, pageHeight: H, footerY, branding });
      doc.setFont('helvetica', 'normal'); doc.setFontSize(13); doc.setTextColor(80, 80, 80);
      doc.text(`Date: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`, W / 2, footerY + 12, { align: 'center' });

      const blob = doc.output('blob');
      if (user?.id) {
        const path = `${user.id}/financial_literacy_certificate.pdf`;
        const { error: upErr } = await supabase.storage.from('certificates')
          .upload(path, blob, { contentType: 'application/pdf', upsert: true });
        if (!upErr && certRowId) {
          const { data: urlData } = supabase.storage.from('certificates').getPublicUrl(path);
          await supabase.from('dashboard').update({ certificate_pdf_url: urlData.publicUrl }).eq('id', certRowId);
        }
      }

      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `Financial_Literacy_Certificate_${certificateName.trim().replace(/\s+/g, '_')}.pdf`;
      link.click();
      URL.revokeObjectURL(url);

      const confetti = await import('canvas-confetti').catch(() => null);
      confetti?.default?.({ particleCount: 150, spread: 80, origin: { y: 0.6 } });
    } catch (err) {
      console.error('[FinLit Cert] Certificate failed:', err);
      setError('Could not generate the certificate. Please try again.');
    } finally {
      setGenerating(false);
    }
  };

  // ── Shared UI bits ───────────────────────────────────────────────────────
  const voiceBar = (text: string, label: string) => (
    <div className="flex flex-wrap items-center gap-3 mb-5 p-3 bg-paper border border-hair rounded-xl">
      <span className="text-sm font-semibold text-body flex items-center gap-1.5"><Volume2 className="h-4 w-4 text-accent" /> Coach voice:</span>
      <div className="flex rounded-lg overflow-hidden border border-hair">
        {(['english', 'pidgin'] as const).map(m => (
          <button key={m} onClick={() => { cancel(); setVoiceMode(m); }}
            className={`px-4 py-1.5 text-sm font-semibold ${voiceMode === m ? 'bg-accent text-white' : 'bg-card text-muted hover:bg-surface'}`}>
            {m === 'english' ? '🇬🇧 English' : '🇳🇬 Pidgin'}
          </button>
        ))}
      </div>
      <button onClick={() => (speaking ? cancel() : speak(text.replace(/[*_#>`]/g, '')))}
        className="ml-auto flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-semibold bg-surface text-accent border border-hair">
        {speaking ? <><VolumeX className="h-4 w-4" /> Stop</> : <><Volume2 className="h-4 w-4" /> {label}</>}
      </button>
    </div>
  );

  const errorBox = error && (
    <div className="bg-red-50 border-2 border-red-300 rounded-lg p-4 flex items-start gap-3 mb-6">
      <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
      <p className="text-red-700">{error}</p>
    </div>
  );

  const scoreBadge = (s: number | null) =>
    s == null
      ? <span className="px-3 py-1 rounded-full text-sm font-medium bg-surface text-body">Not started</span>
      : <span className={`px-3 py-1 rounded-full text-sm font-medium ${s >= 2 ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>{s}/3 · {SCORE_LABELS[s]}</span>;

  // ── Views ────────────────────────────────────────────────────────────────
  const renderOverview = () => (
    <div className="max-w-6xl mx-auto">
      <div className="mb-8 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold text-ink mb-2">Financial Literacy Certification</h1>
          <p className="text-lg text-body max-w-3xl">
            Show that you can manage real money — budgeting, saving, borrowing, staying safe with digital money, and running a small business at a profit.
            Every challenge is written around your own community and uses real amounts in {locale.currencyName === 'local currency' ? 'your currency' : locale.currencyName}.
          </p>
        </div>
        <Link to="/learning/financial-literacy" className="text-sm font-semibold text-accent hover:underline">← Practise first</Link>
      </div>

      <div className="bg-card border border-hair rounded-2xl p-8 shadow-sm mb-8">
        <h2 className="text-2xl font-bold text-ink mb-6">Why Financial Literacy Matters</h2>
        <div className="grid md:grid-cols-3 gap-6">
          {[
            { icon: <Trophy className="h-10 w-10 text-accent mb-4" />, t: 'For Your Family', d: 'Plan for school fees, lean seasons, and emergencies instead of being surprised by them.' },
            { icon: <Store className="h-10 w-10 text-accent mb-4" />, t: 'For Your Business', d: 'Know your real profit, price for it, and decide when borrowing to grow makes sense.' },
            { icon: <ShieldCheck className="h-10 w-10 text-accent mb-4" />, t: 'For the AI Age', d: 'Scams are getting smarter. Spot fake alerts and impossible returns, and check AI-generated numbers before you trust them.' },
          ].map(c => (
            <div key={c.t} className="bg-paper rounded-xl p-6 border border-hair">
              {c.icon}
              <h3 className="text-xl font-bold text-ink mb-3">{c.t}</h3>
              <p className="text-body">{c.d}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-card border border-hair rounded-2xl p-8 shadow-sm mb-8">
        <h2 className="text-2xl font-bold text-ink mb-6 flex items-center gap-3"><Trophy className="h-8 w-8 text-yellow-500" /> Your Progress</h2>
        {assessments.length === 0 ? (
          <p className="text-body">No assessments are set up yet. Ask your facilitator to run the Financial Literacy migration.</p>
        ) : (
          <div className="space-y-4 mb-6">
            {assessments.map(a => {
              const s = scoreOf(a);
              const maxed = s === 3;
              return (
                <button key={a.id} disabled={maxed} onClick={() => startAssessment(a)}
                  className={`w-full flex items-center justify-between p-4 rounded-lg text-left transition-all ${maxed ? 'bg-surface opacity-60 cursor-not-allowed' : 'bg-paper hover:bg-surface hover:shadow-md'}`}>
                  <div className="flex-1">
                    <h3 className="font-semibold text-ink">{a.assessment_name}</h3>
                    <p className="text-sm text-body">{a.description}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    {scoreBadge(s)}
                    {s != null && s >= 2 && <CheckCircle className="h-6 w-6 text-green-600" />}
                    {!maxed && <ArrowRight className="h-5 w-5 text-muted" />}
                  </div>
                </button>
              );
            })}
          </div>
        )}
        {allPassed && (
          <button onClick={() => setView('certificate')} className="w-full bg-accent text-white px-6 py-3 rounded-lg font-bold text-lg hover:bg-accent/90">
            Generate Certificate
          </button>
        )}
      </div>

      <div className="bg-card border border-hair rounded-2xl p-8 shadow-sm mb-8">
        <h2 className="text-2xl font-bold text-ink mb-4">How Certification Works</h2>
        <p className="text-lg text-body mb-6">
          Reach <strong>Proficient or higher</strong> on <strong>all {assessments.length || 5} assessments</strong>. Retake any assessment as often as you like — each challenge is new and built around your context.
          Show your calculations: the assessor checks every number.
        </p>
        <div className="grid md:grid-cols-3 gap-6">
          {[
            { n: 1, icon: <ClipboardList className="h-8 w-8 text-accent" />, t: 'Define your context', d: 'A real money situation: your stall, your savings group, a loan offer, a mobile money problem.' },
            { n: 2, icon: <Brain className="h-8 w-8 text-accent" />, t: 'Answer on your own', d: 'Work through the numbered questions, show your working, and give your reasons.' },
            { n: 3, icon: <GraduationCap className="h-8 w-8 text-green-600" />, t: 'Get your evaluation', d: 'Your score, what was right and wrong in your math, and how to level up.' },
          ].map(s => (
            <div key={s.n} className="bg-paper rounded-xl p-6 border border-hair">
              <div className="flex items-center gap-3 mb-4">
                <div className="bg-accent text-white rounded-full w-10 h-10 flex items-center justify-center font-bold text-lg">{s.n}</div>
                {s.icon}
              </div>
              <h3 className="text-xl font-bold text-ink mb-2">{s.t}</h3>
              <p className="text-body">{s.d}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-card border border-hair rounded-2xl p-8 shadow-sm">
        <h2 className="text-2xl font-bold text-ink mb-4">Aligned with Recognized Frameworks</h2>
        <div className="flex flex-wrap gap-8 items-center justify-center text-center">
          <div><div className="text-2xl font-bold text-accent">OECD/INFE</div><div className="text-sm text-body">Core Competencies on<br />Financial Literacy for Youth</div></div>
          <div><div className="text-2xl font-bold text-accent">AFI</div><div className="text-sm text-body">Alliance for<br />Financial Inclusion</div></div>
          <div><div className="text-2xl font-bold text-accent">National</div><div className="text-sm text-body">Financial inclusion<br />strategies ({locale.country})</div></div>
        </div>
      </div>
    </div>
  );

  const renderDefineContext = () => (
    <div className="max-w-4xl mx-auto">
      <button onClick={() => setView('overview')} className="flex items-center gap-2 text-accent hover:underline mb-6"><ArrowLeft className="h-5 w-5" /> Back</button>
      <div className="bg-card border border-hair rounded-2xl p-8 shadow-sm">
        <h2 className="text-3xl font-bold text-ink mb-2">{selected?.assessment_name}</h2>
        <p className="text-body mb-6">{selected?.description}</p>

        <div className="bg-amber-50 border-2 border-amber-300 rounded-xl p-5 mb-8 flex items-start gap-4">
          <span className="text-3xl">🎓</span>
          <div>
            <p className="font-bold text-amber-900 text-sm mb-1">This is a certification attempt — you answer on your own</p>
            <p className="text-amber-800 text-sm">You'll get a challenge built from the context below, with real amounts. No AI hints during the attempt. Bring a pen and paper for your calculations.</p>
          </div>
        </div>

        {errorBox}

        <div className="space-y-6">
          {([
            ['topic', 'Topic', `e.g. Pricing smoked fish, saving for school fees, a loan offer from a mobile app`, 'What money situation will your challenge be about?'],
            ['setting', 'Setting', 'e.g. Market stall in Oloibiri, my family\'s farm, our savings group', 'Where does it happen?'],
            ['constraints', 'Constraints', 'e.g. Income changes by season, prices keep rising, no bank nearby', 'What makes it hard?'],
            ['audience', 'Audience', 'e.g. My mother and her customers, members of our savings group', 'Who is affected or needs to understand your decision?'],
          ] as const).map(([k, label, ph, help]) => (
            <div key={k}>
              <label className="block text-sm font-semibold text-body mb-2">{label} <span className="text-red-500">*</span></label>
              <input value={ctx[k]} onChange={e => setCtx({ ...ctx, [k]: e.target.value })} placeholder={ph}
                className="w-full px-4 py-3 border-2 border-hair rounded-lg focus:border-accent focus:outline-none" />
              <p className="text-sm text-muted mt-1">{help}</p>
            </div>
          ))}
          <div className="bg-green-50 border border-green-200 rounded-xl p-4">
            <label className="block text-sm font-semibold text-green-900 mb-1">💼 Livelihood / money goal <span className="text-muted font-normal">(strongly recommended)</span></label>
            <textarea rows={3} value={ctx.livelihood} onChange={e => setCtx({ ...ctx, livelihood: e.target.value })}
              placeholder="e.g. I want to help my aunt grow her fish business enough to buy a solar freezer."
              className="w-full border border-green-300 rounded-lg px-4 py-2.5 text-sm resize-none bg-white focus:ring-2 focus:ring-green-400" />
          </div>
          <button onClick={generateChallenge} disabled={loading || !ctx.topic || !ctx.setting || !ctx.constraints || !ctx.audience}
            className="w-full bg-accent text-white px-6 py-3 rounded-lg font-bold text-lg hover:bg-accent/90 disabled:opacity-50 flex items-center justify-center gap-2">
            {loading ? <><Loader2 className="h-5 w-5 animate-spin" /> Preparing your challenge…</> : <><GraduationCap className="h-5 w-5" /> Generate my challenge</>}
          </button>
        </div>
      </div>
    </div>
  );

  const renderTake = () => (
    <div className="max-w-4xl mx-auto">
      <button onClick={() => setView('define-context')} className="flex items-center gap-2 text-accent hover:underline mb-6"><ArrowLeft className="h-5 w-5" /> Back to context</button>
      <div className="bg-card border border-hair rounded-2xl p-8 shadow-sm">
        <h2 className="text-3xl font-bold text-ink mb-4">{selected?.assessment_name}</h2>

        <div className="bg-amber-50 border-2 border-amber-300 rounded-xl p-4 mb-6 flex items-start gap-3">
          <span className="text-2xl">✍️</span>
          <p className="text-amber-800 text-sm">
            <strong className="text-amber-900">Write your answer on your own.</strong> Show every calculation step. "Improve my English" fixes grammar only — it never changes your numbers.
          </p>
        </div>

        <div className="bg-surface border border-hair rounded-xl p-6 mb-6">
          <h3 className="text-lg font-bold text-ink mb-3">Your challenge</h3>
          {voiceBar(challenge, 'Read challenge aloud')}
          <ReactMarkdown components={markdown}>{challenge}</ReactMarkdown>
        </div>

        <div className="bg-green-50 border border-green-300 rounded-xl p-6 mb-6">
          <h3 className="text-lg font-bold text-ink mb-3">How you'll be scored</h3>
          <ul className="space-y-2 text-sm">
            {selected && levelsOf(selected).map((l, i) => <li key={i}><strong>{i} ({SCORE_LABELS[i]}):</strong> {l}</li>)}
          </ul>
        </div>

        <label className="block text-sm font-semibold text-body mb-2">Your response <span className="text-red-500">*</span></label>
        <textarea value={response} onChange={e => setResponse(e.target.value)}
          className="w-full px-4 py-3 border-2 border-hair rounded-lg focus:border-accent focus:outline-none min-h-[320px] font-mono text-sm" />
        <div className="flex justify-end my-3">
          <button onClick={improveEnglish} disabled={!response.trim() || isImproving}
            className="flex items-center gap-2 bg-accent text-white px-4 py-2 rounded-lg font-semibold text-sm disabled:opacity-50">
            {isImproving ? <><Loader2 className="h-4 w-4 animate-spin" /> Improving…</> : <><Wand2 size={15} /> Improve my English</>}
          </button>
        </div>
        {errorBox}
        <button onClick={submit} disabled={loading || !response.trim()}
          className="w-full bg-accent text-white px-6 py-3 rounded-lg font-bold text-lg hover:bg-accent/90 disabled:opacity-50 flex items-center justify-center gap-2">
          {loading ? <><Loader2 className="h-5 w-5 animate-spin" /> Evaluating…</> : <><GraduationCap className="h-5 w-5" /> Submit for evaluation</>}
        </button>
      </div>
    </div>
  );

  const renderResults = () => {
    if (!result || !selected) return null;
    const passed = result.score >= 2;
    return (
      <div className="max-w-4xl mx-auto">
        <div className="bg-card border border-hair rounded-2xl p-8 shadow-sm">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-24 h-24 bg-surface rounded-full mb-4">
              {passed ? <Sparkles className="h-16 w-16 text-green-600" /> : <RefreshCw className="h-16 w-16 text-yellow-600" />}
            </div>
            <h2 className="text-3xl font-bold text-ink mb-2">{passed ? 'Congratulations!' : 'Keep going!'}</h2>
            <p className="text-xl text-body">Your score: <strong>{SCORE_LABELS[result.score]}</strong> ({result.score}/3)</p>
          </div>

          <div className="bg-paper border-2 border-hair rounded-xl p-6 mb-6">
            <h3 className="text-lg font-bold text-ink mb-3">Assessment feedback</h3>
            {voiceBar(`Your score is ${SCORE_LABELS[result.score]}. ${result.evidence} ${advice.replace(/\[.*?\]\(.*?\)/g, '')}`, 'Hear feedback')}
            <ReactMarkdown components={markdown}>{result.evidence}</ReactMarkdown>
          </div>

          {advice && (
            <div className="bg-surface border border-hair rounded-xl p-6 mb-8">
              <h3 className="text-lg font-bold text-ink mb-3 flex items-center gap-2"><Brain className="h-6 w-6 text-accent" />{result.score === 3 ? 'Excellent work!' : passed ? 'Path to Advanced' : 'How to improve'}</h3>
              <ReactMarkdown components={markdown}>{advice}</ReactMarkdown>
            </div>
          )}

          {allPassed ? (
            <div className="bg-green-50 border border-green-300 rounded-xl p-6 mb-6">
              <h3 className="text-xl font-bold text-ink mb-3 flex items-center gap-2"><Trophy className="h-7 w-7 text-yellow-500" /> All assessments passed!</h3>
              <button onClick={() => setView('certificate')} className="bg-accent text-white px-6 py-3 rounded-lg font-bold hover:bg-accent/90">Get your certificate</button>
            </div>
          ) : (
            <div className="bg-surface border border-hair rounded-xl p-6 mb-6">
              <h3 className="text-lg font-bold text-ink mb-2">Still to pass ({remaining.length})</h3>
              <ul className="list-disc list-inside text-body">{remaining.map(r => <li key={r.id}>{r.assessment_name}</li>)}</ul>
            </div>
          )}

          <div className="flex gap-4">
            <button onClick={() => { setView('overview'); setSelected(null); setCtx(emptyContext); setResponse(''); setResult(null); setAdvice(''); }}
              className="flex-1 bg-gray-200 text-ink px-6 py-3 rounded-lg font-bold hover:bg-gray-300">Back to overview</button>
            {result.score < 3 && (
              <button onClick={() => { setResponse(''); setResult(null); setAdvice(''); setView('define-context'); }}
                className="flex-1 bg-accent text-white px-6 py-3 rounded-lg font-bold hover:bg-accent/90">
                {passed ? 'Try for Advanced' : 'Retake'}
              </button>
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderCertificate = () => (
    <div className="max-w-4xl mx-auto">
      <div className="bg-card border border-hair rounded-2xl p-8 shadow-sm text-center">
        <Award className="h-24 w-24 text-accent mx-auto mb-6" />
        <h2 className="text-4xl font-bold text-ink mb-4">Congratulations! 🎉</h2>
        <p className="text-xl text-body mb-8">You passed every Financial Literacy assessment.</p>
        <div className="bg-surface border border-hair rounded-xl p-8 mb-8">
          <h3 className="text-lg font-bold text-ink mb-4">How should your name appear on the certificate?</h3>
          <input value={certificateName} onChange={e => setCertificateName(e.target.value)} placeholder="Your full name"
            className="w-full max-w-md mx-auto px-4 py-3 border border-hair rounded-lg focus:border-accent focus:outline-none text-center text-lg" />
        </div>
        {errorBox}
        <button onClick={generateCertificate} disabled={!certificateName.trim() || generating}
          className="bg-accent text-white px-8 py-4 rounded-lg font-bold text-lg hover:bg-accent/90 disabled:opacity-50 inline-flex items-center gap-3">
          {generating ? <><Loader2 className="h-6 w-6 animate-spin" /> Generating…</> : <><Download className="h-6 w-6" /> Download certificate</>}
        </button>
        <div className="mt-6"><button onClick={() => setView('overview')} className="text-accent hover:underline font-medium">Return to overview</button></div>
      </div>
    </div>
  );

  return (
    <AppLayout>
      {fallbackText && (
        <div className="fixed bottom-4 right-4 z-50 max-w-sm"><VoiceFallback text={fallbackText} onDismiss={clearFallback} /></div>
      )}
      <div className="px-4 py-8">
        {view === 'overview' && renderOverview()}
        {view === 'define-context' && renderDefineContext()}
        {view === 'take' && renderTake()}
        {view === 'results' && renderResults()}
        {view === 'certificate' && renderCertificate()}
      </div>
    </AppLayout>
  );
};

export default FinancialLiteracyCertificationPage;
