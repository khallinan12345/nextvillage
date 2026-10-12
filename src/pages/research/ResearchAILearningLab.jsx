import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "../../lib/supabaseClient";
import Sidebar from "../../components/layout/Sidebar";
import { useAuth } from "../../hooks/useAuth";

// ─── DESIGN TOKENS ─────────────────────────────────────────────────────────────
const C = {
  navy:    "#1B2A4A",
  navyDk:  "#111D33",
  navyMd:  "#253660",
  gold:    "#C8963E",
  goldLt:  "#E6B96A",
  teal:    "#2A7B88",
  tealLt:  "#3D9AA8",
  sage:    "#5B7A6A",
  cream:   "#FAF8F4",
  parchment: "#F2EFE8",
  sand:    "#E8E2D6",
  sandDk:  "#D4CCBC",
  charcoal:"#2D2D2D",
  mid:     "#6B6560",
  muted:   "#9A9490",
  white:   "#FFFFFF",
  success: "#2E7D32",
  successLt:"#E8F5E9",
  warn:    "#E65100",
  warnLt:  "#FFF3E0",
  blue:    "#3D6B99",
};


// ─── LONGITUDINAL DATA HOOK ───────────────────────────────────────────────────
function useLongitudinalData(site) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function load() {
      try {
        const { data: result, error: err } = await supabase.rpc(
          "get_longitudinal_summary",
          { p_site: site || null }
        );
        if (err) throw new Error(err.message);
        setData(result);
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [site]);

  return { data, loading, error };
}

// ─── PHASE 0 AI ORIENTATION HOOK ─────────────────────────────────────────────
function usePhase0AI(longitudinalData, project, moduleContext) {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);

  const systemPrompt = useCallback(() => {
    const ld = longitudinalData;
    const cohort = ld?.cohort ?? {};
    const persist = ld?.persistence ?? {};
    const monthly = ld?.monthly_trend ?? [];
    const topPersist = ld?.top_persistent ?? [];
    const topAchieve = ld?.top_achievers ?? [];
    const siteComp = ld?.site_comparison ?? [];
    const scaffold = ld?.scaffold_convergence ?? {};
    const notes = ld?.data_notes ?? {};

    return `You are a data orientation guide for the vAI AI Learning Lab Research Program. You are helping a youth researcher (aged 16–22, based in Nigeria) understand and explore real anonymized platform data before they begin their research study.

YOUR ROLE IN PHASE 0:
You are in TEACHING and GUIDED EXPLORATION mode — not task-completion mode.
- Teach the researcher what every metric means in plain language
- Show them concrete examples from the REAL DATA below
- Help them form their first longitudinal sub-questions
- Demonstrate how to think longitudinally (across months) not just in snapshots
- Be enthusiastic — this is exciting real data about their community

CURRENT MODULE: ${moduleContext?.name ?? "Data Orientation"}
MODULE GOAL: ${moduleContext?.goal ?? "Help the researcher understand the platform data"}

RESEARCH STUDY: ${project?.title ?? ""}
STUDY QUESTION: ${project?.question ?? ""}

═══════════════════════════════════════════════════════
REAL ANONYMIZED PLATFORM DATA (k-anonymized, min group 5)
═══════════════════════════════════════════════════════

COHORT OVERVIEW:
- Unique learners in dataset: ${cohort.total_unique_learners ?? "unknown"}
- Sites: ${JSON.stringify(cohort.sites ?? [])}
- Data spans: ${cohort.date_range?.first ?? "?"} to ${cohort.date_range?.last ?? "?"}
- Average months active per learner: ${cohort.avg_months_active ?? "unknown"}
- Average sessions per month: ${cohort.avg_sessions_per_month ?? "unknown"}
- Average PUE score (0–100): ${cohort.avg_pue ?? "not yet available"}
- Average cognitive score (0–100): ${cohort.avg_cognitive ?? "unknown"}
- Total certifications earned: ${cohort.total_certs_earned ?? 0}
- Total activities completed: ${cohort.total_activities_completed ?? 0}

PERSISTENCE TIERS:
- Highly persistent (4+ months): ${persist.highly_persistent ?? 0} learners
- Moderately persistent (2–3 months): ${persist.moderately_persistent ?? 0} learners  
- Single month only: ${persist.single_month ?? 0} learners
- Most months any learner active: ${persist.most_persistent_months ?? 0}

MOST PERSISTENT LEARNERS (anonymized tokens):
${topPersist.map(l => `  • ${l.token} | ${l.site} | ${l.months_active} months | avg ${l.avg_sessions} sessions/month | PUE: ${l.avg_pue ?? "n/a"} | Certs: ${l.certs_earned}`).join("\n")}

TOP ACHIEVERS BY COMPLETIONS:
${topAchieve.map(l => `  • ${l.token} | ${l.site} | ${l.activities_completed} completions | ${l.certs_earned} certs | ${l.months_active} months | avg ${l.avg_sessions} sessions/month`).join("\n")}

MONTHLY TREND (cohort averages by month):
${monthly.slice(-6).map(m => `  ${m.month} | ${m.site} | ${m.unique_learners} learners | avg sessions: ${m.avg_sessions} | avg PUE: ${m.avg_pue ?? "n/a"} | completions: ${m.completions} | certs: ${m.certs}`).join("\n")}

SITE COMPARISON:
${siteComp.map(s => `  ${s.site}: ${s.learners} learners | avg ${s.avg_months} months active | avg ${s.avg_sessions} sessions/month | avg PUE: ${s.avg_pue ?? "n/a"} | total certs: ${s.total_certs}`).join("\n")}

SCAFFOLDING CONVERGENCE (is AI helping learners become more independent?):
- Converging (getting more independent): ${scaffold.converging ?? 0}
- Stable: ${scaffold.stable ?? 0}
- Diverging (needing more help over time): ${scaffold.diverging ?? 0}
- ${scaffold.description ?? ""}

DATA QUALITY NOTES:
- AI proficiency scores available: ${notes.ai_prof_available ? "yes" : "not yet — assessments pending"}
- PUE scores available: ${notes.pue_available ? "yes" : "not yet"}
- Earliest data: ${notes.earliest_data ?? "unknown"}
- Latest data: ${notes.latest_date ?? "unknown"}
- Possible teacher/admin accounts (zero sessions, high scores): ${notes.possible_admin_accounts ?? 0}
- Learners with zero session records: ${notes.null_session_learners ?? 0}
- Ghost records (no assessment data): ${notes.ghost_records ?? 0}
- ${notes.note ?? ""}

IMPORTANT FOR TEACHING DATA QUALITY:
When a learner has zero sessions but high PUE/cognitive scores, this is likely a teacher or site_leader account — their scores come from formal assessments, not platform sessions. This is a great teaching moment about the difference between behavioral data (sessions) and assessment data (scores).
Ghost records (null PUE, null cognitive) exist in the dataset — a learner enrolled but never completed an assessment. This is normal in real research data and worth discussing.

═══════════════════════════════════════════════════════
HOW TO TEACH LONGITUDINAL THINKING:
═══════════════════════════════════════════════════════
Many researchers think in snapshots ("what's the score now?"). 
Your job is to teach them to think in TRAJECTORIES ("how is this changing over time?").

Example sub-questions to teach with:
1. "Which learners are most persistent month-to-month, and how are their skills growing?"
2. "Do learners who complete more activities show higher PUE scores over time?"
3. "Is there a difference between Oloibiri and Ibiade learners in how quickly they progress?"
4. "Do learners who start with low session counts but persist eventually catch up?"
5. "What does it look like when a learner's scaffolding is converging — becoming more independent?"

TEACHING APPROACH:
- Start with a concrete example from the real data above
- Ask the researcher "what do you notice?" before explaining
- Help them form their OWN sub-question using this template:
  "I want to understand [WHO] and how [WHAT] changes [OVER WHAT TIME PERIOD] and [WHY IT MATTERS]"
- Celebrate when they spot something interesting in the data
- Always connect back to their specific study question

BOUNDARIES:
- Write at a clear, accessible level — researcher may be 16–22 years old
- Never just dump all the data — introduce it piece by piece
- Ask one question at a time
- Maximum 3–4 short paragraphs per response unless they ask for more
- Celebrate curiosity and good questions`;
  }, [longitudinalData, project, moduleContext]);

  const initModule = useCallback(async (moduleName, moduleGoal, openingPrompt) => {
    setLoading(true);
    setMessages([]);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          page: "ResearchDataExplorer",
          system: systemPrompt(),
          max_tokens: 1000,
          messages: [{ role: "user", content: openingPrompt }],
        }),
      });
      const d = await res.json();
      const text = d.choices?.[0]?.message?.content
        ?? d.content?.find(b => b.type === "text")?.text
        ?? "";
      setMessages([{ role: "ai", text, ts: Date.now() }]);
    } catch {
      setMessages([{ role: "ai", text: "I'm having trouble connecting right now. Please try again in a moment.", ts: Date.now() }]);
    }
    setLoading(false);
  }, [systemPrompt]);

  const send = useCallback(async (userMsg, history) => {
    setLoading(true);
    const msgs = [
      ...history.map(m => ({ role: m.role === "ai" ? "assistant" : "user", content: m.text })),
      { role: "user", content: userMsg }
    ];
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          page: "ResearchDataExplorer",
          system: systemPrompt(),
          max_tokens: 1000,
          messages: msgs,
        }),
      });
      const d = await res.json();
      const text = d.choices?.[0]?.message?.content
        ?? d.content?.find(b => b.type === "text")?.text
        ?? "Connection issue — please try again.";
      setMessages(prev => [...prev, { role: "ai", text, ts: Date.now() }]);
    } catch {
      setMessages(prev => [...prev, { role: "ai", text: "Connection issue — please try again.", ts: Date.now() }]);
    }
    setLoading(false);
  }, [systemPrompt]);

  return { messages, loading, initModule, send, setMessages };
}

// ─── PHASE 0 MODULES ─────────────────────────────────────────────────────────
const PHASE0_MODULES = [
  {
    id: 0,
    name: "What Data Do We Have?",
    icon: "🗂️",
    goal: "Understand every field in the dataset and what it means",
    openingPrompt: "Please introduce me to the vAI platform data. Walk me through what we have — what fields exist, what they mean, and what stories they can tell. Start with the most important ones.",
    quickPrompts: [
      "What does PUE score mean?",
      "Explain AI proficiency score to me",
      "What is scaffolding convergence?",
      "What does session count tell us?",
      "Show me what the cohort looks like overall",
    ]
  },
  {
    id: 1,
    name: "Your First Longitudinal Question",
    icon: "❓",
    goal: "Form a precise sub-question and learn to think across time",
    openingPrompt: "I want to learn how to think longitudinally — across months, not just one snapshot. Can you show me a concrete example from our real data, and then help me form my own sub-question?",
    quickPrompts: [
      "Show me an example of a longitudinal question",
      "Which learners are most persistent in our data?",
      "Help me form a sub-question about engagement over time",
      "What does 'thinking longitudinally' mean exactly?",
      "How is the most persistent learner growing?",
    ]
  },
  {
    id: 2,
    name: "Explore With AI",
    icon: "🔍",
    goal: "Run your own explorations with AI assistance",
    openingPrompt: "I want to explore the data myself. Can you help me investigate a few things? Let's start by looking at which learners have improved the most over time.",
    quickPrompts: [
      "Compare Oloibiri and Ibiade learners",
      "Show me the monthly trend in sessions and PUE",
      "Which learners have completed the most activities?",
      "What does scaffolding convergence look like in this cohort?",
      "Are there learners who started slow but grew a lot?",
    ]
  },
  {
    id: 3,
    name: "What Is Missing?",
    icon: "🕳️",
    goal: "Identify gaps in the platform data that primary collection will fill",
    openingPrompt: "Help me understand what this dataset cannot tell us. What are the gaps — things the platform data misses that my surveys, interviews, and observations will need to capture?",
    quickPrompts: [
      "What can't session count tell us?",
      "What does PUE score miss about real community impact?",
      "What would interviews reveal that this data can't?",
      "What demographic information is missing?",
      "What would make this dataset more complete?",
    ]
  },
  {
    id: 4,
    name: "Connect to Your Study",
    icon: "🔗",
    goal: "Link what you found to your specific research question",
    openingPrompt: "Help me connect what I've learned about the platform data to my specific research question. What baseline does the existing data give me, and what new insights will my study add?",
    quickPrompts: [
      "What baseline does this data give my study?",
      "What patterns already visible relate to my question?",
      "How should I frame my study given what we already know?",
      "What early signals exist in the data for my question?",
      "Help me write my orientation summary",
    ]
  },
];


