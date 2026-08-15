// src/pages/AILearningCertificationPage.tsx

import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import AppLayout from '../components/layout/AppLayout';
import QuietButton from '../components/ui/QuietButton';
import { 
  Award, 
  Brain, 
  CheckCircle, 
  Wand2,
  ClipboardList, 
  GraduationCap, 
  RefreshCw, 
  ArrowRight,
  ArrowLeft,
  Loader2,
  AlertCircle,
  Trophy,
  Download,
  Sparkles,
  Volume2,
  VolumeX
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { chatText, chatJSON } from '../lib/chatClient';
import { supabase } from '../lib/supabaseClient';
import { useVoice } from '../hooks/useVoice';
import { VoiceFallback } from '../components/VoiceFallback';
import { useBranding, addBrandingToPDF } from '../lib/useBranding';
import { jsPDF } from 'jspdf';


// Types
interface Assessment {
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
  evidence: string | null;
}

interface LearnerContext {
  topic: string;
  setting: string;
  constraints: string;
  audience: string;
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

type ViewMode = 'overview' | 'select-assessment' | 'define-context' | 'take-assessment' | 'results' | 'certificate';

// Database column name mapping - fixes issues with special characters like "&"
const ASSESSMENT_COLUMN_MAP: Record<string, string> = {
  'Application of AI': 'certification_ai_proficiency_application_of_ai',
  'Ethics & Responsibility': 'certification_ai_proficiency_ethics_responsibility',
  'Understanding AI': 'certification_ai_proficiency_understanding_ai',
  'Verification & Bias': 'certification_ai_proficiency_verification_bias'
};

// ---------------------------------------------------------------------------
// Utility: parse the tailored prompt to extract numbered question labels
// so we can build a matching answer template.
// ---------------------------------------------------------------------------
const buildAnswerTemplate = (promptText: string): string => {
  // Match lines like "**Question 1: Label**" or "1. **Label**" or "1. Label"
  const lines = promptText.split('\n');
  const questionLines: string[] = [];

  lines.forEach((line) => {
    // New format: **Question 1: Short label**
    const newFormat = line.match(/^\*{0,2}Question\s+(\d+)[:\s]+([^*\n]+)\*{0,2}/i);
    if (newFormat) {
      const label = newFormat[2].trim().replace(/[*_]+$/, '').trim();
      questionLines.push(label);
      return;
    }
    // Legacy format: "1. **Label** —" or "1. Label"
    const legacyFormat = line.match(/^\s*(\d+)[.)]\s+\*{0,2}([^*\n—–-]+)\*{0,2}/);
    if (legacyFormat) {
      const label = legacyFormat[2].trim().replace(/[—–\-:]+$/, '').trim();
      questionLines.push(label);
    }
  });

  if (questionLines.length === 0) {
    return `1. [Answer Here]\n\n\n\n2. [Answer Here]\n\n\n\n3. [Answer Here]\n\n\n\n4. [Answer Here]\n\n\n`;
  }

  return questionLines
    .map((label, i) => `${i + 1}. ${label}\n\n[Answer Here]\n\n\n`)
    .join('\n');
};


const AILearningCertificationPage: React.FC = () => {
  const { user } = useAuth();
  
  // State management
  const [viewMode, setViewMode] = useState<ViewMode>('overview');
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [assessmentScores, setAssessmentScores] = useState<AssessmentScore[]>([]);
  const [selectedAssessment, setSelectedAssessment] = useState<Assessment | null>(null);
  const [learnerContext, setLearnerContext] = useState<LearnerContext>({
    topic: '',
    setting: '',
    constraints: '',
    audience: ''
  });
  const [userResponse, setUserResponse] = useState('');
  const [tailoredPrompt, setTailoredPrompt] = useState<string>('');
  const [evaluationScore, setEvaluationScore] = useState<number | null>(null);
  const [evaluationEvidence, setEvaluationEvidence] = useState<string>('');
  const [improvementAdvice, setImprovementAdvice] = useState<string>('');
  const [certificateName, setCertificateName] = useState('');
  const [loading, setLoading] = useState(false);
  const [isImproving, setIsImproving] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
  const [personalityBaseline, setPersonalityBaseline] = useState<PersonalityBaseline>({
    communicationStrategy: null,
    learningStrategy: null
  });
  const [communicationLevel, setCommunicationLevel] = useState<number>(1);

  const handleImproveEnglish = async () => {
    if (!userResponse.trim() || isImproving) return;
    setIsImproving(true);
    try {
      const result = await chatJSON({ page: 'AIProficiencyPage',
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

  // Helper function to render text with markdown links as React Router Links
  const renderAdviceWithLinks = (text: string) => {
    // Split by markdown link pattern: [text](url)
    const parts = text.split(/(\[.*?\]\(.*?\))/g);
    
    return parts.map((part, index) => {
      // Check if this part is a markdown link
      const linkMatch = part.match(/\[(.*?)\]\((.*?)\)/);
      if (linkMatch) {
        const [, linkText, url] = linkMatch;
        return (
          <Link 
            key={index} 
            to={url} 
            className="text-blue-600 hover:text-blue-800 underline font-medium"
          >
            {linkText}
          </Link>
        );
      }
      
      // Otherwise, return text with line breaks preserved
      return <span key={index}>{part}</span>;
    });
  };

  // Fetch assessments and scores on mount
  useEffect(() => {
    if (user?.id) {
      fetchAssessmentsAndScores();
      fetchPersonalityBaseline(user.id);
    }
  }, [user?.id]);

  // ── Speak / stop helpers ───────────────────────────────────────────────
  const speak = (text: string) => hookSpeak(text);
  const stopSpeaking = () => cancelSpeech();

  // ── Reusable voice toggle + read-aloud bar ─────────────────────────────
  const renderVoiceBar = (textToRead: string, label = 'Read aloud') => (
    <div className="flex flex-wrap items-center gap-3 mb-5 p-3 bg-paper border border-hair rounded-xl">
      <span className="text-sm font-semibold text-body flex items-center gap-1.5">
        <Volume2 className="h-4 w-4 text-accent" /> Coach voice:
      </span>
      <div className="flex rounded-lg overflow-hidden border border-hair">
        <button
          onClick={() => { stopSpeaking(); setVoiceMode('english'); }}
          title="British English — Google UK English Female"
          className={`flex items-center gap-1.5 px-4 py-1.5 text-sm font-semibold transition-colors border-r border-hair
            ${voiceMode === 'english' ? 'bg-accent text-white' : 'bg-card text-muted hover:text-ink'}`}
        >
          🇬🇧 British English
        </button>
        <button
          onClick={() => { stopSpeaking(); setVoiceMode('pidgin'); }}
          title="Nigerian English / Pidgin voice"
          className={`flex items-center gap-1.5 px-4 py-1.5 text-sm font-semibold transition-colors
            ${voiceMode === 'pidgin' ? 'bg-accent text-white' : 'bg-card text-muted hover:text-ink'}`}
        >
          🇳🇬 Nigerian Pidgin
        </button>
      </div>
      <span className="text-xs text-muted italic hidden sm:inline">
        {'Ezinne'}
      </span>
      <QuietButton
        onClick={() => isSpeaking ? stopSpeaking() : speak(textToRead)}
        icon={isSpeaking ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
        className="ml-auto"
      >
        {isSpeaking ? 'Stop' : label}
      </QuietButton>
    </div>
  );

  const fetchPersonalityBaseline = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('user_personality_baseline')
        .select('communication_strategy, learning_strategy, communication_level')
        .eq('user_id', userId)
        .single();

      if (error) {
        console.log('[AIProficiency] No baseline found yet (normal for new users)');
        return;
      }

      setPersonalityBaseline({
        communicationStrategy: data?.communication_strategy || null,
        learningStrategy: data?.learning_strategy || null
      });
      setCommunicationLevel(data?.communication_level ?? 1);
      console.log('[AIProficiency] Personality baseline loaded, communication_level:', data?.communication_level ?? 1);
    } catch (err) {
      console.log('[AIProficiency] Baseline fetch skipped:', err);
    }
  };

  const fetchAssessmentsAndScores = async () => {
    if (!user?.id) {
      console.log('[AIProficiency] No user ID, skipping fetch');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      console.log('[AIProficiency] Fetching assessments...');

      // Fetch assessments from certification_assessments table
      const { data: assessmentsData, error: assessmentsError } = await supabase
        .from('certification_assessments')
        .select('*')
        .eq('certification_name', 'AI Proficiency');

      console.log('[AIProficiency] Assessments response:', { assessmentsData, assessmentsError });

      if (assessmentsError) throw assessmentsError;
      setAssessments(assessmentsData || []);
      console.log('[AIProficiency] Set assessments:', assessmentsData?.length || 0);

      // Fetch user's dashboard record
      const { data: dashboardData, error: dashboardError } = await supabase
        .from('dashboard')
        .select('*')
        .eq('user_id', user.id)
        .eq('activity', 'AI Proficiency Certification')
        .maybeSingle();

      console.log('[AIProficiency] Dashboard response:', { dashboardData, dashboardError });

      if (dashboardError && dashboardError.code !== 'PGRST116') {
        console.error('[AIProficiency] Dashboard error (not "not found"):', dashboardError);
        // Don't throw, just continue without scores
      }

      // Map scores from dashboard columns
      const scores: AssessmentScore[] = (assessmentsData || []).map((assessment) => {
        const columnBase = ASSESSMENT_COLUMN_MAP[assessment.assessment_name] || 
          `certification_ai_proficiency_${assessment.assessment_name.toLowerCase().replace(/ /g, '_').replace(/[^a-z0-9_]/g, '')}`;
        console.log('[AIProficiency] Looking for column:', columnBase, 'for assessment:', assessment.assessment_name);
        const scoreValue = dashboardData?.[`${columnBase}_score`] ?? null;
        const evidenceValue = dashboardData?.[`${columnBase}_evidence`] ?? null;
        console.log('[AIProficiency] Found score:', scoreValue, 'evidence length:', evidenceValue?.length || 0);
        return {
          assessment_name: assessment.assessment_name,
          score: scoreValue,
          evidence: evidenceValue
        };
      });

      console.log('[AIProficiency] Mapped scores:', scores);
      setAssessmentScores(scores);
    } catch (err) {
      console.error('Error fetching assessments:', err);
      setError('Failed to load assessments. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectAssessment = (assessment: Assessment) => {
    console.log('[AIProficiency] Assessment selected:', assessment);
    setSelectedAssessment(assessment);
    setUserResponse('');
    setEvaluationScore(null);
    setEvaluationEvidence('');
    setImprovementAdvice('');
    setError(null);
    console.log('[AIProficiency] Changing view to define-context');
    setViewMode('define-context');
  };

  const handleContextSubmit = async () => {
    if (!learnerContext.topic || !learnerContext.setting || !learnerContext.constraints || !learnerContext.audience) {
      setError('Please fill in all context fields');
      return;
    }
    
    if (!selectedAssessment) return;
    
    try {
      setLoading(true);
      setError(null);
      
      // Tailor the generic prompt to the learner's context
      const tailored = await tailorPromptToContext();
      setTailoredPrompt(tailored);

      // Pre-populate the response textarea with the answer template
      setUserResponse(buildAnswerTemplate(tailored));
      
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

    // Build personalized learner profile block if baseline data exists
    const { communicationStrategy: cs, learningStrategy: ls } = personalityBaseline;
    const personalizedBlock = (cs || ls) ? `
Learner's Personalized Profile (from prior AI-assessed baseline):
${cs ? `- Communication Style: tone=${cs.preferred_tone ?? 'n/a'}, interaction=${cs.interaction_style ?? 'n/a'}, detail level=${cs.detail_level ?? 'n/a'}` : ''}
${cs?.recommendations?.length ? `  Communication Tips: ${cs.recommendations.join('; ')}` : ''}
${ls ? `- Learning Approach: style=${ls.learning_style ?? 'n/a'}, motivation=${ls.motivation_approach ?? 'n/a'}, pacing=${ls.pacing_preference ?? 'n/a'}` : ''}
${ls?.recommendations?.length ? `  Learning Tips: ${ls.recommendations.join('; ')}` : ''}

Use this profile to shape the tone, framing, and language of the tailored prompt so it resonates with how this learner best engages.
` : '';

    // ── Communication-level language register ────────────────────────────────
    // Controls the vocabulary, sentence complexity, and framing of the tailored prompt.
    const commLevelBlock = communicationLevel <= 0
      ? `
COMMUNICATION LEVEL: 0 — PRE-LITERATE / VERY BASIC
Write the tailored prompt using ONLY the simplest everyday words.
- Maximum 1–2 short sentences per instruction step. Use numbered steps so it is clear what to do.
- Avoid all technical vocabulary unless you immediately explain it in plain words.
- Use everyday examples the learner already knows (farm, market stall, family, community).
- The tone must be warm and encouraging — never intimidating.`
      : communicationLevel === 1
      ? `
COMMUNICATION LEVEL: 1 — EMERGING
Write the tailored prompt using short, clear sentences. One idea per sentence.
- Avoid jargon. If you must use a technical term, explain it immediately in plain language.
- Use concrete, familiar examples drawn from the learner's topic and setting.
- Keep each instruction step brief and direct. No complex sub-clauses.
- Warm, encouraging tone throughout.`
      : communicationLevel === 2
      ? `
COMMUNICATION LEVEL: 2 — DEVELOPING
Write the tailored prompt in clear, structured language.
- You may use skill-related terms with brief explanations where helpful.
- Instructions can be multi-sentence but should stay focused and direct.
- Connect each step clearly to the learner's specific context.`
      : `
COMMUNICATION LEVEL: 3 — PROFICIENT
Write the tailored prompt in standard, well-structured English.
- You may use appropriate technical vocabulary.
- Instructions can be detailed and nuanced where the assessment requires it.`;

    const userMessage = `
Generic Assessment Prompt:
${selectedAssessment.certification_prompt}

Learner's Context:
- Topic: ${learnerContext.topic}
- Setting: ${learnerContext.setting}
- Constraints: ${learnerContext.constraints}
- Audience: ${learnerContext.audience}
${personalizedBlock}${commLevelBlock}

Task: Create a structured assessment setup for this learner. Your output must follow this EXACT format:

## [A short, specific title using the learner's topic — e.g. "How AI Could Help Your Village Water Business"]

[1–2 sentences of brief framing that connects AI to their specific topic and setting. Do NOT explain how AI works. Do NOT teach. Just orient the learner to what they are about to answer.]

**Question 1: [Short question label]**
[The question itself, written clearly and specifically using their topic, setting, and constraints.]

💡 **What to include in your answer:** [2–3 bullet points telling the learner exactly what elements a strong answer should contain. Be specific to their topic. Example bullets: "Name one specific type of data that would be collected", "Explain what the AI would do with that data", "Give one real example relevant to your context."]

**Question 2: [Short question label]**
[The question itself.]

💡 **What to include in your answer:** [2–3 bullet points]

**Question 3: [Short question label]**
[The question itself.]

💡 **What to include in your answer:** [2–3 bullet points]

**Question 4: [Short question label]**
[The question itself.]

💡 **What to include in your answer:** [2–3 bullet points]

Rules:
- Use ## for the title (not #)
- Put a blank line between each question block
- The questions must test the same learning objectives as the generic prompt
- Write at the communication level specified above
- Do NOT explain AI concepts — the learner already knows them; this is an assessment, not a lesson
- Do NOT add any text after Question 4
${(cs || ls) ? '- Reflect the learner\'s preferred communication style in how the questions and hints are worded' : ''}

Respond with ONLY the formatted assessment setup. No preamble, no closing remarks.
`;

    try {
      const tailoredPrompt = await chatText({ page: 'AIProficiencyPage',
        messages: [{ role: 'user', content: userMessage }],
        system: 'You are an expert educational assessment designer. Your job is to set up assessments — NOT to teach or explain concepts. You present questions and tell learners what their answers should contain. Always honour the communication level instruction. When a learner profile is provided, reflect their preferred communication style in framing.',
        max_tokens: 800,
        temperature: 0.7
      });

      return tailoredPrompt.trim();
    } catch (err) {
      console.error('Error calling prompt tailoring API:', err);
      return selectedAssessment.certification_prompt;
    }
  };

  const handleResponseSubmit = async () => {
    if (!userResponse.trim()) {
      setError('Please provide a response before submitting');
      return;
    }

    if (!selectedAssessment || !user?.id) return;

    try {
      setLoading(true);
      setError(null);

      // Call OpenAI API to evaluate response
      const evaluationResult = await evaluateResponse();
      
      if (!evaluationResult) {
        throw new Error('Evaluation failed');
      }

      setEvaluationScore(evaluationResult.score);
      setEvaluationEvidence(evaluationResult.evidence);

      // Save to database
      await saveEvaluationToDatabase(evaluationResult.score, evaluationResult.evidence);

      // Generate improvement advice
      const advice = await generateImprovementAdvice(evaluationResult.score, evaluationResult.evidence);
      setImprovementAdvice(advice);

      // Show confetti if proficient or higher
      if (evaluationResult.score >= 2) {
        await triggerConfetti();
      }

      setViewMode('results');
      
      // Keep spinner for a moment to allow results view to render
      setTimeout(() => {
        setLoading(false);
      }, 300);
      
    } catch (err) {
      console.error('Error submitting response:', err);
      setError('Failed to evaluate response. Please try again.');
      setLoading(false); // Turn off immediately on error
    }
  };

  const evaluateResponse = async () => {
    if (!selectedAssessment) return null;

    const evaluationPrompt = `
You are evaluating a learner's response for an AI Proficiency assessment.

Assessment: ${selectedAssessment.assessment_name}
Description: ${selectedAssessment.description}

Learner Context:
- Topic: ${learnerContext.topic}
- Setting: ${learnerContext.setting}
- Constraints: ${learnerContext.constraints}
- Audience: ${learnerContext.audience}

Prompt Given: ${selectedAssessment.certification_prompt}

Learner's Response:
${userResponse}

Rubric:
- Level 0 (No Evidence): ${selectedAssessment.certification_level0_metric}
- Level 1 (Emerging): ${selectedAssessment.certification_level1_metric}
- Level 2 (Proficient): ${selectedAssessment.certification_level2_metric}
- Level 3 (Advanced): ${selectedAssessment.certification_level3_metric}

Evaluate the learner's response and provide:
1. A score (0, 1, 2, or 3)
2. Evidence explaining why this score was assigned based on the rubric

For the evidence field, use markdown formatting:
- Bold (**text**) the key concepts and criteria being assessed
- Use short paragraphs or a brief bulleted list — do NOT write one long paragraph
- Keep it concise: 3–5 key points maximum

Respond ONLY in this JSON format:
{
  "score": <number 0-3>,
  "evidence": "<markdown-formatted explanation>"
}
`;

    try {
      const result = await chatJSON({ page: 'AIProficiencyPage',
        messages: [{ role: 'user', content: evaluationPrompt }],
        system: 'You are an expert educational assessor. Evaluate learner responses fairly and provide constructive feedback.',
        max_tokens: 800,
        temperature: 0.3
      });
      
      return {
        score: result.score,
        evidence: result.evidence
      };
    } catch (err) {
      console.error('Error calling evaluation API:', err);
      return null;
    }
  };

  const saveEvaluationToDatabase = async (score: number, evidence: string) => {
    if (!user?.id || !selectedAssessment) return;

    const columnBase = ASSESSMENT_COLUMN_MAP[selectedAssessment.assessment_name] ||
      `certification_ai_proficiency_${selectedAssessment.assessment_name.toLowerCase().replace(/ /g, '_').replace(/[^a-z0-9_]/g, '')}`;
    
    // Determine progress status based on score
    let progressStatus = 'started'; // Default when they've submitted but not passed
    if (score >= 3) {
      progressStatus = 'completed'; // Advanced level
    }
    
    try {
      // Check if record exists
      const { data: existingRecord } = await supabase
        .from('dashboard')
        .select('id, progress')
        .eq('user_id', user.id)
        .eq('activity', 'AI Proficiency Certification')
        .maybeSingle();

      const updateData: any = {
        [`${columnBase}_score`]: score,
        [`${columnBase}_evidence`]: evidence,
        updated_at: new Date().toISOString()
      };

      // Only update progress if:
      // 1. It's not already 'completed', OR
      // 2. The new status is 'completed' (advanced score)
      if (existingRecord) {
        // Update existing record
        if (existingRecord.progress !== 'completed' || progressStatus === 'completed') {
          updateData.progress = progressStatus;
        }
        
        await supabase
          .from('dashboard')
          .update(updateData)
          .eq('id', existingRecord.id);
      } else {
        // Insert new record
        await supabase
          .from('dashboard')
          .insert({
            user_id: user.id,
            activity: 'AI Proficiency Certification',
            category_activity: 'Certification',
            progress: progressStatus,
            ...updateData
          });
      }

      console.log('[AIProficiency] Saved to dashboard:', { score, progressStatus });

      // Refresh scores
      await fetchAssessmentsAndScores();
    } catch (err) {
      console.error('Error saving to database:', err);
      throw err;
    }
  };

  const fetchRelevantLearningModules = async (assessmentName: string): Promise<LearningModule[]> => {
    if (!user?.id) return [];

    try {
      // Fetch user profile for grade level and continent
      const { data: profile } = await supabase
        .from('profiles')
        .select('grade_level, continent')
        .eq('id', user.id)
        .single();

      const userGradeLevel: number | null = profile?.grade_level ?? null;
      const userContinent = profile?.continent || 'North America';

      // Map assessment names to learning module categories/sub-categories
      const categoryMap: Record<string, { category: string; sub_category: string }> = {
        'Application of AI': { category: 'AI Proficiency', sub_category: 'Application of AI' },
        'Understanding AI': { category: 'AI Proficiency', sub_category: 'Understanding AI: Core Concepts & Capabilities' },
        'Ethics & Responsibility': { category: 'AI Proficiency', sub_category: 'Ethics & Responsibility' },
        'Verification & Bias': { category: 'AI Proficiency', sub_category: 'Verification & Bias' }
      };

      const mapping = categoryMap[assessmentName];
      if (!mapping) return [];

      // Query learning modules
      let query = supabase
        .from('learning_modules')
        .select('learning_module_id, title, description, category, sub_category, grade_level')
        .eq('category', mapping.category)
        .eq('public', 1)
        .limit(5);

      // Only narrow by grade when we actually know the learner's grade level —
      // an unknown grade should see the full 1-4 range, not be pushed toward older content.
      if (userGradeLevel !== null) {
        query = query
          .lte('grade_level', userGradeLevel + 2) // Allow up to 2 grades above
          .gte('grade_level', Math.max(1, userGradeLevel - 2)); // Allow up to 2 grades below
      }

      // Prefer modules from user's continent but don't require it
      const { data: continentModules } = await query.eq('continent', userContinent);
      const { data: allModules } = await query;

      // Prioritize continent-specific modules, fall back to any continent
      const modules = continentModules && continentModules.length > 0 ? continentModules : allModules;

      // Filter by sub-category if possible, otherwise just use category match
      const filteredModules = modules?.filter(m => 
        m.sub_category?.includes(mapping.sub_category) || 
        m.sub_category?.toLowerCase().includes(assessmentName.toLowerCase())
      ) || [];

      return filteredModules.length > 0 ? filteredModules.slice(0, 3) : (modules?.slice(0, 3) || []);
    } catch (err) {
      console.error('Error fetching learning modules:', err);
      return [];
    }
  };

  const generateImprovementAdvice = async (score: number, evidence: string) => {
    if (!selectedAssessment) return '';

    // Fetch relevant learning modules
    const recommendedModules = await fetchRelevantLearningModules(selectedAssessment.assessment_name);

    // Build personalized coach block if baseline data exists
    const { communicationStrategy: cs, learningStrategy: ls } = personalityBaseline;
    const personalizedCoachBlock = (cs || ls) ? `
Learner's Personalized Profile:
${cs ? `- Communication Preference: tone=${cs.preferred_tone ?? 'n/a'}, interaction=${cs.interaction_style ?? 'n/a'}, detail=${cs.detail_level ?? 'n/a'}` : ''}
${cs?.recommendations?.length ? `  Communication Tips: ${cs.recommendations.join('; ')}` : ''}
${ls ? `- Learning Preference: style=${ls.learning_style ?? 'n/a'}, motivation=${ls.motivation_approach ?? 'n/a'}, pacing=${ls.pacing_preference ?? 'n/a'}` : ''}
${ls?.recommendations?.length ? `  Learning Tips: ${ls.recommendations.join('; ')}` : ''}

Adapt your feedback tone, phrasing, and examples to match this profile.
` : '';

    // ── Communication-level register for feedback ─────────────────────────────
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
You are a supportive AI learning coach providing celebratory feedback.

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
You are a supportive AI learning coach providing improvement advice.

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

Provide specific, actionable advice on how the learner can improve their response to reach the next level or strengthen their proficient/advanced performance. Be encouraging and constructive.
${(cs || ls) ? 'Deliver your advice in a tone and style that matches their communication and learning preferences listed above.' : ''}

Keep your advice concise (3-5 key points). Write at the communication level specified above.
`;

    try {
      const advice = await chatText({ page: 'AIProficiencyPage',
        messages: [{ role: 'user', content: advicePrompt }],
        system: 'You are an encouraging and supportive AI learning coach. Always honour the communication level instruction — it controls vocabulary complexity and sentence structure. When a learner profile is provided, also tailor your tone, examples, and delivery style to match their preferences.',
        max_tokens: 800,
        temperature: 0.7
      });
      
      // Append learning module recommendations if available and score < 3
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
      // Only try to load confetti if we're in the browser
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
      // Silently fail if confetti not available
      console.log('Confetti celebration!');
    }
  };

  const checkAllAssessmentsPassed = () => {
    if (assessments.length === 0 || assessmentScores.length === 0) return false;
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
    try {
      const doc = new jsPDF({
        orientation: 'landscape',
        unit: 'mm',
        format: 'a4'
      });

      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();

      // Calculate minimum certification level
      const minScore = Math.min(...assessmentScores.map(s => s.score ?? 0));
      const certLevel = minScore === 3 ? 'Advanced' : minScore === 2 ? 'Proficient' : 'Emerging';

      // Add watermark image as background FIRST (so it appears behind everything)
      try {
        console.log('[Certificate] Loading watermark...');
        
        // Fetch the image
        const response = await fetch('/AI_Proficiency_Certification_Watermark.png');
        if (!response.ok) {
          throw new Error(`Watermark not found: ${response.status}`);
        }
        
        const blob = await response.blob();
        console.log('[Certificate] Watermark fetched, size:', blob.size);
        
        // Convert blob to base64 using FileReader (most reliable method)
        const base64Image = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => {
            const result = reader.result as string;
            console.log('[Certificate] Base64 conversion complete');
            resolve(result);
          };
          reader.onerror = () => {
            reject(new Error('FileReader failed'));
          };
          reader.readAsDataURL(blob);
        });
        
        // Calculate dimensions to center the watermark
        const imgWidth = 180;
        const imgHeight = 126;
        const imgX = (pageWidth - imgWidth) / 2;
        const imgY = (pageHeight - imgHeight) / 2 + 5;
        
        // Add image directly to PDF (jsPDF will handle it)
        doc.addImage(
          base64Image,
          'PNG',
          imgX,
          imgY,
          imgWidth,
          imgHeight,
          undefined,
          'NONE' // No compression, preserve quality
        );
        
        console.log('[Certificate] ✅ Watermark added successfully!');
      } catch (error) {
        console.error('[Certificate] ❌ Watermark failed:', error);
        // Continue without watermark if it fails
      }

      // Border
      doc.setLineWidth(3);
      doc.setDrawColor(138, 43, 226);
      doc.rect(10, 10, pageWidth - 20, pageHeight - 20);

      doc.setLineWidth(1);
      doc.setDrawColor(219, 112, 147);
      doc.rect(15, 15, pageWidth - 30, pageHeight - 30);

      // Header
      doc.setFontSize(36);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(138, 43, 226);
      doc.text('Certificate of Achievement', pageWidth / 2, 30, { align: 'center' });

      // Title with Level
      doc.setFontSize(24);
      doc.setTextColor(219, 112, 147);
      doc.text(`AI Proficiency Certification - ${certLevel} Level`, pageWidth / 2, 44, { align: 'center' });

      // Presented to
      doc.setFontSize(18);
      doc.setTextColor(80, 80, 80);
      doc.text('This certificate is proudly presented to', pageWidth / 2, 58, { align: 'center' });

      // Name
      doc.setFontSize(40);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(0, 0, 0);
      doc.text(certificateName, pageWidth / 2, 74, { align: 'center' });

      // Achievement
      doc.setFontSize(13);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(60, 60, 60);
      doc.text('For demonstrating proficiency relative to the international standard', pageWidth / 2, 84, { align: 'center' });
      doc.text('for AI Proficiency established by UNESCO.', pageWidth / 2, 91, { align: 'center' });

      // Assessment Competencies Section
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(138, 43, 226);
      doc.text('Assessment Competencies:', 20, 102);
      
      // Extract first name from certificate name
      const firstName = certificateName.split(' ')[0];
      
      // Define criterion mapping to assessment names (in order)
      const criteriaMap = [
        {
          criterion: 'AI techniques/applications',
          description: `${firstName} has demonstrated an understanding of AI systems, including: how AI (LLM) works, data-to-model-to-output processes, and how to use it iteratively.`,
          assessmentName: 'Understanding AI'
        },
        {
          criterion: 'Human-centered mindset',
          description: `${firstName} has demonstrated an ability to critically assess the validity and uncertainty of AI responses and ethical awareness of AI.`,
          assessmentName: 'Verification & Bias'
        },
        {
          criterion: 'Ethics & Responsibility',
          description: `${firstName} has demonstrated: an understanding of the limitations of using AI; an ability to verify AI results; analyze AI responses for bias; and employ AI safely, all in real-world contexts.`,
          assessmentName: 'Ethics & Responsibility'
        },
        {
          criterion: 'AI system Design/Pedagogy',
          description: `${firstName} has demonstrated ability to judge when AI is appropriate, how it should be deployed responsibly and iteratively in real-world contexts, and how impact and limitations should be monitored.`,
          assessmentName: 'Application of AI'
        }
      ];
      
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(40, 40, 40);
      
      let yPos = 109;
      const leftCol = 20;
      const rightCol = pageWidth / 2 + 5;
      let columnSwitch = false;

      criteriaMap.forEach((criterion, index) => {
        // Find the score for this assessment
        const scoreData = assessmentScores.find(s => s.assessment_name === criterion.assessmentName);
        const score = scoreData?.score ?? 0;
        const level = score === 3 ? 'Advanced' : score === 2 ? 'Proficient' : score === 1 ? 'Emerging' : 'No Evidence';
        
        const xPos = columnSwitch ? rightCol : leftCol;
        const maxWidth = (pageWidth / 2) - 25;
        
        // Criterion name and score
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(13); // I
        doc.setTextColor(40, 40, 40);
        doc.text(`${criterion.criterion}: ${score}/3 - ${level}`, xPos, yPos);
        
        // Description (full text, no truncation) - 13pt
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(12); // Reduced from 14pt to 13pt
        doc.setTextColor(60, 60, 60);
        
        const lines = doc.splitTextToSize(criterion.description, maxWidth);
        
        yPos += 5;
        lines.forEach(line => {
          doc.text(line, xPos, yPos);
          yPos += 4.5;
        });
        
        doc.setTextColor(40, 40, 40);
        yPos += 3; // Space before next criterion
        
        // Switch columns after 2 criteria
        if (!columnSwitch && index === 1) {
          columnSwitch = true;
          yPos = 109; // Reset to top for right column
        }
      });

      // Organization (footer)
      yPos = pageHeight - 34.35;
      await addBrandingToPDF({ doc, pageWidth, pageHeight, footerY: yPos, branding });

      // Date
      doc.setFontSize(14);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(80, 80, 80);
      const date = new Date().toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      });
      doc.text(`Date: ${date}`, pageWidth / 2, yPos + 12, { align: 'center' });

      // Generate PDF blob instead of immediately saving
      const pdfBlob = doc.output('blob');
      const fileName = `AI_Proficiency_Certificate_${certificateName.replace(/ /g, '_')}.pdf`;
      
      // Upload to Supabase Storage
      if (user?.id) {
        try {
          console.log('[Certificate] Uploading to Supabase Storage...');
          
          const storagePath = `${user.id}/ai_proficiency_certificate.pdf`;
          
          // Upload to storage bucket 'certificates'
          const { data: uploadData, error: uploadError } = await supabase.storage
            .from('certificates')
            .upload(storagePath, pdfBlob, {
              contentType: 'application/pdf',
              upsert: true // Overwrite if exists
            });
          
          if (uploadError) {
            console.error('[Certificate] Upload error:', uploadError);
            console.error('[Certificate] Error message:', uploadError.message);
            console.error('[Certificate] Error details:', JSON.stringify(uploadError, null, 2));
          } else {
            console.log('[Certificate] Upload successful:', uploadData);
            
            // Get public URL
            const { data: urlData } = supabase.storage
              .from('certificates')
              .getPublicUrl(storagePath);
            
            console.log('[Certificate] Public URL:', urlData.publicUrl);
            
            // Update dashboard table with certificate URL
            const { error: updateError } = await supabase
              .from('dashboard')
              .update({ certificate_pdf_url: urlData.publicUrl })
              .eq('user_id', user.id)
              .eq('activity', 'AI Proficiency Certification');
            
            if (updateError) {
              console.error('[Certificate] Dashboard update error:', updateError);
            } else {
              console.log('[Certificate] Dashboard updated with certificate URL');
            }
          }
        } catch (storageError) {
          console.error('[Certificate] Storage operation failed:', storageError);
          // Continue with download even if storage fails
        }
      }
      
      // Download the certificate (original behavior)
      const url = URL.createObjectURL(pdfBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error generating certificate:', error);
      alert('Could not generate certificate. Please try again.');
    }
  };

  // Render functions
  const renderOverview = () => (
    <>
      <div className="flex items-center gap-3 mb-8">
        <Award className="h-9 w-9 text-accent" />
        <div>
          <h1 className="text-3xl font-bold text-ink">AI Proficiency Certification</h1>
          <p className="text-lg text-body mt-1">
            Master the ability to use and reason with AI tools — your foundation for success in an AI-powered world.
          </p>
        </div>
      </div>

      {assessments.length > 0 && (
        <div className="bg-card border border-hair rounded-2xl p-8 shadow-sm mb-8">
          <h2 className="text-lg font-semibold text-ink mb-6 flex items-center gap-2">
            <Trophy className="h-5 w-5 text-accent" />
            Your Progress
          </h2>

          <div className="space-y-3 mb-6">
            {assessments.map((assessment) => {
              const score = assessmentScores.find(s => s.assessment_name === assessment.assessment_name);
              const isPassed = score?.score !== null && score?.score !== undefined && score.score >= 2;
              const isCompleted = score?.score === 3; // Advanced level

              return (
                <div
                  key={assessment.assessment_name}
                  className={`w-full p-5 rounded-xl transition-colors border ${
                    isCompleted
                      ? 'bg-paper border-hair opacity-80'
                      : 'bg-paper border-hair hover:border-accent/40'
                  }`}
                >
                  <div className="flex items-start justify-between mb-3">
                    <h3 className="font-semibold text-base text-ink">{assessment.assessment_name}</h3>
                    <div className="flex items-center gap-2 flex-shrink-0 ml-4">
                      {score && score.score !== null && score.score !== undefined ? (
                        <>
                          <span className={`px-3 py-1 rounded-full text-sm font-medium whitespace-nowrap border ${
                            score.score >= 2
                              ? 'bg-green-100 text-green-800 border-green-300'
                              : 'bg-yellow-100 text-yellow-800 border-yellow-300'
                          }`}>
                            Score: {score.score}/3 - {
                              score.score === 0 ? 'No Evidence' :
                              score.score === 1 ? 'Emerging' :
                              score.score === 2 ? 'Proficient' : 'Advanced'
                            }
                          </span>
                          {isPassed && <CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0" />}
                          {isCompleted && (
                            <span className="text-xs text-muted font-medium">(Completed)</span>
                          )}
                        </>
                      ) : (
                        <span className="px-3 py-1 rounded-full text-sm font-medium bg-surface text-muted border border-hair">
                          Not Started
                        </span>
                      )}
                    </div>
                  </div>

                  <p className="text-sm leading-relaxed text-body mb-3">
                    {assessment.description}
                  </p>

                  {!isCompleted && (
                    <QuietButton
                      onClick={() => {
                        setSelectedAssessment(assessment);
                        setViewMode('define-context');
                      }}
                      icon={<ArrowRight size={14} />}
                    >
                      Begin Assessment
                    </QuietButton>
                  )}
                </div>
              );
            })}
          </div>

          <div className="flex gap-3">
            <QuietButton
              onClick={() => setViewMode('select-assessment')}
              variant="solid"
              className="flex-1 justify-center py-3 text-base"
            >
              {checkAllAssessmentsPassed() ? 'View Assessments' : 'Begin Assessment'}
            </QuietButton>

            {checkAllAssessmentsPassed() && (
              <QuietButton
                onClick={() => setViewMode('certificate')}
                icon={<Download size={16} />}
                className="flex-1 justify-center py-3 text-base"
              >
                Download Certificate
              </QuietButton>
            )}
          </div>
        </div>
      )}

      <div className="bg-card border border-hair rounded-2xl p-8 shadow-sm mb-8">
        <h2 className="text-xl font-semibold text-ink mb-6">How Certification Works</h2>

        <div className="mb-8">
          <p className="text-base text-body mb-4">
            To earn your AI Proficiency certification, you must demonstrate competence (score of <strong className="text-ink">Proficient or higher</strong>) in <strong className="text-ink">all assessments</strong>.
          </p>
          <p className="text-base text-body">
            You can retake evaluations as many times as needed — there's no limit. Each assessment is uniquely tailored to your chosen context.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          {[
            { num: 1, icon: ClipboardList, title: 'Define Context', body: 'Choose a real-world topic, setting, constraints, and audience for your assessment.' },
            { num: 2, icon: Brain, title: 'Complete Assessment', body: 'Respond to the assessment prompt demonstrating your AI proficiency skills.' },
            { num: 3, icon: GraduationCap, title: 'Get Feedback & Certificate', body: 'Receive your score with personalized improvement advice. Earn your certificate upon completion.' },
          ].map((step, i) => (
            <div key={step.num} className="relative">
              <div className="bg-paper rounded-xl p-6 h-full border border-hair">
                <div className="flex items-center gap-3 mb-4">
                  <div className="bg-accent text-white rounded-full w-8 h-8 flex items-center justify-center font-bold text-sm">
                    {step.num}
                  </div>
                  <step.icon className="h-6 w-6 text-accent" />
                </div>
                <h3 className="text-lg font-semibold text-ink mb-2">{step.title}</h3>
                <p className="text-body text-sm">{step.body}</p>
              </div>
              {i < 2 && <ArrowRight className="hidden md:block absolute top-1/2 -right-8 transform -translate-y-1/2 h-6 w-6 text-muted" />}
            </div>
          ))}
        </div>
      </div>
    </>
  );


  const renderSelectAssessment = () => {
    console.log('[AIProficiency] Rendering select-assessment view');
    console.log('[AIProficiency] Assessments available:', assessments.length);
    
    if (checkAllAssessmentsPassed()) {
      setViewMode('certificate');
      return null;
    }

    return (
      <div className="max-w-4xl mx-auto">
        <button
          onClick={() => {
            setViewMode('overview');
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
          className="flex items-center gap-2 text-sm text-body hover:text-accent mb-6"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Overview
        </button>
        <div className="bg-card border border-hair rounded-2xl p-8 shadow-sm">
          <h2 className="text-xl font-semibold text-ink mb-6">Select an Assessment</h2>
          {assessments.length === 0 ? (
            <div className="text-center py-12">
              <AlertCircle className="h-10 w-10 text-muted mx-auto mb-4" />
              <p className="text-body mb-4">No assessments found.</p>
              <p className="text-sm text-muted">
                Make sure your certification_assessments table has entries with certification_name = "AI Proficiency"
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {assessments.map((assessment) => {
                const score = assessmentScores.find(s => s.assessment_name === assessment.assessment_name);
                const isPassed = score?.score !== null && score?.score !== undefined && score.score >= 2;
                return (
                  <button
                    key={assessment.assessment_name}
                    onClick={() => handleSelectAssessment(assessment)}
                    className="w-full text-left p-6 bg-paper rounded-xl hover:border-accent/40 transition-colors border border-hair"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <h3 className="text-lg font-semibold text-ink">{assessment.assessment_name}</h3>
                          {isPassed && <CheckCircle className="h-5 w-5 text-green-600" />}
                        </div>
                        <p className="text-body mb-3 text-sm">{assessment.description}</p>
                        {score && score.score !== null && score.score !== undefined && (
                          <span className={`inline-block px-3 py-1 rounded-full text-sm font-medium border ${
                            score.score >= 2 ? 'bg-green-100 text-green-800 border-green-300' : 'bg-yellow-100 text-yellow-800 border-yellow-300'
                          }`}>
                            Current: {score.score === 0 ? 'No Evidence' :
                                     score.score === 1 ? 'Emerging' :
                                     score.score === 2 ? 'Proficient' : 'Advanced'}
                          </span>
                        )}
                      </div>
                      <ArrowRight className="h-5 w-5 text-muted flex-shrink-0 mt-2" />
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderDefineContext = () => (
    <div className="max-w-4xl mx-auto">
      <button
        onClick={() => setViewMode('select-assessment')}
        className="flex items-center gap-2 text-sm text-body hover:text-accent mb-6"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Assessment Selection
      </button>
      <div className="bg-card border border-hair rounded-2xl p-8 shadow-sm">
        <h2 className="text-xl font-semibold text-ink mb-4">
          {selectedAssessment?.assessment_name}
        </h2>
        <p className="text-body mb-6">{selectedAssessment?.description}</p>
        <div className="bg-surface border border-hair border-l-4 border-l-accent rounded-xl p-6 mb-8">
          <h3 className="text-base font-semibold text-ink mb-3">Define Your Context</h3>
          <p className="text-body mb-4 text-sm">
            Choose a real-world scenario that matters to you. This makes the assessment more meaningful
            and helps you apply AI skills to authentic situations. You can retake this assessment anytime
            with a different context.
          </p>
          <p className="text-sm text-muted">
            <strong className="text-body">Note:</strong> Once you score Proficient or higher, it will be stored in your record
            and you won't need to retake this particular assessment.
          </p>
        </div>
        <div className="space-y-6">
          <div>
            <label className="block text-sm font-semibold text-ink mb-2">
              Topic <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={learnerContext.topic}
              onChange={(e) => setLearnerContext({ ...learnerContext, topic: e.target.value })}
              placeholder="e.g., Clean water access, school attendance, crop yields"
              className="w-full px-4 py-3 border border-hair rounded-lg bg-paper focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent"
            />
            <p className="text-sm text-muted mt-1">Choose a local problem, interest, or opportunity you care about</p>
          </div>
          <div>
            <label className="block text-sm font-semibold text-ink mb-2">
              Setting <span className="text-red-500">*</span>
            </label>
            <select
              value={learnerContext.setting}
              onChange={(e) => setLearnerContext({ ...learnerContext, setting: e.target.value })}
              className="w-full px-4 py-3 border border-hair rounded-lg bg-paper focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent"
            >
              <option value="">Select a setting...</option>
              <option value="village">Village</option>
              <option value="school">School</option>
              <option value="home">Home</option>
              <option value="market">Market</option>
              <option value="farm">Farm</option>
              <option value="clinic">Clinic</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-semibold text-ink mb-2">
              Constraints <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={learnerContext.constraints}
              onChange={(e) => setLearnerContext({ ...learnerContext, constraints: e.target.value })}
              placeholder="e.g., Limited internet, low budget, time constraints"
              className="w-full px-4 py-3 border border-hair rounded-lg bg-paper focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent"
            />
            <p className="text-sm text-muted mt-1">Include at least one real limitation (power, internet, money, time, etc.)</p>
          </div>
          <div>
            <label className="block text-sm font-semibold text-ink mb-2">
              Audience <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={learnerContext.audience}
              onChange={(e) => setLearnerContext({ ...learnerContext, audience: e.target.value })}
              placeholder="e.g., My peers, family members, community leaders"
              className="w-full px-4 py-3 border border-hair rounded-lg bg-paper focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent"
            />
            <p className="text-sm text-muted mt-1">Who is the solution for? (peer, family, community member, etc.)</p>
          </div>
          {error && (
            <div className="bg-red-50 border border-red-300 rounded-lg p-4 flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
              <p className="text-red-700 text-sm">{error}</p>
            </div>
          )}
          <QuietButton
            onClick={handleContextSubmit}
            disabled={loading || !learnerContext.topic || !learnerContext.setting || !learnerContext.constraints || !learnerContext.audience}
            loading={loading}
            variant="solid"
            className="w-full justify-center py-3 text-base"
          >
            {loading ? 'Personalizing Your Assessment...' : 'Continue to Assessment'}
          </QuietButton>
        </div>
      </div>
    </div>
  );

  // ---------------------------------------------------------------------------
  // renderTakeAssessment — renders the prompt as formatted markdown and
  // pre-populates the response textarea with a structured answer template.
  // ---------------------------------------------------------------------------
  const renderTakeAssessment = () => (
    <div className="max-w-4xl mx-auto">
      <button
        onClick={() => setViewMode('define-context')}
        className="flex items-center gap-2 text-sm text-body hover:text-accent mb-6"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Context
      </button>
      <div className="bg-card border border-hair rounded-2xl p-8 shadow-sm">
        <h2 className="text-xl font-semibold text-ink mb-4">
          {selectedAssessment?.assessment_name}
        </h2>

        {/* Context summary */}
        <div className="bg-surface border border-hair rounded-xl p-6 mb-6">
          <h3 className="text-base font-semibold text-ink mb-3">Your Context</h3>
          <div className="grid grid-cols-2 gap-4 text-sm text-body">
            <div><span className="font-semibold text-ink">Topic:</span> {learnerContext.topic}</div>
            <div><span className="font-semibold text-ink">Setting:</span> {learnerContext.setting}</div>
            <div><span className="font-semibold text-ink">Constraints:</span> {learnerContext.constraints}</div>
            <div><span className="font-semibold text-ink">Audience:</span> {learnerContext.audience}</div>
          </div>
        </div>

        {/* ── Personalized Assessment Prompt (rendered as markdown) ── */}
        <div className="bg-surface border border-hair rounded-xl p-6 mb-6">
          <h3 className="text-base font-semibold text-ink mb-3">Your Personalized Assessment Prompt</h3>

          {renderVoiceBar(
            `${tailoredPrompt || selectedAssessment?.certification_prompt || ''}. Scoring rubric: Level 0, No Evidence: ${selectedAssessment?.certification_level0_metric}. Level 1, Emerging: ${selectedAssessment?.certification_level1_metric}. Level 2, Proficient: ${selectedAssessment?.certification_level2_metric}. Level 3, Advanced: ${selectedAssessment?.certification_level3_metric}.`,
            'Read prompt & rubric'
          )}

          {/* Markdown-rendered prompt */}
          <div className="prose max-w-none text-body
            prose-headings:text-ink prose-headings:font-semibold
            prose-h1:text-xl prose-h2:text-xl prose-h3:text-lg
            prose-strong:text-ink
            prose-li:my-1 prose-ul:my-2 prose-ol:my-2
            prose-p:leading-relaxed prose-p:my-2
            [&>h2]:mb-2 [&>h2]:mt-5
            [&_p:has(>strong:first-child)]:mt-6
            [&_p:has(>strong:first-child)]:mb-1">
            <ReactMarkdown>
              {tailoredPrompt || selectedAssessment?.certification_prompt || ''}
            </ReactMarkdown>
          </div>

          {/* Closing instruction message */}
          <div className="mt-5 pt-4 border-t border-hair">
            <p className="text-body text-sm leading-relaxed">
              Answer the questions below in the <strong className="text-ink">"Your Response"</strong> section without AI help.&nbsp;
              The more detailed you are in answering each question, the better your evaluation will be.
            </p>
            <p className="text-body text-sm font-semibold mt-1">Good luck. 🍀</p>
          </div>
        </div>

        {/* Scoring rubric */}
        <div className="bg-surface border border-hair rounded-xl p-6 mb-6">
          <h3 className="text-base font-semibold text-ink mb-3">Scoring Rubric</h3>
          <p className="text-sm text-body mb-3">Your response will be evaluated on a 0-3 scale:</p>
          <ul className="space-y-2 text-sm text-body">
            <li><strong className="text-ink">0 (No Evidence):</strong> {selectedAssessment?.certification_level0_metric}</li>
            <li><strong className="text-ink">1 (Emerging):</strong> {selectedAssessment?.certification_level1_metric}</li>
            <li><strong className="text-ink">2 (Proficient):</strong> {selectedAssessment?.certification_level2_metric}</li>
            <li><strong className="text-ink">3 (Advanced):</strong> {selectedAssessment?.certification_level3_metric}</li>
          </ul>
        </div>

        {/* ── Your Response textarea (pre-populated with answer template) ── */}
        <div className="mb-6">
          <label className="block text-sm font-semibold text-ink mb-2">
            Your Response <span className="text-red-500">*</span>
          </label>
          <textarea
            value={userResponse}
            onChange={(e) => setUserResponse(e.target.value)}
            className="w-full px-4 py-3 border border-hair rounded-lg bg-paper focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent min-h-[420px] font-mono text-sm leading-relaxed"
          />
          <p className="text-sm text-muted mt-2">
            Answer each question by replacing <em>[Answer Here]</em> with your own response. Use the 💡 hints above each question to make sure you cover the key points — the more specific and detailed you are, the better your evaluation will be.
          </p>
        </div>

        {/* Improve English button */}
        <div className="flex justify-end mb-3">
          <QuietButton
            onClick={handleImproveEnglish}
            disabled={!userResponse.trim() || isImproving}
            loading={isImproving}
            icon={<Wand2 size={14} />}
          >
            Improve my English
          </QuietButton>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-300 rounded-lg p-4 flex items-start gap-3 mb-6">
            <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
            <p className="text-red-700 text-sm">{error}</p>
          </div>
        )}

        <QuietButton
          onClick={handleResponseSubmit}
          disabled={loading || !userResponse.trim()}
          loading={loading}
          variant="solid"
          className="w-full justify-center py-3 text-base"
        >
          {loading ? 'Evaluating...' : 'Submit for Evaluation'}
        </QuietButton>
      </div>
    </div>
  );

  const renderResults = () => {
    const remaining = getRemainingAssessments();
    const allPassed = checkAllAssessmentsPassed();
    return (
      <div className="max-w-4xl mx-auto">
        <div className="bg-card border border-hair rounded-2xl p-8 shadow-sm">
          <div className={`text-center mb-8 p-8 rounded-xl border ${
            evaluationScore !== null && evaluationScore >= 2
              ? 'bg-green-50 border-green-300'
              : 'bg-yellow-50 border-yellow-300'
          }`}>
            <div className="flex justify-center mb-4">
              {evaluationScore !== null && evaluationScore >= 2 ? (
                <Sparkles className="h-12 w-12 text-green-600" />
              ) : (
                <RefreshCw className="h-12 w-12 text-yellow-600" />
              )}
            </div>
            <h2 className="text-2xl font-semibold text-ink mb-2">
              {evaluationScore !== null && evaluationScore >= 2 ? 'Congratulations!' : 'Keep Learning!'}
            </h2>
            <p className="text-lg text-body mb-4">
              Your Score: <span className={`font-bold ${
                evaluationScore === 0 ? 'text-red-600' :
                evaluationScore === 1 ? 'text-yellow-700' :
                evaluationScore === 2 ? 'text-blue-700' : 'text-green-700'
              }`}>
                {evaluationScore === 0 ? '0 - No Evidence' :
                 evaluationScore === 1 ? '1 - Emerging' :
                 evaluationScore === 2 ? '2 - Proficient' : '3 - Advanced'}
              </span>
            </p>
          </div>
          <div className="bg-paper border border-hair rounded-xl p-6 mb-6">
            <h3 className="text-base font-semibold text-ink mb-3">Assessment Feedback</h3>
            {renderVoiceBar(
              `Your score is ${evaluationScore !== null ? ['No Evidence', 'Emerging', 'Proficient', 'Advanced'][evaluationScore] : ''}. ${evaluationEvidence}${improvementAdvice ? ' ' + improvementAdvice.replace(/\*\*/g, '').replace(/\[.*?\]\(.*?\)/g, '') : ''}`,
              'Hear feedback'
            )}
            <div className="prose max-w-none text-body prose-p:leading-relaxed prose-p:my-2 prose-strong:text-ink prose-strong:font-semibold prose-ul:my-2 prose-li:my-1 prose-headings:text-ink prose-headings:font-semibold prose-h2:text-base prose-h3:text-base prose-hr:my-3">
              <ReactMarkdown>{evaluationEvidence}</ReactMarkdown>
            </div>
          </div>
          {improvementAdvice && (
            <div className="bg-surface border border-hair rounded-xl p-6 mb-6">
              <h3 className="text-base font-semibold text-ink mb-3">
                {evaluationScore !== null && evaluationScore >= 2
                  ? evaluationScore === 3 ? 'Excellent Work!' : 'Path to Advanced'
                  : 'Improvement Advice'}
              </h3>
              <div className="prose max-w-none text-body prose-p:leading-relaxed prose-p:my-3 prose-strong:text-ink prose-strong:font-semibold prose-ul:my-2 prose-li:my-1 prose-headings:text-ink prose-headings:font-semibold prose-h1:text-sm prose-h2:text-sm prose-h3:text-sm prose-hr:my-4 prose-a:text-accent prose-a:underline [&_h1]:mt-4 [&_h2]:mt-4 [&_h3]:mt-3">
                <ReactMarkdown
                  components={{
                    a: ({ href, children }: { href?: string; children: React.ReactNode }) => (
                      <Link to={href || '#'} className="text-accent hover:underline font-medium">
                        {children}
                      </Link>
                    )
                  }}
                >
                  {improvementAdvice}
                </ReactMarkdown>
              </div>
            </div>
          )}
          {allPassed ? (
            <div className="bg-green-50 border border-green-300 rounded-xl p-6 mb-6">
              <h3 className="text-lg font-semibold text-ink mb-3 flex items-center gap-2">
                <Trophy className="h-6 w-6 text-yellow-500" />
                All Assessments Complete!
              </h3>
              <p className="text-body mb-4">
                Congratulations! You've achieved proficiency in all AI Proficiency assessments.
                You're ready to receive your certification!
              </p>
              <QuietButton onClick={() => setViewMode('certificate')} variant="solid">
                Get Your Certificate
              </QuietButton>
            </div>
          ) : (
            <div className="bg-surface border border-hair rounded-xl p-6 mb-6">
              <h3 className="text-base font-semibold text-ink mb-3">Remaining Assessments</h3>
              <p className="text-body mb-4">
                You still need to achieve Proficient or higher in {remaining.length} assessment{remaining.length !== 1 ? 's' : ''}:
              </p>
              <ul className="space-y-2 mt-2">
                {remaining.map(r => {
                  const fullAssessment = assessments.find(a => a.assessment_name === r.assessment_name);
                  return (
                    <li key={r.assessment_name}>
                      <button
                        onClick={() => fullAssessment && handleSelectAssessment(fullAssessment)}
                        className="flex items-center gap-2 text-accent font-semibold hover:underline transition-colors"
                      >
                        <ArrowRight className="h-4 w-4 flex-shrink-0" />
                        {r.assessment_name}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
          <div className="flex gap-3">
            <QuietButton
              onClick={() => {
                setViewMode('overview');
                setSelectedAssessment(null);
                setLearnerContext({ topic: '', setting: '', constraints: '', audience: '' });
                setUserResponse('');
                setEvaluationScore(null);
                setImprovementAdvice('');
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              className="flex-1 justify-center py-3"
            >
              Back to Overview
            </QuietButton>
            {evaluationScore !== null && evaluationScore < 3 && (
              <QuietButton
                onClick={() => {
                  setUserResponse('');
                  setEvaluationScore(null);
                  setImprovementAdvice('');
                  setViewMode('define-context');
                }}
                variant="solid"
                className="flex-1 justify-center py-3"
              >
                {evaluationScore >= 2 ? 'Try for Advanced' : 'Retake Assessment'}
              </QuietButton>
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
          <Award className="h-16 w-16 text-accent" />
        </div>
        <h2 className="text-3xl font-bold text-ink mb-4">Congratulations! 🎉</h2>
        <p className="text-lg text-body mb-8">
          You've successfully completed all AI Proficiency assessments!
          You're ready to receive your official certificate.
        </p>
        <div className="bg-surface border border-hair rounded-xl p-8 mb-8">
          <h3 className="text-base font-semibold text-ink mb-4">
            How would you like your name to appear on the certificate?
          </h3>
          <input
            type="text"
            value={certificateName}
            onChange={(e) => setCertificateName(e.target.value)}
            placeholder="Enter your full name"
            className="w-full max-w-md mx-auto px-4 py-3 border border-hair rounded-lg bg-card focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent text-center text-lg"
          />
        </div>
        <div className="mb-8">
          <h3 className="text-base font-semibold text-ink mb-3">Your Achievements:</h3>
          <div className="flex flex-wrap justify-center gap-3">
            {assessments.map(a => (
              <span key={a.assessment_name} className="px-4 py-2 bg-green-100 text-green-800 border border-green-300 rounded-full font-medium flex items-center gap-2 text-sm">
                <CheckCircle className="h-4 w-4" />
                {a.assessment_name}
              </span>
            ))}
          </div>
        </div>
        <QuietButton
          onClick={async () => {
            if (certificateName.trim()) {
              await generateCertificate();
              await triggerConfetti();
            }
          }}
          disabled={!certificateName.trim()}
          icon={<Download size={18} />}
          variant="solid"
          className="px-8 py-3 text-base mx-auto"
        >
          Download Certificate
        </QuietButton>
        <p className="text-sm text-muted mt-6">
          Issued by: <strong className="text-body">{branding.institutionName}</strong>
        </p>
        <button
          onClick={() => setViewMode('overview')}
          className="mt-8 text-accent hover:underline font-medium text-sm"
        >
          Return to Overview
        </button>
      </div>
    </div>
  );

  if (loading && assessments.length === 0) {
    return (
      <AppLayout>
        <div className="max-w-6xl mx-auto flex items-center justify-center min-h-[60vh]">
          <div className="text-center">
            <Loader2 className="h-10 w-10 animate-spin text-accent mx-auto mb-4" />
            <p className="text-muted">Loading assessments...</p>
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      {/* Voice fallback — shown when TTS unavailable (e.g. no network voice in Nigeria) */}
      {fallbackText && (
        <div className="fixed bottom-4 right-4 z-50 max-w-sm">
          <VoiceFallback text={fallbackText} onDismiss={clearFallback} />
        </div>
      )}

      <div className="max-w-6xl mx-auto">
        {(() => {
          console.log('[AIProficiency] Rendering viewMode:', viewMode);
          console.log('[AIProficiency] Assessments count:', assessments.length);
          console.log('[AIProficiency] User:', user?.id);
          return null;
        })()}
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

export default AILearningCertificationPage;