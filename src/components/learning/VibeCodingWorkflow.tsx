// VibeCodingWorkflow Component - Pedagogically Sound Vibe Coding Interface
// This replaces the simple code editor with a 4-phase learning workflow

/**
 * VIBE CODING PEDAGOGY:
 * 
 * This isn't about writing code - it's about learning to communicate with AI effectively.
 * 
 * Phase 1: INSTRUCTION WRITING
 * - Student writes plain English description of what they want
 * - Focus: Clarity, completeness, context
 * 
 * Phase 2: INSTRUCTION CRITIQUE (before code exists)
 * - AI evaluates instruction quality using rubric
 * - Scores: Problem Decomposition, Prompt Engineering
 * - Student can improve or proceed anyway (learning from mistakes)
 * 
 * Phase 3: CODE GENERATION & EXECUTION
 * - AI generates code from instructions
 * - Student runs code to see results
 * - Emphasis: Connecting instructions → code → output
 * 
 * Phase 4: DEBUGGING & ITERATION
 * - If errors occur, student works with AI to debug
 * - Focus: AI Output Evaluation, Metacognitive Control
 * - Cycle back to instruction refinement
 */

import React, { useState, useEffect } from 'react';
import { Play, AlertCircle, CheckCircle, Lightbulb, Code2, RefreshCw, Terminal, Sparkles, ChevronRight, Wand2, Globe, ExternalLink, Copy, X } from 'lucide-react';
import Button from '../ui/Button';
import classNames from 'classnames';

interface VibeCodingWorkflowProps {
  onExecuteCode: (code: string, language: 'python' | 'javascript' | 'html') => Promise<{
    output?: string;
    error?: string;
    executionTime?: number;
  }>;
  onGetAICritique: (instructions: string) => Promise<{
    problemDecomposition: { score: number; evidence: string; improvement: string };
    promptEngineering: { score: number; evidence: string; improvement: string };
    recommendation: string;
  }>;
  onGenerateCode: (instructions: string, language: 'python' | 'javascript' | 'html') => Promise<string>;
  onGetDebuggingHelp: (code: string, error: string, instructions: string) => Promise<string>;
  // Injected from the chat/design panel
  injectedInstructions?: string | null;
  onInstructionsInjected?: () => void;
}

type Phase = 'instructions' | 'critique' | 'code' | 'debugging';