// ─── DATA DICTIONARY ─────────────────────────────────────────────────────────
const DATA_DICTIONARY = [
  {
    group: "Identity & Time",
    color: C.navy,
    fields: [
      { name: "learner_token", scale: "text", desc: "Anonymous stable ID for each learner. Same token across all months — never reveals who the learner is." },
      { name: "site", scale: "text", desc: "Community location: Oloibiri, Ibiade, Lagos, Accra, Kigali." },
      { name: "activity_date", scale: "date", desc: "The specific day this snapshot was taken." },
      { name: "cohort_month", scale: "date", desc: "First day of the month — used to group learners by month." },
      { name: "grade_band", scale: "1-4 / 5-8 / 9-12", desc: "Learner's grade level bucketed into bands to protect privacy." },
    ]
  },
  {
    group: "Session Activity",
    color: C.teal,
    fields: [
      { name: "session_count", scale: "integer", desc: "Total AI sessions this month. One session = one conversation with the AI coach." },
      { name: "engaged_session_count", scale: "integer", desc: "Sessions where the learner asked more than minimal questions — a measure of depth." },
      { name: "avg_words_per_session", scale: "integer", desc: "Average number of words the learner typed per session. More words = deeper engagement." },
      { name: "activities_started_today", scale: "integer", desc: "New learning activities started on this specific day." },
      { name: "activities_completed_today", scale: "integer", desc: "Activities marked complete on this day." },
      { name: "certifications_earned_today", scale: "integer", desc: "Certificates earned on this day." },
      { name: "activities_completed_total", scale: "integer", desc: "Running total of all activities completed up to this date." },
    ]
  },
  {
    group: "AI Proficiency (0–3 scale)",
    color: C.gold,
    fields: [
      { name: "ai_prof_application_score", scale: "0–3", desc: "Can the learner apply AI to solve real problems? 0=none, 1=emerging, 2=developing, 3=proficient." },
      { name: "ai_prof_ethics_score", scale: "0–3", desc: "Does the learner understand AI ethics, bias, and responsible use?" },
      { name: "ai_prof_understanding_score", scale: "0–3", desc: "Does the learner understand how AI works conceptually?" },
      { name: "ai_prof_verification_score", scale: "0–3", desc: "Does the learner check and verify AI outputs rather than accepting them blindly?" },
      { name: "ai_prof_min_score", scale: "0–3", desc: "The lowest of the four proficiency scores — the 'weakest link' measure." },
      { name: "ai_prof_cert_level", scale: "text", desc: "Certification level achieved: Emerging / Developing / Proficient." },
    ]
  },
  {
    group: "Cognitive Skills (0–100 scale)",
    color: C.sage,
    fields: [
      { name: "cognitive_score", scale: "0–100", desc: "Overall cognitive engagement score — how deeply the learner is thinking." },
      { name: "critical_thinking_score", scale: "0–100", desc: "Evidence of evaluating claims, questioning assumptions, logical reasoning." },
      { name: "problem_solving_score", scale: "0–100", desc: "Breaking down problems, iterating on solutions, measuring outcomes." },
      { name: "creativity_score", scale: "0–100", desc: "Originality, risk-taking, exploring new ideas." },
    ]
  },
  {
    group: "Reasoning Levels",
    color: C.blue,
    fields: [
      { name: "reasoning_level_0", scale: "0–100%", desc: "Definitional — learner only asks 'what is X?' type questions. Lowest depth." },
      { name: "reasoning_level_1", scale: "0–100%", desc: "Responsive — learner responds to AI prompts but doesn't initiate deeper thinking." },
      { name: "reasoning_level_2", scale: "0–100%", desc: "Elaborative — learner builds on ideas, asks follow-up questions, connects concepts." },
      { name: "reasoning_level_3", scale: "0–100%", desc: "Structured — learner constructs arguments, plans, or multi-step reasoning chains. Highest depth." },
      { name: "reasoning_chain_count", scale: "integer", desc: "Number of extended reasoning sequences (3+ connected exchanges) in the month." },
    ]
  },
  {
    group: "Scaffolding (AI Independence)",
    color: "#8B6B9C",
    fields: [
      { name: "scaffold_convergence_trend", scale: "converging / stable / diverging", desc: "Is the learner needing less AI help over time (converging = growing independence) or more (diverging)?" },
      { name: "scaffold_clarification_per_session", scale: "rate", desc: "How often the AI had to ask clarifying questions per session." },
      { name: "scaffold_decomposition_per_session", scale: "rate", desc: "How often the AI broke down a concept into smaller pieces for the learner." },
      { name: "scaffold_consecutive_correction_runs", scale: "count", desc: "Runs of consecutive corrections — high numbers suggest the learner is struggling." },
    ]
  },
  {
    group: "Metacognition",
    color: C.teal,
    fields: [
      { name: "metacog_verification_rate", scale: "rate", desc: "How often the learner checks their own understanding ('Did I get that right?')." },
      { name: "metacog_reactive_rate", scale: "rate", desc: "How often the learner responds to being corrected rather than self-checking." },
      { name: "metacog_strategic_rate", scale: "rate", desc: "How often the learner plans their learning strategy rather than just reacting." },
    ]
  },
  {
    group: "Productive Use of Energy — PUE (0–100)",
    color: C.gold,
    fields: [
      { name: "pue_score", scale: "0–100", desc: "Overall PUE score — is the learner using AI for real community/economic purposes? Higher = more productive real-world use." },
      { name: "pue_energy_constraint_pct", scale: "0–100%", desc: "% of AI interactions involving energy access or power constraints." },
      { name: "pue_market_pricing_pct", scale: "0–100%", desc: "% involving market prices, trading, or economic decisions." },
      { name: "pue_enterprise_planning_pct", scale: "0–100%", desc: "% involving planning a business, farm, or enterprise." },
      { name: "pue_learner_initiated_pct", scale: "0–100%", desc: "% of PUE interactions the learner started themselves (not AI-prompted)." },
      { name: "pue_multi_domain_pct", scale: "0–100%", desc: "% spanning multiple domains (e.g. health + farming). Shows integrated thinking." },
      { name: "pue_local_context_pct", scale: "0–100%", desc: "% referencing local community, culture, or context." },
    ]
  },
  {
    group: "Role Readiness & Community Impact",
    color: C.success,
    fields: [
      { name: "role_readiness_signal", scale: "0 or 1", desc: "1 = learner shows signs of being ready to teach or mentor others. Key spillover indicator." },
      { name: "peer_diffusion_signal", scale: "0 or 1", desc: "1 = learner is spreading AI knowledge to peers or family members." },
      { name: "role_teaching_intent_count", scale: "integer", desc: "Number of interactions showing intent to teach others." },
      { name: "role_community_application_count", scale: "integer", desc: "Interactions applying AI to community problems." },
      { name: "role_enterprise_orientation_count", scale: "integer", desc: "Interactions oriented toward enterprise or income generation." },
      { name: "role_intergenerational_count", scale: "integer", desc: "Interactions involving elders, family, or intergenerational knowledge transfer." },
    ]
  },
];

