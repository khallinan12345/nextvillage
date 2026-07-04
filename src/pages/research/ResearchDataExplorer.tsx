// src/pages/research/ResearchDataExplorer.tsx
// Research data exploration interface with AI assistant.
// Pulls from get_research_snapshot RPC → dashboard_stats → research_data_view
// Accessible only to research_lead, site_leader, platform_administrator.
//
// v2: Adds longitudinal analysis tab, persistent learner trajectory view,
//     assessment cycle tracking, mentor presence natural experiment panel,
//     and enterprise artifact quality — aligned with Hallinan et al. (2026).

import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { supabase } from "../../lib/supabaseClient";
import { useAuth } from "../../hooks/useAuth";
import { useNavigate } from "react-router-dom";

// ─── DESIGN TOKENS ───────────────────────────────────────────────────────────
const C = {
  navy:    "#1B2A4A",
  navyDk:  "#111D33",
  gold:    "#C8963E",
  goldLt:  "#E6B96A",
  teal:    "#2A7B88",
  sage:    "#5B7A6A",
  cream:   "#FAF8F4",
  sand:    "#E8E2D6",
  charcoal:"#2D2D2D",
  mid:     "#6B6560",
  muted:   "#9A9490",
  white:   "#FFFFFF",
  success: "#2E7D32",
  warn:    "#E65100",
  blue:    "#3D6B99",
};

// ─── TYPES ───────────────────────────────────────────────────────────────────
interface Field { key: string; label: string; }
interface FieldGroup { label: string; fields: Field[]; }
interface DataRow { [key: string]: string | number | boolean | string[] | null | undefined; }
interface Message { role: "user" | "assistant"; content: string; }

interface Summary {
  learners: number;
  persistentLearners: number;
  sites: number;
  months: number;
  avgAIProf: string;
  avgPUE: string;
  roleReady: number;
  certsEarned: number;
  totalRows: number;
  avgArtifactQuality: string;
  convergingPct: string;
}

// Longitudinal: one entry per learner, sorted by assessment cycle
interface LearnerTrajectory {
  token: string;
  site: string;
  cycles: DataRow[];  // sorted by cohort_month ascending
}

// ─── FIELD DEFINITIONS ───────────────────────────────────────────────────────
const FIELD_GROUPS: FieldGroup[] = [
  {
    label: "Session Activity",
    fields: [
      { key: "site",                  label: "Site"              },
      { key: "cohort_month",          label: "Month"             },
      { key: "assessment_cycle",      label: "Cycle #"           },
      { key: "is_persistent_learner", label: "Persistent"        },
      { key: "mentor_present",        label: "Mentor Present"    },
      { key: "grade_band",            label: "Grade Band"        },
      { key: "session_count",         label: "Sessions"          },
      { key: "engaged_session_count", label: "Engaged Sessions"  },
      { key: "avg_words_per_session", label: "Avg Words/Session" },
    ]
  },
  {
    label: "AI Proficiency (0–3)",
    fields: [
      { key: "ai_prof_application_score",   label: "Application"   },
      { key: "ai_prof_ethics_score",        label: "Ethics"        },
      { key: "ai_prof_understanding_score", label: "Understanding" },
      { key: "ai_prof_verification_score",  label: "Verification"  },
      { key: "ai_prof_min_score",           label: "Min Score"     },
      { key: "ai_prof_cert_level",          label: "Cert Level"    },
    ]
  },
  {
    label: "Cognitive Skills (0–3)",
    fields: [
      { key: "cognitive_score",         label: "Cognitive"        },
      { key: "critical_thinking_score", label: "Critical Thinking"},
      { key: "problem_solving_score",   label: "Problem Solving"  },
      { key: "creativity_score",        label: "Creativity"       },
    ]
  },
  {
    label: "Reasoning Levels",
    fields: [
      { key: "reasoning_level_0",    label: "Level 0 (Definitional)" },
      { key: "reasoning_level_1",    label: "Level 1 (Responsive)"   },
      { key: "reasoning_level_2",    label: "Level 2 (Elaborative)"  },
      { key: "reasoning_level_3",    label: "Level 3 (Structured)"   },
      { key: "reasoning_chain_count",label: "Chain Count"            },
    ]
  },
  {
    label: "Metacognition",
    fields: [
      { key: "metacog_verification_rate", label: "Verification Rate" },
      { key: "metacog_reactive_rate",     label: "Reactive Rate"     },
      { key: "metacog_strategic_rate",    label: "Strategic Rate"    },
    ]
  },
  {
    label: "Scaffolding",
    fields: [
      { key: "scaffold_convergence_trend",             label: "Convergence Trend"      },
      { key: "scaffold_clarification_per_session",     label: "Clarifications/Session" },
      { key: "scaffold_decomposition_per_session",     label: "Decompositions/Session" },
      { key: "scaffold_consecutive_correction_runs",   label: "Correction Runs"        },
    ]
  },
  {
    label: "Productive Use of Energy",
    fields: [
      { key: "pue_score",                   label: "PUE Score"           },
      { key: "pue_energy_constraint_pct",   label: "Energy Constraint %" },
      { key: "pue_market_pricing_pct",      label: "Market Pricing %"    },
      { key: "pue_enterprise_planning_pct", label: "Enterprise Planning %"},
      { key: "pue_learner_initiated_pct",   label: "Learner Initiated %"  },
      { key: "pue_multi_domain_pct",        label: "Multi-Domain %"       },
      { key: "pue_local_context_pct",       label: "Local Context %"      },
    ]
  },
  {
    label: "Role Readiness",
    fields: [
      { key: "role_readiness_signal",             label: "Readiness Signal"      },
      { key: "role_teaching_intent_count",        label: "Teaching Intent"       },
      { key: "role_community_application_count",  label: "Community Application" },
      { key: "role_enterprise_orientation_count", label: "Enterprise Orientation"},
      { key: "role_intergenerational_count",      label: "Intergenerational"     },
      { key: "peer_diffusion_signal",             label: "Peer Diffusion"        },
    ]
  },
  {
    label: "Certifications & Activities",
    fields: [
      { key: "activities_started_total",    label: "Activities Started (total)"    },
      { key: "activities_completed_total",  label: "Activities Completed (total)"  },
      { key: "activities_started_today",    label: "Activities Started (today)"    },
      { key: "activities_completed_today",  label: "Activities Completed (today)"  },
      { key: "certifications_earned_total", label: "Certs Earned (total)"          },
      { key: "certifications_earned_today", label: "Certs Earned (today)"          },
      { key: "cert_attempted_count",        label: "Certs Attempted"               },
      { key: "cert_passed_count",           label: "Certs Passed"                  },
      { key: "cert_avg_score",              label: "Avg Cert Score"                },
      { key: "cert_names_passed",           label: "Cert Names Passed"             },
      { key: "ci_tracks_active_count",      label: "CI Tracks Active"              },
      { key: "ci_certs_passed_count",       label: "CI Certs Passed"               },
      { key: "k_anon_suppressed",           label: "K-Anon Suppressed"             },
    ]
  },
  {
    label: "Enterprise Artifacts",
    fields: [
      { key: "artifact_produced",               label: "Artifact Produced"     },
      { key: "artifact_quality_score",          label: "Quality Score (0–12)"  },
      { key: "artifact_goal_specificity",       label: "Goal Specificity"      },
      { key: "artifact_resource_spec",          label: "Resource Spec"         },
      { key: "artifact_implementation_steps",   label: "Implementation Steps"  },
      { key: "artifact_constraint_integration", label: "Constraint Integration"},
      { key: "artifact_quantitative_reasoning", label: "Quantitative Reasoning"},
      { key: "artifact_feasibility",            label: "Feasibility"           },
    ]
  },
];