export const VibeCodingWorkflow: React.FC<VibeCodingWorkflowProps> = ({
  onExecuteCode,
  onGetAICritique,
  onGenerateCode,
  onGetDebuggingHelp,
  injectedInstructions,
  onInstructionsInjected,
}) => {
  // State management
  const [currentPhase, setCurrentPhase] = useState<Phase>('instructions');
  const [instructions, setInstructions] = useState('');
  const [language, setLanguage] = useState<'python' | 'javascript' | 'html'>('python');
  
  // Phase 2: Critique
  const [critique, setCritique] = useState<any>(null);
  const [loadingCritique, setLoadingCritique] = useState(false);
  
  // Phase 3: Code
  const [generatedCode, setGeneratedCode] = useState('');
  const [loadingCode, setLoadingCode] = useState(false);
  const [executionResult, setExecutionResult] = useState<any>(null);
  const [executing, setExecuting] = useState(false);

  // Phase 4: Debugging
  const [debuggingAdvice, setDebuggingAdvice] = useState('');
  const [loadingDebug, setLoadingDebug] = useState(false);

  // Vibe Coding Prompt
  const [showVibePrompt, setShowVibePrompt] = useState(false);
  const [vibePrompt, setVibePrompt] = useState('');
  const [vibeCopied, setVibeCopied] = useState(false);

  // Stringlet hosting
  const [stringletUrl, setStringletUrl] = useState<string | null>(null);
  const [stringletError, setStringletError] = useState<string | null>(null);

  // AI-improved instructions state
  const [improvingWithAI, setImprovingWithAI] = useState(false);
  const [improvingFromResults, setImprovingFromResults] = useState(false);
  const [showImprovedPromptPanel, setShowImprovedPromptPanel] = useState(false);

  // Consume injected prompt from the design chat panel
  useEffect(() => {
    if (injectedInstructions) {
      setInstructions(injectedInstructions);
      setCurrentPhase('instructions');
      setCritique(null);
      setGeneratedCode('');
      setExecutionResult(null);
      setShowImprovedPromptPanel(false);
      onInstructionsInjected?.();
    }
  }, [injectedInstructions]);

  // Phase 1: Get critique of instructions
  const handleCritiqueInstructions = async () => {
    if (!instructions.trim()) {
      alert('Please write instructions first');
      return;
    }

    setLoadingCritique(true);
    try {
      const critiqueResult = await onGetAICritique(instructions);
      setCritique(critiqueResult);
      setCurrentPhase('critique');
    } catch (error) {
      console.error('Error getting critique:', error);
      alert('Failed to get critique. Please try again.');
    } finally {
      setLoadingCritique(false);
    }
  };

  // Phase 2 → 3: Generate code (after improving or proceeding)
  const handleGenerateCode = async (skipToCode: boolean = false) => {
    setLoadingCode(true);
    try {
      const code = await onGenerateCode(instructions, language);
      setGeneratedCode(code);
      setCurrentPhase('code');
      setExecutionResult(null); // Clear previous results
    } catch (error) {
      console.error('Error generating code:', error);
      alert('Failed to generate code. Please try again.');
    } finally {
      setLoadingCode(false);
    }
  };

  // Phase 3: Execute code
  const handleRunCode = async () => {
    if (!generatedCode.trim()) return;

    // HTML can't be executed server-side — direct to Open as Web Page
    if (language === 'html' || codeContainsHTML(generatedCode)) {
      setExecutionResult({
        output: '✅ Your HTML page is ready! Click "Open as Web Page" to view and interact with it in your browser.',
        executionTime: 0,
        isHTML: true,
      });
      return;
    }

    setExecuting(true);
    try {
      const result = await onExecuteCode(generatedCode, language);
      setExecutionResult(result);
    } catch (error) {
      console.error('Error executing code:', error);
      setExecutionResult({
        error: 'Execution failed: ' + error.message,
        executionTime: 0
      });
    } finally {
      setExecuting(false);
    }
  };

  // Phase 4: Get debugging help
  const handleGetDebuggingHelp = async () => {
    if (!executionResult?.error) return;

    setLoadingDebug(true);
    try {
      const advice = await onGetDebuggingHelp(generatedCode, executionResult.error, instructions);
      setDebuggingAdvice(advice);
    } catch (error) {
      console.error('Error getting debugging help:', error);
      alert('Failed to get debugging help. Please try again.');
    } finally {
      setLoadingDebug(false);
    }
  };

  // Reset workflow
  const handleStartOver = () => {
    setCurrentPhase('instructions');
    setInstructions('');
    setCritique(null);
    setGeneratedCode('');
    setExecutionResult(null);
    setDebuggingAdvice('');
    setShowVibePrompt(false);
    setVibePrompt('');
    setStringletUrl(null);
    setStringletError(null);
    setShowImprovedPromptPanel(false);
  };

  // Improve My Instructions — AI rewrites the prompt incorporating the critique
  const handleImproveInstructions = async () => {
    if (!critique || !instructions.trim()) {
      setCurrentPhase('instructions');
      return;
    }
    setImprovingWithAI(true);
    try {
      const improved = await onGenerateCode(
        `You are a vibe coding coach. A student wrote a coding prompt, received a critique, and now you must rewrite the prompt to be clearer and more complete based on that critique.

ORIGINAL PROMPT:
${instructions.trim()}

CRITIQUE FEEDBACK:
- Problem Decomposition (${critique.problemDecomposition.score}/3): ${critique.problemDecomposition.improvement}
- Prompt Engineering (${critique.promptEngineering.score}/3): ${critique.promptEngineering.improvement}
- Overall recommendation: ${critique.recommendation}

Rewrite the original prompt incorporating all of the critique feedback. Keep the same intent but make it more specific, complete, and well-structured.
Output ONLY the improved prompt — no explanation, no preamble, no labels.`,
        'python' // language doesn't matter here, we're just using chatText via onGenerateCode
      ).then(result => {
        // Strip any accidental code fences
        return result.replace(/^```\w*\n?/i, '').replace(/\n?```$/i, '').trim();
      });

      setInstructions(improved);
      setCurrentPhase('instructions');
      setShowImprovedPromptPanel(true);
    } catch (err) {
      // Fallback: just go back to instructions
      setCurrentPhase('instructions');
    } finally {
      setImprovingWithAI(false);
    }
  };

  // Improve code based on observed results — regenerates with output context
  const handleImproveFromResults = async () => {
    if (!generatedCode.trim()) return;
    setImprovingFromResults(true);
    try {
      const resultContext = executionResult?.output
        ? `OUTPUT / OBSERVED BEHAVIOUR:\n${executionResult.output}`
        : 'The page opened in the browser — the student reviewed it visually.';

      const improvedPrompt = `You are a vibe coding coach. A student generated code, ran it, and now wants to improve it based on the results.

ORIGINAL INSTRUCTIONS:
${instructions.trim()}

GENERATED CODE:
\`\`\`${language}
${generatedCode.slice(0, 1500)}${generatedCode.length > 1500 ? '\n... (truncated)' : ''}
\`\`\`

${resultContext}

Rewrite the original instructions to be more specific and complete so the next code generation improves on this version. Address any gaps, missing features, or things that could be better.
Output ONLY the improved prompt — no explanation, no preamble, no labels.`;

      const improved = await onGenerateCode(improvedPrompt, 'python')
        .then(r => r.replace(/^\`\`\`\w*\n?/i, '').replace(/\n?\`\`\`$/i, '').trim());

      setInstructions(improved);
      setCurrentPhase('instructions');
      setShowImprovedPromptPanel(true);
    } catch (err) {
      setCurrentPhase('instructions');
    } finally {
      setImprovingFromResults(false);
    }
  };

  // Create a reusable vibe coding prompt from current session state
  const handleCreateVibePrompt = () => {
    const langLabel = language === 'python' ? 'Python' : language === 'html' ? 'HTML/CSS/JavaScript' : 'JavaScript';
    const critiqueNote = critique
      ? `\n\nInstruction quality: Problem Decomposition ${critique.problemDecomposition.score}/3, Prompt Engineering ${critique.promptEngineering.score}/3.`
      : '';

    const prompt = [
      `Build me a ${langLabel} program that does the following:`,
      '',
      instructions.trim(),
      critiqueNote,
      generatedCode ? `\n\nA previous version of this code was generated. Here it is for reference — please improve on it:\n\`\`\`${language}\n${generatedCode.slice(0, 800)}${generatedCode.length > 800 ? '\n... (truncated)' : ''}\n\`\`\`` : '',
      executionResult?.error ? `\n\nThe previous version had this error:\n${executionResult.error}\n\nPlease fix this issue in the new version.` : '',
    ].filter(Boolean).join('\n');

    setVibePrompt(prompt.trim());
    setShowVibePrompt(true);
  };

  // Host generated code on Stringlet as a live web page
  // Detect if generated code contains HTML (works for Python scripts that output HTML too)
  const codeContainsHTML = (code: string) =>
    /<(!DOCTYPE|html|head|body|div|script|style)\b/i.test(code);

  const isWebViewable = language !== 'python' || codeContainsHTML(generatedCode);

  // Open generated code as a live web page in a new browser tab
  const handleOpenAsWebPage = () => {
    if (!generatedCode.trim()) return;
    setStringletError(null);
    setStringletUrl(null);

    try {
      let htmlToOpen: string;

      if (language === 'html' || codeContainsHTML(generatedCode)) {
        // Already HTML — use as-is (covers Python scripts that output HTML)
        htmlToOpen = generatedCode;
      } else {
        // Wrap JavaScript in a full HTML page
        htmlToOpen = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Vibe Coding Project</title>
  <style>
    body { margin: 0; padding: 20px; font-family: Arial, sans-serif; background: #f0f0f0; }
    .container { max-width: 800px; margin: 0 auto; background: white; padding: 20px;
                 border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
  </style>
</head>
<body>
  <div class="container"><div id="output"></div></div>
  <script>
    try { ${generatedCode} }
    catch(e) { document.getElementById('output').innerHTML =
      '<p style="color:red">Error: ' + e.message + '</p>'; }
  </script>
</body>
</html>`;
      }

      const blob = new Blob([htmlToOpen], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      setStringletUrl(url);
    } catch (err: any) {
      setStringletError('Could not open preview. Please try again.');
    }
  };

  return (
    <div className="stack-y-6">
      {/* Progress Indicator */}
      <div className="bg-white rounded-lg shadow-md p-4">
        <div className="flex items-center justify-between">
          <div className={classNames(
            "flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium",
            currentPhase === 'instructions' ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-500'
          )}>
            <span className="font-bold">1</span>
            <span>Write Instructions</span>
          </div>
          
          <ChevronRight className="text-gray-400" size={20} />
          
          <div className={classNames(
            "flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium",
            currentPhase === 'critique' ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-500'
          )}>
            <span className="font-bold">2</span>
            <span>Get Critique</span>
          </div>
          
          <ChevronRight className="text-gray-400" size={20} />
          
          <div className={classNames(
            "flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium",
            currentPhase === 'code' ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-500'
          )}>
            <span className="font-bold">3</span>
            <span>Generate & Run</span>
          </div>
          
          <ChevronRight className="text-gray-400" size={20} />
          
          <div className={classNames(
            "flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium",
            currentPhase === 'debugging' ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-500'
          )}>
            <span className="font-bold">4</span>
            <span>Debug & Iterate</span>
          </div>
        </div>
      </div>

      {/* PHASE 1: INSTRUCTION WRITING */}
      {(currentPhase === 'instructions' || critique) && (
        <div className="bg-white rounded-lg shadow-lg overflow-hidden">
          <div className="bg-linear-to-r from-purple-600 to-pink-600 px-6 py-4">
            <div className="flex items-center gap-3">
              <Lightbulb className="h-6 w-6 text-white" />
              <div>
                <h3 className="text-lg font-bold text-white">Phase 1: Write Your Instructions</h3>
                <p className="text-sm text-purple-100">
                  Describe what you want the code to do in plain English
                </p>
              </div>
            </div>
          </div>
          
          <div className="p-6 stack-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Programming Language
              </label>
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value as 'python' | 'javascript' | 'html')}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm font-medium"
                disabled={currentPhase !== 'instructions'}
              >
                <option value="python">Python 🐍</option>
                <option value="javascript">JavaScript ⚡</option>
                <option value="html">HTML / Web Page 🌐</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Your Instructions (be specific!)
              </label>
              <textarea
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                className="w-full h-48 p-4 border-2 border-gray-200 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                placeholder="Example: Create a function that calculates the fibonacci sequence up to the 10th number. It should accept a number as input and return a list of fibonacci numbers. Include error handling for negative inputs."
                disabled={currentPhase !== 'instructions' && !critique}
              />
            </div>

            {/* Show critique if available (for improvement) */}
            {critique && currentPhase === 'instructions' && (
              <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 rounded-sm">
                <div className="flex items-start gap-2">
                  <AlertCircle className="h-5 w-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                  <div className="text-sm text-yellow-800">
                    <p className="font-semibold mb-2">Previous Critique (for reference):</p>
                    <p className="mb-1">Problem Decomposition: {critique.problemDecomposition.score}/3</p>
                    <p>Prompt Engineering: {critique.promptEngineering.score}/3</p>
                  </div>
                </div>
              </div>
            )}

            <div className="flex gap-3">
              <Button
                onClick={handleCritiqueInstructions}
                isLoading={loadingCritique}
                disabled={!instructions.trim() || loadingCritique}
                className="bg-purple-600 hover:bg-purple-700 text-white"
                icon={<Sparkles size={16} />}
              >
                {currentPhase === 'instructions' && !critique ? 'Critique My Instructions' : 'Get New Critique'}
              </Button>
            </div>

            {/* AI-improved prompt panel — shown after "Improve My Instructions" is clicked */}
            {showImprovedPromptPanel && (
              <div className="bg-linear-to-br from-purple-50 to-pink-50 border border-purple-200 rounded-xl p-4 stack-y-2">
                <div className="flex items-start gap-2">
                  <Sparkles className="h-4 w-4 text-purple-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-bold text-purple-900">Your prompt has been improved by AI ✨</p>
                    <p className="text-xs text-purple-700 mt-1 leading-relaxed">
                      This is the normal vibe coding workflow — you designed a prompt, the AI critiqued it, and now AI has rewritten your original prompt to be clearer and more complete based on that critique.
                    </p>
                    <p className="text-xs text-purple-700 mt-1 leading-relaxed">
                      <strong>Design → Critique → AI-improved Prompt → Generate Code.</strong> The improved prompt above is now ready — review it, edit if you like, then click <strong>Critique My Instructions</strong> again or go straight to generating code.
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setShowImprovedPromptPanel(false)}
                  className="text-xs text-purple-500 hover:text-purple-700 underline ml-6"
                >
                  Dismiss
                </button>
              </div>
            )}

            <div className="text-xs text-gray-500 stack-y-1">
              <p><strong>💡 Tip:</strong> Good instructions include:</p>
              <ul className="list-disc list-inside ml-2 stack-y-0.5">
                <li>What the code should do (functionality)</li>
                <li>What inputs it should accept</li>
                <li>What outputs it should produce</li>
                <li>Any constraints or edge cases</li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* PHASE 2: AI CRITIQUE */}
      {currentPhase === 'critique' && critique && (
        <div className="bg-white rounded-lg shadow-lg overflow-hidden">
          <div className="bg-linear-to-r from-yellow-500 to-orange-500 px-6 py-4">
            <div className="flex items-center gap-3">
              <Sparkles className="h-6 w-6 text-white" />
              <div>
                <h3 className="text-lg font-bold text-white">Phase 2: AI Critique of Your Instructions</h3>
                <p className="text-sm text-yellow-100">
                  Review how clear your instructions are before generating code
                </p>
              </div>
            </div>
          </div>
          
          <div className="p-6 stack-y-6">
            {/* Problem Decomposition */}
            <div className="border-l-4 border-purple-500 pl-4">
              <div className="flex items-center justify-between mb-2">
                <h4 className="font-semibold text-gray-900">Problem Decomposition</h4>
                <span className={classNames(
                  "px-3 py-1 rounded-full text-sm font-bold",
                  critique.problemDecomposition.score === 0 ? 'bg-red-100 text-red-700' :
                  critique.problemDecomposition.score === 1 ? 'bg-yellow-100 text-yellow-700' :
                  critique.problemDecomposition.score === 2 ? 'bg-blue-100 text-blue-700' :
                  'bg-green-100 text-green-700'
                )}>
                  {critique.problemDecomposition.score}/3
                </span>
              </div>
              <div className="bg-gray-50 rounded-sm p-3 mb-2">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Evidence</p>
                <p className="text-sm text-gray-700 whitespace-pre-wrap">{critique.problemDecomposition.evidence}</p>
              </div>
              <div className="bg-amber-50 rounded-sm p-3">
                <p className="text-xs font-semibold text-amber-600 uppercase tracking-wide mb-1">How to improve</p>
                <p className="text-sm text-amber-800 whitespace-pre-wrap">{critique.problemDecomposition.improvement}</p>
              </div>
            </div>

            {/* Prompt Engineering */}
            <div className="border-l-4 border-pink-500 pl-4">
              <div className="flex items-center justify-between mb-2">
                <h4 className="font-semibold text-gray-900">Prompt Engineering</h4>
                <span className={classNames(
                  "px-3 py-1 rounded-full text-sm font-bold",
                  critique.promptEngineering.score === 0 ? 'bg-red-100 text-red-700' :
                  critique.promptEngineering.score === 1 ? 'bg-yellow-100 text-yellow-700' :
                  critique.promptEngineering.score === 2 ? 'bg-blue-100 text-blue-700' :
                  'bg-green-100 text-green-700'
                )}>
                  {critique.promptEngineering.score}/3
                </span>
              </div>
              <div className="bg-gray-50 rounded-sm p-3 mb-2">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Evidence</p>
                <p className="text-sm text-gray-700 whitespace-pre-wrap">{critique.promptEngineering.evidence}</p>
              </div>
              <div className="bg-amber-50 rounded-sm p-3">
                <p className="text-xs font-semibold text-amber-600 uppercase tracking-wide mb-1">How to improve</p>
                <p className="text-sm text-amber-800 whitespace-pre-wrap">{critique.promptEngineering.improvement}</p>
              </div>
            </div>

            {/* Recommendation */}
            <div className="bg-blue-50 rounded-lg p-4">
              <p className="text-sm text-blue-900">
                <strong>Recommendation:</strong> {critique.recommendation}
              </p>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3 pt-4 border-t">
              <Button
                onClick={handleImproveInstructions}
                isLoading={improvingWithAI}
                disabled={improvingWithAI}
                className="bg-purple-600 hover:bg-purple-700 text-white"
                icon={<RefreshCw size={16} />}
              >
                {improvingWithAI ? 'Improving…' : 'Improve My Instructions'}
              </Button>

              <Button
                onClick={() => handleGenerateCode(false)}
                isLoading={loadingCode}
                disabled={loadingCode || improvingWithAI}
                className="bg-green-600 hover:bg-green-700 text-white"
                icon={<Code2 size={16} />}
              >
                Generate Code
              </Button>
            </div>

            <div className="text-xs text-gray-500">
              <p><strong>💭 Learning Moment:</strong> Click <strong>Improve My Instructions</strong> to have AI rewrite your prompt using the critique above — this is the heart of the vibe coding workflow!</p>
            </div>
          </div>
        </div>
      )}

      {/* PHASE 3: CODE GENERATION & EXECUTION */}
      {currentPhase === 'code' && generatedCode && (
        <div className="bg-white rounded-lg shadow-lg overflow-hidden">
          <div className="bg-linear-to-r from-green-600 to-teal-600 px-6 py-4">
            <div className="flex items-center gap-3">
              <Code2 className="h-6 w-6 text-white" />
              <div>
                <h3 className="text-lg font-bold text-white">Phase 3: Generated Code</h3>
                <p className="text-sm text-green-100">
                  Review the code, then run it to see if it works as expected
                </p>
              </div>
            </div>
          </div>
          
          <div className="p-6 stack-y-4">
            {/* Original Instructions Reminder */}
            <div className="bg-purple-50 border-l-4 border-purple-500 rounded-lg p-4">
              <h4 className="font-semibold text-purple-900 mb-2 flex items-center gap-2">
                <Lightbulb className="h-4 w-4" />
                Your Original Instructions:
              </h4>
              <p className="text-sm text-purple-800 whitespace-pre-wrap">
                {instructions}
              </p>
              <p className="text-xs text-purple-600 mt-2">
                Language: {language === 'python' ? 'Python 🐍' : 'JavaScript ⚡'}
              </p>
            </div>

            {/* Show Critique Summary if available */}
            {critique && (
              <div className="bg-blue-50 border-l-4 border-blue-500 rounded-lg p-4">
                <h4 className="font-semibold text-blue-900 mb-2 flex items-center gap-2">
                  <Sparkles className="h-4 w-4" />
                  AI Critique Summary:
                </h4>
                <div className="text-sm text-blue-800 stack-y-1">
                  <p>
                    <strong>Problem Decomposition:</strong> {critique.problemDecomposition.score}/3
                    {critique.problemDecomposition.score < 2 && ' - ' + critique.problemDecomposition.improvement}
                  </p>
                  <p>
                    <strong>Prompt Engineering:</strong> {critique.promptEngineering.score}/3
                    {critique.promptEngineering.score < 2 && ' - ' + critique.promptEngineering.improvement}
                  </p>
                </div>
              </div>
            )}

            {/* Generated Code Display */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                AI-Generated {language === 'python' ? 'Python' : 'JavaScript'} Code
              </label>
              <pre className="bg-gray-900 text-green-400 p-4 rounded-lg overflow-x-auto text-sm font-mono">
                <code>{generatedCode}</code>
              </pre>
            </div>

            {/* Run Button */}
            <div className="flex flex-wrap gap-3 items-center">
              <Button
                onClick={handleRunCode}
                isLoading={executing}
                disabled={executing}
                className="bg-green-600 hover:bg-green-700 text-white"
                icon={<Play size={16} />}
              >
                {executing ? 'Running...' : (language === 'html' || codeContainsHTML(generatedCode)) ? 'Check Code' : 'Run Code'}
              </Button>

              {/* Open as Web Page — JS, HTML, and Python scripts that output HTML */}
              {isWebViewable && (
                <Button
                  onClick={handleOpenAsWebPage}
                  disabled={!generatedCode.trim()}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white"
                  icon={<Globe size={16} />}
                >
                  Open as Web Page
                </Button>
              )}

              {stringletUrl && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 border border-emerald-300 text-emerald-700 text-sm rounded-lg">
                  <CheckCircle size={13} /> Opened in new tab
                </span>
              )}
              {stringletError && (
                <span className="text-sm text-red-600">⚠ {stringletError}</span>
              )}
            </div>

            {/* Execution Results */}
            {executionResult && (
              <div className={classNames(
                "rounded-lg p-4",
                executionResult.isHTML
                  ? 'bg-blue-50 border-2 border-blue-200'
                  : executionResult.error
                  ? 'bg-red-50 border-2 border-red-200'
                  : 'bg-green-50 border-2 border-green-200'
              )}>
                <div className="flex items-center gap-2 mb-2">
                  {executionResult.isHTML ? (
                    <>
                      <Globe className="h-5 w-5 text-blue-600" />
                      <h4 className="font-semibold text-blue-900">HTML Ready</h4>
                    </>
                  ) : executionResult.error ? (
                    <>
                      <AlertCircle className="h-5 w-5 text-red-600" />
                      <h4 className="font-semibold text-red-900">Error</h4>
                    </>
                  ) : (
                    <>
                      <CheckCircle className="h-5 w-5 text-green-600" />
                      <h4 className="font-semibold text-green-900">Success</h4>
                    </>
                  )}
                  {!executionResult.isHTML && (
                    <span className="ml-auto text-xs text-gray-500">{executionResult.executionTime}ms</span>
                  )}
                </div>
                <pre className={classNames(
                  "text-sm font-mono whitespace-pre-wrap",
                  executionResult.isHTML ? 'text-blue-800' :
                  executionResult.error ? 'text-red-800' : 'text-green-800'
                )}>
                  {executionResult.error || executionResult.output || '(no output)'}
                </pre>

                {/* Action Buttons for Errors */}
                {executionResult.error && (
                  <div className="mt-4 flex gap-3">
                    <Button
                      onClick={async () => {
                        setLoadingDebug(true);
                        try {
                          const advice = await onGetDebuggingHelp(generatedCode, executionResult.error, instructions);
                          setDebuggingAdvice(advice);
                          setCurrentPhase('debugging');
                        } catch (error) {
                          console.error('Error getting debugging help:', error);
                          alert('Failed to get debugging help. Please try again.');
                        } finally {
                          setLoadingDebug(false);
                        }
                      }}
                      isLoading={loadingDebug}
                      disabled={loadingDebug}
                      size="sm"
                      className="bg-blue-600 hover:bg-blue-700 text-white"
                      icon={<Lightbulb size={14} />}
                    >
                      Get AI Debugging Help
                    </Button>
                    <Button
                      onClick={handleImproveInstructions}
                      size="sm"
                      variant="outline"
                      className="border-purple-300 text-purple-700 hover:bg-purple-50"
                      icon={<RefreshCw size={14} />}
                    >
                      Revise Instructions
                    </Button>
                  </div>
                )}

                {/* Success Actions */}
                {!executionResult.error && (
                  <div className="mt-4 flex flex-wrap gap-3">
                    <Button
                      onClick={handleImproveFromResults}
                      isLoading={improvingFromResults}
                      disabled={improvingFromResults}
                      size="sm"
                      className="bg-purple-600 hover:bg-purple-700 text-white"
                      icon={<RefreshCw size={14} />}
                    >
                      {improvingFromResults ? 'Improving…' : 'Improve Based on Results'}
                    </Button>
                    <Button
                      onClick={handleStartOver}
                      size="sm"
                      className="bg-green-600 hover:bg-green-700 text-white"
                    >
                      🎉 Try Another Challenge
                    </Button>
                  </div>
                )}
              </div>
            )}

            {/* Connection to Instructions */}
            <div className="bg-purple-50 rounded-lg p-4 text-sm">
              <p className="font-semibold text-purple-900 mb-2">🔗 Connecting Instructions → Code → Output:</p>
              <p className="text-purple-800">
                Look at your original instructions and compare them to the code and output. 
                Did the AI understand what you wanted? Is the output what you expected?
              </p>
            </div>

            {/* Create Vibe Coding Prompt — full width */}
            <div className="pt-2 border-t border-gray-100">
              <Button
                onClick={handleCreateVibePrompt}
                className="w-full bg-purple-600 hover:bg-purple-700 text-white justify-center"
                icon={<Wand2 size={16} />}
              >
                Create Vibe Coding Prompt
              </Button>
              <p className="text-xs text-gray-500 text-center mt-1">
                After refining your design through this session, generate a reusable prompt you can paste into any AI tool
              </p>
            </div>
          </div>
        </div>
      )}

      {/* PHASE 4: DEBUGGING & ITERATION */}
      {currentPhase === 'debugging' && executionResult?.error && (
        <div className="bg-white rounded-lg shadow-lg overflow-hidden">
          <div className="bg-linear-to-r from-red-600 to-pink-600 px-6 py-4">
            <div className="flex items-center gap-3">
              <Terminal className="h-6 w-6 text-white" />
              <div>
                <h3 className="text-lg font-bold text-white">Phase 4: Debugging & Iteration</h3>
                <p className="text-sm text-red-100">
                  Work with AI to understand and fix the error
                </p>
              </div>
            </div>
          </div>
          
          <div className="p-6 stack-y-4">
            {/* Error Display */}
            <div className="bg-red-50 border-l-4 border-red-500 p-4">
              <h4 className="font-semibold text-red-900 mb-2">Error Encountered:</h4>
              <pre className="text-sm text-red-800 font-mono whitespace-pre-wrap">
                {executionResult.error}
              </pre>
            </div>

            {/* Get Debugging Help */}
            <div>
              <Button
                onClick={handleGetDebuggingHelp}
                isLoading={loadingDebug}
                disabled={loadingDebug}
                className="bg-blue-600 hover:bg-blue-700 text-white"
                icon={<Lightbulb size={16} />}
              >
                Ask AI for Debugging Help
              </Button>
            </div>

            {/* Debugging Advice */}
            {debuggingAdvice && (
              <div className="bg-blue-50 rounded-lg p-4">
                <h4 className="font-semibold text-blue-900 mb-2">AI Debugging Advice:</h4>
                <div className="text-sm text-blue-800 whitespace-pre-wrap">
                  {debuggingAdvice}
                </div>
              </div>
            )}

            {/* Options */}
            <div className="flex gap-3 pt-4 border-t">
              <Button
                onClick={handleImproveInstructions}
                className="bg-purple-600 hover:bg-purple-700 text-white"
                icon={<RefreshCw size={16} />}
              >
                Revise Instructions
              </Button>

              <Button
                onClick={handleStartOver}
                variant="outline"
                className="border-gray-300 text-gray-700"
              >
                Start Over
              </Button>
            </div>

            {/* Learning Reflection */}
            <div className="bg-yellow-50 rounded-lg p-4 text-sm">
              <p className="font-semibold text-yellow-900 mb-2">🤔 Reflection Questions:</p>
              <ul className="text-yellow-800 stack-y-1 list-disc list-inside">
                <li>Was your original instruction clear enough?</li>
                <li>Did you specify all the requirements?</li>
                <li>What could you add to prevent this error?</li>
                <li>Can you explain what the error means?</li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Success State */}
      {currentPhase === 'code' && executionResult && !executionResult.error && (
        <div className="bg-green-50 border-2 border-green-200 rounded-lg p-6">
          <div className="flex items-start gap-4">
            <CheckCircle className="h-8 w-8 text-green-600 flex-shrink-0" />
            <div className="flex-1">
              <h3 className="text-lg font-bold text-green-900 mb-2">
                🎉 Success! Your code works!
              </h3>
              <p className="text-sm text-green-800 mb-4">
                You successfully communicated your intent to the AI and the resulting code executed correctly.
              </p>
              <div className="flex gap-3">
                <Button
                  onClick={handleStartOver}
                  className="bg-green-600 hover:bg-green-700 text-white"
                >
                  Try Another Challenge
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Vibe Coding Prompt Panel */}
      {showVibePrompt && (
        <div className="bg-linear-to-br from-purple-900/10 to-pink-900/5 border border-purple-300 rounded-xl shadow-md">
          <div className="px-5 py-4 border-b border-purple-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Wand2 className="w-5 h-5 text-purple-600" />
              <h3 className="text-base font-semibold text-gray-900">Your Vibe Coding Prompt</h3>
            </div>
            <button onClick={() => setShowVibePrompt(false)} className="text-gray-400 hover:text-gray-600">
              <X size={18} />
            </button>
          </div>
          <div className="p-5 stack-y-3">
            <p className="text-xs text-purple-700">
              This prompt captures your design from this session. Paste it into <strong>ChatGPT, Claude, Cursor, or Replit</strong> to continue building or start fresh on any device.
            </p>
            <textarea
              value={vibePrompt}
              onChange={e => setVibePrompt(e.target.value)}
              rows={7}
              className="w-full bg-white border border-purple-200 rounded-lg px-4 py-3 text-sm text-gray-800 resize-none focus:outline-hidden focus:border-purple-400 font-mono leading-relaxed"
            />
            <div className="flex flex-wrap gap-3 items-center">
              <Button
                onClick={() => {
                  navigator.clipboard.writeText(vibePrompt);
                  setVibeCopied(true);
                  setTimeout(() => setVibeCopied(false), 2000);
                }}
                className="bg-purple-600 hover:bg-purple-700 text-white"
                icon={vibeCopied ? <CheckCircle size={15} /> : <Copy size={15} />}
              >
                {vibeCopied ? 'Copied!' : 'Copy Prompt'}
              </Button>
              <Button
                onClick={handleCreateVibePrompt}
                className="bg-gray-100 hover:bg-gray-200 text-gray-700"
                icon={<RefreshCw size={14} />}
              >
                Regenerate
              </Button>
              <span className="text-xs text-gray-400">Paste into any AI coding tool to keep building</span>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default VibeCodingWorkflow;