// ─── PHASE 0 COMPONENT ───────────────────────────────────────────────────────
function Phase0Orientation({ project, onComplete }) {
  const [activeModule, setActiveModule] = useState(0);
  const [completedModules, setCompletedModules] = useState(new Set());
  const [input, setInput] = useState("");
  const [showBadge, setShowBadge] = useState(false);
  const [leftTab, setLeftTab] = useState("data");   // "data" | "dictionary"
  const [expandedGroup, setExpandedGroup] = useState(null);
  const msgsRef = useRef(null);

  const { data: longitudinalData, loading: dataLoading } = useLongitudinalData();
  const module = PHASE0_MODULES[activeModule];
  const moduleCtx = { name: module.name, goal: module.goal };
  const { messages, loading: aiLoading, initModule, send, setMessages } = usePhase0AI(longitudinalData, project, moduleCtx);

  // Init module when longitudinal data loads or module changes
  useEffect(() => {
    if (!dataLoading && longitudinalData) {
      initModule(module.name, module.goal, module.openingPrompt);
    }
  }, [activeModule, dataLoading]);

  useEffect(() => {
    if (msgsRef.current) msgsRef.current.scrollTop = msgsRef.current.scrollHeight;
  }, [messages]);

  const handleSend = () => {
    if (!input.trim() || aiLoading) return;
    const msg = input.trim();
    setInput("");
    setMessages(prev => [...prev, { role: "user", text: msg, ts: Date.now() }]);
    send(msg, messages);
  };

  const markComplete = () => {
    const next = new Set(completedModules).add(activeModule);
    setCompletedModules(next);
    if (next.size === PHASE0_MODULES.length) {
      setShowBadge(true);
    } else {
      // Advance to next incomplete module
      const nextModule = PHASE0_MODULES.findIndex((_, i) => !next.has(i) && i > activeModule);
      if (nextModule !== -1) setActiveModule(nextModule);
    }
  };

  const allComplete = completedModules.size === PHASE0_MODULES.length;

  if (showBadge) return (
    <div style={{ padding: "60px 32px", textAlign: "center", maxWidth: 540, margin: "0 auto" }}>
      <div style={{ fontSize: 72, marginBottom: 16 }}>🏅</div>
      <div style={{
        fontFamily: "'Playfair Display', serif",
        fontSize: 26, fontWeight: 700, color: C.navy, marginBottom: 8
      }}>
        Data Explorer Badge Earned!
      </div>
      <div style={{ fontSize: 14, color: C.mid, marginBottom: 8, fontStyle: "italic" }}>
        Certified by University of Dayton
      </div>
      <div style={{ fontSize: 14, color: C.mid, marginBottom: 32, lineHeight: 1.7, maxWidth: 420, margin: "0 auto 32px" }}>
        You have completed the Data Orientation prerequisite. You now understand the vAI platform dataset, can think longitudinally, and are ready to begin Phase 1: Research Design.
      </div>
      <button
        onClick={onComplete}
        style={{
          padding: "14px 32px", borderRadius: 10,
          background: C.gold, border: "none", cursor: "pointer",
          color: C.white, fontSize: 16, fontWeight: 700,
          fontFamily: "'Playfair Display', serif",
        }}>
        Begin Phase 1: Research Design →
      </button>
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 120px)" }}>

      {/* Header */}
      <div style={{ padding: "16px 24px", background: C.navyDk, borderBottom: `2px solid ${C.gold}44` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
          <span style={{ fontSize: 18 }}>🧭</span>
          <span style={{ fontFamily: "'Playfair Display', serif", fontSize: 17, fontWeight: 700, color: C.white }}>
            Phase 0: Data Orientation
          </span>
          <span style={{ marginLeft: "auto", fontSize: 11, color: C.gold, fontWeight: 600, letterSpacing: 1, textTransform: "uppercase" }}>
            Prerequisite · Data Explorer Badge
          </span>
        </div>
        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.75)", lineHeight: 1.6, marginBottom: 6 }}>
          Welcome to the research team. Before you collect any new data, you need to understand the data that already exists.
          The vAI platform has been collecting information about learners since July 2025 — sessions, scores, activities, and more.
          This phase will teach you what that data means and how to explore it.
        </div>
        <div style={{ fontSize: 12, color: C.gold, fontStyle: "italic" }}>
          Complete all 5 modules below to earn your <strong>Data Explorer Badge</strong> and unlock Phase 1: Research Design.
        </div>
      </div>

      {/* Module Rail */}
      <div style={{ background: C.white, borderBottom: `1px solid ${C.sand}` }}>
        <div style={{ padding: "8px 16px 0", fontSize: 11, color: C.muted, fontStyle: "italic" }}>
          Work through each module in order. You must chat with the AI in each module before marking it complete.
        </div>
        <div style={{ display: "flex", gap: 0, overflowX: "auto" }}>
          {PHASE0_MODULES.map((m, i) => (
            <button key={i} onClick={() => setActiveModule(i)}
              style={{
                padding: "10px 16px", fontSize: 12, fontWeight: 600,
                border: "none", cursor: "pointer", whiteSpace: "nowrap",
                fontFamily: "'Source Serif 4', serif",
                background: "none",
                borderBottom: activeModule === i ? `3px solid ${C.gold}` : "3px solid transparent",
                color: activeModule === i ? C.navy : completedModules.has(i) ? C.success : C.mid,
              }}>
              {completedModules.has(i) ? "✓ " : ""}{m.icon} {m.name}
            </button>
          ))}
        </div>
      </div>

      {/* Main layout: data panel + chat */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 420px", flex: 1, minHeight: 0 }}>

        {/* Left: Data context panel */}
        <div style={{ overflowY: "auto", borderRight: `1px solid ${C.sand}`, display: "flex", flexDirection: "column" }}>

          {/* Left panel header */}
          <div style={{ padding: "16px 20px 0", borderBottom: `1px solid ${C.sand}` }}>
            <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 15, fontWeight: 700, color: C.navy, marginBottom: 4 }}>
              {module.icon} {module.name}
            </div>
            <div style={{ fontSize: 12, color: C.charcoal, lineHeight: 1.6, marginBottom: 8, background: `${C.gold}10`, border: `1px solid ${C.gold}33`, borderRadius: 6, padding: "8px 10px" }}>
              <strong>What you are looking at:</strong> This panel shows real anonymized data from the vAI platform.
              All learner names have been removed — you will only see anonymous tokens like "7b61fee9…".
              Use the <strong>Cohort Data</strong> tab to see summary statistics, and the <strong>Data Dictionary</strong> tab to understand what each column means.
            </div>
            <div style={{ fontSize: 11, color: C.muted, fontStyle: "italic", marginBottom: 10 }}>
              Your goal for this module: {module.goal}
            </div>
            {/* Tab switcher */}
            <div style={{ display: "flex", gap: 0 }}>
              {[
                { key: "data", label: "📊 Cohort Data" },
                { key: "dictionary", label: "📖 Data Dictionary" },
              ].map(t => (
                <button key={t.key} onClick={() => setLeftTab(t.key)}
                  style={{
                    padding: "7px 14px", fontSize: 11, fontWeight: 600, cursor: "pointer",
                    border: "none", background: "none", fontFamily: "'Source Serif 4', serif",
                    borderBottom: leftTab === t.key ? `2px solid ${C.gold}` : "2px solid transparent",
                    color: leftTab === t.key ? C.navy : C.muted,
                  }}>
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <div style={{ padding: "16px 20px", flex: 1, overflowY: "auto" }}>

          {/* Data Dictionary Tab */}
          {leftTab === "dictionary" && (
            <div>
              <div style={{ background: `${C.teal}10`, border: `1px solid ${C.teal}33`, borderRadius: 8, padding: "10px 12px", marginBottom: 14 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: C.teal, marginBottom: 4 }}>📖 How to use the Data Dictionary</div>
                <div style={{ fontSize: 12, color: C.charcoal, lineHeight: 1.6 }}>
                  Every column in the dataset is listed here by group. Click a group name to expand it and see all its fields.
                  Each field shows its <strong>name</strong> (what it's called in the database), its <strong>scale</strong> (what the numbers mean),
                  and a <strong>plain English description</strong>. If you want to know more, click <em>"Ask AI about this →"</em> and
                  your AI guide will explain it and show you what it looks like in the real data.
                </div>
              </div>
              {DATA_DICTIONARY.map((group, gi) => (
                <div key={gi} style={{ marginBottom: 8 }}>
                  <button
                    onClick={() => setExpandedGroup(expandedGroup === gi ? null : gi)}
                    style={{
                      width: "100%", padding: "9px 12px", borderRadius: 8, cursor: "pointer",
                      background: C.white, border: `1px solid ${C.sand}`,
                      display: "flex", justifyContent: "space-between", alignItems: "center",
                      fontFamily: "'Source Serif 4', serif",
                    }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: group.color }}>{group.group}</span>
                    <span style={{ fontSize: 11, color: C.muted }}>{group.fields.length} fields {expandedGroup === gi ? "▲" : "▼"}</span>
                  </button>
                  {expandedGroup === gi && (
                    <div style={{ border: `1px solid ${C.sand}`, borderTop: "none", borderRadius: "0 0 8px 8px", overflow: "hidden" }}>
                      {group.fields.map((f, fi) => (
                        <div key={fi} style={{
                          padding: "10px 12px",
                          borderBottom: fi < group.fields.length - 1 ? `1px solid ${C.sand}55` : "none",
                          background: fi % 2 === 0 ? C.white : C.cream,
                        }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 3 }}>
                            <code style={{ fontSize: 11, fontWeight: 700, color: group.color, fontFamily: "JetBrains Mono, monospace" }}>{f.name}</code>
                            <span style={{ fontSize: 10, color: C.muted, background: C.sand, padding: "2px 6px", borderRadius: 4 }}>{f.scale}</span>
                          </div>
                          <div style={{ fontSize: 11, color: C.charcoal, lineHeight: 1.5 }}>{f.desc}</div>
                          <button
                            onClick={() => {
                              const q = `Tell me more about the "${f.name}" column and show me what it looks like in our data.`;
                              setMessages(prev => [...prev, { role: "user", text: q, ts: Date.now() }]);
                              send(q, messages);
                              setLeftTab("data");
                            }}
                            style={{
                              marginTop: 6, padding: "3px 8px", fontSize: 10, cursor: "pointer",
                              border: `1px solid ${group.color}44`, borderRadius: 4,
                              background: "none", color: group.color, fontFamily: "'Source Serif 4', serif",
                            }}>
                            Ask AI about this →
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Cohort Data Tab */}
          {leftTab === "data" && dataLoading ? (
            <div style={{ color: C.muted, fontSize: 13, fontStyle: "italic" }}>Loading platform data…</div>
          ) : leftTab === "data" && longitudinalData ? (
            <div>
              {/* Cohort snapshot */}
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: C.muted, letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 8 }}>
                  Live Cohort Data
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  {[
                    { val: longitudinalData.cohort?.total_unique_learners, lbl: "Unique Learners" },
                    { val: longitudinalData.cohort?.avg_months_active, lbl: "Avg Months Active" },
                    { val: longitudinalData.cohort?.avg_sessions_per_month, lbl: "Avg Sessions/Month" },
                    { val: longitudinalData.cohort?.avg_pue ? longitudinalData.cohort.avg_pue + "%" : "—", lbl: "Avg PUE Score" },
                    { val: longitudinalData.cohort?.avg_cognitive ? longitudinalData.cohort.avg_cognitive + "%" : "—", lbl: "Avg Cognitive" },
                    { val: longitudinalData.cohort?.total_certs_earned, lbl: "Total Certs Earned" },
                  ].map((s, i) => (
                    <div key={i} style={{ background: C.white, border: `1px solid ${C.sand}`, borderRadius: 8, padding: "10px 12px" }}>
                      <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 20, fontWeight: 700, color: C.navy }}>{s.val ?? "—"}</div>
                      <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>{s.lbl}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Persistence */}
              <div style={{ marginBottom: 16, background: C.white, border: `1px solid ${C.sand}`, borderRadius: 8, padding: "14px 16px" }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: C.muted, letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 8 }}>
                  Learner Persistence
                </div>
                {[
                  { label: "Highly Persistent (4+ months)", val: longitudinalData.persistence?.highly_persistent ?? 0, color: C.success },
                  { label: "Moderately Persistent (2–3 months)", val: longitudinalData.persistence?.moderately_persistent ?? 0, color: C.gold },
                  { label: "Single Month Only", val: longitudinalData.persistence?.single_month ?? 0, color: C.muted },
                ].map((p, i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                    <span style={{ fontSize: 12, color: C.charcoal }}>{p.label}</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: p.color }}>{p.val}</span>
                  </div>
                ))}
              </div>

              {/* Site comparison */}
              {longitudinalData.site_comparison?.length > 0 && (
                <div style={{ background: C.white, border: `1px solid ${C.sand}`, borderRadius: 8, padding: "14px 16px" }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: C.muted, letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 8 }}>
                    Site Comparison
                  </div>
                  {longitudinalData.site_comparison.map((s, i) => (
                    <div key={i} style={{ marginBottom: 10, paddingBottom: 10, borderBottom: i < longitudinalData.site_comparison.length - 1 ? `1px solid ${C.sand}` : "none" }}>
                      <div style={{ fontWeight: 700, color: C.navy, fontSize: 13, marginBottom: 4 }}>{s.site}</div>
                      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                        {[
                          { v: s.learners, l: "Learners" },
                          { v: s.avg_months, l: "Avg Months" },
                          { v: s.avg_sessions, l: "Avg Sessions" },
                          { v: s.avg_pue ? s.avg_pue + "%" : "—", l: "Avg PUE" },
                        ].map((m, j) => (
                          <div key={j}>
                            <div style={{ fontSize: 14, fontWeight: 700, color: C.teal }}>{m.v ?? "—"}</div>
                            <div style={{ fontSize: 10, color: C.muted }}>{m.l}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : leftTab === "data" ? (
            <div style={{ color: C.warn, fontSize: 13 }}>Could not load platform data. Check your connection.</div>
          ) : null}

          </div>{/* /tab content */}

          {/* Mark complete button */}
          <div style={{ marginTop: 20 }}>
            <div style={{ fontSize: 11, color: C.muted, marginBottom: 6, lineHeight: 1.5 }}>
              {completedModules.has(activeModule)
                ? "✓ You have completed this module. Move to the next tab above."
                : messages.length < 3
                  ? "💬 Chat with the AI first — ask at least 2–3 questions before marking complete."
                  : "👇 When you feel you understand this module, mark it complete and move to the next one."}
            </div>
            <button
              onClick={markComplete}
              disabled={completedModules.has(activeModule) || messages.length < 3}
              style={{
                width: "100%", padding: "11px", borderRadius: 8,
                background: completedModules.has(activeModule) ? C.successLt : messages.length >= 3 ? C.navy : C.sand,
                border: "none", cursor: completedModules.has(activeModule) || messages.length < 3 ? "default" : "pointer",
                color: completedModules.has(activeModule) ? C.success : messages.length >= 3 ? C.white : C.muted,
                fontFamily: "'Source Serif 4', serif", fontSize: 13, fontWeight: 600,
                transition: "all 0.2s",
              }}>
              {completedModules.has(activeModule)
                ? "✓ Module Complete"
                : messages.length < 3
                  ? "Chat with the AI first to complete this module"
                  : "Mark This Module Complete →"}
            </button>
            {allComplete && !showBadge && (
              <button onClick={() => setShowBadge(true)}
                style={{
                  width: "100%", padding: "11px", borderRadius: 8, marginTop: 8,
                  background: C.gold, border: "none", cursor: "pointer",
                  color: C.white, fontFamily: "'Source Serif 4', serif",
                  fontSize: 13, fontWeight: 700,
                }}>
                🏅 Claim Your Data Explorer Badge
              </button>
            )}
          </div>
        </div>

        {/* Right: AI Chat */}
        <div style={{ display: "flex", flexDirection: "column", background: C.white }}>
          {/* Chat header */}
          <div style={{ padding: "12px 16px", borderBottom: `1px solid ${C.sand}`, background: C.navyDk }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#4CAF50", animation: "pulse 2s infinite" }} />
              <span style={{ fontSize: 12, fontWeight: 600, color: C.white }}>Data Orientation AI Guide</span>
              <span style={{ marginLeft: "auto", fontSize: 10, color: "rgba(255,255,255,0.4)" }}>
                Real platform data connected
              </span>
            </div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.55)", lineHeight: 1.5 }}>
              Your AI guide has read all the platform data and will walk you through it.
              You can ask anything — "what does PUE mean?", "show me who is most persistent", or "help me form a research question".
              Use the suggested questions below to get started, or type your own.
            </div>
          </div>

          {/* Quick prompts */}
          <div style={{ padding: "8px 14px", borderBottom: `1px solid ${C.sand}` }}>
            <div style={{ fontSize: 10, color: C.muted, fontWeight: 600, letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 6 }}>
              Suggested questions — click to ask:
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {module.quickPrompts.map((p, i) => (
              <button key={i} onClick={() => {
                setMessages(prev => [...prev, { role: "user", text: p, ts: Date.now() }]);
                send(p, messages);
              }}
                style={{
                  padding: "4px 10px", borderRadius: 12, fontSize: 11, fontWeight: 500,
                  border: `1px solid ${C.sand}`, background: C.cream, color: C.mid,
                  cursor: "pointer", fontFamily: "'Source Serif 4', serif",
                }}>
                {p}
              </button>
            ))}
            </div>
          </div>

          {/* Messages */}
          <div ref={msgsRef} style={{ flex: 1, overflowY: "auto", padding: "16px 14px", display: "flex", flexDirection: "column", gap: 12 }}>
            {dataLoading && (
              <div style={{ textAlign: "center", color: C.muted, fontSize: 12, fontStyle: "italic", padding: 20 }}>
                Loading platform data before starting…
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start", flexDirection: m.role === "user" ? "row-reverse" : "row" }}>
                <div style={{
                  width: 28, height: 28, borderRadius: "50%", flexShrink: 0,
                  background: m.role === "ai" ? C.navy : C.gold,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 10, fontWeight: 700, color: C.white,
                }}>
                  {m.role === "ai" ? "AI" : "You"}
                </div>
                <div style={{
                  maxWidth: "80%", padding: "10px 13px", borderRadius: 12, fontSize: 13, lineHeight: 1.6,
                  background: m.role === "ai" ? C.cream : C.navy,
                  color: m.role === "ai" ? C.charcoal : C.white,
                  border: m.role === "ai" ? `1px solid ${C.sand}` : "none",
                  whiteSpace: "pre-wrap",
                }}>
                  {m.text}
                </div>
              </div>
            ))}
            {aiLoading && (
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <div style={{ width: 28, height: 28, borderRadius: "50%", background: C.navy, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, color: C.white, flexShrink: 0 }}>AI</div>
                <div style={{ padding: "10px 13px", borderRadius: 12, background: C.cream, border: `1px solid ${C.sand}`, fontSize: 12, color: C.muted, fontStyle: "italic" }}>Thinking…</div>
              </div>
            )}
          </div>

          {/* Input */}
          <div style={{ padding: "12px 14px", borderTop: `1px solid ${C.sand}`, display: "flex", gap: 8 }}>
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && !e.shiftKey && handleSend()}
              placeholder="Ask about the data or request an exploration…"
              disabled={aiLoading || dataLoading}
              style={{
                flex: 1, padding: "9px 12px", borderRadius: 8,
                border: `1px solid ${C.sand}`, fontSize: 13,
                fontFamily: "'Source Serif 4', serif", background: C.cream,
              }}
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || aiLoading || dataLoading}
              style={{
                padding: "9px 16px", borderRadius: 8, border: "none",
                background: C.navy, color: C.white, fontWeight: 700,
                cursor: "pointer", fontSize: 14,
              }}>
              ↑
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── MOCK DATA ──────────────────────────────────────────────────────────────────
const RESEARCH_PROJECTS = [
  {
    id: "rq1",
    title: "Learning Outcomes Study",
    shortTitle: "Learning Outcomes",
    domain: "Domain A — Youth Impact",
    question: "Does sustained vAI engagement produce measurable gains in AI proficiency, digital literacy, and English language skills?",
    color: C.gold,
    icon: "📚",
    phases: [
      {
        id: 1, name: "Research Design", status: "complete", months: "1–2",
        badge: "Research Foundations",
        tasks: [
          { id: "t1_1", name: "Define sub-questions", status: "complete", validation: "Faculty review", due: "Week 2" },
          { id: "t1_2", name: "Literature review", status: "complete", validation: "AI summary audit", due: "Week 3" },
          { id: "t1_3", name: "Survey instrument design", status: "complete", validation: "Peer pilot test", due: "Week 6" },
          { id: "t1_4", name: "IRB consent scripts", status: "complete", validation: "Ethics check", due: "Week 8" },
        ]
      },
      {
        id: 2, name: "Data Collection", status: "active", months: "3–6",
        badge: "Field Research Methods",
        tasks: [
          { id: "t2_1", name: "Baseline surveys", status: "complete", validation: "87/100 responses verified", due: "Month 3" },
          { id: "t2_2", name: "Follow-up proficiency pull", status: "active", validation: "Auto-pull from vAI platform + manual cross-check", due: "Month 4" },
          { id: "t2_3", name: "Learner interviews", status: "pending", validation: "Transcript + code review", due: "Month 5" },
          { id: "t2_4", name: "Reflexivity journal entries", status: "pending", validation: "AI bias audit + self-review", due: "Ongoing" },
        ]
      },
      {
        id: 3, name: "Analysis", status: "locked", months: "6–9",
        badge: "Data Analysis",
        tasks: [
          { id: "t3_1", name: "Proficiency trend analysis", status: "locked", validation: "Statistical significance check (p<0.05)", due: "Month 7" },
          { id: "t3_2", name: "Interview thematic coding", status: "locked", validation: "Inter-rater reliability check", due: "Month 8" },
          { id: "t3_3", name: "Triangulation matrix", status: "locked", validation: "Faculty + ESSA review", due: "Month 8" },
          { id: "t3_4", name: "Negative case documentation", status: "locked", validation: "Explicit disconfirming evidence included", due: "Month 9" },
        ]
      },
      {
        id: 4, name: "Writing", status: "locked", months: "9–11",
        badge: "Research Communication",
        tasks: [
          { id: "t4_1", name: "Draft manuscript", status: "locked", validation: "AI plagiarism check + faculty review", due: "Month 10" },
          { id: "t4_2", name: "Policy brief", status: "locked", validation: "Plain language check", due: "Month 10" },
          { id: "t4_3", name: "Peer review participation", status: "locked", validation: "Review feedback submitted", due: "Month 11" },
        ]
      },
      {
        id: 5, name: "Completion", status: "locked", months: "12",
        badge: "Community Research Scholar",
        tasks: [
          { id: "t5_1", name: "Portfolio assembly", status: "locked", validation: "All prior artifacts included", due: "Month 12" },
          { id: "t5_2", name: "Community presentation", status: "locked", validation: "Community attendance + recording", due: "Month 12" },
          { id: "t5_3", name: "Mentorship onboarding", status: "locked", validation: "Cohort 2 match confirmed", due: "Month 12" },
        ]
      }
    ]
  },
  {
    id: "rq2",
    title: "Hope & Agency Study",
    shortTitle: "Hope & Agency",
    domain: "Domain A — Youth Impact",
    question: "How does AI-facilitated learning affect youth perceptions of future possibility, self-efficacy, and economic agency?",
    color: C.teal,
    icon: "🌱",
    phases: [
      { id: 1, name: "Research Design", status: "complete", months: "1–2", badge: "Research Foundations", tasks: [
        { id: "h1_1", name: "Hope scale instrument design", status: "complete", validation: "Validated against Snyder Hope Scale", due: "Week 6" },
        { id: "h1_2", name: "Agency indicators framework", status: "complete", validation: "Faculty review", due: "Week 8" },
      ]},
      { id: 2, name: "Data Collection", status: "active", months: "3–6", badge: "Field Research Methods", tasks: [
        { id: "h2_1", name: "Baseline hope surveys", status: "complete", validation: "62/80 responses verified", due: "Month 3" },
        { id: "h2_2", name: "Agency observation logs", status: "active", validation: "Coded observation review", due: "Ongoing" },
        { id: "h2_3", name: "Narrative interviews", status: "pending", validation: "Transcript + emotional coding", due: "Month 5" },
      ]},
      { id: 3, name: "Analysis", status: "locked", months: "6–9", badge: "Data Analysis", tasks: [] },
      { id: 4, name: "Writing", status: "locked", months: "9–11", badge: "Research Communication", tasks: [] },
      { id: 5, name: "Completion", status: "locked", months: "12", badge: "Community Research Scholar", tasks: [] },
    ]
  },
  {
    id: "rq4",
    title: "Community Spillover Study",
    shortTitle: "Community Spillover",
    domain: "Domain B — Community Impact",
    question: "What spillover effects does youth AI learning produce in households and communities, including productive use of energy?",
    color: C.sage,
    icon: "🏘️",
    phases: [
      { id: 1, name: "Research Design", status: "complete", months: "1–2", badge: "Research Foundations", tasks: [] },
      { id: 2, name: "Data Collection", status: "active", months: "3–6", badge: "Field Research Methods", tasks: [
        { id: "s2_1", name: "Household observation logs", status: "active", validation: "Coded by category + peer check", due: "Ongoing" },
        { id: "s2_2", name: "Elder and community leader interviews", status: "active", validation: "Transcript + cultural validation", due: "Month 5" },
        { id: "s2_3", name: "PUE energy demand tracking", status: "pending", validation: "Cross-check with energy infrastructure data", due: "Month 6" },
      ]},
      { id: 3, name: "Analysis", status: "locked", months: "6–9", badge: "Data Analysis", tasks: [] },
      { id: 4, name: "Writing", status: "locked", months: "9–11", badge: "Research Communication", tasks: [] },
      { id: 5, name: "Completion", status: "locked", months: "12", badge: "Community Research Scholar", tasks: [] },
    ]
  }
];

const MOCK_PLATFORM_DATA = {
  totalSessions: 1607,
  proficiencyAvg: 2.3,
  activeResearchers: 20,
  siteSurveys: { Oloibiri: 87, Ibiade: 62 },
  recentTrend: [
    { month: "Jan", score: 1.2 }, { month: "Feb", score: 1.5 },
    { month: "Mar", score: 1.8 }, { month: "Apr", score: 2.1 },
    { month: "May", score: 2.3 },
  ],
  topLearners: ["Silas Clergy", "Amara O.", "Chinwe I.", "Emmanuel B."],
};

// ─── STYLES ─────────────────────────────────────────────────────────────────────
const css = `
  @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,600;0,700;1,400&family=Source+Serif+4:ital,wght@0,300;0,400;0,600;1,300;1,400&family=JetBrains+Mono:wght@400;500&display=swap');

  * { box-sizing: border-box; margin: 0; padding: 0; }

  .rp-root {
    font-family: 'Source Serif 4', Georgia, serif;
    background: ${C.cream};
    min-height: 100vh;
    color: ${C.charcoal};
  }

  .rp-root h1, .rp-root h2, .rp-root h3, .rp-root h4 {
    font-family: 'Playfair Display', Georgia, serif;
  }

  /* ── TOPBAR ── */
  .topbar {
    background: ${C.navyDk};
    padding: 0 32px;
    height: 56px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    position: sticky;
    top: 0;
    z-index: 100;
    border-bottom: 2px solid ${C.gold}44;
  }
  .topbar-brand {
    display: flex; align-items: center; gap: 10px;
  }
  .topbar-logo {
    font-family: 'Playfair Display', serif;
    font-size: 17px; font-weight: 700;
    color: ${C.white};
    letter-spacing: 0.5px;
  }
  .topbar-divider { width: 1px; height: 20px; background: ${C.gold}55; }
  .topbar-section {
    font-size: 12px; color: ${C.gold}; font-weight: 600;
    letter-spacing: 1.5px; text-transform: uppercase;
  }
  .topbar-user {
    display: flex; align-items: center; gap: 8px;
    font-size: 13px; color: rgba(255,255,255,0.7);
  }
  .topbar-avatar {
    width: 28px; height: 28px; border-radius: 50%;
    background: ${C.gold}33; border: 1px solid ${C.gold}55;
    display: flex; align-items: center; justify-content: center;
    font-size: 11px; color: ${C.gold}; font-weight: 700;
  }

  /* ── BREADCRUMB ── */
  .breadcrumb {
    display: flex; align-items: center; gap: 6px;
    padding: 12px 32px;
    background: ${C.navyMd}22;
    border-bottom: 1px solid ${C.sand};
    font-size: 12px; color: ${C.mid};
  }
  .breadcrumb-btn {
    background: none; border: none; cursor: pointer;
    color: ${C.teal}; font-size: 12px; padding: 2px 4px;
    border-radius: 4px; font-family: 'Source Serif 4', serif;
    transition: background 0.15s;
  }
  .breadcrumb-btn:hover { background: ${C.teal}18; }
  .breadcrumb-sep { color: ${C.sandDk}; }

  /* ── LANDING ── */
  .landing-hero {
    background: linear-gradient(160deg, ${C.navyDk} 0%, ${C.navyMd} 60%, ${C.teal}44 100%);
    padding: 64px 32px 56px;
    position: relative; overflow: hidden;
  }
  .landing-hero::before {
    content: '';
    position: absolute; inset: 0;
    background: radial-gradient(ellipse at 80% 50%, ${C.gold}0A 0%, transparent 70%);
    pointer-events: none;
  }
  .hero-eyebrow {
    font-size: 11px; letter-spacing: 2.5px; text-transform: uppercase;
    color: ${C.gold}; font-weight: 600; margin-bottom: 16px;
    font-family: 'Source Serif 4', serif;
  }
  .hero-title {
    font-size: 42px; font-weight: 700; color: ${C.white};
    line-height: 1.15; max-width: 680px; margin-bottom: 18px;
  }
  .hero-sub {
    font-size: 16px; color: rgba(255,255,255,0.65);
    max-width: 580px; line-height: 1.6; margin-bottom: 36px;
    font-weight: 300; font-style: italic;
  }
  .hero-stats {
    display: flex; gap: 32px; flex-wrap: wrap;
  }
  .hero-stat { text-align: center; }
  .hero-stat-val {
    font-size: 28px; font-weight: 700; color: ${C.white};
    font-family: 'Playfair Display', serif; line-height: 1;
  }
  .hero-stat-lbl {
    font-size: 11px; color: ${C.gold}; letter-spacing: 1px;
    text-transform: uppercase; margin-top: 4px;
  }

  /* ── SECTION ── */
  .section { padding: 40px 32px; }
  .section-title {
    font-size: 22px; font-weight: 600; color: ${C.navy};
    margin-bottom: 6px; display: flex; align-items: center; gap: 10px;
  }
  .section-sub { font-size: 14px; color: ${C.mid}; margin-bottom: 24px; font-style: italic; }

  /* ── PROJECT CARDS ── */
  .project-grid {
    display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    gap: 16px;
  }
  .project-card {
    background: ${C.white}; border: 1px solid ${C.sand};
    border-radius: 12px; padding: 22px;
    cursor: pointer; transition: all 0.25s;
    position: relative; overflow: hidden;
  }
  .project-card:hover {
    border-color: var(--accent);
    box-shadow: 0 8px 32px rgba(0,0,0,0.10);
    transform: translateY(-2px);
  }
  .project-card::before {
    content: ''; position: absolute; top: 0; left: 0; right: 0; height: 3px;
    background: var(--accent);
  }
  .project-card-domain {
    font-size: 10px; letter-spacing: 1.5px; text-transform: uppercase;
    color: var(--accent); font-weight: 600; margin-bottom: 8px;
    font-family: 'Source Serif 4', serif;
  }
  .project-card-title {
    font-size: 18px; font-weight: 600; color: ${C.navy}; margin-bottom: 8px;
    line-height: 1.2;
  }
  .project-card-q {
    font-size: 13px; color: ${C.mid}; line-height: 1.55; margin-bottom: 16px;
    font-style: italic;
  }
  .project-card-footer {
    display: flex; justify-content: space-between; align-items: center;
  }
  .phase-pills { display: flex; gap: 4px; }
  .phase-pill {
    width: 10px; height: 10px; border-radius: 50%;
    background: ${C.sand};
  }
  .phase-pill.done { background: var(--accent); }
  .phase-pill.active { background: var(--accent); opacity: 0.5; }
  .join-btn {
    padding: 6px 14px; border-radius: 20px; font-size: 12px; font-weight: 600;
    border: 1.5px solid var(--accent); background: none; color: var(--accent);
    cursor: pointer; transition: all 0.2s;
    font-family: 'Source Serif 4', serif;
  }
  .join-btn:hover { background: var(--accent); color: white; }

  /* ── SIGNUP PANEL ── */
  .signup-panel {
    background: ${C.white}; border: 1px solid ${C.sand};
    border-radius: 16px; padding: 32px; max-width: 600px; margin: 0 auto;
    box-shadow: 0 4px 40px rgba(0,0,0,0.08);
  }
  .signup-head {
    font-size: 26px; font-weight: 700; color: ${C.navy}; margin-bottom: 6px;
  }
  .signup-sub { font-size: 14px; color: ${C.mid}; margin-bottom: 28px; font-style: italic; }
  .member-row {
    display: flex; gap: 10px; margin-bottom: 10px; align-items: center;
  }
  .inp {
    flex: 1; padding: 10px 14px; border: 1.5px solid ${C.sand};
    border-radius: 8px; font-size: 14px; font-family: 'Source Serif 4', serif;
    background: ${C.cream}; color: ${C.charcoal}; outline: none;
    transition: border-color 0.2s;
  }
  .inp:focus { border-color: ${C.teal}; background: white; }
  .inp-select { cursor: pointer; }
  .remove-btn {
    width: 28px; height: 28px; border-radius: 50%;
    border: 1px solid ${C.sand}; background: none; cursor: pointer;
    color: ${C.muted}; font-size: 14px; display: flex; align-items: center; justify-content: center;
    transition: all 0.2s; shrink: 0;
  }
  .remove-btn:hover { border-color: ${C.warn}; color: ${C.warn}; background: ${C.warnLt}; }
  .add-member-btn {
    background: none; border: 1.5px dashed ${C.sand};
    border-radius: 8px; padding: 8px 14px; cursor: pointer;
    color: ${C.teal}; font-size: 13px; font-family: 'Source Serif 4', serif;
    width: 100%; margin-top: 4px; transition: all 0.2s;
  }
  .add-member-btn:hover { border-color: ${C.teal}; background: ${C.teal}08; }
  .site-selector {
    display: flex; gap: 10px; flex-wrap: wrap; margin: 12px 0 20px;
  }
  .site-chip {
    padding: 7px 16px; border-radius: 20px; font-size: 13px; cursor: pointer;
    border: 1.5px solid ${C.sand}; background: none; color: ${C.mid};
    font-family: 'Source Serif 4', serif; transition: all 0.2s;
  }
  .site-chip.active {
    border-color: ${C.teal}; background: ${C.teal}14; color: ${C.teal}; font-weight: 600;
  }
  .form-label {
    font-size: 11px; letter-spacing: 1px; text-transform: uppercase;
    color: ${C.mid}; font-weight: 600; margin-bottom: 8px; display: block;
    font-family: 'Source Serif 4', serif;
  }
  .primary-btn {
    width: 100%; padding: 13px; border-radius: 10px; font-size: 15px;
    font-weight: 600; border: none; cursor: pointer;
    background: ${C.navy}; color: white;
    font-family: 'Playfair Display', serif; letter-spacing: 0.5px;
    transition: all 0.2s; margin-top: 8px;
  }
  .primary-btn:hover { background: ${C.navyMd}; transform: translateY(-1px); box-shadow: 0 4px 16px ${C.navy}44; }
  .primary-btn:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }

  /* ── PROJECT VIEW ── */
  .project-header {
    padding: 32px 32px 24px;
    border-bottom: 1px solid ${C.sand};
    background: ${C.white};
  }
  .project-header-domain {
    font-size: 11px; letter-spacing: 2px; text-transform: uppercase;
    font-weight: 600; margin-bottom: 8px;
    font-family: 'Source Serif 4', serif;
  }
  .project-header-title { font-size: 28px; font-weight: 700; color: ${C.navy}; margin-bottom: 8px; }
  .project-header-q {
    font-size: 14px; color: ${C.mid}; font-style: italic; line-height: 1.6;
    max-width: 680px; padding: 10px 14px;
    background: ${C.parchment}; border-left: 3px solid var(--accent);
    border-radius: 0 6px 6px 0; margin-top: 6px;
  }

  /* ── PHASE RAIL ── */
  .phase-rail {
    display: flex; gap: 0; overflow-x: auto;
    border-bottom: 1px solid ${C.sand};
    background: ${C.parchment};
    padding: 0 32px;
  }
  .phase-tab {
    padding: 14px 20px; cursor: pointer; border: none; background: none;
    font-family: 'Source Serif 4', serif; font-size: 13px; color: ${C.mid};
    border-bottom: 2px solid transparent; white-space: nowrap;
    transition: all 0.2s; position: relative; display: flex; align-items: center; gap: 6px;
  }
  .phase-tab.active { color: ${C.navy}; border-bottom-color: var(--accent); font-weight: 600; }
  .phase-tab.locked { opacity: 0.4; cursor: not-allowed; }
  .phase-tab-badge {
    font-size: 10px; padding: 1px 5px; border-radius: 8px;
    background: var(--accent); color: white; font-weight: 700;
  }
  .phase-tab-status {
    width: 6px; height: 6px; border-radius: 50%;
  }
  .phase-tab-status.complete { background: ${C.success}; }
  .phase-tab-status.active { background: ${C.gold}; }
  .phase-tab-status.locked { background: ${C.sandDk}; }

  /* ── PHASE BODY ── */
  .phase-body { display: flex; gap: 0; min-height: calc(100vh - 280px); }
  .task-list {
    width: 320px; shrink: 0; border-right: 1px solid ${C.sand};
    background: ${C.white}; overflow-y: auto;
    padding: 20px 0;
  }
  .task-list-title {
    font-size: 11px; letter-spacing: 1.5px; text-transform: uppercase;
    color: ${C.mid}; padding: 0 20px 10px; font-weight: 600;
    font-family: 'Source Serif 4', serif;
  }
  .task-item {
    padding: 14px 20px; cursor: pointer; transition: background 0.15s;
    border-left: 3px solid transparent; position: relative;
  }
  .task-item:hover { background: ${C.cream}; }
  .task-item.active { background: ${C.parchment}; border-left-color: var(--accent); }
  .task-item.locked { opacity: 0.45; cursor: not-allowed; }
  .task-item-name { font-size: 13px; font-weight: 600; color: ${C.navy}; margin-bottom: 4px; }
  .task-item-meta { font-size: 11px; color: ${C.muted}; display: flex; gap: 10px; }
  .task-status-dot {
    width: 8px; height: 8px; border-radius: 50%; shrink: 0; margin-top: 3px;
  }
  .task-status-dot.complete { background: ${C.success}; }
  .task-status-dot.active { background: ${C.gold}; box-shadow: 0 0 0 3px ${C.gold}33; }
  .task-status-dot.pending { background: ${C.sandDk}; }
  .task-status-dot.locked { background: ${C.sand}; }

  /* ── TASK DETAIL ── */
  .task-detail {
    flex: 1; padding: 28px 32px; overflow-y: auto;
    background: ${C.cream};
  }
  .task-detail-empty {
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    height: 300px; color: ${C.muted}; text-align: center; gap: 12px;
  }
  .task-detail-empty-icon { font-size: 40px; opacity: 0.4; }

  .detail-header {
    margin-bottom: 20px; padding-bottom: 16px; border-bottom: 1px solid ${C.sand};
  }
  .detail-phase-label {
    font-size: 10px; letter-spacing: 2px; text-transform: uppercase;
    color: var(--accent); font-weight: 600; margin-bottom: 6px;
    font-family: 'Source Serif 4', serif;
  }
  .detail-title { font-size: 22px; font-weight: 700; color: ${C.navy}; margin-bottom: 6px; }
  .detail-meta { display: flex; gap: 14px; flex-wrap: wrap; }
  .detail-chip {
    font-size: 11px; padding: 3px 10px; border-radius: 10px;
    border: 1px solid ${C.sand}; color: ${C.mid};
    font-family: 'Source Serif 4', serif;
  }

  .info-cards { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 20px; }
  .info-card {
    background: ${C.white}; border: 1px solid ${C.sand};
    border-radius: 10px; padding: 14px 16px;
  }
  .info-card-label {
    font-size: 10px; letter-spacing: 1.5px; text-transform: uppercase;
    color: var(--accent); font-weight: 600; margin-bottom: 6px;
    font-family: 'Source Serif 4', serif;
  }
  .info-card-body { font-size: 13px; color: ${C.charcoal}; line-height: 1.55; }

  .progress-section { margin-bottom: 20px; }
  .progress-section-title {
    font-size: 13px; font-weight: 600; color: ${C.navy}; margin-bottom: 10px;
    display: flex; align-items: center; gap: 6px;
  }
  .prior-entry {
    background: ${C.white}; border: 1px solid ${C.sand}; border-radius: 8px;
    padding: 12px 14px; margin-bottom: 8px; font-size: 13px; line-height: 1.5;
  }
  .prior-entry-head {
    display: flex; justify-content: space-between; margin-bottom: 4px;
    font-size: 11px; color: ${C.muted};
  }

  /* ── AI PANEL ── */
  .ai-panel {
    background: ${C.white}; border: 1px solid ${C.sand};
    border-radius: 12px; overflow: hidden; margin-top: 20px;
    box-shadow: 0 2px 16px rgba(0,0,0,0.06);
  }
  .ai-panel-header {
    background: ${C.navy}; padding: 12px 16px;
    display: flex; align-items: center; gap: 8px;
  }
  .ai-panel-title { font-size: 13px; font-weight: 600; color: white; }
  .ai-status-dot {
    width: 7px; height: 7px; border-radius: 50%; background: ${C.gold};
    box-shadow: 0 0 0 3px ${C.gold}44;
    animation: pulse 2s infinite;
  }
  @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } }

  .ai-msgs {
    max-height: 380px; overflow-y: auto; padding: 16px;
    display: flex; flex-direction: column; gap: 12px;
    background: ${C.cream};
    scroll-behavior: smooth;
  }
  .ai-msg { display: flex; gap: 10px; align-items: flex-start; }
  .ai-msg.user { flex-direction: row-reverse; }
  .msg-avatar {
    width: 28px; height: 28px; border-radius: 50%; shrink: 0;
    display: flex; align-items: center; justify-content: center;
    font-size: 12px;
  }
  .msg-avatar.ai { background: ${C.navy}; color: ${C.gold}; font-weight: 700; font-family: 'Playfair Display', serif; }
  .msg-avatar.user { background: ${C.teal}22; color: ${C.teal}; font-size: 14px; }
  .msg-bubble {
    max-width: 82%; padding: 10px 14px; border-radius: 12px;
    font-size: 13px; line-height: 1.6;
  }
  .msg-bubble.ai {
    background: ${C.white}; border: 1px solid ${C.sand};
    color: ${C.charcoal}; border-radius: 2px 12px 12px 12px;
  }
  .msg-bubble.user {
    background: ${C.navy}; color: white;
    border-radius: 12px 2px 12px 12px;
  }
  .msg-bubble.typing {
    background: ${C.white}; border: 1px solid ${C.sand};
    color: ${C.muted}; font-style: italic;
  }
  .suggested-text {
    background: ${C.parchment}; border: 1px solid ${C.sand};
    border-radius: 8px; padding: 10px 12px; margin-top: 8px;
    font-size: 12px; color: ${C.navy}; font-style: italic;
    border-left: 3px solid ${C.gold};
  }
  .suggested-text-actions {
    display: flex; gap: 8px; margin-top: 6px;
  }
  .use-text-btn {
    font-size: 11px; padding: 3px 8px; border-radius: 4px;
    background: ${C.gold}; color: white; border: none; cursor: pointer;
    font-family: 'Source Serif 4', serif; font-weight: 600;
  }
  .dismiss-btn {
    font-size: 11px; padding: 3px 8px; border-radius: 4px;
    background: none; color: ${C.mid}; border: 1px solid ${C.sand}; cursor: pointer;
  }

  .ai-data-card {
    background: ${C.navy}0A; border: 1px solid ${C.navy}1A;
    border-radius: 8px; padding: 10px 12px; margin-top: 8px;
    font-size: 12px;
  }
  .ai-data-label { font-size: 10px; letter-spacing: 1px; text-transform: uppercase; color: ${C.teal}; font-weight: 600; margin-bottom: 4px; }
  .ai-data-val { font-size: 18px; font-weight: 700; color: ${C.navy}; font-family: 'Playfair Display', serif; }
  .ai-data-sub { font-size: 11px; color: ${C.mid}; margin-top: 1px; }

  .ai-input-row {
    display: flex; gap: 8px; padding: 12px 16px;
    border-top: 1px solid ${C.sand}; background: ${C.white};
  }
  .ai-inp {
    flex: 1; padding: 9px 12px; border: 1.5px solid ${C.sand};
    border-radius: 8px; font-size: 13px; outline: none;
    font-family: 'Source Serif 4', serif; background: ${C.cream};
    transition: border-color 0.2s;
  }
  .ai-inp:focus { border-color: ${C.teal}; background: white; }
  .ai-send-btn {
    width: 36px; height: 36px; border-radius: 8px;
    background: ${C.navy}; border: none; cursor: pointer;
    display: flex; align-items: center; justify-content: center;
    color: white; font-size: 14px; transition: background 0.2s;
    shrink: 0;
  }
  .ai-send-btn:hover { background: ${C.navyMd}; }
  .ai-send-btn:disabled { opacity: 0.4; cursor: not-allowed; }

  /* ── FINDINGS BOX ── */
  .findings-box {
    background: ${C.white}; border: 1.5px solid ${C.sand};
    border-radius: 10px; overflow: hidden; margin-top: 16px;
  }
  .findings-header {
    background: ${C.parchment}; padding: 10px 14px;
    font-size: 11px; font-weight: 600; letter-spacing: 1.5px;
    text-transform: uppercase; color: ${C.mid}; border-bottom: 1px solid ${C.sand};
    font-family: 'Source Serif 4', serif; display: flex; justify-content: space-between;
    align-items: center;
  }
  .findings-area {
    width: 100%; min-height: 80px; padding: 12px 14px;
    border: none; outline: none; resize: vertical;
    font-size: 13px; line-height: 1.7; color: ${C.charcoal};
    font-family: 'Source Serif 4', serif; background: transparent;
  }
  .findings-footer {
    padding: 8px 14px; border-top: 1px solid ${C.sand};
    display: flex; justify-content: flex-end; gap: 8px;
  }
  .save-btn {
    padding: 6px 14px; border-radius: 6px; font-size: 12px; font-weight: 600;
    background: ${C.teal}; color: white; border: none; cursor: pointer;
    font-family: 'Source Serif 4', serif; transition: background 0.2s;
  }
  .save-btn:hover { background: ${C.tealLt}; }

  /* ── TOAST ── */
  .toast {
    position: fixed; bottom: 24px; right: 24px;
    background: ${C.navy}; color: white; padding: 12px 18px;
    border-radius: 10px; font-size: 13px; z-index: 1000;
    box-shadow: 0 4px 20px rgba(0,0,0,0.25);
    animation: slideUp 0.3s ease-out;
    border-left: 3px solid ${C.gold};
  }
  @keyframes slideUp { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }

  /* Main content area beside sidebar */
  .rp-main { flex: 1; min-width: 0; display: flex; flex-direction: column; }
`;


// ─── INJECT STYLES ──────────────────────────────────────────────────────────────
function StyleTag() {
  return <style>{css}</style>;
}


// ─── HELPERS ────────────────────────────────────────────────────────────────────
function setAccent(color) {
  return { "--accent": color };
}

function statusIcon(s) {
  if (s === "complete") return "✓";
  if (s === "active") return "●";
  if (s === "pending") return "○";
  return "🔒";
}

// ─── AI ASSISTANT HOOK ──────────────────────────────────────────────────────────
function useAI(taskContext) {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);

  const getSystemPrompt = useCallback(() => {
    const pd = MOCK_PLATFORM_DATA;
    return `You are a research assistant embedded in the vAI Community Research Platform, helping youth researchers in Oloibiri and Ibiade, Nigeria conduct participatory action research.

CURRENT TASK CONTEXT:
- Project: ${taskContext?.projectTitle || "Unknown"}
- Research Question: ${taskContext?.researchQuestion || ""}
- Phase: ${taskContext?.phaseName || ""}
- Sub-task: ${taskContext?.taskName || ""}
- Validation Required: ${taskContext?.validation || ""}

REAL PLATFORM DATA (from vAI Supabase):
- Total AI sessions across platform: ${pd.totalSessions}
- Average proficiency score: ${pd.proficiencyAvg}/3.0 (UNESCO 0–3 scale)
- Active researchers: ${pd.activeResearchers}
- Oloibiri survey responses: ${pd.siteSurveys.Oloibiri}/100
- Ibiade survey responses: ${pd.siteSurveys.Ibiade}/80
- Proficiency trend (Jan–May 2026): ${pd.recentTrend.map(d => `${d.month}: ${d.score}`).join(", ")}

YOUR ROLE:
1. SCAFFOLD the task step by step — break it into clear, manageable actions
2. REFERENCE real platform data when relevant to ground the research
3. SUGGEST draft text that the researcher can edit and use directly (clearly marked with <<DRAFT TEXT START>> and <<DRAFT TEXT END>>)
4. ASK clarifying questions to deepen the researcher's thinking
5. FLAG when a finding needs validation and explain what that means

BOUNDARIES:
- Do not interpret findings FOR them — ask questions that help them interpret
- Celebrate progress and maintain motivation
- Write at a clear, accessible level — many researchers are 16–22 years old
- Keep responses focused and practical — 2–4 short paragraphs max unless they ask for more
- When showing draft text, make it genuine and grounded in the actual data

Always start a new conversation by introducing yourself briefly and asking one specific question about where they are in the task.`;
  }, [taskContext]);

  const initConversation = useCallback(async () => {
    setLoading(true);
    setMessages([]);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          page: "ResearchAILearningLab",
          system: getSystemPrompt(),
          max_tokens: 1000,
          messages: [{ role: "user", content: "I'm starting this task. Please introduce yourself and help me get started." }],
        }),
      });
      const data = await res.json();
      const text = data.choices?.[0]?.message?.content
        ?? data.content?.find(b => b.type === "text")?.text
        ?? "";
      setMessages([{ role: "ai", text, ts: Date.now() }]);
    } catch (e) {
      setMessages([{ role: "ai", text: "Hi! I'm your research assistant. I'm here to help you work through this task step by step. What have you done so far, and where are you feeling stuck?", ts: Date.now() }]);
    }
    setLoading(false);
  }, [getSystemPrompt]);

  const send = useCallback(async (userMsg, history) => {
    setLoading(true);
    const msgs = [...history.map(m => ({ role: m.role === "ai" ? "assistant" : "user", content: m.text })), { role: "user", content: userMsg }];
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          page: "ResearchAILearningLab",
          system: getSystemPrompt(),
          max_tokens: 1000,
          messages: msgs,
        }),
      });
      const data = await res.json();
      const text = data.choices?.[0]?.message?.content
        ?? data.content?.find(b => b.type === "text")?.text
        ?? "I'm having trouble connecting. Please try again.";
      setMessages(prev => [...prev, { role: "ai", text, ts: Date.now() }]);
    } catch {
      setMessages(prev => [...prev, { role: "ai", text: "Connection issue — please try again.", ts: Date.now() }]);
    }
    setLoading(false);
  }, [getSystemPrompt]);

  return { messages, loading, initConversation, send, setMessages };
}

// ─── PARSE AI MESSAGE for draft text ────────────────────────────────────────────
function ParsedMessage({ text, onUseDraft }) {
  const draftMatch = text.match(/<<DRAFT TEXT START>>([\s\S]*?)<<DRAFT TEXT END>>/);
  const draftText = draftMatch ? draftMatch[1].trim() : null;
  const cleanText = text.replace(/<<DRAFT TEXT START>>[\s\S]*?<<DRAFT TEXT END>>/, "").trim();

  return (
    <div>
      <div style={{ whiteSpace: "pre-wrap" }}>{cleanText}</div>
      {draftText && (
        <div className="suggested-text">
          <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 1, color: C.gold, fontWeight: 600, marginBottom: 4 }}>Suggested Draft Text</div>
          <div style={{ fontStyle: "normal", lineHeight: 1.6 }}>{draftText}</div>
          <div className="suggested-text-actions">
            <button className="use-text-btn" onClick={() => onUseDraft(draftText)}>Use This</button>
            <span style={{ fontSize: 11, color: C.muted, alignSelf: "center" }}>Edit freely before saving</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── AI CHAT PANEL ───────────────────────────────────────────────────────────────
function AIChatPanel({ task, phase, project, onUseDraft }) {
  const taskContext = {
    projectTitle: project?.title,
    researchQuestion: project?.question,
    phaseName: phase?.name,
    taskName: task?.name,
    validation: task?.validation,
  };
  const { messages, loading, initConversation, send, setMessages } = useAI(taskContext);
  const [input, setInput] = useState("");
  const msgsRef = useRef(null);

  useEffect(() => {
    if (task) initConversation();
  }, [task?.id]);

  useEffect(() => {
    if (msgsRef.current) msgsRef.current.scrollTop = msgsRef.current.scrollHeight;
  }, [messages]);

  const handleSend = () => {
    if (!input.trim() || loading) return;
    const userMsg = input.trim();
    setInput("");
    setMessages(prev => [...prev, { role: "user", text: userMsg, ts: Date.now() }]);
    send(userMsg, messages);
  };

  if (!task) return null;

  return (
    <div className="ai-panel">
      <div className="ai-panel-header">
        <div className="ai-status-dot" />
        <span className="ai-panel-title">Research Assistant — AI Facilitator</span>
        <div style={{ marginLeft: "auto", fontSize: 11, color: "rgba(255,255,255,0.5)" }}>
          Live platform data connected
        </div>
      </div>
      <div className="ai-msgs" ref={msgsRef}>
        {messages.length === 0 && !loading && (
          <div style={{ textAlign: "center", color: C.muted, fontSize: 13, fontStyle: "italic", padding: "20px 0" }}>
            Starting session…
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`ai-msg ${m.role === "user" ? "user" : ""}`}>
            <div className={`msg-avatar ${m.role}`}>
              {m.role === "ai" ? "A" : "You"}
            </div>
            <div className={`msg-bubble ${m.role}`}>
              {m.role === "ai" ? (
                <ParsedMessage text={m.text} onUseDraft={onUseDraft} />
              ) : m.text}
            </div>
          </div>
        ))}
        {loading && (
          <div className="ai-msg">
            <div className="msg-avatar ai">A</div>
            <div className="msg-bubble typing">Thinking…</div>
          </div>
        )}
      </div>
      <div className="ai-input-row">
        <input
          className="ai-inp"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === "Enter" && !e.shiftKey && handleSend()}
          placeholder="Ask for help, share what you found, or request a draft…"
          disabled={loading}
        />
        <button className="ai-send-btn" onClick={handleSend} disabled={loading || !input.trim()}>
          ↑
        </button>
      </div>
    </div>
  );
}

