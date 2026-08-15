// src/pages/AIReadySkillsCertificationPage.tsx

import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import AppLayout from '../components/layout/AppLayout';
import { 
  Brain,
  Code,
  Lightbulb,
  Puzzle,
  Monitor,
  MessageSquare,
  Wand2,
  ArrowRight,
  ArrowLeft,
  ClipboardList,
  GraduationCap,
  RefreshCw,
  Loader2,
  AlertCircle,
  Trophy,
  Download,
  Sparkles,
  CheckCircle,
  Award,
  Volume2,
  VolumeX
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { chatText, chatJSON } from '../lib/chatClient';
import { supabase } from '../lib/supabaseClient';
import { useVoice } from '../hooks/useVoice';
import { VoiceFallback } from '../components/VoiceFallback';
import { useBranding, addBrandingToPDF } from '../lib/useBranding';

// ---------------------------------------------------------------------------
// Shared prose styles for ReactMarkdown rendering
// ---------------------------------------------------------------------------
const markdownComponents = {
  h1: ({ children }: any) => (
    <h1 className="text-xl font-bold text-gray-900 mb-3 mt-4">{children}</h1>
  ),
  h2: ({ children }: any) => (
    <h2 className="text-lg font-bold text-ink mb-2 mt-4">{children}</h2>
  ),
  h3: ({ children }: any) => (
    <h3 className="text-base font-semibold text-ink mb-2 mt-3">{children}</h3>
  ),
  p: ({ children }: any) => (
    <p className="text-ink mb-3 leading-relaxed">{children}</p>
  ),
  strong: ({ children }: any) => (
    <strong className="font-semibold text-gray-900">{children}</strong>
  ),
  em: ({ children }: any) => (
    <em className="italic text-body">{children}</em>
  ),
  ul: ({ children }: any) => (
    <ul className="list-disc list-inside space-y-1 mb-3 text-ink ml-2">{children}</ul>
  ),
  ol: ({ children }: any) => (
    <ol className="list-decimal list-inside space-y-2 mb-3 text-ink ml-2">{children}</ol>
  ),
  li: ({ children }: any) => (
    <li className="leading-relaxed">{children}</li>
  ),
  hr: () => <hr className="my-4 border-hair" />,
  blockquote: ({ children }: any) => (
    <blockquote className="border-l-4 border-hair pl-4 italic text-body my-3">{children}</blockquote>
  ),
  a: ({ href, children }: any) => (
    <Link to={href || '#'} className="text-accent hover:underline font-medium">
      {children}
    </Link>
  ),
};

// ---------------------------------------------------------------------------
// Utility: parse the tailored prompt to extract numbered question labels
// so we can build a matching answer template.
// ---------------------------------------------------------------------------
const buildAnswerTemplate = (promptText: string): string => {
  const lines = promptText.split('\n');
  const questionLines: string[] = [];

  lines.forEach((line) => {
    const match = line.match(/^\s*(\d+)[.)]\s+\*{0,2}([^*\n—–\-]+)\*{0,2}/);
    if (match) {
      const label = match[2].trim().replace(/[—–\-:]+$/, '').trim();
      questionLines.push(label);
    }
  });

  if (questionLines.length === 0) {
    return `1. [Answer Here]



2. [Answer Here]



3. [Answer Here]



4. [Answer Here]


`;
  }

  return questionLines
    .map((label, i) => `${i + 1}. ${label}\n\n[Answer Here]\n\n\n`)
    .join('\n');
};


// Types
interface Certification {
  certification_name: string;
  assessments: Assessment[];
}

interface Assessment {
  id: string;
  certification_name: string;
  assessment_name: string;
  description: string;
  certification_prompt: string;
  certification_level0_metric: string;
  certification_level1_metric: string;
  certification_level2_metric: string;
  certification_level3_metric: string;
}

interface AssessmentScore {
  assessment_name: string;
  score: number | null;
  evidence: string;
}

interface LearnerContext {
  topic: string;
  setting: string;
  constraints: string;
  audience: string;
  entrepreneurialContext: string;
}

interface LearningModule {
  learning_module_id: string;
  title: string;
  description: string;
  category: string;
  sub_category: string;
  grade_level: number;
}

interface PersonalityBaseline {
  communicationStrategy: {
    preferred_tone?: string;
    interaction_style?: string;
    detail_level?: string;
    recommendations?: string[];
  } | null;
  learningStrategy: {
    learning_style?: string;
    motivation_approach?: string;
    pacing_preference?: string;
    recommendations?: string[];
  } | null;
}

type ViewMode = 'overview' | 'select-certification' | 'select-assessment' | 'define-context' | 'take-assessment' | 'results' | 'certificate';


