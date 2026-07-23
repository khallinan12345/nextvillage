// src/pages/tech-skills/CreateGamePage.tsx
//
// A student describes a game idea in chat; Claude generates a complete,
// self-contained HTML/canvas game (code stays hidden — the student only
// sees the running game and chat), and can keep asking for changes to
// improve it. Controls are mouse/trackpad only. After each generation, an
// automated smoke test (src/lib/gameTestHarness.ts) plays the game with
// synthetic mouse events inside the sandboxed preview iframe and reports
// back via postMessage; Claude then reviews that report plus the code and
// gives the student a plain-language verdict. Saving persists the game to
// `student_games`, which hands them a shareable /tech-skills/games/:id
// link (PlayGamePage.tsx). A student can reopen any of their own
// previously saved games from the "Your games" list to keep improving it
// — saving again updates that same game in place (same id, same public
// URL) rather than creating a duplicate.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AppLayout from '../../components/layout/AppLayout';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../lib/supabaseClient';
import { chatText, chatJSON } from '../../lib/chatClient';
import { buildHarnessedHtml, useGameSmokeTest, GameTestReport } from '../../lib/gameTestHarness';
import { Gamepad2, Send, Loader2, Sparkles, CheckCircle2, AlertTriangle, Rocket, Save, FolderOpen, Plus, X } from 'lucide-react';

interface ChatEntry {
  role: 'user' | 'assistant';
  content: string;
}

interface Verdict {
  verdict: 'looks good' | 'needs work';
  summary: string;
  suggestions: string[];
}

interface SavedGame {
  id: string;
  title: string;
  updated_at: string;
}

const GENERATION_SYSTEM_PROMPT = `You are generating a single, self-contained HTML file for a simple browser game designed by a student, to run inside a sandboxed iframe.

STRICT REQUIREMENTS:
- Output ONLY the complete HTML file — no markdown fences, no explanation, no commentary before or after.
- Single file: all CSS in a <style> tag, all JS in a <script> tag, no external files of any kind.
- Do NOT load any external resources — no <img src="https://...">, no web fonts, no CDN scripts, no audio files. Draw everything with canvas and CSS only.
- Must use a single <canvas> element as the game area.
- Controls: mouse/trackpad ONLY. Use mousemove, mousedown, mouseup, and click events on the canvas. Do NOT use keyboard events (keydown/keyup), do NOT use the contextmenu/right-click event, and do NOT rely on pointer lock.
- Do NOT call alert(), confirm(), or prompt() — the game runs in a sandboxed iframe where these are silently blocked. Show score, win/lose, and restart state by drawing text on the canvas instead.
- Keep the game genuinely playable and visually clear: draw a background, the player-controlled element, and any obstacles/targets every frame via requestAnimationFrame.
- Wrap the game loop defensively so a single bad frame can't crash the whole page.`;

function stripCodeFences(text: string): string {
  return text.trim().replace(/^```(?:html)?\n/i, '').replace(/\n```$/i, '');
}