// ─── TASK DETAIL VIEW ────────────────────────────────────────────────────────────
function TaskDetail({ task, phase, project }) {
  const [findings, setFindings] = useState("");
  const [saved, setSaved] = useState(false);
  const [toast, setToast] = useState(null);

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 2500); };

  const handleUseDraft = (text) => {
    setFindings(prev => prev ? prev + "\n\n" + text : text);
    showToast("Draft text added to your findings — edit freely.");
  };

  const handleSave = () => {
    setSaved(true);
    showToast("Findings saved ✓");
    setTimeout(() => setSaved(false), 2000);
  };

  const pd = MOCK_PLATFORM_DATA;

  // Mock prior entries for the active task
  const priorEntries = task?.status === "active" || task?.status === "complete" ? [
    { date: "May 14, 2026", researcher: "Amara O.", text: "Completed 12 follow-up proficiency assessments in Oloibiri. Average score moved from 1.8 to 2.1 between February and April. Noticed that learners who used the AI Playground more than 5x per week showed bigger gains." },
    { date: "May 11, 2026", researcher: "Silas Clergy", text: "Cross-checked 8 learner records against session logs. All 8 showed proficiency gains. One outlier — Emmanuel B. dropped from 2.3 to 1.9 — flagging for interview follow-up." },
  ] : [];

  return (
    <div className="task-detail">
      {/* Header */}
      <div className="detail-header">
        <div className="detail-phase-label">{phase?.name} · {project?.shortTitle}</div>
        <div className="detail-title">{task?.name}</div>
        <div className="detail-meta">
          <span className="detail-chip">Due: {task?.due}</span>
          <span className="detail-chip" style={{ color: task?.status === "complete" ? C.success : task?.status === "active" ? C.warn : C.muted }}>
            {statusIcon(task?.status)} {task?.status}
          </span>
        </div>
      </div>

      {/* Info Cards */}
      <div className="info-cards">
        <div className="info-card" style={setAccent(project?.color)}>
          <div className="info-card-label">Validation Required</div>
          <div className="info-card-body">{task?.validation}</div>
        </div>
        <div className="info-card" style={setAccent(project?.color)}>
          <div className="info-card-label">Live Platform Data</div>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <div>
              <div style={{ fontSize: 20, fontWeight: 700, color: project?.color, fontFamily: "'Playfair Display', serif" }}>{pd.proficiencyAvg}</div>
              <div style={{ fontSize: 10, color: C.muted }}>Avg proficiency</div>
            </div>
            <div>
              <div style={{ fontSize: 20, fontWeight: 700, color: project?.color, fontFamily: "'Playfair Display', serif" }}>{pd.totalSessions}</div>
              <div style={{ fontSize: 10, color: C.muted }}>Total sessions</div>
            </div>
            <div>
              <div style={{ fontSize: 20, fontWeight: 700, color: project?.color, fontFamily: "'Playfair Display', serif" }}>{pd.siteSurveys.Oloibiri}</div>
              <div style={{ fontSize: 10, color: C.muted }}>Surveys (Oloibiri)</div>
            </div>
          </div>
        </div>
      </div>

      {/* Prior Progress */}
      {priorEntries.length > 0 && (
        <div className="progress-section">
          <div className="progress-section-title">
            <span style={{ color: C.success }}>✓</span> Prior Progress on This Task
          </div>
          {priorEntries.map((e, i) => (
            <div key={i} className="prior-entry">
              <div className="prior-entry-head">
                <span style={{ fontWeight: 600, color: C.navy }}>{e.researcher}</span>
                <span>{e.date}</span>
              </div>
              {e.text}
            </div>
          ))}
        </div>
      )}

      {/* Findings Input */}
      <div className="findings-box">
        <div className="findings-header">
          <span>Record Your Findings</span>
          <span style={{ color: C.muted, fontWeight: 400, textTransform: "none", letterSpacing: 0, fontSize: 11 }}>
            Use the AI assistant below for help drafting
          </span>
        </div>
        <textarea
          className="findings-area"
          value={findings}
          onChange={e => setFindings(e.target.value)}
          placeholder="Describe what you found, observed, or concluded during this sub-task. The AI assistant can help you draft text — it will appear here for you to edit."
        />
        <div className="findings-footer">
          <button className="save-btn" onClick={handleSave} disabled={!findings.trim()}>
            {saved ? "Saved ✓" : "Save Findings"}
          </button>
        </div>
      </div>

      {/* AI Panel */}
      <AIChatPanel task={task} phase={phase} project={project} onUseDraft={handleUseDraft} />

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

// ─── PROJECT PAGE ────────────────────────────────────────────────────────────────
function ProjectPage({ project, onBack }) {
  const [activePhaseId, setActivePhaseId] = useState(
    project.phases.find(p => p.status === "active")?.id || 1
  );
  const [activeTaskId, setActiveTaskId] = useState(null);

  const activePhase = project.phases.find(p => p.id === activePhaseId);
  const activeTask = activePhase?.tasks?.find(t => t.id === activeTaskId);

  const phaseDoneCount = project.phases.filter(p => p.status === "complete").length;

  return (
    <div style={setAccent(project.color)}>
      {/* Project Header */}
      <div className="project-header" style={setAccent(project.color)}>
        <div className="project-header-domain" style={{ color: project.color }}>{project.domain}</div>
        <div className="project-header-title">{project.icon} {project.title}</div>
        <div className="project-header-q">{project.question}</div>
        <div style={{ marginTop: 12, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ fontSize: 12, color: C.mid }}>
            Phase {phaseDoneCount} of 5 complete ·
          </div>
          {project.phases.map(ph => (
            <div key={ph.id} style={{
              width: 28, height: 6, borderRadius: 3,
              background: ph.status === "complete" ? project.color : ph.status === "active" ? project.color + "55" : C.sand,
              transition: "background 0.3s"
            }} />
          ))}
        </div>
      </div>

      {/* Phase Tabs */}
      <div className="phase-rail" style={setAccent(project.color)}>
        {project.phases.map(ph => (
          <button
            key={ph.id}
            className={`phase-tab ${ph.id === activePhaseId ? "active" : ""} ${ph.status === "locked" ? "locked" : ""}`}
            style={setAccent(project.color)}
            onClick={() => { if (ph.status !== "locked") { setActivePhaseId(ph.id); setActiveTaskId(null); } }}
          >
            <div className={`phase-tab-status ${ph.status}`} />
            Phase {ph.id}: {ph.name}
            {ph.status === "complete" && <div className="phase-tab-badge" style={{ background: project.color }}>✓</div>}
          </button>
        ))}
      </div>

      {/* Phase Body */}
      <div className="phase-body" style={setAccent(project.color)}>
        {/* Task List */}
        <div className="task-list">
          <div className="task-list-title">Sub-Tasks — {activePhase?.name}</div>
          {activePhase?.tasks?.length === 0 && (
            <div style={{ padding: "20px", fontSize: 13, color: C.muted, fontStyle: "italic" }}>
              {activePhase.status === "locked" ? "Complete prior phases to unlock tasks." : "Tasks will appear here."}
            </div>
          )}
          {activePhase?.tasks?.map(task => (
            <div
              key={task.id}
              className={`task-item ${task.id === activeTaskId ? "active" : ""} ${task.status === "locked" ? "locked" : ""}`}
              style={setAccent(project.color)}
              onClick={() => { if (task.status !== "locked") setActiveTaskId(task.id === activeTaskId ? null : task.id); }}
            >
              <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                <div className={`task-status-dot ${task.status}`} style={{ marginTop: 5 }} />
                <div>
                  <div className="task-item-name">{task.name}</div>
                  <div className="task-item-meta">
                    <span>Due: {task.due}</span>
                    <span style={{ color: task.status === "complete" ? C.success : task.status === "active" ? C.gold : C.muted }}>
                      {task.status}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          ))}

          {/* Badge info */}
          <div style={{ margin: "20px 16px 0", padding: "12px 14px", background: C.parchment, borderRadius: 8, border: `1px solid ${C.sand}` }}>
            <div style={{ fontSize: 10, letterSpacing: 1.5, textTransform: "uppercase", color: project.color, fontWeight: 600, marginBottom: 4 }}>Phase Badge</div>
            <div style={{ fontSize: 13, color: C.navy, fontWeight: 600 }}>{activePhase?.badge}</div>
            <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>Certified by University of Dayton</div>
          </div>
        </div>

        {/* Task Detail or Empty */}
        {activeTask ? (
          <TaskDetail task={activeTask} phase={activePhase} project={project} />
        ) : (
          <div className="task-detail">
            <div className="task-detail-empty">
              <div className="task-detail-empty-icon">🔬</div>
              <div style={{ fontSize: 16, fontWeight: 600, color: C.navy }}>Select a sub-task to begin</div>
              <div style={{ fontSize: 13, color: C.muted, maxWidth: 260 }}>
                Choose from the list to see your progress, validation requirements, and AI research assistant.
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── SIGNUP FORM ─────────────────────────────────────────────────────────────────
function SignupForm({ project, onSuccess, onCancel }) {
  const [site, setSite] = useState("Oloibiri");
  const [members, setMembers] = useState([{ name: "", email: "" }]);
  const [submitting, setSubmitting] = useState(false);

  const addMember = () => setMembers(m => [...m, { name: "", email: "" }]);
  const removeMember = (i) => setMembers(m => m.filter((_, j) => j !== i));
  const updateMember = (i, field, val) => setMembers(m => m.map((mb, j) => j === i ? { ...mb, [field]: val } : mb));

  const valid = members.every(m => m.name.trim() && m.email.trim()) && site;

  const handleSubmit = async () => {
    setSubmitting(true);
    await new Promise(r => setTimeout(r, 1000));
    setSubmitting(false);
    onSuccess({ members, site, project });
  };

  return (
    <div style={{ padding: "40px 32px", maxWidth: 680, margin: "0 auto" }}>
      <div className="signup-panel" style={setAccent(project.color)}>
        <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 20 }}>
          <div style={{ fontSize: 36 }}>{project.icon}</div>
          <div>
            <div className="signup-head">Join Research Team</div>
            <div style={{ fontSize: 13, color: C.mid, fontStyle: "italic" }}>{project.title}</div>
          </div>
        </div>

        <label className="form-label">Research Site</label>
        <div className="site-selector">
          {["Oloibiri", "Ibiade"].map(s => (
            <button key={s} className={`site-chip ${site === s ? "active" : ""}`} onClick={() => setSite(s)}>{s}</button>
          ))}
        </div>

        <label className="form-label">Team Members</label>
        <div style={{ fontSize: 12, color: C.muted, marginBottom: 10, fontStyle: "italic" }}>
          Add everyone joining this research project — each person will use their existing vAI account.
        </div>

        {members.map((m, i) => (
          <div key={i} className="member-row">
            <input
              className="inp"
              placeholder="Full name"
              value={m.name}
              onChange={e => updateMember(i, "name", e.target.value)}
            />
            <input
              className="inp"
              placeholder="Email / vAI username"
              value={m.email}
              onChange={e => updateMember(i, "email", e.target.value)}
            />
            {members.length > 1 && (
              <button className="remove-btn" onClick={() => removeMember(i)}>×</button>
            )}
          </div>
        ))}

        <button className="add-member-btn" onClick={addMember}>+ Add team member</button>

        <div style={{ marginTop: 20, padding: "12px 14px", background: C.parchment, borderRadius: 8, border: `1px solid ${C.sand}`, fontSize: 12, color: C.mid, lineHeight: 1.6 }}>
          <strong style={{ color: C.navy }}>What you're signing up for:</strong> 12-month research program with monthly commitments (~4–6 hours/month). All research earns a University of Dayton credential on completion.
        </div>

        <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
          <button className="primary-btn" onClick={handleSubmit} disabled={!valid || submitting} style={{ flex: 1 }}>
            {submitting ? "Registering…" : "Join Research Program"}
          </button>
          <button onClick={onCancel} style={{ padding: "13px 18px", border: `1.5px solid ${C.sand}`, background: "none", borderRadius: 10, cursor: "pointer", fontSize: 14, color: C.mid, fontFamily: "'Playfair Display', serif" }}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── MAIN LANDING ────────────────────────────────────────────────────────────────
function ResearchLanding({ onSelectProject, onSignup }) {
  return (
    <div>
      <div className="landing-hero">
        <div style={{ maxWidth: 960, margin: "0 auto" }}>
          <div className="hero-eyebrow">vAI Research Platform</div>
          <h1 className="hero-title">Youth-Led Community Research</h1>
          <p className="hero-sub">You are not just a learner — you are a researcher. Join a study team, investigate real questions, and earn a University of Dayton research credential.</p>
          <div className="hero-stats">
            <div className="hero-stat">
              <div className="hero-stat-val">20</div>
              <div className="hero-stat-lbl">Active Researchers</div>
            </div>
            <div className="hero-stat">
              <div className="hero-stat-val">3</div>
              <div className="hero-stat-lbl">Open Studies</div>
            </div>
            <div className="hero-stat">
              <div className="hero-stat-val">1,607</div>
              <div className="hero-stat-lbl">AI Sessions Tracked</div>
            </div>
            <div className="hero-stat">
              <div className="hero-stat-val">5</div>
              <div className="hero-stat-lbl">Credential Badges</div>
            </div>
          </div>
        </div>
      </div>

      {/* Research Projects */}
      <div className="section" style={{ maxWidth: 960 + 64, margin: "0 auto" }}>
        <div className="section-title">Open Research Projects</div>
        <div className="section-sub">Choose a study to join. You can participate in more than one.</div>
        <div className="project-grid">
          {RESEARCH_PROJECTS.map(proj => {
            const donePhases = proj.phases.filter(p => p.status === "complete").length;
            const activePhase = proj.phases.find(p => p.status === "active");
            return (
              <div key={proj.id} className="project-card" style={setAccent(proj.color)} onClick={() => onSelectProject(proj)}>
                <div className="project-card-domain">{proj.domain}</div>
                <div className="project-card-title">{proj.icon} {proj.title}</div>
                <div className="project-card-q">{proj.question}</div>
                <div className="project-card-footer">
                  <div>
                    <div style={{ fontSize: 10, color: C.muted, marginBottom: 4 }}>Phase Progress</div>
                    <div className="phase-pills">
                      {proj.phases.map(ph => (
                        <div key={ph.id} className={`phase-pill ${ph.status === "complete" ? "done" : ph.status === "active" ? "active" : ""}`} style={{ background: ph.status === "complete" ? proj.color : ph.status === "active" ? proj.color + "66" : C.sand }} />
                      ))}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button className="join-btn" style={setAccent(proj.color)} onClick={e => { e.stopPropagation(); onSignup(proj); }}>Join Team</button>
                    <button onClick={e => { e.stopPropagation(); onSelectProject(proj); }} style={{ padding: "6px 14px", borderRadius: 20, fontSize: 12, fontWeight: 600, border: `1.5px solid ${C.sand}`, background: "none", color: C.mid, cursor: "pointer", fontFamily: "'Source Serif 4', serif" }}>Open</button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* How It Works */}
        <div style={{ marginTop: 48 }}>
          <div className="section-title">How the Research Program Works</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 14, marginTop: 20 }}>
            {[
              { step: "01", title: "Join a Team", desc: "Sign yourself and collaborators up. No join code needed." },
              { step: "02", title: "Work Through Phases", desc: "Each phase has specific tasks with clear validation requirements." },
              { step: "03", title: "AI-Assisted Research", desc: "Your AI assistant scaffolds tasks, pulls platform data, and drafts text for you to edit." },
              { step: "04", title: "Earn Your Credential", desc: "Complete all 5 phases to earn the University of Dayton Community Research Scholar certificate." },
            ].map(item => (
              <div key={item.step} style={{ background: C.white, border: `1px solid ${C.sand}`, borderRadius: 10, padding: "18px 16px" }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.gold, letterSpacing: 2, marginBottom: 6 }}>{item.step}</div>
                <div style={{ fontSize: 15, fontWeight: 600, color: C.navy, marginBottom: 6, fontFamily: "'Playfair Display', serif" }}>{item.title}</div>
                <div style={{ fontSize: 12, color: C.mid, lineHeight: 1.55 }}>{item.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── ROOT APP ────────────────────────────────────────────────────────────────────
export default function ResearchPlatform() {
  const [view, setView] = useState("landing"); // landing | phase0 | project | signup | success
  const [selectedProject, setSelectedProject] = useState(null);
  const [signupProject, setSignupProject] = useState(null);
  const [phase0Project, setPhase0Project] = useState(null);
  const { user } = useAuth();

  const handleSelectProject = (proj) => {
    // Gate: researcher must complete Phase 0 before entering project
    // In production this would check researcher_phase0_progress in Supabase
    // For now we show Phase 0 first time a project is opened
    setPhase0Project(proj);
    setView("phase0");
  };

  const handlePhase0Complete = () => {
    setSelectedProject(phase0Project);
    setView("project");
  };

  const handleSignup = (proj) => {
    setSignupProject(proj);
    setView("signup");
  };

  const handleSignupSuccess = (data) => {
    setView("success");
  };

  const getBreadcrumbs = () => {
    if (view === "landing") return [{ label: "Research", action: null }];
    if (view === "phase0") return [{ label: "Research", action: () => setView("landing") }, { label: phase0Project?.shortTitle }, { label: "Data Orientation" }];
    if (view === "project") return [{ label: "Research", action: () => setView("landing") }, { label: selectedProject?.shortTitle }];
    if (view === "signup") return [{ label: "Research", action: () => setView("landing") }, { label: "Join Team" }];
    return [{ label: "Research", action: () => setView("landing") }];
  };

  return (
    <div className="rp-root">
      <StyleTag />

        {/* ── Main content ── */}
        <div className="rp-main" style={{ marginLeft: 224 }}>

          {/* Topbar */}
          <div className="topbar">
            <div className="topbar-brand">
              <span className="topbar-logo">vAI</span>
              <div className="topbar-divider" />
              <span className="topbar-section">Research Program</span>
            </div>
            {/* Home button in topbar (mirrors sidebar, visible on narrow viewports) */}
            <a
              href="https://nextvillage.community/home"
              style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "5px 12px", borderRadius: 6,
                background: `${C.gold}18`, border: `1px solid ${C.gold}44`,
                color: C.gold, fontSize: 12, fontWeight: 700,
                fontFamily: "'Source Serif 4', serif",
                textDecoration: "none", letterSpacing: 0.3,
              }}
            >
              🏠 Home
            </a>
          </div>

          {/* Breadcrumb */}
          <div className="breadcrumb">
            {getBreadcrumbs().map((crumb, i) => (
              <span key={i} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                {i > 0 && <span className="breadcrumb-sep">›</span>}
                {crumb.action ? (
                  <button className="breadcrumb-btn" onClick={crumb.action}>{crumb.label}</button>
                ) : (
                  <span style={{ color: C.charcoal, fontWeight: 500 }}>{crumb.label}</span>
                )}
              </span>
            ))}
          </div>

          {/* Views */}
          {view === "landing" && (
            <ResearchLanding onSelectProject={handleSelectProject} onSignup={handleSignup} />
          )}

          {view === "phase0" && phase0Project && (
            <Phase0Orientation
              project={phase0Project}
              onComplete={handlePhase0Complete}
            />
          )}

          {view === "project" && selectedProject && (
            <ProjectPage project={selectedProject} onBack={() => setView("landing")} />
          )}

          {view === "signup" && signupProject && (
            <SignupForm
              project={signupProject}
              onSuccess={handleSignupSuccess}
              onCancel={() => setView("landing")}
            />
          )}

          {view === "success" && (
            <div style={{ padding: "80px 32px", textAlign: "center", maxWidth: 500, margin: "0 auto" }}>
              <div style={{ fontSize: 56, marginBottom: 16 }}>🎉</div>
              <h2 style={{ fontSize: 26, color: C.navy, marginBottom: 10 }}>You're on the research team!</h2>
              <p style={{ fontSize: 15, color: C.mid, marginBottom: 28, lineHeight: 1.6, fontStyle: "italic" }}>
                Your team has been registered. You can now access all active phases and begin working with the AI research assistant.
              </p>
              <button className="primary-btn" style={{ maxWidth: 300, margin: "0 auto" }} onClick={() => setView("landing")}>
                Go to Research Dashboard
              </button>
            </div>
          )}

        </div>{/* /rp-main */}
    </div>
  );
}