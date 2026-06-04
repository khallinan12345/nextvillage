// CodeAssistantPage.tsx - Modified to use serverless API routes
import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabaseClient';
import AppLayout from '../components/layout/AppLayout';
import Button from '../components/ui/Button';
import SpellCheckTextarea from '../components/ui/SpellCheckTextarea';
import { useVoice } from '../hooks/useVoice';
import { VoiceFallback } from '../components/VoiceFallback';
import Editor from '@monaco-editor/react';
// Import the chat client functions
import { chatText, chatJSON, generateImageViaServer } from '../lib/chatClient';
import {
  Code,
  Presentation,
  Gamepad2,
  Palette,
  Brain,
  Layers,
  Zap,
  Trophy,
  Blocks,
  CheckCircle,
  Clock,
  Circle,
  Target,
  RefreshCw,
  ArrowLeft,
  Send,
  Bot,
  User,
  Play,
  FileText,
  AlertCircle,
  CheckIcon,
  X,
  Terminal,
  Maximize,
  Minimize,
  Copy,
  PenTool,
  GraduationCap,
  BookOpen,
  Calendar,
  HelpCircle,
  ShoppingCart,
  Share,
  Leaf,
  DollarSign,
  Brush,
  Lightbulb,
  MessageSquare,
  Star,
  Puzzle,
  Mic, // Added for voice input
  Wand2,
  Globe,
  ExternalLink,
  ClipboardList,
} from 'lucide-react';
import classNames from 'classnames';
import { useAuth } from '../hooks/useAuth';
import ReactMarkdown from 'react-markdown';

interface DashboardActivity {
  id: string;
  activity: string;
  title: string;
  category_activity: string;
  sub_category?: string;
  progress: 'not started' | 'started' | 'completed';
  evaluation_score?: number;
  evaluation_evidence?: string;
  learning_module_id?: string;
  chat_history?: string;
  updated_at: string;
}

interface CodeExecution {
  id: string;
  code: string;
  language: 'python' | 'javascript' | 'html';
  output?: string;
  error?: string;
  executionTime?: number;
  timestamp: Date;
  isWebCode?: boolean;
}

interface ChatMessage {
  role: 'assistant' | 'user';
  content: string;
  timestamp: Date;
  codeExecution?: CodeExecution;
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

// Confetti Component
const ConfettiAnimation: React.FC = () => {
  const colors = ['#ff6b6b', '#4ecdc4', '#45b7d1', '#96ceb4', '#feca57', '#ff9ff3', '#54a0ff'];
  
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
        {Array.from({ length: 50 }).map((_, i) => (
          <div
            key={i}
            className="absolute w-2 h-2 opacity-80 confetti-piece"
            style={{
              backgroundColor: colors[i % colors.length],
              left: `${Math.random() * 100}%`,
              animationDelay: `${Math.random() * 3}s`,
              animationDuration: `${3 + Math.random() * 2}s`,
              transform: `rotate(${Math.random() * 360}deg)`,
            }}
          />
        ))}
      </div>
    </>
  );
};

// Enhanced code execution service with HTML detection
class CodeExecutionService {
  private static apiUrl = '/api/execute-code'; // Uses Vite proxy

  static async executeCode(code: string, language: 'python' | 'javascript' | 'html'): Promise<CodeExecution> {
    const executionId = Date.now().toString();
    const isWebCode = this.detectWebCode(code, language);
    
    try {
      // For HTML or browser-specific JavaScript, skip server execution
      if (language === 'html' || (language === 'javascript' && isWebCode)) {
        return {
          id: executionId,
          code,
          language,
          output: language === 'html' ? 
            "🎮 Complete HTML document detected! Check the Preview tab to see your web application in action." :
            "🎮 Browser-specific code detected! This JavaScript uses DOM APIs and is designed to run in a web browser. Check the Preview tab to see it in action.",
          executionTime: 0,
          timestamp: new Date(),
          isWebCode: true
        };
      }

      // Only send Python and non-browser JavaScript to the server
      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          code,
          language,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`API Error: ${response.status} - ${errorData.error || 'Unknown error'}`);
      }

      const result = await response.json();
      
      return {
        id: executionId,
        code,
        language,
        output: result.output,
        error: result.error,
        executionTime: result.executionTime,
        timestamp: new Date(),
        isWebCode
      };
    } catch (error) {
      return {
        id: executionId,
        code,
        language,
        error: `Execution failed: ${error.message}`,
        timestamp: new Date(),
        isWebCode
      };
    }
  }

  // Detect if code is web-based (HTML/CSS/JS for browser)
  static detectWebCode(code: string, language: string): boolean {
    if (language === 'html') {
      return true; // All HTML is web code
    }
    
    if (language === 'javascript') {
      // Check for web-specific patterns
      const webPatterns = [
        'document.',
        'window.',
        'getElementById',
        'querySelector',
        'addEventListener',
        'innerHTML',
        'createElement',
        'DOM',
        'onclick',
        'onload',
        'alert(',
        'confirm(',
        'prompt(',
        'classList',
        '.style.',
        'appendChild',
        'removeChild'
      ];
      
      const codeText = code.toLowerCase();
      return webPatterns.some(pattern => codeText.includes(pattern.toLowerCase()));
    }
    return false;
  }

  // Generate appropriate HTML for JavaScript that expects DOM elements
  static generateHTMLForJS(jsCode: string): string {
    const code = jsCode.toLowerCase();
    
    // Detect tic-tac-toe game patterns
    if (code.includes('.cell') || code.includes('tic') || code.includes('tac') || code.includes('toe')) {
      return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Tic Tac Toe Game</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
            margin: 0;
            background-color: #f0f0f0;
        }
        .game-container {
            text-align: center;
            background: white;
            padding: 20px;
            border-radius: 10px;
            box-shadow: 0 4px 6px rgba(0,0,0,0.1);
        }
        .game-board {
            display: grid;
            grid-template-columns: repeat(3, 100px);
            grid-template-rows: repeat(3, 100px);
            gap: 2px;
            margin: 20px auto;
            background-color: #333;
            padding: 2px;
        }
        .cell {
            background-color: white;
            border: none;
            font-size: 24px;
            font-weight: bold;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        .cell:hover {
            background-color: #f0f0f0;
        }
        #status {
            margin: 20px 0;
            font-size: 18px;
            font-weight: bold;
        }
        button {
            background-color: #4CAF50;
            color: white;
            padding: 10px 20px;
            border: none;
            border-radius: 5px;
            cursor: pointer;
            font-size: 16px;
            margin: 10px;
        }
        button:hover {
            background-color: #45a049;
        }
    </style>
</head>
<body>
    <div class="game-container">
        <h1>🎮 Tic Tac Toe</h1>
        <div id="status">Player X's turn</div>
        <div class="game-board">
            <div class="cell" data-index="0"></div>
            <div class="cell" data-index="1"></div>
            <div class="cell" data-index="2"></div>
            <div class="cell" data-index="3"></div>
            <div class="cell" data-index="4"></div>
            <div class="cell" data-index="5"></div>
            <div class="cell" data-index="6"></div>
            <div class="cell" data-index="7"></div>
            <div class="cell" data-index="8"></div>
        </div>
        <button onclick="resetGame()">New Game</button>
    </div>
    <script>
        ${jsCode}
    </script>
</body>
</html>`;
    }
    
    // Generic HTML template for other JavaScript
    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Vibing Code Preview</title>
    <style>
        body {
            margin: 0;
            padding: 20px;
            font-family: Arial, sans-serif;
            background: #f0f0f0;
        }
        * {
            box-sizing: border-box;
        }
        .container {
            max-width: 800px;
            margin: 0 auto;
            background: white;
            padding: 20px;
            border-radius: 10px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>🎵 Vibing Code Output</h1>
        <div id="output"></div>
    </div>
    <script>
        try {
            ${jsCode}
        } catch (error) {
            document.getElementById('output').innerHTML = '<div style="color: red; padding: 20px; background: #fee; border-radius: 5px;">Error: ' + error.message + '</div>';
        }
    </script>
</body>
</html>`;
  }
}