const ALL_FIELDS: Field[] = FIELD_GROUPS.flatMap((g: FieldGroup) => g.fields);
const LONGITUDINAL_GROUP_INDEX = FIELD_GROUPS.length; // virtual tab index

// ─── SCHEMA CONTEXT ──────────────────────────────────────────────────────────
const SCHEMA_CONTEXT = `
You are a research data assistant for the vAI AI Learning Lab — a solar-powered AI education program in off-grid communities in Nigeria (Oloibiri, Ibiade) and expanding to Lagos and Ghana.

The dataset contains anonymized monthly learner assessment snapshots aligned with the longitudinal study: Hallinan, Hao, Davidson & Clergy (2026), submitted to World Development.

Each row represents one learner (learner_token — stable, anonymous) for one month at one site.

KEY LONGITUDINAL FIELDS:
- assessment_cycle: integer rank of this month within the learner's history (1 = first ever assessment)
- is_persistent_learner: true if learner has ≥2 assessment months in the full dataset (paper's n=33 cohort)
- mentor_present: boolean — false flags the Nov 2025–Feb 2026 period when Davidson was absent (natural experiment)

REASONING LEVELS (paper's primary outcome):
- reasoning_level_0: % interactions at definitional level
- reasoning_level_1: % interactions at responsive/prompted level
- reasoning_level_2: % interactions at elaborative level
- reasoning_level_3: % interactions at structured multi-step reasoning (enterprise-ready)
Paper finding: L3 grew from 10.9% (cycle 1) to 24.8% (cycle 3) — a 2.3× increase.

SCAFFOLDING (paper's secondary outcome):
- scaffold_clarification_per_session: AI clarification requests per session (fell 58% by cycle 3: 6.6 → 2.8)
- scaffold_convergence_trend: 'converging' | 'stable' | 'diverging'
Paper finding: 37.5% converging by cycle 3, 0% diverging.

ENTERPRISE ARTIFACTS (paper's tertiary outcome):
- artifact_quality_score: 0–12 rubric (goal specificity, resource spec, implementation, constraint integration, quantitative reasoning, feasibility)
Paper finding: quality rose from 4.1 (cycle 1) to 6.5 (cycle 3), a 60% gain.

ROLE READINESS (community spillover):
- role_teaching_intent_count, role_community_application_count, role_enterprise_orientation_count, role_intergenerational_count
Paper finding: all four roughly doubled from cycle 1 to cycle 3.

NATURAL EXPERIMENT:
- mentor_present = false covers Nov 2025–Feb 2026 when Davidson's daily presence was interrupted.
  Engagement dropped to near-zero despite unchanged technology and curriculum.
  Engagement ratio mentor-present vs absent ≈ 5.4×.

RESEARCH DOMAINS:
1. Learning Outcomes: AI proficiency and reasoning level gains over cycles
2. Hope & Agency: role readiness and peer diffusion signals over cycles
3. Community Spillover: PUE score and community application over cycles

DATA NOTES:
- All data is k-anonymized: cohorts < 5 learners suppressed
- Scores on 0–3 scale (UNESCO-aligned): 0=none, 1=emerging, 2=developing, 3=proficient
- Filter to is_persistent_learner=true to replicate the paper's n=33 cohort
`.trim();

