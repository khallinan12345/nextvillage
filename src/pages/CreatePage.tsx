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
import Navbar from '../components/layout/Navbar';
import { AIPidginCoachWrapper } from '../components/AIPidginCoachWrapper';
import { Bot, User, Send, Lightbulb, CheckCircle, AlertCircle, Code, List, Hash, Plus, Users, Star, Palette, Mic } from 'lucide-react';
import classNames from 'classnames';

// Import the serverless API client functions
import { chatText, chatJSON } from '../lib/chatClient';

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
          icon = <Hash className="w-6 h-6 text-purple-600" />;
          headerClass = 'text-2xl font-bold text-gray-900 flex items-center gap-2 mb-4 mt-6 border-b border-gray-200 pb-2';
        } else if (headerLevel === 2) {
          icon = <Lightbulb className="w-5 h-5 text-purple-500" />;
          headerClass = 'text-xl font-semibold text-gray-800 flex items-center gap-2 mb-3 mt-5';
        } else {
          icon = <Palette className="w-4 h-4 text-purple-400" />;
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
              <Hash className="w-4 h-4 text-purple-600" />
              <span className="font-medium text-sm">Steps</span>
            </div>
            <ol className="ml-6 space-y-2">
              {listItems.map((item, idx) => (
                <li key={idx} className="flex items-start gap-3">
                  <span className="flex-shrink-0 w-6 h-6 bg-purple-100 text-purple-800 rounded-full flex items-center justify-center text-sm font-semibold">
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
            icon = <AlertCircle className="w-5 h-5 text-purple-600" />;
            bgColor = 'bg-purple-50';
            borderColor = 'border-purple-200';
            textColor = 'text-purple-800';
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
  const colors = ['#ff1493', '#9932cc', '#ffd700', '#ff69b4', '#8a2be2', '#ffd700']; // Pink, purple, yellow
  
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

interface AvailableCreateActivity {
  learning_module_id: string;
  title: string;
  description: string;
  sub_category: string;
  outcomes: string;
  metrics_for_success: string;
  ai_facilitator_instructions: string;
  ai_assessment_instructions: string;
}

interface CreateSession {
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

const CreatePage = () => {
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

  // Voice functionality state
  const [voiceInputEnabled, setVoiceInputEnabled] = useState(false);
  const [voiceOutputEnabled, setVoiceOutputEnabled] = useState(true);
  const [isListening, setIsListening] = useState(false);
  const [speechRecognition, setSpeechRecognition] = useState<any>(null);
  const [wasListeningBeforeSubmit, setWasListeningBeforeSubmit] = useState(false);
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoice, setSelectedVoice] = useState<SpeechSynthesisVoice | null>(null);
  const [userContinent, setUserContinent] = useState<string | null>(null);
  const [userGradeLevel, setUserGradeLevel] = useState<number | null>(null);

  // Available create activities and selection state
  const [availableActivities, setAvailableActivities] = useState<AvailableCreateActivity[]>([]);
  const [selectedActivity, setSelectedActivity] = useState<AvailableCreateActivity | null>(null);
  const [selectedLearningModule, setSelectedLearningModule] = useState<LearningModule | null>(null);
  const [currentSession, setCurrentSession] = useState<CreateSession | null>(null);
  const [showCreateNew, setShowCreateNew] = useState(false);
  
  // Create New Activity state
  const [newActivityTitle, setNewActivityTitle] = useState('');
  const [newActivityDescription, setNewActivityDescription] = useState('');
  const [newActivitySubCategory, setNewActivitySubCategory] = useState('');
  const [customSubCategory, setCustomSubCategory] = useState('');
  const [creatingActivity, setCreatingActivity] = useState(false);
  
  // Use Your Create Activity section state
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [userInput, setUserInput] = useState<string>('');
  const [loading, setLoading] = useState(false);
  
  // Enhanced features state
  const [evaluating, setEvaluating] = useState(false);
  const [showEvaluationModal, setShowEvaluationModal] = useState(false);
  const [evaluationResult, setEvaluationResult] = useState<{score: number, evidence: string} | null>(null);
  const [showConfetti, setShowConfetti] = useState(false);
  
  const chatRef = useRef<HTMLDivElement>(null);

  // Subcategory options
  const subCategoryOptions = [
    'art, poetry, design',
    'business',
    'community',
    'entrepreneurial',
    'game',
    'health',
    'human relations',
    'productivity',
    'school',
    'sports',
    'tech',
    'other'
  ];

  // Initialize speech recognition and voices
  useEffect(() => {
    // Initialize speech recognition
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      const recognition = new SpeechRecognition();
      
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';
      
      recognition.onstart = () => setIsListening(true);
      recognition.onend = () => setIsListening(false);
      
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
      
      setSpeechRecognition(recognition);
    }

    // Initialize speech synthesis voices
    const loadVoices = () => {
      const voices = window.speechSynthesis.getVoices();
      console.log('[Voice] Available voices:', voices.map(v => `${v.name} (${v.lang})`));
      setAvailableVoices(voices);
    };

    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;

    return () => {
      window.speechSynthesis.onvoiceschanged = null;
    };
  }, []);

  // Select appropriate voice based on user's continent and grade level
  useEffect(() => {
    if (availableVoices.length > 0 && userContinent) {
      const voice = selectCulturallyAppropriateVoice(userContinent, userGradeLevel);
      setSelectedVoice(voice);
      console.log('[Voice] Selected voice:', voice?.name, voice?.lang);
    }
  }, [availableVoices, userContinent, userGradeLevel]);

  // Function to select culturally appropriate voice
  const selectCulturallyAppropriateVoice = (continent: string, gradeLevel: number | null): SpeechSynthesisVoice | null => {
    if (availableVoices.length === 0) return null;

    // FORCE GOOGLE US ENGLISH FEMALE 4 VOICE
    const googleFemale4 = availableVoices.find(v => 
      v.name === 'Google US English Female 4' ||
      v.name.toLowerCase().includes('google us english female 4')
    );
    if (googleFemale4) {
      console.log('[Voice] Found and using Google US English Female 4:', googleFemale4.name);
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
/*         'Microsoft Zira Desktop',
        'Samantha',
        'Victoria' */
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
        // 'Samantha',
        // 'Victoria'
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

  // Voice input function
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

  // Function to speak AI response
  const speakAIResponse = (text: string, wasListeningBefore: boolean) => {
    if (voiceOutputEnabled && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();

      const utterance = new SpeechSynthesisUtterance(text);
      
      if (selectedVoice) {
        utterance.voice = selectedVoice;
        utterance.lang = selectedVoice.lang;
        console.log('[Voice] Using voice:', selectedVoice.name, selectedVoice.lang);
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
        console.log('[Voice] Speech synthesis ended');
        if (wasListeningBefore && voiceInputEnabled && speechRecognition) {
          setTimeout(() => {
            try {
              speechRecognition.start();
              setIsListening(true);
              console.log('[Voice] Restarted speech recognition');
            } catch (error) {
              console.error('Error restarting voice input:', error);
            }
          }, 500);
        }
      };

      utterance.onerror = (event) => {
        console.error('[Voice] Speech synthesis error:', event.error);
        if (wasListeningBefore && voiceInputEnabled && speechRecognition) {
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

      console.log('[Voice] Starting speech synthesis with voice:', utterance.voice?.name || 'default');
      window.speechSynthesis.speak(utterance);
    } else {
      if (wasListeningBefore && voiceInputEnabled && speechRecognition) {
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
  };

  // Function to fetch user's grade level and continent
  const fetchUserProfile = async (userId: string) => {
    try {
      console.log('[Profile] Fetching profile for user:', userId);
      
      const { data, error } = await supabase
        .from('profiles')
        .select('grade_level, continent')
        .eq('id', userId)
        .single();

      if (error) {
        console.error('[Profile] Error fetching profile:', error);
        return { gradeLevel: null, continent: null };
      }

      console.log('[Profile] Profile fetched:', data);
      return {
        gradeLevel: data?.grade_level || null,
        continent: data?.continent || null
      };
    } catch (err) {
      console.error('[Profile] Error fetching user profile:', err);
      return { gradeLevel: null, continent: null };
    }
  };

  // Function to get grade-appropriate instructions
  const getGradeAppropriateInstructions = (gradeLevel: number | null): string => {
    const commonGuidance = `CRITICAL: Your role is to be a CREATIVITY COACH, not just an instructor. Always encourage creative thinking, ask questions that spark imagination, and help students think outside the box. When students share ideas, respond with encouraging questions that help them expand and develop their creative concepts. Provide inspiration and creative challenges, but let them do the creative exploration and discovery.

RESPONSE LENGTH: Keep responses to 75 words maximum unless it's absolutely essential to provide more information for understanding. Be concise while maintaining creativity and encouragement.`;
    
    if (gradeLevel === 1) {
      // Grades 3-5 (Elementary)
      return `${commonGuidance}

Important: This student is in elementary school (grades 3-5). Use simple, clear language that a 8-11 year old can understand. Use shorter sentences, avoid complex vocabulary, and be extra encouraging and patient. 

CREATIVITY APPROACH: Ask simple creative questions like "What if we could make this even more magical?" or "Can you imagine something totally different?" Break creative challenges into smaller, fun steps. Use examples from their world like family, pets, games, or school activities. Celebrate their imaginative ideas, not just practical ones. Make creativity feel like a fun adventure to explore together!`;
    } else if (gradeLevel === 2) {
      // Grades 6-8 (Middle School)
      return `${commonGuidance}

Important: This student is in middle school (grades 6-8). Use age-appropriate language for a 11-14 year old. You can use slightly more complex vocabulary but still keep explanations clear and relatable.

CREATIVITY APPROACH: Ask thought-provoking creative questions that build on their developing artistic thinking skills. Use questions like "How might we combine these ideas in a surprising way?" or "What would happen if we flipped this completely around?" Help them make unexpected connections between concepts. Use examples from their interests, social media, technology, and pop culture they might relate to. Encourage them to explain their creative reasoning and challenge them to think more boldly and originally.`;
    } else if (gradeLevel === 3) {
      // Grades 9-12 (High School)
      return `${commonGuidance}

Important: This student is in high school (grades 9-12). You can use more sophisticated language and concepts appropriate for a 14-18 year old. They can handle complex creative challenges and abstract thinking.

CREATIVITY APPROACH: Use advanced creative questioning techniques that promote innovative and breakthrough thinking. Ask questions like "How would you completely reimagine this from scratch?" or "What are the most unconventional approaches we haven't considered?" Encourage them to evaluate different creative perspectives, make bold predictions, and synthesize ideas in original ways. Connect creativity to their future goals, college prep, career interests, and real-world innovation challenges. Challenge them to defend their creative choices and consider revolutionary alternatives.`;
    } else {
      // Default/Unknown grade level
      return `${commonGuidance}

Important: Adapt your communication style to be clear and age-appropriate. Use encouraging language and check for creative understanding frequently. Focus on guiding the student to discover creative solutions through thoughtful questioning rather than providing direct creative answers.`;
    }
  };

  // Load available create activities from learning_modules
  const loadAvailableActivities = useCallback(async () => {
    try {
      console.log('Loading available create activities for user:', user.id);
  
      const { data, error } = await supabase
        .from('learning_modules')
        .select(
          'learning_module_id, title, description, sub_category, outcomes, metrics_for_success, ai_facilitator_instructions, ai_assessment_instructions'
        )
        .eq('user_id', user.id)
        .eq('category', 'Create')
        
        .order('created_at', { ascending: false });
  
      if (error) throw error;
  
      setAvailableActivities(data ?? []);
    } catch (err) {
      console.error('Error loading available create activities:', err);
    }
  }, [user.id]);

  // Load available activities and user profile on component mount
  useEffect(() => {
    if (user?.id) {
      loadAvailableActivities();
      
      // Fetch user's profile if not already loaded
      if (userGradeLevel === null || userContinent === null) {
        fetchUserProfile(user.id).then(profile => {
          setUserGradeLevel(profile.gradeLevel);
          setUserContinent(profile.continent);
        });
      }
    }
  }, [loadAvailableActivities, user?.id, userGradeLevel, userContinent]);

  // Auto-scroll chat box to bottom when content changes
  useEffect(() => {
    if (chatRef.current) {
      chatRef.current.scrollTop = chatRef.current.scrollHeight;
    }
  }, [chatHistory]);

  const loadLearningModule = async (learningModuleId: string) => {
    try {
      const { data, error } = await supabase
        .from('learning_modules')
        .select('*')
        .eq('learning_module_id', learningModuleId)
        .single();

      if (error) throw error;
      setSelectedLearningModule(data);
    } catch (error) {
      console.error('Error loading learning module:', error);
    }
  };

  // Updated callOpenAI function to use serverless API
  const callOpenAI = async (messages: any[]) => {
    try {
      console.log('Calling serverless OpenAI API...');
      
      // Convert messages to the format expected by chatClient
      const formattedMessages = messages.slice(1); // Remove system message
      const systemMessage = messages[0]?.role === 'system' ? messages[0].content : undefined;
      
      const response = await chatText({
        messages: formattedMessages,
        system: systemMessage,
        max_tokens: 500,
        temperature: 0.7
      });

      return response || 'AI failed to respond.';
    } catch (error) {
      console.error('AI Error:', error);
      return 'An error occurred. Please try again.';
    }
  };

  // Updated Assessment API call with creativity rubric using serverless API
  const callAssessmentAI = async (chatHistory: ChatMessage[], assessmentInstructions: string, outcomes: string, successMetrics: string) => {
    try {
      console.log('[Assessment] Making assessment API call via serverless function');
      
      const chatHistoryText = chatHistory.slice(1).map(msg => 
        `${msg.role === 'assistant' ? 'AI Coach' : 'Student'}: ${msg.content}`
      ).join('\n\n');

      const assessmentPrompt = `Assessment Instructions:
${assessmentInstructions}

Learning Outcomes:
${outcomes}

Success Metrics for Evaluation:
${successMetrics}

Please evaluate the student's creativity performance based on the above assessment instructions, learning outcomes, and success metrics. Use the conversation history below to make your evaluation.

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

      const systemMessage = 'You are an AI assessment evaluator for creativity sessions. Respond only with valid JSON containing evaluation_score and evaluation_evidence.';

      console.log('[Assessment] Sending assessment request to serverless API');

      const response = await chatJSON({
        messages: [{ role: 'user', content: assessmentPrompt }],
        system: systemMessage,
        max_tokens: 300,
        temperature: 0.3
      });

      console.log('[Assessment] Raw response:', response);
      
      // Handle the response - could be JSON object or string
      if (typeof response === 'object' && response.evaluation_score !== undefined) {
        const assessment = {
          evaluation_score: Math.max(0, Math.min(100, response.evaluation_score)),
          evaluation_evidence: response.evaluation_evidence || 'Assessment completed based on creativity conversation analysis and rubric metrics.'
        };
        return assessment;
      } else {
        // Try to extract score from response text if it's not properly formatted
        const responseStr = typeof response === 'string' ? response : JSON.stringify(response);
        const scoreMatch = responseStr.match(/(\d+)/);
        const score = scoreMatch ? parseInt(scoreMatch[1]) : 75;
        
        return {
          evaluation_score: Math.max(0, Math.min(100, score)),
          evaluation_evidence: 'Assessment completed based on creativity conversation analysis and rubric metrics.'
        };
      }
    } catch (error) {
      console.error('[Assessment] Error:', error);
      
      return {
        evaluation_score: 0,
        evaluation_evidence: 'Assessment could not be completed due to technical issues.'
      };
    }
  };

  // Update session evaluation in database
  const updateSessionEvaluation = async (sessionId: string, evaluationScore: number, evaluationEvidence: string, chatHistory: ChatMessage[]) => {
    try {
      const shouldComplete = evaluationScore > 84.95;
      const newProgress = shouldComplete ? 'completed' : 'started';
      
      const { error } = await supabase
        .from('dashboard')
        .update({ 
          evaluation_score: evaluationScore,
          evaluation_evidence: evaluationEvidence,
          chat_history: JSON.stringify(chatHistory),
          progress: newProgress,
          updated_at: new Date().toISOString()
        })
        .eq('id', sessionId);

      if (error) throw error;
      
      // Update current session state
      if (currentSession && currentSession.id === sessionId) {
        setCurrentSession(prev => prev ? {
          ...prev,
          evaluation_score: evaluationScore,
          evaluation_evidence: evaluationEvidence,
          progress: newProgress,
          chat_history: JSON.stringify(chatHistory)
        } : null);
      }
      
      // Show confetti if completed
      if (shouldComplete) {
        setShowConfetti(true);
        setTimeout(() => setShowConfetti(false), 10000); // 10 seconds
      }
      
    } catch (err) {
      console.error('Error updating session evaluation:', err);
      throw err;
    }
  };

  // Handle evaluation
  const handleEvaluateSession = async () => {
    if (!currentSession || chatHistory.length <= 1) {
      alert('No conversation history available for evaluation.');
      return;
    }

    if (!selectedLearningModule) {
      alert('Learning module information not available for evaluation.');
      return;
    }

    setEvaluating(true);
    
    try {
      const assessment = await callAssessmentAI(
        chatHistory, 
        selectedLearningModule.ai_assessment_instructions || 'Evaluate the student\'s creativity progress and engagement.',
        selectedLearningModule.outcomes || 'General creativity progress',
        selectedLearningModule.metrics_for_success || 'Student engagement and creative thinking'
      );
      
      await updateSessionEvaluation(
        currentSession.id, 
        assessment.evaluation_score, 
        assessment.evaluation_evidence,
        chatHistory
      );
      
      setEvaluationResult({
        score: assessment.evaluation_score,
        evidence: assessment.evaluation_evidence
      });
      setShowEvaluationModal(true);
      
    } catch (error) {
      console.error('Error during evaluation:', error);
      alert('Failed to complete evaluation. Please try again.');
    } finally {
      setEvaluating(false);
    }
  };

  // Create new create activity session
  const createActivitySession = async (activity: AvailableCreateActivity) => {
    try {
      console.log('Creating new create activity session for:', activity.title);
      console.log('User ID:', user.id);
      console.log('Activity data:', activity);
      
      // Check if session already exists
      const { data: existingSession, error: checkError } = await supabase
        .from('dashboard')
        .select('*')
        .eq('user_id', user.id)
        .eq('learning_module_id', activity.learning_module_id)
        .single();

      if (checkError && checkError.code !== 'PGRST116') { // PGRST116 = not found
        throw checkError;
      }

      if (existingSession) {
        // Load existing session
        console.log('Loading existing session:', existingSession);
        setCurrentSession(existingSession);
        
        // Load chat history if exists
        if (existingSession.chat_history) {
          try {
            const parsedHistory = JSON.parse(existingSession.chat_history);
            // Convert timestamp strings back to Date objects
            const historyWithDates = parsedHistory.map((msg: any) => ({
              ...msg,
              timestamp: new Date(msg.timestamp)
            }));
            setChatHistory(historyWithDates);
          } catch (parseError) {
            console.error('Error parsing chat history:', parseError);
            setChatHistory([]);
          }
        } else {
          // Start with welcome message
          const welcomeMessage: ChatMessage = {
            role: 'assistant',
            content: `Are you ready to begin ${activity.title} create activity? I am going to guide you through the process of ${activity.description}.`,
            timestamp: new Date()
          };
          setChatHistory([welcomeMessage]);
        }
        
        return existingSession;
      } else {
        // Create new session
        const sessionId = generateUUID().slice(0, 8);
        const timestamp = new Date().toLocaleString();
        const sessionTitle = `${activity.title} - Session ${timestamp}`;
        
        const insertData = {
          user_id: user.id,
          category_activity: 'Create',
          title: sessionTitle,
          learning_module_id: activity.learning_module_id,
          sub_category: `${activity.sub_category} - Session ${sessionId}`,
          activity: `${sessionTitle} - ${sessionId}`,
          progress: 'started'
        };
        
        console.log('Inserting dashboard data:', insertData);
        
        const { data, error } = await supabase
          .from('dashboard')
          .insert([insertData])
          .select()
          .single();

        if (error) {
          console.error('Supabase error details:', error);
          
          if (error.code === '23505') {
            console.log('Retrying with more unique identifiers...');
            const retrySessionId = generateUUID();
            const retryData = {
              ...insertData,
              title: `${sessionTitle} - ${retrySessionId}`,
              activity: `${sessionTitle} - ${retrySessionId}`,
              sub_category: `${activity.sub_category} - ${retrySessionId}`
            };
            
            const { data: retryResult, error: retryError } = await supabase
              .from('dashboard')
              .insert([retryData])
              .select()
              .single();
              
            if (retryError) throw retryError;
            
            console.log('Session created successfully on retry:', retryResult);
            setCurrentSession(retryResult);
            
            // Initialize with welcome message
            const welcomeMessage: ChatMessage = {
              role: 'assistant',
              content: `Are you ready to begin ${activity.title} create activity? I am going to guide you through the process of ${activity.description}.`,
              timestamp: new Date()
            };
            setChatHistory([welcomeMessage]);
            
            return retryResult;
          }
          
          throw error;
        }
        
        console.log('Session created successfully:', data);
        setCurrentSession(data);
        
        // Initialize with welcome message
        const welcomeMessage: ChatMessage = {
          role: 'assistant',
          content: `Are you ready to begin ${activity.title} create activity? I am going to guide you through the process of ${activity.description}.`,
          timestamp: new Date()
        };
        setChatHistory([welcomeMessage]);
        
        return data;
      }
    } catch (err) {
      console.error('Error creating/loading create activity session:', err);
      throw err;
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

  // Create new learning module for create activity
  const createNewActivity = async () => {
    if (!newActivityTitle.trim() || !newActivityDescription.trim() || !newActivitySubCategory) {
      alert('Please fill in all required fields.');
      return;
    }

    const finalSubCategory = newActivitySubCategory === 'other' ? customSubCategory.trim() : newActivitySubCategory;
    
    if (!finalSubCategory) {
      alert('Please specify the sub-category.');
      return;
    }

    setCreatingActivity(true);
    
    try {
      const activityId = generateUUID();
      
      // Default AI facilitator instructions for creativity coaching
      const defaultFacilitatorInstructions = `Overview:
The AI assistant is designed to be a personal creativity coach, fostering breakthrough innovation. It uses as inputs the 'title' and 'description' for the creativity activity defined by the student.
The AI assistant should engage students in an informal, fun, and approachable manner. It should use humor judiciously to enhance the learning experience and encourage persistent use. Its primary focus is on making create experiences enjoyable. By creating a light-hearted atmosphere, it will foster a positive environment where users feel comfortable exploring and developing their problem identification skills. This approach is designed to maintain user interest and motivation, making the process of learning and improving problem solving skills more appealing and less daunting. While guiding users, it should ask clarifying questions, provide creative insights, and offer encouragement.
The AI assistant should seek to understand what is limiting the learner's progress.  It should leverage the key strategies for unlocking potential based upon Adam Grant's research on unlocking potential in his book "Hidden Potential.  As it learns the learner's tendencies, it should prioritize a key strategy or strategies that help the learner bypass any barriers which are limiting them. 
Step_by_Step Instructions:
1. When a user selects 'Ok. Let's create away!' the AI Assistant should tell the user what it  will be doing to help them create; working with them to develop breakthrough creativity ideas to a challenge they pose to help them engage in creativity challenges.
2. Next,  the AI Asst should add a constraint or multiple constraints that it  thinks may yield breakthrough creativity.  The modified challenge should then communicated to the user.
3. Then it should guide the student forward to develop a more creative solution.  Suggestions over direction is essential.`;

      // Default AI assessment instructions with creativity rubric
      const defaultAssessmentInstructions = `The AI Assessment instructions are as follows:
Review the chat_history to evaluate the quality of the student's creativity relative to the following rubric.  
The output should be an evaluation_score that represents an average in each category normalized to 0-100.  The output must also be an evaluation_evidence. Evidence should be provided for each of the categories. Include in the evidence section the scores for each of the creativity categories. 
{
    "Divergent Thinking": {
        "description": "The capacity to produce a variety of ideas in response to a stimulus.",
        "scores": {
            "0": "Very low proficiency in this category.",
            "1": "Low proficiency; limited demonstration of this skill.",
            "2": "Moderate proficiency; inconsistent demonstration of this skill.",
            "3": "Good proficiency; generally demonstrates this skill effectively.",
            "4": "Very good proficiency; consistently demonstrates this skill well.",
            "5": "Excellent proficiency; demonstrates mastery in this skill."
        }
    },
    "Flexibility": {
        "description": "The adeptness at generating responses in different categories.",
        "scores": {
            "0": "Very low proficiency in this category.",
            "1": "Low proficiency; limited demonstration of this skill.",
            "2": "Moderate proficiency; inconsistent demonstration of this skill.",
            "3": "Good proficiency; generally demonstrates this skill effectively.",
            "4": "Very good proficiency; consistently demonstrates this skill well.",
            "5": "Excellent proficiency; demonstrates mastery in this skill."
        }
    },
    "Originality": {
        "description": "The production of unusual responses.",
        "scores": {
            "0": "Very low proficiency in this category.",
            "1": "Low proficiency; limited demonstration of this skill.",
            "2": "Moderate proficiency; inconsistent demonstration of this skill.",
            "3": "Good proficiency; generally demonstrates this skill effectively.",
            "4": "Very good proficiency; consistently demonstrates this skill well.",
            "5": "Excellent proficiency; demonstrates mastery in this skill."
        }
    },
    "Elaboration": {
        "description": "The capacity to create responses that are more embellished than a basic figure.",
        "scores": {
            "0": "Very low proficiency in this category.",
            "1": "Low proficiency; limited demonstration of this skill.",
            "2": "Moderate proficiency; inconsistent demonstration of this skill.",
            "3": "Good proficiency; generally demonstrates this skill effectively.",
            "4": "Very good proficiency; consistently demonstrates this skill well.",
            "5": "Excellent proficiency; demonstrates mastery in this skill."
        }
    },
    "Fluency": {
        "description": "Defined as the capacity to produce a large number of visual images or ideas.",
        "scores": {
            "0": "Very low proficiency in this category.",
            "1": "Low proficiency; limited demonstration of this skill.",
            "2": "Moderate proficiency; inconsistent demonstration of this skill.",
            "3": "Good proficiency; generally demonstrates this skill effectively.",
            "4": "Very good proficiency; consistently demonstrates this skill well.",
            "5": "Excellent proficiency; demonstrates mastery in this skill."
        }
    }
}`;
      
      // Create learning module
      const { data: learningModuleData, error: learningModuleError } = await supabase
        .from('learning_modules')
        .insert([
          {
            learning_module_id: activityId,
            title: newActivityTitle.trim(),
            description: newActivityDescription.trim(),
            category: 'Create',
            sub_category: finalSubCategory,
            outcomes: `Students will develop breakthrough creativity and innovative thinking skills through ${newActivityTitle}.`,
            metrics_for_success: 'Student demonstration of divergent thinking, flexibility, originality, elaboration, and fluency in creative responses.',
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

      await loadAvailableActivities();
      setShowCreateNew(false);
      setNewActivityTitle('');
      setNewActivityDescription('');
      setNewActivitySubCategory('');
      setCustomSubCategory('');
      
      alert('Create activity created successfully!');
    } catch (err: any) {
      console.error('Error creating new activity:', err);
      alert(`Could not create activity:\n${err.message ?? err}`);
    } finally {
      setCreatingActivity(false);
    }
  };

  const handleSelectActivity = async (activity: AvailableCreateActivity) => {
    setSelectedActivity(activity);
    await loadLearningModule(activity.learning_module_id);
    setShowCreateNew(false);
    
    // Clear any existing session and chat history
    setCurrentSession(null);
    setChatHistory([]);
  };

  const handleDeleteSession = async (learningModuleId: string) => {
    if (!confirm("Are you sure you want to delete this session and its learning module? This cannot be undone.")) return;
  
    try {
      // Delete from dashboard first
      const { error: dashError } = await supabase
        .from('dashboard')
        .delete()
        .eq('learning_module_id', learningModuleId)
        .eq('user_id', user.id);
  
      if (dashError) throw dashError;
  
      // Then delete from learning_modules
      const { error: moduleError } = await supabase
        .from('learning_modules')
        .delete()
        .eq('learning_module_id', learningModuleId)
        .eq('user_id', user.id);
  
      if (moduleError) throw moduleError;
  
      // Refresh list
      await loadAvailableActivities();
  
      // Clear selection if it matches deleted
      if (selectedActivity?.learning_module_id === learningModuleId) {
        setSelectedActivity(null);
        setSelectedLearningModule(null);
        setCurrentSession(null);
        setChatHistory([]);
      }
  
      alert("Session successfully deleted.");
    } catch (error) {
      console.error('Failed to delete session:', error);
      alert("Failed to delete session. Please try again.");
    }
  };

  const handleUseSelectedActivity = async () => {
    if (!selectedActivity) return;

    try {
      // Create or load activity session
      const session = await createActivitySession(selectedActivity);
      
      // The learning module is already loaded when activity was selected
      
    } catch (error) {
      console.error('Error starting create activity session:', error);
      alert('Failed to start create activity session. Please try again.');
    }
  };

  const handleSubmit = async () => {
    if (!userInput.trim()) return;
    
    if (!selectedLearningModule || !currentSession) {
      alert('Please select a create activity and start a session first.');
      return;
    }

    // Handle voice input stopping
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

    // Get grade-appropriate instructions
    const gradeInstructions = getGradeAppropriateInstructions(userGradeLevel);

    // Enhanced AI instructions for creativity coaching
    const enhancedInstructions = `${gradeInstructions}

LEARNING MODULE CONTEXT:
${selectedLearningModule.ai_facilitator_instructions}

Title: ${selectedLearningModule.title}
Description: ${selectedLearningModule.description}

LEARNING OUTCOMES TO GUIDE TOWARDS:
${selectedLearningModule.outcomes}

SUCCESS METRICS TO CONSIDER:
${selectedLearningModule.metrics_for_success}

Remember: Be a creativity coach, use humor appropriately, ask clarifying questions, provide creative insights, and offer encouragement. Help the student unlock their creative potential through breakthrough innovation.`;

    const messages = [
      { role: 'system', content: enhancedInstructions },
      ...chatHistory.map(msg => ({
        role: msg.role === 'assistant' ? 'assistant' : 'user',
        content: msg.content
      })),
      { role: 'user', content: currentInput }
    ];

    const reply = await callOpenAI(messages);
    
    const aiMessage: ChatMessage = {
      role: 'assistant',
      content: reply,
      timestamp: new Date()
    };
    
    const finalChatHistory = [...updatedChatHistory, aiMessage];
    setChatHistory(finalChatHistory);
    
    // Update chat history in database after AI response
    await updateChatHistory(currentSession.id, finalChatHistory);
    
    setLoading(false);

    // Speak AI response
    speakAIResponse(reply, wasListeningBeforeSubmit);
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
                message.role === 'assistant' ? 'bg-purple-100' : 'bg-green-100'
              )}>
                {message.role === 'assistant' ? (
                  <Bot className="w-4 h-4 text-purple-600" />
                ) : (
                  <User className="w-4 h-4 text-green-600" />
                )}
              </div>
              <div className="flex-1">
                <div className={classNames(
                  'text-sm font-semibold mb-1',
                  message.role === 'assistant' ? 'text-purple-600' : 'text-green-600'
                )}>
                  {message.role === 'assistant' ? (
                    <span><strong>AI Creativity Coach:</strong></span>
                  ) : (
                    <span><strong>You:</strong></span>
                  )}
                </div>
                <div className={classNames(
                  'p-3 rounded-lg',
                  message.role === 'assistant' 
                    ? 'bg-gray-100 text-gray-900' 
                    : 'bg-purple-500 text-white'
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
                    message.role === 'assistant' ? 'text-gray-500' : 'text-purple-100'
                  )}>
                    {message.timestamp instanceof Date 
                      ? message.timestamp.toLocaleTimeString() 
                      : new Date(message.timestamp).toLocaleTimeString()}
                  </p>
                </div>
              </div>
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex items-start space-x-3">
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center">
              <Bot className="w-4 h-4 text-purple-600" />
            </div>
            <div className="flex-1">
              <div className="text-sm font-semibold mb-1 text-purple-600">
                <strong>AI Creativity Coach:</strong>
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
      
      {/* Background with creative image */}
      <div 
        className="min-h-screen bg-cover bg-center bg-no-repeat relative"
        style={{
          backgroundImage: `linear-gradient(rgba(255, 255, 255, 0.2), rgba(255, 255, 255, 0.2)), url('https://images.unsplash.com/photo-1558618666-fcd25c85cd64?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=2070&q=80')`,
          backgroundBlendMode: 'overlay'
        }}
      >
        <div className="max-w-4xl mx-auto py-10 px-4 relative z-10">
          

          {/* Available Create Activities Section */}
          <div className="bg-white/90 backdrop-blur-sm rounded-lg shadow-lg p-8 mb-8">
            <h2 className="text-2xl font-bold text-gray-800 mb-4 flex items-center">
              <Palette className="h-6 w-6 mr-2 text-purple-600" />
              Your Creative Playground
            </h2>
            <p className="text-gray-700 mb-6">
              This is your playground to create whatever you wish to create. You can continue with other creative activities you have started (see list below if you have previously added a creative activity) or simply select the "Start a New Create Activity" to start another one.
            </p>
            
            {availableActivities.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
                {availableActivities.map(activity => (
                  <div
                    key={activity.learning_module_id}
                    className={classNames(
                      'p-4 rounded-lg border-2 relative transition-all hover:shadow-md',
                      selectedActivity?.learning_module_id === activity.learning_module_id
                        ? 'border-purple-500 bg-purple-50'
                        : 'border-gray-200 bg-white hover:border-gray-300'
                    )}
                  >
                    {/* Delete icon */}
                    <button
                      onClick={() => handleDeleteSession(activity.learning_module_id)}
                      className="absolute bottom-2 right-2 text-red-500 hover:text-red-700 p-1"
                      title="Delete this session"
                    >
                      ✂️
                    </button>

                    {/* Clickable content area */}
                    <div onClick={() => handleSelectActivity(activity)}>
                      <h3 className="font-semibold text-gray-900 mb-2">{activity.title}</h3>
                      <p className="text-sm text-gray-600 mb-2">{activity.sub_category}</p>
                      <p className="text-xs text-gray-500">{activity.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-600 mb-6">
                No create activities found. Create your first creativity activity below!
              </p>
            )}

            {/* Action Buttons */}
            <div className="flex gap-4">
              <button
                className="bg-purple-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-purple-700 transition-colors flex items-center gap-2"
                onClick={() => {
                  setShowCreateNew(true);
                  setSelectedActivity(null);
                  setSelectedLearningModule(null);
                  setCurrentSession(null);
                  setChatHistory([]);
                }}
              >
                <Plus size={16} />
                Start a New Create Activity
              </button>
              {selectedActivity && (
                <button
                  className="bg-green-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-green-700 transition-colors flex items-center gap-2"
                  onClick={handleUseSelectedActivity}
                >
                  <Users size={16} />
                  Create the Selected Activity
                </button>
              )}
            </div>
          </div>

          {/* Create New Activity Section - Only show if creating new */}
          {showCreateNew && (
            <div className="bg-white/90 backdrop-blur-sm rounded-lg shadow-lg p-8 mb-8">
              <h1 className="text-3xl font-bold text-gray-800 mb-4 flex items-center">
                <Lightbulb className="h-8 w-8 mr-3 text-purple-600" />
                Create New Activity
              </h1>
              <p className="text-gray-600 mb-6">
                Define your creativity challenge! Give your activity a title and describe what you want to create or explore.
                Your AI creativity coach will help guide you through the breakthrough innovation process.
              </p>
              
              <div className="space-y-6">
                {/* Title Input */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Activity Title *
                  </label>
                  <input
                    type="text"
                    className="w-full border rounded-lg p-3 focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                    value={newActivityTitle}
                    onChange={(e) => setNewActivityTitle(e.target.value)}
                    placeholder="e.g., Designing a better school lunch system"
                    disabled={creatingActivity}
                  />
                </div>

                {/* Description Input */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Activity Overview *
                  </label>
                    <SpellCheckTextarea
                      value={newActivityDescription}
                      onChange={setNewActivityDescription}
                      onKeyDown={(e) => handleKeyPress(e, createNewActivity)}
                      placeholder="Describe what you want to create or explore..."
                      className="w-full p-3 border border-gray-300 rounded-lg resize-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 h-18"
                      disabled={creatingActivity}
                    />
                </div>

                {/* Sub-category Dropdown */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Category *
                  </label>
                  <select
                    className="w-full border rounded-lg p-3 focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                    value={newActivitySubCategory}
                    onChange={(e) => setNewActivitySubCategory(e.target.value)}
                    disabled={creatingActivity}
                  >
                    <option value="">Select a category</option>
                    {subCategoryOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Custom Sub-category Input - Only show if "other" is selected */}
                {newActivitySubCategory === 'other' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Custom Category *
                    </label>
                    <input
                      type="text"
                      className="w-full border rounded-lg p-3 focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                      value={customSubCategory}
                      onChange={(e) => setCustomSubCategory(e.target.value)}
                      placeholder="Enter your custom category"
                      disabled={creatingActivity}
                    />
                  </div>
                )}

                {/* Create Activity Button */}
                <div className="pt-4">
                  <button
                    className="bg-green-600 text-white px-8 py-3 rounded-lg font-semibold hover:bg-green-700 transition-colors disabled:bg-gray-400 flex items-center gap-2"
                    onClick={createNewActivity}
                    disabled={creatingActivity || !newActivityTitle.trim() || !newActivityDescription.trim() || !newActivitySubCategory || (newActivitySubCategory === 'other' && !customSubCategory.trim())}
                  >
                    {creatingActivity ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                        Creating Activity...
                      </>
                    ) : (
                      <>
                        <CheckCircle size={16} />
                        Create Activity
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Use Your Create Activity Section */}
          <div className="bg-white/90 backdrop-blur-sm rounded-lg shadow-lg p-8">
            <h1 className="text-3xl font-bold text-gray-800 mb-4 flex items-center">
              <Palette className="h-8 w-8 mr-3 text-purple-600" />
              Creativity Workshop
            </h1>
            <p className="text-gray-600 mb-6">
              {currentSession ? 
                `Active creativity session: ${selectedActivity?.title}` :
                selectedActivity ?
                  `Selected activity: ${selectedActivity.title}. Click "Create the Selected Activity" to start your creativity session.` :
                  showCreateNew ?
                    "Once you've created your activity above, this AI creativity coach will help guide you through breakthrough innovation and creative thinking." :
                    "Select an available activity above or create a new one to begin your creative journey."
              }
            </p>
            
            {/* Current Session Info */}
            {currentSession && (
              <div className="bg-purple-50 border border-purple-200 rounded-lg p-4 mb-6">
                <h3 className="text-lg font-semibold text-purple-800 mb-2">Active Creativity Session</h3>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div><strong>Activity:</strong> {selectedActivity?.title}</div>
                  <div><strong>Status:</strong> {currentSession.progress}</div>
                  <div><strong>Session ID:</strong> {currentSession.id.slice(0, 8)}...</div>
                  <div><strong>Started:</strong> {new Date(currentSession.created_at).toLocaleString()}</div>
                </div>
                {currentSession.evaluation_score && (
                  <div className="mt-2">
                    <strong>Last Score:</strong> <span className="text-purple-600 font-semibold">{currentSession.evaluation_score}%</span>
                  </div>
                )}
              </div>
            )}
            
            {/* Create Activity Chat Bot */}
            <div className="bg-white rounded-lg shadow-md mb-4">
              <div className="p-4 border-b">
                <h3 className="text-lg font-semibold text-gray-900">Creativity Conversation</h3>
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
                      "Session is ready! Start your creativity conversation below..." :
                      "Please select an activity and start a session to begin creating."
                    }
                  </div>
                )}
              </div>
            </div>
            
            {/* Voice Controls - Place above User Input */}
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-4">
          <h4 className="text-md font-semibold text-gray-800 mb-3">Voice Settings</h4>
          <div className="flex items-center space-x-4 flex-wrap gap-y-2">
            <label className="flex items-center space-x-2 bg-purple-100 border border-black px-3 py-2 rounded-md cursor-pointer">
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
              <span className="text-black font-medium text-sm">Enable Voice Input</span>
            </label>

            <label className="flex items-center space-x-2 bg-purple-100 border border-black px-3 py-2 rounded-md cursor-pointer">
              <input
                type="checkbox"
                checked={voiceOutputEnabled}
                onChange={() => setVoiceOutputEnabled(!voiceOutputEnabled)}
                className="accent-purple-600 w-4 h-4"
              />
              <span className="text-black font-medium text-sm">Enable Voice Output</span>
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

            {/* Manual Voice Selector */}
            {voiceOutputEnabled && availableVoices.length > 0 && (
              <div className="flex items-center space-x-2">
                <label className="text-sm font-medium bg-purple-900 text-pink-200 px-3 py-1 rounded">Select Voice</label>
                <select 
                  value={selectedVoice?.name || ''} 
                  onChange={(e) => {
                    const voice = availableVoices.find(v => v.name === e.target.value);
                    setSelectedVoice(voice || null);
                    console.log('[AI Voice] Manually selected:', voice?.name);
                  }}
                  className="text-sm border border-gray-300 rounded px-2 py-1 bg-white max-w-48 truncate"
                >
                  {availableVoices
                    .filter(v => v.lang.startsWith('en'))
                    .map(voice => (
                      <option key={voice.name} value={voice.name}>
                        {voice.name} ({voice.lang})
                      </option>
                    ))
                  }
                </select>
              </div>
            )}
          </div>
        </div>
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
              
              {/* Voice Input Button */}
              {voiceInputEnabled && (
                <button
                  onClick={startVoiceInput}
                  className={classNames(
                    "px-4 py-3 rounded-lg font-semibold transition-colors flex items-center gap-2",
                    isListening 
                      ? "bg-red-100 hover:bg-red-200 text-red-800" 
                      : "bg-purple-100 hover:bg-purple-200 text-purple-800"
                  )}
                  disabled={!speechRecognition || !currentSession}
                  style={{ height: 'fit-content' }}
                >
                  <Mic size={16} />
                  {isListening ? 'Stop' : 'Speak'}
                </button>
              )}
              
              <button
                className="bg-purple-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-purple-700 transition-colors disabled:bg-gray-400 flex items-center gap-2"
                onClick={handleSubmit}
                disabled={loading || !userInput.trim() || !currentSession}
                style={{ height: 'fit-content' }}
              >
                <Send size={16} />
                Create Away!
              </button>
            </div>

            {/* Evaluate and Save Session Button */}
            {currentSession && chatHistory.length > 1 && (
              <div className="bg-gray-50 rounded-lg p-6 mt-6">
                <div className="text-center">
                  <h3 className="text-lg font-semibold text-gray-900 mb-3">Creativity Assessment</h3>
                  <p className="text-gray-600 mb-4">
                    Ready to evaluate your creativity session? Get feedback on your innovative thinking and save your creative journey.
                  </p>
                  <button
                    onClick={handleEvaluateSession}
                    disabled={evaluating}
                    className="bg-purple-600 text-white px-8 py-3 rounded-lg font-semibold hover:bg-purple-700 transition-colors disabled:bg-gray-400 flex items-center gap-2 mx-auto"
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
                evaluationResult.score > 84.95 ? "text-purple-600" : "text-gray-900"
              )}>
                <Star className="h-6 w-6 mr-2 text-yellow-500" />
                {evaluationResult.score > 84.95 ? "🎨 Creative Mastery!" : "Creativity Assessment"}
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
                  evaluationResult.score > 84.95 ? "text-purple-600" : "text-purple-500"
                )}>
                  {evaluationResult.score}/100
                </div>
                <div className="text-sm text-gray-600">
                  {evaluationResult.score > 84.95 ? "Exceptional Creativity!" : "Your Creativity Score"}
                </div>
                {evaluationResult.score > 84.95 && (
                  <div className="mt-2 text-sm text-purple-600 font-semibold">
                    You've demonstrated breakthrough creative thinking!
                  </div>
                )}
              </div>
              
              <div className="border-t pt-4">
                <h4 className="font-semibold text-gray-900 mb-2">Creativity Coach Assessment:</h4>
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
                    className="bg-gradient-to-r from-purple-500 to-pink-600 text-white px-6 py-2 rounded-lg font-semibold hover:from-purple-600 hover:to-pink-700 transition-all transform hover:scale-105"
                  >
                    🎨 Celebrate!
                  </button>
                )}
                <button
                  onClick={() => setShowEvaluationModal(false)}
                  className="bg-purple-600 hover:bg-purple-700 text-white px-6 py-2 rounded-lg font-semibold transition-colors"
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

export default CreatePage;