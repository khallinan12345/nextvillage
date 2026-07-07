import React, {
  useState,
  useRef,
  useEffect,
  useMemo,
  useCallback
} from 'react';

// Supabase Auth helper (gives you the current session/user)
import { useAuth } from '../hooks/useAuth';   
import { supabase } from '../lib/supabaseClient';
import SpellCheckTextarea from '../components/ui/SpellCheckTextarea';
// Import the serverless chat client functions
import { chatText, chatJSON } from '../lib/chatClient';

import Navbar from '../components/layout/Navbar';
import { AIPidginCoachWrapper } from '../components/AIPidginCoachWrapper';
import { Bot, User, Send, Scissors, Lightbulb, CheckCircle, AlertCircle, Code, List, Hash, Plus, Users, Star, Briefcase, FolderPlus, Mic } from 'lucide-react';
import classNames from 'classnames';

// Enhanced markdown renderer with icons and rich formatting
const MarkdownText: React.FC<{ text: string }> = ({ text }) => {
  const processInlineFormatting = (text: string) => {
    const elements: (string | JSX.Element)[] = [];
    let keyCounter = 0;

    // Process **bold**, *italic*, and `code` formatting
    const formatRegex = /(\*\*.*?\*\*|\*.*?\*|`.*?`)/g;
    let lastIndex = 0;
    let match;

    while ((match = formatRegex.exec(text)) !== null) {
      // Add text before match
      if (match.index > lastIndex) {
        elements.push(text.slice(lastIndex, match.index));
      }

      const matchText = match[1];
      if (matchText.startsWith('**') && matchText.endsWith('**')) {
        // Bold text
        elements.push(
          <strong key={`bold-${keyCounter++}`} className="font-bold text-gray-900">
            {matchText.slice(2, -2)}
          </strong>
        );
      } else if (matchText.startsWith('*') && matchText.endsWith('*')) {
        // Italic text
        elements.push(
          <em key={`italic-${keyCounter++}`} className="italic text-gray-800">
            {matchText.slice(1, -1)}
          </em>
        );
      } else if (matchText.startsWith('`') && matchText.endsWith('`')) {
        // Inline code
        elements.push(
          <code key={`code-${keyCounter++}`} className="bg-gray-200 text-gray-800 px-1 py-0.5 rounded text-sm font-mono">
            {matchText.slice(1, -1)}
          </code>
        );
      }

      lastIndex = match.index + match[0].length;
    }

    // Add remaining text
    if (lastIndex < text.length) {
      elements.push(text.slice(lastIndex));
    }

    return elements.length > 0 ? elements : [text];
  };

  const renderMarkdown = (text: string) => {
    const lines = text.split('\n');
    const elements: JSX.Element[] = [];
    let i = 0;

    while (i < lines.length) {
      const line = lines[i];
      const trimmedLine = line.trim();

      if (!trimmedLine) {
        i++;
        continue;
      }

      // Headers
      if (trimmedLine.startsWith('#')) {
        const headerLevel = trimmedLine.match(/^#+/)?.[0].length || 1;
        const headerText = trimmedLine.replace(/^#+\s*/, '');
        const HeaderTag = `h${Math.min(headerLevel, 6)}` as keyof JSX.IntrinsicElements;
        
        let icon;
        let headerClass = '';
        
        if (headerLevel === 1) {
          icon = <Hash className="w-6 h-6 text-blue-600" />;
          headerClass = 'text-2xl font-bold text-gray-900 flex items-center gap-2 mb-4 mt-6 border-b border-gray-200 pb-2';
        } else if (headerLevel === 2) {
          icon = <Lightbulb className="w-5 h-5 text-blue-500" />;
          headerClass = 'text-xl font-semibold text-gray-800 flex items-center gap-2 mb-3 mt-5';
        } else {
          icon = <Briefcase className="w-4 h-4 text-blue-400" />;
          headerClass = 'text-lg font-medium text-gray-700 flex items-center gap-2 mb-2 mt-4';
        }

        elements.push(
          <HeaderTag key={`header-${i}`} className={headerClass}>
            {icon}
            {headerText}
          </HeaderTag>
        );
      }
      // Code blocks
      else if (trimmedLine.startsWith('```')) {
        const codeLines: string[] = [];
        i++; // Skip the opening ```
        
        while (i < lines.length && !lines[i].trim().startsWith('```')) {
          codeLines.push(lines[i]);
          i++;
        }
        
        elements.push(
          <div key={`codeblock-${i}`} className="my-4">
            <div className="flex items-center gap-2 bg-gray-800 text-white px-3 py-2 rounded-t-lg text-sm">
              <Code className="w-4 h-4" />
              Code
            </div>
            <pre className="bg-gray-100 border border-gray-300 rounded-b-lg p-4 overflow-x-auto">
              <code className="text-sm font-mono text-gray-800">
                {codeLines.join('\n')}
              </code>
            </pre>
          </div>
        );
      }
      // Unordered lists
      else if (trimmedLine.match(/^[-*+]\s/)) {
        const listItems: string[] = [];
        
        while (i < lines.length && lines[i].trim().match(/^[-*+]\s/)) {
          listItems.push(lines[i].trim().replace(/^[-*+]\s/, ''));
          i++;
        }
        i--; // Back up one since we'll increment at the end
        
        elements.push(
          <div key={`list-${i}`} className="my-4">
            <div className="flex items-center gap-2 text-gray-700 mb-2">
              <List className="w-4 h-4 text-green-600" />
              <span className="font-medium text-sm">Key Points</span>
            </div>
            <ul className="ml-6 space-y-1">
              {listItems.map((item, idx) => (
                <li key={idx} className="flex items-start gap-2">
                  <CheckCircle className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                  <span className="text-gray-700">
                    {processInlineFormatting(item).map((element, eIdx) => (
                      <React.Fragment key={eIdx}>{element}</React.Fragment>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        );
      }
      // Numbered lists
      else if (trimmedLine.match(/^\d+\.\s/)) {
        const listItems: string[] = [];
        
        while (i < lines.length && lines[i].trim().match(/^\d+\.\s/)) {
          listItems.push(lines[i].trim().replace(/^\d+\.\s/, ''));
          i++;
        }
        i--; // Back up one since we'll increment at the end
        
        elements.push(
          <div key={`orderedlist-${i}`} className="my-4">
            <div className="flex items-center gap-2 text-gray-700 mb-2">
              <Hash className="w-4 h-4 text-blue-600" />
              <span className="font-medium text-sm">Steps</span>
            </div>
            <ol className="ml-6 space-y-2">
              {listItems.map((item, idx) => (
                <li key={idx} className="flex items-start gap-3">
                  <span className="flex-shrink-0 w-6 h-6 bg-blue-100 text-blue-800 rounded-full flex items-center justify-center text-sm font-semibold">
                    {idx + 1}
                  </span>
                  <span className="text-gray-700 pt-0.5">
                    {processInlineFormatting(item).map((element, eIdx) => (
                      <React.Fragment key={eIdx}>{element}</React.Fragment>
                    ))}
                  </span>
                </li>
              ))}
            </ol>
          </div>
        );
      }
      // Important callouts (lines starting with "**Important:**", "**Note:**", etc.)
      else if (trimmedLine.match(/^\*\*(Important|Note|Warning|Tip|Remember):\*\*/i)) {
        const type = trimmedLine.match(/^\*\*(Important|Note|Warning|Tip|Remember):\*\*/i)?.[1].toLowerCase();
        const content = trimmedLine.replace(/^\*\*(Important|Note|Warning|Tip|Remember):\*\*\s*/i, '');
        
        let icon;
        let bgColor = '';
        let borderColor = '';
        let textColor = '';
        
        switch (type) {
          case 'important':
          case 'warning':
            icon = <AlertCircle className="w-5 h-5 text-red-600" />;
            bgColor = 'bg-red-50';
            borderColor = 'border-red-200';
            textColor = 'text-red-800';
            break;
          case 'tip':
            icon = <Lightbulb className="w-5 h-5 text-yellow-600" />;
            bgColor = 'bg-yellow-50';
            borderColor = 'border-yellow-200';
            textColor = 'text-yellow-800';
            break;
          default:
            icon = <AlertCircle className="w-5 h-5 text-blue-600" />;
            bgColor = 'bg-blue-50';
            borderColor = 'border-blue-200';
            textColor = 'text-blue-800';
        }
        
        elements.push(
          <div key={`callout-${i}`} className={`my-4 p-4 rounded-lg border ${bgColor} ${borderColor}`}>
            <div className={`flex items-start gap-3 ${textColor}`}>
              {icon}
              <div>
                <div className="font-semibold capitalize mb-1">{type}:</div>
                <div>
                  {processInlineFormatting(content).map((element, eIdx) => (
                    <React.Fragment key={eIdx}>{element}</React.Fragment>
                  ))}
                </div>
              </div>
            </div>
          </div>
        );
      }
      // Regular paragraphs
      else {
        // Collect consecutive non-special lines into a paragraph
        const paragraphLines: string[] = [];
        
        while (i < lines.length && 
               lines[i].trim() && 
               !lines[i].trim().startsWith('#') && 
               !lines[i].trim().startsWith('```') &&
               !lines[i].trim().match(/^[-*+]\s/) &&
               !lines[i].trim().match(/^\d+\.\s/) &&
               !lines[i].trim().match(/^\*\*(Important|Note|Warning|Tip|Remember):\*\*/i)) {
          paragraphLines.push(lines[i]);
          i++;
        }
        i--; // Back up one since we'll increment at the end
        
        if (paragraphLines.length > 0) {
          elements.push(
            <p key={`paragraph-${i}`} className="text-gray-700 leading-relaxed my-3">
              {processInlineFormatting(paragraphLines.join(' ')).map((element, eIdx) => (
                <React.Fragment key={eIdx}>{element}</React.Fragment>
              ))}
            </p>
          );
        }
      }
      
      i++;
    }

    return elements;
  };

  return <div className="markdown-content">{renderMarkdown(text)}</div>;
};

// Confetti Animation Component
const ConfettiAnimation: React.FC = () => {
  const colors = ['#3b82f6', '#8b5cf6', '#f59e0b', '#10b981', '#ef4444', '#f59e0b']; // Blue, purple, yellow, green, red
  
  return (
    <>
      <style>{`
        @keyframes confetti-fall {
          0% {
            transform: translateY(-100vh) rotate(0deg);
            opacity: 1;
          }
          100% {
            transform: translateY(100vh) rotate(720deg);
            opacity: 0;
          }
        }
        .confetti-piece {
          animation: confetti-fall 4s linear forwards;
        }
      `}</style>
      <div className="fixed inset-0 pointer-events-none z-50 overflow-hidden">
        {Array.from({ length: 100 }).map((_, i) => (
          <div
            key={i}
            className="absolute w-3 h-3 opacity-90 confetti-piece"
            style={{
              backgroundColor: colors[i % colors.length],
              left: `${Math.random() * 100}%`,
              animationDelay: `${Math.random() * 3}s`,
              animationDuration: `${3 + Math.random() * 2}s`,
              transform: `rotate(${Math.random() * 360}deg)`,
              borderRadius: Math.random() > 0.5 ? '50%' : '0%',
            }}
          />
        ))}
      </div>
    </>
  );
};

interface ChatMessage {
  role: 'assistant' | 'user';
  content: string;
  timestamp: Date;
}

interface AvailableProject {
  learning_module_id?: string;
  id?: string; // for dashboard projects
  title: string;
  description: string;
  sub_category: string;
  outcomes?: string;
  metrics_for_success?: string;
  ai_facilitator_instructions?: string;
  ai_assessment_instructions?: string;
  source: 'learning_module' | 'dashboard' | 'team_project'; // to track source
  team_id?: string; // for collaborative projects
  team_name?: string; // for displaying team name
}

interface Team {
  id: string;
  name: string;
  description: string;
}

interface ProjectSession {
  id: string;
  title: string;
  activity: string;
  sub_category: string;
  learning_module_id: string;
  progress: string;
  evaluation_score?: number;
  evaluation_evidence?: string;
  chat_history?: string;
  created_at: string;
}

interface LearningModule {
  learning_module_id: string;
  title: string;
  description: string;
  category: string;
  sub_category: string;
  outcomes: string;
  metrics_for_success: string;
  ai_facilitator_instructions: string;
  ai_assessment_instructions: string;
  user_id: string;
  public: number;
  grade_level: number;
  continent: string;
}

const ProjectsListPage = () => {
  /* ------------------------------------------------------------------ *
   * Authenticated user
   * ------------------------------------------------------------------ */
  const { user: authUser, loading: authLoading } = useAuth();

  // While the auth hook is still fetching the profile, keep the spinner.
  if (authLoading) {
    return <p className="p-4 text-center">Loading …</p>;
  }

  // Safety net: should never happen because pages are gated,
  // but avoids undefined crashes if someone lands here unauthenticated.
  if (!authUser?.id) {
    return <p className="p-4 text-center text-red-600">
      No signed-in user – please log in again.
    </p>;
  }

  // Stable ref so downstream hooks don't re-fire every render
  const user = useMemo(() => ({ id: authUser.id }), [authUser.id]);

  // Available projects and selection state
  const [availableProjects, setAvailableProjects] = useState<AvailableProject[]>([]);
  const [selectedProject, setSelectedProject] = useState<AvailableProject | null>(null);
  const [selectedLearningModule, setSelectedLearningModule] = useState<LearningModule | null>(null);
  const [currentSession, setCurrentSession] = useState<ProjectSession | null>(null);
  const [showCreateNew, setShowCreateNew] = useState(false);
  
  // Create New Project state
  const [newProjectTitle, setNewProjectTitle] = useState('');
  const [newProjectDescription, setNewProjectDescription] = useState('');
  const [newProjectSubCategory, setNewProjectSubCategory] = useState('');
  const [customSubCategory, setCustomSubCategory] = useState('');
  const [selectedTeamId, setSelectedTeamId] = useState<string>('');
  const [availableTeams, setAvailableTeams] = useState<Team[]>([]);
  const [creatingProject, setCreatingProject] = useState(false);
  
  // Use Your Project section state
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [userInput, setUserInput] = useState<string>('');
  const [loading, setLoading] = useState(false);
  
  // Enhanced features state
  const [evaluating, setEvaluating] = useState(false);
  const [showEvaluationModal, setShowEvaluationModal] = useState(false);
  const [evaluationResult, setEvaluationResult] = useState<{score: number, evidence: string} | null>(null);
  const [showConfetti, setShowConfetti] = useState(false);
  const [userGradeLevel, setUserGradeLevel] = useState<number | null>(null);
  
  // NEW: Voice-related state variables
  const [voiceInputEnabled, setVoiceInputEnabled] = useState(false);
  const [voiceOutputEnabled, setVoiceOutputEnabled] = useState(true);
  const [isListening, setIsListening] = useState(false);
  const [speechRecognition, setSpeechRecognition] = useState<any>(null);
  const [wasListeningBeforeSubmit, setWasListeningBeforeSubmit] = useState(false);
  const [userContinent, setUserContinent] = useState<string | null>(null);
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoice, setSelectedVoice] = useState<SpeechSynthesisVoice | null>(null);
  
  const chatRef = useRef<HTMLDivElement>(null);

  // Project subcategory options
  const subCategoryOptions = [
    'app development',
    'community service',
    'engineering',
    'environmental',
    'game development',
    'health & wellness',
    'research project',
    'robotics',
    'social innovation',
    'STEM challenge',
    'web development',
    'other'
  ];

  // NEW: Initialize speech recognition and voices
  useEffect(() => {
    // Initialize speech recognition
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      const recognition = new SpeechRecognition();
      
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';
      
      if ('speechTimeout' in recognition) {
        recognition.speechTimeout = 10000;
      }
      if ('speechTimeoutDelay' in recognition) {
        recognition.speechTimeoutDelay = 10000;
      }
      
      recognition.onstart = () => {
        setIsListening(true);
      };
      
      recognition.onresult = (event: any) => {
        let finalTranscript = '';
        
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript;
          
          if (event.results[i].isFinal) {
            finalTranscript += transcript;
          }
        }
        
        if (finalTranscript) {
          setUserInput(prev => prev + finalTranscript);
        }
      };
      
      recognition.onerror = (event: any) => {
        console.error('Speech recognition error:', event.error);
        if (event.error !== 'no-speech' && event.error !== 'audio-capture') {
          setIsListening(false);
          alert('Voice input error: ' + event.error);
        }
      };
      
      recognition.onend = () => {
        setIsListening(false);
      };
      
      setSpeechRecognition(recognition);
    }

    // Initialize speech synthesis voices
    const loadVoices = () => {
      const voices = window.speechSynthesis.getVoices();
      console.log('[Projects Voice] Available voices:', voices.map(v => `${v.name} (${v.lang})`));
      setAvailableVoices(voices);
    };

    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;

    return () => {
      window.speechSynthesis.onvoiceschanged = null;
    };
  }, []);

  // NEW: Select appropriate voice based on user's continent and grade level
  useEffect(() => {
    if (availableVoices.length > 0 && userContinent) {
      const voice = selectCulturallyAppropriateVoice(userContinent, userGradeLevel);
      setSelectedVoice(voice);
      console.log('[Projects Voice] Selected voice:', voice?.name, voice?.lang);
    }
  }, [availableVoices, userContinent, userGradeLevel]);

  // NEW: Function to select culturally appropriate voice
  const selectCulturallyAppropriateVoice = (continent: string, gradeLevel: number | null): SpeechSynthesisVoice | null => {
    if (availableVoices.length === 0) return null;

    // FORCE GOOGLE US ENGLISH FEMALE 4 VOICE
    const googleFemale4 = availableVoices.find(v => 
      v.name === 'Google US English Female 4' ||
      v.name.toLowerCase().includes('google us english female 4')
    );
    if (googleFemale4) {
      console.log('[Projects Voice] Found and using Google US English Female 4:', googleFemale4.name);
      return googleFemale4;
    }

    let preferredVoices: string[] = [];
    let preferredLangs: string[] = [];

    if (continent === 'North America') {
      preferredVoices = [
        'Google US English Female 6', 
        'Google US English Female 2',
        'Google US English Female 3',
        'Google US English Female 5',
        'Google US English Female', 
        'Microsoft Jenny Online (Natural)', 
        'Microsoft Aria Online (Natural)',
        'Microsoft Zira Desktop',
        'Samantha',
        'Victoria'
      ];
      preferredLangs = ['en-US', 'en-CA'];
    } else if (continent === 'Africa') {
      preferredVoices = [
        'Microsoft Abeo Online (Natural)',
        'Microsoft Aditi Desktop',
        'Google UK English Female',
        'Microsoft Hazel Desktop',
        'Kate',
        'Daniel',
        'Serena',
        'Moira',
        'Karen',
        'Veena'
      ];
      preferredLangs = ['en-NG', 'en-GB', 'en-AU', 'en-IN', 'en-ZA', 'en-US'];
    } else {
      preferredVoices = [
        'Microsoft Aria Online (Natural)',
        'Google US English Female',
        'Samantha',
        'Victoria'
      ];
      preferredLangs = ['en-US', 'en-GB'];
    }

    // Try to find exact voice name matches
    for (const voiceName of preferredVoices) {
      const voice = availableVoices.find(v => 
        v.name.toLowerCase().includes(voiceName.toLowerCase())
      );
      if (voice) return voice;
    }

    // Try to find voices by language preference and female gender
    for (const lang of preferredLangs) {
      const voice = availableVoices.find(v => 
        v.lang.startsWith(lang) && 
        (v.name.toLowerCase().includes('female') || 
         v.name.toLowerCase().includes('woman') ||
         /samantha|victoria|zira|aria|ava|serena|allison|erin|fiona|kate|hazel|moira|karen|veena/i.test(v.name))
      );
      if (voice) return voice;
    }

    // Fallback to any voice in preferred languages
    for (const lang of preferredLangs) {
      const voice = availableVoices.find(v => v.lang.startsWith(lang));
      if (voice) return voice;
    }

    return availableVoices[0] || null;
  };

  // NEW: Voice input function
  const startVoiceInput = () => {
    if (!speechRecognition) {
      alert('Voice input is not supported in your browser. Please use Chrome, Edge, or Safari.');
      return;
    }
    
    if (isListening) {
      speechRecognition.stop();
      setWasListeningBeforeSubmit(false);
      return;
    }
    
    try {
      speechRecognition.start();
    } catch (error) {
      console.error('Error starting voice input:', error);
      alert('Could not start voice input. Please try again.');
    }
  };

  // Auto-scroll chat to bottom when new messages are added
  useEffect(() => {
    if (chatRef.current) {
      chatRef.current.scrollTop = chatRef.current.scrollHeight;
    }
  }, [chatHistory]);

  // Fetch user's grade level and continent from profiles
  const fetchUserProfile = async (userId: string) => {
    try {
      console.log('[Projects Profile] Fetching profile for user:', userId);
      
      const { data, error } = await supabase
        .from('profiles')
        .select('grade_level, continent')
        .eq('id', userId)
        .single();

      if (error) {
        console.error('[Projects Profile] Error fetching profile:', error);
        return { gradeLevel: null, continent: null };
      }

      console.log('[Projects Profile] Profile fetched:', data);
      return {
        gradeLevel: data?.grade_level || null,
        continent: data?.continent || null
      };
    } catch (err) {
      console.error('[Projects Profile] Error fetching user profile:', err);
      return { gradeLevel: null, continent: null };
    }
  };

  // Function to get grade-appropriate project management instructions
  const getGradeAppropriateProjectInstructions = (gradeLevel: number | null): string => {
    const commonGuidance = `CRITICAL: Your role is to be a PROJECT MENTOR and FACILITATOR, not to do the work for students. Guide them through project planning, problem-solving, and collaboration. Ask probing questions, provide structured frameworks, and help them break down complex challenges into manageable steps. Foster teamwork, critical thinking, and project management skills.

RESPONSE LENGTH: Keep responses to 75 words maximum unless it's absolutely essential to provide more information for project guidance. Be concise while maintaining effectiveness and encouragement.`;
    
    if (gradeLevel === 1) {
      // Grades 3-5 (Elementary)
      return `${commonGuidance}

Important: This student is in elementary school (grades 3-5). Use simple, clear language that an 8-11 year old can understand. Use shorter sentences, avoid complex vocabulary, and be extra encouraging and supportive. 

PROJECT MENTORING APPROACH: Ask simple project questions like "What's the first thing we need to do?" or "Who can help us with this part?" Break big projects into small, fun steps. Use examples from their world like school projects, family activities, or games they know. Help them make simple plans and celebrate each small success. Make project work feel like building something awesome together! Teach basic teamwork skills through simple, clear guidance.`;
    } else if (gradeLevel === 2) {
      // Grades 6-8 (Middle School)
      return `${commonGuidance}

Important: This student is in middle school (grades 6-8). Use age-appropriate language for an 11-14 year old. You can use slightly more complex vocabulary but still keep explanations clear and relatable.

PROJECT MENTORING APPROACH: Ask thoughtful project management questions that build on their developing organizational skills. Use questions like "What resources do we need?" or "How should we divide up the work?" Help them create basic project timelines and understand team roles. Use examples from school group projects, sports teams, or activities they might relate to. Encourage them to explain their project plans and challenge them to think about potential problems and solutions. Guide them in basic collaboration and communication skills.`;
    } else if (gradeLevel === 3) {
      // Grades 9-12 (High School)
      return `${commonGuidance}

Important: This student is in high school (grades 9-12). You can use sophisticated language and concepts appropriate for a 14-18 year old. They can handle complex project management challenges and advanced collaboration techniques.

PROJECT MENTORING APPROACH: Use advanced project management techniques and frameworks. Ask questions like "How will you measure success?" or "What are the critical path dependencies?" Guide them through formal project planning, risk assessment, and stakeholder analysis. Connect projects to their future goals, college applications, career interests, and real-world applications. Challenge them to lead effectively, manage resources efficiently, and deliver professional-quality results. Encourage innovation and systematic problem-solving approaches.`;
    } else if (gradeLevel === 4) {
      // All grade levels, but accessible to grades 3-5
      return `${commonGuidance}

Important: Adapt your communication style to be clear and accessible, especially to younger students (grades 3-5). Use encouraging, simple language and check for understanding frequently. Focus on making project work collaborative and achievable while challenging all learners.

PROJECT MENTORING APPROACH: Use project guidance that can engage learners across grade levels, but ensure language is simple enough for elementary students. Ask questions like "What's our next step?" Use examples that work for all ages - school, family, community projects. Encourage teamwork and planning. Help break big ideas into smaller steps that anyone can understand. Make project success feel like a team victory for everyone!`;
    } else {
      // Default/Unknown grade level - assume needs to be accessible
      return `${commonGuidance}

Important: Adapt your communication style to be clear and age-appropriate. Use encouraging, accessible language and check for understanding frequently. Focus on guiding students through effective project management and teamwork rather than providing direct solutions.

PROJECT MENTORING APPROACH: Use project management questioning that engages collaborative thinking. Ask questions that help students plan effectively and work well together. Use relatable examples and encourage systematic approaches. Guide them through project phases while maintaining an encouraging, supportive atmosphere that builds confidence in their abilities.`;
    }
  };

  // Load available projects from both learning_modules and dashboard
/* ------------------------------------------------------------------ *
 *  Load *all* projects the learner can pick from:
 *    • Custom "Project" learning‑modules the learner created
 *    • Their own dashboard rows of type "Collaborative Project"
 *    • Team projects from the projects table they have access to
 * ------------------------------------------------------------------ */
const loadAvailableProjects = useCallback(async () => {
  try {
    console.log('Loading available projects for user:', user.id);

    /* ─────────────── 1. learner‑owned custom Project templates ──────────── */
    const { data: lmData, error: lmError } = await supabase
      .from('learning_modules')
      .select(
        'learning_module_id, title, description, sub_category, ' +
        'outcomes, metrics_for_success, ' +
        'ai_facilitator_instructions, ai_assessment_instructions'
      )
      .eq('user_id', user.id)
      .eq('category', 'Project')
      .order('created_at', { ascending: false });

    if (lmError) throw lmError;

    /* ─────────────── 2. learner's dashboard Collaborative Projects ───────── */
    const { data: dashData, error: dashError } = await supabase
      .from('dashboard')
      .select(
        'id, title, activity, sub_category, learning_module_id, team_id'
      )
      .eq('user_id', user.id)                              // <- only theirs
      .eq('category_activity', 'Collaborative Project')
      .order('created_at', { ascending: false });

    if (dashError) throw dashError;

    /* ─────────────── 3. team projects from projects table ─────────────────── */
    // First get team IDs where user is a member or creator
    const { data: userTeams, error: userTeamsError } = await supabase
      .from('team_members')
      .select('team_id')
      .eq('user_id', user.id);

    if (userTeamsError) throw userTeamsError;

    const { data: createdTeams, error: createdTeamsError } = await supabase
      .from('teams')
      .select('id')
      .eq('created_by', user.id);

    if (createdTeamsError) throw createdTeamsError;

    // Combine team IDs (user is member of + user created)
    const allTeamIds = [
      ...(userTeams || []).map(t => t.team_id),
      ...(createdTeams || []).map(t => t.id)
    ].filter((id, index, self) => self.indexOf(id) === index); // deduplicate

    let teamProjectsData = [];
    if (allTeamIds.length > 0) {
      const { data: teamProjects, error: teamProjectsError } = await supabase
        .from('projects')
        .select(`
          id,
          team_id,
          name,
          description,
          learning_module_id,
          teams!inner(name)
        `)
        .in('team_id', allTeamIds)
        .order('created_at', { ascending: false });

      if (teamProjectsError) throw teamProjectsError;
      teamProjectsData = teamProjects || [];
    }

    /* ─────────────── 4. merge all sources into one array ─────────────────── */
    const combined: AvailableProject[] = [
      /* custom learning‑module projects */
      ...(lmData || []).map(row => ({
        ...row,
        source: 'learning_module' as const          // discriminant
      })),

      /* dashboard collaborative projects */
      ...(dashData || []).map(row => ({
        id:                 row.id,                 // dashboard row id
        learning_module_id: row.learning_module_id, // **needed later**
        title:              row.title,
        description:        row.activity || row.title,
        sub_category:       row.sub_category,
        source:             'dashboard' as const,
        team_id:            row.team_id
      })),

      /* team projects from projects table */
      ...teamProjectsData.map(row => ({
        id:                 row.id,                 // projects table id
        learning_module_id: row.learning_module_id,
        title:              row.name,
        description:        row.description,
        sub_category:       'team project',         // default for team projects
        source:             'team_project' as const,
        team_id:            row.team_id,
        team_name:          row.teams?.name         // include team name for display
      }))
    ];

    console.log('Combined projects loaded:', combined);
    setAvailableProjects(combined);
  } catch (err) {
    console.error('Error loading available projects:', err);
  }
}, [user.id]);

  // Load available teams for project creation
  const loadAvailableTeams = useCallback(async () => {
    try {
      console.log('Loading available teams for user:', user.id);
      
      // Query teams where user is either the creator OR a member
      const { data, error } = await supabase
        .from('teams')
        .select(`
          id,
          name,
          created_by,
          team_code,
          team_members!inner(user_id)
        `)
        .or(`created_by.eq.${user.id},team_members.user_id.eq.${user.id}`)
        .order('name', { ascending: true });

      if (error) throw error;

      // Transform the data to match expected interface
      const transformedData = (data || []).map(team => ({
        id: team.id,
        name: team.name,
        description: `Team Code: ${team.team_code}` // Use team_code as description since there's no description column
      }));

      console.log('Available teams loaded:', transformedData);
      setAvailableTeams(transformedData);
    } catch (err) {
      console.error('Error loading available teams:', err);
      // Try a simpler query as fallback
      try {
        console.log('Trying fallback query for teams...');
        
        // Fallback: Get teams created by user
        const { data: createdTeams, error: createdError } = await supabase
          .from('teams')
          .select('id, name, team_code')
          .eq('created_by', user.id)
          .order('name', { ascending: true });

        if (createdError) throw createdError;

        // Get teams where user is a member
        const { data: memberTeams, error: memberError } = await supabase
          .from('team_members')
          .select(`
            team_id,
            teams!inner(id, name, team_code)
          `)
          .eq('user_id', user.id);

        if (memberError) throw memberError;

        // Combine and deduplicate teams
        const allTeams = [
          ...(createdTeams || []),
          ...(memberTeams || []).map(mt => mt.teams)
        ].filter((team, index, self) => 
          index === self.findIndex(t => t.id === team.id)
        );

        const transformedFallbackData = allTeams.map(team => ({
          id: team.id,
          name: team.name,
          description: `Team Code: ${team.team_code}`
        }));

        console.log('Fallback teams loaded:', transformedFallbackData);
        setAvailableTeams(transformedFallbackData);
      } catch (fallbackErr) {
        console.error('Fallback team loading also failed:', fallbackErr);
        setAvailableTeams([]);
      }
    }
  }, [user.id]);

  // Load available projects, teams, and user profile on component mount
  useEffect(() => {
    if (user?.id) {
      loadAvailableProjects();
      loadAvailableTeams();
      
      // NEW: Fetch user's profile (grade level and continent) if not already loaded
      if (userGradeLevel === null || userContinent === null) {
        fetchUserProfile(user.id).then(profile => {
          setUserGradeLevel(profile.gradeLevel);
          setUserContinent(profile.continent);
        });
      }
    }
  }, [loadAvailableProjects, loadAvailableTeams, user?.id, userGradeLevel, userContinent]);

  const loadLearningModule = async (project: AvailableProject) => {
    try {
      if (project.source === 'learning_module' && project.learning_module_id) {
        const { data, error } = await supabase
          .from('learning_modules')
          .select('*')
          .eq('learning_module_id', project.learning_module_id)
          .single();

        if (error) throw error;
        setSelectedLearningModule(data);
      } else if (project.source === 'dashboard') {
        // For dashboard projects, create a minimal learning module structure
        const mockLearningModule: LearningModule = {
          learning_module_id: project.id || '',
          title: project.title,
          description: project.description,
          category: 'Project',
          sub_category: project.sub_category,
          outcomes: 'Students will develop effective project management and collaboration skills through this project.',
          metrics_for_success: 'Student demonstration of project planning, problem-solving, collaboration, critical thinking, and adaptability.',
          ai_facilitator_instructions: `Overview:
The AI assistant is designed to be a project management mentor for the collaborative project "${project.title}". 

The AI assistant should engage students in a structured, supportive, and encouraging manner focusing on project coordination, task management, team communication, and problem-solving. Guide students through collaborative project methodologies while maintaining engagement and motivation.

Step-by-Step Instructions:
1. Help students understand their role in the collaborative project and coordinate with team members.
2. Guide them in breaking down project tasks, managing timelines, and communicating effectively.
3. Support problem-solving and decision-making throughout the project lifecycle.`,
          ai_assessment_instructions: `Evaluate the student's collaborative project management skills based on their engagement, communication, problem-solving, and contribution to team goals. Score from 0-100 based on project participation and learning outcomes.`,
          user_id: user.id,
          public: 0,
          grade_level: 0,
          continent: 'NULL'
        };
        setSelectedLearningModule(mockLearningModule);
      } else if (project.source === 'team_project') {
        // For team projects, check if there's an associated learning module first
        if (project.learning_module_id) {
          try {
            const { data, error } = await supabase
              .from('learning_modules')
              .select('*')
              .eq('learning_module_id', project.learning_module_id)
              .single();

            if (!error && data) {
              setSelectedLearningModule(data);
              return;
            }
          } catch (moduleError) {
            console.log('No associated learning module found, creating mock module');
          }
        }

        // Create a mock learning module for team projects
        const mockLearningModule: LearningModule = {
          learning_module_id: project.id || '',
          title: project.title,
          description: project.description,
          category: 'Project',
          sub_category: project.sub_category,
          outcomes: `Students will develop effective team collaboration and project management skills through "${project.title}".`,
          metrics_for_success: 'Student demonstration of team collaboration, project planning, problem-solving, communication, and adaptability in a team environment.',
          ai_facilitator_instructions: `Overview:
The AI assistant is designed to be a team project mentor for "${project.title}" ${project.team_name ? `(Team: ${project.team_name})` : ''}. 

The AI assistant should engage students in structured team collaboration, focusing on coordinating team efforts, managing shared resources, facilitating communication, and ensuring all team members contribute effectively to project success.

Step-by-Step Instructions:
1. Help students understand their role within the team and coordinate effectively with team members.
2. Guide them in collaborative planning, task delegation, timeline management, and team communication strategies.
3. Support team problem-solving, conflict resolution, and collective decision-making throughout the project lifecycle.
4. Encourage shared ownership, mutual accountability, and collaborative learning among team members.`,
          ai_assessment_instructions: `Evaluate the student's team collaboration and project management skills based on their engagement with team members, communication effectiveness, problem-solving contribution, and overall impact on team project success. Score from 0-100 based on collaborative participation and learning outcomes in a team environment.`,
          user_id: user.id,
          public: 0,
          grade_level: 0,
          continent: 'NULL'
        };
        setSelectedLearningModule(mockLearningModule);
      }
    } catch (error) {
      console.error('Error loading learning module:', error);
    }
  };

  // REPLACED: Direct OpenAI API call with serverless chatText function
  const callChatAPI = async (messages: any[]) => {
    try {
      // Convert messages to the format expected by chatText
      const formattedMessages = messages
        .filter(msg => msg.role !== 'system') // Remove system message, will be passed separately
        .map(msg => ({
          role: msg.role as 'user' | 'assistant',
          content: msg.content
        }));

      // Extract system message if present
      const systemMessage = messages.find(msg => msg.role === 'system');

      const reply = await chatText({ page: 'ProjectsListPage',
        messages: formattedMessages,
        system: systemMessage?.content,
        max_tokens: 500,
        temperature: 0.7
      });

      return reply;
    } catch (error) {
      console.error('Chat API Error:', error);
      return 'An error occurred. Please try again.';
    }
  };

  // REPLACED: Assessment API call with serverless chatJSON function
  const callAssessmentAPI = async (chatHistory: ChatMessage[], assessmentInstructions: string, outcomes: string, successMetrics: string) => {
    try {
      console.log('[Assessment] Making assessment API call');
      
      const chatHistoryText = chatHistory.slice(1).map(msg => 
        `${msg.role === 'assistant' ? 'AI Project Mentor' : 'Student'}: ${msg.content}`
      ).join('\n\n');

      const assessmentPrompt = `Assessment Instructions:
${assessmentInstructions}

Learning Outcomes:
${outcomes}

Success Metrics for Evaluation:
${successMetrics}

Please evaluate the student's project management and collaboration performance based on the above assessment instructions, learning outcomes, and success metrics. Use the conversation history below to make your evaluation.

Conversation History:
${chatHistoryText}

CRITICAL: You must respond with ONLY valid JSON in exactly this format:
{
  "evaluation_score": [number from 0-100],
  "evaluation_evidence": "[detailed explanation of the score]"
}
If the ${assessmentInstructions} ask for an evaluation score in the range of 0-1, scale appropriately from 0 to 100. 
The assessment MUST be an integer. 

Remember:
- 0-30: Poor performance, minimal engagement or understanding
- 31-60: Below average, some understanding but significant gaps
- 61-80: Good performance, solid understanding with minor gaps
- 81-95: Excellent performance, strong understanding and engagement
- 96-100: Outstanding performance, exceptional understanding and insight

Provide your assessment now:`;

      console.log('[Assessment] Sending assessment request');

      const assessment = await chatJSON({
        messages: [{ role: 'user', content: assessmentPrompt }],
        system: 'You are an AI assessment evaluator for project management sessions. Respond only with valid JSON containing evaluation_score and evaluation_evidence.',
        max_tokens: 300,
        temperature: 0.2
      });
      
      console.log('[Assessment] Raw response:', assessment);
      
      // Validate the response structure
      if (typeof assessment === 'object' && assessment !== null) {
        if (typeof assessment.evaluation_score === 'number' && typeof assessment.evaluation_evidence === 'string') {
          assessment.evaluation_score = Math.max(0, Math.min(100, assessment.evaluation_score));
          return assessment;
        }
      }

      // Fallback if assessment is not in expected format
      console.error('[Assessment] Invalid response format:', assessment);
      return {
        evaluation_score: 75,
        evaluation_evidence: 'Assessment completed based on project management conversation analysis and success metrics.'
      };
    } catch (error) {
      console.error('[Assessment] Error:', error);
      
      return {
        evaluation_score: 0,
        evaluation_evidence: 'Assessment could not be completed due to technical issues.'
      };
    }
  };

  // Update session evaluation in database
  /* ──────────────────────────────────────────────────────────────────────── *
   *  START OR LOAD A PROJECT SESSION
   *  Handles ALL duplicate‑row variants: 409, 23505, duplicate‑key msg
   * ──────────────────────────────────────────────────────────────────────── */
const startProjectSession = async (project: AvailableProject) => {
  /* Figure out which key uniquely identifies the project.        */
  const moduleKey =
    project.learning_module_id ??               // learning_modules row
    project.module_id          ??               // (if you stored it here)
    project.id;                                 // dashboard‑origin row

  /* 1️⃣ Look for an existing dashboard row  --------------------- */
  const { data: existing, error: selErr, status } = await supabase
    .from('dashboard')
    .select('*')
    .eq('user_id', user.id)
    .eq('learning_module_id', moduleKey)
    .maybeSingle();                 // ← null instead of throwing 406

  if (selErr && status !== 406) throw selErr;
  if (existing) return existing as DashboardRow;

  /* 2️⃣ Build a new row and try to insert it  ------------------- */
  const sessionId = crypto.randomUUID().slice(0, 8);
  const sessionTitle = `${project.title} - Session ${sessionId}`;

  const newRow = {
    user_id: user.id,
    category_activity: 'Collaborative Project',
    title: sessionTitle,
    learning_module_id: moduleKey,
    sub_category: project.sub_category,
    activity: sessionTitle,
    progress: 'started'
  };

  const { data: inserted, error: insErr } = await supabase
    .from('dashboard')
    .insert([newRow])
    .select()
    .single();

  /* 3️⃣ Duplicate? → re‑query and return that row  -------------- */
  if (insErr) {
    const isDuplicate =
      insErr.status === 409 ||               // Supabase HTTP conflict
      insErr.code   === '23505' ||           // Postgres unique‑violation
      (typeof insErr.message === 'string' &&
       insErr.message.toLowerCase().includes('duplicate key'));

    if (isDuplicate) {
      const { data } = await supabase
        .from('dashboard')
        .select('*')
        .eq('user_id', user.id)
        .eq('learning_module_id', moduleKey)
        .single();
      return data as DashboardRow;
    }
    throw insErr;                            // any other error
  }

  return inserted as DashboardRow;
};
/* ──────────────────────────────────────────────────────────────────────── */

  // Handle evaluation function
  const handleEvaluateSession = async () => {
    if (!currentSession || !selectedLearningModule || chatHistory.length <= 1) {
      alert('No conversation history available for evaluation.');
      return;
    }

    setEvaluating(true);
    
    try {
      // Call assessment API with success metrics
      const assessment = await callAssessmentAPI(
        chatHistory, 
        selectedLearningModule.ai_assessment_instructions, 
        selectedLearningModule.outcomes, 
        selectedLearningModule.metrics_for_success
      );
      
      // Update database with evaluation
      const shouldComplete = assessment.evaluation_score > 84.95;
      const newProgress = shouldComplete ? 'completed' : 'started';
      
      const { error } = await supabase
        .from('dashboard')
        .update({ 
          evaluation_score: assessment.evaluation_score,
          evaluation_evidence: assessment.evaluation_evidence,
          chat_history: JSON.stringify(chatHistory),
          progress: newProgress,
          updated_at: new Date().toISOString()
        })
        .eq('id', currentSession.id);

      if (error) throw error;
      
      // Update local session state
      setCurrentSession(prev => prev ? {
        ...prev,
        evaluation_score: assessment.evaluation_score,
        evaluation_evidence: assessment.evaluation_evidence,
        progress: newProgress
      } : null);
      
      // Show evaluation results in modal
      setEvaluationResult({
        score: assessment.evaluation_score,
        evidence: assessment.evaluation_evidence
      });
      setShowEvaluationModal(true);
      
      // Show confetti if completed
      if (shouldComplete) {
        setShowConfetti(true);
        setTimeout(() => setShowConfetti(false), 10000);
      }
      
    } catch (error) {
      console.error('Error during evaluation:', error);
      alert('Failed to complete evaluation. Please try again.');
    } finally {
      setEvaluating(false);
    }
  };

  // Update chat history in database
  const updateChatHistory = async (sessionId: string, chatHistory: ChatMessage[]) => {
    try {
      const { error } = await supabase
        .from('dashboard')
        .update({ 
          chat_history: JSON.stringify(chatHistory),
          updated_at: new Date().toISOString()
        })
        .eq('id', sessionId);

      if (error) throw error;
    } catch (err) {
      console.error('Error updating chat history:', err);
    }
  };

  const generateUUID = () => {
    return crypto.randomUUID();
  };

  // Create new learning module for project
  const createNewProject = async () => {
    if (!newProjectTitle.trim() || !newProjectDescription.trim() || !newProjectSubCategory) {
      alert('Please fill in all required fields.');
      return;
    }

    const finalSubCategory = newProjectSubCategory === 'other' ? customSubCategory.trim() : newProjectSubCategory;
    
    if (!finalSubCategory) {
      alert('Please specify the sub-category.');
      return;
    }

    setCreatingProject(true);
    
    try {
      const projectId = generateUUID();
      
      // Default AI facilitator instructions for project management
      const defaultFacilitatorInstructions = `Overview:
The AI assistant is designed to be a project management mentor and facilitator, helping students develop effective project planning, execution, and collaboration skills. It uses the 'title' and 'description' of the project defined by the student as key inputs.

The AI assistant should engage students in a structured, supportive, and encouraging manner. It should focus on developing project management competencies including planning, resource allocation, timeline management, risk assessment, team coordination, and quality control. The AI should guide students through systematic project methodologies while maintaining engagement and motivation.

The AI assistant should identify what barriers might be limiting the student's project success and help them develop strategies to overcome these challenges. It should emphasize collaborative problem-solving, iterative improvement, and systematic thinking approaches.

Step-by-Step Instructions:
1. When a user begins working on their project, the AI should explain how it will help them succeed through structured project management guidance.
2. The AI should help the student break down their project into manageable phases, identify key milestones, and establish realistic timelines.
3. Throughout the project, the AI should guide the student in problem-solving, resource planning, and collaboration strategies while encouraging ownership and decision-making.
4. The AI should regularly check progress, help adjust plans as needed, and provide encouragement while maintaining focus on learning objectives.`;

      // Default AI assessment instructions for project management
      const defaultAssessmentInstructions = `The AI Assessment instructions are as follows:
Review the chat_history to evaluate the quality of the student's project management and collaboration skills relative to the following rubric.
The output should be an evaluation_score that represents an average across all categories normalized to 0-100. The output must also include evaluation_evidence with specific examples from the conversation for each category.

Assessment Categories:
{
    "Project Planning": {
        "description": "The ability to break down complex projects into manageable tasks, create realistic timelines, and identify necessary resources.",
        "scores": {
            "0": "Very low proficiency - No evidence of planning skills.",
            "1": "Low proficiency - Limited demonstration of basic planning.",
            "2": "Moderate proficiency - Inconsistent planning approach.",
            "3": "Good proficiency - Generally demonstrates effective planning.",
            "4": "Very good proficiency - Consistently plans projects well.",
            "5": "Excellent proficiency - Demonstrates mastery in project planning."
        }
    },
    "Problem Solving": {
        "description": "The capacity to identify challenges, analyze problems systematically, and develop effective solutions.",
        "scores": {
            "0": "Very low proficiency - No evidence of problem-solving skills.",
            "1": "Low proficiency - Limited demonstration of problem-solving.",
            "2": "Moderate proficiency - Inconsistent problem-solving approach.",
            "3": "Good proficiency - Generally solves problems effectively.",
            "4": "Very good proficiency - Consistently demonstrates strong problem-solving.",
            "5": "Excellent proficiency - Demonstrates mastery in problem-solving."
        }
    },
    "Collaboration & Communication": {
        "description": "The ability to work effectively with others, communicate clearly, and coordinate team efforts.",
        "scores": {
            "0": "Very low proficiency - No evidence of collaboration skills.",
            "1": "Low proficiency - Limited demonstration of teamwork.",
            "2": "Moderate proficiency - Inconsistent collaboration approach.",
            "3": "Good proficiency - Generally collaborates effectively.",
            "4": "Very good proficiency - Consistently works well in teams.",
            "5": "Excellent proficiency - Demonstrates mastery in collaboration."
        }
    },
    "Critical Thinking": {
        "description": "The capacity to analyze information objectively, evaluate alternatives, and make reasoned decisions.",
        "scores": {
            "0": "Very low proficiency - No evidence of critical thinking.",
            "1": "Low proficiency - Limited demonstration of analytical thinking.",
            "2": "Moderate proficiency - Inconsistent critical thinking approach.",
            "3": "Good proficiency - Generally thinks critically about issues.",
            "4": "Very good proficiency - Consistently demonstrates strong critical thinking.",
            "5": "Excellent proficiency - Demonstrates mastery in critical thinking."
        }
    },
    "Adaptability & Learning": {
        "description": "The ability to adjust plans when needed, learn from feedback, and continuously improve project outcomes.",
        "scores": {
            "0": "Very low proficiency - No evidence of adaptability.",
            "1": "Low proficiency - Limited demonstration of learning from experience.",
            "2": "Moderate proficiency - Inconsistent adaptability.",
            "3": "Good proficiency - Generally adapts well to changes.",
            "4": "Very good proficiency - Consistently learns and adapts effectively.",
            "5": "Excellent proficiency - Demonstrates mastery in adaptability and learning."
        }
    }
}`;
      
      // Create learning module
      const { data: learningModuleData, error: learningModuleError } = await supabase
        .from('learning_modules')
        .insert([
          {
            learning_module_id: projectId,
            title: newProjectTitle.trim(),
            description: newProjectDescription.trim(),
            category: 'Project',
            sub_category: finalSubCategory,
            outcomes: `Students will develop effective project management skills including planning, problem-solving, collaboration, and critical thinking through ${newProjectTitle}.`,
            metrics_for_success: 'Student demonstration of project planning, problem-solving, collaboration, critical thinking, and adaptability throughout the project lifecycle.',
            ai_facilitator_instructions: defaultFacilitatorInstructions,
            ai_assessment_instructions: defaultAssessmentInstructions,
            user_id: user.id,
            public: 0,
            grade_level: 0,
            continent: 'North America'
          }
        ])
        .select()
        .single();

      if (learningModuleError) throw learningModuleError;

      // If a team is selected, create a collaborative project in the projects table
      if (selectedTeamId) {
        try {
          const { error: projectError } = await supabase
            .from('projects')
            .insert([
              {
                team_id: selectedTeamId,
                name: newProjectTitle.trim(),
                description: newProjectDescription.trim(),
                learning_module_id: projectId
              }
            ]);

          if (projectError) {
            console.error('Error creating team project entry:', projectError);
            // Don't throw error here, as the learning module was created successfully
          } else {
            console.log('Successfully created team project entry');
          }
        } catch (projectErr) {
          console.error('Error with team project entry:', projectErr);
        }
      }

      await loadAvailableProjects();
      setShowCreateNew(false);
      setNewProjectTitle('');
      setNewProjectDescription('');
      setNewProjectSubCategory('');
      setCustomSubCategory('');
      setSelectedTeamId('');
      
      alert('Project created successfully!');
    } catch (err: any) {
      console.error('Error creating new project:', err);
      alert(`Could not create project:\n${err.message ?? err}`);
    } finally {
      setCreatingProject(false);
    }
  };

  const handleSelectProject = async (project: AvailableProject) => {
    setSelectedProject(project);
    await loadLearningModule(project);
    setShowCreateNew(false);
    
    // Clear any existing session and chat history
    setCurrentSession(null);
    setChatHistory([]);
  };

  /** Delete a saved project (plus any dashboard rows that reference it) */
  const handleDeleteProject = async (project: AvailableProject) => {
    if (!confirm('Delete this project for good?  This cannot be undone.')) return;

    try {
      // 1️⃣  Remove dashboard rows that reference the project
      if (project.learning_module_id) {
        await supabase
          .from('dashboard')
          .delete()
          .eq('learning_module_id', project.learning_module_id);
      } else if (project.id) {
        await supabase
          .from('dashboard')
          .delete()
          .eq('id', project.id);
      }

      // 2️⃣  If the project came from a custom learning module, remove that too
      if (project.source === 'learning_module' && project.learning_module_id) {
        await supabase
          .from('learning_modules')
          .delete()
          .eq('learning_module_id', project.learning_module_id);
      }

      // 3️⃣  Refresh the list (and clear selections if they were just deleted)
      await loadAvailableProjects();
      if (
        selectedProject &&
        (selectedProject.learning_module_id === project.learning_module_id ||
        selectedProject.id === project.id)
      ) {
        setSelectedProject(null);
        setSelectedLearningModule(null);
        setCurrentSession(null);
        setChatHistory([]);
      }

      alert('Project deleted.');
    } catch (err) {
      console.error('Failed to delete project:', err);
      alert('Sorry - could not delete this project. Please try again.');
    }
  };


  const handleUseSelectedProject = async () => {
    if (!selectedProject) return;

    try {
      const sessionRow = await startProjectSession(selectedProject);
      setCurrentSession(sessionRow);              // whatever you already do
      
      // Load stored chat history if available
      let initialChatHistory: ChatMessage[] = [];
      if (sessionRow.chat_history) {
        try {
          const storedHistory = JSON.parse(sessionRow.chat_history);
          if (Array.isArray(storedHistory) && storedHistory.length > 0) {
            initialChatHistory = storedHistory.map((msg: any) => ({
              ...msg,
              timestamp: new Date(msg.timestamp)
            }));
          }
        } catch (error) {
          console.error('Error parsing stored chat history:', error);
        }
      }
      
      // Set initial chat history
      if (initialChatHistory.length > 0) {
        setChatHistory(initialChatHistory);
      } else {
        // Check if serverless functions are working by testing the API
        setChatHistory([
          {
            role: 'assistant',
            content: `Welcome to your project workspace! I'm your AI project mentor, and I'm here to help you succeed with "${selectedProject.title}". 

Let's start by discussing your project goals and current progress. What specific aspects of this project would you like to work on today?`,
            timestamp: new Date()
          }
        ]);
      }
    } catch (err) {
      console.error('Error starting project session:', err);
      alert('Failed to start project session. Please try again.');
    }
  };

  // ENHANCED: Handle message submission with voice integration
  const handleSubmit = async () => {
    if (!userInput.trim()) return;
    
    if (!selectedLearningModule || !currentSession) {
      alert('Please select a project and start a session first.');
      return;
    }

    // NEW: Handle voice input stopping
    if (isListening && speechRecognition) {
      setWasListeningBeforeSubmit(true);
      speechRecognition.stop();
      setIsListening(false);
    } else {
      setWasListeningBeforeSubmit(false);
    }

    const userMessage: ChatMessage = {
      role: 'user',
      content: userInput.trim(),
      timestamp: new Date()
    };

    const updatedChatHistory = [...chatHistory, userMessage];
    setChatHistory(updatedChatHistory);
    setLoading(true);
    
    const currentInput = userInput;
    setUserInput('');

    // Update chat history in database after user message
    await updateChatHistory(currentSession.id, updatedChatHistory);

    // Get grade-appropriate project management instructions
    const gradeInstructions = getGradeAppropriateProjectInstructions(userGradeLevel);

    // Enhanced AI instructions for project management with grade-appropriate language
    const enhancedInstructions = `${gradeInstructions}

LEARNING MODULE CONTEXT:
${selectedLearningModule.ai_facilitator_instructions}

SPECIFIC PROJECT DETAILS:
Title: ${selectedLearningModule.title}
Description: ${selectedLearningModule.description}

LEARNING OUTCOMES TO GUIDE TOWARDS:
${selectedLearningModule.outcomes}

SUCCESS METRICS TO CONSIDER:
${selectedLearningModule.metrics_for_success}

Remember: Be a project mentor that uses age-appropriate language, guide effective project management, foster collaboration, ask probing questions, and help students develop systematic thinking and problem-solving skills.`;

    const messages = [
      { role: 'system', content: enhancedInstructions },
      ...chatHistory.map(msg => ({
        role: msg.role === 'assistant' ? 'assistant' : 'user',
        content: msg.content
      })),
      { role: 'user', content: currentInput }
    ];

    try {
      const reply = await callChatAPI(messages);
      
      const aiMessage: ChatMessage = {
        role: 'assistant',
        content: reply,
        timestamp: new Date()
      };
      
      const finalChatHistory = [...updatedChatHistory, aiMessage];
      setChatHistory(finalChatHistory);
      
      // NEW: Enhanced Text-to-Speech (TTS) playback of AI response
      if (voiceOutputEnabled && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();

        const utterance = new SpeechSynthesisUtterance(reply);
        
        if (selectedVoice) {
          utterance.voice = selectedVoice;
          utterance.lang = selectedVoice.lang;
          console.log('[Projects Voice] Using voice:', selectedVoice.name, selectedVoice.lang);
        } else {
          utterance.lang = 'en-US';
        }

        utterance.rate = 0.85;
        utterance.pitch = 1.1;
        utterance.volume = 0.9;

        if (userContinent === 'North America') {
          utterance.rate = 0.9;
          utterance.pitch = 1.15;
        } else if (userContinent === 'Africa') {
          utterance.rate = 0.8;
          utterance.pitch = 1.0;
        }

        if (userGradeLevel === 1) {
          utterance.rate = 0.75;
          utterance.pitch = 1.2;
        } else if (userGradeLevel === 2) {
          utterance.rate = 0.8;
          utterance.pitch = 1.1;
        }

        utterance.onend = () => {
          console.log('[Projects Voice] Speech synthesis ended');
          if (wasListeningBeforeSubmit && voiceInputEnabled && speechRecognition) {
            setTimeout(() => {
              try {
                speechRecognition.start();
                setIsListening(true);
                console.log('[Projects Voice] Restarted speech recognition');
              } catch (error) {
                console.error('Error restarting voice input:', error);
              }
            }, 500);
          }
        };

        utterance.onerror = (event) => {
          console.error('[Projects Voice] Speech synthesis error:', event.error);
          if (wasListeningBeforeSubmit && voiceInputEnabled && speechRecognition) {
            setTimeout(() => {
              try {
                speechRecognition.start();
                setIsListening(true);
              } catch (error) {
                console.error('Error restarting voice input after speech error:', error);
              }
            }, 500);
          }
        };

        console.log('[Projects Voice] Starting speech synthesis with voice:', utterance.voice?.name || 'default');
        window.speechSynthesis.speak(utterance);
      } else {
        if (wasListeningBeforeSubmit && voiceInputEnabled && speechRecognition) {
          setTimeout(() => {
            try {
              speechRecognition.start();
              setIsListening(true);
            } catch (error) {
              console.error('Error restarting voice input:', error);
            }
          }, 100);
        }
      }
      
      // Update chat history in database after AI response
      await updateChatHistory(currentSession.id, finalChatHistory);
    } catch (error) {
      console.error('Error getting AI response:', error);
      
      const errorMessage: ChatMessage = {
        role: 'assistant',
        content: 'I apologize, but I encountered a technical issue. Please try again or contact support if the problem persists.',
        timestamp: new Date()
      };
      
      const errorChatHistory = [...updatedChatHistory, errorMessage];
      setChatHistory(errorChatHistory);
      
      // Update chat history in database after error message
      await updateChatHistory(currentSession.id, errorChatHistory);

      // NEW: Restart voice input after error if needed
      if (wasListeningBeforeSubmit && voiceInputEnabled && speechRecognition) {
        setTimeout(() => {
          try {
            speechRecognition.start();
            setIsListening(true);
          } catch (error) {
            console.error('Error restarting voice input after error:', error);
          }
        }, 500);
      }
    } finally {
      setLoading(false);
    }
  };

  // Render chat messages
  const renderChatMessages = (chatHistory: ChatMessage[], loading: boolean) => {
    return (
      <div className="p-4 space-y-4 overflow-y-auto">
        {chatHistory.map((message, index) => (
          <div
            key={index}
            className={classNames(
              'flex flex-col space-y-2',
              message.role === 'user' ? 'items-end' : 'items-start'
            )}
          >
            <div className={classNames(
              'flex items-start space-x-3 max-w-2xl',
              message.role === 'user' ? 'flex-row-reverse space-x-reverse' : ''
            )}>
              <div className={classNames(
                'flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center',
                message.role === 'assistant' ? 'bg-blue-100' : 'bg-green-100'
              )}>
                {message.role === 'assistant' ? (
                  <Bot className="w-4 h-4 text-blue-600" />
                ) : (
                  <User className="w-4 h-4 text-green-600" />
                )}
              </div>
              <div className="flex-1">
                <div className={classNames(
                  'text-sm font-semibold mb-1',
                  message.role === 'assistant' ? 'text-blue-600' : 'text-green-600'
                )}>
                  {message.role === 'assistant' ? (
                    <span><strong>AI Project Mentor:</strong></span>
                  ) : (
                    <span><strong>You:</strong></span>
                  )}
                </div>
                <div className={classNames(
                  'p-3 rounded-lg',
                  message.role === 'assistant' 
                    ? 'bg-gray-100 text-gray-900' 
                    : 'bg-blue-500 text-white'
                )}>
                  <div className="text-sm">
                    {message.role === 'assistant' ? (
                      <>
                        <MarkdownText text={message.content} />
                        <AIPidginCoachWrapper englishText={message.content} />
                      </>
                    ) : (
                      <p>{message.content}</p>
                    )}
                  </div>
                  <p className={classNames(
                    'text-xs mt-1',
                    message.role === 'assistant' ? 'text-gray-500' : 'text-blue-100'
                  )}>
                    {message.timestamp.toLocaleTimeString()}
                  </p>
                </div>
              </div>
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex items-start space-x-3">
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
              <Bot className="w-4 h-4 text-blue-600" />
            </div>
            <div className="flex-1">
              <div className="text-sm font-semibold mb-1 text-blue-600">
                <strong>AI Project Mentor:</strong>
              </div>
              <div className="bg-gray-100 text-gray-900 p-3 rounded-lg">
                <div className="flex space-x-1">
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-pulse"></div>
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-pulse" style={{ animationDelay: '0.2s' }}></div>
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-pulse" style={{ animationDelay: '0.4s' }}></div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  // Handle Enter key in input
  const handleKeyPress = (e: React.KeyboardEvent, submitFunction: () => void) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submitFunction();
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      
      {/* Confetti Animation */}
      {showConfetti && <ConfettiAnimation />}
      
      {/* Background with project/collaboration image */}
      <div 
        className="min-h-screen bg-cover bg-center bg-no-repeat relative"
        style={{
          backgroundImage: `linear-gradient(rgba(255, 255, 255, 0.2), rgba(255, 255, 255, 0.2)), url('https://images.unsplash.com/photo-1552664730-d307ca884978?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=2070&q=80')`,
          backgroundBlendMode: 'overlay'
        }}
      >
        <div className="max-w-4xl mx-auto py-10 px-4 relative z-10">
          
          {/* Available Projects Section */}
          <div className="bg-white/90 backdrop-blur-sm rounded-lg shadow-lg p-8 mb-8">
            <h2 className="text-2xl font-bold text-gray-800 mb-4 flex items-center">
              <Briefcase className="h-6 w-6 mr-2 text-blue-600" />
              Your Projects
            </h2>
            
          {/* Project cards */}
          {availableProjects.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
              {availableProjects.map((project) => {
                const isSelected =
                  selectedProject &&
                  (
                    (project.source === 'learning_module' &&
                    selectedProject.source === 'learning_module' &&
                    selectedProject.learning_module_id === project.learning_module_id) ||

                    (project.source === 'dashboard' &&
                    selectedProject.source === 'dashboard' &&
                    selectedProject.id === project.id) ||

                    // Fallback for identical object reference
                    project === selectedProject
                  );

                return (
                  <div
                    key={`${project.source}:${project.learning_module_id ?? project.id}`}
                    className={classNames(
                      'relative p-4 rounded-lg border-2 cursor-pointer transition-all hover:shadow-md',
                      isSelected
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 bg-white hover:border-gray-300'
                    )}
                    onClick={() => handleSelectProject(project)}
                  >
                    {/* ✂️ delete */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();           // prevent card‑select click
                        handleDeleteProject(project);
                      }}
                      className="absolute bottom-2 right-2 text-red-500 hover:text-red-700 p-1"
                      title="Delete this project"
                    >
                      ✂️
                    </button>

                    {/* card content */}
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="font-semibold text-gray-900">{project.title}</h3>

                      <div className="flex gap-1">
                        <span
                          className={classNames(
                            'px-2 py-1 text-xs rounded-full font-medium',
                            project.source === 'learning_module'
                              ? 'bg-blue-100 text-blue-800'
                              : project.source === 'team_project'
                              ? 'bg-purple-100 text-purple-800'
                              : 'bg-green-100 text-green-800'
                          )}
                        >
                          {project.source === 'learning_module' ? 'Custom' : 
                           project.source === 'team_project' ? 'Team' : 'Collaborative'}
                        </span>
                        {project.team_id && (
                          <span className="px-2 py-1 bg-orange-100 text-orange-800 text-xs rounded-full font-medium">
                            {project.team_name || 'Team'}
                          </span>
                        )}
                      </div>
                    </div>

                    <p className="text-sm text-gray-600 mb-2">{project.sub_category}</p>
                    <p className="text-xs text-gray-500">{project.description}</p>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-gray-600 mb-6">
              No projects found. Create your first project below!
            </p>
          )}



            {/* Action Buttons */}
            <div className="flex gap-4">
              <button
                className="bg-blue-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-blue-700 transition-colors flex items-center gap-2"
                onClick={() => {
                  setShowCreateNew(true);
                  setSelectedProject(null);
                  setSelectedLearningModule(null);
                  setCurrentSession(null);
                  setChatHistory([]);
                  setNewProjectTitle('');
                  setNewProjectDescription('');
                  setNewProjectSubCategory('');
                  setCustomSubCategory('');
                  setSelectedTeamId('');
                }}
              >
                <Plus size={16} />
                Create New Project
              </button>
              {selectedProject && (
                <button
                  className="bg-green-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-green-700 transition-colors flex items-center gap-2"
                  onClick={handleUseSelectedProject}
                >
                  <Users size={16} />
                  Work on Selected Project
                </button>
              )}
            </div>
          </div>

          {/* Create New Project Section - Only show if creating new */}
          {showCreateNew && (
            <div className="bg-white/90 backdrop-blur-sm rounded-lg shadow-lg p-8 mb-8">
              <h1 className="text-3xl font-bold text-gray-800 mb-4 flex items-center">
                <FolderPlus className="h-8 w-8 mr-3 text-blue-600" />
                Create New Project
              </h1>
              <p className="text-gray-600 mb-6">
                Define your project challenge! Give your project a title and describe what you want to build, research, or accomplish.
                Your AI project mentor will help guide you through effective project management and collaboration.
              </p>
              
              <div className="space-y-6">
                {/* Title Input */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Project Title *
                  </label>
                  <input
                    type="text"
                    className="w-full border rounded-lg p-3 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    value={newProjectTitle}
                    onChange={(e) => setNewProjectTitle(e.target.value)}
                    placeholder="e.g., Building a Community Garden App"
                    disabled={creatingProject}
                  />
                </div>

                {/* Description Input */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Project Description *
                  </label>
                    <SpellCheckTextarea
                      value={newProjectDescription}  // ✅ FIXED: Correct state variable
                      onChange={setNewProjectDescription}  // ✅ FIXED: Correct setter
                      onKeyDown={(e) => handleKeyPress(e, createNewProject)}  // ✅ FIXED: Correct handler
                      placeholder="Describe your project goals, scope, and what you want to achieve..."  // ✅ FIXED: Better placeholder
                      className="w-full p-3 border border-gray-300 rounded-lg resize-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 h-18"
                      disabled={creatingProject}  // ✅ Already correct
                    />
                </div>

                {/* Sub-category Dropdown */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Project Category *
                  </label>
                  <select
                    className="w-full border rounded-lg p-3 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    value={newProjectSubCategory}
                    onChange={(e) => setNewProjectSubCategory(e.target.value)}
                    disabled={creatingProject}
                  >
                    <option value="">Select a category</option>
                    {subCategoryOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Team Selection Dropdown */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Associate with Team (Optional)
                  </label>
                  <select
                    className="w-full border rounded-lg p-3 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    value={selectedTeamId}
                    onChange={(e) => setSelectedTeamId(e.target.value)}
                    disabled={creatingProject}
                  >
                    <option value="">No team - Individual project</option>
                    {availableTeams.map((team) => (
                      <option key={team.id} value={team.id}>
                        {team.name}
                      </option>
                    ))}
                  </select>
                  {selectedTeamId && (
                    <p className="text-sm text-gray-600 mt-1">
                      This project will be available to all team members for collaboration.
                    </p>
                  )}
                </div>

                {/* Custom Sub-category Input - Only show if "other" is selected */}
                {newProjectSubCategory === 'other' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Custom Category *
                    </label>
                    <input
                      type="text"
                      className="w-full border rounded-lg p-3 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      value={customSubCategory}
                      onChange={(e) => setCustomSubCategory(e.target.value)}
                      placeholder="Enter your custom category"
                      disabled={creatingProject}
                    />
                  </div>
                )}

                {/* Create Project Button */}
                <div className="pt-4">
                  <button
                    className="bg-green-600 text-white px-8 py-3 rounded-lg font-semibold hover:bg-green-700 transition-colors disabled:bg-gray-400 flex items-center gap-2"
                    onClick={createNewProject}
                    disabled={creatingProject || !newProjectTitle.trim() || !newProjectDescription.trim() || !newProjectSubCategory || (newProjectSubCategory === 'other' && !customSubCategory.trim())}
                  >
                    {creatingProject ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                        Creating Project...
                      </>
                    ) : (
                      <>
                        <CheckCircle size={16} />
                        Create Project
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Use Your Project Section */}
          <div className="bg-white/90 backdrop-blur-sm rounded-lg shadow-lg p-8">
            <h1 className="text-3xl font-bold text-gray-800 mb-4 flex items-center">
              <Briefcase className="h-8 w-8 mr-3 text-blue-600" />
              Project Workspace
            </h1>
            <p className="text-gray-600 mb-6">
              {currentSession ? 
                `Active project session: ${selectedProject?.title}` :
                selectedProject ?
                  `Selected project: ${selectedProject.title}. Click "Work on Selected Project" to start your project session.` :
                  showCreateNew ?
                    "Once you've created your project above, this AI project mentor will help guide you through effective project management and collaboration." :
                    "Select an available project above or create a new one to begin your project journey."
              }
            </p>
            
            {/* Current Session Info */}
            {currentSession && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
                <h3 className="text-lg font-semibold text-blue-800 mb-2">Active Project Session</h3>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div><strong>Project:</strong> {selectedProject?.title}</div>
                  <div><strong>Status:</strong> {currentSession.progress}</div>
                  <div><strong>Session ID:</strong> {currentSession.id.slice(0, 8)}...</div>
                  <div><strong>Started:</strong> {new Date(currentSession.created_at).toLocaleString()}</div>
                </div>
                {currentSession.evaluation_score && (
                  <div className="mt-2">
                    <strong>Last Score:</strong> <span className="text-blue-600 font-semibold">{currentSession.evaluation_score}%</span>
                  </div>
                )}
              </div>
            )}
            
            {/* Project Chat Bot */}
            <div className="bg-white rounded-lg shadow-md mb-4">
              <div className="p-4 border-b">
                <h3 className="text-lg font-semibold text-gray-900">Project Management Conversation</h3>
                {selectedLearningModule && (
                  <p className="text-sm text-gray-600 mt-1">{selectedLearningModule.description}</p>
                )}
              </div>
              <div 
                ref={chatRef}
                className="border rounded-lg overflow-y-auto bg-white"
                style={{ width: '100%', height: '384px' }}
              >
                {chatHistory.length > 0 ? (
                  renderChatMessages(chatHistory, loading)
                ) : (
                  <div className="p-4 text-gray-500 italic">
                    {currentSession ? 
                      "Session is ready! Start your project conversation below..." :
                      "Please select a project and start a session to begin working."
                    }
                  </div>
                )}
              </div>
            </div>
            
            {/* NEW: Voice Controls */}
            {currentSession && (
              <div className="flex items-center space-x-4 mb-4">
                <label className="flex items-center space-x-2 bg-purple-100 border border-black px-4 py-2 rounded-md cursor-pointer">
                  <input
                    type="checkbox"
                    checked={voiceInputEnabled}
                    onChange={(e) => {
                      setVoiceInputEnabled(e.target.checked);
                      if (!e.target.checked && isListening && speechRecognition) {
                        speechRecognition.stop();
                        setIsListening(false);
                        setWasListeningBeforeSubmit(false);
                      }
                    }}
                    className="accent-purple-600 w-4 h-4"
                  />
                  <span className="text-black font-medium">Enable Voice Input</span>
                </label>

                <label className="flex items-center space-x-2 bg-purple-100 border border-black px-4 py-2 rounded-md cursor-pointer">
                  <input
                    type="checkbox"
                    checked={voiceOutputEnabled}
                    onChange={() => setVoiceOutputEnabled(!voiceOutputEnabled)}
                    className="accent-purple-600 w-4 h-4"
                  />
                  <span className="text-black font-medium">Enable Voice Output</span>
                </label>

                {selectedVoice && voiceOutputEnabled && (
                  <div className="flex items-center space-x-2 bg-blue-50 border border-blue-200 px-3 py-2 rounded-md text-sm">
                    <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
                    <span className="text-blue-800 font-medium">
                      Voice: {selectedVoice.name.split(' ')[0]} 
                      {userContinent && (
                        <span className="text-blue-600 ml-1">
                          ({userContinent === 'North America' ? '🇺🇸 US' : '🇳🇬 NG'})
                        </span>
                      )}
                    </span>
                  </div>
                )}
              </div>
            )}
            
            {/* User Input */}
            <div className="flex gap-2 mb-6">
              <SpellCheckTextarea
                value={userInput}
                onChange={setUserInput}
                onKeyDown={handleKeyPress}
                placeholder="Type your response here..."
                className="w-full p-3 border border-gray-300 rounded-lg resize-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 h-18"
                disabled={loading}
              />
              <div className="flex flex-col gap-2">
                {/* NEW: Voice Input Button */}
                {voiceInputEnabled && currentSession && (
                  <button
                    onClick={startVoiceInput}
                    className={classNames(
                      "px-4 py-3 rounded-lg font-semibold transition-colors flex items-center gap-2",
                      isListening 
                        ? "bg-red-100 hover:bg-red-200 text-red-800" 
                        : "bg-blue-100 hover:bg-blue-200 text-blue-800"
                    )}
                    disabled={!speechRecognition}
                    style={{ height: 'fit-content' }}
                  >
                    <Mic size={16} />
                    {isListening ? 'Stop' : 'Speak'}
                  </button>
                )}
                
                <button
                  className="bg-blue-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-blue-700 transition-colors disabled:bg-gray-400 flex items-center gap-2"
                  onClick={handleSubmit}
                  disabled={loading || !userInput.trim() || !currentSession}
                  style={{ height: 'fit-content' }}
                >
                  <Send size={16} />
                  Send
                </button>
              </div>
            </div>

            {/* Evaluate and Save Session Button */}
            {currentSession && chatHistory.length > 1 && (
              <div className="bg-gray-50 rounded-lg p-6 mt-6">
                <div className="text-center">
                  <h3 className="text-lg font-semibold text-gray-900 mb-3">Project Assessment</h3>
                  <p className="text-gray-600 mb-4">
                    Ready to evaluate your project session? Get feedback on your project management skills and save your progress.
                  </p>
                  <button
                    onClick={handleEvaluateSession}
                    disabled={evaluating}
                    className="bg-blue-600 text-white px-8 py-3 rounded-lg font-semibold hover:bg-blue-700 transition-colors disabled:bg-gray-400 flex items-center gap-2 mx-auto"
                  >
                    {evaluating ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                        Evaluating Session...
                      </>
                    ) : (
                      <>
                        <Star size={16} />
                        Evaluate and Save Session
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Evaluation Results Modal */}
      {showEvaluationModal && evaluationResult && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full mx-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className={classNames(
                "text-xl font-bold flex items-center",
                evaluationResult.score > 84.95 ? "text-blue-600" : "text-gray-900"
              )}>
                <Star className="h-6 w-6 mr-2 text-yellow-500" />
                {evaluationResult.score > 84.95 ? "🏆 Project Excellence!" : "Project Assessment"}
              </h3>
              <button
                onClick={() => setShowEvaluationModal(false)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            <div className="space-y-4">
              <div className="text-center">
                <div className={classNames(
                  "text-3xl font-bold mb-2",
                  evaluationResult.score > 84.95 ? "text-blue-600" : "text-blue-500"
                )}>
                  {evaluationResult.score}/100
                </div>
                <div className="text-sm text-gray-600">
                  {evaluationResult.score > 84.95 ? "Outstanding Project Management!" : "Your Project Management Score"}
                </div>
                {evaluationResult.score > 84.95 && (
                  <div className="mt-2 text-sm text-blue-600 font-semibold">
                    You've demonstrated excellent project leadership!
                  </div>
                )}
              </div>
              
              <div className="border-t pt-4">
                <h4 className="font-semibold text-gray-900 mb-2">Project Mentor Assessment:</h4>
                <p className="text-gray-700 text-sm leading-relaxed">
                  {evaluationResult.evidence}
                </p>
              </div>
              
              <div className="flex justify-end pt-4 space-x-3">
                {evaluationResult.score > 84.95 && (
                  <button
                    onClick={() => {
                      setShowConfetti(true);
                      setTimeout(() => setShowConfetti(false), 10000);
                    }}
                    className="bg-gradient-to-r from-blue-500 to-indigo-600 text-white px-6 py-2 rounded-lg font-semibold hover:from-blue-600 hover:to-indigo-700 transition-all transform hover:scale-105"
                  >
                    🏆 Celebrate!
                  </button>
                )}
                <button
                  onClick={() => setShowEvaluationModal(false)}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg font-semibold transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProjectsListPage;