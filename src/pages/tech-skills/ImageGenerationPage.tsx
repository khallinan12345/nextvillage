// src/pages/ImageGenerationPage.tsx
//
// AI Image Generation — FLUX Schnell via Replicate.
// Features identical to VideoGenerationPage:
//   • Access gate: Africa + North America (profiles.continent)
//   • Voice output toggle (UK English 🇬🇧 / Nigerian Pidgin 🇳🇬)
//   • communication_level adaptive UI text
//   • "Improve my English" button
//   • "Critique my Prompt" + step-by-step builder
//   • 20/week usage limit (images are cheap — ~$0.003 each)
//   • Save image to Supabase Storage bucket (ai-images)
//   • Save session to dashboard (image_prompt, image_url, image_critique, image_chat_history)

import React, { useState, useEffect, useRef, useCallback } from 'react';
import AppLayout from '../../components/layout/AppLayout';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../lib/supabaseClient';
import { chatText } from '../../lib/chatClient';
import { useVoice } from '../../hooks/useVoice';
import { VoiceFallback } from '../../components/VoiceFallback';
import { PidginTooltip } from '../../components/PidginTooltip';
import {
  ImagePlus, Sparkles, Clock, CheckCircle, XCircle,
  Download, RotateCcw, ChevronDown, ChevronUp,
  Volume2, VolumeX, Wand2, MessageSquare, Lightbulb,
  Save, AlertTriangle,
} from 'lucide-react';
import classNames from 'classnames';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ImageJob {
  id: string;
  prompt: string;
  status: 'pending' | 'generating' | 'succeeded' | 'failed';
  image_url: string | null;
  saved_image_url: string | null;
  error_message: string | null;
  created_at: string;
}

type ViewMode = 'generate' | 'history';

// ─── Constants ────────────────────────────────────────────────────────────────

const SUPABASE_URL  = import.meta.env.VITE_SUPABASE_URL as string;
const FUNCTIONS_URL = `${SUPABASE_URL}/functions/v1`;
const WEEKLY_LIMIT  = 20;

const STATUS_CONFIG: Record<string, { color: string; border: string; icon: string }> = {
  pending:    { color: 'text-yellow-300', border: 'border-yellow-500/30', icon: '⏳' },
  generating: { color: 'text-cyan-300',   border: 'border-cyan-500/30',   icon: '⚡' },
  succeeded:  { color: 'text-green-300',  border: 'border-green-500/30',  icon: '✅' },
  failed:     { color: 'text-red-400',    border: 'border-red-500/30',    icon: '❌' },
};

const ASPECT_RATIOS = ['16:9', '1:1', '9:16', '4:3', '3:4'] as const;
type AspectRatio = typeof ASPECT_RATIOS[number];

const PROMPT_SUGGESTIONS = [
  'A young girl in a school uniform sitting under a mango tree, reading a book, warm golden light, detailed painting style',
  'Solar panels on a village rooftop at sunrise, Nigerian landscape, photorealistic, vibrant colours',
  'A close-up portrait of a Nigerian market trader smiling, colourful fabric background, natural light, professional photo',
  'Abstract representation of AI — glowing blue neural network over a dark background, digital art style',
  'A farmer harvesting crops at sunset, silhouette against orange sky, cinematic photography',
];

// ─── Edge Function helper ─────────────────────────────────────────────────────