const AIReadySkillsCertificationPage: React.FC = () => {
  const { user } = useAuth();
  
  // State management
  const [viewMode, setViewMode] = useState<ViewMode>('overview');
  const [certifications, setCertifications] = useState<Certification[]>([]);
  const [selectedCertification, setSelectedCertification] = useState<Certification | null>(null);
  const [assessmentScores, setAssessmentScores] = useState<AssessmentScore[]>([]);
  const [selectedAssessment, setSelectedAssessment] = useState<Assessment | null>(null);
  const [learnerContext, setLearnerContext] = useState<LearnerContext>({
    topic: '',
    setting: '',
    constraints: '',
    audience: '',
    entrepreneurialContext: ''
  });
  const [userResponse, setUserResponse] = useState('');
  const [tailoredPrompt, setTailoredPrompt] = useState<string>('');
  const [evaluationScore, setEvaluationScore] = useState<number | null>(null);
  const [evaluationEvidence, setEvaluationEvidence] = useState<string>('');
  const [improvementAdvice, setImprovementAdvice] = useState<string>('');
  const [certificateName, setCertificateName] = useState('');
  const [loading, setLoading] = useState(false);
  const [generatingCertificate, setGeneratingCertificate] = useState(false);
  const [isImproving, setIsImproving] = useState(false);

  // ── Voice state ────────────────────────────────────────────────────────
  const [voiceMode, setVoiceMode] = useState<'english' | 'pidgin'>('english');

  const branding = useBranding();

  // Pidgin only for learners whose profile country is Nigeria.
  useEffect(() => {
    if (!user?.id) return;
    supabase.from('profiles').select('country').eq('id', user.id).single()
      .then(({ data }) => setVoiceMode(data?.country === 'Nigeria' ? 'pidgin' : 'english'));
  }, [user?.id]);

  const {
    speak: hookSpeak,
    cancel: cancelSpeech,
    speaking: isSpeaking,
    fallbackText,
    clearFallback,
    selectedVoice,
  } = useVoice(voiceMode === 'pidgin');

  const handleImproveEnglish = async () => {
    if (!userResponse.trim() || isImproving) return;
    setIsImproving(true);
    try {
      const result = await chatJSON({ page: 'AIReadySkillsPage',
        messages: [{
          role: 'user',
          content: `You are an English language coach helping a student in rural Nigeria improve their writing.
The student wrote: "${userResponse.trim()}"

Your job:
1. Carefully interpret what the student is trying to say — even if the grammar is poor, words are missing, or the sentence is incomplete.
2. Rewrite their message as a complete, grammatically correct English sentence that expresses their intended meaning.
3. Preserve their voice, ideas, and personality — do not change WHAT they are saying, only HOW it is said.
4. Fix all grammar errors: subject-verb agreement, tense consistency, missing articles, word order, punctuation, and sentence completeness.
5. If the meaning is unclear, make the most reasonable interpretation and write the clearest possible sentence.

Return ONLY valid JSON: { "improved_text": "..." }`
        }],
        system: 'You are an English language coach. Return only valid JSON.',
        max_tokens: 600,
        temperature: 0.3,
      });
      if (result?.improved_text) setUserResponse(result.improved_text);
    } catch (err) {
      console.error('Improve English error:', err);
    } finally {
      setIsImproving(false);
    }
  };

  const [error, setError] = useState<string | null>(null);
  const [personalityBaseline, setPersonalityBaseline] = useState<PersonalityBaseline>({
    communicationStrategy: null,
    learningStrategy: null
  });
  const [communicationLevel, setCommunicationLevel] = useState<number>(1);

  // Fetch certifications on mount
  useEffect(() => {
    if (user?.id) {
      fetchCertificationsAndScores();
      fetchPersonalityBaseline(user.id);
    }
  }, [user?.id]);

  const fetchPersonalityBaseline = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('user_personality_baseline')
        .select('communication_strategy, learning_strategy, communication_level')
        .eq('user_id', userId)
        .single();

      if (error) {
        console.log('[AIReadySkills] No baseline found yet (normal for new users)');
        return;
      }

      setPersonalityBaseline({
        communicationStrategy: data?.communication_strategy || null,
        learningStrategy: data?.learning_strategy || null
      });
      setCommunicationLevel(data?.communication_level ?? 1);
      console.log('[AIReadySkills] Personality baseline loaded, communication_level:', data?.communication_level ?? 1);
    } catch (err) {
      console.log('[AIReadySkills] Baseline fetch skipped:', err);
    }
  };

  // ── Speak / stop helpers ───────────────────────────────────────────────
  const speak = (text: string) => hookSpeak(text);
  const stopSpeaking = () => cancelSpeech();

  // ── Reusable voice toggle + read-aloud bar ─────────────────────────────
  const renderVoiceBar = (textToRead: string, label = 'Read aloud') => (
    <div className="flex flex-wrap items-center gap-3 mb-5 p-3 bg-paper border border-hair rounded-xl">
      <span className="text-sm font-semibold text-body flex items-center gap-1.5">
        <Volume2 className="h-4 w-4 text-accent" /> Coach voice:
      </span>
      <div className="flex rounded-lg overflow-hidden border border-hair shadow-sm">
        <button
          onClick={() => { stopSpeaking(); setVoiceMode('english'); }}
          title="British English — Google UK English Female"
          className={`flex items-center gap-1.5 px-4 py-1.5 text-sm font-semibold transition-colors border-r border-hair
            ${voiceMode === 'english' ? 'bg-accent text-white' : 'bg-card text-muted hover:bg-surface hover:text-ink'}`}
        >
          🇬🇧 British English
        </button>
        <button
          onClick={() => { stopSpeaking(); setVoiceMode('pidgin'); }}
          title="Nigerian English / Pidgin voice"
          className={`flex items-center gap-1.5 px-4 py-1.5 text-sm font-semibold transition-colors
            ${voiceMode === 'pidgin' ? 'bg-accent text-white' : 'bg-card text-muted hover:bg-surface hover:text-ink'}`}
        >
          🇳🇬 Nigerian Pidgin
        </button>
      </div>
      <span className="text-xs text-muted italic hidden sm:inline">
        {'Ezinne'}
      </span>
      <button
        onClick={() => isSpeaking ? stopSpeaking() : speak(textToRead)}
        className={`ml-auto flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-semibold transition-all
          ${isSpeaking
            ? 'bg-red-100 text-red-700 border border-red-300 hover:bg-red-200'
            : 'bg-surface text-accent border border-hair hover:bg-accent/10'}`}
      >
        {isSpeaking
          ? <><VolumeX className="h-4 w-4" /> Stop</>
          : <><Volume2 className="h-4 w-4" /> {label}</>}
      </button>
    </div>
  );

  const fetchCertificationsAndScores = async () => {
    if (!user?.id) return;

    try {
      // Fetch only AI Ready Skills certifications — not tech skills certs
      const { data: allAssessments, error: assessmentsError } = await supabase
        .from('certification_assessments')
        .select('*')
        .in('certification_name', ['Critical Thinking','Creativity','Communication','Problem Solving','Digital Fluency'])
        .order('certification_name')
        .order('assessment_name');

      if (assessmentsError) throw assessmentsError;

      // Group by certification_name
      const grouped = (allAssessments || []).reduce((acc, assessment) => {
        const certName = assessment.certification_name;
        if (!acc[certName]) {
          acc[certName] = [];
        }
        acc[certName].push(assessment);
        return acc;
      }, {} as Record<string, Assessment[]>);

      const certsList: Certification[] = Object.entries(grouped).map(([name, assessments]) => ({
        certification_name: name,
        assessments
      }));

      setCertifications(certsList);
      
      // Default to first certification
      if (certsList.length > 0 && !selectedCertification) {
        setSelectedCertification(certsList[0]);
      }

      // Fetch scores for selected certification
      if (selectedCertification || certsList.length > 0) {
        const currentCert = selectedCertification || certsList[0];
        await fetchScoresForCertification(currentCert);
      }
    } catch (err) {
      console.error('Error fetching certifications:', err);
      setError('Failed to load certifications. Please refresh the page.');
    }
  };

  const fetchScoresForCertification = async (certification: Certification) => {
    if (!user?.id) return;

    try {
      const activityName = `${certification.certification_name} Certification`;
      
      const { data: dashboardData, error: dashboardError } = await supabase
        .from('dashboard')
        .select('*')
        .eq('user_id', user.id)
        .eq('activity', activityName)
        .maybeSingle();

      if (dashboardError && dashboardError.code !== 'PGRST116') {
        throw dashboardError;
      }

      // Map scores from dashboard
      const scores: AssessmentScore[] = certification.assessments.map(assessment => {
        const columnBase = `certification_${certification.certification_name.toLowerCase().replace(/ /g, '_').replace(/[^a-z0-9_]/g, '')}_${assessment.assessment_name.toLowerCase().replace(/ /g, '_').replace(/[^a-z0-9_]/g, '')}`;
        const score = dashboardData?.[`${columnBase}_score`] ?? null;
        const evidence = dashboardData?.[`${columnBase}_evidence`] ?? '';
        
        return {
          assessment_name: assessment.assessment_name,
          score,
          evidence
        };
      });

      setAssessmentScores(scores);
    } catch (err) {
      console.error('Error fetching scores:', err);
    }
  };

  const handleCertificationSelect = async (certification: Certification) => {
    setSelectedCertification(certification);
    await fetchScoresForCertification(certification);
    setViewMode('overview');
  };

  const handleSelectAssessment = (assessment: Assessment) => {
    setSelectedAssessment(assessment);
    setViewMode('define-context');
  };

  const handleContextSubmit = async () => {
    if (!learnerContext.topic || !learnerContext.setting || !learnerContext.constraints || !learnerContext.audience) {
      setError('Please fill in Topic, Setting, Constraints, and Audience');
      return;
    }
    
    if (!selectedAssessment) return;
    
    try {
      setLoading(true);
      setError(null);
      
      const tailored = await tailorPromptToContext();
      setTailoredPrompt(tailored);

      // Pre-populate the answer template based on the tailored prompt
      const template = buildAnswerTemplate(tailored);
      setUserResponse(template);
      
      setViewMode('take-assessment');
    } catch (err) {
      console.error('Error tailoring prompt:', err);
      setError('Failed to customize assessment prompt. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const tailorPromptToContext = async () => {
    if (!selectedAssessment) return '';

    const { communicationStrategy: cs, learningStrategy: ls } = personalityBaseline;
    const personalizedBlock = (cs || ls) ? `
Learner's Personalized Profile:
${cs ? `- Preferred tone: ${cs.preferred_tone ?? 'n/a'}, interaction style: ${cs.interaction_style ?? 'n/a'}, detail level: ${cs.detail_level ?? 'n/a'}` : ''}
${ls ? `- Learning style: ${ls.learning_style ?? 'n/a'}, motivation: ${ls.motivation_approach ?? 'n/a'}, pacing: ${ls.pacing_preference ?? 'n/a'}` : ''}
Adapt the language and framing of the prompt to match this learner's style.
` : '';

    const pueBlock = learnerContext.entrepreneurialContext.trim()
      ? `Entrepreneurial / Productive-Use Angle: ${learnerContext.entrepreneurialContext.trim()}
This context should be woven into the challenge so the learner is asked to demonstrate the skill in a way that connects directly to this real economic or productive activity.`
      : '';

    const commLevelBlock = communicationLevel <= 0
      ? `
COMMUNICATION LEVEL: 0 — PRE-LITERATE / VERY BASIC
Write the challenge using ONLY the simplest everyday words.
- Maximum 1–2 short sentences per numbered step. No jargon at all.
- If a skill term must appear, define it immediately in plain words right after.
- Use everyday examples the learner already knows (farm, market stall, family, school).
- Warm and encouraging tone throughout — this must not feel intimidating.`
      : communicationLevel === 1
      ? `
COMMUNICATION LEVEL: 1 — EMERGING
Write the challenge in short, clear sentences. One idea per sentence.
- Avoid jargon. If a skill term is needed, explain it immediately in plain language.
- Use concrete, familiar examples from the learner's topic and setting.
- Keep each numbered step brief and direct — no complex sub-clauses.
- Warm, encouraging tone throughout.`
      : communicationLevel === 2
      ? `
COMMUNICATION LEVEL: 2 — DEVELOPING
Write the challenge in clear, structured language.
- Skill-related terms may be used with brief explanations where helpful.
- Steps can be multi-sentence but should stay focused and direct.
- Connect each step clearly to the learner's specific context.`
      : `
COMMUNICATION LEVEL: 3 — PROFICIENT
Write the challenge in standard, well-structured English.
- Appropriate technical vocabulary is fine.
- Steps can be detailed and nuanced where the assessment demands it.`;

    const userMessage = `
You are creating a CERTIFICATION ASSESSMENT PROMPT — not a tutoring prompt. This is a written challenge the learner will complete entirely on their own, with no AI coaching or feedback during the attempt.

Generic Assessment Rubric Anchor:
${selectedAssessment.certification_prompt}

Scoring rubric for this skill:
- Level 0 (No Evidence): ${selectedAssessment.certification_level0_metric}
- Level 1 (Emerging): ${selectedAssessment.certification_level1_metric}
- Level 2 (Proficient): ${selectedAssessment.certification_level2_metric}
- Level 3 (Advanced): ${selectedAssessment.certification_level3_metric}

Learner's Context:
- Topic: ${learnerContext.topic}
- Setting: ${learnerContext.setting}
- Constraints: ${learnerContext.constraints}
- Audience: ${learnerContext.audience}
${pueBlock}
${personalizedBlock}${commLevelBlock}

Write a tailored certification challenge prompt that:
1. GROUNDS the challenge entirely in the learner's specific topic, setting, constraints, and audience — make every question reference their real situation
2. CONNECTS to the entrepreneurial/productive-use angle if provided — at least one part of the challenge should ask the learner to reason about costs, benefits, tradeoffs, or real-world value creation
3. STRUCTURES the challenge so the learner must clearly demonstrate the rubric skill — someone scoring Proficient must address specific, concrete elements; someone scoring Advanced must show strategic thinking
4. Uses NUMBERED STEPS or CLEAR SUB-QUESTIONS to guide the learner's response structure
5. Is written at the COMMUNICATION LEVEL specified above — vocabulary, sentence length, and framing must match
6. Is warm and encouraging — this is a certification attempt, not a test, and the learner should feel supported
7. Is self-contained — the learner should be able to read it once and know exactly what to write

IMPORTANT: This prompt will be displayed to the learner as-is. Do NOT include scoring instructions or rubric text. Do NOT offer hints or coaching within the prompt itself.

Respond with ONLY the tailored prompt text, nothing else.
`;

    try {
      const tailored = await chatText({ page: 'AIReadySkillsPage',
        messages: [{ role: 'user', content: userMessage }],
        system: 'You are an expert educational assessment designer creating contextualised certification challenge prompts. Always honour the communication level instruction — it controls vocabulary complexity and sentence structure. Each prompt must be specific to the learner\'s real-world context and structured so the learner knows exactly what to write.',
        max_tokens: 1000,
        temperature: 0.7
      });
      return tailored.trim();
    } catch (err) {
      console.error('Error tailoring prompt:', err);
      return selectedAssessment.certification_prompt;
    }
  };

  const handleResponseSubmit = async () => {
    if (!userResponse.trim()) {
      setError('Please provide a response before submitting');
      return;
    }

    if (!selectedAssessment || !selectedCertification || !user?.id) return;

    try {
      setLoading(true);
      setError(null);

      const evaluationResult = await evaluateResponse();
      
      if (!evaluationResult) {
        throw new Error('Evaluation failed');
      }

      setEvaluationScore(evaluationResult.score);
      setEvaluationEvidence(evaluationResult.evidence);

      await saveEvaluationToDatabase(evaluationResult.score, evaluationResult.evidence);

      const advice = await generateImprovementAdvice(evaluationResult.score, evaluationResult.evidence);
      setImprovementAdvice(advice);

      if (evaluationResult.score >= 2) {
        await triggerConfetti();
      }

      setViewMode('results');
    } catch (err) {
      console.error('Error submitting response:', err);
      setError('Failed to evaluate response. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const evaluateResponse = async () => {
    if (!selectedAssessment) return null;

    const pueNote = learnerContext.entrepreneurialContext.trim()
      ? `\nEntrepreneurial/PUE Angle: ${learnerContext.entrepreneurialContext.trim()}\nWhere the learner connects their answer to real economic value, costs, benefits, or productive outcomes, this is evidence of applied, real-world thinking and should be rewarded at higher rubric levels.`
      : '';

    const evaluationPrompt = `
You are evaluating a learner's INDEPENDENT written response for a certification assessment. The learner completed this without any AI coaching — this is a genuine demonstration of their own knowledge and skill.

Certification: ${selectedCertification?.certification_name}
Skill/Assessment: ${selectedAssessment.assessment_name}
Description: ${selectedAssessment.description}

Learner Context:
- Topic: ${learnerContext.topic}
- Setting: ${learnerContext.setting}
- Constraints: ${learnerContext.constraints}
- Audience: ${learnerContext.audience}${pueNote}

Challenge Prompt Given to Learner:
${tailoredPrompt || selectedAssessment.certification_prompt}

Learner's Independent Response:
${userResponse}

Rubric:
- Level 0 (No Evidence): ${selectedAssessment.certification_level0_metric}
- Level 1 (Emerging): ${selectedAssessment.certification_level1_metric}
- Level 2 (Proficient): ${selectedAssessment.certification_level2_metric}
- Level 3 (Advanced): ${selectedAssessment.certification_level3_metric}

Evaluate the learner's response:
1. Assign a score (0, 1, 2, or 3) based strictly on the rubric
2. Write structured evidence feedback in markdown format (see below)
3. Be fair and encouraging — this is a young learner in rural Nigeria doing their best

Format the "evidence" field as markdown with this structure:
- Start with a one-sentence overall verdict that includes the score label in bold (e.g. **PROFICIENT**).
- Then write one paragraph per rubric dimension that applies, each starting with the dimension name in bold (e.g. **Originality & Flexibility:**, **Elaboration:**, **Constraint Awareness:**, **Evidence of Iteration:**). Each paragraph should cite specific phrases or ideas from the learner's response.
- If the score is below Advanced, add a final paragraph starting with **Limitations Preventing Higher Score:** that explains concisely what was missing.
- End with one warm closing sentence about the learner's effort.

Respond ONLY in this JSON format:
{
  "score": <number 0-3>,
  "evidence": "<markdown-formatted feedback as described above>"
}
`;

    try {
      const result = await chatJSON({ page: 'AIReadySkillsPage',
        messages: [{ role: 'user', content: evaluationPrompt }],
        system: 'You are an expert educational assessor evaluating independent learner responses fairly. Ground every score in specific evidence from the response. Return the evidence field as structured markdown with bold dimension headings and clear paragraphs — never as a single unbroken block of text.',
        max_tokens: 800,
        temperature: 0.3
      });
      return { score: result.score, evidence: result.evidence };
    } catch (err) {
      console.error('Error calling evaluation API:', err);
      return null;
    }
  };

  const saveEvaluationToDatabase = async (score: number, evidence: string) => {
    if (!user?.id || !selectedAssessment || !selectedCertification) return;

    const columnBase = `certification_${selectedCertification.certification_name.toLowerCase().replace(/ /g, '_').replace(/[^a-z0-9_]/g, '')}_${selectedAssessment.assessment_name.toLowerCase().replace(/ /g, '_').replace(/[^a-z0-9_]/g, '')}`;
    const activityName = `${selectedCertification.certification_name} Certification`;
    
    let progressStatus = 'started';
    if (score >= 3) {
      progressStatus = 'completed';
    }
    
    try {
      const { data: existingRecord } = await supabase
        .from('dashboard')
        .select('id, progress')
        .eq('user_id', user.id)
        .eq('activity', activityName)
        .maybeSingle();

      const updateData: any = {
        [`${columnBase}_score`]: score,
        [`${columnBase}_evidence`]: evidence,
        updated_at: new Date().toISOString()
      };

      if (existingRecord) {
        if (existingRecord.progress !== 'completed' || progressStatus === 'completed') {
          updateData.progress = progressStatus;
        }
        
        await supabase
          .from('dashboard')
          .update(updateData)
          .eq('id', existingRecord.id);
      } else {
        await supabase
          .from('dashboard')
          .insert({
            user_id: user.id,
            activity: activityName,
            category_activity: 'Certification',
            progress: progressStatus,
            ...updateData
          });
      }

      console.log('[Certifications] Saved to dashboard:', { score, progressStatus, activityName });

      await fetchScoresForCertification(selectedCertification);
    } catch (err) {
      console.error('Error saving to database:', err);
      throw err;
    }
  };

  const fetchRelevantLearningModules = async (
    certificationName: string,
    assessmentName: string
  ): Promise<LearningModule[]> => {
    if (!user?.id) return [];

    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('grade_level, continent')
        .eq('id', user.id)
        .single();

      const userGradeLevel = profile?.grade_level ?? null;
      const userContinent = profile?.continent || 'North America';

      const categoryMap: Record<string, Record<string, { category: string; sub_category: string }>> = {
        'Critical Thinking': {
          'Reflection': { category: 'Skills', sub_category: 'Critical Thinking' },
          'Claim Evaluation': { category: 'Skills', sub_category: 'Critical Thinking' },
          'Reasoning Trace': { category: 'Skills', sub_category: 'Critical Thinking' },
          'Logical Reasoning': { category: 'Skills', sub_category: 'Critical Thinking' }
        },
        'Creativity': {
          'Originality': { category: 'Skills', sub_category: 'Creativity' },
          'Creative Iteration': { category: 'Skills', sub_category: 'Creativity' },
          'Exploration': { category: 'Skills', sub_category: 'Creativity' },
          'Risk and Exploration': { category: 'Skills', sub_category: 'Creativity' }
        },
        'Communication': {
          'Clarity': { category: 'Skills', sub_category: 'Communication' },
          'Listening Response': { category: 'Skills', sub_category: 'Communication' },
          'Synthesis': { category: 'Skills', sub_category: 'Communication' }
        },
        'Problem Solving': {
          'Problem Definition': { category: 'Skills', sub_category: 'Problem Solving' },
          'Iteration': { category: 'Skills', sub_category: 'Problem Solving' },
          'Outcome Measurement': { category: 'Skills', sub_category: 'Problem Solving' }
        },
        'Vibe Coding': {
          'Problem Decomposition': { category: 'Skills', sub_category: 'Coding' },
          'Prompt Engineering': { category: 'Skills', sub_category: 'Coding' },
          'AI Output Evaluation': { category: 'Skills', sub_category: 'Coding' },
          'Metacognitive Control': { category: 'Skills', sub_category: 'Coding' }
        },
        'Digital Fluency': {
          'Internet Navigation': { category: 'Skills', sub_category: 'Digital Fluency' },
          'Troubleshooting': { category: 'Skills', sub_category: 'Digital Fluency' },
          'Device File Control': { category: 'Skills', sub_category: 'Digital Fluency' }
        }
      };

      const mapping = categoryMap[certificationName]?.[assessmentName];
      if (!mapping) {
        const fallbackMapping = { category: 'Skills', sub_category: certificationName };
        return await queryLearningModules(fallbackMapping, userGradeLevel, userContinent, assessmentName);
      }

      return await queryLearningModules(mapping, userGradeLevel, userContinent, assessmentName);
    } catch (err) {
      console.error('Error fetching learning modules:', err);
      return [];
    }
  };

  const queryLearningModules = async (
    mapping: { category: string; sub_category: string },
    gradeLevel: number | null,
    continent: string,
    assessmentName: string
  ): Promise<LearningModule[]> => {
    let query = supabase
      .from('learning_modules')
      .select('learning_module_id, title, description, category, sub_category, grade_level')
      .eq('category', mapping.category)
      .eq('public', 1)
      .limit(5);

    // Only narrow by grade when we actually know the learner's grade level —
    // an unknown grade should see the full 1-4 range, not be pushed toward older content.
    if (gradeLevel !== null) {
      query = query
        .lte('grade_level', gradeLevel + 2)
        .gte('grade_level', Math.max(1, gradeLevel - 2));
    }

    const { data: continentModules } = await query.eq('continent', continent);
    const { data: allModules } = await query;

    const modules = continentModules && continentModules.length > 0 ? continentModules : allModules;

    const filteredModules = modules?.filter(m => 
      m.sub_category?.includes(mapping.sub_category) || 
      m.sub_category?.toLowerCase().includes(assessmentName.toLowerCase()) ||
      m.sub_category?.toLowerCase().includes(mapping.sub_category.toLowerCase())
    ) || [];

    return filteredModules.length > 0 ? filteredModules.slice(0, 3) : (modules?.slice(0, 3) || []);
  };

  const generateImprovementAdvice = async (score: number, evidence: string) => {
    if (!selectedAssessment || !selectedCertification) return '';

    const recommendedModules = await fetchRelevantLearningModules(
      selectedCertification.certification_name,
      selectedAssessment.assessment_name
    );

    const { communicationStrategy: cs, learningStrategy: ls } = personalityBaseline;
    const personalizedCoachBlock = (cs || ls) ? `
Learner's Personalized Profile:
${cs ? `- Communication Preference: tone=${cs.preferred_tone ?? 'n/a'}, interaction=${cs.interaction_style ?? 'n/a'}, detail=${cs.detail_level ?? 'n/a'}` : ''}
${cs?.recommendations?.length ? `  Communication Tips: ${cs.recommendations.join('; ')}` : ''}
${ls ? `- Learning Preference: style=${ls.learning_style ?? 'n/a'}, motivation=${ls.motivation_approach ?? 'n/a'}, pacing=${ls.pacing_preference ?? 'n/a'}` : ''}
${ls?.recommendations?.length ? `  Learning Tips: ${ls.recommendations.join('; ')}` : ''}

Adapt your feedback tone, phrasing, and examples to match this profile.
` : '';

    const feedbackLevelBlock = communicationLevel <= 0
      ? `
COMMUNICATION LEVEL: 0 — Write feedback using ONLY the simplest words. Maximum 2 short sentences per point. No jargon at all. Be very warm and encouraging. Use emojis sparingly to anchor meaning (e.g. "Well done! 👏").`
      : communicationLevel === 1
      ? `
COMMUNICATION LEVEL: 1 — Write feedback in short, clear sentences. One idea per sentence. Explain any skill terms immediately in plain language. Use familiar examples from farming, markets, or community life. Warm, encouraging tone. Keep points brief.`
      : communicationLevel === 2
      ? `
COMMUNICATION LEVEL: 2 — Write feedback in clear, structured language. Brief explanations for skill terms where helpful. Concise paragraphs. Encouraging and constructive tone.`
      : `
COMMUNICATION LEVEL: 3 — Write feedback in standard, well-structured English with appropriate technical vocabulary. Detailed and precise where helpful.`;

    const advicePrompt = score === 3 
      ? `
You are a supportive learning coach providing celebratory feedback.

Certification: ${selectedCertification?.certification_name}
Assessment: ${selectedAssessment.assessment_name}
Learner's Score: ${score}/3 (Advanced - HIGHEST LEVEL!)
Evidence: ${evidence}
${personalizedCoachBlock}${feedbackLevelBlock}
Learner's Response:
${userResponse}

Provide encouraging, celebratory feedback that:
1. Celebrates their achievement of the highest level
2. Highlights what they did exceptionally well
3. Mentions how they can apply these skills in real-world contexts
4. Optionally suggests ways to mentor others or share their expertise
${(cs || ls) ? '5. Deliver this feedback in a style that matches their communication and learning preferences listed above' : ''}

Keep your feedback positive and empowering (3-5 key points). Write at the communication level specified above.
`
      : `
You are a supportive learning coach providing improvement advice.

Certification: ${selectedCertification?.certification_name}
Assessment: ${selectedAssessment.assessment_name}
Learner's Score: ${score}/3
Evidence: ${evidence}
${personalizedCoachBlock}${feedbackLevelBlock}
Learner's Response:
${userResponse}

Rubric Levels:
- Level 0: ${selectedAssessment.certification_level0_metric}
- Level 1: ${selectedAssessment.certification_level1_metric}
- Level 2: ${selectedAssessment.certification_level2_metric}
- Level 3: ${selectedAssessment.certification_level3_metric}

Provide specific, actionable advice on how the learner can improve their response to reach the next level. 
Be encouraging and constructive.
${(cs || ls) ? 'Deliver your advice in a tone and style that matches their communication and learning preferences listed above.' : ''}

Keep your advice concise (3-5 key points). Write at the communication level specified above.
`;

    try {
      const advice = await chatText({ page: 'AIReadySkillsPage',
        messages: [{ role: 'user', content: advicePrompt }],
        system: 'You are an encouraging and supportive learning coach. Always honour the communication level instruction — it controls vocabulary complexity and sentence structure. When a learner profile is provided, also tailor your tone, examples, and delivery style to match their preferences.',
        max_tokens: 800,
        temperature: 0.7
      });
      
      let fullAdvice = advice;
      
      if (score < 3 && recommendedModules.length > 0) {
        fullAdvice += '\n\n**📚 Recommended Practice Modules:**\n\n';
        fullAdvice += 'To practice and improve your skills in this area, try these learning modules:\n\n';
        
        recommendedModules.forEach((module, index) => {
          fullAdvice += `${index + 1}. **${module.title}**\n`;
          fullAdvice += `   ${module.description}\n`;
          fullAdvice += `   [Start Module →](/learning/ai/${module.learning_module_id})\n\n`;
        });
      }
      
      return fullAdvice;
    } catch (err) {
      console.error('Error generating advice:', err);
      return score === 3 
        ? 'Excellent work! You demonstrated advanced proficiency in this assessment.'
        : 'Keep practicing and reviewing the rubric criteria to improve your responses.';
    }
  };

  const triggerConfetti = async () => {
    try {
      if (typeof window !== 'undefined') {
        const confettiModule = await import('canvas-confetti').catch(() => null);
        if (confettiModule?.default) {
          confettiModule.default({
            particleCount: 100,
            spread: 70,
            origin: { y: 0.6 }
          });
        }
      }
    } catch (error) {
      console.log('Confetti celebration!');
    }
  };

  const checkAllAssessmentsPassed = () => {
    if (!selectedCertification || assessmentScores.length === 0) return false;
    return assessmentScores.every(score => 
      score && score.score !== null && score.score !== undefined && score.score >= 2
    );
  };

  const getRemainingAssessments = () => {
    return assessmentScores.filter(score => 
      !score || score.score === null || score.score === undefined || score.score < 2
    );
  };

  const generateCertificate = async () => {
    if (!selectedCertification) return;

    try {
      setGeneratingCertificate(true);
      setError(null);
      
      const jsPDFModule = await import('jspdf').catch(() => null);
      if (!jsPDFModule) {
        alert('PDF generation not available. Please contact support.');
        setGeneratingCertificate(false);
        return;
      }

      const { jsPDF } = jsPDFModule;
      const doc = new jsPDF({
        orientation: 'landscape',
        unit: 'mm',
        format: 'a4'
      });

      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();

      const minScore = Math.min(...assessmentScores.filter(s => s.score !== null).map(s => s.score as number));
      const certLevel = minScore === 3 ? 'Advanced' : minScore === 2 ? 'Proficient' : 'Emerging';

      const CATEGORY_DESCRIPTIONS: Record<string, string> = {
        'Critical Thinking': 'This certification is grounded in the Partnership for 21st Century Learning Framework for 21st Century Learning, which identifies critical thinking as essential for learners to analyze and evaluate evidence, arguments, and claims, synthesize information across sources, and make reasoned judgments and decisions in complex contexts.',
        'Creativity': 'This certification is grounded in the Partnership for 21st Century Learning Framework for 21st Century Learning, which identifies creativity and innovation as essential competencies for generating new ideas, refining existing concepts, and producing meaningful solutions in academic, professional, and community contexts.',
        'Problem-Solving': 'This certification is grounded in the Partnership for 21st Century Learning Framework\'s emphasis on critical thinking and problem-solving as the ability to identify, analyze, and resolve complex issues using structured reasoning and evidence-based strategies.',
        'Communication': 'This certification is grounded in the Partnership for 21st Century Learning Framework for 21st Century Learning, which defines communication as the ability to articulate thoughts and ideas effectively using oral, written, and digital media, and to collaborate productively with diverse teams.',
        'Digital Fluency': 'This certification is grounded in the Partnership for 21st Century Learning Framework\'s emphasis on information, media, and technology literacy, and in the African Union STISA-2024 priority to build Africa\'s digital and knowledge-based economy.',
        'Vibe Coding': 'The Vibe Coding Certification is an applied computational thinking and AI collaboration credential. While not tied to a single global standard, it synthesizes principles from the Partnership for 21st Century Learning emphasis on critical thinking, creativity, collaboration, and technology literacy, and aligns with the innovation and knowledge-economy priorities of African Union STISA-2024.'
      };

      try {
        console.log('[Certificate] Loading watermark...');
        
        const watermarkPath = `/Skills_${selectedCertification.certification_name.replace(/ /g, '_')}_Watermark.png`;
        const response = await fetch(watermarkPath).catch(() => null);
        
        if (response && response.ok) {
          const blob = await response.blob();
          
          const base64Image = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.onerror = () => reject(new Error('FileReader failed'));
            reader.readAsDataURL(blob);
          });
          
          const imgWidth = 180;
          const imgHeight = 126;
          const imgX = (pageWidth - imgWidth) / 2;
          const imgY = (pageHeight - imgHeight) / 2 + 5;
          
          doc.addImage(base64Image, 'PNG', imgX, imgY, imgWidth, imgHeight, undefined, 'NONE');
          console.log('[Certificate] ✅ Watermark added successfully!');
        }
      } catch (error) {
        console.error('[Certificate] ❌ Watermark failed:', error);
      }

      doc.setLineWidth(3);
      doc.setDrawColor(138, 43, 226);
      doc.rect(10, 10, pageWidth - 20, pageHeight - 20);

      doc.setLineWidth(1);
      doc.setDrawColor(219, 112, 147);
      doc.rect(15, 15, pageWidth - 30, pageHeight - 30);

      doc.setFontSize(36);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(138, 43, 226);
      doc.text('AI Ready Skill Certification', pageWidth / 2, 28, { align: 'center' });

      doc.setFontSize(28);
      doc.setTextColor(219, 112, 147);
      doc.text(selectedCertification.certification_name, pageWidth / 2, 40, { align: 'center' });

      doc.setFontSize(20);
      doc.setTextColor(80, 80, 80);
      doc.text(`Level of Achievement: ${certLevel}`, pageWidth / 2, 50, { align: 'center' });

      doc.setFontSize(14);
      doc.setTextColor(80, 80, 80);
      doc.text('This certificate is proudly presented to', pageWidth / 2, 60, { align: 'center' });

      doc.setFontSize(36);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(0, 0, 0);
      doc.text(certificateName || 'Recipient Name', pageWidth / 2, 72, { align: 'center' });

      doc.setFontSize(13);
      doc.setFont('helvetica', 'italic');
      doc.setTextColor(60, 60, 60);
      
      const description = CATEGORY_DESCRIPTIONS[selectedCertification.certification_name] || '';
      const descLines = doc.splitTextToSize(description, pageWidth - 40);
      
      let yPos = 82;
      descLines.forEach((line: string) => {
        doc.text(line, pageWidth / 2, yPos, { align: 'center' });
        yPos += 4.5;
      });

      yPos += 4;
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(138, 43, 226);
      doc.text('Assessment Competencies:', 20, yPos);

      const firstName = certificateName.split(' ')[0] || 'The recipient';

      console.log('[Certificate] Generating concise competency descriptions...');
      const competencyDescriptions: { name: string; score: number; level: string; description: string }[] = [];
      
      for (const scoreData of assessmentScores) {
        if (scoreData.score === null) continue;
        
        const level = scoreData.score === 3 ? 'Advanced' : 
                      scoreData.score === 2 ? 'Proficient' : 
                      scoreData.score === 1 ? 'Emerging' : 'No Evidence';
        
        try {
          const conciseDescription = await chatText({ page: 'AIReadySkillsPage',
            messages: [{
              role: 'user',
              content: `Generate a concise 1-2 sentence competency description for a professional certificate.

Assessment: ${scoreData.assessment_name}
Score Level: ${level} (${scoreData.score}/3)
Full Evidence: ${scoreData.evidence}
Recipient First Name: ${firstName}

Create a professional, concise statement in the format:
"${firstName} demonstrated the ability to [specific skill/competency]."

The description should:
- Be 1-2 sentences maximum
- Be specific and professional
- Capture the essence of the achievement
- Use action-oriented language
- Start with "${firstName} demonstrated"

Return ONLY the description, nothing else.`
            }],
            system: 'You are an expert at writing concise, professional competency statements for certificates.',
            max_tokens: 150,
            temperature: 0.7
          });
          
          competencyDescriptions.push({
            name: scoreData.assessment_name,
            score: scoreData.score,
            level,
            description: conciseDescription.trim()
          });
        } catch (error) {
          competencyDescriptions.push({
            name: scoreData.assessment_name,
            score: scoreData.score,
            level,
            description: `${firstName} demonstrated ${level.toLowerCase()} proficiency in ${scoreData.assessment_name.toLowerCase()}.`
          });
        }
      }

      doc.setFontSize(11);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(40, 40, 40);

      yPos += 7;
      const leftCol = 20;
      const rightCol = pageWidth / 2 + 5;
      const maxWidth = (pageWidth / 2) - 25;
      let columnSwitch = false;

      competencyDescriptions.forEach((comp, index) => {
        const xPos = columnSwitch ? rightCol : leftCol;
        
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(12);
        doc.setTextColor(40, 40, 40);
        doc.text(`${comp.name}: ${comp.score}/3 - ${comp.level}`, xPos, yPos);
        
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(13);
        doc.setTextColor(60, 60, 60);
        
        const lines = doc.splitTextToSize(comp.description, maxWidth);
        
        yPos += 5;
        lines.forEach((line: string) => {
          doc.text(line, xPos, yPos);
          yPos += 4.5;
        });
        
        yPos += 3;
        
        const halfPoint = Math.ceil(competencyDescriptions.length / 2);
        if (!columnSwitch && index === halfPoint - 1) {
          columnSwitch = true;
          const descLineCount = descLines.length;
          yPos = 82 + (descLineCount * 4.5) + 4 + 7;
        }
      });

      const footerY = pageHeight - 34.35;
      doc.setFontSize(36);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(138, 43, 226);
      await addBrandingToPDF({ doc, pageWidth, pageHeight, footerY, branding });

      doc.setFontSize(14);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(80, 80, 80);
      const date = new Date().toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      });
      doc.text(`Date: ${date}`, pageWidth / 2, footerY + 12, { align: 'center' });

      const filename = `AI_Ready_Skill_Certificate_${selectedCertification.certification_name.replace(/ /g, '_')}_${certificateName.replace(/ /g, '_')}.pdf`;
      const pdfBlob = doc.output('blob');
      
      if (user?.id) {
        try {
          const certNameSlug = selectedCertification.certification_name.toLowerCase().replace(/ /g, '_');
          const storagePath = `${user.id}/${certNameSlug}_certificate.pdf`;
          
          const { data: uploadData, error: uploadError } = await supabase.storage
            .from('certificates')
            .upload(storagePath, pdfBlob, {
              contentType: 'application/pdf',
              upsert: true
            });
          
          if (uploadError) {
            console.error('[Certificate] Upload error:', uploadError);
          } else {
            const { data: urlData } = supabase.storage
              .from('certificates')
              .getPublicUrl(storagePath);
            
            const activityName = `${selectedCertification.certification_name} Certification`;
            await supabase
              .from('dashboard')
              .update({ certificate_pdf_url: urlData.publicUrl })
              .eq('user_id', user.id)
              .eq('activity', activityName);
          }
        } catch (storageError) {
          console.error('[Certificate] Storage operation failed:', storageError);
        }
      }
      
      const url = URL.createObjectURL(pdfBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      link.click();
      URL.revokeObjectURL(url);
      
      setGeneratingCertificate(false);
      
      try {
        if (typeof window !== 'undefined') {
          const confettiModule = await import('canvas-confetti').catch(() => null);
          if (confettiModule?.default) {
            confettiModule.default({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
          }
        }
      } catch (error) {
        console.log('Confetti celebration!');
      }
    } catch (err) {
      console.error('Error generating certificate:', err);
      setError('Failed to generate certificate. Please try again.');
      setGeneratingCertificate(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Render functions
  // ---------------------------------------------------------------------------

  const renderOverview = () => {
    if (!selectedCertification) return null;

    const allPassed = checkAllAssessmentsPassed();

    return (
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-ink mb-3">AI Ready Skills Certifications</h1>
          <p className="text-lg text-body max-w-3xl mb-4">
            Build essential skills and demonstrate your expertise across multiple certification areas.
            Each certification validates your proficiency in critical competencies. These are skills you need for AI proficiency and life.
          </p>

          {certifications.length > 1 && (
            <div className="bg-surface border border-hair rounded-xl p-4 max-w-2xl">
              <label className="block text-sm font-semibold text-ink mb-2">Select Certification:</label>
              <select
                value={selectedCertification.certification_name}
                onChange={(e) => {
                  const cert = certifications.find(c => c.certification_name === e.target.value);
                  if (cert) handleCertificationSelect(cert);
                }}
                className="w-full px-4 py-2 border border-hair bg-card text-ink rounded-lg font-semibold focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent"
              >
                {certifications.map(cert => (
                  <option key={cert.certification_name} value={cert.certification_name}>
                    {cert.certification_name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Why This Matters */}
        <div className="bg-card border border-hair rounded-2xl p-8 shadow-sm mb-8">
          <h2 className="text-3xl font-bold text-ink mb-6">Why {selectedCertification.certification_name} Matters</h2>
          <div className="grid md:grid-cols-3 gap-6">
            <div className="bg-paper rounded-xl p-6 border border-hair">
              <Trophy className="h-10 w-10 text-accent mb-4" />
              <h3 className="text-xl font-bold text-ink mb-3">For Life</h3>
              <p className="text-body">
                These skills are foundational for navigating modern challenges and making informed decisions.
              </p>
            </div>

            <div className="bg-paper rounded-xl p-6 border border-hair">
              <Sparkles className="h-10 w-10 text-accent mb-4" />
              <h3 className="text-xl font-bold text-ink mb-3">For Employment</h3>
              <p className="text-body">
                Employers seek candidates with demonstrated competence in these critical professional skills.
              </p>
            </div>

            <div className="bg-paper rounded-xl p-6 border border-hair">
              <Brain className="h-10 w-10 text-accent mb-4" />
              <h3 className="text-xl font-bold text-ink mb-3">For AI Leverage</h3>
              <p className="text-body">
                Strong foundational skills enable you to use AI tools more effectively and critically evaluate outputs.
              </p>
            </div>
          </div>
        </div>

        {/* Progress Section */}
        {selectedCertification.assessments.length > 0 && (
          <div className="bg-card border border-hair rounded-2xl p-8 shadow-sm mb-8">
            <h2 className="text-2xl font-bold text-ink mb-6 flex items-center gap-3">
              <Trophy className="h-8 w-8 text-yellow-500" />
              Your Progress in {selectedCertification.certification_name}
            </h2>
            
            <div className="space-y-4 mb-6">
              {selectedCertification.assessments.map((assessment) => {
                const score = assessmentScores.find(s => s.assessment_name === assessment.assessment_name);
                const isPassed = score?.score !== null && score?.score !== undefined && score.score >= 2;
                const isCompleted = score?.score === 3;
                
                return (
                  <button
                    key={assessment.assessment_name}
                    onClick={() => {
                      if (!isCompleted) {
                        setSelectedAssessment(assessment);
                        setViewMode('define-context');
                      }
                    }}
                    disabled={isCompleted}
                    className={`w-full flex items-center justify-between p-4 rounded-lg transition-all ${
                      isCompleted 
                        ? 'bg-surface cursor-not-allowed opacity-60' 
                        : 'bg-paper hover:bg-surface hover:shadow-md cursor-pointer'
                    }`}
                  >
                    <div className="flex-1 text-left">
                      <h3 className="font-semibold text-ink">{assessment.assessment_name}</h3>
                      <p className="text-sm text-body">{assessment.description}</p>
                    </div>
                    <div className="flex items-center gap-4">
                      {score && score.score !== null && score.score !== undefined ? (
                        <div className="flex items-center gap-2">
                          <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                            score.score >= 2 
                              ? 'bg-green-100 text-green-800' 
                              : 'bg-yellow-100 text-yellow-800'
                          }`}>
                            Score: {score.score}/3 - {
                              score.score === 0 ? 'No Evidence' : 
                              score.score === 1 ? 'Emerging' :
                              score.score === 2 ? 'Proficient' : 'Advanced'
                            }
                          </span>
                          {isPassed && <CheckCircle className="h-6 w-6 text-green-600" />}
                          {isCompleted && (
                            <span className="text-xs text-green-700 font-medium">(Completed)</span>
                          )}
                        </div>
                      ) : (
                        <span className="px-3 py-1 rounded-full text-sm font-medium bg-surface text-body">
                          Not Started
                        </span>
                      )}
                      {!isCompleted && (
                        <ArrowRight className="h-5 w-5 text-muted" />
                      )}
                    </div>
                  </button>
                );
              })}
            </div>

            <button
              onClick={() => {
                if (allPassed) {
                  setViewMode('certificate');
                } else {
                  setViewMode('select-assessment');
                }
              }}
              className="w-full bg-accent text-white px-6 py-3 rounded-lg font-bold text-lg hover:bg-accent/90 transition-colors"
            >
              {allPassed ? 'Generate Certificate' : 'Begin Assessment'}
            </button>
          </div>
        )}

        {/* How Certification Works */}
        <div className="bg-card border border-hair rounded-2xl p-8 shadow-sm mb-8">
          <h2 className="text-3xl font-bold text-ink mb-6">How Certification Works</h2>
          
          <div className="mb-8">
            <p className="text-lg text-body mb-4">
              To earn your {selectedCertification.certification_name} certification, you must demonstrate competence 
              (score of <strong>Proficient or higher</strong>) in <strong>all assessments</strong>. 
            </p>
            <p className="text-lg text-body">
              You can retake evaluations as many times as needed — there's no limit. Each assessment is uniquely tailored to your chosen context.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            <div className="relative">
              <div className="bg-paper rounded-xl p-6 h-full border border-hair">
                <div className="flex items-center gap-3 mb-4">
                  <div className="bg-accent text-white rounded-full w-10 h-10 flex items-center justify-center font-bold text-lg">1</div>
                  <ClipboardList className="h-8 w-8 text-accent" />
                </div>
                <h3 className="text-xl font-bold text-ink mb-3">Define Context</h3>
                <p className="text-body">Choose a real-world topic, setting, constraints, and audience for your assessment.</p>
              </div>
              <ArrowRight className="hidden md:block absolute top-1/2 -right-8 transform -translate-y-1/2 h-8 w-8 text-muted" />
            </div>

            <div className="relative">
              <div className="bg-paper rounded-xl p-6 h-full border border-hair">
                <div className="flex items-center gap-3 mb-4">
                  <div className="bg-accent text-white rounded-full w-10 h-10 flex items-center justify-center font-bold text-lg">2</div>
                  <Brain className="h-8 w-8 text-accent" />
                </div>
                <h3 className="text-xl font-bold text-ink mb-3">Complete Assessment</h3>
                <p className="text-body">Respond to the personalized prompt demonstrating your mastery.</p>
              </div>
              <ArrowRight className="hidden md:block absolute top-1/2 -right-8 transform -translate-y-1/2 h-8 w-8 text-muted" />
            </div>

            <div className="relative">
              <div className="bg-paper rounded-xl p-6 h-full border border-green-300">
                <div className="flex items-center gap-3 mb-4">
                  <div className="bg-green-600 text-white rounded-full w-10 h-10 flex items-center justify-center font-bold text-lg">3</div>
                  <GraduationCap className="h-8 w-8 text-green-600" />
                </div>
                <h3 className="text-xl font-bold text-ink mb-3">Receive Evaluation</h3>
                <p className="text-body">Get your score, evidence, and personalized advice for improvement.</p>
              </div>
            </div>
          </div>
        </div>

        {/* Framework Section */}
        <div className="bg-card border border-hair rounded-2xl p-8 shadow-sm">
          <h2 className="text-2xl font-bold text-ink mb-4">Backed by Global Frameworks</h2>
          <p className="text-lg text-body mb-4">Our certifications are aligned with internationally recognized standards:</p>
          <div className="flex flex-wrap gap-6 items-center justify-center">
            <div className="text-center">
              <div className="text-3xl font-bold text-accent">ISTE</div>
              <div className="text-sm text-body">International Society for<br />Technology in Education</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-accent">UNESCO</div>
              <div className="text-sm text-body">United Nations Educational,<br />Scientific and Cultural Organization</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-accent">CSTA</div>
              <div className="text-sm text-body">Computer Science<br />Teachers Association</div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderSelectAssessment = () => {
    if (!selectedCertification) return null;

    return (
      <div className="max-w-4xl mx-auto">
        <button
          onClick={() => setViewMode('overview')}
          className="flex items-center gap-2 text-accent hover:underline mb-6"
        >
          <ArrowLeft className="h-5 w-5" />
          Back to Overview
        </button>

        <div className="bg-card border border-hair rounded-2xl p-8 shadow-sm">
          <h2 className="text-3xl font-bold text-ink mb-2">{selectedCertification.certification_name}</h2>
          <p className="text-body mb-6">Select an assessment to begin</p>

          <div className="space-y-4">
            {selectedCertification.assessments.map((assessment) => {
              const score = assessmentScores.find(s => s.assessment_name === assessment.assessment_name);
              const isPassed = score?.score !== null && score?.score !== undefined && score.score >= 2;

              return (
                <button
                  key={assessment.id}
                  onClick={() => handleSelectAssessment(assessment)}
                  className="w-full flex items-center justify-between p-6 bg-paper rounded-xl hover:bg-surface hover:shadow-md transition-all text-left"
                >
                  <div className="flex-1">
                    <h3 className="text-xl font-bold text-ink mb-2">{assessment.assessment_name}</h3>
                    <p className="text-body">{assessment.description}</p>
                  </div>
                  <div className="flex items-center gap-4">
                    {score && score.score !== null && score.score !== undefined ? (
                      <div className="flex items-center gap-2">
                        <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                          score.score >= 2 ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
                        }`}>
                          {score.score === 0 ? 'No Evidence' : 
                           score.score === 1 ? 'Emerging' :
                           score.score === 2 ? 'Proficient' : 'Advanced'}
                        </span>
                        {isPassed && <CheckCircle className="h-6 w-6 text-green-600" />}
                      </div>
                    ) : (
                      <span className="px-3 py-1 rounded-full text-sm font-medium bg-surface text-body">
                        Not Started
                      </span>
                    )}
                    <ArrowRight className="h-6 w-6 text-muted" />
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  const renderDefineContext = () => (
    <div className="max-w-4xl mx-auto">
      <button
        onClick={() => setViewMode('select-assessment')}
        className="flex items-center gap-2 text-accent hover:underline mb-6"
      >
        <ArrowLeft className="h-5 w-5" />
        Back to Selection
      </button>

      <div className="bg-card border border-hair rounded-2xl p-8 shadow-sm">
        <h2 className="text-3xl font-bold text-ink mb-2">{selectedAssessment?.assessment_name}</h2>
        <p className="text-body mb-6">{selectedAssessment?.description}</p>

        <div className="bg-amber-50 border-2 border-amber-300 rounded-xl p-5 mb-8 flex items-start gap-4">
          <span className="text-3xl flex-shrink-0">🎓</span>
          <div>
            <p className="font-bold text-amber-900 text-sm mb-1">This is a certification attempt — you will write your response independently</p>
            <p className="text-amber-800 text-sm leading-relaxed">
              Once you start the assessment, you'll receive a personalised challenge based on your context below. You must write your full response on your own — <strong>no AI coaching or hints</strong> during the attempt. The AI will only evaluate what you submit.
            </p>
            <p className="text-amber-700 text-xs mt-2 font-medium">
              Tip: Connect your context to something you genuinely care about — a business idea, farm challenge, community service, or product. This will make your response stronger and more specific.
            </p>
          </div>
        </div>

        <div className="space-y-6">
          <div>
            <label className="block text-sm font-semibold text-body mb-2">
              Topic <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={learnerContext.topic}
              onChange={(e) => setLearnerContext({...learnerContext, topic: e.target.value})}
              placeholder="e.g. Solar-powered cold storage for fish, AI crop disease detection, Mobile money for market traders"
              className="w-full px-4 py-3 border-2 border-hair rounded-lg focus:border-accent focus:outline-none"
            />
            <p className="text-sm text-muted mt-1">What real-world subject, challenge, or project will your assessment focus on?</p>
          </div>

          <div>
            <label className="block text-sm font-semibold text-body mb-2">
              Setting <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={learnerContext.setting}
              onChange={(e) => setLearnerContext({...learnerContext, setting: e.target.value})}
              placeholder="e.g. Rural farming community in Bayelsa, Small market stall in Oloibiri, School in a town with unreliable electricity"
              className="w-full px-4 py-3 border-2 border-hair rounded-lg focus:border-accent focus:outline-none"
            />
            <p className="text-sm text-muted mt-1">Where does this challenge occur? Be as specific as possible.</p>
          </div>

          <div>
            <label className="block text-sm font-semibold text-body mb-2">
              Constraints <span className="text-red-500">*</span>
            </label>
            <textarea
              rows={2}
              value={learnerContext.constraints}
              onChange={(e) => setLearnerContext({...learnerContext, constraints: e.target.value})}
              placeholder="e.g. Limited budget, no reliable internet, low digital literacy in the community, seasonal income, language barriers"
              className="w-full px-4 py-3 border-2 border-hair rounded-lg focus:border-accent focus:outline-none resize-none"
            />
            <p className="text-sm text-muted mt-1">What limits what you can do? Budget, infrastructure, time, skills, access to technology?</p>
          </div>

          <div>
            <label className="block text-sm font-semibold text-body mb-2">
              Audience <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={learnerContext.audience}
              onChange={(e) => setLearnerContext({...learnerContext, audience: e.target.value})}
              placeholder="e.g. Smallholder farmers aged 35–60, market traders with low digital skills, cooperative members, local school students"
              className="w-full px-4 py-3 border-2 border-hair rounded-lg focus:border-accent focus:outline-none"
            />
            <p className="text-sm text-muted mt-1">Who is this for? Describe the people who will be affected or who need to understand your solution.</p>
          </div>

          <div className="bg-green-50 border border-green-200 rounded-xl p-4">
            <label className="block text-sm font-semibold text-green-900 mb-1">
              💼 Entrepreneurial or Productive-Use Angle <span className="text-muted font-normal">(strongly recommended)</span>
            </label>
            <p className="text-xs text-green-700 mb-2">
              How does this challenge connect to creating real economic value — earning income, reducing costs, improving a business, or making a community service more productive?
            </p>
            <textarea
              rows={3}
              value={learnerContext.entrepreneurialContext}
              onChange={(e) => setLearnerContext({...learnerContext, entrepreneurialContext: e.target.value})}
              placeholder="e.g. I want to start a paid service diagnosing crop disease using AI so farmers in my area get faster advice."
              className="w-full border border-green-300 rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-green-400 focus:border-green-400 resize-none bg-white"
            />
          </div>

          {error && (
            <div className="bg-red-50 border-2 border-red-300 rounded-lg p-4 flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
              <p className="text-red-700">{error}</p>
            </div>
          )}

          <button
            onClick={handleContextSubmit}
            disabled={loading || !learnerContext.topic || !learnerContext.setting || !learnerContext.constraints || !learnerContext.audience}
            className="w-full bg-accent text-white px-6 py-3 rounded-lg font-bold text-lg hover:bg-accent/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {loading ? (
              <><Loader2 className="h-5 w-5 animate-spin" /> Preparing Your Challenge...</>
            ) : (
              <><GraduationCap className="h-5 w-5" /> Generate My Assessment Challenge</>
            )}
          </button>
        </div>
      </div>
    </div>
  );

  const renderTakeAssessment = () => (
    <div className="max-w-4xl mx-auto">
      <button
        onClick={() => setViewMode('define-context')}
        className="flex items-center gap-2 text-accent hover:underline mb-6"
      >
        <ArrowLeft className="h-5 w-5" />
        Back to Context
      </button>

      <div className="bg-card border border-hair rounded-2xl p-8 shadow-sm">
        <h2 className="text-3xl font-bold text-ink mb-4">{selectedAssessment?.assessment_name}</h2>

        <div className="bg-amber-50 border-2 border-amber-300 rounded-xl p-4 mb-6 flex items-start gap-3">
          <span className="text-2xl flex-shrink-0">✍️</span>
          <div>
            <p className="font-bold text-amber-900 text-sm">Write your response entirely on your own</p>
            <p className="text-amber-800 text-xs mt-0.5">
              This is your certification attempt. Read the challenge carefully, then write your complete answer below. You may use the "Improve my English" button to fix grammar, but the ideas and thinking must be yours.
            </p>
          </div>
        </div>

        <div className="bg-surface border border-hair rounded-xl p-6 mb-6">
          <h3 className="text-lg font-bold text-ink mb-3">Your Context</h3>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div><span className="font-semibold text-body">Topic:</span> {learnerContext.topic}</div>
            <div><span className="font-semibold text-body">Setting:</span> {learnerContext.setting}</div>
            <div><span className="font-semibold text-body">Constraints:</span> {learnerContext.constraints}</div>
            <div><span className="font-semibold text-body">Audience:</span> {learnerContext.audience}</div>
            {learnerContext.entrepreneurialContext && (
              <div className="col-span-2">
                <span className="font-semibold text-body">💼 Productive-Use Angle:</span> {learnerContext.entrepreneurialContext}
              </div>
            )}
          </div>
        </div>

        {/* ── Prompt panel — rendered as formatted markdown ── */}
        <div className="bg-surface border border-hair rounded-xl p-6 mb-6">
          <h3 className="text-lg font-bold text-ink mb-3">Your Personalised Assessment Challenge</h3>
          {renderVoiceBar(
            `${tailoredPrompt || selectedAssessment?.certification_prompt || ''}. Scoring rubric: Level 0, No Evidence: ${selectedAssessment?.certification_level0_metric}. Level 1, Emerging: ${selectedAssessment?.certification_level1_metric}. Level 2, Proficient: ${selectedAssessment?.certification_level2_metric}. Level 3, Advanced: ${selectedAssessment?.certification_level3_metric}.`,
            'Read challenge aloud'
          )}
          <div className="prose prose-sm max-w-none">
            <ReactMarkdown components={markdownComponents}>
              {tailoredPrompt || selectedAssessment?.certification_prompt || ''}
            </ReactMarkdown>
          </div>
          {/* Closing instruction */}
          <div className="mt-4 pt-4 border-t border-hair">
            <p className="text-sm text-ink font-medium leading-relaxed">
              Answer the questions below in the <strong>'Your Response'</strong> section without AI help.
              The more detailed you are in answering each question, the better your evaluation will be.
              Good luck. 🍀
            </p>
          </div>
        </div>

        <div className="bg-green-50 border border-green-300 rounded-xl p-6 mb-6">
          <h3 className="text-lg font-bold text-ink mb-3">Scoring Rubric</h3>
          <p className="text-sm text-body mb-3">Your response will be evaluated on a 0-3 scale:</p>
          <ul className="space-y-2 text-sm">
            <li><strong>0 (No Evidence):</strong> {selectedAssessment?.certification_level0_metric}</li>
            <li><strong>1 (Emerging):</strong> {selectedAssessment?.certification_level1_metric}</li>
            <li><strong>2 (Proficient):</strong> {selectedAssessment?.certification_level2_metric}</li>
            <li><strong>3 (Advanced):</strong> {selectedAssessment?.certification_level3_metric}</li>
          </ul>
        </div>

        <div className="mb-6">
          <label className="block text-sm font-semibold text-body mb-2">
            Your Response <span className="text-red-500">*</span>
          </label>
          <textarea
            value={userResponse}
            onChange={(e) => setUserResponse(e.target.value)}
            className="w-full px-4 py-3 border-2 border-hair rounded-lg focus:border-accent focus:outline-none min-h-[300px] font-mono text-sm"
          />
          <p className="text-sm text-muted mt-2">
            This is your own work — no AI help during the attempt. Address all parts of the challenge above and connect your answer to your real-world context.
          </p>
        </div>

        <div className="flex justify-end mb-3">
          <button
            onClick={handleImproveEnglish}
            disabled={!userResponse.trim() || isImproving}
            className="flex items-center gap-2 bg-accent hover:bg-accent/90 text-white px-4 py-2 rounded-lg font-semibold text-sm disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isImproving
              ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Improving...</>
              : <><Wand2 size={15} /> Improve my English</>}
          </button>
        </div>

        {error && (
          <div className="bg-red-50 border-2 border-red-300 rounded-lg p-4 flex items-start gap-3 mb-6">
            <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
            <p className="text-red-700">{error}</p>
          </div>
        )}

        <button
          onClick={handleResponseSubmit}
          disabled={loading || !userResponse.trim()}
          className="w-full bg-accent text-white px-6 py-3 rounded-lg font-bold text-lg hover:bg-accent/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {loading ? (
            <><Loader2 className="h-5 w-5 animate-spin" /> Evaluating...</>
          ) : (
            <><GraduationCap className="h-5 w-5" /> Submit for Certification Evaluation</>
          )}
        </button>
      </div>
    </div>
  );

  const renderResults = () => {
    const allPassed = checkAllAssessmentsPassed();
    const remaining = getRemainingAssessments();

    return (
      <div className="max-w-4xl mx-auto">
        <div className="bg-card border border-hair rounded-2xl p-8 shadow-sm">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-24 h-24 bg-surface rounded-full mb-4">
              {evaluationScore !== null && evaluationScore >= 2 ? (
                <Sparkles className="h-16 w-16 text-green-600" />
              ) : (
                <RefreshCw className="h-16 w-16 text-yellow-600" />
              )}
            </div>
            
            <h2 className="text-3xl font-bold text-ink mb-2">
              {evaluationScore !== null && evaluationScore >= 2 ? 'Congratulations!' : 'Keep Learning!'}
            </h2>
            
            <p className="text-xl text-body mb-4">
              Your Score: <span className={`font-bold ${
                evaluationScore === 0 ? 'text-red-600' :
                evaluationScore === 1 ? 'text-yellow-600' :
                evaluationScore === 2 ? 'text-green-600' : 'text-green-700'
              }`}>
                {evaluationScore === 0 ? 'No Evidence' :
                 evaluationScore === 1 ? 'Emerging' :
                 evaluationScore === 2 ? 'Proficient' : 'Advanced'}
              </span> ({evaluationScore}/3)
            </p>

            {evaluationScore !== null && evaluationScore >= 2 && (
              <p className="text-lg text-body">
                You've successfully demonstrated proficiency in {selectedAssessment?.assessment_name}!
              </p>
            )}
          </div>

          {/* ── Assessment Feedback — rendered as formatted markdown ── */}
          <div className="bg-paper border-2 border-hair rounded-xl p-6 mb-6">
            <h3 className="text-lg font-bold text-ink mb-3">Assessment Feedback</h3>
            {renderVoiceBar(
              `Your score is ${evaluationScore !== null ? ['No Evidence', 'Emerging', 'Proficient', 'Advanced'][evaluationScore] : ''}. ${evaluationEvidence}${improvementAdvice ? ' ' + improvementAdvice.replace(/\*\*/g, '').replace(/\[.*?\]\(.*?\)/g, '') : ''}`,
              'Hear feedback'
            )}
            <div className="prose prose-sm max-w-none">
              <ReactMarkdown components={markdownComponents}>
                {evaluationEvidence}
              </ReactMarkdown>
            </div>
          </div>

          {/* ── Improvement / Celebratory Advice — rendered as formatted markdown ── */}
          <div className="bg-surface border border-hair rounded-xl p-6 mb-8">
            <h3 className="text-lg font-bold text-ink mb-3 flex items-center gap-2">
              <Brain className="h-6 w-6 text-accent" />
              {evaluationScore !== null && evaluationScore >= 2 
                ? evaluationScore === 3 
                  ? 'Excellent Work!' 
                  : 'Path to Advanced'
                : 'Improvement Advice'}
            </h3>
            <div className="prose prose-sm max-w-none">
              <ReactMarkdown
                components={{
                  ...markdownComponents,
                  a: ({ href, children }: any) => (
                    <Link
                      to={href || '#'}
                      className="text-accent hover:underline font-medium"
                    >
                      {children}
                    </Link>
                  ),
                }}
              >
                {improvementAdvice}
              </ReactMarkdown>
            </div>
          </div>

          {allPassed ? (
            <div className="bg-green-50 border border-green-300 rounded-xl p-6 mb-6">
              <h3 className="text-xl font-bold text-ink mb-3 flex items-center gap-2">
                <Trophy className="h-7 w-7 text-yellow-500" />
                All Assessments Complete!
              </h3>
              <p className="text-body mb-4">
                Congratulations! You've achieved proficiency in all {selectedCertification?.certification_name} assessments. 
                You're ready to receive your certification!
              </p>
              <button
                onClick={() => setViewMode('certificate')}
                className="bg-accent text-white px-6 py-3 rounded-lg font-bold hover:bg-accent/90 transition-colors"
              >
                Get Your Certificate
              </button>
            </div>
          ) : (
            <div className="bg-surface border border-hair rounded-xl p-6 mb-6">
              <h3 className="text-lg font-bold text-ink mb-3">Remaining Assessments</h3>
              <p className="text-body mb-4">
                You still need to achieve Proficient or higher in {remaining.length} assessment{remaining.length !== 1 ? 's' : ''}:
              </p>
              <ul className="list-disc list-inside space-y-1 text-body">
                {remaining.map(r => (
                  <li key={r.assessment_name}>{r.assessment_name}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex gap-4">
            <button
              onClick={() => {
                setViewMode('overview');
                setSelectedAssessment(null);
                setLearnerContext({ topic: '', setting: '', constraints: '', audience: '', entrepreneurialContext: '' });
                setUserResponse('');
                setEvaluationScore(null);
                setImprovementAdvice('');
                setTailoredPrompt('');
              }}
              className="flex-1 bg-gray-200 text-ink px-6 py-3 rounded-lg font-bold hover:bg-gray-300 transition-colors"
            >
              Back to Overview
            </button>
            
            {evaluationScore !== null && evaluationScore < 3 && (
              <button
                onClick={() => {
                  setUserResponse('');
                  setEvaluationScore(null);
                  setImprovementAdvice('');
                  setViewMode('define-context');
                }}
                className="flex-1 bg-accent text-white px-6 py-3 rounded-lg font-bold hover:bg-accent/90 transition-colors"
              >
                {evaluationScore >= 2 ? 'Try for Advanced' : 'Retake Assessment'}
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
        <div className="flex justify-center mb-6">
          <Award className="h-24 w-24 text-accent" />
        </div>

        <h2 className="text-4xl font-bold text-ink mb-4">Congratulations! 🎉</h2>

        <p className="text-xl text-body mb-8">
          You've successfully completed all {selectedCertification?.certification_name} assessments! 
          You're ready to receive your official certificate.
        </p>

        <div className="bg-surface border border-hair rounded-xl p-8 mb-8">
          <h3 className="text-lg font-bold text-ink mb-4">
            How would you like your name to appear on the certificate?
          </h3>
          <input
            type="text"
            value={certificateName}
            onChange={(e) => setCertificateName(e.target.value)}
            placeholder="Enter your full name"
            className="w-full max-w-md mx-auto px-4 py-3 border border-hair rounded-lg focus:border-accent focus:outline-none text-center text-lg"
          />
        </div>

        <button
          onClick={generateCertificate}
          disabled={!certificateName.trim() || generatingCertificate}
          className="bg-accent text-white px-8 py-4 rounded-lg font-bold text-lg hover:bg-accent/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-3"
        >
          {generatingCertificate ? (
            <><Loader2 className="h-6 w-6 animate-spin" /> Generating Certificate...</>
          ) : (
            <><Download className="h-6 w-6" /> Download Certificate</>
          )}
        </button>

        {error && (
          <div className="mt-6 bg-red-50 border-2 border-red-300 rounded-lg p-4 flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
            <p className="text-red-700">{error}</p>
          </div>
        )}

        <div className="mt-6">
          <button
            onClick={() => setViewMode('overview')}
            className="text-accent hover:underline font-medium"
          >
            Return to Overview
          </button>
        </div>
      </div>
    </div>
  );

  // Main render
  return (
    <AppLayout>
      {fallbackText && (
        <div className="fixed bottom-4 right-4 z-50 max-w-sm">
          <VoiceFallback text={fallbackText} onDismiss={clearFallback} />
        </div>
      )}

      <div>
        {viewMode === 'overview' && renderOverview()}
        {viewMode === 'select-assessment' && renderSelectAssessment()}
        {viewMode === 'define-context' && renderDefineContext()}
        {viewMode === 'take-assessment' && renderTakeAssessment()}
        {viewMode === 'results' && renderResults()}
        {viewMode === 'certificate' && renderCertificate()}
      </div>
    </AppLayout>
  );
};

export default AIReadySkillsCertificationPage;