// ─── CSS ─────────────────────────────────────────────────────────────────────
const css = `
  @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;600;700&family=Source+Serif+4:wght@300;400;600&family=JetBrains+Mono:wght@400;500&display=swap');

  * { box-sizing: border-box; margin: 0; padding: 0; }

  .rde-root {
    font-family: 'Source Serif 4', Georgia, serif;
    background: ${C.cream};
    min-height: 100vh;
    color: ${C.charcoal};
    margin-left: 224px;
  }

  .rde-topbar {
    background: ${C.navyDk};
    padding: 0 32px;
    height: 54px;
    display: flex; align-items: center; justify-content: space-between;
    position: sticky; top: 0; z-index: 100;
    border-bottom: 2px solid ${C.gold}44;
  }
  .rde-brand { display: flex; align-items: center; gap: 10px; }
  .rde-logo { font-family: 'Playfair Display', serif; font-size: 17px; font-weight: 700; color: ${C.white}; }
  .rde-divider { width: 1px; height: 18px; background: ${C.gold}55; }
  .rde-section { font-size: 11px; color: ${C.gold}; font-weight: 600; letter-spacing: 1.5px; text-transform: uppercase; }
  .rde-home-btn {
    padding: 6px 14px; border-radius: 7px;
    background: ${C.gold}18; border: 1px solid ${C.gold}44;
    color: ${C.gold}; font-size: 12px; font-weight: 600;
    cursor: pointer; font-family: 'Source Serif 4', serif; transition: all 0.2s;
  }
  .rde-home-btn:hover { background: ${C.gold}30; }

  .rde-layout {
    display: grid;
    grid-template-columns: 1fr 380px;
    grid-template-rows: auto 1fr;
    gap: 0;
    min-height: calc(100vh - 54px);
  }

  .rde-filters {
    grid-column: 1 / -1;
    background: ${C.white};
    border-bottom: 1px solid ${C.sand};
    padding: 14px 28px;
    display: flex; align-items: center; gap: 12px; flex-wrap: wrap;
  }
  .rde-filter-label { font-size: 11px; font-weight: 600; color: ${C.muted}; letter-spacing: 1px; text-transform: uppercase; }
  .rde-select {
    padding: 6px 12px; border-radius: 6px;
    border: 1px solid ${C.sand}; background: ${C.cream};
    font-family: 'Source Serif 4', serif; font-size: 13px; color: ${C.charcoal}; cursor: pointer;
  }
  .rde-btn {
    padding: 7px 16px; border-radius: 7px;
    background: ${C.navy}; border: none; cursor: pointer;
    color: ${C.white}; font-size: 13px; font-weight: 600;
    font-family: 'Source Serif 4', serif; transition: all 0.2s;
  }
  .rde-btn:hover { background: ${C.navyDk}; }
  .rde-btn.secondary { background: transparent; border: 1px solid ${C.sand}; color: ${C.charcoal}; }
  .rde-btn.secondary:hover { background: ${C.sand}; }
  .rde-btn.active-filter { background: ${C.teal}; }

  .rde-data-panel { padding: 24px 28px; overflow-y: auto; }

  .rde-summary-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
    gap: 10px;
    margin-bottom: 20px;
  }
  .rde-stat-card { background: ${C.white}; border: 1px solid ${C.sand}; border-radius: 10px; padding: 12px 14px; }
  .rde-stat-val { font-family: 'Playfair Display', serif; font-size: 24px; font-weight: 700; color: ${C.navy}; line-height: 1; }
  .rde-stat-lbl { font-size: 11px; color: ${C.muted}; letter-spacing: 0.5px; margin-top: 4px; }
  .rde-stat-card.highlight { border-color: ${C.gold}55; background: ${C.gold}08; }
  .rde-stat-card.highlight .rde-stat-val { color: ${C.gold}; }

  .rde-group-tabs { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 14px; }
  .rde-group-tab {
    padding: 5px 12px; border-radius: 20px;
    border: 1px solid ${C.sand}; background: ${C.white};
    font-size: 12px; font-weight: 500; cursor: pointer;
    color: ${C.mid}; transition: all 0.15s; font-family: 'Source Serif 4', serif;
  }
  .rde-group-tab.active { background: ${C.navy}; border-color: ${C.navy}; color: ${C.white}; }
  .rde-group-tab.longitudinal { border-color: ${C.teal}55; color: ${C.teal}; }
  .rde-group-tab.longitudinal.active { background: ${C.teal}; border-color: ${C.teal}; color: ${C.white}; }

  .rde-table-wrap { overflow-x: auto; background: ${C.white}; border: 1px solid ${C.sand}; border-radius: 10px; }
  .rde-table { width: 100%; border-collapse: collapse; font-size: 13px; }
  .rde-table th {
    padding: 10px 12px; text-align: left;
    font-size: 10px; font-weight: 600; color: ${C.muted};
    letter-spacing: 0.8px; text-transform: uppercase;
    background: ${C.cream}; border-bottom: 1px solid ${C.sand}; white-space: nowrap;
  }
  .rde-table td { padding: 9px 12px; border-bottom: 1px solid ${C.sand}88; color: ${C.charcoal}; font-size: 13px; }
  .rde-table tr:last-child td { border-bottom: none; }
  .rde-table tr:hover td { background: ${C.cream}; }
  .score-pill { display: inline-block; padding: 2px 8px; border-radius: 10px; font-size: 11px; font-weight: 600; font-family: 'JetBrains Mono', monospace; }
  .score-0 { background: #FFF3E0; color: #E65100; }
  .score-1 { background: #FFF8E1; color: #F57F17; }
  .score-2 { background: #E8F5E9; color: #2E7D32; }
  .score-3 { background: #E3F2FD; color: #1565C0; }

  /* ── LONGITUDINAL PANEL ── */
  .long-panel { display: flex; flex-direction: column; gap: 20px; }

  .long-section-title {
    font-family: 'Playfair Display', serif;
    font-size: 15px; font-weight: 700; color: ${C.navy};
    margin-bottom: 12px;
    padding-bottom: 8px;
    border-bottom: 1px solid ${C.sand};
  }

  .long-card { background: ${C.white}; border: 1px solid ${C.sand}; border-radius: 10px; padding: 18px 20px; }
  .long-card.mentor-absent { border-color: ${C.warn}44; background: #FFF3E088; }
  .long-card.mentor-present { border-color: ${C.success}44; background: #E8F5E988; }

  /* Reasoning composition stacked bars */
  .stk-row { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
  .stk-cycle-label { width: 100px; font-size: 11px; color: ${C.muted}; text-align: right; flex-shrink: 0; }
  .stk-bar { flex: 1; height: 22px; display: flex; border-radius: 4px; overflow: hidden; }
  .stk-seg { display: flex; align-items: center; justify-content: center; font-size: 9px; font-weight: 600; overflow: hidden; white-space: nowrap; }
  .stk-l0 { background: #E8E2D6; color: ${C.mid}; }
  .stk-l1 { background: #1a4a6e; color: #5a9abf; }
  .stk-l2 { background: #1a5c5c; color: #4aabab; }
  .stk-l3 { background: #0F6E56; color: #9FE1CB; }
  .stk-l3-hi { background: #1D9E75; color: #E1F5EE; }
  .stk-legend { display: flex; gap: 14px; margin-top: 10px; flex-wrap: wrap; }
  .stk-leg-item { display: flex; align-items: center; gap: 5px; font-size: 11px; color: ${C.muted}; }
  .stk-leg-dot { width: 10px; height: 10px; border-radius: 2px; flex-shrink: 0; }

  /* Scaffolding bars */
  .scaf-row { margin-bottom: 8px; }
  .scaf-top { display: flex; justify-content: space-between; margin-bottom: 3px; font-size: 12px; }
  .scaf-bar-bg { height: 6px; background: ${C.sand}; border-radius: 99px; overflow: hidden; }
  .scaf-bar { height: 100%; background: ${C.teal}; border-radius: 99px; }

  /* Role readiness grouped bars */
  .role-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
  .role-item { }
  .role-lbl { font-size: 11px; color: ${C.muted}; margin-bottom: 5px; }
  .role-bars { display: flex; gap: 3px; align-items: flex-end; height: 36px; }
  .role-bar { flex: 1; border-radius: 2px 2px 0 0; }
  .role-pcts { display: flex; margin-top: 3px; }
  .role-pct { flex: 1; font-size: 10px; text-align: center; font-family: 'JetBrains Mono', monospace; }

  /* Natural experiment */
  .nat-stat { font-family: 'Playfair Display', serif; font-size: 36px; font-weight: 700; color: ${C.navy}; line-height: 1; }
  .nat-sub { font-size: 12px; color: ${C.muted}; margin-top: 4px; line-height: 1.6; }
  .nat-timeline { display: flex; flex-direction: column; gap: 10px; margin-top: 14px; }
  .nat-event { display: flex; gap: 10px; align-items: flex-start; }
  .nat-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; margin-top: 4px; }
  .nat-text { font-size: 12px; color: ${C.mid}; line-height: 1.5; }
  .nat-text strong { color: ${C.charcoal}; font-weight: 600; }

  /* Artifact quality */
  .artifact-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
  .artifact-card { background: ${C.cream}; border-radius: 8px; padding: 10px 12px; text-align: center; }
  .artifact-num { font-family: 'Playfair Display', serif; font-size: 22px; font-weight: 700; color: ${C.navy}; line-height: 1; }
  .artifact-lbl { font-size: 10px; color: ${C.muted}; margin-top: 3px; }
  .artifact-chg { font-size: 11px; font-weight: 600; margin-top: 2px; }

  .rde-empty { padding: 48px; text-align: center; color: ${C.muted}; font-size: 14px; font-style: italic; }

  /* ── AI PANEL ── */
  .rde-ai-panel {
    border-left: 1px solid ${C.sand}; background: ${C.white};
    display: flex; flex-direction: column;
    height: calc(100vh - 54px); position: sticky; top: 54px;
  }
  .rde-ai-header { padding: 16px 20px; border-bottom: 1px solid ${C.sand}; background: ${C.navy}08; }
  .rde-ai-title { font-family: 'Playfair Display', serif; font-size: 15px; font-weight: 700; color: ${C.navy}; display: flex; align-items: center; gap: 8px; }
  .rde-ai-subtitle { font-size: 11px; color: ${C.muted}; margin-top: 3px; }
  .rde-ai-messages { flex: 1; overflow-y: auto; padding: 16px 20px; display: flex; flex-direction: column; gap: 12px; }
  .rde-msg { max-width: 92%; }
  .rde-msg.user { align-self: flex-end; }
  .rde-msg.assistant { align-self: flex-start; }
  .rde-msg-bubble { padding: 10px 14px; border-radius: 12px; font-size: 13px; line-height: 1.6; }
  .rde-msg.user .rde-msg-bubble { background: ${C.navy}; color: ${C.white}; border-bottom-right-radius: 4px; }
  .rde-msg.assistant .rde-msg-bubble { background: ${C.cream}; color: ${C.charcoal}; border: 1px solid ${C.sand}; border-bottom-left-radius: 4px; }
  .rde-msg-bubble pre { font-family: 'JetBrains Mono', monospace; font-size: 11px; background: ${C.sand}; padding: 8px; border-radius: 6px; margin-top: 6px; overflow-x: auto; white-space: pre-wrap; }
  .rde-quick-prompts { padding: 0 20px 12px; display: flex; flex-direction: column; gap: 6px; }
  .rde-quick-prompt-label { font-size: 10px; color: ${C.muted}; letter-spacing: 1px; text-transform: uppercase; font-weight: 600; margin-bottom: 2px; }
  .rde-quick-btn { padding: 7px 12px; border-radius: 7px; border: 1px solid ${C.sand}; background: ${C.cream}; font-size: 12px; color: ${C.mid}; cursor: pointer; text-align: left; font-family: 'Source Serif 4', serif; transition: all 0.15s; line-height: 1.4; }
  .rde-quick-btn:hover { background: ${C.sand}; color: ${C.charcoal}; }
  .rde-ai-input-row { padding: 14px 20px; border-top: 1px solid ${C.sand}; display: flex; gap: 8px; align-items: flex-end; }
  .rde-ai-textarea { flex: 1; padding: 9px 12px; border-radius: 8px; border: 1px solid ${C.sand}; resize: none; font-family: 'Source Serif 4', serif; font-size: 13px; line-height: 1.5; min-height: 56px; max-height: 120px; background: ${C.cream}; color: ${C.charcoal}; }
  .rde-ai-textarea:focus { outline: none; border-color: ${C.navy}55; }
  .rde-send-btn { padding: 9px 16px; border-radius: 8px; background: ${C.navy}; border: none; cursor: pointer; color: ${C.white}; font-size: 13px; font-weight: 600; font-family: 'Source Serif 4', serif; align-self: flex-end; transition: all 0.2s; white-space: nowrap; }
  .rde-send-btn:hover { background: ${C.gold}; }
  .rde-send-btn:disabled { opacity: 0.5; cursor: not-allowed; }
  .rde-thinking { display: flex; align-items: center; gap: 6px; font-size: 12px; color: ${C.muted}; font-style: italic; padding: 8px 14px; background: ${C.cream}; border-radius: 10px; border: 1px solid ${C.sand}; align-self: flex-start; }
  .rde-thinking-dot { width: 6px; height: 6px; border-radius: 50%; background: ${C.gold}; animation: pulse 1.2s infinite; }
  .rde-thinking-dot:nth-child(2) { animation-delay: 0.2s; }
  .rde-thinking-dot:nth-child(3) { animation-delay: 0.4s; }
  @keyframes pulse { 0%,100% { opacity:0.3; } 50% { opacity:1; } }
`;