const CreateGamePage: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [sessionId, setSessionId] = useState(() => crypto.randomUUID());
  const [isExistingGame, setIsExistingGame] = useState(false);
  const [effectiveOrgId, setEffectiveOrgId] = useState<string | null>(null);

  const [chatHistory, setChatHistory] = useState<ChatEntry[]>([]);
  const [input, setInput] = useState('');
  const [generating, setGenerating] = useState(false);

  const [gameCode, setGameCode] = useState<string | null>(null);
  const [iframeVersion, setIframeVersion] = useState(0);

  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [verdictLoading, setVerdictLoading] = useState(false);
  const [showVerdictModal, setShowVerdictModal] = useState(false);

  const [title, setTitle] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [myGames, setMyGames] = useState<SavedGame[]>([]);
  const [loadingGame, setLoadingGame] = useState(false);

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const smoke = useGameSmokeTest(iframeRef);
  const reviewedRef = useRef(false);

  const refreshMyGames = useCallback(() => {
    if (!user?.id) return;
    supabase
      .from('student_games')
      .select('id, title, updated_at')
      .eq('owner_id', user.id)
      .order('updated_at', { ascending: false })
      .then(({ data }) => setMyGames(data ?? []));
  }, [user?.id]);

  useEffect(() => {
    supabase.rpc('get_my_effective_profile').then(({ data }) => {
      setEffectiveOrgId(data?.[0]?.organization_id ?? null);
    });
  }, []);

  useEffect(() => { refreshMyGames(); }, [refreshMyGames]);

  const loadGame = useCallback(async (game: SavedGame) => {
    setLoadingGame(true);
    setError('');
    const { data, error: loadError } = await supabase
      .from('student_games')
      .select('html_content')
      .eq('id', game.id)
      .single();
    setLoadingGame(false);
    if (loadError || !data) {
      setError('Could not load that game — please try again.');
      return;
    }
    setSessionId(game.id);
    setIsExistingGame(true);
    setTitle(game.title);
    setGameCode(data.html_content);
    setIframeVersion(v => v + 1);
    setVerdict(null);
    smoke.reset();
    reviewedRef.current = false;
    setChatHistory([]);
  }, [smoke]);

  const handleStartNew = useCallback(() => {
    setSessionId(crypto.randomUUID());
    setIsExistingGame(false);
    setTitle('');
    setGameCode(null);
    setChatHistory([]);
    setVerdict(null);
    smoke.reset();
    reviewedRef.current = false;
    setError('');
  }, [smoke]);

  // ── AI review of the smoke-test report, once it lands ──────────────────────
  useEffect(() => {
    if (smoke.status !== 'done' && smoke.status !== 'timeout') return;
    if (!gameCode) return;
    if (reviewedRef.current) return; // already reviewed this run
    reviewedRef.current = true;
    const report: GameTestReport = smoke.report ?? {
      hadCanvas: false,
      canvasChanged: 'unknown',
      errors: ['The game did not respond within 8 seconds — it may have an infinite loop or failed to load.'],
    };

    setVerdictLoading(true);
    chatJSON({
      page: 'CreateGamePage',
      system: 'You are reviewing an automated smoke-test report for a browser game a student built with AI help. JavaScript errors are a strong, reliable signal something is broken. Whether the canvas "visibly changed" is a much weaker signal — some browsers pause canvas redraws if the preview tab loses focus during the test, so canvasChanged:false with zero errors does NOT necessarily mean the game is broken; read the code to judge that case rather than treating it as a failure. Be encouraging but honest and concrete. Respond ONLY with JSON: {"verdict":"looks good"|"needs work","summary":"1-3 sentences in plain language for a student","suggestions":["short actionable tip", "..."]}',
      messages: [{
        role: 'user',
        content: `TEST REPORT:\n- Found a <canvas> element: ${report.hadCanvas}\n- Canvas visibly changed after simulated mouse movement/click: ${report.canvasChanged}\n- JavaScript errors caught: ${report.errors.length ? report.errors.join(' | ') : 'none'}\n\nGAME CODE:\n${(gameCode || '').slice(0, 4000)}`,
      }],
      max_tokens: 400,
      temperature: 0.4,
    })
      .then(result => setVerdict({
        verdict: result?.verdict === 'looks good' ? 'looks good' : 'needs work',
        summary: typeof result?.summary === 'string' ? result.summary : 'The test finished, but the summary was empty.',
        suggestions: Array.isArray(result?.suggestions) ? result.suggestions : [],
      }))
      .catch(() => setVerdict({
        verdict: report.errors.length ? 'needs work' : 'looks good',
        summary: report.errors.length
          ? "The automated test hit some errors, but I couldn't reach Claude to summarize them — check the details below."
          : "The automated test ran without errors, but I couldn't reach Claude for a full review.",
        suggestions: [],
      }))
      .finally(() => setVerdictLoading(false));
  }, [smoke.status, smoke.report, gameCode]);

  const runGeneration = useCallback(async (userMessage: string, isFirst: boolean) => {
    setGenerating(true);
    setError('');
    try {
      const prompt = isFirst
        ? `A student wants to build this game: ${userMessage}\n\nGenerate the complete game.`
        : `Here is the current game's complete HTML:\n\n${gameCode}\n\nThe student wants this change: ${userMessage}\n\nReturn the complete updated HTML file with this change applied, keeping everything else working and following all the original requirements.`;

      const html = stripCodeFences(await chatText({
        page: 'CreateGamePage',
        system: GENERATION_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 4000,
        temperature: 0.6,
      }));

      setGameCode(html);
      setIframeVersion(v => v + 1);
      setVerdict(null);
      smoke.reset();
      reviewedRef.current = false;
    } catch {
      setError("Claude couldn't generate the game just now — please try again.");
    } finally {
      setGenerating(false);
    }
  }, [gameCode, smoke]);

  const handleSend = useCallback(() => {
    const text = input.trim();
    if (!text || generating) return;
    setInput('');
    setChatHistory(prev => [...prev, { role: 'user', content: text }]);
    runGeneration(text, !gameCode);
  }, [input, generating, gameCode, runGeneration]);

  const handleSave = useCallback(async () => {
    if (!user?.id || !gameCode || !effectiveOrgId || saving) return;
    const gameTitle = title.trim() || 'My Game';
    setSaving(true);
    setError('');
    // Upsert rather than plain insert so re-saving an already-loaded game
    // updates it in place (same id → same public URL) instead of failing
    // on the primary-key conflict a plain insert would hit.
    const { data, error: saveError } = await supabase
      .from('student_games')
      .upsert({
        id:               sessionId,
        organization_id:  effectiveOrgId,
        owner_id:         user.id,
        owner_name:       user.name,
        title:            gameTitle,
        html_content:     gameCode,
        updated_at:       new Date().toISOString(),
      })
      .select('id')
      .single();
    setSaving(false);
    if (saveError || !data) {
      setError('Could not save the game — please try again.');
      return;
    }
    setIsExistingGame(true);
    refreshMyGames();
    navigate(`/tech-skills/games/${data.id}`);
  }, [user, gameCode, effectiveOrgId, saving, title, sessionId, navigate, refreshMyGames]);

  const harnessedHtml = gameCode ? buildHarnessedHtml(gameCode) : null;

  return (
    <AppLayout>
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between gap-3 mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-gradient-to-br from-emerald-600 to-teal-600">
              <Gamepad2 size={22} className="text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">Create Game</h1>
              <p className="text-sm text-gray-500">Describe a game idea — Claude builds it, tests it, and you save it.</p>
            </div>
          </div>
          {(gameCode || myGames.length > 0) && (
            <button
              onClick={handleStartNew}
              className="flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-emerald-600 border border-gray-200 hover:border-emerald-200 rounded-lg px-3 py-1.5 transition-colors flex-shrink-0"
            >
              <Plus size={13} /> New game
            </button>
          )}
        </div>

        {myGames.length > 0 && (
          <div className="bg-white border border-gray-200 rounded-2xl px-4 py-3 mb-6">
            <p className="text-xs font-semibold text-gray-500 uppercase mb-2 flex items-center gap-1.5">
              <FolderOpen size={13} /> Your games
            </p>
            <div className="flex flex-wrap gap-2">
              {myGames.map(game => (
                <button
                  key={game.id}
                  onClick={() => loadGame(game)}
                  disabled={loadingGame}
                  className={`text-xs font-medium rounded-full px-3 py-1.5 border transition-colors disabled:opacity-40 ${
                    isExistingGame && game.id === sessionId
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      : 'text-gray-500 border-gray-200 hover:text-emerald-600 hover:border-emerald-200'
                  }`}
                >
                  {game.title}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* ── Chat panel ─────────────────────────────────────────────────── */}
          <div className="bg-white border border-gray-200 rounded-2xl flex flex-col h-[70vh]">
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
              {chatHistory.length === 0 && (
                <div className="text-sm text-gray-400 space-y-2">
                  <p>
                    Describe the game you want — for example: "a game where you click a bouncing ball to score points before it escapes the screen."
                  </p>
                  <p>
                    Once your game is generated, keep asking for changes right here to improve it — then save when you're happy with it.
                  </p>
                </div>
              )}
              {chatHistory.map((m, i) => (
                <div key={i} className="rounded-2xl px-4 py-2.5 bg-purple-600 text-white ml-auto max-w-[85%]">
                  <p className="text-sm whitespace-pre-wrap break-words">{m.content}</p>
                </div>
              ))}
              {generating && (
                <div className="flex items-center gap-2 text-xs text-gray-400">
                  <Loader2 size={13} className="animate-spin" /> {gameCode ? 'Updating your game…' : 'Building your game…'}
                </div>
              )}
            </div>
            {error && <p className="text-xs text-red-500 px-5 pb-1">{error}</p>}
            <div className="flex items-end gap-2 px-5 py-3 border-t border-gray-100">
              <textarea
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                rows={1}
                placeholder={gameCode ? 'Ask for a change, e.g. "make the ball faster"…' : 'Describe your game idea…'}
                disabled={generating}
                className="flex-1 resize-none outline-none text-sm bg-gray-50 rounded-xl px-3 py-2 max-h-32 focus:ring-2 focus:ring-emerald-100"
              />
              <button
                onClick={handleSend}
                disabled={!input.trim() || generating}
                className="flex-shrink-0 w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-600 to-teal-600 flex items-center justify-center text-white disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90 transition-opacity"
              >
                {generating ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
              </button>
            </div>
          </div>

          {/* ── Preview panel ──────────────────────────────────────────────── */}
          <div className="bg-white border border-gray-200 rounded-2xl flex flex-col h-[70vh] overflow-hidden">
            {harnessedHtml ? (
              <iframe
                key={iframeVersion}
                ref={iframeRef}
                title="Game preview"
                srcDoc={harnessedHtml}
                sandbox="allow-scripts"
                onLoad={() => smoke.start()}
                className="flex-1 w-full border-0"
              />
            ) : (
              <div className="flex-1 flex items-center justify-center text-gray-300 text-sm">
                Your game will appear here.
              </div>
            )}

            {/* Compact test status strip */}
            {gameCode && (
              <div className="border-t border-gray-100 px-4 py-2.5 flex items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-1.5">
                  {smoke.status === 'running' || verdictLoading ? (
                    <><Loader2 size={13} className="animate-spin text-gray-400" /> <span className="text-gray-400">Claude is testing the game…</span></>
                  ) : verdict ? (
                    verdict.verdict === 'looks good' ? (
                      <><CheckCircle2 size={13} className="text-emerald-500" /> <span className="text-emerald-700 font-medium">Looks good</span></>
                    ) : (
                      <><AlertTriangle size={13} className="text-amber-500" /> <span className="text-amber-700 font-medium">Needs work</span></>
                    )
                  ) : <span className="text-gray-300">Not tested yet</span>}
                </div>
                {verdict && (
                  <button onClick={() => setShowVerdictModal(true)} className="text-gray-400 hover:text-gray-700 font-medium">
                    View details
                  </button>
                )}
              </div>
            )}

            {/* Publish controls */}
            {gameCode && (
              <div className="border-t border-gray-100 px-4 py-3 flex items-center gap-2">
                <input
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  placeholder="Name your game…"
                  maxLength={100}
                  className="flex-1 border border-gray-300 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-400"
                />
                <button
                  onClick={handleSave}
                  disabled={saving || !effectiveOrgId}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-br from-emerald-600 to-teal-600 text-white text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90 transition-opacity flex-shrink-0"
                >
                  {saving ? <Loader2 size={15} className="animate-spin" /> : isExistingGame ? <Save size={15} /> : <Rocket size={15} />}
                  {isExistingGame ? 'Save' : 'Publish'}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Evaluation modal ────────────────────────────────────────────────── */}
      {showVerdictModal && verdict && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                <Sparkles size={18} className="text-emerald-500" /> AI Test Results
              </h3>
              <button onClick={() => setShowVerdictModal(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-6 h-6" />
              </button>
            </div>
            <p className="text-sm text-gray-700 mb-4">{verdict.summary}</p>
            {verdict.suggestions.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Suggestions</p>
                <ul className="list-disc list-inside space-y-1 text-sm text-gray-700">
                  {verdict.suggestions.map((s, i) => <li key={i}>{s}</li>)}
                </ul>
              </div>
            )}
            <div className="mt-5 flex justify-end">
              <button
                onClick={() => setShowVerdictModal(false)}
                className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-sm"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
};

export default CreateGamePage;