// HTML Preview Component
const HTMLPreview: React.FC<{
  code: string;
  isOpen: boolean;
  onClose: () => void;
}> = ({ code, isOpen, onClose }) => {
  const [isMaximized, setIsMaximized] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    if (isOpen && iframeRef.current) {
      // Use the complete HTML document (either original HTML or generated HTML for JS)
      const blob = new Blob([code], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      iframeRef.current.src = url;

      return () => {
        URL.revokeObjectURL(url);
      };
    }
  }, [code, isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className={classNames(
        'bg-white rounded-lg shadow-2xl border border-gray-300 flex flex-col',
        isMaximized ? 'w-full h-full' : 'w-4/5 h-4/5 max-w-5xl'
      )}>
        {/* Preview Header */}
        <div className="flex items-center justify-between p-3 border-b border-gray-300 bg-gray-50 rounded-t-lg">
          <div className="flex items-center space-x-3">
            <div className="flex space-x-2">
              <button
                onClick={onClose}
                className="w-3 h-3 bg-red-500 rounded-full hover:bg-red-600 transition-colors cursor-pointer"
                title="Close Preview"
              ></button>
              <button
                onClick={() => setIsMaximized(!isMaximized)}
                className="w-3 h-3 bg-yellow-500 rounded-full hover:bg-yellow-600 transition-colors cursor-pointer"
                title="Minimize/Maximize"
              ></button>
              <button
                onClick={() => setIsMaximized(true)}
                className="w-3 h-3 bg-green-500 rounded-full hover:bg-green-600 transition-colors cursor-pointer"
                title="Maximize"
              ></button>
            </div>
            <div className="flex items-center space-x-2 text-gray-700">
              <div className="w-4 h-4 bg-gradient-to-r from-purple-500 to-pink-500 rounded"></div>
              <span className="text-sm font-medium">
                🎵 Vibing Web Preview
              </span>
            </div>
          </div>
          
          <div className="flex items-center space-x-2">
            <button
              onClick={() => {
                const blob = new Blob([code], { type: 'text/html' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'my-vibing-creation.html';
                a.click();
                URL.revokeObjectURL(url);
              }}
              className="px-3 py-1 text-xs bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
            >
              Download HTML
            </button>
            <button
              onClick={onClose}
              className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Preview Content */}
        <div className="flex-1 overflow-hidden">
          <iframe
            ref={iframeRef}
            className="w-full h-full border-0"
            sandbox="allow-scripts allow-same-origin"
            title="HTML Preview"
          />
        </div>

        {/* Preview Footer */}
        <div className="p-3 border-t border-gray-300 bg-gray-50">
          <div className="flex items-center justify-between text-xs text-gray-600">
            <span>
              🎮 Interactive preview of your code - click and play!
            </span>
            <span>
              Press ESC to close
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

const ConsoleModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  execution: CodeExecution | null;
  allExecutions: CodeExecution[];
}> = ({ isOpen, onClose, execution, allExecutions }) => {
  const [isMaximized, setIsMaximized] = useState(false);
  const [selectedExecution, setSelectedExecution] = useState<CodeExecution | null>(execution);

  useEffect(() => {
    if (execution) {
      setSelectedExecution(execution);
    }
  }, [execution]);

  if (!isOpen || !selectedExecution) return null;

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className={classNames(
        'bg-gray-900 rounded-lg shadow-2xl border border-gray-700 flex flex-col',
        isMaximized ? 'w-full h-full' : 'w-4/5 h-4/5 max-w-4xl'
      )}>
        {/* Console Header */}
        <div className="flex items-center justify-between p-3 border-b border-gray-700 bg-gray-800 rounded-t-lg">
          <div className="flex items-center space-x-3">
            <div className="flex space-x-2">
              <button
                onClick={onClose}
                className="w-3 h-3 bg-red-500 rounded-full hover:bg-red-600 transition-colors cursor-pointer"
                title="Close Console"
              ></button>
              <button
                onClick={() => setIsMaximized(!isMaximized)}
                className="w-3 h-3 bg-yellow-500 rounded-full hover:bg-yellow-600 transition-colors cursor-pointer"
                title="Minimize/Maximize"
              ></button>
              <button
                onClick={() => setIsMaximized(true)}
                className="w-3 h-3 bg-green-500 rounded-full hover:bg-green-600 transition-colors cursor-pointer"
                title="Maximize"
              ></button>
            </div>
            <div className="flex items-center space-x-2 text-gray-300">
              <Terminal className="w-4 h-4" />
              <span className="text-sm font-medium">
                Vibing Console - {selectedExecution.language}
              </span>
            </div>
          </div>
          
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setIsMaximized(!isMaximized)}
              className="p-1 text-gray-400 hover:text-white transition-colors"
            >
              {isMaximized ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
            </button>
            <button
              onClick={onClose}
              className="p-1 text-gray-400 hover:text-white transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Console Content */}
        <div className="flex flex-1 overflow-hidden">
          {/* Execution History Sidebar */}
          <div className="w-64 bg-gray-800 border-r border-gray-700 overflow-y-auto">
            <div className="p-3 border-b border-gray-700">
              <h3 className="text-sm font-medium text-gray-300">Execution History</h3>
            </div>
            <div className="p-2 space-y-1">
              {allExecutions.slice().reverse().map((exec, index) => (
                <button
                  key={exec.id}
                  onClick={() => setSelectedExecution(exec)}
                  className={classNames(
                    'w-full text-left p-2 rounded text-xs transition-colors',
                    selectedExecution?.id === exec.id
                      ? 'bg-blue-600 text-white'
                      : 'text-gray-300 hover:bg-gray-700'
                  )}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium">{exec.language}</span>
                    <span className="text-xs opacity-75">
                      {exec.timestamp.toLocaleTimeString()}
                    </span>
                  </div>
                  <div className="truncate opacity-75">
                    {exec.code.split('\n')[0]}
                  </div>
                  <div className="flex items-center mt-1">
                    {exec.error ? (
                      <span className="text-red-400 text-xs">❌ Error</span>
                    ) : (
                      <span className="text-green-400 text-xs">✅ Success</span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Main Console Area */}
          <div className="flex-1 flex flex-col">
            {/* Code Section */}
            <div className="flex-1 overflow-y-auto p-4 font-mono text-sm">
              <div className="mb-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-green-400 font-medium">
                    📝 Code ({selectedExecution.language})
                  </span>
                  <button
                    onClick={() => copyToClipboard(selectedExecution.code)}
                    className="p-1 text-gray-400 hover:text-white transition-colors"
                  >
                    <Copy className="w-4 h-4" />
                  </button>
                </div>
                <div className="bg-gray-800 p-3 rounded border border-gray-600">
                  <pre className="text-yellow-300 whitespace-pre-wrap">
                    {selectedExecution.code}
                  </pre>
                </div>
              </div>

              {/* Execution Info */}
              <div className="mb-4">
                <div className="text-blue-400 font-medium mb-2">
                  ⚡ Execution Details
                </div>
                <div className="bg-gray-800 p-3 rounded border border-gray-600 text-gray-300">
                  <div>Language: {selectedExecution.language}</div>
                  <div>Time: {selectedExecution.timestamp.toLocaleString()}</div>
                  {selectedExecution.executionTime && (
                    <div>Duration: {selectedExecution.executionTime}ms</div>
                  )}
                </div>
              </div>

              {/* Output Section */}
              {selectedExecution.output && (
                <div className="mb-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-green-400 font-medium">
                      🚀 Output
                    </span>
                    <button
                      onClick={() => copyToClipboard(selectedExecution.output || '')}
                      className="p-1 text-gray-400 hover:text-white transition-colors"
                    >
                      <Copy className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="bg-gray-800 p-3 rounded border border-gray-600">
                    <pre className="text-white whitespace-pre-wrap">
                      {selectedExecution.output}
                    </pre>
                  </div>
                </div>
              )}

              {/* Error Section */}
              {selectedExecution.error && (
                <div className="mb-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-red-400 font-medium">
                      ❌ Error
                    </span>
                    <button
                      onClick={() => copyToClipboard(selectedExecution.error || '')}
                      className="p-1 text-gray-400 hover:text-white transition-colors"
                    >
                      <Copy className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="bg-red-900 bg-opacity-20 p-3 rounded border border-red-600">
                    <pre className="text-red-300 whitespace-pre-wrap">
                      {selectedExecution.error}
                    </pre>
                  </div>
                </div>
              )}
            </div>

            {/* Console Footer */}
            <div className="p-3 border-t border-gray-700 bg-gray-800">
              <div className="flex items-center justify-between text-xs text-gray-400">
                <span>
                  {selectedExecution.error ? 'Execution failed' : 'Execution completed successfully'}
                </span>
                <span>
                  Press ESC to close
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const CodeAssistantPage: React.FC = () => {
  const { user } = useAuth();
  
  // Existing state
  const [allCodingActivities, setAllCodingActivities] = useState<DashboardActivity[]>([]);
  const [selectedActivity, setSelectedActivity] = useState<DashboardActivity | null>(null);
  const [activityDescription, setActivityDescription] = useState<string>('');
  const [moduleTitle, setModuleTitle] = useState<string>('');
  const [aiFacilitatorInstructions, setAiFacilitatorInstructions] = useState<string>('');
  const [aiAssessmentInstructions, setAiAssessmentInstructions] = useState<string>('');
  const [successMetrics, setSuccessMetrics] = useState<string>('');
  const [userGradeLevel, setUserGradeLevel] = useState<number | null>(null);
  const [personalityBaseline, setPersonalityBaseline] = useState<PersonalityBaseline>({
    communicationStrategy: null,
    learningStrategy: null
  });
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [userInput, setUserInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [evaluating, setEvaluating] = useState(false);
  const [showEvaluationModal, setShowEvaluationModal] = useState(false);
  const [evaluationResult, setEvaluationResult] = useState<{score: number, evidence: string} | null>(null);
  const [showConfetti, setShowConfetti] = useState(false);
  const [codeHistory, setCodeHistory] = useState<CodeExecution[]>([]);
  const [showConsole, setShowConsole] = useState(false);
  const [latestExecution, setLatestExecution] = useState<CodeExecution | null>(null);
  const [showHTMLPreview, setShowHTMLPreview] = useState(false);
  const [previewCode, setPreviewCode] = useState('');

  // Vibe Coding Prompt
  const [showVibePrompt, setShowVibePrompt] = useState(false);
  const [vibePrompt, setVibePrompt] = useState('');
  const [generatingVibePrompt, setGeneratingVibePrompt] = useState(false);
  const [vibeCopied, setVibeCopied] = useState(false);

  // Stringlet hosting
  const [stringletUrl, setStringletUrl] = useState<string | null>(null);
  const [hostingToStringlet, setHostingToStringlet] = useState(false);
  const [stringletError, setStringletError] = useState<string | null>(null);

  // Monaco editor state
  const [editorCode, setEditorCode] = useState<string>('# Start coding here...\n');
  const [editorLanguage, setEditorLanguage] = useState<'python' | 'javascript' | 'html'>('python');

  // NEW: Voice-related state variables
  const [voiceInputEnabled, setVoiceInputEnabled] = useState(false);
  const [voiceOutputEnabled, setVoiceOutputEnabled] = useState(true);
  const [isListening, setIsListening] = useState(false);
  const [speechRecognition, setSpeechRecognition] = useState<any>(null);
  const [wasListeningBeforeSubmit, setWasListeningBeforeSubmit] = useState(false);
  const [userContinent, setUserContinent] = useState<string | null>(null);
  const [voiceMode, setVoiceMode] = useState<'english' | 'pidgin'>('pidgin'); // Africa default

  // ── useVoice hook — Nigeria-aware TTS with offline fallback ───────────────
  const isAfrica = userContinent === 'Africa';
  const {
    speak: hookSpeak,
    cancel: cancelSpeech,
    speaking: isSpeaking,
    fallbackText,
    clearFallback,
    recognitionLang,
    selectedVoice,
  } = useVoice(voiceMode === 'pidgin');

  const chatContainerRef = useRef<HTMLDivElement>(null);

  // Initialize speech recognition
  // Note: voice selection and TTS handled by useVoice hook above
  useEffect(() => {
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      const recognition = new SpeechRecognition();
      
      recognition.continuous = true;
      recognition.interimResults = true;
      // recognitionLang = 'en-NG' for Africa — understands Nigerian-accented speech
      recognition.lang = recognitionLang;
      
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
  }, [recognitionLang]);

  // Voice input restarts after TTS finishes
  const prevIsSpeaking = useRef(false);
  useEffect(() => {
    const wasSpeaking = prevIsSpeaking.current;
    prevIsSpeaking.current = isSpeaking;
    if (wasSpeaking && !isSpeaking && wasListeningBeforeSubmit && voiceInputEnabled && speechRecognition) {
      setTimeout(() => {
        try {
          speechRecognition.start();
          setIsListening(true);
        } catch (err) {
          console.error('Error restarting voice input after TTS:', err);
        }
      }, 500);
    }
  }, [isSpeaking, wasListeningBeforeSubmit, voiceInputEnabled, speechRecognition]);

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
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [chatHistory]);

  // Fetch user's grade level and continent from profiles
  const fetchUserProfile = async (userId: string) => {
    try {
      console.log('[Code Profile] Fetching profile for user:', userId);
      
      const { data, error } = await supabase
        .from('profiles')
        .select('grade_level, continent')
        .eq('id', userId)
        .single();

      if (error) {
        console.error('[Code Profile] Error fetching profile:', error);
        return { gradeLevel: null, continent: null };
      }

      console.log('[Code Profile] Profile fetched:', data);
      return {
        gradeLevel: data?.grade_level || null,
        continent: data?.continent || null
      };
    } catch (err) {
      console.error('[Code Profile] Error fetching user profile:', err);
      return { gradeLevel: null, continent: null };
    }
  };

  // Get learner-appropriate language instructions
  const getLearnerAppropriateLanguageInstructions = (gradeLevel: number | null): string => {
    const cs = personalityBaseline.communicationStrategy;
    const ls = personalityBaseline.learningStrategy;
    const personalizedBlock = (cs || ls) ? `
PERSONALIZED LEARNER PROFILE (from prior AI-assessed baseline):
${cs ? `- Communication Style: tone=${cs.preferred_tone ?? 'n/a'}, interaction=${cs.interaction_style ?? 'n/a'}, detail level=${cs.detail_level ?? 'n/a'}` : ''}
${cs?.recommendations?.length ? `  Communication Tips: ${cs.recommendations.join('; ')}` : ''}
${ls ? `- Learning Approach: style=${ls.learning_style ?? 'n/a'}, motivation=${ls.motivation_approach ?? 'n/a'}, pacing=${ls.pacing_preference ?? 'n/a'}` : ''}
${ls?.recommendations?.length ? `  Learning Tips: ${ls.recommendations.join('; ')}` : ''}

IMPORTANT: Adapt your tone, pacing, questioning style, and encouragement to match this profile in every response.
` : '';

    const commonGuidance = `CRITICAL: Your role is to GUIDE learning, not give direct answers. Always use the Socratic method - ask questions that lead students to discover answers themselves. When students ask questions, respond with guiding questions that help them think through the problem. Provide hints and encouragement, but let them do the thinking and discovery.

RESPONSE LENGTH: Keep responses to 75 words maximum unless it's absolutely essential to provide more information for understanding. Be concise while maintaining effectiveness.${personalizedBlock}`;
    
    if (gradeLevel === 1) {
      return `${commonGuidance}

Important: This student is in elementary school (grades 3-5). Use simple, clear language that a 8-11 year old can understand. Use shorter sentences, avoid complex vocabulary, and be extra encouraging and patient. 

TEACHING APPROACH: Ask simple guiding questions like "What do you think might happen if...?" or "Can you tell me what you notice about...?" Break complex ideas into smaller steps. Use examples from their daily life like family, pets, games, or school activities. Celebrate their thinking process, not just correct answers. Make learning feel like a fun puzzle to solve together!`;
    } else if (gradeLevel === 2) {
      return `${commonGuidance}

Important: This student is in middle school (grades 6-8). Use age-appropriate language for a 11-14 year old. You can use slightly more complex vocabulary but still keep explanations clear and relatable.

TEACHING APPROACH: Ask thought-provoking questions that build on their developing critical thinking skills. Use questions like "Why do you think that happened?" or "What evidence supports that idea?" Help them make connections between concepts. Use examples from school life, friends, technology, and current events they might relate to. Encourage them to explain their reasoning and challenge them to think deeper.`;
    } else if (gradeLevel === 3) {
      return `${commonGuidance}

Important: This student is in high school (grades 9-12). You can use more sophisticated language and concepts appropriate for a 14-18 year old. They can handle complex ideas and abstract thinking.

TEACHING APPROACH: Use advanced questioning techniques that promote analytical and critical thinking. Ask questions like "How would you analyze this situation?" or "What are the implications of this concept?" Encourage them to evaluate different perspectives, make predictions, and synthesize information. Connect learning to their future goals, college prep, career interests, and real-world applications. Challenge them to defend their reasoning and consider alternative viewpoints.`;
    } else {
      return `${commonGuidance}

Important: Adapt your communication style to be clear and age-appropriate. Use encouraging language and check for understanding frequently. Focus on guiding the student to discover answers through thoughtful questioning rather than providing direct solutions.`;
    }
  };

  // Enhanced AI instructions for code execution feedback with learner-appropriate guidance
  const getEnhancedAIInstructions = (baseInstructions: string, gradeLevel: number | null) => {
    const learnerGuidance = getLearnerAppropriateLanguageInstructions(gradeLevel);

    const cs = personalityBaseline.communicationStrategy;
    const ls = personalityBaseline.learningStrategy;
    const vibingPersonalizationNote = (cs || ls)
      ? `\n- Adapt the "vibing" spirit to match the learner's communication and learning preferences (tone=${cs?.preferred_tone ?? 'n/a'}, style=${ls?.learning_style ?? 'n/a'}, pacing=${ls?.pacing_preference ?? 'n/a'})`
      : '';
    
    return `${learnerGuidance}

${baseInstructions}

IMPORTANT CODE EXECUTION INSTRUCTIONS:
- You are helping students learn by writing, running, and iterating on practical code
- When you suggest code, wrap it in triple backticks with the language specified: \`\`\`python, \`\`\`javascript, or \`\`\`html
- For web applications (games, interactive pages, etc.), provide COMPLETE HTML documents with embedded CSS and JavaScript
- Use \`\`\`html for complete web applications that students can see and interact with
- Use \`\`\`javascript only for server-side or console-based JavaScript code
- Use \`\`\`python for Python scripts and applications
- ALWAYS provide COMPLETE, working code - don't truncate or abbreviate
- If code is long, that's perfectly fine - provide the full implementation
- For complex applications, ensure all functions and features are fully implemented
- After code is executed, you'll receive the results (output or errors)
- Use execution results to guide the student's learning:
  * If code runs successfully, explain what happened and suggest improvements or next steps
  * If there are errors, help debug them step by step
  * Encourage experimentation and iteration
- IMPORTANT: After successful code execution and preview, ALWAYS ask the student what improvements they'd like:
  * "What improvements would you like to see? I can help with:"
  * "- Different colors or styling"
  * "- Moving elements around or changing layout"
  * "- Adding new features or functionality"
  * "- Making it more interactive or animated"
  * "- Any other changes you have in mind?"
- Keep the "vibing" spirit: make coding fun, creative, and engaging${vibingPersonalizationNote}
- Suggest practical projects: data analysis, games, visualizations, web apps, etc.
- Build complexity gradually through iteration

EXAMPLES:
- For tic-tac-toe game: Use \`\`\`html with complete HTML structure, CSS styling, and JavaScript logic
- For data analysis: Use \`\`\`python with data processing and visualization
- For web calculator: Use \`\`\`html with form elements and JavaScript functionality
- For story development tools: Use \`\`\`html with complete interface and all JavaScript functions

The student is in "vibing" mode - they want to learn by doing and creating cool stuff they can see and interact with!`;
  };

  // Extract code blocks from AI responses - now supports HTML
  const extractCodeBlocks = (content: string): { code: string; language: 'python' | 'javascript' | 'html' }[] => {
    const codeBlockRegex = /```(python|javascript|html)\n([\s\S]*?)\n```/g;
    const matches = [];
    let match;
    
    while ((match = codeBlockRegex.exec(content)) !== null) {
      matches.push({
        code: match[2].trim(),
        language: match[1] as 'python' | 'javascript' | 'html'
      });
    }
    
    return matches;
  };

  const getProgressIcon = (progress: string) => {
    switch (progress) {
      case 'completed':
        return <CheckCircle className="h-5 w-5 text-green-600" />;
      case 'started':
        return <Clock className="h-5 w-5 text-yellow-600" />;
      default:
        return <Circle className="h-5 w-5 text-gray-400" />;
    }
  };

  const getProgressColor = (progress: string) => {
    switch (progress) {
      case 'completed':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'started':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      default:
        return 'bg-gray-100 text-gray-600 border-gray-200';
    }
  };

  // Check if activity is selectable (not completed)
  const isActivitySelectable = (activity: DashboardActivity): boolean => {
    return activity.progress === 'not started' || activity.progress === 'started';
  };

  // Fetch all dashboard activities with category = 'Coding'
  const fetchAllCodingActivities = async () => {
    if (!user?.id) return;

    try {
      const { data, error } = await supabase
        .from('dashboard')
        .select('*')
        .eq('user_id', user.id)
        .eq('category_activity', 'Coding')
        .order('updated_at', { ascending: false });

      if (error) throw error;
      setAllCodingActivities(data || []);
    } catch (err) {
      console.error('Error fetching coding activities:', err);
      setAllCodingActivities([]);
    }
  };

// Fetch learning module description and AI instructions
const fetchActivityDetails = async (learningModuleId: string) => {
  try {
    const { data, error } = await supabase
      .from('learning_modules')
      .select('title, description, ai_facilitator_instructions, ai_assessment_instructions, metrics_for_success')
      .eq('learning_module_id', learningModuleId)
      .single();

    if (error) {
      console.error('Error fetching activity details:', error);
      throw error;
    }
    
    return {
      title: data?.title || 'this learning activity',
      description: data?.description || 'No description available.',
      aiInstructions: data?.ai_facilitator_instructions || `You are a helpful coding assistant guiding a student through the "${data?.title || learningModuleId}" learning activity. Be encouraging, patient, and provide step-by-step guidance. Ask questions to check understanding and provide hints when needed.`,
      assessmentInstructions: data?.ai_assessment_instructions || `Based on the conversation history, evaluate the student's performance in this learning activity. Consider their engagement, understanding, effort, and progress. Provide a score from 0-100 and brief evidence justifying the score.`,
      successMetrics: data?.metrics_for_success || 'Evaluate based on student engagement, understanding of concepts, quality of responses, and overall learning progress.'
    };
  } catch (err) {
    console.error('Error fetching activity details:', err);
    return {
      title: 'this learning activity',
      description: 'Description could not be loaded.',
      aiInstructions: `You are a helpful coding assistant. Guide the student through this learning activity with patience and encouragement. Ask questions to check their understanding and provide helpful feedback.`,
      assessmentInstructions: `Based on the conversation history, evaluate the student's performance in this learning activity. Consider their engagement, understanding, effort, and progress.`,
      successMetrics: 'Evaluate based on student engagement, understanding of concepts, quality of responses, and overall learning progress.'
    };
  }
};

  // Assessment API call
  const callAssessmentAI = async (chatHistory: ChatMessage[], assessmentInstructions: string, successMetrics: string) => {
    try {
      console.log('[Assessment] Making assessment API call via serverless function');
      
      // Create assessment prompt with both assessment instructions and success metrics
      const chatHistoryText = chatHistory.slice(1).map(msg => 
        `${msg.role === 'assistant' ? 'AI Assistant' : 'Student'}: ${msg.content}`
      ).join('\n\n');

      const assessmentPrompt = `Assessment Instructions:
${assessmentInstructions}

Success Metrics for Evaluation:
${successMetrics}

Please evaluate the student's performance based on the above assessment instructions and success metrics. Use the conversation history below to make your evaluation.

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

      const messages = [
        {
          role: 'user' as const,
          content: assessmentPrompt
        }
      ];

      const systemMessage = 'You are an AI assessment evaluator. Respond only with valid JSON containing evaluation_score and evaluation_evidence.';

      console.log('[Assessment] Assessment Instructions:', assessmentInstructions);
      console.log('[Assessment] Success Metrics:', successMetrics);
      console.log('[Assessment] Sending assessment request to serverless API');

      // Use chatJSON instead of direct OpenAI API call
      const assessment = await chatJSON({
        page: 'VibeCodingPage',
        messages,
        system: systemMessage,
        max_tokens: 300,
        temperature: 0.3,
      });

      console.log('[Assessment] API response:', assessment);
      
      // Validate response structure
      if (typeof assessment.evaluation_score !== 'number' || typeof assessment.evaluation_evidence !== 'string') {
        throw new Error('Invalid assessment format from API');
      }
      
      // Ensure score is within valid range
      assessment.evaluation_score = Math.max(0, Math.min(100, assessment.evaluation_score));
      
      return assessment;
      
    } catch (error) {
      console.error('[Assessment] Error:', error);
      
      // Return fallback assessment
      return {
        evaluation_score: 0,
        evaluation_evidence: `Assessment could not be completed due to technical issues: ${error.message}`
      };
    }
  };

  // Update activity evaluation in database
  const updateActivityEvaluation = async (activityId: string, evaluationScore: number, evaluationEvidence: string, chatHistory: ChatMessage[]) => {
    try {
      // Determine if activity should be marked as completed (score > 84.95)
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
        .eq('id', activityId);

      if (error) throw error;
      
      // Update local state
      setAllCodingActivities(prev => 
        prev.map(activity => 
          activity.id === activityId 
            ? { 
                ...activity, 
                evaluation_score: evaluationScore, 
                evaluation_evidence: evaluationEvidence,
                progress: newProgress as 'not started' | 'started' | 'completed'
              }
            : activity
        )
      );

      // Update selected activity
      if (selectedActivity && selectedActivity.id === activityId) {
        setSelectedActivity(prev => prev ? {
          ...prev,
          evaluation_score: evaluationScore,
          evaluation_evidence: evaluationEvidence,
          progress: newProgress as 'not started' | 'started' | 'completed'
        } : null);
      }
      
      // Show confetti if completed
      if (shouldComplete) {
        setShowConfetti(true);
        // Hide confetti after 4 seconds
        setTimeout(() => setShowConfetti(false), 4000);
      }
      
    } catch (err) {
      console.error('Error updating activity evaluation:', err);
      throw err;
    }
  };

  // Update chat history in database
  const updateChatHistory = async (activityId: string, chatHistory: ChatMessage[]) => {
    try {
      const { error } = await supabase
        .from('dashboard')
        .update({ 
          chat_history: JSON.stringify(chatHistory),
          updated_at: new Date().toISOString()
        })
        .eq('id', activityId);

      if (error) throw error;
    } catch (err) {
      console.error('Error updating chat history:', err);
    }
  };

  // Enhanced OpenAI call with code execution context and different modes
  const callEnhancedOpenAI = async (
    userMessage: string, 
    chatHistory: ChatMessage[], 
    aiInstructions: string,
    lastExecution?: CodeExecution,
    mode: 'code' | 'ideas' | 'critique' = 'code'
  ) => {
    try {
      console.log('[Enhanced AI] Making API call via serverless function');

      let contextMessage = userMessage;
      let finalInstructions = aiInstructions;
      let messages: any[] = [];
      
      // Use different instructions and message structure for each mode
      if (mode === 'critique') {
        finalInstructions = `You are an AI assistant that evaluates the quality of user-provided instructions intended for AI-generated code (Vibe coding). Your role is to help the user improve their instructions—not to generate code or solutions. 

Your response should:
- Identify unclear, vague, or missing elements in the instructions.
- Suggest ways the user can make their intent more precise or testable.
- Encourage iterative refinement of the instructions.
- Never provide code, syntax, or implementation solutions.
Be constructive, concise, and focused on helping the user clarify and improve their instructions.`;

        // For critique mode, only use the latest user message
        messages = [
          {
            role: 'user' as const,
            content: userMessage
          }
        ];
      } else if (mode === 'ideas') {
        finalInstructions = `You are a helpful coding mentor providing concise ideas and recommendations. 

IMPORTANT INSTRUCTIONS FOR IDEAS MODE:
- Do NOT write any code or provide code examples
- Provide short, actionable recommendations and ideas
- Keep responses concise (2-4 sentences max)
- Focus on concepts, approaches, and suggestions rather than implementation
- Ask clarifying questions to understand what the student wants to build
- Suggest different approaches or features they could consider
- Provide creative inspiration and direction
- Help them think through the problem before jumping into coding

The student is exploring ideas for: ${aiInstructions.includes('learning activity') ? 'their coding project' : 'a coding project'}. 
Help them brainstorm and refine their ideas before they start coding.`;

        messages = [
          ...chatHistory.slice(1).map(msg => ({
            role: msg.role,
            content: msg.content
          })),
          {
            role: 'user' as const,
            content: contextMessage
          }
        ];
      } else {
        finalInstructions = getEnhancedAIInstructions(aiInstructions, userGradeLevel);
        
        // Add execution results to context if available
        if (lastExecution) {
          contextMessage += `\n\n[EXECUTION RESULTS]`;
          contextMessage += `\nCode executed: ${lastExecution.code}`;
          contextMessage += `\nLanguage: ${lastExecution.language}`;
          
          if (lastExecution.output) {
            contextMessage += `\nOutput: ${lastExecution.output}`;
          }
          
          if (lastExecution.error) {
            contextMessage += `\nError: ${lastExecution.error}`;
          }
          
          if (lastExecution.executionTime) {
            contextMessage += `\nExecution time: ${lastExecution.executionTime}ms`;
          }
          
          contextMessage += `\n[END EXECUTION RESULTS]\n\nPlease analyze these results and help the student understand what happened. If there were errors, help debug them. If it worked, suggest improvements or next steps.`;
        }

        messages = [
          ...chatHistory.slice(1).map(msg => ({
            role: msg.role,
            content: msg.content
          })),
          {
            role: 'user' as const,
            content: contextMessage
          }
        ];
      }

      // Use chatText instead of direct OpenAI API call
      const response = await chatText({
        page: 'VibeCodingPage',
        messages,
        system: finalInstructions,
        max_tokens: mode === 'ideas' ? 300 : mode === 'critique' ? 400 : 2000,
        temperature: mode === 'ideas' ? 0.8 : mode === 'critique' ? 0.6 : 0.7,
      });

      return response || 'I apologize, but I encountered an issue generating a response. Please try again.';
      
    } catch (error) {
      console.error('[Enhanced AI] Error calling serverless API:', error);
      return `I apologize, but I encountered a technical issue: ${error.message}. Please try again.`;
    }
  };

  // Execute code from AI response
  const executeCodeFromResponse = async (aiResponse: string): Promise<CodeExecution | null> => {
    const codeBlocks = extractCodeBlocks(aiResponse);
    
    if (codeBlocks.length === 0) {
      return null;
    }
    
    // Execute the first code block found
    const { code, language } = codeBlocks[0];
    // Also populate the Monaco editor with the extracted code
    setEditorCode(code);
    setEditorLanguage(language);
    setExecuting(true);
    
    try {
      const execution = await CodeExecutionService.executeCode(code, language);
      setCodeHistory(prev => [...prev, execution]);
      setLatestExecution(execution);
      
      // Show console pop-up after successful execution
      setShowConsole(true);
      
      return execution;
    } catch (error) {
      console.error('Code execution error:', error);
      return null;
    } finally {
      setExecuting(false);
    }
  };

  // Handle evaluation button click
  const handleUpdateEvaluation = async () => {
    if (!selectedActivity || chatHistory.length <= 1) {
      alert('No conversation history available for evaluation.');
      return;
    }

    setEvaluating(true);
    
    try {
      // Call assessment AI with success metrics

      const assessment = await callAssessmentAI(chatHistory, aiAssessmentInstructions, successMetrics);
      
      // Update database
      await updateActivityEvaluation(
        selectedActivity.id, 
        assessment.evaluation_score, 
        assessment.evaluation_evidence,
        chatHistory
      );
      
      // Show evaluation results in modal
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

  // ENHANCED: Handle message submission with different modes and voice integration
  const handleSubmitMessage = async (mode: 'code' | 'critique' | 'ideas' = 'ideas') => {
    if (!userInput.trim() || submitting || !selectedActivity) return;
  
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
  
    // Add user message to chat
    const updatedChatHistory = [...chatHistory, userMessage];
    setChatHistory(updatedChatHistory);
    
    // Update chat history in database after user message
    await updateChatHistory(selectedActivity.id, updatedChatHistory);
    
    const currentInput = userInput;
    setUserInput('');
    setSubmitting(true);
  
    try {
      // Get AI response with appropriate mode
      const aiResponse = await callEnhancedOpenAI(currentInput, chatHistory, aiFacilitatorInstructions, undefined, mode);
      
      let execution: CodeExecution | null = null;
      
      // Only execute code if in code mode and AI response contains code
      if (mode === 'code' && extractCodeBlocks(aiResponse).length > 0) {
        execution = await executeCodeFromResponse(aiResponse);
        
        if (execution) {
          // Get follow-up AI response analyzing the execution results
          const followUpResponse = await callEnhancedOpenAI(
            execution.error ? 
              "Please analyze the execution results above and help debug the error." :
              "Please analyze the execution results above, explain what the code does, and ask the student what improvements they'd like to see (colors, layout, features, animations, etc.).",
            [...chatHistory, userMessage],
            aiFacilitatorInstructions,
            execution,
            'code'
          );
          
          const aiMessage: ChatMessage = {
            role: 'assistant',
            content: `${aiResponse}\n\n**Code Execution Results:**\n\n${followUpResponse}`,
            timestamp: new Date(),
            codeExecution: execution
          };
          
          const finalChatHistory = [...updatedChatHistory, aiMessage];
          setChatHistory(finalChatHistory);
          
          // TTS — critique mode only (code mode: students should focus on reading)
          if (voiceOutputEnabled && mode === 'critique') {
            hookSpeak(followUpResponse);
            // voice input restart handled by prevIsSpeaking useEffect
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
          await updateChatHistory(selectedActivity.id, finalChatHistory);
        } else {
          // No code to execute, just add the AI response
          const aiMessage: ChatMessage = {
            role: 'assistant',
            content: aiResponse,
            timestamp: new Date()
          };
          
          const finalChatHistory = [...updatedChatHistory, aiMessage];
          setChatHistory(finalChatHistory);
          
          // TTS disabled for code mode
          if (voiceOutputEnabled && mode === 'critique') {
            hookSpeak(aiResponse);
            // voice input restart handled by prevIsSpeaking useEffect
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
          await updateChatHistory(selectedActivity.id, finalChatHistory);
        }
      } else {
        // Regular AI response without code execution (critique, ideas, or no code in response)
        const aiMessage: ChatMessage = {
          role: 'assistant',
          content: aiResponse,
          timestamp: new Date()
        };
        
        const finalChatHistory = [...updatedChatHistory, aiMessage];
        setChatHistory(finalChatHistory);
        
        // TTS only for critique mode
        if (voiceOutputEnabled && mode === 'critique') {
          hookSpeak(aiResponse);
          // voice input restart handled by prevIsSpeaking useEffect
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
        await updateChatHistory(selectedActivity.id, finalChatHistory);
      }
    } catch (error) {
      console.error('Error in message submission:', error);
      
      const errorMessage: ChatMessage = {
        role: 'assistant',
        content: 'I apologize, but I encountered a technical issue. Please try again.',
        timestamp: new Date()
      };
      
      const errorChatHistory = [...updatedChatHistory, errorMessage];
      setChatHistory(errorChatHistory);
      
      // Update chat history in database after error message
      await updateChatHistory(selectedActivity.id, errorChatHistory);
  
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
      setSubmitting(false);
    }
  };

  // Update activity status to 'started'
  const updateActivityStatus = async (activityId: string) => {
    try {
      const { error } = await supabase
        .from('dashboard')
        .update({ 
          progress: 'started',
          updated_at: new Date().toISOString()
        })
        .eq('id', activityId);

      if (error) throw error;
      
      setAllCodingActivities(prev => 
        prev.map(activity => 
          activity.id === activityId 
            ? { ...activity, progress: 'started' as const }
            : activity
        )
      );
    } catch (err) {
      console.error('Error updating activity status:', err);
    }
  };

  // Handle direct category selection (go straight to AI assistant)
  const handleCategorySelect = async (category: any) => {
    if (!category.activity || !isActivitySelectable(category.activity)) return;

    setSelectedActivity(category.activity);
    
    // NEW: Fetch user's profile (grade level and continent) if not already loaded
    if ((userGradeLevel === null || userContinent === null) && user?.id) {
      const profile = await fetchUserProfile(user.id);
      setUserGradeLevel(profile.gradeLevel);
      setUserContinent(profile.continent);
      if (profile.continent === 'Africa') setVoiceMode('pidgin');
      else setVoiceMode('english');
    }
    
    if (category.activity.progress === 'not started') {
      await updateActivityStatus(category.activity.id);
    }

    // Load stored chat history if activity was already started
    let initialChatHistory: ChatMessage[] = [];
    if (category.activity.progress === 'started' && category.activity.chat_history) {
      try {
        const storedHistory = JSON.parse(category.activity.chat_history);
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

    const categoryDescription = category.description;

    if (category.activity.learning_module_id) {
      const details = await fetchActivityDetails(category.activity.learning_module_id);
      setActivityDescription(details.description);
      setModuleTitle(details.title);
      setAiFacilitatorInstructions(details.aiInstructions);
      setAiAssessmentInstructions(details.assessmentInstructions);
      setSuccessMetrics(details.successMetrics);
      
      // Use stored chat history if available, otherwise create welcome message
      if (initialChatHistory.length > 0) {
        setChatHistory(initialChatHistory);
      } else {
        setChatHistory([
          {
            role: 'assistant',
            content: `All righty! 🎵 Let's get this vibe coding adventure started for **${details.title}**! 

All you have to do is provide me what you are trying to create. I build the code. Then you test it. Let's develop code for **${categoryDescription}**.

What specifically would you like to build code to do? 🚀✨`,
            timestamp: new Date()
          }
        ]);
      }
    } else {
      setActivityDescription('No description available.');
      setModuleTitle(category.activity.title);
      
      // Use learner-appropriate instructions as fallback
      const gradeInstructions = getLearnerAppropriateLanguageInstructions(userGradeLevel);
      setAiFacilitatorInstructions(`${gradeInstructions}\n\nYou are a helpful coding assistant helping students learn through creative, practical projects. Make coding fun and engaging!`);
      setAiAssessmentInstructions('Based on the conversation history, evaluate the student\'s performance in this coding activity. Consider their engagement, understanding, effort, and progress. Provide a score from 0-100 and brief evidence justifying the score.');
      setSuccessMetrics('Evaluate based on student engagement, understanding of coding concepts, quality of code solutions, creativity, and overall learning progress.');
      
      // Use stored chat history if available, otherwise create welcome message
      if (initialChatHistory.length > 0) {
        setChatHistory(initialChatHistory);
      } else {
        setChatHistory([
          {
            role: 'assistant',
            content: `All righty! 🎵 Let's get this vibe coding adventure started for **${category.activity.title}**! 

All you have to do is provide me what you are trying to create. I build the code. Then you test it. Let's develop code for **${categoryDescription}**.

What specifically would you like to build code to do? 🚀✨`,
            timestamp: new Date()
          }
        ]);
      }
    }
  };

  // Handle back to overview
  const handleBackToOverview = () => {
    setSelectedActivity(null);
    setActivityDescription('');
    setModuleTitle('');
    setAiFacilitatorInstructions('');
    setAiAssessmentInstructions('');
    setSuccessMetrics('');
    setChatHistory([]);
    setUserInput('');
    setCodeHistory([]);
    setShowConsole(false);
    setLatestExecution(null);
    setShowHTMLPreview(false);
    setPreviewCode('');
    setShowEvaluationModal(false);
    setEvaluationResult(null);
    setShowVibePrompt(false);
    setVibePrompt('');
    setStringletUrl(null);
    setStringletError(null);
  };

  // ── Generate Vibe Coding Prompt ───────────────────────────────────────
  const handleGenerateVibePrompt = async () => {
    if (chatHistory.length < 2) return;
    setGeneratingVibePrompt(true);
    setShowVibePrompt(true);
    setVibePrompt('');
    try {
      const conversation = chatHistory
        .map(m => `${m.role === 'user' ? 'Student' : 'Coach'}: ${m.content}`)
        .join('\n\n');
      const codeContext = editorCode && editorCode.trim() !== '# Start coding here...'
        ? `\n\nCurrent code in editor (${editorLanguage}):\n\`\`\`${editorLanguage}\n${editorCode.slice(0, 800)}\n\`\`\``
        : '';

      const prompt = await chatText({
        page: 'VibeCodingPage',
        messages: [{
          role: 'user',
          content: `You are a vibe coding expert. A student has been working with an AI coding coach. Based on their conversation, create a clear, reusable VIBE CODING PROMPT that captures exactly what they want to build.

A vibe coding prompt should:
- Describe the project idea clearly in 2-4 sentences
- Specify the technology (HTML/CSS/JS, Python, etc.)
- List the key features and behaviours they discussed
- Include any specific design preferences (colours, style, layout) mentioned
- Be written so that ANY AI coding assistant (ChatGPT, Claude, Cursor, etc.) could immediately start building it
- Start with "Build me a..." or "Create a..."

CONVERSATION:
${conversation}${codeContext}

Write ONLY the vibe coding prompt — no explanation, no preamble. Make it specific, actionable, and complete.`,
        }],
        system: 'You write precise, detailed vibe coding prompts. Output only the prompt itself.',
        max_tokens: 500,
        temperature: 0.4,
      });
      setVibePrompt(prompt.trim());
    } catch (err) {
      setVibePrompt('Could not generate prompt. Please try again.');
    } finally {
      setGeneratingVibePrompt(false);
    }
  };

  // ── Host on Stringlet ─────────────────────────────────────────────────
  const handleHostOnStringlet = async () => {
    const isWeb = editorLanguage === 'html' || (editorLanguage === 'javascript' && CodeExecutionService.detectWebCode(editorCode, editorLanguage));
    const htmlToHost = editorLanguage === 'html'
      ? editorCode
      : CodeExecutionService.generateHTMLForJS(editorCode);

    if (!htmlToHost.trim()) return;
    setHostingToStringlet(true);
    setStringletError(null);
    setStringletUrl(null);

    try {
      // Stringlet API: POST the HTML, get back a public URL
      const res = await fetch('https://api.stringlet.io/v1/pages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ html: htmlToHost, name: selectedActivity?.title || 'My Vibe Coding Project' }),
      });
      if (!res.ok) throw new Error(`Stringlet error: ${res.status}`);
      const data = await res.json();
      const url = data.url || data.page_url || data.link;
      if (!url) throw new Error('No URL returned from Stringlet');
      setStringletUrl(url);
    } catch (err: any) {
      setStringletError(err.message || 'Hosting failed. Please try again.');
    } finally {
      setHostingToStringlet(false);
    }
  };

  // Handle Enter key in input
  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmitMessage('ideas');
    }
    if (e.key === 'Escape') {
      setShowConsole(false);
      setShowHTMLPreview(false);
    }
  };

  // Handle ESC key for modals
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowConsole(false);
        setShowHTMLPreview(false);
      }
    };
    
    if (showConsole || showHTMLPreview) {
      window.addEventListener('keydown', handleEsc);
      return () => window.removeEventListener('keydown', handleEsc);
    }
  }, [showConsole, showHTMLPreview]);

  // Generate dynamic categories based on actual data with updated icons and descriptions
  const dynamicCategories = React.useMemo(() => {
    /* 1. Build a de‑duplicated list of the sub_category values that
          actually exist in the dashboard rows */
    const uniqueSubCategories: string[] = [
      ...new Set(
        allCodingActivities
          .map(a => a.sub_category ?? '')
          .filter((s): s is string => Boolean(s))
      ),
    ];

    /* 2. Icon helper – keep your existing iconMap here */
    const getIconForCategory = (subCat: string) => {
      const iconMap: Record<string, React.ReactElement> = {
        // … your existing icon mappings …
      };
      return iconMap[subCat] || <Code className="h-6 w-6" />;
    };

    /* 3. Description helper – keep your existing descMap here */
    const getDescriptionForCategory = (subCat: string) => {
      const descMap: Record<string, string> = {
        // … your existing description mappings …
      };
      return descMap[subCat] || `${subCat} coding activities`;
    };

    /* 4. Convert each distinct sub_category into a UI category object */
    return uniqueSubCategories.map(subCat => {
      const categoryId = subCat
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-');

      const activity = allCodingActivities.find(
        a => a.sub_category === subCat
      );

      return {
        id: categoryId,
        title: subCat,
        subCategory: subCat,
        icon: getIconForCategory(subCat),
        description: getDescriptionForCategory(subCat),
        activity,          // the actual dashboard row (if any)
      };
    });
  }, [allCodingActivities]);

  // Initial load
  useEffect(() => {
    if (user?.id) {
      setLoading(true);
      
      // Fetch activities, user profile, and personality baseline in parallel
      Promise.all([
        fetchAllCodingActivities(),
        fetchUserProfile(user.id)
      ]).then(([_, profile]) => {
        setUserGradeLevel(profile.gradeLevel);
        setUserContinent(profile.continent);
        if (profile.continent === 'Africa') setVoiceMode('pidgin');
        else setVoiceMode('english');

        fetchPersonalityBaseline(user.id);
      }).finally(() => setLoading(false));
    }
  }, [user?.id]);

  const fetchPersonalityBaseline = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('user_personality_baseline')
        .select('communication_strategy, learning_strategy')
        .eq('user_id', userId)
        .single();

      if (error) {
        console.log('[Code] No personality baseline found yet (normal for new users)');
        return;
      }

      setPersonalityBaseline({
        communicationStrategy: data?.communication_strategy || null,
        learningStrategy: data?.learning_strategy || null
      });
      console.log('[Code] Personality baseline loaded');
    } catch (err) {
      console.log('[Code] Baseline fetch skipped:', err);
    }
  };

  // Refresh dashboard data
  const refreshDashboard = async () => {
    if (!user?.id) return;

    try {
      setRefreshing(true);
      
      const { error: refreshError } = await supabase.rpc('refresh_user_dashboard', {
        user_id_param: user.id
      });

      if (refreshError) throw refreshError;
      await fetchAllCodingActivities();
    } catch (error) {
      console.error('Error refreshing dashboard:', error);
    } finally {
      setRefreshing(false);
    }
  };

  // Render code execution results (inline)
  const renderCodeExecution = (execution: CodeExecution) => (
    <div className="mt-3 p-3 bg-gray-900 rounded-lg text-sm font-mono">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center space-x-2">
          <span className="text-green-400">$ {execution.language}</span>
          {execution.isWebCode && (
            <span className="text-purple-400 text-xs">🎮 Web App</span>
          )}
        </div>
        <div className="flex items-center space-x-2">
          <span className="text-gray-400 text-xs">
            {execution.executionTime ? `${execution.executionTime}ms` : ''}
          </span>
          {execution.isWebCode && !execution.error && (
            <button
              onClick={() => {
                if (execution.language === 'html') {
                  setPreviewCode(execution.code);
                } else {
                  setPreviewCode(CodeExecutionService.generateHTMLForJS(execution.code));
                }
                setShowHTMLPreview(true);
              }}
              className="text-purple-400 hover:text-purple-300 text-xs px-2 py-1 bg-purple-900 bg-opacity-30 rounded"
            >
              🎮 Preview
            </button>
          )}
          <button
            onClick={() => {
              setLatestExecution(execution);
              setShowConsole(true);
            }}
            className="text-blue-400 hover:text-blue-300 text-xs"
          >
            Console
          </button>
        </div>
      </div>
      
      <div className="mb-2 text-yellow-300">
        {execution.code.split('\n').map((line, i) => (
          <div key={i}>{line}</div>
        ))}
      </div>
      
      {execution.output && (
        <div className="text-white">
          <div className="text-green-400 text-xs mb-1">OUTPUT:</div>
          <div className="whitespace-pre-wrap">{execution.output}</div>
        </div>
      )}
      
      {execution.error && (
        <div className="text-red-400">
          <div className="text-red-300 text-xs mb-1">ERROR:</div>
          <div className="whitespace-pre-wrap">{execution.error}</div>
        </div>
      )}
      
      {execution.isWebCode && !execution.error && (
        <div className="mt-2 text-purple-300 text-xs">
          ✨ Interactive web application created! Click Preview to see it in action.
        </div>
      )}
    </div>
  );

  if (loading) {
    return (
      <AppLayout>
        {/* DEBUG BANNER — remove after confirming file loads */}
        <div style={{ background: '#7c3aed', color: '#fff', padding: '8px 16px', fontWeight: 'bold', fontSize: '13px', borderRadius: '6px', margin: '8px' }}>
          ✅ CodeAssistantPage v3 LOADED — {new Date().toLocaleTimeString()}
        </div>
        <p className="text-gray-600">Loading your vibing activities...</p>
      </AppLayout>
    );
  }
  
  if (dynamicCategories.length === 0) {
    return (
      <AppLayout>
        <p className="text-gray-600">No coding activities available</p>
      </AppLayout>
    );
  }

  // Enhanced Activity Learning Interface with Voice Features
  if (selectedActivity) {
    return (
      <AppLayout>
        {/* Confetti Animation */}
        {showConfetti && <ConfettiAnimation />}
        
        <div className="min-h-screen">
          <div 
            className="fixed top-16 left-64 right-0 bottom-0 opacity-80"
            style={{
              backgroundImage: 'url("/girls_coding.png")',
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              backgroundRepeat: 'no-repeat',
              zIndex: 0
            }}
          ></div>
          <div className="relative z-10 pl-0 pr-6 py-8 -ml-48">
            {/* Header with Back Button */}
            <div className="mb-6 flex items-center justify-between">
              <div className="inline-flex flex-col items-start gap-1 rounded-lg bg-pink-200 p-4 backdrop-blur-sm">
                <div className="flex items-center gap-2">
                  <Code className="h-8 w-8 text-purple-900" />
                  <h1 className="text-3xl font-extrabold text-gray-900">
                    {moduleTitle || selectedActivity.title} 🎵
                  </h1>
                </div>
                <p className="text-gray-800">
                  Interactive Coding & Execution
                </p>
              </div>

              <div className="flex items-center space-x-4">
                {/* Console Toggle Button */}
                {codeHistory.length > 0 && (
                  <Button
                    onClick={() => setShowConsole(true)}
                    variant="outline"
                    size="sm"
                    icon={<Terminal size={16} />}
                  >
                    Open Console
                  </Button>
                )}
                
                <Button
                  onClick={handleBackToOverview}
                  size="sm"
                  icon={<ArrowLeft size={16} />}
                  className="bg-pink-500 text-purple-900 hover:bg-purple-900 hover:text-pink-200 rounded-full px-6 py-2 border-0"
                >
                  Back to Vibing Menu
                </Button>
              </div>
            </div>

            {/* Activity Info Panel */}
            <div className="mb-8 bg-white rounded-lg shadow-md p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-3">Activity Overview</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div><strong>Title:</strong> {moduleTitle || selectedActivity.title}</div>
                <div><strong>Category:</strong> {selectedActivity.sub_category}</div>
                <div><strong>Status:</strong> 
                  <span className={classNames(
                    'ml-2 px-2 py-1 rounded text-sm',
                    getProgressColor(selectedActivity.progress)
                  )}>
                    {selectedActivity.progress}
                  </span>
                </div>
              </div>
              
              {selectedActivity.evaluation_score && (
                <div className="mt-4">
                  <strong>Current Score:</strong> 
                  <span className="ml-2 text-lg font-semibold text-green-600">
                    {selectedActivity.evaluation_score}/100
                  </span>
                </div>
              )}
              
              {selectedActivity.evaluation_evidence && (
                <div className="mt-4">
                  <strong>Last Evaluation:</strong> 
                  <p className="mt-1 text-gray-700 bg-gray-50 rounded p-2">
                    {selectedActivity.evaluation_evidence}
                  </p>
                </div>
              )}
              
              <div className="mt-4">
                <strong>Description:</strong>
                <p className="mt-1 text-gray-700">{activityDescription}</p>
              </div>
              
              {/* Evaluation Section */}
              <div className="mt-6 pt-4 border-t border-gray-200">
                <p className="text-sm text-gray-600 text-center mb-3">
                  At the end of a session, select the "Update Evaluation" button to get an assessment of your effort on this activity.
                </p>
                <div className="flex justify-center">
                  <Button
                    onClick={handleUpdateEvaluation}
                    disabled={evaluating || chatHistory.length <= 1}
                    className="bg-pink-500 text-pink-200 hover:bg-purple-900 text-pink-200 rounded-full px-6 py-2 font-normal"
                    icon={<Star size={16} />}
                    isLoading={evaluating}
                  >
                    Update Evaluation
                  </Button>
                </div>
              </div>
            </div>




            {/* Main Content Grid: Chat left, Monaco Editor right */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Chat Area */}
              <div className="bg-white rounded-lg shadow-md flex flex-col" style={{ height: '600px' }}>
                <div className="p-4 border-b">
                  <h3 className="text-lg font-semibold text-gray-900 flex items-center">
                    <Bot className="w-5 h-5 mr-2 text-pink-600" />
                    Learning Conversation
                  </h3>
                </div>
                
                <div 
                  ref={chatContainerRef}
                  className="p-4 space-y-4 overflow-y-auto h-96"
                >
                  {chatHistory.map((message, index) => (
                    <div
                      key={index}
                      className={classNames(
                        'flex items-start space-x-3',
                        message.role === 'user' ? 'flex-row-reverse space-x-reverse' : ''
                      )}
                    >
                      <div className={classNames(
                        'flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center',
                        message.role === 'assistant' ? 'bg-pink-100' : 'bg-green-100'
                      )}>
                        {message.role === 'assistant' ? (
                          <Bot className="w-4 h-4 text-pink-600" />
                        ) : (
                          <User className="w-4 h-4 text-green-600" />
                        )}
                      </div>
                      
                      <div className={classNames(
                        'flex-1 max-w-md p-3 rounded-lg',
                        message.role === 'assistant' 
                          ? 'bg-gray-100 text-gray-900' 
                          : 'bg-green-500 text-white'
                      )}>
                        <div className="text-sm">
                          <ReactMarkdown
                            components={{
                              h1: ({node, ...props}) => <h1 style={{color: '#000', backgroundColor: 'transparent', fontWeight: 'bold'}} {...props} />,
                              h2: ({node, ...props}) => <h2 style={{color: '#000', backgroundColor: 'transparent', fontWeight: 'bold'}} {...props} />,
                              h3: ({node, ...props}) => <h3 style={{color: '#000', backgroundColor: 'transparent', fontWeight: 'bold'}} {...props} />,
                              strong: ({node, ...props}) => <strong style={{color: '#000', backgroundColor: 'transparent', fontWeight: 'bold'}} {...props} />,
                              ul: ({node, ...props}) => <ul style={{color: '#000', backgroundColor: 'transparent'}} {...props} />,
                              ol: ({node, ...props}) => <ol style={{color: '#000', backgroundColor: 'transparent'}} {...props} />,
                              li: ({node, ...props}) => <li style={{color: '#000', backgroundColor: 'transparent'}} {...props} />,
                              p: ({node, ...props}) => <p style={{color: '#000', backgroundColor: 'transparent'}} {...props} />,
                              code: ({node, ...props}) => <code style={{color: '#000', backgroundColor: 'transparent'}} {...props} />,
                            }}
                          >
                            {message.content}
                          </ReactMarkdown>
                        </div>
                        
                        {message.codeExecution && renderCodeExecution(message.codeExecution)}
                        
                        <p className={classNames(
                          'text-xs mt-2',
                          message.role === 'assistant' ? 'text-gray-500' : 'text-green-100'
                        )}>
                          {message.timestamp.toLocaleTimeString()}
                        </p>
                      </div>
                    </div>
                  ))}
                  
                  {(submitting || executing) && (
                    <div className="flex items-start space-x-3">
                      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-pink-100 flex items-center justify-center">
                        <Bot className="w-4 h-4 text-pink-600" />
                      </div>
                      <div className="bg-gray-100 text-gray-900 p-3 rounded-lg">
                        <div className="flex items-center space-x-2">
                          <div className="flex space-x-1">
                            <div className="w-2 h-2 bg-gray-400 rounded-full animate-pulse"></div>
                            <div className="w-2 h-2 bg-gray-400 rounded-full animate-pulse" style={{ animationDelay: '0.2s' }}></div>
                            <div className="w-2 h-2 bg-gray-400 rounded-full animate-pulse" style={{ animationDelay: '0.4s' }}></div>
                          </div>
                          <span className="text-xs text-gray-600">
                            {executing ? 'Running code...' : 'Thinking...'}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
                
                {/* Text fallback when TTS unavailable (e.g. no network voice in Nigeria) */}
                {fallbackText && (
                  <div className="px-4 py-2">
                    <VoiceFallback text={fallbackText} onDismiss={clearFallback} />
                  </div>
                )}

                {/* NEW: Voice Controls */}
                <div className="flex items-center space-x-4 mb-4 p-4 border-t">
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
                        <span className="text-blue-600 ml-1">
                          {isAfrica ? '🇳🇬 NG' : '🌐'}{selectedVoice.localService ? ' · offline' : ''}
                        </span>
                      </span>
                    </div>
                  )}
                </div>
                
                {/* Enhanced Input Area with Code Execution Buttons and Voice Input */}
                <div className="p-4 border-t">
                  <div className="flex items-end space-x-3">
                    <SpellCheckTextarea
                      value={userInput}
                      onChange={setUserInput}
                      onKeyDown={handleKeyPress}
                      placeholder="Type your response here..."
                      className="w-full p-3 border border-gray-300 rounded-lg resize-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 h-18"
                      disabled={submitting}
                    />
                    <div className="flex flex-col space-y-2">
                      {/* NEW: Voice Input Button */}
                      {voiceInputEnabled && (
                        <Button
                          onClick={startVoiceInput}
                          icon={<Mic size={16} />}
                          className={classNames(
                            "px-4 py-2 text-sm",
                            isListening 
                              ? "bg-red-100 hover:bg-red-200 text-red-800" 
                              : "bg-blue-100 hover:bg-blue-200 text-blue-800"
                          )}
                          disabled={!speechRecognition}
                        >
                          {isListening ? 'Stop' : 'Speak'}
                        </Button>
                      )}
                      
                      <Button
                        onClick={() => handleSubmitMessage('code')}
                        disabled={!userInput.trim() || submitting || executing}
                        className="bg-pink-600 hover:bg-pink-700 text-white px-4 py-2 text-sm"
                        icon={<Play size={16} />}
                      >
                        Code & Run
                      </Button>
                      <Button
                        onClick={() => handleSubmitMessage('critique')}
                        disabled={!userInput.trim() || submitting || executing}
                        className="bg-green-600 hover:bg-green-800 text-white px-4 py-2 text-sm"
                        icon={<MessageSquare size={16} />}
                      >
                        Critique My Vibing
                      </Button>
                      <Button
                        onClick={() => handleSubmitMessage('ideas')}
                        disabled={!userInput.trim() || submitting || executing}
                        className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 text-sm"
                        icon={<Lightbulb size={16} />}
                      >
                        Get Ideas
                      </Button>
                      <Button
                        onClick={handleGenerateVibePrompt}
                        disabled={chatHistory.length < 2 || submitting || executing}
                        className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 text-sm"
                        icon={<Wand2 size={16} />}
                        title="Synthesise your conversation into a reusable vibe coding prompt"
                      >
                        Create Vibe Coding Prompt
                      </Button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Monaco Editor Panel */}
              <div className="bg-gray-900 rounded-lg shadow-md flex flex-col" style={{ height: '600px' }}>
                {/* Toolbar */}
                <div className="flex items-center gap-3 px-4 py-2 bg-gray-800 rounded-t-lg border-b border-gray-700 flex-shrink-0">
                  <Code className="w-4 h-4 text-pink-400" />
                  <span className="text-sm font-medium text-gray-300 flex-1">Code Editor</span>
                  <select
                    value={editorLanguage}
                    onChange={e => setEditorLanguage(e.target.value as 'python' | 'javascript' | 'html')}
                    className="text-xs bg-gray-700 text-gray-300 border border-gray-600 rounded px-2 py-1 focus:outline-none"
                  >
                    <option value="python">Python</option>
                    <option value="javascript">JavaScript</option>
                    <option value="html">HTML</option>
                  </select>
                  <button
                    onClick={async () => {
                      if (!editorCode.trim()) return;
                      setExecuting(true);
                      try {
                        const execution = await CodeExecutionService.executeCode(editorCode, editorLanguage);
                        setCodeHistory(prev => [...prev, execution]);
                        setLatestExecution(execution);
                        setShowConsole(true);
                      } catch (err) { console.error(err); }
                      finally { setExecuting(false); }
                    }}
                    disabled={executing || !editorCode.trim()}
                    className="flex items-center gap-1.5 px-3 py-1 bg-pink-600 hover:bg-pink-700 disabled:opacity-40 text-white text-xs font-semibold rounded transition-colors"
                  >
                    <Play size={12} /> {executing ? 'Running…' : 'Run'}
                  </button>
                  <button
                    onClick={() => {
                      setEditorCode('# Start coding here...\n');
                    }}
                    className="flex items-center gap-1 px-2 py-1 text-gray-500 hover:text-gray-300 hover:bg-gray-700 text-xs rounded transition-colors"
                    title="Clear editor"
                  >
                    <RefreshCw size={11} /> Clear
                  </button>
                  {/* Stringlet — host web code as a live page */}
                  {(editorLanguage === 'html' || (editorLanguage === 'javascript' && editorCode.toLowerCase().includes('<'))) && (
                    <button
                      onClick={handleHostOnStringlet}
                      disabled={hostingToStringlet || !editorCode.trim()}
                      className="flex items-center gap-1.5 px-3 py-1 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white text-xs font-semibold rounded transition-colors"
                      title="Host this web page live on Stringlet"
                    >
                      <Globe size={12} />
                      {hostingToStringlet ? 'Hosting…' : 'Host on Web'}
                    </button>
                  )}
                  {stringletUrl && (
                    <a
                      href={stringletUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 px-2 py-1 bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs rounded hover:bg-emerald-500/30 transition-colors"
                    >
                      <ExternalLink size={11} /> View Live Site
                    </a>
                  )}
                  {stringletError && (
                    <span className="text-red-400 text-xs truncate max-w-32" title={stringletError}>⚠ {stringletError}</span>
                  )}
                </div>

                {/* Monaco */}
                <div className="flex-1 min-h-0">
                  <Editor
                    height="100%"
                    language={editorLanguage}
                    value={editorCode}
                    onChange={v => setEditorCode(v || '')}
                    theme="vs-dark"
                    options={{
                      fontSize: 13,
                      minimap: { enabled: false },
                      padding: { top: 12 },
                      lineNumbers: 'on',
                      wordWrap: 'on',
                      scrollBeyondLastLine: false,
                      automaticLayout: true,
                      tabSize: 2,
                    }}
                  />
                </div>
              </div>
            </div>

            {/* Vibe Coding Prompt Modal */}
            {showVibePrompt && (
              <div className="mt-6 bg-gradient-to-br from-purple-900/40 to-pink-900/20 border border-purple-500/30 rounded-xl shadow-lg">
                <div className="p-4 border-b border-purple-500/20 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Wand2 className="w-5 h-5 text-purple-400" />
                    <h3 className="text-base font-semibold text-white">Your Vibe Coding Prompt</h3>
                  </div>
                  <button onClick={() => setShowVibePrompt(false)} className="text-gray-400 hover:text-white">
                    <X size={18} />
                  </button>
                </div>
                <div className="p-4 space-y-3">
                  <p className="text-xs text-purple-300">
                    This prompt captures what you built in this session. Paste it into any AI coding tool — ChatGPT, Claude, Cursor, Replit — to continue building or start fresh.
                  </p>
                  {generatingVibePrompt ? (
                    <div className="flex items-center gap-3 py-4 text-purple-300">
                      <RefreshCw size={16} className="animate-spin" />
                      <span className="text-sm">Synthesising your session into a vibe coding prompt…</span>
                    </div>
                  ) : (
                    <>
                      <textarea
                        value={vibePrompt}
                        onChange={e => setVibePrompt(e.target.value)}
                        rows={6}
                        className="w-full bg-gray-900/70 border border-purple-500/30 rounded-lg px-4 py-3 text-sm text-gray-100 resize-none focus:outline-none focus:border-purple-400 font-mono leading-relaxed"
                      />
                      <div className="flex items-center gap-3 flex-wrap">
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(vibePrompt);
                            setVibeCopied(true);
                            setTimeout(() => setVibeCopied(false), 2000);
                          }}
                          className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm font-semibold rounded-lg transition-colors"
                        >
                          {vibeCopied ? <><CheckIcon size={15} /> Copied!</> : <><Copy size={15} /> Copy Prompt</>}
                        </button>
                        <button
                          onClick={handleGenerateVibePrompt}
                          className="flex items-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-200 text-sm rounded-lg transition-colors"
                        >
                          <RefreshCw size={14} /> Regenerate
                        </button>
                        <span className="text-xs text-gray-500">
                          Paste this into ChatGPT, Claude, Cursor, or Replit to keep building
                        </span>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* Code History — full width below the grid */}
            {codeHistory.length > 0 && (
              <div className="mt-6 bg-white rounded-lg shadow-md">
                <div className="p-4 border-b flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-gray-900 flex items-center">
                    <FileText className="w-5 h-5 mr-2 text-green-600" />
                    Code History
                  </h3>
                  <span className="text-xs text-gray-400">{codeHistory.length} execution{codeHistory.length !== 1 ? 's' : ''}</span>
                </div>
                <div className="p-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 max-h-64 overflow-y-auto">
                  {codeHistory.slice().reverse().map((execution, index) => (
                    <div key={execution.id} className="border rounded-lg p-3 text-xs">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center space-x-1">
                          <span className="font-medium text-gray-900">{execution.language}</span>
                          {execution.isWebCode && <span className="text-purple-600">🎮</span>}
                        </div>
                        <div className="flex items-center space-x-1">
                          {execution.error
                            ? <AlertCircle className="w-4 h-4 text-red-500" />
                            : <CheckIcon className="w-4 h-4 text-green-500" />}
                          {execution.isWebCode && !execution.error && (
                            <button
                              onClick={() => {
                                setPreviewCode(execution.language === 'html'
                                  ? execution.code
                                  : CodeExecutionService.generateHTMLForJS(execution.code));
                                setShowHTMLPreview(true);
                              }}
                              className="text-purple-600 hover:text-purple-800 text-xs"
                            >Preview</button>
                          )}
                          <button
                            onClick={() => { setLatestExecution(execution); setShowConsole(true); }}
                            className="text-blue-600 hover:text-blue-800 text-xs"
                          >Console</button>
                          <button
                            onClick={() => { setEditorCode(execution.code); setEditorLanguage(execution.language as any); }}
                            className="text-pink-600 hover:text-pink-800 text-xs"
                          >Edit</button>
                          <span className="text-gray-400">{execution.timestamp.toLocaleTimeString()}</span>
                        </div>
                      </div>
                      <div className="bg-gray-900 rounded p-2 font-mono text-yellow-300 mb-2">
                        {execution.code.split('\n').slice(0, 3).map((line, i) => (
                          <div key={i} className="truncate">{line}</div>
                        ))}
                        {execution.code.split('\n').length > 3 && <div className="text-gray-500">…</div>}
                      </div>
                      {execution.output && (
                        <div className="text-green-600 text-xs mb-1">✓ {execution.output.substring(0, 60)}…</div>
                      )}
                      {execution.error && (
                        <div className="text-red-600 text-xs">✗ {execution.error.substring(0, 60)}…</div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Evaluation Results Modal */}
            {showEvaluationModal && evaluationResult && (
              <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                <div className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full mx-4">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className={classNames(
                      "text-xl font-bold flex items-center",
                      evaluationResult.score > 84.95 ? "text-green-600" : "text-gray-900"
                    )}>
                      <Star className={classNames(
                        "h-6 w-6 mr-2",
                        evaluationResult.score > 84.95 ? "text-yellow-500" : "text-yellow-500"
                      )} />
                      {evaluationResult.score > 84.95 ? "🎉 Activity Completed!" : "Evaluation Complete"}
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
                        evaluationResult.score > 84.95 ? "text-green-600" : "text-green-600"
                      )}>
                        {evaluationResult.score}/100
                      </div>
                      <div className="text-sm text-gray-600">
                        {evaluationResult.score > 84.95 ? "Excellent Work!" : "Your Score"}
                      </div>
                      {evaluationResult.score > 84.95 && (
                        <div className="mt-2 text-sm text-green-600 font-semibold">
                          Activity marked as completed!
                        </div>
                      )}
                    </div>
                    
                    <div className="border-t pt-4">
                      <h4 className="font-semibold text-gray-900 mb-2">Assessment Feedback:</h4>
                      <p className="text-gray-700 text-sm leading-relaxed">
                        {evaluationResult.evidence}
                      </p>
                    </div>
                    
                    <div className="flex justify-end pt-4">
                      <Button
                        onClick={() => setShowEvaluationModal(false)}
                        className={classNames(
                          "px-6 py-2 rounded-lg text-white",
                          evaluationResult.score > 84.95 ? "bg-green-600 hover:bg-green-700" : "bg-blue-600 hover:bg-blue-700"
                        )}
                      >
                        {evaluationResult.score > 84.95 ? "Celebrate!" : "Close"}
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Console Modal */}
          <ConsoleModal
            isOpen={showConsole}
            onClose={() => setShowConsole(false)}
            execution={latestExecution}
            allExecutions={codeHistory}
          />

          {/* HTML Preview Modal */}
          <HTMLPreview
            code={previewCode}
            isOpen={showHTMLPreview}
            onClose={() => setShowHTMLPreview(false)}
          />
        </div>
      </AppLayout>
    );
  }

  // Main Vibing Overview Interface - Direct Category Selection
  return (
    <AppLayout>
      {/* DEBUG BANNER — remove after confirming file loads */}
      <div style={{ background: '#7c3aed', color: '#fff', padding: '8px 16px', fontWeight: 'bold', fontSize: '13px', zIndex: 9999, position: 'relative' }}>
        ✅ CodeAssistantPage v3 LOADED — {new Date().toLocaleTimeString()}
      </div>

      {/* Confetti Animation */}
      {showConfetti && <ConfettiAnimation />}
      
      <div className="min-h-screen">
        <div className="pl-0 pr-6 py-12 -ml-48">
          <div 
            className="fixed top-16 left-64 right-0 bottom-0 opacity-80"
            style={{
              backgroundImage: 'url("/girls_coding.png")',
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              backgroundRepeat: 'no-repeat',
              zIndex: 0
            }}
          ></div>
          <div className="relative z-10">
            {/* Header row — Skills Development */}
            <div className="mb-8 flex items-center justify-between">
              {/* Pink info box */}
              <div className="inline-flex flex-col items-start gap-1 rounded-lg bg-pink-100/75 p-4 backdrop-blur-sm">
                <div className="flex items-center gap-2">
                  <Puzzle className="h-8 w-8 text-purple-600" />
                  <h1 className="text-3xl font-extrabold text-gray-900">
                    Vibing - Interactive Coding 🎵
                  </h1>
                </div>
                <p className="text-gray-800">
                  Dive into coding adventures just using your words and logic and create awesome stuff with AI! ✨
                </p>
              </div>

              {/* Refresh button with pale‑pink fill */}
              <Button
                onClick={refreshDashboard}
                variant="outline"
                size="sm"
                icon={<RefreshCw size={16} />}
                isLoading={refreshing}
                className={classNames(
                  'bg-pink-400 text-pink-200',
                  'hover:bg-purple-900 hover:text-pink-200',
                  'border border-pink-200',
                  'disabled:opacity-60'      // optional: keep disabled look
                )}
              >
                Refresh
              </Button>
            </div>
            

            {/* Direct Category Selection Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 2xl:grid-cols-7 gap-4">
              {dynamicCategories.map((category) => {
                const activity = category.activity;
                const isAdvancedComplete = activity && activity.progress === 'completed' && activity.certification_evaluation_score === 3;
                const isSelectable = activity && isActivitySelectable(activity);
                
                return (
                  <button
                    key={category.id}
                    onClick={() => isSelectable && handleCategorySelect(category)}
                    disabled={!isSelectable}
                    className={classNames(
                      'flex flex-col items-start space-y-4 p-4 rounded-lg border transition-all duration-200 text-left',
                      isAdvancedComplete
                        ? 'bg-green-50/80 border border-green-200 text-green-900 opacity-90 cursor-not-allowed'
                        : isSelectable
                        ? 'bg-white hover:shadow-lg hover:border-pink-300 cursor-pointer transform hover:-translate-y-1'
                        : 'bg-gray-50 border-gray-200 cursor-not-allowed opacity-75'
                    )}
                  >
                    <div className={classNames(
                      'p-3 rounded-lg',
                      isAdvancedComplete ? 'bg-green-100' : isSelectable ? 'bg-pink-100' : 'bg-gray-100'
                    )}>
                      <div className={classNames(
                        isAdvancedComplete ? 'text-green-600' : isSelectable ? 'text-pink-600' : 'text-gray-400'
                      )}>
                        {category.icon}
                      </div>
                    </div>
                    
                    <div className="flex-1 w-full">
                      <h3 className="text-base font-bold text-gray-900 mb-2">
                        {category.title}
                      </h3>
                      <p className="text-xs text-gray-600 mb-3">
                        {category.description}
                      </p>
                      
                      {activity && (
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                              Status
                            </span>
                            <span className={classNames(
                              'inline-flex items-center px-2 py-1 rounded-full text-xs font-medium border',
                              getProgressColor(activity.progress)
                            )}>
                              {getProgressIcon(activity.progress)}
                              <span className="ml-1">{activity.progress}</span>
                            </span>
                          </div>
                          
                          {activity.evaluation_score && (
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                                Score
                              </span>
                              <span className="text-sm font-bold text-green-600">
                                {activity.evaluation_score}%
                              </span>
                            </div>
                          )}

                          {isAdvancedComplete && (
                            <div className="mt-3">
                              <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-1 text-xs font-semibold text-green-800 border border-green-200">
                                Advanced • Completed
                              </span>
                            </div>
                          )}
                          
                          <div className="pt-2 border-t border-gray-200">
                            <span className="text-xs text-gray-500">
                              Updated {new Date(activity.updated_at).toLocaleDateString()}
                            </span>
                          </div>
                        </div>
                      )}
                      
                      {isSelectable && (
                        <div className="mt-3 text-center">
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-pink-100 text-pink-800">
                            Click to Start Vibing! 🎵
                          </span>
                        </div>
                      )}
                      
                      {!activity && (
                        <div className="mt-3 text-center">
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                            No Activity Available
                          </span>
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>

            {dynamicCategories.length === 0 && (
              <div className="text-center py-12">
                <Code className="h-16 w-16 text-pink-400 mx-auto mb-4" />
                <h3 className="text-xl font-medium text-gray-900 mb-2">Ready to vibe with code! 🎵</h3>
                <p className="text-gray-600 mb-4">
                  No coding activities found. Click refresh to load your vibing adventures!
                </p>
                <Button
                  onClick={refreshDashboard}
                  icon={<RefreshCw size={16} />}
                  isLoading={refreshing}
                  className="bg-gradient-to-r from-pink-600 to-purple-600 hover:from-pink-700 hover:to-purple-700"
                >
                  Refresh Activities
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  );
};

export default CodeAssistantPage;