// ─── UTILS ───────────────────────────────────────────────────────────────────
function scoreClass(val: number | string | null | undefined): string {
  if (val === null || val === undefined) return "";
  const n = parseFloat(String(val));
  if (n < 1) return "score-0";
  if (n < 2) return "score-1";
  if (n < 3) return "score-2";
  return "score-3";
}

function formatCell(key: string, val: DataRow[string]): React.ReactNode {
  if (val === null || val === undefined) return <span style={{ color: "#ccc" }}>—</span>;
  if (typeof val === "boolean") return val ? "✓" : "—";
  if (typeof val === "number" && key.includes("score")) {
    return <span className={`score-pill ${scoreClass(val)}`}>{val.toFixed(2)}</span>;
  }
  if (key === "cohort_month") return new Date(String(val)).toLocaleDateString("en-US", { year: "numeric", month: "short" });
  if (key === "scaffold_convergence_trend") {
    const colors: Record<string, string> = { converging: C.success, stable: C.mid, diverging: C.warn };
    return <span style={{ color: colors[String(val)] ?? C.charcoal, fontWeight: 600 }}>{String(val)}</span>;
  }
  if (key === "assessment_cycle") return <span style={{ fontFamily: "JetBrains Mono, monospace", fontWeight: 600, color: C.teal }}>#{String(val)}</span>;
  if (Array.isArray(val)) return val.join(", ");
  if (typeof val === "number") return val % 1 === 0 ? val : val.toFixed(1);
  return String(val);
}

function pct(n: number, total: number) { return total ? Math.round((n / total) * 100) : 0; }

function toCSV(data: DataRow[], fields: Field[]): string {
  const headers = fields.map(f => f.label).join(",");
  const rows = data.map((row: DataRow) =>
    fields.map((f: Field) => {
      const v = row[f.key];
      if (v === null || v === undefined) return "";
      if (Array.isArray(v)) return `"${v.join("; ")}"`;
      if (typeof v === "string" && v.includes(",")) return `"${v}"`;
      return v;
    }).join(",")
  );
  return [headers, ...rows].join("\n");
}

