/**
 * src/pages/CoworkPage.tsx
 *
 * NextVillage Agent Builder — "Cowork" tab sub-page
 *
 * Lets certified learners build, save, run, and share
 * their own AI agents via NextVillage's existing AI
 * service layer (Groq → Gemini → Cerebras → ... fallback chain).
 *
 * Access gate: user must be cowork_eligible (cert level >= 2).
 * Nav:         Claude tab → "Agent Builder" sub-item.
 */

import { useEffect, useState, useRef, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import { callAI } from '../lib/aiService'; // your existing fallback-chain service
import {
  PlusCircle, Bot, Play, Save, Share2, Lock,
  Trash2, ChevronLeft, Send, Loader2, Settings2,
  Copy, Check, Globe, AlertCircle
} from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────

interface Agent {
  id: string;
  name: string;
  description: string;
  system_prompt: string;
  model_pref: string;
  is_shared: boolean;
  share_token: string | null;
  created_at: string;
  updated_at: string;
  user_id: string;
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  provider_used?: string;
}

interface Conversation {
  id: string;
  agent_id: string;
  title: string | null;
  messages: Message[];
}

type View = 'gallery' | 'builder' | 'runner';

const EMPTY_AGENT: Omit<Agent, 'id' | 'created_at' | 'updated_at' | 'user_id' | 'share_token'> = {
  name: '',
  description: '',
  system_prompt: '',
  model_pref: 'auto',
  is_shared: false,
};

const MODEL_OPTIONS = [
  { value: 'auto',    label: 'Auto (best available)' },
  { value: 'gemini',  label: 'Gemini (strong reasoning)' },
  { value: 'groq',    label: 'Groq (fastest)' },
  { value: 'haiku',   label: 'Claude Haiku (balanced)' },
];

// ─── Certification gate ───────────────────────────────────────

async function checkEligibility(userId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('cowork_eligible_users')
    .select('user_id')
    .eq('user_id', userId)
    .maybeSingle();
  return !error && data !== null;
}

// ─── Main component ───────────────────────────────────────────

export default function CoworkPage() {
  const [userId, setUserId]           = useState<string | null>(null);
  const [eligible, setEligible]       = useState<boolean | null>(null);
  const [view, setView]               = useState<View>('gallery');
  const [agents, setAgents]           = useState<Agent[]>([]);
  const [communityAgents, setCommunityAgents] = useState<Agent[]>([]);
  const [activeAgent, setActiveAgent] = useState<Agent | null>(null);
  const [draft, setDraft]             = useState(EMPTY_AGENT);
  const [saving, setSaving]           = useState(false);
  const [saveError, setSaveError]     = useState<string | null>(null);
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [input, setInput]             = useState('');
  const [thinking, setThinking]       = useState(false);
  const [copied, setCopied]           = useState(false);
  const [tab, setTab]                 = useState<'mine' | 'community'>('mine');
  const messagesEndRef                = useRef<HTMLDivElement>(null);

  // ── Auth + eligibility ──────────────────────────────────────

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const uid = data?.user?.id ?? null;
      setUserId(uid);
      if (uid) checkEligibility(uid).then(setEligible);
    });
  }, []);

  // ── Load agents ─────────────────────────────────────────────

  useEffect(() => {
    if (!userId || !eligible) return;
    loadMyAgents();
    loadCommunityAgents();
  }, [userId, eligible]);

  async function loadMyAgents() {
    const { data } = await supabase
      .from('agents')
      .select('*')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false });
    setAgents(data ?? []);
  }

  async function loadCommunityAgents() {
    const { data } = await supabase
      .from('agents')
      .select('*')
      .eq('is_shared', true)
      .neq('user_id', userId)
      .order('updated_at', { ascending: false })
      .limit(30);
    setCommunityAgents(data ?? []);
  }

  // ── Scroll to latest message ────────────────────────────────

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [conversation?.messages]);

  // ── Agent CRUD ──────────────────────────────────────────────

  function openNewBuilder() {
    setDraft(EMPTY_AGENT);
    setActiveAgent(null);
    setSaveError(null);
    setView('builder');
  }

  function openEditBuilder(agent: Agent) {
    setDraft({
      name:          agent.name,
      description:   agent.description,
      system_prompt: agent.system_prompt,
      model_pref:    agent.model_pref,
      is_shared:     agent.is_shared,
    });
    setActiveAgent(agent);
    setSaveError(null);
    setView('builder');
  }

  async function saveAgent() {
    if (!userId) return;
    if (!draft.name.trim() || !draft.system_prompt.trim()) {
      setSaveError('Name and system prompt are required.');
      return;
    }
    setSaving(true);
    setSaveError(null);

    const payload = {
      ...draft,
      user_id: userId,
      // Generate a share_token slug when sharing for the first time
      share_token: draft.is_shared
        ? (activeAgent?.share_token ?? slugify(draft.name))
        : null,
    };

    if (activeAgent) {
      const { error } = await supabase
        .from('agents')
        .update(payload)
        .eq('id', activeAgent.id);
      if (error) { setSaveError(error.message); setSaving(false); return; }
    } else {
      const { error } = await supabase
        .from('agents')
        .insert(payload);
      if (error) { setSaveError(error.message); setSaving(false); return; }
    }

    await loadMyAgents();
    setSaving(false);
    setView('gallery');
  }

  async function deleteAgent(agentId: string) {
    if (!window.confirm('Delete this agent? This cannot be undone.')) return;
    await supabase.from('agents').delete().eq('id', agentId);
    setAgents(prev => prev.filter(a => a.id !== agentId));
    if (activeAgent?.id === agentId) setView('gallery');
  }

  // ── Run agent ───────────────────────────────────────────────

  async function openRunner(agent: Agent) {
    setActiveAgent(agent);
    // Start a fresh conversation row in Supabase
    const { data } = await supabase
      .from('agent_conversations')
      .insert({ agent_id: agent.id, user_id: userId })
      .select()
      .single();
    if (data) {
      setConversation({ ...data, messages: [] });
    }
    setInput('');
    setView('runner');
  }

  // Run a community agent (no DB write for the read-only viewer)
  async function openCommunityRunner(agent: Agent) {
    setActiveAgent(agent);
    setConversation({ id: 'preview', agent_id: agent.id, title: null, messages: [] });
    setInput('');
    setView('runner');
  }

  const sendMessage = useCallback(async () => {
    if (!input.trim() || !activeAgent || !conversation || thinking) return;
    const userMsg: Message = { id: crypto.randomUUID(), role: 'user', content: input.trim() };
    const history = [...(conversation.messages ?? []), userMsg];
    setConversation(prev => prev ? { ...prev, messages: history } : prev);
    setInput('');
    setThinking(true);

    // Build messages array for the AI call
    const aiMessages = [
      { role: 'system' as const, content: activeAgent.system_prompt },
      ...history.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
    ];

    try {
      // callAI is your existing service — pass model_pref as a hint
      const { content, provider } = await callAI({
        messages: aiMessages,
        modelPref: activeAgent.model_pref,
      });

      const assistantMsg: Message = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content,
        provider_used: provider,
      };

      const updatedMessages = [...history, assistantMsg];
      setConversation(prev => prev ? { ...prev, messages: updatedMessages } : prev);

      // Persist to Supabase (skip for community preview sessions)
      if (conversation.id !== 'preview') {
        await supabase.from('agent_messages').insert([
          { conversation_id: conversation.id, role: 'user',      content: userMsg.content },
          { conversation_id: conversation.id, role: 'assistant', content, provider_used: provider },
        ]);

        // Auto-title the conversation from the first user message
        if (!conversation.title) {
          const title = userMsg.content.slice(0, 60);
          await supabase
            .from('agent_conversations')
            .update({ title })
            .eq('id', conversation.id);
          setConversation(prev => prev ? { ...prev, title } : prev);
        }
      }
    } catch (err: any) {
      const errMsg: Message = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: `Something went wrong: ${err.message ?? 'Unknown error'}. Try again.`,
      };
      setConversation(prev => prev ? { ...prev, messages: [...history, errMsg] } : prev);
    } finally {
      setThinking(false);
    }
  }, [input, activeAgent, conversation, thinking]);

  // ── Share token copy ────────────────────────────────────────

  async function copyShareLink(agent: Agent) {
    const url = `${window.location.origin}/cowork/agent/${agent.share_token}`;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  // ── Not eligible ────────────────────────────────────────────

  if (eligible === false) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center p-6">
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-10 max-w-md text-center space-y-4">
          <Lock className="w-12 h-12 text-emerald-500 mx-auto" />
          <h2 className="text-white text-2xl font-semibold">Agent Builder</h2>
          <p className="text-gray-400 text-sm leading-relaxed">
            Agent Builder unlocks at the <strong className="text-white">Scout certification</strong> level.
            Complete your first AI certification challenge to get access.
          </p>
          <a
            href="/certifications"
            className="inline-block mt-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium px-5 py-2.5 rounded-lg transition-colors"
          >
            View Certifications
          </a>
        </div>
      </div>
    );
  }

  if (eligible === null) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-emerald-500 animate-spin" />
      </div>
    );
  }

  // ── Gallery view ────────────────────────────────────────────

  if (view === 'gallery') {
    return (
      <div className="min-h-screen bg-gray-950 text-white">
        {/* Header */}
        <div className="border-b border-gray-800 px-6 py-5">
          <div className="max-w-5xl mx-auto flex items-center justify-between">
            <div>
              <h1 className="text-xl font-semibold text-white flex items-center gap-2">
                <Bot className="w-5 h-5 text-emerald-400" />
                Agent Builder
              </h1>
              <p className="text-gray-500 text-sm mt-0.5">
                Build, run, and share your own AI agents
              </p>
            </div>
            <button
              onClick={openNewBuilder}
              className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
            >
              <PlusCircle className="w-4 h-4" />
              New Agent
            </button>
          </div>
        </div>

        {/* Tab bar */}
        <div className="border-b border-gray-800 px-6">
          <div className="max-w-5xl mx-auto flex gap-6">
            {(['mine', 'community'] as const).map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`text-sm py-3 border-b-2 transition-colors font-medium ${
                  tab === t
                    ? 'border-emerald-500 text-emerald-400'
                    : 'border-transparent text-gray-500 hover:text-gray-300'
                }`}
              >
                {t === 'mine' ? 'My Agents' : 'Community Agents'}
              </button>
            ))}
          </div>
        </div>

        {/* Agent grid */}
        <div className="max-w-5xl mx-auto px-6 py-8">
          {tab === 'mine' && (
            agents.length === 0
              ? <EmptyState onNew={openNewBuilder} />
              : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {agents.map(agent => (
                    <AgentCard
                      key={agent.id}
                      agent={agent}
                      isOwner
                      onRun={() => openRunner(agent)}
                      onEdit={() => openEditBuilder(agent)}
                      onDelete={() => deleteAgent(agent.id)}
                      onCopyLink={() => copyShareLink(agent)}
                      copied={copied}
                    />
                  ))}
                </div>
              )
          )}
          {tab === 'community' && (
            communityAgents.length === 0
              ? (
                <div className="text-center py-20 text-gray-600">
                  No shared agents yet. Be the first to share one!
                </div>
              )
              : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {communityAgents.map(agent => (
                    <AgentCard
                      key={agent.id}
                      agent={agent}
                      isOwner={false}
                      onRun={() => openCommunityRunner(agent)}
                    />
                  ))}
                </div>
              )
          )}
        </div>
      </div>
    );
  }

  // ── Builder view ────────────────────────────────────────────

  if (view === 'builder') {
    return (
      <div className="min-h-screen bg-gray-950 text-white">
        {/* Header */}
        <div className="border-b border-gray-800 px-6 py-4">
          <div className="max-w-2xl mx-auto flex items-center gap-3">
            <button
              onClick={() => setView('gallery')}
              className="text-gray-500 hover:text-white transition-colors"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <h1 className="text-lg font-semibold">
              {activeAgent ? 'Edit Agent' : 'New Agent'}
            </h1>
          </div>
        </div>

        <div className="max-w-2xl mx-auto px-6 py-8 space-y-6">
          {/* Name */}
          <Field label="Agent name" hint="What is this agent called?">
            <input
              value={draft.name}
              onChange={e => setDraft(d => ({ ...d, name: e.target.value }))}
              maxLength={80}
              placeholder="e.g. Agriculture Advisor, Code Reviewer, Study Partner"
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2.5 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-emerald-500 transition-colors"
            />
          </Field>

          {/* Description */}
          <Field label="Short description" hint="One or two sentences. What does this agent do?">
            <textarea
              value={draft.description}
              onChange={e => setDraft(d => ({ ...d, description: e.target.value }))}
              maxLength={300}
              rows={2}
              placeholder="Helps farmers in the Niger Delta identify crop diseases and choose treatments."
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2.5 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-emerald-500 transition-colors resize-none"
            />
          </Field>

          {/* System prompt */}
          <Field
            label="System prompt"
            hint="Tell the agent who it is, what it knows, and how it should behave. This is the most important part."
          >
            <textarea
              value={draft.system_prompt}
              onChange={e => setDraft(d => ({ ...d, system_prompt: e.target.value }))}
              maxLength={4000}
              rows={10}
              placeholder={`You are an expert agriculture advisor for farmers in the Niger Delta, Bayelsa State, Nigeria.\n\nYou know about:\n- Cassava, yam, plantain, and vegetable farming in tropical climates\n- Common crop diseases and organic treatments\n- Seasonal planting cycles in southern Nigeria\n- Low-cost farming techniques appropriate for smallholder farmers\n\nSpeak clearly and simply. When the farmer describes a problem, ask one clarifying question before giving advice. Always give practical, affordable solutions first.`}
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2.5 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-emerald-500 transition-colors resize-none font-mono"
            />
            <div className="text-right text-xs text-gray-600 mt-1">
              {draft.system_prompt.length} / 4000
            </div>
          </Field>

          {/* Model preference */}
          <Field label="Model preference" hint="Auto works best for most agents.">
            <select
              value={draft.model_pref}
              onChange={e => setDraft(d => ({ ...d, model_pref: e.target.value }))}
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:border-emerald-500 transition-colors"
            >
              {MODEL_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </Field>

          {/* Share toggle */}
          <div className="flex items-start gap-3 bg-gray-900 border border-gray-800 rounded-lg p-4">
            <input
              type="checkbox"
              id="is_shared"
              checked={draft.is_shared}
              onChange={e => setDraft(d => ({ ...d, is_shared: e.target.checked }))}
              className="mt-0.5 accent-emerald-500 w-4 h-4 cursor-pointer"
            />
            <label htmlFor="is_shared" className="cursor-pointer">
              <div className="text-sm font-medium text-white flex items-center gap-1.5">
                <Globe className="w-3.5 h-3.5 text-emerald-400" />
                Share with the NextVillage community
              </div>
              <div className="text-xs text-gray-500 mt-0.5">
                Other learners will be able to find and run your agent. Your system prompt will be visible.
              </div>
            </label>
          </div>

          {saveError && (
            <div className="flex items-center gap-2 text-red-400 text-sm bg-red-900/20 border border-red-800 rounded-lg px-4 py-3">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {saveError}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button
              onClick={() => setView('gallery')}
              className="flex-1 border border-gray-700 text-gray-400 hover:text-white text-sm font-medium px-4 py-2.5 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={saveAgent}
              disabled={saving}
              className="flex-1 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm font-medium px-4 py-2.5 rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {saving ? 'Saving…' : 'Save Agent'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Runner view ─────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col">
      {/* Header */}
      <div className="border-b border-gray-800 px-4 py-3 shrink-0">
        <div className="max-w-3xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => setView('gallery')}
              className="text-gray-500 hover:text-white transition-colors shrink-0"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-white truncate">
                {activeAgent?.name}
              </p>
              <p className="text-xs text-gray-500 truncate">
                {activeAgent?.description}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {activeAgent?.user_id === userId && (
              <button
                onClick={() => activeAgent && openEditBuilder(activeAgent)}
                className="text-gray-500 hover:text-white transition-colors p-1.5"
                title="Edit agent"
              >
                <Settings2 className="w-4 h-4" />
              </button>
            )}
            {activeAgent?.is_shared && activeAgent?.share_token && (
              <button
                onClick={() => activeAgent && copyShareLink(activeAgent)}
                className="text-gray-500 hover:text-emerald-400 transition-colors p-1.5"
                title="Copy share link"
              >
                {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-4 py-6 space-y-5">
          {conversation?.messages.length === 0 && (
            <div className="text-center py-16 space-y-3">
              <Bot className="w-10 h-10 text-emerald-500/40 mx-auto" />
              <p className="text-gray-600 text-sm">
                {activeAgent?.name} is ready. Send a message to begin.
              </p>
            </div>
          )}
          {conversation?.messages.map(msg => (
            <ChatBubble key={msg.id} message={msg} />
          ))}
          {thinking && (
            <div className="flex items-start gap-3">
              <div className="w-7 h-7 rounded-full bg-emerald-900 border border-emerald-700 flex items-center justify-center shrink-0 mt-0.5">
                <Bot className="w-3.5 h-3.5 text-emerald-400" />
              </div>
              <div className="bg-gray-900 border border-gray-800 rounded-2xl rounded-tl-sm px-4 py-3">
                <Loader2 className="w-4 h-4 text-emerald-400 animate-spin" />
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input */}
      <div className="border-t border-gray-800 px-4 py-4 shrink-0">
        <div className="max-w-3xl mx-auto flex gap-3">
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
            }}
            rows={1}
            placeholder="Message your agent… (Enter to send, Shift+Enter for new line)"
            className="flex-1 bg-gray-900 border border-gray-700 rounded-xl px-4 py-3 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-emerald-500 transition-colors resize-none"
            style={{ minHeight: '44px', maxHeight: '160px' }}
          />
          <button
            onClick={sendMessage}
            disabled={!input.trim() || thinking}
            className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white px-4 rounded-xl transition-colors shrink-0 flex items-center justify-center"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────

function AgentCard({
  agent, isOwner, onRun, onEdit, onDelete, onCopyLink, copied
}: {
  agent: Agent;
  isOwner: boolean;
  onRun: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onCopyLink?: () => void;
  copied?: boolean;
}) {
  return (
    <div className="bg-gray-900 border border-gray-800 hover:border-gray-700 rounded-xl p-5 flex flex-col gap-4 transition-colors">
      <div className="flex items-start justify-between gap-2">
        <div className="w-9 h-9 rounded-lg bg-emerald-900/50 border border-emerald-800 flex items-center justify-center shrink-0">
          <Bot className="w-4 h-4 text-emerald-400" />
        </div>
        {agent.is_shared && (
          <span className="text-xs text-emerald-400 bg-emerald-900/30 border border-emerald-800/50 px-2 py-0.5 rounded-full flex items-center gap-1">
            <Globe className="w-3 h-3" />
            Shared
          </span>
        )}
      </div>

      <div className="flex-1 min-h-0">
        <h3 className="text-white font-semibold text-sm leading-snug">{agent.name}</h3>
        <p className="text-gray-500 text-xs mt-1 line-clamp-2 leading-relaxed">
          {agent.description || 'No description.'}
        </p>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={onRun}
          className="flex-1 flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium px-3 py-2 rounded-lg transition-colors"
        >
          <Play className="w-3.5 h-3.5" />
          Run
        </button>
        {isOwner && onEdit && (
          <button
            onClick={onEdit}
            className="p-2 text-gray-500 hover:text-white border border-gray-700 hover:border-gray-600 rounded-lg transition-colors"
            title="Edit"
          >
            <Settings2 className="w-3.5 h-3.5" />
          </button>
        )}
        {isOwner && agent.is_shared && onCopyLink && (
          <button
            onClick={onCopyLink}
            className="p-2 text-gray-500 hover:text-emerald-400 border border-gray-700 hover:border-gray-600 rounded-lg transition-colors"
            title="Copy share link"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Share2 className="w-3.5 h-3.5" />}
          </button>
        )}
        {isOwner && onDelete && (
          <button
            onClick={onDelete}
            className="p-2 text-gray-500 hover:text-red-400 border border-gray-700 hover:border-gray-600 rounded-lg transition-colors"
            title="Delete"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}

function ChatBubble({ message }: { message: Message }) {
  const isUser = message.role === 'user';
  return (
    <div className={`flex items-start gap-3 ${isUser ? 'flex-row-reverse' : ''}`}>
      <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-0.5 text-xs font-bold ${
        isUser
          ? 'bg-indigo-900 border border-indigo-700 text-indigo-300'
          : 'bg-emerald-900 border border-emerald-700 text-emerald-400'
      }`}>
        {isUser ? 'U' : <Bot className="w-3.5 h-3.5" />}
      </div>
      <div className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
        isUser
          ? 'bg-indigo-900/50 border border-indigo-800 rounded-tr-sm text-indigo-100'
          : 'bg-gray-900 border border-gray-800 rounded-tl-sm text-gray-100'
      }`}>
        {message.content}
        {message.provider_used && (
          <div className="text-xs text-gray-600 mt-2 pt-2 border-t border-gray-800">
            via {message.provider_used}
          </div>
        )}
      </div>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium text-white">{label}</label>
      {hint && <p className="text-xs text-gray-500">{hint}</p>}
      {children}
    </div>
  );
}

function EmptyState({ onNew }: { onNew: () => void }) {
  return (
    <div className="text-center py-20 space-y-4">
      <Bot className="w-12 h-12 text-gray-700 mx-auto" />
      <div>
        <p className="text-white font-medium">No agents yet</p>
        <p className="text-gray-500 text-sm mt-1">
          Build your first agent — give it a name, a purpose, and a system prompt.
        </p>
      </div>
      <button
        onClick={onNew}
        className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium px-5 py-2.5 rounded-lg transition-colors"
      >
        <PlusCircle className="w-4 h-4" />
        Build your first agent
      </button>
    </div>
  );
}

// ─── Utility ──────────────────────────────────────────────────

function slugify(str: string): string {
  return str
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60)
    + '-' + Math.random().toString(36).slice(2, 7);
}