async function callEdgeFunction(
  path: string,
  method: 'GET' | 'POST',
  token: string,
  body?: object,
): Promise<{ ok: boolean; data: any }> {
  const res = await fetch(`${FUNCTIONS_URL}/${path}`, {
    method,
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, data };
}

// ─── History card ─────────────────────────────────────────────────────────────

const ImageCard: React.FC<{ job: ImageJob; onReuse: (p: string) => void }> = ({ job, onReuse }) => {
  const [expanded, setExpanded] = useState(false);
  const cfg = STATUS_CONFIG[job.status];
  const displayUrl = job.saved_image_url ?? job.image_url;
  return (
    <div className={classNames('rounded-xl border backdrop-blur-sm overflow-hidden', cfg.border, 'bg-slate-900/60')}>
      <button onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-white/5 transition-colors">
        <span className={classNames('text-sm font-semibold shrink-0', cfg.color)}>{cfg.icon} {job.status === 'generating' ? 'Generating…' : job.status.charAt(0).toUpperCase() + job.status.slice(1)}</span>
        <p className="text-sm text-slate-300 truncate flex-1 min-w-0">{job.prompt}</p>
        <span className="text-xs text-slate-500 shrink-0">{new Date(job.created_at).toLocaleDateString()}</span>
        {expanded ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
      </button>
      {expanded && (
        <div className="px-4 pb-4 space-y-3 border-t border-white/10 pt-3">
          {job.status === 'succeeded' && displayUrl && (
            <img src={displayUrl} alt={job.prompt} className="w-full rounded-lg max-h-64 object-cover" />
          )}
          {job.status === 'failed' && (
            <p className="text-sm text-red-400 bg-red-900/20 rounded-lg px-3 py-2">{job.error_message ?? 'Generation failed.'}</p>
          )}
          <div className="flex gap-2 flex-wrap">
            <button onClick={() => onReuse(job.prompt)}
              className="flex items-center gap-1.5 text-xs bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-full px-3 py-1.5 transition-colors">
              <RotateCcw size={12} /> Reuse prompt
            </button>
            {displayUrl && (
              <button onClick={() => downloadImage(displayUrl, 'generated-image.png')}
                className="flex items-center gap-1.5 text-xs bg-cyan-700 hover:bg-cyan-600 text-white rounded-full px-3 py-1.5 transition-colors">
                <Download size={12} /> Download
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// ─── Download helper ─────────────────────────────────────────────────────────
// The <a download> attribute is ignored for cross-origin URLs when target="_blank"
// is present. Fetch the image as a blob so the browser always saves it locally.
const downloadImage = async (url: string, filename = 'generated-image.png') => {
  try {
    const response = await fetch(url);
    const blob = await response.blob();
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(blobUrl);
  } catch (err) {
    console.error('[Download] failed:', err);
    // Fallback: open in new tab so user can save manually
    window.open(url, '_blank');
  }
};

// ─── Main component ───────────────────────────────────────────────────────────

const ImageGenerationPage: React.FC = () => {
  const { user } = useAuth();

  // ── View / generation state ───────────────────────────────────────────────
  const [view,         setView]         = useState<ViewMode>('generate');
  const [prompt,       setPrompt]       = useState('');
  const [aspectRatio,  setAspectRatio]  = useState<AspectRatio>('16:9');
  const [isGenerating, setIsGenerating] = useState(false);
  const [activeJob,    setActiveJob]    = useState<ImageJob | null>(null);
  const [imageUrl,     setImageUrl]     = useState<string | null>(null);
  const [history,      setHistory]      = useState<ImageJob[]>([]);
  const [loadingHist,  setLoadingHist]  = useState(false);
  const [error,        setError]        = useState<string | null>(null);

  // ── Communication level + access gate ────────────────────────────────────
  const [communicationLevel, setCommunicationLevel] = useState<number>(1);
  const [continent,          setContinent]          = useState<string | null>(null);
  const [loadingContinent,   setLoadingContinent]   = useState(true);

  // ── Voice state ───────────────────────────────────────────────────────────
  const [voiceMode,    setVoiceMode]    = useState<'english' | 'pidgin'>('pidgin'); // Africa default
  const [voiceEnabled, setVoiceEnabled] = useState(true);

  const {
    speak: hookSpeak,
    cancel: cancelSpeech,
    speaking: isSpeaking,
    fallbackText,
    clearFallback,
    selectedVoice,
  } = useVoice(voiceMode === 'pidgin');

  // ── Improve English ───────────────────────────────────────────────────────
  const [isImproving,    setIsImproving]    = useState(false);

  // ── Save to bucket ────────────────────────────────────────────────────────
  const [isSaving,       setIsSaving]       = useState(false);
  const [savedUrl,       setSavedUrl]       = useState<string | null>(null);
  const [saveError,      setSaveError]      = useState<string | null>(null);

  // ── Dashboard save ────────────────────────────────────────────────────────
  const [isSavingDash,   setIsSavingDash]   = useState(false);
  const [dashSaved,      setDashSaved]      = useState(false);

  // ── Weekly usage ──────────────────────────────────────────────────────────
  const [weeklyCount,    setWeeklyCount]    = useState<number>(0);

  // ── Critique state ────────────────────────────────────────────────────────
  const [showCritique,   setShowCritique]   = useState(false);
  const [critiqueText,   setCritiqueText]   = useState('');
  const [isCritiquing,   setIsCritiquing]   = useState(false);
  const [critiqueStep,   setCritiqueStep]   = useState<'idle' | 'full' | 'step'>('idle');
  const [stepMessages,   setStepMessages]   = useState<{ role: 'coach' | 'user'; text: string }[]>([]);
  const [stepInput,      setStepInput]      = useState('');
  const [isStepSending,  setIsStepSending]  = useState(false);
  const [isImprovingStep, setIsImprovingStep] = useState(false);

  // ── Fetch data on mount ───────────────────────────────────────────────────
  useEffect(() => {
    if (!user?.id) return;

    supabase.from('user_personality_baseline').select('communication_level')
      .eq('user_id', user.id).single()
      .then(({ data }) => { if (data?.communication_level != null) setCommunicationLevel(data.communication_level); });

    supabase.from('profiles').select('continent, country')
      .eq('id', user.id).single()
      .then(({ data }) => {
        setContinent(data?.continent ?? null);
        setLoadingContinent(false);
        setVoiceMode(data?.country === 'Nigeria' ? 'pidgin' : 'english');
      });

    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    supabase.from('image_generations').select('id', { count: 'exact', head: true })
      .eq('user_id', user.id).neq('status', 'failed').gte('created_at', since)
      .then(({ count }) => setWeeklyCount(count ?? 0));
  }, [user?.id]);

  const lvl = communicationLevel;

  // ── UI text tiers ─────────────────────────────────────────────────────────
  const uiText = {
    pageTitle:      lvl <= 1 ? 'Make an Image with AI'   : 'AI Image Generation',
    pageSubtitle:   lvl <= 1 ? 'Type what you want to see. AI will make the picture.'
                             : 'Create images from text descriptions using FLUX AI',
    promptLabel:    lvl <= 1 ? 'What do you want the picture to show? *' : 'Describe your image *',
    promptHint:     lvl <= 1 ? 'Describe the people, place, colours, and style. More detail = better image.'
                             : 'Be specific: describe subject, lighting, style, colours, and mood',
    promptPlaceholder: lvl <= 1
      ? 'e.g. A smiling girl in a colourful Nigerian dress, sunny day, bright colours'
      : 'e.g. A Nigerian market trader arranging colourful fabrics, golden hour light, photorealistic, detailed',
    aspectLabel:    lvl <= 1 ? 'Image shape'             : 'Aspect Ratio',
    improveBtnLabel: '✏️ Improve my English',
    critiqueBtnLabel: lvl <= 1 ? '💡 Help me write a better prompt' : '💡 Critique my Prompt',
    generateBtn:    lvl <= 1 ? 'Make My Image 🎨'        : 'Generate Image',
    footerText:     lvl <= 1
      ? 'Your image is made by FLUX AI. It takes about 3–5 seconds. Your images are saved in your history.'
      : 'Powered by FLUX Schnell (Black Forest Labs) via Replicate. ~3–5s generation time.',
  };

  // ── Speak text ────────────────────────────────────────────────────────────
  const speakText = useCallback((text: string) => {
    if (!voiceEnabled) return;
    const stripped = text.replace(/\*\*/g, '').replace(/#{1,3} /g, '').slice(0, 600);
    hookSpeak(stripped);
  }, [voiceEnabled, hookSpeak]);

  const stopSpeaking = () => cancelSpeech();

  // ── Load history ──────────────────────────────────────────────────────────
  const loadHistory = useCallback(async () => {
    if (!user?.id) return;
    setLoadingHist(true);
    const { data } = await supabase
      .from('image_generations').select('*')
      .eq('user_id', user.id).order('created_at', { ascending: false }).limit(30);
    setHistory((data ?? []) as ImageJob[]);
    setLoadingHist(false);
  }, [user?.id]);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  // ── Weekly reset helper ───────────────────────────────────────────────────
  const daysUntilReset = () => 7 - new Date().getDay();

  // ── Generate image ────────────────────────────────────────────────────────
  const handleGenerate = async () => {
    if (!prompt.trim() || isGenerating || !user) return;

    if (weeklyCount >= WEEKLY_LIMIT) {
      setError(lvl <= 1
        ? `You have made ${WEEKLY_LIMIT} images this week. Please come back next week!`
        : `Weekly limit reached (${WEEKLY_LIMIT} images/week). Resets in ${daysUntilReset()} day(s).`);
      return;
    }

    setIsGenerating(true); setError(null); setImageUrl(null); setActiveJob(null);
    setSavedUrl(null); setSaveError(null); setDashSaved(false);

    const tempJob: ImageJob = {
      id: 'temp', prompt: prompt.trim(), status: 'generating',
      image_url: null, saved_image_url: null, error_message: null,
      created_at: new Date().toISOString(),
    };
    setActiveJob(tempJob);

    speakText(lvl <= 1
      ? 'Making your image. Please wait a few seconds.'
      : 'Generating your image. This usually takes 3 to 5 seconds.');

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Not authenticated');

      const { ok, data } = await callEdgeFunction('generate-image', 'POST', session.access_token, {
        prompt: prompt.trim(), aspect_ratio: aspectRatio,
      });

      if (!ok || data.error) throw new Error(data.error ?? 'Failed to generate image');

      setImageUrl(data.imageUrl);
      setActiveJob({ ...tempJob, id: data.jobId, status: 'succeeded', image_url: data.imageUrl });
      setWeeklyCount(c => c + 1);
      speakText(lvl <= 1 ? '🎉 Your image is ready!' : 'Your image has been generated successfully!');
      loadHistory();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
      setActiveJob({ ...tempJob, status: 'failed' });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleReset = () => {
    setActiveJob(null); setImageUrl(null); setError(null);
    setSavedUrl(null); setSaveError(null); setDashSaved(false); stopSpeaking();
  };

  // ── Save image to Storage ─────────────────────────────────────────────────
  const handleSaveImage = async () => {
    if (!imageUrl || !user?.id || !activeJob || isSaving) return;
    setIsSaving(true); setSaveError(null);
    try {
      const res = await fetch(imageUrl);
      if (!res.ok) throw new Error('Could not fetch image from source');
      const blob = await res.blob();
      const ext  = blob.type === 'image/webp' ? 'webp' : 'jpg';
      const path = `${user.id}/${activeJob.id}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from('ai-images').upload(path, blob, { contentType: blob.type, upsert: true });
      if (uploadError) throw uploadError;

      const { data: signed } = await supabase.storage
        .from('ai-images').createSignedUrl(path, 60 * 60 * 24 * 365 * 10);
      const permanentUrl = signed?.signedUrl ?? null;

      if (activeJob.id !== 'temp') {
        await supabase.from('image_generations')
          .update({ saved_image_url: permanentUrl, saved_at: new Date().toISOString() })
          .eq('id', activeJob.id);
      }

      setSavedUrl(permanentUrl);
      speakText(lvl <= 1 ? 'Your image is saved!' : 'Image saved to your account successfully.');
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Save failed. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  // ── Save session to dashboard ─────────────────────────────────────────────
  const handleSaveToDashboard = async () => {
    if (!user?.id || isSavingDash) return;
    setIsSavingDash(true);
    try {
      const critiqueToSave = critiqueStep === 'full'
        ? critiqueText
        : stepMessages.length > 0
          ? stepMessages.map(m => `${m.role === 'coach' ? 'Coach' : 'You'}: ${m.text}`).join('\n\n')
          : null;

      await supabase.from('dashboard').insert({
        user_id:             user.id,
        activity:            'AI Image Creation',
        category_activity:   'Image Generation',
        sub_category:        'Text to Image',
        title:               `Image: ${prompt.trim().slice(0, 80)}`,
        progress:            imageUrl || savedUrl ? 'completed' : 'started',
        image_prompt:        prompt.trim(),
        image_url:           savedUrl ?? imageUrl,
        image_critique:      critiqueToSave,
        image_chat_history:  stepMessages.length > 0 ? stepMessages : null,
        created_at:          new Date().toISOString(),
        updated_at:          new Date().toISOString(),
      });
      setDashSaved(true);
      speakText(lvl <= 1 ? 'Your session is saved!' : 'Session saved to your dashboard.');
    } catch (err) {
      console.error('Dashboard save error:', err);
    } finally {
      setIsSavingDash(false);
    }
  };

  // ── Improve English (main prompt) ─────────────────────────────────────────
  const handleImproveEnglish = async () => {
    if (!prompt.trim() || isImproving) return;
    setIsImproving(true);
    try {
      const improved = await chatText({
        messages: [{ role: 'user', content:
          `You are an English language coach helping a student in Nigeria improve their AI image prompt.\n\nThe student wrote: "${prompt.trim()}"\n\nRewrite it as a clear, vivid, well-formed image description in natural English. Keep their core idea unchanged. Add specific visual details that help AI image models (lighting, style, colours, mood, composition). Fix all grammar errors. Keep the result under 100 words.\n\nReturn ONLY the improved prompt. No explanation.` }],
        system: 'Return only the improved prompt, nothing else.',
        max_tokens: 150, temperature: 0.4,
      });
      if (improved.trim()) {
        setPrompt(improved.trim());
        speakText(lvl <= 1 ? 'I improved your English. Please check it.' : 'Your prompt has been improved. Review the changes.');
      }
    } catch (err) { console.error('Improve error:', err); }
    finally { setIsImproving(false); }
  };

  // ── Improve English (step input) ──────────────────────────────────────────
  const handleImproveStep = async () => {
    if (!stepInput.trim() || isImprovingStep) return;
    setIsImprovingStep(true);
    try {
      const improved = await chatText({
        messages: [{ role: 'user', content:
          `You are an English coach. The student wrote: "${stepInput.trim()}"\nRewrite it as a clear, natural English sentence preserving their meaning exactly. Keep it brief and conversational.\nReturn ONLY the improved text.` }],
        system: 'Return only the improved text.',
        max_tokens: 100, temperature: 0.3,
      });
      if (improved.trim()) setStepInput(improved.trim());
    } catch (err) { console.error('Step improve error:', err); }
    finally { setIsImprovingStep(false); }
  };

  // ── Full critique ─────────────────────────────────────────────────────────
  const handleFullCritique = async () => {
    if (!prompt.trim() || isCritiquing) return;
    setIsCritiquing(true); setCritiqueStep('full'); setShowCritique(true);
    const commGuidance = lvl <= 1 ? 'Short simple sentences. One idea each. Max 60 words.'
      : lvl === 2 ? 'Clear and direct. 2–3 short paragraphs.' : 'Well-structured English with appropriate detail.';
    try {
      const critique = await chatText({
        messages: [{ role: 'user', content:
          `You are an expert at writing AI text-to-image prompts. A student wrote:\n\n"${prompt.trim()}"\n\nEvaluate for AI image generation quality across:\n1. SUBJECT — clear who/what?\n2. SETTING — environment described?\n3. LIGHTING — light type mentioned?\n4. STYLE — art style or medium specified?\n5. COLOUR — colours or mood described?\n6. COMPOSITION — framing or camera angle?\n\nFor each: what is good, what is missing, one example improvement.\nEnd with a score /10 and one improved version of the full prompt.\n\n${commGuidance}` }],
        system: 'You are a helpful AI image prompt coach. Give honest, encouraging, specific feedback.',
        max_tokens: 500, temperature: 0.5,
      });
      setCritiqueText(critique);
      speakText(lvl <= 1 ? 'Here is my feedback on your prompt.' : 'Here is your prompt critique.');
    } catch { setCritiqueText('Sorry, I could not critique your prompt right now. Please try again.'); }
    finally { setIsCritiquing(false); }
  };

  // ── Step-by-step builder ──────────────────────────────────────────────────
  const handleStartStepByStep = async () => {
    setCritiqueStep('step'); setShowCritique(true); setStepMessages([]);
    const opening = lvl <= 1
      ? "Let's build your image prompt together. First — what do you want to see in the picture? Who is in it, or what is happening?"
      : "Let's build your image prompt step by step. First — what is the main subject of your image?";
    setStepMessages([{ role: 'coach', text: opening }]);
    speakText(opening);
  };

  const handleStepSend = async () => {
    if (!stepInput.trim() || isStepSending) return;
    const userMsg = stepInput.trim(); setStepInput('');
    const updated = [...stepMessages, { role: 'user' as const, text: userMsg }];
    setStepMessages(updated); setIsStepSending(true);
    const commGuidance = lvl <= 1 ? 'Short sentences. One question only. Max 40 words.'
      : lvl === 2 ? 'Clear and direct. One guiding question. Max 80 words.' : 'Concise. One guiding question.';
    const history = updated.map(m => `${m.role === 'coach' ? 'Coach' : 'Student'}: ${m.text}`).join('\n');
    try {
      const reply = await chatText({
        messages: [{ role: 'user', content:
          `You are a friendly AI image prompt coach helping a student in Nigeria build a great text-to-image prompt, one step at a time.\n\nConversation:\n${history}\n\nGuide through these elements in order:\n1. Subject (who/what)\n2. Setting (where)\n3. Lighting\n4. Art style or medium\n5. Colours or mood\n6. Composition or framing\n\nAcknowledge what the student said warmly. Guide them to the NEXT uncovered element. ONE question only.\n\nWhen all 6 are covered, synthesise into a final polished prompt and congratulate the student.\n\n${commGuidance}` }],
        system: 'You are a patient, encouraging image prompt coach.',
        max_tokens: 200, temperature: 0.5,
      });
      setStepMessages(prev => [...prev, { role: 'coach', text: reply }]);
      speakText(reply);
    } catch {
      const fallback = 'Sorry, I had a small problem. Can you try again?';
      setStepMessages(prev => [...prev, { role: 'coach', text: fallback }]);
    } finally { setIsStepSending(false); }
  };

  const charCount = prompt.length;

  // ── Access gate ───────────────────────────────────────────────────────────
  if (loadingContinent) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center min-h-screen">
          <div className="w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
        </div>
      </AppLayout>
    );
  }

  const allowedContinents = ['Africa', 'North America'];
  if (continent !== null && !allowedContinents.includes(continent)) {
    return (
      <AppLayout>
        <div className="fixed top-14 left-0 right-0 bottom-0 bg-slate-950 flex items-center justify-center p-8">
          <div className="max-w-md text-center space-y-6">
            <div className="text-6xl">🌍</div>
            <div className="bg-slate-900/80 border border-slate-700/60 rounded-2xl p-8 backdrop-blur-sm">
              <h2 className="text-xl font-bold text-white mb-3">
                Region Not Yet Available
              </h2>
              <p className="text-slate-400 text-sm leading-relaxed">
                AI Image Creation is currently available to learners in Africa and North America. Check back soon as we expand to more regions.
              </p>
            </div>
          </div>
        </div>
      </AppLayout>
    );
  }

  // ── Main render ───────────────────────────────────────────────────────────
  return (
    <AppLayout>
      {/* Background */}
      <div className="fixed top-14 left-0 right-0 bottom-0 overflow-hidden" style={{ zIndex: 0 }}>
        <div className="absolute inset-0 bg-slate-950" />
        <div className="absolute inset-0 opacity-20" style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
          backgroundRepeat: 'repeat', backgroundSize: '200px 200px',
        }} />
        <div className="absolute top-1/4 right-1/3 w-96 h-96 rounded-full bg-pink-600/10 blur-3xl animate-pulse" />
        <div className="absolute bottom-1/3 left-1/4 w-80 h-80 rounded-full bg-orange-600/10 blur-3xl animate-pulse" style={{ animationDelay: '2s' }} />
      </div>

      <div className="relative z-10 max-w-4xl mx-auto px-4 sm:px-6 py-8">

        {/* Header */}
        <div className="mb-6">
          <div className="inline-flex flex-col items-start gap-1 rounded-xl bg-slate-900/80 border border-slate-700/60 backdrop-blur-sm p-5 mb-4 w-full">
            <div className="flex items-center justify-between w-full">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-gradient-to-br from-pink-500 to-orange-500">
                  <ImagePlus className="h-6 w-6 text-white" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold text-white tracking-tight">{uiText.pageTitle}</h1>
                  <p className="text-slate-400 text-sm">{uiText.pageSubtitle}</p>
                  <div className="mt-2">
                    <PidginTooltip
                      originalText={uiText.pageSubtitle}
                      hintText="Tap here to translate this page subtitle into Nigerian Pidgin."
                    />
                  </div>
                </div>
              </div>

              {/* Voice controls */}
              <div className="flex items-center gap-2">
                <button onClick={() => { if (isSpeaking) stopSpeaking(); else setVoiceEnabled(e => !e); }}
                  className={classNames('p-2 rounded-lg border transition-all',
                    voiceEnabled ? 'bg-slate-700 border-slate-600 text-pink-300' : 'bg-slate-800 border-slate-700 text-slate-500')}>
                  {isSpeaking ? <VolumeX size={18} /> : <Volume2 size={18} />}
                </button>
                {voiceEnabled && (
                  <div className="flex rounded-lg overflow-hidden border border-slate-600">
                    <button onClick={() => setVoiceMode('english')}
                      className={classNames('px-3 py-1.5 text-xs font-bold transition-all',
                        voiceMode === 'english' ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700')}>
                      🇬🇧 {lvl <= 1 ? 'English' : 'British English'}
                    </button>
                    <button onClick={() => setVoiceMode('pidgin')}
                      className={classNames('px-3 py-1.5 text-xs font-bold transition-all',
                        voiceMode === 'pidgin' ? 'bg-green-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700')}>
                      🇳🇬 {lvl <= 1 ? 'Pidgin' : 'Nigerian Pidgin'}
                    </button>
                  </div>
                )}
                {voiceEnabled && (
                  <span className="text-xs text-slate-500 hidden sm:inline">
                    {'Ezinne'}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Text fallback when TTS unavailable (e.g. no network voice in Nigeria) */}
          {fallbackText && (
            <div className="mb-3">
              <VoiceFallback text={fallbackText} onDismiss={clearFallback} />
            </div>
          )}

          {/* Tabs */}
          <div className="flex gap-1 bg-slate-900/60 border border-slate-700/40 rounded-lg p-1 w-fit">
            {(['generate', 'history'] as ViewMode[]).map(v => (
              <button key={v} onClick={() => { setView(v); if (v === 'history') loadHistory(); }}
                className={classNames('px-4 py-1.5 rounded-md text-sm font-medium transition-all capitalize',
                  view === v ? 'bg-gradient-to-r from-pink-600 to-orange-500 text-white shadow'
                             : 'text-slate-400 hover:text-slate-200')}>
                {v === 'history' ? `${lvl <= 1 ? 'My Images' : 'History'} (${history.length})` : (lvl <= 1 ? 'Make Image' : v)}
              </button>
            ))}
          </div>
        </div>

        {/* Generate view */}
        {view === 'generate' && (
          <div className="space-y-4">

            {/* Weekly usage */}
            {weeklyCount > 0 && (
              <div className={classNames('flex items-center gap-3 rounded-xl px-4 py-3 text-sm border',
                weeklyCount >= WEEKLY_LIMIT ? 'bg-red-900/20 border-red-500/30 text-red-300'
                : weeklyCount >= WEEKLY_LIMIT - 3 ? 'bg-amber-900/20 border-amber-500/30 text-amber-300'
                : 'bg-slate-800/60 border-slate-700/40 text-slate-400')}>
                {weeklyCount >= WEEKLY_LIMIT ? <AlertTriangle size={16} className="shrink-0" /> : <ImagePlus size={16} className="shrink-0" />}
                <span>
                  {weeklyCount >= WEEKLY_LIMIT
                    ? (lvl <= 1 ? `You made ${WEEKLY_LIMIT} images this week. Come back next week!` : `Weekly limit reached (${WEEKLY_LIMIT}/week). Resets in ${daysUntilReset()} day(s).`)
                    : (lvl <= 1 ? `You made ${weeklyCount} of ${WEEKLY_LIMIT} images this week.` : `${weeklyCount} / ${WEEKLY_LIMIT} images used this week.`)}
                </span>
              </div>
            )}

            {/* Prompt card */}
            <div className="bg-slate-900/70 border border-slate-700/50 rounded-2xl p-5 backdrop-blur-sm">
              <label className="block text-sm font-semibold text-slate-300 mb-2">{uiText.promptLabel}</label>
              <textarea value={prompt} onChange={e => setPrompt(e.target.value)}
                rows={4} maxLength={750} disabled={isGenerating}
                placeholder={uiText.promptPlaceholder}
                className="w-full bg-slate-800/80 border border-slate-600/50 rounded-xl px-4 py-3 text-slate-100 placeholder-slate-500 text-sm resize-none focus:ring-2 focus:ring-pink-500/50 focus:border-pink-500/50 outline-none transition disabled:opacity-50" />
              <div className="flex items-center justify-between mt-1 mb-3">
                <p className="text-xs text-slate-500">{uiText.promptHint}</p>
                <span className={classNames('text-xs', charCount > 675 ? 'text-amber-400' : 'text-slate-500')}>{charCount}/750</span>
              </div>

              {/* Action buttons */}
              <div className="flex flex-wrap gap-2 mb-4">
                <button onClick={handleImproveEnglish} disabled={!prompt.trim() || isImproving || isGenerating}
                  className="flex items-center gap-2 bg-violet-700 hover:bg-violet-600 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-full px-4 py-2 text-sm font-medium transition-colors">
                  {isImproving ? <><div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" /> Improving…</>
                    : <><Wand2 size={14} /> {uiText.improveBtnLabel}</>}
                </button>
                <button onClick={handleFullCritique} disabled={!prompt.trim() || isCritiquing || isGenerating}
                  className="flex items-center gap-2 bg-amber-700 hover:bg-amber-600 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-full px-4 py-2 text-sm font-medium transition-colors">
                  {isCritiquing && critiqueStep === 'full' ? <><div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" /> {lvl <= 1 ? 'Checking…' : 'Analysing…'}</>
                    : <><Lightbulb size={14} /> {uiText.critiqueBtnLabel}</>}
                </button>
                <button onClick={handleStartStepByStep} disabled={isGenerating}
                  className="flex items-center gap-2 bg-teal-700 hover:bg-teal-600 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-full px-4 py-2 text-sm font-medium transition-colors">
                  <MessageSquare size={14} /> {lvl <= 1 ? 'Build step by step' : 'Build prompt step-by-step'}
                </button>
              </div>

              {/* Suggestions */}
              <div>
                <p className="text-xs text-slate-500 mb-2">{lvl <= 1 ? 'Try one of these:' : 'Try a suggestion:'}</p>
                <div className="flex flex-wrap gap-2">
                  {PROMPT_SUGGESTIONS.slice(0, 3).map((s, i) => (
                    <button key={i} onClick={() => setPrompt(s)} disabled={isGenerating}
                      className="text-xs bg-slate-800 hover:bg-slate-700 border border-slate-600/50 text-slate-300 rounded-full px-3 py-1.5 transition-colors truncate max-w-xs disabled:opacity-40">
                      {s.slice(0, 55)}…
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Critique / Step panel */}
            {showCritique && (
              <div className="bg-slate-900/80 border border-amber-500/30 rounded-2xl p-5 backdrop-blur-sm">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-amber-300 flex items-center gap-2">
                    <Lightbulb size={16} />
                    {critiqueStep === 'step' ? (lvl <= 1 ? '💬 Prompt Builder' : '💬 Step-by-Step Builder')
                      : (lvl <= 1 ? '💡 Prompt Feedback' : '💡 Prompt Critique')}
                  </h3>
                  <button onClick={() => { setShowCritique(false); setCritiqueText(''); setStepMessages([]); setCritiqueStep('idle'); stopSpeaking(); }}
                    className="text-slate-400 hover:text-slate-200 text-xs">✕ Close</button>
                </div>
                {critiqueStep === 'full' && (
                  isCritiquing
                    ? <div className="flex items-center gap-3 text-slate-400 text-sm"><div className="w-4 h-4 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" /> {lvl <= 1 ? 'Checking your prompt…' : 'Analysing your prompt…'}</div>
                    : <div className="text-sm text-slate-200 whitespace-pre-wrap leading-relaxed">{critiqueText}</div>
                )}
                {critiqueStep === 'step' && (
                  <div className="space-y-3">
                    <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                      {stepMessages.map((m, i) => (
                        <div key={i} className={classNames('rounded-lg px-3 py-2 text-sm',
                          m.role === 'coach' ? 'bg-teal-900/40 border border-teal-500/30 text-teal-100' : 'bg-slate-700/60 text-slate-200 ml-6')}>
                          {m.role === 'coach' && <span className="text-xs text-teal-400 font-semibold block mb-0.5">Coach</span>}
                          {m.text}
                        </div>
                      ))}
                      {isStepSending && <div className="bg-teal-900/40 border border-teal-500/30 rounded-lg px-3 py-2"><div className="w-4 h-4 border-2 border-teal-400 border-t-transparent rounded-full animate-spin" /></div>}
                    </div>
                    <div className="flex gap-2">
                      <input type="text" value={stepInput} onChange={e => setStepInput(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleStepSend(); } }}
                        placeholder={lvl <= 1 ? 'Type your answer…' : 'Type your response…'}
                        className="flex-1 bg-slate-800 border border-slate-600/50 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-500 outline-none focus:ring-1 focus:ring-teal-500/50" />
                      <button onClick={handleImproveStep} disabled={!stepInput.trim() || isImprovingStep || isStepSending}
                        title="Improve my English"
                        className="flex items-center gap-1.5 bg-violet-700 hover:bg-violet-600 disabled:opacity-40 text-white rounded-lg px-3 py-2 text-xs font-medium transition-colors">
                        {isImprovingStep ? <div className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                          : <><Wand2 size={12} /> {lvl <= 1 ? 'Fix English' : 'Improve'}</>}
                      </button>
                      <button onClick={handleStepSend} disabled={!stepInput.trim() || isStepSending}
                        className="bg-teal-600 hover:bg-teal-500 disabled:opacity-40 text-white rounded-lg px-4 py-2 text-sm font-medium transition-colors">
                        Send
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Aspect ratio */}
            <div className="bg-slate-900/70 border border-slate-700/50 rounded-2xl p-5 backdrop-blur-sm">
              <div className="flex items-center gap-4">
                <span className="text-sm font-semibold text-slate-300">{uiText.aspectLabel}</span>
                <div className="flex gap-1 flex-wrap">
                  {ASPECT_RATIOS.map(ar => (
                    <button key={ar} onClick={() => setAspectRatio(ar)} disabled={isGenerating}
                      className={classNames('px-3 py-1 rounded-lg text-sm font-medium transition-all disabled:opacity-40',
                        aspectRatio === ar ? 'bg-gradient-to-r from-pink-600 to-orange-500 text-white'
                                           : 'bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-600/50')}>
                      {ar}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Error */}
            {error && (
              <div className="flex items-start gap-3 bg-red-900/20 border border-red-500/30 rounded-xl px-4 py-3">
                <XCircle size={18} className="text-red-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm text-red-300 font-medium">{lvl <= 1 ? 'Something went wrong' : 'Generation failed'}</p>
                  <p className="text-xs text-red-400 mt-0.5">{error}</p>
                </div>
              </div>
            )}

            {/* Active job */}
            {activeJob && (
              <div className={classNames('rounded-2xl border backdrop-blur-sm p-5 space-y-4',
                activeJob.status === 'succeeded' ? 'bg-green-950/30 border-green-500/30'
                : activeJob.status === 'failed'  ? 'bg-red-950/30 border-red-500/30'
                : 'bg-pink-950/30 border-pink-500/30')}>
                <div className="flex items-center gap-4">
                  {isGenerating
                    ? <div className="w-10 h-10 border-4 border-pink-500/30 border-t-pink-400 rounded-full animate-spin" />
                    : activeJob.status === 'succeeded' ? <CheckCircle size={40} className="text-green-400" />
                    : <XCircle size={40} className="text-red-400" />}
                  <div className="flex-1 min-w-0">
                    <p className={classNames('text-base font-semibold',
                      activeJob.status === 'succeeded' ? 'text-green-300'
                      : activeJob.status === 'failed'  ? 'text-red-300' : 'text-pink-300')}>
                      {lvl <= 1
                        ? (isGenerating ? 'Making your image… please wait' : activeJob.status === 'succeeded' ? '🎉 Your image is ready!' : 'Something went wrong')
                        : (isGenerating ? 'Generating…' : activeJob.status === 'succeeded' ? 'Complete' : 'Failed')}
                    </p>
                    <p className="text-xs text-slate-400 truncate mt-0.5">{activeJob.prompt}</p>
                    {isGenerating && (
                      <p className="text-xs text-slate-500 mt-1">
                        {lvl <= 1 ? 'FLUX AI makes images in about 3–5 seconds.' : 'FLUX Schnell typically completes in 3–5 seconds.'}
                      </p>
                    )}
                  </div>
                </div>

                {/* Image display */}
                {(imageUrl || savedUrl) && (
                  <div className="space-y-3">
                    <div className="rounded-xl overflow-hidden bg-black border border-green-500/20">
                      <img src={savedUrl ?? imageUrl ?? ''} alt={activeJob.prompt}
                        className="w-full max-h-96 object-contain" />
                    </div>

                    {/* Save to bucket */}
                    {!savedUrl ? (
                      <div className="flex flex-col gap-1.5">
                        <button onClick={handleSaveImage} disabled={isSaving}
                          className="flex items-center justify-center gap-2 w-full bg-green-700 hover:bg-green-600 disabled:opacity-50 text-white rounded-xl py-2.5 text-sm font-semibold transition-colors">
                          {isSaving ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> {lvl <= 1 ? 'Saving image…' : 'Saving to your account…'}</>
                            : <><Save size={15} /> {lvl <= 1 ? '💾 Save My Image' : 'Save Image to Account'}</>}
                        </button>
                        {saveError && <p className="text-xs text-red-400 text-center">{saveError}</p>}
                        <p className="text-xs text-slate-500 text-center">
                          {lvl <= 1 ? 'Save it so you can see it later.' : 'Saves a permanent copy — Replicate URLs expire after a few days.'}
                        </p>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 bg-green-900/20 border border-green-500/30 rounded-xl px-4 py-2.5">
                        <CheckCircle size={16} className="text-green-400 shrink-0" />
                        <p className="text-sm text-green-300">{lvl <= 1 ? 'Image saved! ✅' : 'Image saved to your account permanently.'}</p>
                      </div>
                    )}
                  </div>
                )}

                {/* Bottom actions */}
                {(activeJob.status === 'succeeded' || activeJob.status === 'failed') && (
                  <div className="flex gap-2 flex-wrap pt-1">
                    <button onClick={handleReset}
                      className="flex items-center gap-2 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-full px-4 py-2 text-sm font-medium transition-colors">
                      <Sparkles size={14} /> {lvl <= 1 ? 'Make another image' : 'Generate another'}
                    </button>
                    {(imageUrl || savedUrl) && (
                      <button onClick={() => downloadImage(savedUrl ?? imageUrl ?? '', 'generated-image.png')}
                        className="flex items-center gap-2 bg-pink-700 hover:bg-pink-600 text-white rounded-full px-4 py-2 text-sm font-medium transition-colors">
                        <Download size={14} /> {lvl <= 1 ? 'Download' : 'Download image'}
                      </button>
                    )}
                    {!dashSaved ? (
                      <button onClick={handleSaveToDashboard} disabled={isSavingDash}
                        className="flex items-center gap-2 bg-violet-700 hover:bg-violet-600 disabled:opacity-50 text-white rounded-full px-4 py-2 text-sm font-medium transition-colors">
                        {isSavingDash ? <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Save size={14} />}
                        {lvl <= 1 ? 'Save to My Dashboard' : 'Save Session to Dashboard'}
                      </button>
                    ) : (
                      <span className="flex items-center gap-1.5 text-sm text-green-400 px-2">
                        <CheckCircle size={14} /> {lvl <= 1 ? 'Saved!' : 'Session saved'}
                      </span>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Generate button */}
            {!activeJob && (
              <button onClick={handleGenerate} disabled={!prompt.trim() || isGenerating || weeklyCount >= WEEKLY_LIMIT}
                className={classNames('w-full flex items-center justify-center gap-3 rounded-xl py-3.5 font-semibold text-base transition-all',
                  prompt.trim() && !isGenerating && weeklyCount < WEEKLY_LIMIT
                    ? 'bg-gradient-to-r from-pink-600 to-orange-500 hover:from-pink-500 hover:to-orange-400 text-white shadow-lg hover:scale-[1.01]'
                    : 'bg-slate-800 text-slate-500 cursor-not-allowed')}>
                {isGenerating
                  ? <><div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> {lvl <= 1 ? 'Making your image…' : 'Generating…'}</>
                  : <><ImagePlus size={20} /> {uiText.generateBtn}</>}
              </button>
            )}
          </div>
        )}

        {/* History view */}
        {view === 'history' && (
          <div className="space-y-3">
            {loadingHist ? (
              <div className="flex items-center justify-center py-16">
                <div className="w-8 h-8 border-2 border-pink-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : history.length === 0 ? (
              <div className="text-center py-16">
                <ImagePlus size={48} className="text-slate-600 mx-auto mb-3" />
                <p className="text-slate-400">{lvl <= 1 ? 'No images yet. Make your first one!' : 'No images yet. Generate your first one!'}</p>
                <button onClick={() => setView('generate')} className="mt-4 text-pink-400 hover:text-pink-300 text-sm underline">
                  {lvl <= 1 ? 'Make an image →' : 'Start generating →'}
                </button>
              </div>
            ) : (
              history.map(job => (
                <ImageCard key={job.id} job={job} onReuse={(p) => { setPrompt(p); setView('generate'); handleReset(); }} />
              ))
            )}
          </div>
        )}

        {/* Footer */}
        <div className="mt-8 bg-slate-900/50 border border-slate-700/30 rounded-xl px-4 py-3 text-xs text-slate-500">
          <p className="flex items-center gap-2"><Clock size={12} />{uiText.footerText}</p>
        </div>
      </div>
    </AppLayout>
  );
};

export default ImageGenerationPage;