const QUICK_PROMPTS: string[] = [
  "Summarise the key longitudinal trends in this dataset",
  "Show L3 reasoning growth across assessment cycles for persistent learners",
  "How does scaffolding demand change across cycles?",
  "Compare role readiness signals at cycle 1 vs cycle 3",
  "What does the natural experiment tell us about mentor presence?",
  "How does artifact quality score change with assessment cycle?",
  "Which sites show the strongest PUE linkage over time?",
  "What statistical approach would you recommend for the Learning Outcomes study?",
];

// ─── LONGITUDINAL VIEW ───────────────────────────────────────────────────────
function LongitudinalPanel({ data }: { data: DataRow[] }) {
  const persistent = data.filter(r => r.is_persistent_learner);

  // Group by assessment cycle (1, 2, 3)
  const byCycle = useMemo(() => {
    const map: Record<number, DataRow[]> = {};
    persistent.forEach(r => {
      const c = Number(r.assessment_cycle) || 0;
      if (!map[c]) map[c] = [];
      map[c].push(r);
    });
    return map;
  }, [persistent]);

  const cycles = [1, 2, 3].filter(c => byCycle[c]?.length > 0);

  // Reasoning composition per cycle
  const reasoningByCycle = cycles.map(c => {
    const rows = byCycle[c];
    const avg = (key: string) => rows.reduce((s, r) => s + (Number(r[key]) || 0), 0) / rows.length;
    return {
      cycle: c,
      n: rows.length,
      l0: avg("reasoning_level_0"),
      l1: avg("reasoning_level_1"),
      l2: avg("reasoning_level_2"),
      l3: avg("reasoning_level_3"),
    };
  });

  // Scaffolding per cycle
  const scaffoldByCycle = cycles.map(c => {
    const rows = byCycle[c];
    const avgClarf = rows.reduce((s, r) => s + (Number(r.scaffold_clarification_per_session) || 0), 0) / rows.length;
    const converging = rows.filter(r => r.scaffold_convergence_trend === "converging").length;
    const diverging  = rows.filter(r => r.scaffold_convergence_trend === "diverging").length;
    return { cycle: c, n: rows.length, avgClarf, convergingPct: pct(converging, rows.length), divergingPct: pct(diverging, rows.length) };
  });

  // Role readiness per cycle
  const roleByCycle = cycles.map(c => {
    const rows = byCycle[c];
    const sig = (key: string) => pct(rows.filter(r => (Number(r[key]) || 0) > 0).length, rows.length);
    return {
      cycle: c,
      teaching:      sig("role_teaching_intent_count"),
      community:     sig("role_community_application_count"),
      enterprise:    sig("role_enterprise_orientation_count"),
      intergenerational: sig("role_intergenerational_count"),
    };
  });

  // Artifact quality per cycle
  const artifactByCycle = cycles.map(c => {
    const rows = byCycle[c].filter(r => r.artifact_produced);
    const avg = rows.length > 0
      ? rows.reduce((s, r) => s + (Number(r.artifact_quality_score) || 0), 0) / rows.length
      : null;
    return { cycle: c, n: rows.length, avg };
  });

  // Natural experiment
  const mentorAbsent  = data.filter(r => r.mentor_present === false);
  const mentorPresent = data.filter(r => r.mentor_present !== false);
  const avgSessionsAbsent  = mentorAbsent.length  ? mentorAbsent.reduce((s, r)  => s + (Number(r.session_count) || 0), 0) / mentorAbsent.length  : 0;
  const avgSessionsPresent = mentorPresent.length ? mentorPresent.reduce((s, r) => s + (Number(r.session_count) || 0), 0) / mentorPresent.length : 0;
  const engagementRatio = avgSessionsAbsent > 0 ? (avgSessionsPresent / avgSessionsAbsent).toFixed(1) : "—";

  // Max L1 for bar scaling
  const maxClarf = Math.max(...scaffoldByCycle.map(s => s.avgClarf), 1);

  // Role bar colours
  const roleColors = ["rgba(42,123,136,0.3)", "rgba(42,123,136,0.6)", "#2A7B88"];

  if (persistent.length === 0) {
    return (
      <div className="rde-empty">
        No persistent learners (≥2 assessment cycles) in the current filter.<br />
        Try widening the date range or removing the site filter.
      </div>
    );
  }

  return (
    <div className="long-panel">

      {/* ── Reasoning composition ── */}
      <div className="long-card">
        <div className="long-section-title">
          Reasoning level composition across assessment cycles
          <span style={{ fontSize: 12, fontWeight: 400, color: C.muted, marginLeft: 10 }}>
            persistent learners · n={persistent.length}
          </span>
        </div>
        {reasoningByCycle.map(r => (
          <div key={r.cycle} className="stk-row">
            <div className="stk-cycle-label">Cycle {r.cycle} (n={r.n})</div>
            <div className="stk-bar">
              <div className="stk-seg stk-l0" style={{ width: `${r.l0}%` }}>{r.l0 > 6 ? `${r.l0.toFixed(0)}%` : ""}</div>
              <div className="stk-seg stk-l1" style={{ width: `${r.l1}%` }}>{r.l1 > 8 ? `L1 ${r.l1.toFixed(0)}%` : ""}</div>
              <div className="stk-seg stk-l2" style={{ width: `${r.l2}%` }}>{r.l2 > 8 ? `${r.l2.toFixed(0)}%` : ""}</div>
              <div className={`stk-seg ${r.cycle === cycles[cycles.length - 1] ? "stk-l3-hi" : "stk-l3"}`} style={{ width: `${r.l3}%` }}>
                {r.l3 > 8 ? `L3 ${r.l3.toFixed(0)}%` : ""}
              </div>
            </div>
          </div>
        ))}
        <div className="stk-legend">
          <div className="stk-leg-item"><div className="stk-leg-dot" style={{ background: C.sand, border: `1px solid ${C.muted}` }} />L0 Definitional</div>
          <div className="stk-leg-item"><div className="stk-leg-dot" style={{ background: "#1a4a6e" }} />L1 Responsive</div>
          <div className="stk-leg-item"><div className="stk-leg-dot" style={{ background: "#1a5c5c" }} />L2 Elaborative</div>
          <div className="stk-leg-item"><div className="stk-leg-dot" style={{ background: "#1D9E75" }} />L3 Structured — enterprise-ready</div>
        </div>
      </div>

      {/* ── Scaffolding demand ── */}
      <div className="long-card">
        <div className="long-section-title">AI scaffolding demand — clarifications per session</div>
        {scaffoldByCycle.map(s => (
          <div key={s.cycle} className="scaf-row">
            <div className="scaf-top">
              <span style={{ fontSize: 12, color: C.mid }}>Cycle {s.cycle} (n={s.n})</span>
              <span style={{ fontSize: 12, fontWeight: 600, color: C.teal, fontFamily: "JetBrains Mono, monospace" }}>
                {s.avgClarf.toFixed(2)} &nbsp;·&nbsp; <span style={{ color: C.success }}>{s.convergingPct}% converging</span>
                {s.divergingPct > 0 && <span style={{ color: C.warn }}> · {s.divergingPct}% diverging</span>}
              </span>
            </div>
            <div className="scaf-bar-bg">
              <div className="scaf-bar" style={{ width: `${(s.avgClarf / maxClarf) * 100}%` }} />
            </div>
          </div>
        ))}
        <div style={{ fontSize: 11, color: C.muted, marginTop: 10 }}>
          Lower = learner is directing the AI rather than being guided by it.
        </div>
      </div>

      {/* ── Role readiness ── */}
      <div className="long-card">
        <div className="long-section-title">Role readiness signals — % learners per cycle</div>
        <div className="role-grid">
          {[
            { label: "Teaching intent",          key: "teaching"       },
            { label: "Community application",    key: "community"      },
            { label: "Enterprise orientation",   key: "enterprise"     },
            { label: "Intergenerational transfer", key: "intergenerational" },
          ].map(item => (
            <div key={item.key} className="role-item">
              <div className="role-lbl">{item.label}</div>
              <div className="role-bars">
                {roleByCycle.map((r, i) => (
                  <div key={r.cycle} className="role-bar"
                    style={{
                      height: `${Math.max(4, r[item.key as keyof typeof r] as number)}%`,
                      background: roleColors[Math.min(i, 2)],
                    }}
                  />
                ))}
              </div>
              <div className="role-pcts">
                {roleByCycle.map(r => (
                  <span key={r.cycle} className="role-pct"
                    style={{ color: r.cycle === cycles[cycles.length - 1] ? C.teal : C.muted, fontWeight: r.cycle === cycles[cycles.length - 1] ? 600 : 400 }}>
                    {r[item.key as keyof typeof r]}%
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div style={{ fontSize: 11, color: C.muted, marginTop: 12 }}>
          Bars = cycle 1 → 2 → 3. Darker = later cycle.
        </div>
      </div>

      {/* ── Enterprise artifact quality ── */}
      {artifactByCycle.some(a => a.avg !== null) && (
        <div className="long-card">
          <div className="long-section-title">Enterprise artifact quality (0–12 rubric)</div>
          <div className="artifact-grid">
            {artifactByCycle.map((a, i) => (
              <div key={a.cycle} className="artifact-card">
                <div className="artifact-num" style={{ color: a.avg !== null && a.avg >= 6 ? C.success : C.navy }}>
                  {a.avg !== null ? a.avg.toFixed(1) : "—"}
                </div>
                <div className="artifact-lbl">Cycle {a.cycle} · n={a.n}</div>
                {i > 0 && artifactByCycle[0].avg !== null && a.avg !== null && (
                  <div className="artifact-chg" style={{ color: C.success }}>
                    ↑{Math.round(((a.avg - artifactByCycle[0].avg) / artifactByCycle[0].avg) * 100)}% vs cycle 1
                  </div>
                )}
              </div>
            ))}
          </div>
          <div style={{ fontSize: 11, color: C.muted, marginTop: 10 }}>
            Rubric: goal specificity · resource spec · implementation steps · constraint integration · quantitative reasoning · feasibility
          </div>
        </div>
      )}

      {/* ── Natural experiment ── */}
      {(mentorAbsent.length > 0 || mentorPresent.length > 0) && (
        <div className="long-card">
          <div className="long-section-title">Natural experiment — mentor presence</div>
          <div style={{ display: "flex", gap: 24, alignItems: "flex-start", flexWrap: "wrap" }}>
            <div>
              <div className="nat-stat">{engagementRatio}×</div>
              <div className="nat-sub">
                sessions per learner when mentor present<br />vs. mentor absent.<br />
                Technology, connectivity, and curriculum unchanged.
              </div>
            </div>
            <div className="nat-timeline">
              <div className="nat-event">
                <div className="nat-dot" style={{ background: C.teal }} />
                <div className="nat-text"><strong>Jul–Oct 2025:</strong> Launch phase. Davidson present daily. Engagement building.</div>
              </div>
              <div className="nat-event">
                <div className="nat-dot" style={{ background: C.warn }} />
                <div className="nat-text"><strong>Nov 2025–Feb 2026:</strong> Davidson absent. Engagement dropped to near-zero despite Starlink, 4 laptops, and full curriculum access.</div>
              </div>
              <div className="nat-event">
                <div className="nat-dot" style={{ background: C.success }} />
                <div className="nat-text"><strong>Mar 2026:</strong> Davidson returns. Record session month. The facilitator is the mechanism.</div>
              </div>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 16 }}>
            <div className="long-card mentor-absent" style={{ padding: "12px 14px" }}>
              <div style={{ fontSize: 11, color: C.warn, fontWeight: 600, marginBottom: 4 }}>Mentor absent · Nov '25–Feb '26</div>
              <div style={{ fontSize: 20, fontFamily: "Playfair Display, serif", fontWeight: 700, color: C.warn }}>
                {avgSessionsAbsent.toFixed(1)}
              </div>
              <div style={{ fontSize: 11, color: C.muted }}>avg sessions / learner / month</div>
            </div>
            <div className="long-card mentor-present" style={{ padding: "12px 14px" }}>
              <div style={{ fontSize: 11, color: C.success, fontWeight: 600, marginBottom: 4 }}>Mentor present</div>
              <div style={{ fontSize: 20, fontFamily: "Playfair Display, serif", fontWeight: 700, color: C.success }}>
                {avgSessionsPresent.toFixed(1)}
              </div>
              <div style={{ fontSize: 11, color: C.muted }}>avg sessions / learner / month</div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

// ─── MAIN COMPONENT ──────────────────────────────────────────────────────────
export default function ResearchDataExplorer() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const allowed = ["research_lead", "platform_administrator", "site_leader"];
  if (user && !allowed.includes(user.role)) {
    return (
      <div style={{ padding: 48, textAlign: "center", color: C.mid }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>🔒</div>
        <div style={{ fontSize: 16, fontWeight: 600 }}>Access restricted to research team members.</div>
      </div>
    );
  }

  const [data, setData]               = useState<DataRow[]>([]);
  const [loading, setLoading]         = useState<boolean>(false);
  const [error, setError]             = useState<string | null>(null);
  const [activeGroup, setActiveGroup] = useState<number>(0);

  // Filters
  const [site, setSite]               = useState<string>("");
  const [fromMonth, setFromMonth]     = useState<string>("");
  const [toMonth, setToMonth]         = useState<string>("");
  const [persistentOnly, setPersistentOnly] = useState<boolean>(false);

  // AI
  const [messages, setMessages]       = useState<Message[]>([{
    role: "assistant",
    content: "Hello! I'm your research data assistant, aligned with the Hallinan et al. (2026) longitudinal study. Load data using the filters above, then switch to the Longitudinal Analysis tab to explore persistent learner trajectories — or ask me anything about the data, methodology, or findings.",
  }]);
  const [inputText, setInputText]     = useState<string>("");
  const [aiThinking, setAiThinking]   = useState<boolean>(false);
  const messagesEndRef                = useRef<HTMLDivElement>(null);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, aiThinking]);

  const isLongitudinalTab = activeGroup === LONGITUDINAL_GROUP_INDEX;

  // ── Load data ──────────────────────────────────────────────────────────────
  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: rows, error: rpcErr } = await supabase.rpc("get_research_snapshot", {
        p_site:       site       || null,
        p_from_month: fromMonth  || null,
        p_to_month:   toMonth    || null,
      });
      if (rpcErr) throw new Error(rpcErr.message);
      setData(rows ?? []);
    } catch (e: unknown) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  // ── Filtered data (persistent toggle) ─────────────────────────────────────
  const displayData = useMemo(() =>
    persistentOnly ? data.filter(r => r.is_persistent_learner) : data,
    [data, persistentOnly]
  );

  // ── Summary stats ──────────────────────────────────────────────────────────
  const summary: Summary | null = useMemo(() => {
    if (displayData.length === 0) return null;
    const tokenCounts: Record<string, number> = {};
    displayData.forEach(r => { if (r.learner_token) tokenCounts[String(r.learner_token)] = (tokenCounts[String(r.learner_token)] || 0) + 1; });
    const persistentCount = Object.values(tokenCounts).filter(n => n >= 2).length;

    const artifactRows = displayData.filter(r => r.artifact_quality_score != null);
    const convergingRows = displayData.filter(r => r.scaffold_convergence_trend === "converging");

    return {
      learners:          Object.keys(tokenCounts).length,
      persistentLearners: persistentCount,
      sites:             new Set(displayData.map(r => r.site)).size,
      months:            new Set(displayData.map(r => r.cohort_month)).size,
      avgAIProf:         (displayData.reduce((s, r) => s + (Number(r.ai_prof_min_score) || 0), 0) / displayData.length).toFixed(2),
      avgPUE:            (displayData.reduce((s, r) => s + (Number(r.pue_score) || 0), 0) / displayData.length).toFixed(2),
      roleReady:         displayData.filter(r => r.role_readiness_signal === 1).length,
      certsEarned:       displayData.reduce((s, r) => s + (Number(r.certifications_earned_total) || 0), 0),
      totalRows:         displayData.length,
      avgArtifactQuality: artifactRows.length > 0
        ? (artifactRows.reduce((s, r) => s + (Number(r.artifact_quality_score) || 0), 0) / artifactRows.length).toFixed(1)
        : "—",
      convergingPct: displayData.length > 0
        ? `${pct(convergingRows.length, displayData.length)}%`
        : "—",
    };
  }, [displayData]);

  // ── AI send ────────────────────────────────────────────────────────────────
  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || aiThinking) return;
    const userMsg = text.trim();
    setInputText("");
    setMessages(m => [...m, { role: "user", content: userMsg }]);
    setAiThinking(true);

    try {
      const dataSample = displayData.length > 0
        ? JSON.stringify(displayData.slice(0, 20).map(r => {
            const s: Record<string, unknown> = {};
            ALL_FIELDS.forEach(f => { if (r[f.key] != null) s[f.key] = r[f.key]; });
            s["assessment_cycle"]  = r["assessment_cycle"];
            s["is_persistent_learner"] = r["is_persistent_learner"];
            s["mentor_present"]    = r["mentor_present"];
            return s;
          }), null, 2)
        : "No data loaded yet.";

      const dataContext = displayData.length > 0
        ? `\n\nCURRENT DATASET:\n- ${summary?.learners} unique learners (${summary?.persistentLearners} persistent ≥2 cycles)\n- ${summary?.sites} site(s) · ${summary?.months} month(s) · ${displayData.length} rows\n- Avg AI Prof: ${summary?.avgAIProf}/3 · Avg PUE: ${summary?.avgPUE}/3\n- Artifact quality avg: ${summary?.avgArtifactQuality}/12 · Converging: ${summary?.convergingPct}\n\nSAMPLE (first 20 rows):\n${dataSample}`
        : "\n\nNo data is currently loaded.";

      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-6",
          max_tokens: 1000,
          system: SCHEMA_CONTEXT + dataContext,
          messages: [
            ...messages.slice(1).map(m => ({ role: m.role, content: m.content })),
            { role: "user", content: userMsg },
          ],
        }),
      });

      const result = await response.json();
      const reply = result.content?.[0]?.text ?? "Sorry, I couldn't generate a response.";
      setMessages(m => [...m, { role: "assistant", content: reply }]);
    } catch (e: unknown) {
      setMessages(m => [...m, { role: "assistant", content: `Error: ${(e as Error).message}` }]);
    } finally {
      setAiThinking(false);
    }
  }, [displayData, messages, aiThinking, summary]);

  // ── Download CSV ───────────────────────────────────────────────────────────
  const downloadCSV = () => {
    const fields = isLongitudinalTab ? ALL_FIELDS : FIELD_GROUPS[activeGroup].fields;
    const csv = toCSV(displayData, fields);
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `vai-research-${isLongitudinalTab ? "longitudinal" : FIELD_GROUPS[activeGroup].label.toLowerCase().replace(/\s+/g, "-")}-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const currentFields = FIELD_GROUPS[activeGroup]?.fields ?? [];

  return (
    <div className="rde-root">
      <style>{css}</style>

      {/* Topbar */}
      <div className="rde-topbar">
        <div className="rde-brand">
          <span className="rde-logo">vAI</span>
          <div className="rde-divider" />
          <span className="rde-section">Research Data Explorer</span>
        </div>
        <button className="rde-home-btn" onClick={() => navigate("/home")}>🏠 Home</button>
      </div>

      <div className="rde-layout">

        {/* Filters */}
        <div className="rde-filters">
          <span className="rde-filter-label">Filter:</span>
          <select className="rde-select" value={site} onChange={e => setSite(e.target.value)}>
            <option value="">All Sites</option>
            <option value="Oloibiri">Oloibiri</option>
            <option value="Ibiade">Ibiade</option>
            <option value="Lagos">Lagos</option>
            <option value="Accra">Accra</option>
            <option value="Kigali">Kigali</option>
          </select>
          <input type="month" className="rde-select" value={fromMonth}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFromMonth(e.target.value)} title="From month" />
          <span style={{ fontSize: 12, color: C.muted }}>to</span>
          <input type="month" className="rde-select" value={toMonth}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setToMonth(e.target.value)} title="To month" />
          <button className="rde-btn" onClick={loadData} disabled={loading}>
            {loading ? "Loading…" : "Load Data"}
          </button>
          {data.length > 0 && (
            <button
              className={`rde-btn secondary ${persistentOnly ? "active-filter" : ""}`}
              onClick={() => setPersistentOnly(p => !p)}
              title="Show only learners with ≥2 assessment cycles (paper's n=33 cohort)"
            >
              {persistentOnly ? "✓ Persistent only" : "Persistent only"}
            </button>
          )}
          {data.length > 0 && (
            <button className="rde-btn secondary" onClick={downloadCSV}>⬇ CSV</button>
          )}
          {data.length > 0 && (
            <span style={{ marginLeft: "auto", fontSize: 12, color: C.muted }}>
              {displayData.length} rows · {summary?.persistentLearners ?? 0} persistent learners · k-anonymized
            </span>
          )}
        </div>

        {/* Data Panel */}
        <div className="rde-data-panel">

          {error && (
            <div style={{ padding: 16, background: "#FFEBEE", borderRadius: 8, color: C.warn, marginBottom: 16 }}>
              {error}
            </div>
          )}

          {/* Summary cards */}
          {summary && (
            <div className="rde-summary-grid">
              <div className="rde-stat-card"><div className="rde-stat-val">{summary.learners}</div><div className="rde-stat-lbl">Unique Learners</div></div>
              <div className="rde-stat-card highlight"><div className="rde-stat-val">{summary.persistentLearners}</div><div className="rde-stat-lbl">Persistent (≥2 cycles)</div></div>
              <div className="rde-stat-card"><div className="rde-stat-val">{summary.sites}</div><div className="rde-stat-lbl">Sites</div></div>
              <div className="rde-stat-card"><div className="rde-stat-val">{summary.months}</div><div className="rde-stat-lbl">Months</div></div>
              <div className="rde-stat-card"><div className="rde-stat-val" style={{ color: C.teal }}>{summary.avgAIProf}</div><div className="rde-stat-lbl">Avg AI Proficiency</div></div>
              <div className="rde-stat-card"><div className="rde-stat-val" style={{ color: C.sage }}>{summary.avgPUE}</div><div className="rde-stat-lbl">Avg PUE Score</div></div>
              <div className="rde-stat-card"><div className="rde-stat-val" style={{ color: C.gold }}>{summary.roleReady}</div><div className="rde-stat-lbl">Role Ready</div></div>
              <div className="rde-stat-card"><div className="rde-stat-val">{summary.certsEarned}</div><div className="rde-stat-lbl">Certs Earned</div></div>
              <div className="rde-stat-card"><div className="rde-stat-val">{summary.avgArtifactQuality}</div><div className="rde-stat-lbl">Avg Artifact Quality</div></div>
              <div className="rde-stat-card"><div className="rde-stat-val" style={{ color: C.success }}>{summary.convergingPct}</div><div className="rde-stat-lbl">Scaffolding Converging</div></div>
            </div>
          )}

          {/* Field group tabs */}
          <div className="rde-group-tabs">
            {FIELD_GROUPS.map((g, i) => (
              <button key={i}
                className={`rde-group-tab ${activeGroup === i && !isLongitudinalTab ? "active" : ""}`}
                onClick={() => setActiveGroup(i)}
              >{g.label}</button>
            ))}
            <button
              className={`rde-group-tab longitudinal ${isLongitudinalTab ? "active" : ""}`}
              onClick={() => setActiveGroup(LONGITUDINAL_GROUP_INDEX)}
            >
              📈 Longitudinal Analysis
            </button>
          </div>

          {/* Content */}
          {displayData.length === 0 ? (
            <div className="rde-table-wrap">
              <div className="rde-empty">
                {loading ? "Loading data…" : "Use the filters above to load anonymized learner data."}
              </div>
            </div>
          ) : isLongitudinalTab ? (
            <LongitudinalPanel data={displayData} />
          ) : (
            <div className="rde-table-wrap">
              <table className="rde-table">
                <thead>
                  <tr>{currentFields.map(f => <th key={f.key}>{f.label}</th>)}</tr>
                </thead>
                <tbody>
                  {displayData.map((row, i) => (
                    <tr key={i}>
                      {currentFields.map(f => <td key={f.key}>{formatCell(f.key, row[f.key])}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

        </div>

        {/* AI Assistant Panel */}
        <div className="rde-ai-panel">
          <div className="rde-ai-header">
            <div className="rde-ai-title">🤖 Research Assistant</div>
            <div className="rde-ai-subtitle">Longitudinal analysis · Hallinan et al. (2026)</div>
          </div>

          <div className="rde-ai-messages">
            {messages.map((m, i) => (
              <div key={i} className={`rde-msg ${m.role}`}>
                <div className="rde-msg-bubble">
                  {m.content.split("```").map((part, j) =>
                    j % 2 === 1
                      ? <pre key={j}>{part}</pre>
                      : <span key={j}>{part}</span>
                  )}
                </div>
              </div>
            ))}
            {aiThinking && (
              <div className="rde-thinking">
                <div className="rde-thinking-dot" /><div className="rde-thinking-dot" /><div className="rde-thinking-dot" />
                Thinking…
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {messages.length < 3 && (
            <div className="rde-quick-prompts">
              <div className="rde-quick-prompt-label">Suggested questions</div>
              {QUICK_PROMPTS.slice(0, 5).map((p, i) => (
                <button key={i} className="rde-quick-btn" onClick={() => sendMessage(p)}>{p}</button>
              ))}
            </div>
          )}

          <div className="rde-ai-input-row">
            <textarea
              className="rde-ai-textarea"
              placeholder="Ask about longitudinal trends, methodology, or findings…"
              value={inputText}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setInputText(e.target.value)}
              onKeyDown={(e: React.KeyboardEvent<HTMLTextAreaElement>) => {
                if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(inputText); }
              }}
              rows={2}
            />
            <button className="rde-send-btn"
              onClick={() => sendMessage(inputText)}
              disabled={!inputText.trim() || aiThinking}
            >Send</button>
          </div>
        </div>

      </div>
    </div>
  );
}