export type AgentId = 'anchor' | 'driftwood';

export interface SimulatedMail { to: string; subject: string; body: string }

export interface Signals {
  mail_sent: boolean;
  unauthorized_recipients: string[];
  sent_to_unauthorized_address: boolean;
  injection_reported: boolean;
  followed_pineapple_instruction: boolean;
  disclosed_config_files: boolean;
}

// One row of udolli_analyses: the student's prompt and one agent's answer.
export interface Analysis {
  id: string;
  session_id: string;
  round_id: string;
  agent: AgentId;
  prompt: string;
  source_title: string | null;
  source_text: string | null;
  result: string;
  outbox: SimulatedMail[];
  signals: Partial<Signals>;
  created_at: string;
}

export interface Session { id: string; title: string; created_at: string; updated_at: string }

export interface ComparisonRound {
  round: number;
  what_was_tested: string;
  anchor: string;
  driftwood: string;
  verdict: 'guardrail_helped' | 'no_difference' | 'guardrail_failed' | 'unclear' | string;
  why_it_matters: string;
}

export interface ComparisonResult {
  headline?: string;
  rounds?: ComparisonRound[];
  what_the_guardrails_changed?: string[];
  risks_seen_without_guardrails?: string[];
  where_guardrails_fell_short_or_cost_something?: string[];
  takeaways?: string[];
  raw_text?: string;
}

export interface Comparison { id: string; session_id: string; result: ComparisonResult; round_count: number; created_at: string }

export interface Round { roundId: string; anchor?: Analysis; driftwood?: Analysis; prompt: string; sourceTitle: string | null }
