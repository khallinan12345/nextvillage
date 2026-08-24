// src/pages/PublicLandingPage.tsx
//
// Public-facing landing page — no auth required.
// Pulls live cohort data from assessments_monthly_global.
//
// Add to App.tsx:
//   import PublicLandingPage from './pages/PublicLandingPage';
//   <Route path="/" element={<PublicLandingPage />} />
//   (remove or keep the existing Navigate to="/home" fallback as preferred)

import React, { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import {
  ArrowRight, Mail, Linkedin, MessageCircle, Sparkles,
  Globe, ChevronDown, Brain, Code, ImagePlus, Briefcase, Heart,
  BookOpen, ExternalLink,
} from "lucide-react";
import { BookCard, BookModal } from "../components/BookModal";

// ─── Types ────────────────────────────────────────────────────────────────────

interface GlobalRow {
  period_label:              string;
  organization_name:         string | null;
  learner_count:             number;
  assessed_count:            number;
  sessions_count:            number;
  avg_mean:                  number | null;
  avg_delta:                 number | null;
  role_ready_count:          number | null;
  converging_count:          number | null;
  structured_l3_pct:         number | null;
  pue_learner_pct:           number | null;
  certs_total:               number | null;
  cognitive_mean:            number | null;
  critical_thinking_mean:    number | null;
  problem_solving_mean:      number | null;
  creativity_mean:           number | null;
  pue_mean:                  number | null;
}

// ─── Research types ──────────────────────────────────────────────────────────

interface ResearchProgram {
  id: string;
  slug: string;
  title: string;
  description: string;
  sites: string[];
  is_active: boolean;
}

interface GuidingQuestion {
  id: string;
  program_id: string;
  slug: string;
  title: string;
  short_title: string;
  domain: string;
  research_question: string;
  icon: string;
  color_hex: string;
  sites: string[];
}

// ─── Animated counter hook ────────────────────────────────────────────────────

function useCountUp(target: number, duration = 1600) {
  const [count, setCount] = useState(0);
  const started = useRef(false);
  const isVisible = useRef(false);
  const ref = useRef<HTMLDivElement>(null);

  // When target arrives (data loads), re-trigger if already visible
  useEffect(() => {
    if (!target) return;
    started.current = false; // reset so animation can fire with real value
    if (isVisible.current) {
      started.current = true;
      const t0 = performance.now();
      const tick = (now: number) => {
        const p = Math.min((now - t0) / duration, 1);
        const e = 1 - Math.pow(1 - p, 3);
        setCount(Math.floor(e * target));
        if (p < 1) requestAnimationFrame(tick);
        else setCount(target);
      };
      requestAnimationFrame(tick);
    }
  }, [target, duration]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        isVisible.current = entry.isIntersecting;
        if (entry.isIntersecting && !started.current && target > 0) {
          started.current = true;
          const t0 = performance.now();
          const tick = (now: number) => {
            const p = Math.min((now - t0) / duration, 1);
            const e = 1 - Math.pow(1 - p, 3);
            setCount(Math.floor(e * target));
            if (p < 1) requestAnimationFrame(tick);
            else setCount(target);
          };
          requestAnimationFrame(tick);
        }
      },
      { threshold: 0.3 }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []); // mount/unmount only — target changes handled above

  return { count, ref };
}

// ─── Stat card ────────────────────────────────────────────────────────────────

const StatCard: React.FC<{
  value: number; suffix?: string; label: string; sub?: string; accent: string;
}> = ({ value, suffix = "", label, sub, accent }) => {
  const { count, ref } = useCountUp(value);
  return (
    <div ref={ref} style={{
      background: "rgba(255,255,255,0.06)",
      border: "1px solid rgba(255,255,255,0.11)",
      borderRadius: 14, padding: "1.75rem 1.25rem",
      textAlign: "center", backdropFilter: "blur(8px)",
      position: "relative", overflow: "hidden",
    }}>
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: accent }} />
      <div style={{
        fontFamily: "'Playfair Display', serif",
        fontSize: "clamp(2.2rem,5vw,3.2rem)",
        fontWeight: 900, color: "#fff", lineHeight: 1, marginBottom: "0.4rem",
      }}>
        {count.toLocaleString()}{suffix}
      </div>
      <div style={{ fontSize: "0.75rem", fontWeight: 700, color: accent, textTransform: "uppercase", letterSpacing: "0.1em" }}>
        {label}
      </div>
      {sub && <div style={{ fontSize: "0.7rem", color: "rgba(255,255,255,0.38)", marginTop: "0.2rem" }}>{sub}</div>}
    </div>
  );
};

// ─── Score bar ────────────────────────────────────────────────────────────────

const ScoreBar: React.FC<{ label: string; value: number | null; color: string }> = ({ label, value, color }) => {
  const [width, setWidth] = useState(0);
  useEffect(() => {
    if (!value) return;
    // Small delay ensures the browser paints width:0 first, then transitions to target
    const t = setTimeout(() => setWidth(value), 120);
    return () => clearTimeout(t);
  }, [value]);
  return (
    <div style={{ marginBottom: "0.8rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.28rem" }}>
        <span style={{ fontSize: "0.78rem", fontWeight: 600, color: "rgba(255,255,255,0.65)" }}>{label}</span>
        <span style={{ fontSize: "0.78rem", fontWeight: 700, color: "#fff" }}>{value?.toFixed(0) ?? "—"}</span>
      </div>
      <div style={{ height: 5, background: "rgba(255,255,255,0.09)", borderRadius: 99, overflow: "hidden" }}>
        <div style={{
          height: "100%", width: `${width}%`,
          background: color, borderRadius: 99,
          transition: "width 1.4s cubic-bezier(0.16,1,0.3,1)",
        }} />
      </div>
    </div>
  );
};

// ─── Programme card ───────────────────────────────────────────────────────────

const ProgramCard: React.FC<{
  icon: React.ReactNode; title: string; desc: string;
  items: string[]; accent: string; bg: string;
}> = ({ icon, title, desc, items, accent, bg }) => (
  <div style={{
    background: bg, borderRadius: 16,
    border: `1px solid ${accent}28`,
    padding: "1.75rem", position: "relative", overflow: "hidden",
    transition: "transform 0.2s, box-shadow 0.2s",
  }}
    onMouseEnter={e => {
      (e.currentTarget as HTMLDivElement).style.transform = "translateY(-4px)";
      (e.currentTarget as HTMLDivElement).style.boxShadow = `0 16px 40px ${accent}22`;
    }}
    onMouseLeave={e => {
      (e.currentTarget as HTMLDivElement).style.transform = "translateY(0)";
      (e.currentTarget as HTMLDivElement).style.boxShadow = "none";
    }}
  >
    <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: accent }} />
    <div style={{
      width: 44, height: 44, borderRadius: 12, background: `${accent}18`,
      display: "flex", alignItems: "center", justifyContent: "center",
      color: accent, marginBottom: "1rem",
    }}>{icon}</div>
    <h3 style={{
      fontFamily: "'Playfair Display', serif", fontSize: "1.1rem",
      fontWeight: 700, color: "#1a1208", margin: "0 0 0.5rem",
    }}>{title}</h3>
    <p style={{ fontSize: "0.87rem", color: "rgba(26,18,8,0.63)", lineHeight: 1.65, margin: "0 0 1rem" }}>{desc}</p>
    <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
      {items.map(item => (
        <li key={item} style={{
          fontSize: "0.79rem", color: "rgba(26,18,8,0.68)",
          display: "flex", alignItems: "flex-start", gap: "0.4rem", marginBottom: "0.32rem",
        }}>
          <span style={{ color: accent, fontWeight: 700, flexShrink: 0 }}>→</span> {item}
        </li>
      ))}
    </ul>
  </div>
);

// ─── Main component ───────────────────────────────────────────────────────────

const PublicLandingPage: React.FC = () => {
  const [latestRow, setLatestRow] = useState<GlobalRow | null>(null);
  const [allRows, setAllRows]     = useState<GlobalRow[]>([]);
  const [loading, setLoading]     = useState(true);
  const [programs, setPrograms]   = useState<ResearchProgram[]>([]);
  const [questions, setQuestions] = useState<GuidingQuestion[]>([]);
  const [menuOpen, setMenuOpen]   = useState(false);
  const [bookOpen, setBookOpen]   = useState(false);

  // ── Public aggregate view: one row per cohort_month ─────────────────────
  // One row per "visit rank" = nth month of use across all learners
  interface PubVisitRow {
    visit_rank: number;          // 1 = learner's 1st month, 2 = 2nd, etc.
    learner_count: number;       // how many learners have this many months of use
    total_sessions: number;
    avg_cognitive: number | null;
    avg_critical_thinking: number | null;
    avg_problem_solving: number | null;
    avg_creativity: number | null;
    avg_clarification: number | null;
    converging_count: number;
    insufficient_data_count: number;
    teaching_intent_count: number;
    community_application_count: number;
    enterprise_orientation_count: number;
    intergenerational_count: number;
  }
  interface AllTimeRow {
    total_learners: number;
    total_sessions: number;
    total_certs: number;
    months_of_data: number;
    first_month: string;
    latest_month: string;
  }
  const [longRows, setLongRows]     = useState<PubVisitRow[]>([]);
  const [allTime,  setAllTime]      = useState<AllTimeRow | null>(null);
  const [longLoading, setLongLoading] = useState(true);

  interface StreamRow { activity_month: string; stream: string; activity_count: number; }
  const [streamRows, setStreamRows] = useState<StreamRow[]>([]);

  interface BandRow {
    session_band: string; band_midpoint: number; n_learners: number;
    cognitive: number | null; critical_thinking: number | null;
    problem_solving: number | null; creativity: number | null;
    avg_clarification: number | null;
    teaching_intent_pct: number | null; community_application_pct: number | null;
    enterprise_orientation_pct: number | null; intergenerational_pct: number | null;
  }
  const [bandRows, setBandRows] = useState<BandRow[]>([]);

  // ── Community Challenge Impact ───────────────────────────────────────────
  interface ChallengeImpactStory {
    slug: string;
    action_taken: string | null;
    impact_observed: string | null;
    community_member_role: string | null;
    tier_awarded: string | null;
  }
  interface ChallengeSlugStats {
    slug: string;
    total: number;
    awarded: number;
  }
  interface ImpactTier {
    tier: string;
    tier_label: string;
    evidence_summary: string | null;
    awarded_at: string;
    slug: string | null;          // from joined community_challenges
  }
  interface WeeklyWinner {
    winner_name: string;
    winner_reason: string | null;
    winner_tier: string | null;
    week_start: string;
    week_end: string;
    title: string;
    community_impact_slug: string;
  }
  const [impactStories, setImpactStories]       = useState<ChallengeImpactStory[]>([]);
  const [slugStats, setSlugStats]               = useState<ChallengeSlugStats[]>([]);
  const [totalEnrollments, setTotalEnrollments] = useState(0);
  const [impactTiers, setImpactTiers]           = useState<ImpactTier[]>([]);
  const [weeklyWinners, setWeeklyWinners]       = useState<WeeklyWinner[]>([]);
  const [selectedWinner, setSelectedWinner]     = useState<WeeklyWinner | null>(null);

  useEffect(() => {
    (async () => {
      const COLS = [
        "period_label", "organization_name", "learner_count", "assessed_count",
        "sessions_count", "avg_mean", "avg_delta", "role_ready_count",
        "converging_count", "structured_l3_pct", "pue_learner_pct", "certs_total",
        "cognitive_mean", "critical_thinking_mean", "problem_solving_mean",
        "creativity_mean", "pue_mean"
      ].join(", ");

      // Fetch Davidson AI Innovation Center rows by name.
      // When additional orgs join, this becomes a dropdown — one query per selected org.
      const { data, error } = await supabase
        .from("assessments_monthly_global")
        .select(COLS)
        .ilike("organization_name", "%Davidson%")
        .order("period_start", { ascending: false });

      if (error) {
        console.error("[PublicLandingPage] Supabase error:", error.message, error.code);
      }
      console.log("[PublicLandingPage] rows returned:", data?.length ?? 0, data?.[0]);

      if (data?.length) {
        setLatestRow(data[0] as GlobalRow);
        setAllRows(data as GlobalRow[]);
      }
      setLoading(false);

      // Fetch research programs and guiding questions (public, no auth)
      const [{ data: progData }, { data: qData }] = await Promise.all([
        supabase.from('research_programs').select('id,slug,title,description,sites,is_active').eq('is_active', true).order('created_at'),
        supabase.from('research_guiding_questions').select('id,program_id,slug,title,short_title,domain,research_question,icon,color_hex,sites').eq('is_active', true).order('domain'),
      ]);
      if (progData) setPrograms(progData as ResearchProgram[]);
      if (qData)    setQuestions(qData as GuidingQuestion[]);

      // ── Paginated fetch of dashboard_stats for longitudinal panel ────────
      // Fetch by-visit-rank data and all-time summary (both public/anon)
      const [{ data: visitData, error: visitErr }, { data: atData, error: atErr }, { data: streamData }, { data: bandData }] = await Promise.all([
        supabase.from('dashboard_stats_public').select('*').order('visit_rank', { ascending: true }),
        supabase.from('dashboard_stats_alltime').select('*').single(),
        supabase.from('dashboard_activity_streams').select('*').order('activity_month', { ascending: true }),
        supabase.rpc('get_session_band_stats'),
      ]);
      if (visitErr) console.error('[PublicLandingPage] visit rows error:', visitErr.message);
      if (atErr)    console.error('[PublicLandingPage] alltime error:',    atErr.message);
      console.log('[PublicLandingPage] visit rows:', visitData?.length ?? 0, 'alltime:', atData);
      setLongRows((visitData as PubVisitRow[]) || []);
      setAllTime(atData as AllTimeRow ?? null);
      setStreamRows((streamData as StreamRow[]) || []);
      setBandRows((bandData as BandRow[]) || []);
      setLongLoading(false);

      // ── Community challenge impact stories, tiers, and weekly winners ──────
      const [{ data: enrollData }, { data: tiersData }, { data: winnersData }] = await Promise.all([
        // Enrollment stories (submitted or awarded, with impact text)
        supabase
          .from("challenge_enrollments")
          .select(`
            action_taken,
            impact_observed,
            community_member_role,
            tier_awarded,
            status,
            community_challenges!inner(community_impact_slug)
          `)
          .in("status", ["awarded", "submitted"])
          .not("impact_observed", "is", null)
          .order("awarded_at", { ascending: false })
          .limit(80),

        // community_impact_tiers — richer, evaluated evidence summaries
        supabase
          .from("community_impact_tiers")
          .select(`
            tier,
            tier_label,
            evidence_summary,
            awarded_at,
            community_challenges(community_impact_slug)
          `)
          .not("evidence_summary", "is", null)
          .order("awarded_at", { ascending: false })
          .limit(40),

        // Weekly winners from community_challenges
        supabase
          .from("community_challenges")
          .select("winner_name, winner_reason, winner_tier, week_start, week_end, title, community_impact_slug")
          .not("winner_name", "is", null)
          .order("week_start", { ascending: false })
          .limit(10),
      ]);

      if (enrollData) {
        const stories: ChallengeImpactStory[] = (enrollData as any[]).map(r => ({
          slug: r.community_challenges?.community_impact_slug ?? "unknown",
          action_taken: r.action_taken,
          impact_observed: r.impact_observed,
          community_member_role: r.community_member_role,
          tier_awarded: r.tier_awarded,
        }));
        setImpactStories(stories);

        const counts: Record<string, { total: number; awarded: number }> = {};
        stories.forEach(s => {
          if (!counts[s.slug]) counts[s.slug] = { total: 0, awarded: 0 };
          counts[s.slug].total++;
          if (s.tier_awarded) counts[s.slug].awarded++;
        });
        setSlugStats(Object.entries(counts).map(([slug, v]) => ({ slug, ...v })));
        setTotalEnrollments(stories.length);
      }

      if (tiersData) {
        setImpactTiers((tiersData as any[]).map(r => ({
          tier: r.tier,
          tier_label: r.tier_label,
          evidence_summary: r.evidence_summary,
          awarded_at: r.awarded_at,
          slug: r.community_challenges?.community_impact_slug ?? null,
        })));
      }

      if (winnersData) {
        setWeeklyWinners(winnersData as WeeklyWinner[]);
      }
    })();
  }, []);

  const latest = latestRow;

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700;900&family=DM+Sans:wght@400;500;600;700&display=swap');
        .lp *, .lp *::before, .lp *::after { box-sizing: border-box; }
        .lp { font-family: 'DM Sans', sans-serif; color: #1a1208; overflow-x: hidden; }
        .lp a { text-decoration: none; }

        .pub-btn {
          display: inline-flex; align-items: center; gap: 0.4rem;
          padding: 0.7rem 1.5rem; border-radius: 8px;
          font-size: 0.9rem; font-weight: 700; cursor: pointer;
          border: none; transition: transform 0.15s, opacity 0.15s;
          text-decoration: none;
        }
        .pub-btn:hover { transform: translateY(-2px); opacity: 0.9; }
        .btn-amber { background: #d97706; color: #fff; }
        .btn-outline { background: transparent; color: #fff; border: 2px solid rgba(255,255,255,0.38); }
        .btn-outline:hover { border-color: #fff; }

        .nav-lnk {
          font-size: 0.85rem; font-weight: 600;
          color: rgba(255,255,255,0.8); text-decoration: none;
          border-bottom: 2px solid transparent;
          padding-bottom: 2px;
          transition: color 0.15s, border-color 0.15s;
        }
        .nav-lnk:hover { color: #fff; border-color: #d97706; }

        .prog-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
          gap: 1.25rem;
        }

        .contact-card {
          background: #fff; border-radius: 14px;
          border: 1px solid rgba(26,18,8,0.08);
          padding: 1.75rem;
          box-shadow: 0 2px 14px rgba(26,18,8,0.05);
          display: flex; flex-direction: column; gap: 0.6rem;
        }

        .long-table { width: 100%; border-collapse: collapse; font-size: 0.81rem; }
        .long-table th {
          padding: 0.55rem 1rem; text-align: left;
          font-size: 0.69rem; font-weight: 700; text-transform: uppercase;
          letter-spacing: 0.08em; color: rgba(255,255,255,0.38);
          border-bottom: 1px solid rgba(255,255,255,0.07);
        }
        .long-table td {
          padding: 0.65rem 1rem;
          color: rgba(255,255,255,0.72);
          border-bottom: 1px solid rgba(255,255,255,0.04);
        }
        .long-table tbody tr:first-child td { color: #fff; font-weight: 600; }
        .long-table tbody tr:hover td { background: rgba(255,255,255,0.03); }

        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(22px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .fu  { animation: fadeUp 0.7s ease both; }
        .fu1 { animation-delay: 0.08s; }
        .fu2 { animation-delay: 0.2s; }
        .fu3 { animation-delay: 0.32s; }

        @keyframes bob {
          0%,100% { transform: translateX(-50%) translateY(0); }
          50%      { transform: translateX(-50%) translateY(8px); }
        }

        .vision-g {
          display: grid;
          grid-template-columns: 1.05fr 0.95fr;
          gap: 3rem;
          align-items: center;
        }
        .vision-video {
          width: 100%; max-width: 480px; margin: 0 auto;
          aspect-ratio: 16 / 9;
          border-radius: 20px; overflow: hidden;
          border: 1px solid rgba(255,255,255,0.14);
          box-shadow: 0 24px 60px rgba(0,0,0,0.45);
          background: #000;
        }
        .vision-video iframe { width: 100%; height: 100%; border: none; display: block; }

        @media (max-width: 640px) {
          .hide-sm { display: none !important; }
          .show-sm { display: flex !important; }
          .stat-g  { grid-template-columns: 1fr 1fr !important; }
          .score-g { grid-template-columns: 1fr !important; }
          .vision-g { grid-template-columns: 1fr !important; gap: 2.25rem !important; }
        }
      `}</style>

      <div className="lp" style={{ paddingTop: 60 }}>

        {/* ── Navbar ──────────────────────────────────────────────────────── */}
        <nav style={{
          position: "fixed", top: 0, left: 0, right: 0, zIndex: 50,
          background: "rgba(12,18,10,0.9)", backdropFilter: "blur(14px)",
          borderBottom: "1px solid rgba(255,255,255,0.07)",
        }}>
          {/* Main bar */}
          <div style={{
            padding: "0 2rem", height: 60,
            display: "flex", alignItems: "center", justifyContent: "space-between",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.55rem" }}>
              <Sparkles size={17} color="#d97706" />
              <span style={{
                fontFamily: "'Playfair Display', serif",
                fontWeight: 700, fontSize: "0.98rem", color: "#fff",
              }}>
                vAI · Davidson AI Innovation Center
              </span>
            </div>

            {/* Desktop links */}
            <div className="hide-sm" style={{ display: "flex", alignItems: "center", gap: "1.1rem" }}>
              <a href="#impact"      className="nav-lnk">Impact</a>
              <a href="#programmes"  className="nav-lnk">Programmes</a>
              <a href="#challenges"  className="nav-lnk">Challenges</a>
              <a href="#story"       className="nav-lnk">Our Story</a>
              <a href="#vision"      className="nav-lnk">Their Vision</a>
              <a href="#voices"      className="nav-lnk">Voices</a>
              <a href="#research"    className="nav-lnk">Research</a>
              <a href="#community"   className="nav-lnk">Join Us</a>
              <a href="#support"     className="nav-lnk">Support</a>
              <Link to="/login" className="pub-btn btn-amber" style={{ padding: "0.42rem 1.1rem", fontSize: "0.82rem" }}>
                Log In / Sign Up
              </Link>
            </div>

            {/* Hamburger — mobile only */}
            <button
              className="show-sm"
              onClick={() => setMenuOpen(o => !o)}
              style={{
                background: "none", border: "none", cursor: "pointer",
                color: "#fff", padding: "0.4rem", display: "none",
                flexDirection: "column", gap: "5px", alignItems: "center", justifyContent: "center",
              }}
              aria-label="Toggle menu"
            >
              {menuOpen ? (
                <span style={{ fontSize: "1.4rem", lineHeight: 1 }}>✕</span>
              ) : (
                <>
                  <span style={{ display: "block", width: 22, height: 2, background: "#fff", borderRadius: 2 }} />
                  <span style={{ display: "block", width: 22, height: 2, background: "#fff", borderRadius: 2 }} />
                  <span style={{ display: "block", width: 22, height: 2, background: "#fff", borderRadius: 2 }} />
                </>
              )}
            </button>
          </div>

          {/* Mobile accordion menu */}
          {menuOpen && (
            <div className="show-sm" style={{
              display: "none",
              flexDirection: "column",
              borderTop: "1px solid rgba(255,255,255,0.07)",
              background: "rgba(12,18,10,0.97)",
              padding: "0.5rem 0 1rem",
            }}>
              {[
                { href: "#impact",     label: "Impact" },
                { href: "#programmes", label: "Programmes" },
                { href: "#challenges", label: "Challenges" },
                { href: "#story",      label: "Our Story" },
                { href: "#vision",     label: "Their Vision" },
                { href: "#voices",     label: "Voices" },
                { href: "#research",   label: "Research" },
                { href: "#community",  label: "Join Us" },
                { href: "#support",    label: "Support" },
              ].map(item => (
                <a
                  key={item.href}
                  href={item.href}
                  onClick={() => setMenuOpen(false)}
                  style={{
                    display: "block", padding: "0.85rem 2rem",
                    color: "rgba(255,255,255,0.82)", fontWeight: 600,
                    fontSize: "0.95rem", textDecoration: "none",
                    borderBottom: "1px solid rgba(255,255,255,0.05)",
                    transition: "color 0.15s",
                  }}
                >
                  {item.label}
                </a>
              ))}
              <div style={{ padding: "1rem 2rem 0" }}>
                <Link
                  to="/login"
                  onClick={() => setMenuOpen(false)}
                  className="pub-btn btn-amber"
                  style={{ width: "100%", justifyContent: "center", fontSize: "0.95rem" }}
                >
                  Log In / Sign Up
                </Link>
              </div>
            </div>
          )}
        </nav>

        {/* ── Hero ────────────────────────────────────────────────────────── */}
        <div style={{
          position: "relative", minHeight: "100vh",
          display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center",
          textAlign: "center", padding: "6rem 2rem 4rem",
          overflow: "hidden",
        }}>
          <div style={{
            position: "absolute", inset: 0, zIndex: 0,
            backgroundImage: "url('/home_page_africa.png')",
            backgroundSize: "cover", backgroundPosition: "center 30%",
            filter: "brightness(0.35)",
          }} />
          <div style={{
            position: "absolute", inset: 0, zIndex: 1,
            background: "linear-gradient(180deg,rgba(8,14,6,0.25) 0%,rgba(8,14,6,0.1) 45%,rgba(8,14,6,0.72) 100%)",
          }} />

          <div style={{ position: "relative", zIndex: 2, maxWidth: 840 }}>
            <div className="fu" style={{
              display: "inline-flex", alignItems: "center", gap: "0.45rem",
              background: "rgba(217,119,6,0.16)", border: "1px solid rgba(217,119,6,0.38)",
              borderRadius: 999, padding: "0.32rem 0.9rem",
              fontSize: "0.7rem", fontWeight: 700, letterSpacing: "0.1em",
              color: "#fbbf24", textTransform: "uppercase", marginBottom: "1.5rem",
            }}>
              <Globe size={11} /> Nigeria · Ohio · Sub-Saharan Africa &amp; Beyond
            </div>

            <h1 className="fu fu1" style={{
              fontFamily: "'Playfair Display', serif",
              fontSize: "clamp(2.4rem,6.5vw,4.8rem)",
              fontWeight: 900, lineHeight: 1.07, color: "#fff",
              marginBottom: "1.2rem", marginTop: 0,
            }}>
              vAI · Davidson AI Innovation Center<br />
              <span style={{
                background: "linear-gradient(135deg,#d97706,#fbbf24)",
                WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text",
              }}>
                Learning &amp; Certification
              </span>
            </h1>

            <p className="fu fu2" style={{
              fontSize: "clamp(0.95rem,2vw,1.15rem)",
              color: "rgba(255,255,255,0.7)", lineHeight: 1.78,
              maxWidth: 660, margin: "0 auto 2.5rem",
            }}>
              AI-scaffolded learning in English skills, artificial intelligence, and tech skills —
              coding, web development, AI agents, image, voice &amp; video creation — plus
              community-impact AI support for farming, fishing, healthcare, animal husbandry,
              and entrepreneurship, along with open-source, community impactful, youth-led distributed 
              research across Sub-Saharan Africa and beyond.
            </p>

            <div className="fu fu3" style={{ display: "flex", gap: "0.9rem", justifyContent: "center", flexWrap: "wrap" }}>
              <a href="#impact" className="pub-btn btn-amber" style={{ fontSize: "1rem", padding: "0.8rem 1.9rem" }}>
                See Our Impact <ArrowRight size={15} />
              </a>
              <a href="#support" className="pub-btn btn-outline" style={{ fontSize: "1rem", padding: "0.8rem 1.9rem" }}>
                Support the Mission
              </a>
            </div>
          </div>

          <div style={{
            position: "absolute", bottom: "2rem", left: "50%",
            zIndex: 2, color: "rgba(255,255,255,0.28)",
            animation: "bob 2s infinite",
          }}>
            <ChevronDown size={22} />
          </div>
        </div>

        {/* ── Programmes ──────────────────────────────────────────────────── */}
        <section id="programmes" style={{ background: "#fff", padding: "5rem 2rem" }}>
          <div style={{ maxWidth: 1100, margin: "0 auto" }}>
            <div style={{ marginBottom: "2.5rem" }}>
              <div style={{ fontSize: "0.7rem", fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "#d97706", marginBottom: "0.6rem" }}>
                What We Teach
              </div>
              <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: "clamp(1.7rem,4vw,2.6rem)", fontWeight: 700, color: "#1a1208", margin: "0 0 0.75rem" }}>
                Four pathways to capability
              </h2>
              <p style={{ color: "rgba(26,18,8,0.58)", maxWidth: 580, lineHeight: 1.72, margin: 0 }}>
                Every pathway is AI-scaffolded, locally grounded, and designed to meet learners
                exactly where they are — from zero digital experience to job-ready skills.
              </p>
            </div>
            <div className="prog-grid">
              <ProgramCard
                icon={<Brain size={22} />}
                title="English Skills & AI Learning"
                accent="#0d9488" bg="#f0fdfa"
                desc="Foundation-first learning that builds English fluency alongside AI literacy — starting from zero, adapted to each learner's communication level."
                items={[
                  "Adaptive English reading and writing",
                  "AI concepts, ethics, and responsible use",
                  "AI-900 and AI Ready Skills certification prep",
                  "Socratic tutoring that meets you at your level",
                ]}
              />
              <ProgramCard
                icon={<Code size={22} />}
                title="Tech Skills Workshop"
                accent="#7c3aed" bg="#faf5ff"
                desc="Hands-on technical training in the tools that open doors to remote work, freelancing, and entrepreneurship."
                items={[
                  "Vibe coding and web development",
                  "Full-stack app development",
                  "AI workflow and agent development",
                  "AI for business — strategy and operations",
                  "Microsoft AI-900, AB-730, GitHub GH-300",
                ]}
              />
              <ProgramCard
                icon={<ImagePlus size={22} />}
                title="AI Creative Studio"
                accent="#d97706" bg="#fffbeb"
                desc="Creative AI tools that unlock new income streams and community storytelling capabilities."
                items={[
                  "AI image generation and editing",
                  "AI voice creation and narration",
                  "AI video production and studio",
                  "AI content creation for business",
                ]}
              />
              <ProgramCard
                icon={<Globe size={22} />}
                title="Community Impact AI"
                accent="#16a34a" bg="#f0fdf4"
                desc="AI-assisted consulting grounded in the real economic and ecological contexts of Oloibiri, Ibiade, and similar communities."
                items={[
                  "Agriculture and cassava farming consultant",
                  "Fishing and creek ecology advisor",
                  "Healthcare navigator",
                  "Entrepreneurship and enterprise planning",
                  "Animal husbandry advisor",
                ]}
              />
            </div>
          </div>
        </section>

                {/* ── Impact Stats ─────────────────────────────────────────────────── */}
        <div id="impact" style={{
          background: "linear-gradient(135deg,#0c160a 0%,#162612 50%,#0c160a 100%)",
          padding: "5rem 2rem", position: "relative", overflow: "hidden",
        }}>
          <div style={{
            position: "absolute", top: -80, right: -80,
            width: 340, height: 340, borderRadius: "50%",
            border: "1px solid rgba(217,119,6,0.08)", pointerEvents: "none",
          }} />

          <div style={{ maxWidth: 1100, margin: "0 auto" }}>
            <div style={{ textAlign: "center", marginBottom: "2.75rem" }}>
              <div style={{ fontSize: "0.7rem", fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "#fbbf24", marginBottom: "0.6rem" }}>
                {latest?.organization_name ?? "Davidson AI Innovation Center"} · {latest?.period_label ?? "Live Data"}
              </div>
              <h2 style={{
                fontFamily: "'Playfair Display', serif",
                fontSize: "clamp(1.7rem,4vw,2.7rem)",
                fontWeight: 700, color: "#fff",
                marginBottom: "0.6rem", marginTop: 0,
              }}>
                Real learners. Real communities. Real change.
              </h2>
              {latest?.avg_delta != null && (
                <p style={{ color: "rgba(255,255,255,0.45)", fontSize: "0.88rem", margin: 0 }}>
                  Cohort average{" "}
                  <span style={{ color: latest.avg_delta >= 0 ? "#4ade80" : "#f87171", fontWeight: 700 }}>
                    {latest.avg_delta >= 0 ? "▲" : "▼"}{Math.abs(latest.avg_delta).toFixed(1)} pts
                  </span>{" "}
                  vs prior month
                </p>
              )}
            </div>

            {loading ? (
              <p style={{ color: "rgba(255,255,255,0.35)", textAlign: "center" }}>Loading data…</p>
            ) : (
              <>
                {/* ── All-time impact stats (from dashboard_stats_alltime) ── */}
                {(() => {
                  const learners  = allTime?.total_learners  ?? latest?.learner_count  ?? 0;
                  const sessions  = allTime?.total_sessions  ?? latest?.sessions_count ?? 0;
                  const certs     = allTime?.total_certs     ?? latest?.certs_total    ?? 0;
                  const maxVisits = longRows.length > 0 ? Math.max(...longRows.map(r => r.visit_rank)) : 0;
                  return (
                    <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))", gap:"1rem", marginBottom:"2.5rem" }}>
                      {([
                        { val: learners,                               label:"Learners",        sub:"enrolled to date",  color:"#d97706" },
                        { val: sessions > 0 ? sessions.toLocaleString() : "—", label:"AI Sessions", sub:"all time",    color:"#7c3aed" },
                        { val: certs > 0    ? certs                    : "—",  label:"Certifications", sub:"earned",   color:"#fbbf24" },
                        { val: maxVisits > 0 ? `${maxVisits}+ months`  : "—",  label:"Learner retention", sub:"most persistent learners", color:"#4ade80" },
                      ] as {val:string|number, label:string, sub:string, color:string}[]).map(s => (
                        <div key={s.label} style={{ background:"rgba(255,255,255,0.05)", border:`1px solid ${s.color}22`, borderRadius:14, padding:"1.25rem 1rem", textAlign:"center" }}>
                          <div style={{ fontFamily:"'Playfair Display',serif", fontSize:"clamp(1.8rem,4vw,2.6rem)", fontWeight:900, color:s.color, lineHeight:1 }}>{s.val}</div>
                          <div style={{ fontSize:"0.78rem", fontWeight:600, color:"#fff", marginTop:"0.4rem" }}>{s.label}</div>
                          <div style={{ fontSize:"0.68rem", color:"rgba(255,255,255,0.38)", marginTop:"0.15rem" }}>{s.sub}</div>
                        </div>
                      ))}
                    </div>
                  );
                })()}

                {/* ── Longitudinal: Persistent Learner Trajectories ─────── */}
                {(() => {
                  if (longLoading) return (
                    <div style={{ padding:"2rem", textAlign:"center", color:"rgba(255,255,255,0.3)", fontSize:"0.83rem" }}>
                      Loading longitudinal data…
                    </div>
                  );
                  if (longRows.length === 0) return null;

                  // longRows: one row per visit_rank (months of use)
                  // visit_rank 1 = every learner's 1st month, 2 = 2nd, etc.
                  const visits = [...longRows].sort((a,b) => a.visit_rank - b.visit_rank).filter(v => v.learner_count >= 5);
                  const maxVisits = visits[visits.length - 1]?.visit_rank ?? 0;

                  // Low-engagement flag: fewer than 2 sessions per learner
                  const isLow = (v: typeof visits[0]) =>
                    v.learner_count > 0 && (v.total_sessions / v.learner_count) < 2;

                  // Scaffolding helpers
                  const validClarf = visits.filter(v => !isLow(v) && (v.avg_clarification ?? 0) > 0);
                  const c1Clarf    = validClarf[0]?.avg_clarification ?? 0;
                  const clarfDecline = validClarf.length > 1
                    ? Math.round((1 - validClarf[validClarf.length-1].avg_clarification! / c1Clarf) * 100)
                    : null;
                  const maxClarf = Math.max(...visits.map(v => v.avg_clarification ?? 0), 1);

                  const convPct = (v: typeof visits[0]) => {
                    const denom = v.learner_count - v.insufficient_data_count;
                    return denom > 0 ? Math.round((v.converging_count / denom) * 100) : null;
                  };

                  const rolePct = (v: typeof visits[0], key: keyof typeof visits[0]) =>
                    v.learner_count > 0 ? Math.round((Number(v[key]) / v.learner_count) * 100) : 0;

                  // Skill chart data — skip low-engagement visits for trendline
                  const skillVisits = visits.filter(v => !isLow(v) && v.visit_rank !== 4 && v.avg_critical_thinking != null);

                  const A = { green:"#4ade80", amber:"#fbbf24", purple:"#a78bfa", teal:"#2dd4bf", red:"#f87171", blue:"#60a5fa" };
                  const card: React.CSSProperties = { background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.09)", borderRadius:14, padding:"1.5rem" };
                  const lbl: React.CSSProperties  = { fontSize:"0.67rem", fontWeight:700 as const, letterSpacing:"0.1em", textTransform:"uppercase" as const, marginBottom:"0.6rem" };
                  const note: React.CSSProperties = { fontSize:"0.7rem", color:"rgba(255,255,255,0.35)", lineHeight:1.6, marginTop:"0.75rem" };

                  // SVG mini line chart helper
                  const MiniLine = ({
                    data, color, label, yMax = 100,
                  }: { data: {x:number, y:number}[], color:string, label:string, yMax?:number }) => {
                    if (data.length < 2) return null;
                    const W=400, H=90, PL=28, PR=6, PT=8, PB=24;
                    const iW=W-PL-PR, iH=H-PT-PB;
                    const xs = data.map(d=>d.x);
                    const minX=Math.min(...xs), maxX=Math.max(...xs);
                    const xP=(x:number)=>PL+(maxX===minX?0.5:(x-minX)/(maxX-minX))*iW;
                    const yP=(y:number)=>PT+(1-y/yMax)*iH;
                    const path = data.map((d,i)=>`${i===0?"M":"L"}${xP(d.x).toFixed(1)},${yP(d.y).toFixed(1)}`).join(" ");
                    const ticks = [0, 25, 50, 75, 100].filter(t => t <= yMax);
                    return (
                      <svg viewBox={`0 0 ${W} ${H}`} style={{ width:"100%", display:"block" }}>
                        {ticks.map(t=>(
                          <g key={t}>
                            <line x1={PL} x2={W-PR} y1={yP(t)} y2={yP(t)} stroke="rgba(255,255,255,0.05)" strokeWidth={1}/>
                            <text x={PL-3} y={yP(t)+4} textAnchor="end" fontSize={8} fill="rgba(255,255,255,0.22)">{t}</text>
                          </g>
                        ))}
                        {data.map((d,i)=>(
                          <text key={i} x={xP(d.x)} y={H-3} textAnchor="middle" fontSize={8} fill="rgba(255,255,255,0.3)">
                            Mo.{d.x}
                          </text>
                        ))}
                        <path d={path} fill="none" stroke={color} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round"/>
                        {data.map((d,i)=>(
                          <circle key={i} cx={xP(d.x)} cy={yP(d.y)} r={3.5} fill={color}/>
                        ))}
                        {data.map((d,i)=>(
                          <text key={i} x={xP(d.x)} y={yP(d.y)-7} textAnchor="middle" fontSize={8.5} fontWeight="bold" fill={color}>{d.y}</text>
                        ))}
                      </svg>
                    );
                  };

                  return (
                    <div style={{ marginTop:"1rem" }}>

                      {/* Section header */}
                      <div style={{ marginBottom:"2rem" }}>
                        <div style={{ fontSize:"0.68rem", fontWeight:700, color:A.amber, letterSpacing:"0.12em", textTransform:"uppercase", marginBottom:"0.45rem" }}>
                          Longitudinal Evidence · {maxVisits} Months of Use Tracked · Persistent Learners
                        </div>
                      </div>

                      {/* ── Activity Stream Chart ── */}
                      {streamRows.length > 0 && (() => {
                        const STREAMS = [
                          { key:'AI Proficiency & Skills', color:'#534AB7' },
                          { key:'Tech Skills',             color:'#1D9E75' },
                          { key:'Community Impact',        color:'#D85A30' },
                          { key:'English',                 color:'#378ADD' },
                          { key:'Math',                    color:'#BA7517' },
                          { key:'Science',                 color:'#888780' },
                        ];
                        // Build sorted month list from data
                        const months = [...new Set(streamRows.map(r => r.activity_month))].sort();
                        // Pivot: month -> stream -> count
                        const pivot: Record<string, Record<string, number>> = {};
                        streamRows.forEach(r => {
                          if (!pivot[r.activity_month]) pivot[r.activity_month] = {};
                          pivot[r.activity_month][r.stream] = r.activity_count;
                        });
                        const totals = months.map(m => STREAMS.reduce((s, st) => s + (pivot[m]?.[st.key] ?? 0), 0));
                        const disruptionMonths = ['2025-09-01','2025-10-01','2025-11-01','2025-12-01','2026-01-01'];
                        const fmtMonth = (m: string) => {
                          const d = new Date(m);
                          return d.toLocaleString('default', { month:'short', year:'2-digit' });
                        };
                        const W = 900, H = 180, PT = 6, PB = 24;
                        const barW = W / months.length;
                        const iH = H - PT - PB;
                        return (
                          <div style={{ ...card, marginBottom:"2rem" }}>
                            <div style={{ fontSize:"0.68rem", fontWeight:700, color:A.amber, letterSpacing:"0.1em", textTransform:"uppercase", marginBottom:"0.4rem" }}>
                              What Activities Have Learners Focused On?
                            </div>
                            <h4 style={{ fontFamily:"'Playfair Display',serif", fontSize:"1.1rem", fontWeight:700, color:"#fff", margin:"0 0 0.4rem" }}>
                              Activity stream composition · {fmtMonth(months[0])} – {fmtMonth(months[months.length-1])}
                            </h4>
                            <p style={{ fontSize:"0.75rem", color:"rgba(255,255,255,0.45)", lineHeight:1.6, maxWidth:640, margin:"0 0 1rem" }}>
                              Each bar shows the share of activities per stream that month. Tech Skills (green) has remained
                              consistently ~30% since launch — a stable signal of self-directed creative use beneath all curriculum shifts.
                              English Foundations emerged in March 2026, driven by learners who identified peers couldn't type their own responses.
                              Math launched late April. Dimmed bars = disruption period (Sep–Jan).
                            </p>
                            <div style={{ display:"flex", flexWrap:"wrap", gap:"10px", marginBottom:"0.75rem" }}>
                              {STREAMS.map(s => (
                                <span key={s.key} style={{ display:"flex", alignItems:"center", gap:5, fontSize:"0.7rem", color:"rgba(255,255,255,0.55)" }}>
                                  <span style={{ width:9, height:9, borderRadius:2, background:s.color, flexShrink:0 }} />{s.key}
                                </span>
                              ))}
                            </div>
                            <div style={{ overflowX:"auto" }}>
                              <svg viewBox={`0 0 ${W} ${H}`} style={{ width:"100%", minWidth:400, display:"block" }}>
                                {[0,25,50,75,100].map(pct => (
                                  <line key={pct} x1={0} x2={W} y1={PT+iH*(1-pct/100)} y2={PT+iH*(1-pct/100)}
                                    stroke="rgba(255,255,255,0.05)" strokeWidth={1}/>
                                ))}
                                {months.map((month, mi) => {
                                  const total = totals[mi];
                                  const isDisruption = disruptionMonths.includes(month);
                                  let cumH = 0;
                                  const x = mi * barW + barW * 0.06;
                                  const bw = barW * 0.88;
                                  return (
                                    <g key={month}>
                                      {STREAMS.map(st => {
                                        const pct = total > 0 ? (pivot[month]?.[st.key] ?? 0) / total : 0;
                                        const bh = pct * iH;
                                        const y = PT + iH - cumH - bh;
                                        cumH += bh;
                                        if (bh < 0.5) return null;
                                        return <rect key={st.key} x={x} y={y} width={bw} height={bh}
                                          fill={st.color} opacity={isDisruption ? 0.4 : 0.88} />;
                                      })}
                                      {isDisruption && (
                                        <rect x={x} y={PT} width={bw} height={2} fill="rgba(248,113,113,0.5)" />
                                      )}
                                      <text x={x+bw/2} y={H-5} textAnchor="middle" fontSize={9}
                                        fill="rgba(255,255,255,0.35)">{fmtMonth(month)}</text>
                                    </g>
                                  );
                                })}
                              </svg>
                            </div>
                            <p style={{ fontSize:"0.68rem", color:"rgba(255,255,255,0.28)", marginTop:"0.5rem", lineHeight:1.5 }}>
                              Based on module creation dates. Dimmed bars = Sep–Jan disruption period.
                              Chart updates automatically as new activity data is recorded.
                            </p>
                          </div>
                        );
                      })()}

                      {/* Section header continued */}
                      <div style={{ marginBottom:"2rem" }}>
                        <h3 style={{ fontFamily:"'Playfair Display',serif", fontSize:"clamp(1.3rem,3vw,1.9rem)", fontWeight:700, color:"#fff", margin:"0 0 0.5rem" }}>
                          What happens when learners return
                        </h3>
                        <p style={{ fontSize:"0.85rem", color:"rgba(255,255,255,0.5)", lineHeight:1.65, maxWidth:640, margin:0 }}>
                          Each column represents learners at that stage of their journey — Mo.1 = everyone's first month,
                          Mo.2 = every learner's second month, and so on.
                          Months marked ⚠ have fewer than 2 sessions per learner on average.
                          All findings are associative; no control group.
                        </p>
                      </div>

                      {/* Row 1: Scaffolding table + decline hero */}
                      <div style={{ display:"grid", gridTemplateColumns:"1fr auto", gap:"1.25rem", marginBottom:"1.25rem", alignItems:"start" }}>

                        <div style={card}>
                          <div style={{...lbl, color:A.green}}>AI Scaffolding Demand — Clarifications per Session</div>
                          <p style={{ fontSize:"0.75rem", color:"rgba(255,255,255,0.45)", marginBottom:"1rem", lineHeight:1.55 }}>
                            How many times per session the AI needed to re-prompt or redirect the learner.
                            Falling values = learner forming their own questions and directing the conversation independently.
                          </p>
                          <div style={{ overflowX:"auto" }}>
                            <table style={{ width:"100%", borderCollapse:"collapse", fontSize:"0.78rem" }}>
                              <thead>
                                <tr style={{ borderBottom:"1px solid rgba(255,255,255,0.1)" }}>
                                  {["Month of use","n learners","Clarif/session","Change","% Converging","Sessions"].map(h => (
                                    <th key={h} style={{ padding:"0.4rem 0.6rem", textAlign:"left", fontSize:"0.65rem", fontWeight:700, color:"rgba(255,255,255,0.4)", letterSpacing:"0.07em", textTransform:"uppercase", whiteSpace:"nowrap" }}>{h}</th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {visits.map((v,i) => {
                                  const low         = isLow(v);
                                  const cv          = v.avg_clarification ?? 0;
                                  const cp          = convPct(v);
                                  const decPct      = (c1Clarf > 0 && v.visit_rank > 1 && !low)
                                    ? Math.round((1 - cv / c1Clarf) * 100) : null;
                                  const isDisrupted = v.visit_rank === 4;
                                  return (
                                    <React.Fragment key={i}>
                                      <tr style={{ borderBottom: isDisrupted ? "none" : "1px solid rgba(255,255,255,0.04)", opacity: low ? 0.45 : 1 }}>
                                        <td style={{ padding:"0.45rem 0.6rem", color: isDisrupted ? A.red : "rgba(255,255,255,0.85)", fontWeight:600, whiteSpace:"nowrap" }}>
                                          Mo.{v.visit_rank}{low ? " ⚠" : ""}{isDisrupted ? " 🔴" : ""}
                                        </td>
                                        <td style={{ padding:"0.45rem 0.6rem", color:"rgba(255,255,255,0.5)", fontFamily:"monospace" }}>
                                          {v.learner_count}
                                        </td>
                                        <td style={{ padding:"0.45rem 0.6rem", fontFamily:"monospace", fontWeight:700,
                                          color: cv===0 ? "rgba(255,255,255,0.2)" : cv<3 ? A.green : cv>8 ? A.red : A.amber }}>
                                          {cv > 0 ? cv.toFixed(2) : "—"}
                                        </td>
                                        <td style={{ padding:"0.45rem 0.6rem", fontWeight:700,
                                          color: decPct==null ? "rgba(255,255,255,0.2)" : decPct>0 ? A.green : A.red }}>
                                          {decPct==null ? "—" : decPct>0 ? `−${decPct}%` : `+${Math.abs(decPct)}%`}
                                        </td>
                                        <td style={{ padding:"0.45rem 0.6rem",
                                          color: cp==null ? "rgba(255,255,255,0.2)" : cp>=25 ? A.green : cp>0 ? A.teal : "rgba(255,255,255,0.3)",
                                          fontWeight: cp!=null && cp>0 ? 700 : 400 }}>
                                          {cp==null ? "—" : `${cp}%`}
                                        </td>
                                        <td style={{ padding:"0.45rem 0.6rem", color:"rgba(255,255,255,0.35)", fontFamily:"monospace", fontSize:"0.72rem" }}>
                                          {v.total_sessions > 0 ? v.total_sessions.toLocaleString() : "—"}
                                        </td>
                                        <td style={{ padding:"0.45rem 0.6rem", color:(v.total_certs ?? 0) > 0 ? A.amber : "rgba(255,255,255,0.2)", fontFamily:"monospace", fontWeight:700, fontSize:"0.72rem" }}>
                                          {(v.total_certs ?? 0) > 0 ? v.total_certs : "—"}
                                        </td>
                                      </tr>
                                      {isDisrupted && (
                                        <tr>
                                          <td colSpan={7} style={{ padding:"0.3rem 0.6rem 0.6rem", borderBottom:"1px solid rgba(255,255,255,0.04)" }}>
                                            <div style={{ display:"flex", alignItems:"flex-start", gap:"0.4rem", background:"rgba(248,113,113,0.08)", border:"1px solid rgba(248,113,113,0.18)", borderRadius:6, padding:"0.45rem 0.65rem" }}>
                                              <span style={{ fontSize:"0.75rem", flexShrink:0 }}>🔴</span>
                                              <span style={{ fontSize:"0.68rem", color:"rgba(255,255,255,0.5)", lineHeight:1.55 }}>
                                                <strong style={{ color:"rgba(248,113,113,0.9)" }}>Disruption — Mo.4:</strong>{" "}
                                                Rainy season solar power outages eliminated reliable electricity, and the programme's on-the-ground leader suffered a home fire requiring family relocation. Sessions dropped from 136 (Mo.3) to 15. The clarification spike reflects learners re-engaging after a gap, not regression.
                                              </span>
                                            </div>
                                          </td>
                                        </tr>
                                      )}
                                    </React.Fragment>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                          <p style={note}>
                            Mo.N = every learner's Nth month of use. ⚠ = fewer than 2 sessions per learner on average — scores unreliable.
                            All claims are associative · no control group.
                          </p>
                        </div>

                        {clarfDecline !== null && (
                          <div style={{...card, textAlign:"center", minWidth:140, borderColor:`${A.green}33`}}>
                            <div style={{...lbl, color:A.green}}>Scaffolding decline</div>
                            <div style={{ fontFamily:"'Playfair Display',serif", fontSize:"3.4rem", fontWeight:900, color:A.green, lineHeight:1 }}>
                              {clarfDecline}%
                            </div>
                            <div style={{ fontSize:"0.72rem", color:"rgba(255,255,255,0.45)", marginTop:"0.4rem", lineHeight:1.5 }}>
                              fewer AI prompts<br/>per session<br/>Mo.1 → latest
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Row 2: Session-band capability arc */}
                      {bandRows.length > 0 && (() => {
                        const bands = bandRows;
                        const W = 560, H = 220, PL = 44, PR = 16, PT = 16, PB = 40;
                        const iW = W - PL - PR, iH = H - PT - PB;
                        const barW = iW / bands.length;
                        const maxScore = 100;
                        const xMid = (i: number) => PL + i * barW + barW / 2;
                        const bw = barW * 0.75;
                        const xLeft = (i: number) => PL + i * barW + barW * 0.125;
                        const yP = (v: number) => PT + (1 - v / maxScore) * iH;
                        const bandShortNames = ['Early', 'Developing', 'Established', 'Core'];

                        const skills = [
                          { key: 'cognitive' as const,          color: '#fbbf24', label: 'Cognitive' },
                          { key: 'critical_thinking' as const,  color: '#2dd4bf', label: 'Critical Thinking' },
                          { key: 'problem_solving' as const,    color: '#4ade80', label: 'Problem Solving' },
                          { key: 'creativity' as const,         color: '#a78bfa', label: 'Creativity' },
                        ];
                        const roleSignals = [
                          { key: 'community_application_pct' as const,  color: '#f87171', label: 'Community application' },
                          { key: 'enterprise_orientation_pct' as const,  color: '#fb923c', label: 'Enterprise orientation' },
                          { key: 'teaching_intent_pct' as const,         color: '#34d399', label: 'Teaching intent' },
                          { key: 'intergenerational_pct' as const,       color: '#818cf8', label: 'Intergenerational' },
                        ];

                        return (
                          <div style={{ marginBottom:"1.25rem" }}>
                            <div style={{...lbl, color:A.purple, marginBottom:"0.5rem"}}>
                              Capability arc by cumulative sessions — skills peak, then community application rises
                            </div>
                            <p style={{ fontSize:"0.82rem", color:"rgba(255,255,255,0.5)", marginBottom:"1.25rem", lineHeight:1.6, maxWidth:700 }}>
                              Skill scores peak in the Developing band (50–99 sessions) as learners master the curriculum.
                              Beyond 100 sessions, scores plateau as learners shift to self-directed community application —
                              visible in the rising role readiness signals. This is not regression: it is graduation from the rubric into real-world use.
                            </p>

                            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"1rem", marginBottom:"1rem" }}>

                              {/* Skill score bars */}
                              <div style={card}>
                                <div style={{ fontSize:"0.75rem", fontWeight:700, color:A.purple, letterSpacing:"0.06em", textTransform:"uppercase", marginBottom:"0.6rem" }}>
                                  Skill scores by session band (0–100)
                                </div>
                                <div style={{ display:"flex", flexWrap:"wrap", gap:"10px", marginBottom:"0.85rem" }}>
                                  {skills.map(s => (
                                    <span key={s.key} style={{ display:"flex", alignItems:"center", gap:5, fontSize:"0.75rem", color:"rgba(255,255,255,0.7)" }}>
                                      <span style={{ width:10, height:10, borderRadius:2, background:s.color, flexShrink:0 }} />{s.label}
                                    </span>
                                  ))}
                                </div>
                                <svg viewBox={`0 0 ${W} ${H}`} style={{ width:"100%", display:"block" }}>
                                  {[0,25,50,75,100].map(t => (
                                    <g key={t}>
                                      <line x1={PL} x2={W-PR} y1={yP(t)} y2={yP(t)} stroke="rgba(255,255,255,0.07)" strokeWidth={1}/>
                                      <text x={PL-6} y={yP(t)+4} textAnchor="end" fontSize={12} fill="rgba(255,255,255,0.45)">{t}</text>
                                    </g>
                                  ))}
                                  {bands.map((band, bi) => {
                                    const skillBw = bw / skills.length;
                                    return (
                                      <g key={band.session_band}>
                                        {skills.map((sk, si) => {
                                          const val = band[sk.key] ?? 0;
                                          const x = xLeft(bi) + si * skillBw;
                                          const bh = (val / maxScore) * iH;
                                          return (
                                            <g key={sk.key}>
                                              <rect x={x} y={yP(val)} width={skillBw - 2} height={bh} fill={sk.color} opacity={0.85}/>
                                            </g>
                                          );
                                        })}
                                        <text x={xMid(bi)} y={H-10} textAnchor="middle" fontSize={13} fill="rgba(255,255,255,0.7)" fontWeight="600">
                                          {bandShortNames[bi]}
                                        </text>
                                        <text x={xMid(bi)} y={H-24} textAnchor="middle" fontSize={11} fill="rgba(255,255,255,0.35)">
                                          n={band.n_learners}
                                        </text>
                                        {bi === 1 && (
                                          <text x={xMid(bi)} y={yP((bands[1]?.critical_thinking ?? 0)) - 10} textAnchor="middle"
                                            fontSize={13} fill={A.teal} fontWeight="bold">▲ peak</text>
                                        )}
                                      </g>
                                    );
                                  })}
                                </svg>
                                <p style={{ fontSize:"0.75rem", color:"rgba(255,255,255,0.4)", marginTop:"0.5rem", lineHeight:1.5 }}>
                                  Peak at 50–99 sessions. Plateau beyond 100 reflects shift to self-directed use, not regression.
                                </p>
                              </div>

                              {/* Role readiness lines */}
                              <div style={card}>
                                <div style={{ fontSize:"0.75rem", fontWeight:700, color:A.amber, letterSpacing:"0.06em", textTransform:"uppercase", marginBottom:"0.6rem" }}>
                                  Community role readiness — % of learners per band
                                </div>
                                <div style={{ display:"flex", flexWrap:"wrap", gap:"10px", marginBottom:"0.85rem" }}>
                                  {roleSignals.map(s => (
                                    <span key={s.key} style={{ display:"flex", alignItems:"center", gap:5, fontSize:"0.75rem", color:"rgba(255,255,255,0.7)" }}>
                                      <span style={{ width:10, height:10, borderRadius:2, background:s.color, flexShrink:0 }} />{s.label}
                                    </span>
                                  ))}
                                </div>
                                <svg viewBox={`0 0 ${W} ${H}`} style={{ width:"100%", display:"block" }}>
                                  {[0,25,50,75,100].map(t => (
                                    <g key={t}>
                                      <line x1={PL} x2={W-PR} y1={yP(t)} y2={yP(t)} stroke="rgba(255,255,255,0.07)" strokeWidth={1}/>
                                      <text x={PL-6} y={yP(t)+4} textAnchor="end" fontSize={12} fill="rgba(255,255,255,0.45)">{t}%</text>
                                    </g>
                                  ))}
                                  {roleSignals.map(sig => {
                                    const pts = bands.map((band, bi) => ({ x: xMid(bi), y: yP(band[sig.key] ?? 0) }));
                                    const path = pts.map((p,i) => `${i===0?'M':'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
                                    return (
                                      <g key={sig.key}>
                                        <path d={path} fill="none" stroke={sig.color} strokeWidth={2.5} strokeLinejoin="round" opacity={0.85}/>
                                        {pts.map((p, i) => (
                                          <g key={i}>
                                            <circle cx={p.x} cy={p.y} r={4} fill={sig.color}/>
                                            <text x={p.x} y={p.y - 10} textAnchor="middle" fontSize={12} fill={sig.color} fontWeight="bold">
                                              {bands[i][sig.key]?.toFixed(0)}%
                                            </text>
                                          </g>
                                        ))}
                                      </g>
                                    );
                                  })}
                                  {bands.map((band, bi) => (
                                    <text key={bi} x={xMid(bi)} y={H-10} textAnchor="middle" fontSize={13} fill="rgba(255,255,255,0.7)" fontWeight="600">
                                      {bandShortNames[bi]}
                                    </text>
                                  ))}
                                </svg>
                                <p style={{ fontSize:"0.75rem", color:"rgba(255,255,255,0.4)", marginTop:"0.5rem", lineHeight:1.5 }}>
                                  Community application and enterprise orientation reach 75% in the Core band.
                                </p>
                              </div>
                            </div>

                            {/* Band summary cards */}
                            <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:"0.6rem" }}>
                              {bands.map((band, bi) => {
                                const colors = [A.teal, A.green, A.amber, A.purple];
                                const c = colors[bi];
                                const isCore = bi === 3;
                                return (
                                  <div key={band.session_band} style={{ background:"rgba(255,255,255,0.04)", border:`1px solid ${c}33`, borderRadius:10, padding:"0.85rem" }}>
                                    <div style={{ fontSize:"0.72rem", fontWeight:700, color:c, letterSpacing:"0.08em", textTransform:"uppercase", marginBottom:"0.3rem" }}>
                                      {bandShortNames[bi]}
                                    </div>
                                    <div style={{ fontSize:"0.72rem", color:"rgba(255,255,255,0.4)", marginBottom:"0.5rem" }}>n={band.n_learners} learners</div>
                                    <div style={{ fontSize:"0.78rem", color:"rgba(255,255,255,0.7)", lineHeight:1.55 }}>
                                      {isCore
                                        ? `75% community application · 75% enterprise — graduated from curriculum into real use`
                                        : `CT: ${band.critical_thinking ?? '—'} · PS: ${band.problem_solving ?? '—'} · Clarif: ${band.avg_clarification ?? '—'}/session`
                                      }
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })()}

                      {/* Composition note */}
                      <div style={{ background:"rgba(167,139,250,0.06)", border:"1px solid rgba(167,139,250,0.15)", borderRadius:12, padding:"1rem 1.25rem", display:"flex", gap:"0.75rem", alignItems:"flex-start" }}>
                        <span style={{ fontSize:"1.1rem", flexShrink:0 }}>📈</span>
                        <p style={{ margin:0, fontSize:"0.8rem", color:"rgba(255,255,255,0.55)", lineHeight:1.7 }}>
                          <strong style={{ color:"#c4b5fd", fontWeight:700 }}>Understanding these charts.</strong>{" "}
                          The scaffolding table tracks monthly progression — how AI dependence falls as learners return month after month.
                          The capability arc tracks cumulative experience — skill scores peak around 50–99 total sessions, then learners shift
                          from curriculum to self-directed community use. These are two complementary lenses on the same journey:
                          one shows <em>when</em> learners become independent, the other shows <em>what they do</em> with that independence.
                          The Core band (130+ sessions) shows 75% community application and 75% enterprise orientation — learners who have
                          graduated from the rubric into real-world impact. The assessment instrument can no longer fully see what they are doing,
                          because they have outgrown it.
                        </p>
                      </div>

                    </div>
                  );
                })()}

                {/* What does this data mean? */}
                {/* What does this data mean? */}
                {/* What does this data mean? */}
                <div style={{
                  marginTop: "2.5rem",
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  borderRadius: 14, padding: "1.75rem 2rem",
                }}>
                  <div style={{ fontSize: "0.7rem", fontWeight: 700, color: "#d97706", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "1rem" }}>
                    Understanding the Data
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "1.25rem" }}>
                    {[
                      {
                        icon: "🧠",
                        term: "Skill Scores (0–100)",
                        def: "Five dimensions assessed monthly by AI from learner conversations: Cognitive (comprehension & recall), Critical Thinking (analysis & reasoning), Problem Solving, Creativity, and Productive Use of Energy (PUE — applying learning to real energy and enterprise challenges in their community)."
                      },
                      {
                        icon: "🌍",
                        term: "Community Role-Ready",
                        def: "Learners showing evidence they are taking AI into their community — measured by the activities they engage in and the AI's evaluation of their ability to teach others, advise on community problems, plan micro-enterprises, and share knowledge across generations. This is the platform's core mission outcome. A vivid example: Solomon Matthias Solomon, who has established himself as a Healthcare Triage Worker using AI as a daily partner — navigating patients, triaging needs, and advising families in Oloibiri where formal health infrastructure barely reaches."
                      },
                      {
                        icon: "🔧",
                        term: "Reducing AI Reliance",
                        def: "Learners whose conversations show decreasing dependence on AI scaffolding — they ask more independent questions, self-correct, and explore topics the AI didn't introduce. A sign of genuine capability formation."
                      },
                      {
                        icon: "🎯",
                        term: "Proficiency Sessions",
                        def: "Learning sessions where a learner demonstrated mastery of a module's objectives — assessed by rubric, not just completion. Distinct from AI-tutored sessions, these require the learner to demonstrate knowledge independently."
                      },
                    ].map(item => (
                      <div key={item.term} style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                          <span style={{ fontSize: "1.1rem" }}>{item.icon}</span>
                          <span style={{ fontSize: "0.8rem", fontWeight: 700, color: "#fff" }}>{item.term}</span>
                        </div>
                        <p style={{ fontSize: "0.76rem", color: "rgba(255,255,255,0.5)", lineHeight: 1.68, margin: 0 }}>{item.def}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>


        {/* ── Activity Stream Chart ────────────────────────────────────────── */}
        <section style={{ background: "linear-gradient(135deg,#0c160a 0%,#162612 50%,#0c160a 100%)", padding: "3rem 2rem 4rem" }}>
          <div style={{ maxWidth: 1100, margin: "0 auto" }}>
            <div style={{ textAlign:"center", marginBottom:"2rem" }}>
              <div style={{ fontSize:"0.7rem", fontWeight:700, letterSpacing:"0.12em", textTransform:"uppercase", color:"#fbbf24", marginBottom:"0.6rem" }}>
                How learners spend their time
              </div>
              <h3 style={{ fontFamily:"'Playfair Display',serif", fontSize:"clamp(1.3rem,3vw,1.9rem)", fontWeight:700, color:"#fff", margin:"0 0 0.5rem" }}>
                Activity stream composition — Jul 2025 to May 2026
              </h3>
              <p style={{ color:"rgba(255,255,255,0.45)", fontSize:"0.85rem", maxWidth:620, margin:"0 auto", lineHeight:1.7 }}>
                From AI Proficiency and Tech Skills in the early months, through community-led English Foundations in March,
                to Math and Science launching in late April. Sep–Jan reflects the disruption and cohort consolidation period.
                May dip = rainy season solar outage + community leader home fire.
              </p>
            </div>

            <div style={{ display:"flex", flexWrap:"wrap", gap:"12px", marginBottom:"1.25rem", justifyContent:"center" }}>
              {[
                { color:"#534AB7", label:"AI proficiency & skills" },
                { color:"#1D9E75", label:"Tech skills" },
                { color:"#D85A30", label:"Community impact" },
                { color:"#378ADD", label:"English" },
                { color:"#BA7517", label:"Math" },
                { color:"#888780", label:"Science" },
              ].map(s => (
                <span key={s.label} style={{ display:"flex", alignItems:"center", gap:6, fontSize:"0.75rem", color:"rgba(255,255,255,0.6)" }}>
                  <span style={{ width:10, height:10, borderRadius:2, background:s.color, flexShrink:0 }} />
                  {s.label}
                </span>
              ))}
            </div>

            {(() => {
              const months = ['Jul','Aug','Sep','Oct','Nov','Dec','Jan','Feb','Mar','Apr','May'];
              const streams = [
                { label:'AI Proficiency & Skills', color:'#534AB7', data:[1246,1268,154,218,406,113,82,353,2074,4838,1714] },
                { label:'Tech Skills',             color:'#1D9E75', data:[ 595, 465, 59, 82, 223, 86,62,  89, 282, 742, 217] },
                { label:'Community Impact',        color:'#D85A30', data:[   0,   0,  0,  0,   0,  0, 0,   0,  32, 108, 101] },
                { label:'English',                 color:'#378ADD', data:[   0,   0,  0,  0,   0,  0, 0,   0, 120, 140,  22] },
                { label:'Math',                    color:'#BA7517', data:[   0,   0,  0,  0,   0,  0, 0,   0,   0,   0,  51] },
                { label:'Science',                 color:'#888780', data:[   0,   0,  0,  0,   0,  0, 0,   0,   0,   0,   4] },
              ];
              const totals = months.map((_,i) => streams.reduce((s,st) => s + st.data[i], 0));
              const W = 1100, H = 200, PT = 8, PB = 28;
              const barW = W / months.length;
              const iH = H - PT - PB;
              return (
                <div style={{ overflowX:"auto" }}>
                  <svg viewBox={`0 0 ${W} ${H}`} style={{ width:"100%", minWidth:480, display:"block" }}>
                    {[0,25,50,75,100].map(pct => (
                      <line key={pct} x1={0} x2={W} y1={PT + iH*(1-pct/100)} y2={PT + iH*(1-pct/100)}
                        stroke="rgba(255,255,255,0.06)" strokeWidth={1}/>
                    ))}
                    {months.map((month, mi) => {
                      const total = totals[mi];
                      let cumH = 0;
                      const x = mi * barW + barW * 0.05;
                      const bw = barW * 0.9;
                      const isDisruption = mi >= 2 && mi <= 6;
                      return (
                        <g key={month}>
                          {streams.map(st => {
                            const pct = total > 0 ? st.data[mi] / total : 0;
                            const bh = pct * iH;
                            const y = PT + iH - cumH - bh;
                            cumH += bh;
                            if (bh < 0.5) return null;
                            return <rect key={st.label} x={x} y={y} width={bw} height={bh} fill={st.color} opacity={isDisruption ? 0.5 : 0.88} />;
                          })}
                          {isDisruption && (
                            <rect x={x} y={PT} width={bw} height={3} fill="rgba(248,113,113,0.6)" />
                          )}
                          <text x={x + bw/2} y={H-6} textAnchor="middle" fontSize={10} fill="rgba(255,255,255,0.4)">{month}</text>
                        </g>
                      );
                    })}
                  </svg>
                  <div style={{ display:"flex", justifyContent:"space-between", marginTop:"0.4rem" }}>
                    <span style={{ fontSize:"0.68rem", color:"rgba(255,255,255,0.3)" }}>Jul 2025</span>
                    <span style={{ fontSize:"0.68rem", color:"rgba(248,113,113,0.55)" }}>← disruption period dimmed →</span>
                    <span style={{ fontSize:"0.68rem", color:"rgba(255,255,255,0.3)" }}>May 2026</span>
                  </div>
                </div>
              );
            })()}

            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(200px,1fr))", gap:"0.75rem", marginTop:"1.5rem" }}>
              {[
                { color:"#378ADD", month:"Mar 2026", label:"English Foundations", note:"Driven by learners who flagged peers couldn't type — community-identified gap" },
                { color:"#BA7517", month:"Late Apr 2026", label:"Math & Science launch", note:"Math adopted 10× faster than science — revealed community preference for economic literacy" },
                { color:"#f87171", month:"May 2026", label:"Disruption month", note:"Rainy season solar outage + community leader home fire — not a learning regression" },
              ].map(a => (
                <div key={a.label} style={{ background:"rgba(255,255,255,0.04)", border:`1px solid ${a.color}33`, borderRadius:10, padding:"0.85rem 1rem" }}>
                  <div style={{ fontSize:"0.62rem", fontWeight:700, color:a.color, letterSpacing:"0.08em", textTransform:"uppercase", marginBottom:"0.25rem" }}>{a.month}</div>
                  <div style={{ fontSize:"0.78rem", fontWeight:600, color:"#fff", marginBottom:"0.25rem" }}>{a.label}</div>
                  <div style={{ fontSize:"0.7rem", color:"rgba(255,255,255,0.4)", lineHeight:1.55 }}>{a.note}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Community Impact Challenges ──────────────────────────────── */}
        {(() => {
          const DOMAINS: {
            slug: string; label: string; emoji: string;
            accent: string; accentDim: string; who: string; tagline: string;
          }[] = [
            { slug: "agriculture",      label: "Agriculture",     emoji: "🌾", accent: "#4ade80", accentDim: "rgba(74,222,128,0.12)",  who: "Help a Farmer",        tagline: "Young people use AI to solve real crop, pest, and yield problems for farmers in their community." },
            { slug: "fishing",          label: "Fishing",         emoji: "🐟", accent: "#38bdf8", accentDim: "rgba(56,189,248,0.12)",  who: "Help a Fisher",        tagline: "AI-powered advice on fish seasons, weather, storage, and market prices — brought to the waterside." },
            { slug: "animal-husbandry", label: "Animal Husbandry",emoji: "🐐", accent: "#fb923c", accentDim: "rgba(251,146,60,0.12)",  who: "Help an Animal Keeper",tagline: "Livestock health, feeding, and breeding guidance delivered in local language to animal raisers." },
            { slug: "healthcare",       label: "Healthcare",      emoji: "🏥", accent: "#f472b6", accentDim: "rgba(244,114,182,0.12)", who: "AI-Assisted Triage",   tagline: "Community health navigators use AI to support first-level triage for families who can't reach a clinic." },
            { slug: "entrepreneurship", label: "Entrepreneurship", emoji: "💡", accent: "#fbbf24", accentDim: "rgba(251,191,36,0.12)",  who: "Help an Entrepreneur", tagline: "Business plans, pricing, marketing, and grant proposals — built alongside micro-entrepreneurs." },
            { slug: "ai-ambassadors",   label: "AI Ambassadors",  emoji: "📱", accent: "#a78bfa", accentDim: "rgba(167,139,250,0.12)", who: "Teach AI on Phones",   tagline: "Trained youth teach community members to use AI on their own phones — multiplying access person by person." },
          ];

          const tierColors: Record<string, string> = {
            seed: "#4ade80", scout: "#38bdf8", bridge: "#fbbf24",
            builder: "#fb923c", multiplier: "#a78bfa",
          };

          // Per-domain: prefer evidence_summary from community_impact_tiers (richer),
          // fall back to impact_observed from challenge_enrollments
          const bestStoryBySlug = new Map<string, { text: string; role?: string | null; tier?: string | null; tierLabel?: string | null; source: "tier" | "enrollment" }>();
          DOMAINS.forEach(d => {
            // Try tier evidence first
            const tierMatch = impactTiers
              .filter(t => t.slug === d.slug && t.evidence_summary)
              .sort((a, b) => (b.evidence_summary?.length ?? 0) - (a.evidence_summary?.length ?? 0))[0];
            if (tierMatch) {
              bestStoryBySlug.set(d.slug, { text: tierMatch.evidence_summary!, tier: tierMatch.tier, tierLabel: tierMatch.tier_label, source: "tier" });
              return;
            }
            // Fall back to enrollment impact_observed
            const enrolMatch = impactStories
              .filter(s => s.slug === d.slug && s.impact_observed)
              .sort((a, b) => (b.impact_observed?.length ?? 0) - (a.impact_observed?.length ?? 0))[0];
            if (enrolMatch) {
              bestStoryBySlug.set(d.slug, {
                text: enrolMatch.impact_observed!, role: enrolMatch.community_member_role,
                tier: enrolMatch.tier_awarded, tierLabel: null, source: "enrollment",
              });
            }
          });

          const getCount = (slug: string) => slugStats.find(s => s.slug === slug)?.total ?? 0;

          // Tier counts from community_impact_tiers
          const tierTotals = impactTiers.reduce<Record<string, number>>((acc, t) => {
            acc[t.tier] = (acc[t.tier] ?? 0) + 1; return acc;
          }, {});

          // Format week range for display
          const fmtWeek = (ws: string, we: string) => {
            const s = new Date(ws), e = new Date(we);
            return `${s.toLocaleDateString("en-GB",{day:"numeric",month:"short"})} – ${e.toLocaleDateString("en-GB",{day:"numeric",month:"short",year:"numeric"})}`;
          };

          const domainMeta: Record<string, { emoji: string; accent: string }> = Object.fromEntries(
            DOMAINS.map(d => [d.slug, { emoji: d.emoji, accent: d.accent }])
          );

          return (
            <section id="challenges" style={{ background: "linear-gradient(180deg,#080e06 0%,#0c160a 100%)", padding: "5rem 2rem" }}>
              <div style={{ maxWidth: 1200, margin: "0 auto" }}>

                {/* ── Header ──────────────────────────────────────────────── */}
                <div style={{ textAlign: "center", marginBottom: "3.5rem" }}>
                  <div style={{ fontSize: "0.7rem", fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "#4ade80", marginBottom: "0.6rem" }}>
                    AI in Action · Community Impact Challenges
                  </div>
                  <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: "clamp(1.7rem,4vw,2.7rem)", fontWeight: 700, color: "#fff", margin: "0 0 1rem", lineHeight: 1.25 }}>
                    Young people bringing AI<br />into their community — every week
                  </h2>
                  <p style={{ color: "rgba(255,255,255,0.52)", maxWidth: 660, margin: "0 auto", lineHeight: 1.8, fontSize: "0.97rem" }}>
                    vAI learners don't just study AI — they take it to their community to help farmers, fisher
                    people, animal raisers, entrepreneurs, and more. Each week, youth accept a Community Impact
                    Challenge: find a real person or people in their community with a real problem, use AI to
                    help them, then return and report what happened. Every week the 'leader' receives a prize
                    that will help them improve their outreach to the community.
                  </p>
                </div>

                {/* ── Weekly Champions spotlight ──────────────────────────── */}
                {weeklyWinners.length > 0 && (
                  <div style={{ marginBottom: "3rem" }}>
                    <div style={{ fontSize: "0.88rem", fontWeight: 600, color: "rgba(255,255,255,0.55)", marginBottom: "1.1rem", textAlign: "center" }}>
                      Here are some of the weekly winners
                    </div>
                    <div style={{ display: "flex", gap: "1rem", overflowX: "auto", paddingBottom: "0.5rem", scrollbarWidth: "none" }}>
                      {weeklyWinners.map((w, i) => {
                        const meta = domainMeta[w.community_impact_slug] ?? { emoji: "⭐", accent: "#fbbf24" };
                        const isLatest = i === 0;
                        const tc = tierColors[w.winner_tier ?? ""] ?? "#fff";
                        return (
                          <div key={`${w.week_start}-${w.winner_name}`} style={{
                            flexShrink: 0, width: 260,
                            background: isLatest ? "rgba(251,191,36,0.08)" : "rgba(255,255,255,0.04)",
                            border: `1px solid ${isLatest ? "#fbbf2440" : "rgba(255,255,255,0.08)"}`,
                            borderRadius: 14, padding: "1.1rem 1.2rem",
                            position: "relative", overflow: "hidden",
                            display: "flex", flexDirection: "column", gap: "0.55rem",
                          }}>
                            {isLatest && (
                              <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: "linear-gradient(90deg,#fbbf24,#f59e0b)" }} />
                            )}

                            {/* Name / week / tier row */}
                            <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                              <span style={{ fontSize: "1.2rem" }}>{meta.emoji}</span>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontWeight: 700, color: isLatest ? "#fef3c7" : "#fff", fontSize: "0.88rem", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                  {w.winner_name}
                                </div>
                                <div style={{ fontSize: "0.65rem", color: isLatest ? "#fbbf24" : "rgba(255,255,255,0.35)", fontWeight: 600, marginTop: 1 }}>
                                  {fmtWeek(w.week_start, w.week_end)}
                                </div>
                              </div>
                              {w.winner_tier && (
                                <span style={{
                                  fontSize: "0.6rem", fontWeight: 700, textTransform: "capitalize",
                                  color: tc, background: `${tc}18`, border: `1px solid ${tc}30`,
                                  borderRadius: 6, padding: "0.12rem 0.4rem", flexShrink: 0,
                                }}>
                                  {w.winner_tier}
                                </span>
                              )}
                            </div>

                            {/* Truncated reason */}
                            {w.winner_reason && (
                              <p style={{ fontSize: "0.77rem", color: isLatest ? "rgba(254,243,199,0.75)" : "rgba(255,255,255,0.45)", lineHeight: 1.6, margin: 0, fontStyle: "italic" }}>
                                "{w.winner_reason.length > 100 ? w.winner_reason.slice(0, 100).trimEnd() + "…" : w.winner_reason}"
                              </p>
                            )}

                            {/* Footer row: Details button */}
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", marginTop: "auto", paddingTop: "0.25rem" }}>
                              {w.winner_reason && (
                                <button
                                  onClick={() => setSelectedWinner(w)}
                                  style={{
                                    background: "rgba(255,255,255,0.08)",
                                    border: "1px solid rgba(255,255,255,0.16)",
                                    borderRadius: 7, padding: "0.28rem 0.7rem",
                                    fontSize: "0.72rem", fontWeight: 700,
                                    color: isLatest ? "#fef3c7" : "rgba(255,255,255,0.7)",
                                    cursor: "pointer",
                                    transition: "background 0.15s, border-color 0.15s",
                                  }}
                                  onMouseEnter={e => {
                                    (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.14)";
                                    (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(255,255,255,0.3)";
                                  }}
                                  onMouseLeave={e => {
                                    (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.08)";
                                    (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(255,255,255,0.16)";
                                  }}
                                >
                                  Details →
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* ── Winner detail modal ──────────────────────────────────── */}
                {selectedWinner && (() => {
                  const w = selectedWinner;
                  const meta = domainMeta[w.community_impact_slug] ?? { emoji: "⭐", accent: "#fbbf24" };
                  const tc = tierColors[w.winner_tier ?? ""] ?? "#fff";
                  return (
                    <div
                      onClick={() => setSelectedWinner(null)}
                      style={{
                        position: "fixed", inset: 0, zIndex: 200,
                        background: "rgba(0,0,0,0.72)", backdropFilter: "blur(6px)",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        padding: "1.5rem",
                      }}
                    >
                      <div
                        onClick={e => e.stopPropagation()}
                        style={{
                          background: "#111a0f",
                          border: "1px solid rgba(255,255,255,0.12)",
                          borderRadius: 18, padding: "2rem 2.25rem",
                          maxWidth: 520, width: "100%",
                          position: "relative",
                          boxShadow: "0 32px 80px rgba(0,0,0,0.6)",
                        }}
                      >
                        {/* Gold top bar */}
                        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, borderRadius: "18px 18px 0 0", background: "linear-gradient(90deg,#fbbf24,#f59e0b)" }} />

                        {/* Close */}
                        <button
                          onClick={() => setSelectedWinner(null)}
                          style={{
                            position: "absolute", top: "1rem", right: "1rem",
                            background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.12)",
                            borderRadius: 8, width: 30, height: 30,
                            display: "flex", alignItems: "center", justifyContent: "center",
                            color: "rgba(255,255,255,0.55)", fontSize: "1rem", cursor: "pointer",
                            transition: "background 0.15s",
                          }}
                          onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.13)"}
                          onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.07)"}
                        >
                          ✕
                        </button>

                        {/* Header */}
                        <div style={{ display: "flex", alignItems: "center", gap: "0.85rem", marginBottom: "1.4rem" }}>
                          <div style={{
                            width: 52, height: 52, borderRadius: 13,
                            background: `${meta.accent}18`,
                            display: "flex", alignItems: "center", justifyContent: "center",
                            fontSize: "1.7rem", flexShrink: 0,
                          }}>
                            {meta.emoji}
                          </div>
                          <div>
                            <div style={{ fontSize: "0.6rem", fontWeight: 700, color: "#fbbf24", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: "0.2rem" }}>
                              🏆 Weekly Champion
                            </div>
                            <div style={{ fontFamily: "'Playfair Display', serif", fontWeight: 700, color: "#fff", fontSize: "1.15rem", lineHeight: 1.2 }}>
                              {w.winner_name}
                            </div>
                            <div style={{ fontSize: "0.7rem", color: "rgba(255,255,255,0.4)", marginTop: "0.2rem" }}>
                              {fmtWeek(w.week_start, w.week_end)}
                            </div>
                          </div>
                        </div>

                        {/* Tier + domain row */}
                        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginBottom: "1.2rem" }}>
                          {w.winner_tier && (
                            <span style={{
                              fontSize: "0.72rem", fontWeight: 700, textTransform: "capitalize",
                              color: tc, background: `${tc}18`, border: `1px solid ${tc}30`,
                              borderRadius: 7, padding: "0.2rem 0.65rem",
                            }}>
                              {w.winner_tier} tier
                            </span>
                          )}
                          <span style={{
                            fontSize: "0.72rem", fontWeight: 600,
                            color: meta.accent, background: `${meta.accent}12`,
                            border: `1px solid ${meta.accent}28`,
                            borderRadius: 7, padding: "0.2rem 0.65rem", textTransform: "capitalize",
                          }}>
                            {w.community_impact_slug.replace(/-/g, " ")}
                          </span>
                        </div>

                        {/* Challenge title */}
                        {w.title && (
                          <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "0.35rem" }}>
                            Challenge
                          </div>
                        )}
                        {w.title && (
                          <p style={{ fontSize: "0.88rem", color: "rgba(255,255,255,0.6)", margin: "0 0 1.2rem", lineHeight: 1.6 }}>
                            {w.title}
                          </p>
                        )}

                        {/* Full reason */}
                        <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "0.5rem" }}>
                          Why they won
                        </div>
                        <p style={{
                          fontSize: "0.92rem", color: "rgba(255,255,255,0.82)",
                          lineHeight: 1.75, margin: 0, fontStyle: "italic",
                          borderLeft: `3px solid ${tc}`,
                          paddingLeft: "1rem",
                        }}>
                          "{w.winner_reason}"
                        </p>
                      </div>
                    </div>
                  );
                })()}

                {/* ── Domain cards ─────────────────────────────────────────── */}
                <div style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(330px, 1fr))",
                  gap: "1.25rem",
                }}>
                  {DOMAINS.map(domain => {
                    const story = bestStoryBySlug.get(domain.slug);
                    const count = getCount(domain.slug);
                    return (
                      <div key={domain.slug} style={{
                        background: "rgba(255,255,255,0.04)",
                        border: `1px solid ${domain.accent}28`,
                        borderRadius: 16, padding: "1.5rem",
                        position: "relative", overflow: "hidden",
                        transition: "transform 0.2s, box-shadow 0.2s",
                      }}
                        onMouseEnter={e => {
                          (e.currentTarget as HTMLDivElement).style.transform = "translateY(-3px)";
                          (e.currentTarget as HTMLDivElement).style.boxShadow = `0 16px 40px ${domain.accent}18`;
                        }}
                        onMouseLeave={e => {
                          (e.currentTarget as HTMLDivElement).style.transform = "translateY(0)";
                          (e.currentTarget as HTMLDivElement).style.boxShadow = "none";
                        }}
                      >
                        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: domain.accent }} />

                        {/* Header */}
                        <div style={{ display: "flex", alignItems: "flex-start", gap: "0.9rem", marginBottom: "0.9rem" }}>
                          <div style={{
                            width: 48, height: 48, borderRadius: 12,
                            background: domain.accentDim,
                            display: "flex", alignItems: "center", justifyContent: "center",
                            fontSize: "1.5rem", flexShrink: 0,
                          }}>
                            {domain.emoji}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                              <h3 style={{ fontFamily: "'Playfair Display', serif", fontSize: "1rem", fontWeight: 700, color: "#fff", margin: 0 }}>
                                {domain.label}
                              </h3>
                              {count > 0 && (
                                <span style={{
                                  fontSize: "0.65rem", fontWeight: 700, color: domain.accent,
                                  background: domain.accentDim, border: `1px solid ${domain.accent}40`,
                                  borderRadius: 99, padding: "0.15rem 0.55rem", letterSpacing: "0.06em",
                                }}>
                                  {count} {count === 1 ? "story" : "stories"}
                                </span>
                              )}
                            </div>
                            <div style={{ fontSize: "0.72rem", color: domain.accent, fontWeight: 700, letterSpacing: "0.05em", marginTop: "0.18rem" }}>
                              {domain.who}
                            </div>
                          </div>
                        </div>

                        {/* Tagline */}
                        <p style={{ fontSize: "0.83rem", color: "rgba(255,255,255,0.52)", lineHeight: 1.65, margin: "0 0 1rem" }}>
                          {domain.tagline}
                        </p>

                        {/* Story block — tier evidence takes priority */}
                        {story ? (
                          <div style={{
                            background: "rgba(255,255,255,0.04)",
                            border: `1px solid ${domain.accent}22`,
                            borderRadius: 10, padding: "0.9rem 1rem",
                          }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap", marginBottom: "0.45rem" }}>
                              <div style={{ fontSize: "0.64rem", fontWeight: 700, color: domain.accent, textTransform: "uppercase", letterSpacing: "0.1em" }}>
                                {story.source === "tier" ? "Recognised impact" : "Community story"}
                              </div>
                              {story.tier && (
                                <span style={{
                                  fontSize: "0.6rem", fontWeight: 700, textTransform: "capitalize",
                                  color: tierColors[story.tier] ?? "#fff",
                                  background: `${tierColors[story.tier] ?? "#fff"}18`,
                                  border: `1px solid ${tierColors[story.tier] ?? "#fff"}28`,
                                  borderRadius: 6, padding: "0.1rem 0.38rem",
                                }}>
                                  {story.tier}
                                </span>
                              )}
                              {story.tierLabel && (
                                <span style={{
                                  fontSize: "0.6rem", fontWeight: 700,
                                  color: "rgba(255,255,255,0.55)",
                                  background: "rgba(255,255,255,0.07)",
                                  border: "1px solid rgba(255,255,255,0.1)",
                                  borderRadius: 6, padding: "0.1rem 0.38rem",
                                  fontStyle: "italic",
                                }}>
                                  {story.tierLabel}
                                </span>
                              )}
                            </div>
                            <p style={{ fontSize: "0.81rem", color: "rgba(255,255,255,0.72)", lineHeight: 1.65, margin: "0 0 0.5rem", fontStyle: "italic" }}>
                              "{story.text.length > 200 ? story.text.slice(0, 200).trimEnd() + "…" : story.text}"
                            </p>
                            {story.role && (
                              <span style={{ fontSize: "0.65rem", color: "rgba(255,255,255,0.35)", background: "rgba(255,255,255,0.06)", borderRadius: 6, padding: "0.15rem 0.45rem" }}>
                                {story.role}
                              </span>
                            )}
                          </div>
                        ) : (
                          <div style={{
                            background: "rgba(255,255,255,0.025)",
                            border: `1px dashed ${domain.accent}22`,
                            borderRadius: 10, padding: "0.9rem 1rem",
                            textAlign: "center",
                          }}>
                            <div style={{ fontSize: "0.8rem", color: "rgba(255,255,255,0.22)", lineHeight: 1.6 }}>
                              Stories coming as youth complete their first challenges in this track.
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* ── Tier breakdown ────────────────────────────────────────── */}
                <div style={{
                  marginTop: "3rem",
                  background: "rgba(255,255,255,0.035)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  borderRadius: 14, padding: "1.6rem 2rem",
                }}>
                  <div style={{ fontSize: "0.68rem", fontWeight: 700, color: "rgba(255,255,255,0.32)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "1.1rem" }}>
                    How community impact is recognised
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                    {[
                      { tier: "seed",       color: "#4ade80", desc: "Took the challenge out into the world — first community engagement." },
                      { tier: "scout",      color: "#38bdf8", desc: "Brought back a real story — documented the impact with evidence." },
                      { tier: "bridge",     color: "#fbbf24", desc: "Referred a new learner from the community they helped." },
                      { tier: "builder",    color: "#fb923c", desc: "Completed a sustained series of community challenges across weeks." },
                      { tier: "multiplier", color: "#a78bfa", desc: "A learner they mentored went on to complete their own challenge." },
                    ].map(t => {
                      const count = tierTotals[t.tier] ?? 0;
                      const maxCount = Math.max(...Object.values(tierTotals), 1);
                      return (
                        <div key={t.tier} style={{ display: "flex", alignItems: "center", gap: "0.85rem" }}>
                          {/* Tier pill */}
                          <div style={{
                            width: 76, flexShrink: 0,
                            fontSize: "0.68rem", fontWeight: 700, color: t.color,
                            textTransform: "capitalize", textAlign: "right",
                          }}>
                            {t.tier}
                          </div>
                          {/* Progress bar */}
                          <div style={{ flex: 1, height: 6, background: "rgba(255,255,255,0.07)", borderRadius: 99, overflow: "hidden" }}>
                            <div style={{
                              height: "100%", borderRadius: 99,
                              background: t.color,
                              width: count > 0 ? `${Math.max(6, (count / maxCount) * 100)}%` : "0%",
                              opacity: 0.75,
                              transition: "width 1.2s cubic-bezier(0.16,1,0.3,1)",
                            }} />
                          </div>
                          {/* Count */}
                          {count > 0 && (
                            <div style={{ fontSize: "0.72rem", fontWeight: 700, color: t.color, width: 24, textAlign: "right", flexShrink: 0 }}>
                              {count}
                            </div>
                          )}
                          {/* Description */}
                          <div style={{ fontSize: "0.73rem", color: "rgba(255,255,255,0.35)", flex: "2 1 160px", lineHeight: 1.5 }}>
                            {t.desc}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

              </div>
            </section>
          );
        })()}

        {/* ── Video ──────────────────────────────────────────────────────── */}
        <section style={{ background: "#0c160a", padding: "4rem 2rem" }}>
          <div style={{ maxWidth: 860, margin: "0 auto" }}>
            <div style={{ textAlign: "center", marginBottom: "2rem" }}>
              <div style={{ fontSize: "0.7rem", fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "#d97706", marginBottom: "0.6rem" }}>
                Where we are going, one village at a time.
              </div>
              <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: "clamp(1.7rem,4vw,2.5rem)", fontWeight: 700, color: "#fff", margin: "0 0 0.6rem" }}>
                Our Vision
              </h2>
              <p style={{ color: "rgba(255,255,255,0.5)", fontSize: "0.92rem", lineHeight: 1.7, maxWidth: 560, margin: "0 auto" }}>
                It starts in Oloibir. It moves one village at a time to help people in their communities.
              </p>
            </div>
            <div style={{
              position: "relative", width: "100%", aspectRatio: "16/9",
              borderRadius: 16, overflow: "hidden",
              boxShadow: "0 24px 60px rgba(0,0,0,0.5)",
              border: "1px solid rgba(255,255,255,0.08)",
            }}>
              <iframe
                src="https://www.youtube.com/embed/1mFbtVEiEpY"
                title="vAI — AI learning in community — AI learning in community"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: "none" }}
              />
            </div>
          </div>
        </section>

        {/* ── Origin Story ─────────────────────────────────────────────────────── */}
        <section id="story" style={{ background: "#faf7f2", padding: "5rem 2rem" }}>
          <div style={{ maxWidth: 900, margin: "0 auto" }}>

            <div style={{ textAlign: "center", marginBottom: "3rem" }}>
              <div style={{ fontSize: "0.7rem", fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "#d97706", marginBottom: "0.6rem" }}>
                How We Got Started
              </div>
              <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: "clamp(1.8rem,4vw,2.8rem)", fontWeight: 700, color: "#1a1208", margin: "0 0 1rem" }}>
                A vacant room in Oloibiri.<br />A $5,000 bet on human potential.
              </h2>
              <p style={{ color: "rgba(26,18,8,0.6)", fontSize: "1.05rem", lineHeight: 1.8, maxWidth: 680, margin: "0 auto" }}>
                In June 2025, a disused space in Oloibiri — a town of 8,000 people in Bayelsa State, Nigeria,
                where the first oil well in West Africa once pumped and went dry — became the Davidson AI Innovation Center.
                Four computers. Solar power. A Starlink connection. And two young men who knocked on doors
                and told parents whose children could not afford school:{" "}
                <em style={{ color: "#92400e" }}>"There is no cost. We want them."</em>
              </p>
            </div>

            {/* Three story beats */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "1.5rem", marginBottom: "3rem" }}>
              {[
                {
                  icon: "🤝",
                  heading: "People before technology",
                  body: "Bennywhite Davidson and Michael Amada had no formal training in technology education. What they had was courage and love for their community. They organised children from the poorest households, stood at the front of the room and explained why the AI asked questions — not to test the children, but to help them think. When typing was too hard, children used voice chat. Suddenly AI felt personal, accessible, and even fun.",
                },
                {
                  icon: "📡",
                  heading: "What nobody planned for",
                  body: "Eight months in, the lab became something no one had designed it to be. A 12-year-old helped a poultry farmer write a business proposal. Market women and entrepreneurs arrived with needs and left with solutions. Two Anglican priests now come every Saturday — their only internet access — to research and compose sermons. Community elders formally encouraged all residents to learn AI. In one week, 513 people walked through the lab and registered to vote for the first time in their lives.",
                },
                {
                  icon: "🌱",
                  heading: "The model that scales",
                  body: "The first cohort does not just find jobs — they become teachers and mentors who prime the next community. 66% of early learners volunteered intent to teach others before being asked. 41% explicitly planned to teach peers, family, or neighbours. One young man who came through the programme is now being mentored to maintain and grow the platform itself. This is what sustainability looks like: a locally owned digital asset with a local steward.",
                },
              ].map(beat => (
                <div key={beat.heading} style={{
                  background: "#fff",
                  border: "1px solid rgba(26,18,8,0.08)",
                  borderRadius: 14,
                  padding: "1.75rem",
                  boxShadow: "0 2px 14px rgba(26,18,8,0.05)",
                }}>
                  <div style={{ fontSize: "1.75rem", marginBottom: "0.75rem" }}>{beat.icon}</div>
                  <h3 style={{ fontFamily: "'Playfair Display', serif", fontSize: "1.05rem", fontWeight: 700, color: "#1a1208", margin: "0 0 0.6rem" }}>
                    {beat.heading}
                  </h3>
                  <p style={{ fontSize: "0.86rem", color: "rgba(26,18,8,0.62)", lineHeight: 1.75, margin: 0 }}>
                    {beat.body}
                  </p>
                </div>
              ))}
            </div>

            {/* Pull quote + links */}
            <div style={{
              background: "linear-gradient(135deg, #0c160a, #162612)",
              borderRadius: 16,
              padding: "2.5rem 3rem",
              textAlign: "center",
              position: "relative",
              overflow: "hidden",
            }}>
              <div style={{
                position: "absolute", top: -40, right: -40,
                width: 200, height: 200, borderRadius: "50%",
                background: "rgba(217,119,6,0.06)",
                pointerEvents: "none",
              }} />
              <div style={{ fontSize: "2.5rem", lineHeight: 1, color: "#d97706", marginBottom: "0.75rem" }}>"</div>
              <p style={{
                fontFamily: "'Playfair Display', serif",
                fontSize: "clamp(1.05rem,2.5vw,1.4rem)",
                fontWeight: 700, color: "#fff",
                lineHeight: 1.55, fontStyle: "italic",
                maxWidth: 620, margin: "0 auto 1.25rem",
              }}>
                Opportunities in life versus the complete absence of opportunities — that is what Bennywhite and Michael are bringing to these kids.
              </p>
              <div style={{ fontSize: "0.75rem", color: "rgba(255,255,255,0.38)", fontWeight: 600, letterSpacing: "0.06em", marginBottom: "1.75rem" }}>
                — Kevin Hallinan, University of Dayton
              </div>
              <div style={{ display: "flex", gap: "0.9rem", justifyContent: "center", flexWrap: "wrap" }}>
                <a
                  href="https://kevinhallinan.substack.com/p/the-oliobiri-nigeria-story-when-human"
                  target="_blank" rel="noopener noreferrer"
                  style={{
                    display: "inline-flex", alignItems: "center", gap: "0.4rem",
                    padding: "0.55rem 1.2rem", borderRadius: 7,
                    background: "rgba(255,255,255,0.08)",
                    border: "1px solid rgba(255,255,255,0.18)",
                    fontSize: "0.8rem", fontWeight: 600,
                    color: "rgba(255,255,255,0.8)", textDecoration: "none",
                  }}
                >
                  The Oloibiri story →
                </a>
                <a
                  href="https://kevinhallinan.substack.com/p/when-an-ai-learning-lab-in-rural"
                  target="_blank" rel="noopener noreferrer"
                  style={{
                    display: "inline-flex", alignItems: "center", gap: "0.4rem",
                    padding: "0.55rem 1.2rem", borderRadius: 7,
                    background: "rgba(255,255,255,0.08)",
                    border: "1px solid rgba(255,255,255,0.18)",
                    fontSize: "0.8rem", fontWeight: 600,
                    color: "rgba(255,255,255,0.8)", textDecoration: "none",
                  }}
                >
                  When the lab became something more →
                </a>
              </div>
            </div>

          </div>
        </section>

        {/* ── Their Vision for 2030 ───────────────────────────────────────── */}
        <section id="vision" style={{ background: "linear-gradient(180deg,#0a120a 0%,#0c160a 100%)", padding: "5rem 2rem" }}>
          <div style={{ maxWidth: 1100, margin: "0 auto" }}>
            <div className="vision-g">

              <div>
                <div style={{ fontSize: "0.7rem", fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "#5eead4", marginBottom: "0.6rem" }}>
                  In Their Own Words
                </div>
                <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: "clamp(1.8rem,4vw,2.8rem)", fontWeight: 700, color: "#fff", margin: "0 0 1.1rem", lineHeight: 1.15 }}>
                  What AI has taught them — and where they see it taking them
                </h2>
                <p style={{ color: "rgba(255,255,255,0.62)", fontSize: "1.02rem", lineHeight: 1.85, margin: "0 0 1.5rem" }}>
                  Every child in this video walked into a vacant room with no prior digital access.
                  Here, in their own voices, they talk about what AI has taught them so far, how it
                  has changed the way they think and learn, and the future they now imagine for
                  themselves and their community because of it.
                </p>
                <p style={{ color: "rgba(255,255,255,0.4)", fontSize: "0.85rem", lineHeight: 1.7, margin: 0, fontStyle: "italic" }}>
                  This is the counter-narrative to conventional aid: not a future done for them,
                  but one they are already designing.
                </p>
              </div>

              <div className="vision-video">
                <iframe
                  src="https://www.youtube.com/embed/076mwoD7_to"
                  title="Youth vision for AI futures — in their own words"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  loading="lazy"
                />
              </div>

            </div>
          </div>
        </section>

        {/* ── Voices from the Community ───────────────────────────────────── */}
        <section id="voices" style={{ background: "#0c160a", padding: "5rem 2rem" }}>
          <div style={{ maxWidth: 1100, margin: "0 auto" }}>
            <div style={{ textAlign: "center", marginBottom: "3rem" }}>
              <div style={{ fontSize: "0.7rem", fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "#4ade80", marginBottom: "0.6rem" }}>
                In Their Own Words
              </div>
              <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: "clamp(1.7rem,4vw,2.6rem)", fontWeight: 700, color: "#fff", margin: "0 0 0.75rem" }}>
                Voices from the community
              </h2>
              <p style={{ color: "rgba(255,255,255,0.52)", maxWidth: 600, margin: "0 auto", lineHeight: 1.75, fontSize: "0.97rem" }}>
                The people closest to this work are writing about it — from Oloibiri, Nigeria and Dayton, Ohio.
                These are not reports written about communities. They are written by the people living the change.
              </p>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "1.5rem" }}>

              {/* Solomon */}
              <a href="https://substack.com/@solomonmatthiassolomon" target="_blank" rel="noopener noreferrer"
                style={{ textDecoration: "none", display: "block" }}
                onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.transform = "translateY(-4px)"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.transform = "translateY(0)"; }}
              >
                <div style={{
                  background: "rgba(255,255,255,0.05)", border: "1px solid rgba(74,222,128,0.2)",
                  borderRadius: 16, padding: "1.75rem", height: "100%",
                  transition: "transform 0.2s, box-shadow 0.2s",
                  position: "relative", overflow: "hidden",
                }}>
                  <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: "#4ade80" }} />
                  <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "1rem" }}>
                    <div style={{ width: 44, height: 44, borderRadius: "50%", background: "rgba(74,222,128,0.15)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.3rem", flexShrink: 0 }}>
                      🏥
                    </div>
                    <div>
                      <div style={{ fontWeight: 700, color: "#fff", fontSize: "0.95rem" }}>Solomon Matthias Solomon</div>
                      <div style={{ fontSize: "0.75rem", color: "#4ade80", fontWeight: 600 }}>Lead Community Health Navigator · Oloibiri, Nigeria</div>
                    </div>
                  </div>
                  <p style={{ fontSize: "0.87rem", color: "rgba(255,255,255,0.6)", lineHeight: 1.72, margin: "0 0 1.25rem" }}>
                    Writing about healthcare navigation, community trust-building, and what it means to bring AI into a place where formal health systems barely reach. A health navigator's eye view from the ground.
                  </p>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.8rem", fontWeight: 600, color: "#4ade80" }}>
                    <BookOpen size={13} /> Read on Substack <ExternalLink size={11} />
                  </div>
                </div>
              </a>

              {/* Kevin + Bennywhite — AI for Equity */}
              <a href="https://kevinhallinan.substack.com" target="_blank" rel="noopener noreferrer"
                style={{ textDecoration: "none", display: "block" }}
                onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.transform = "translateY(-4px)"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.transform = "translateY(0)"; }}
              >
                <div style={{
                  background: "rgba(255,255,255,0.05)", border: "1px solid rgba(217,119,6,0.25)",
                  borderRadius: 16, padding: "1.75rem", height: "100%",
                  transition: "transform 0.2s, box-shadow 0.2s",
                  position: "relative", overflow: "hidden",
                }}>
                  <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: "#d97706" }} />
                  <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "1rem" }}>
                    <div style={{ width: 44, height: 44, borderRadius: "50%", background: "rgba(217,119,6,0.15)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.3rem", flexShrink: 0 }}>
                      ✊
                    </div>
                    <div>
                      <div style={{ fontWeight: 700, color: "#fff", fontSize: "0.95rem" }}>AI for Equity in Education</div>
                      <div style={{ fontSize: "0.75rem", color: "#fbbf24", fontWeight: 600 }}>Kevin Hallinan &amp; Bennywhite Davidson · UD / vAI</div>
                    </div>
                  </div>
                  <p style={{ fontSize: "0.87rem", color: "rgba(255,255,255,0.6)", lineHeight: 1.72, margin: "0 0 1.25rem" }}>
                    The story of what happens when a vacant room in rural Nigeria becomes a laboratory for human potential. Written by the co-founders of vAI — an Emeritus Professor in Dayton and a community leader in Oloibiri — in equal voice.
                  </p>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.8rem", fontWeight: 600, color: "#d97706" }}>
                    <BookOpen size={13} /> Read on Substack <ExternalLink size={11} />
                  </div>
                </div>
              </a>

              {/* Book — in-page reader card */}
              <BookCard onOpen={() => setBookOpen(true)} />

            </div>
          </div>
        </section>

        {/* ── Open Research ────────────────────────────────────────────────── */}
        <section id="research" style={{ background: "#f0fdf4", padding: "5rem 2rem" }}>
          <div style={{ maxWidth: 1100, margin: "0 auto" }}>

            {/* Header */}
            <div style={{ textAlign: "center", marginBottom: "3.5rem" }}>
              <div style={{ fontSize: "0.7rem", fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "#16a34a", marginBottom: "0.6rem" }}>
                Community-Led · Open-Source · Youth-Driven
              </div>
              <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: "clamp(1.8rem,4vw,2.8rem)", fontWeight: 700, color: "#1a1208", margin: "0 0 1rem" }}>
                Research by the community,<br />for the community
              </h2>
              <p style={{ color: "rgba(26,18,8,0.62)", maxWidth: 700, margin: "0 auto", lineHeight: 1.8, fontSize: "0.97rem" }}>
                This is not research conducted <em>about</em> communities. Learners are not subjects —
                they are co-researchers. Youth participants self-enroll, document their own capability
                formation, and lead the inquiry. The methodology is open. The findings belong to everyone.
              </p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.65rem", justifyContent: "center", marginTop: "1.5rem" }}>
                {["🔬 Open methodology", "👩‍💻 Youth-led", "📊 Live platform data", "🌍 Community ownership", "✊ Self-enrolled learners"].map(tag => (
                  <span key={tag} style={{
                    padding: "0.32rem 0.9rem", borderRadius: 99,
                    background: "rgba(22,163,74,0.1)", border: "1px solid rgba(22,163,74,0.22)",
                    fontSize: "0.78rem", fontWeight: 600, color: "#15803d",
                  }}>{tag}</span>
                ))}
              </div>
            </div>

            {/* ── Block 1: Active Research Programs ── */}
            <div style={{ marginBottom: "4rem" }}>
              <h3 style={{ fontFamily: "'Playfair Display', serif", fontSize: "1.4rem", fontWeight: 700, color: "#1a1208", margin: "0 0 1.5rem", paddingBottom: "0.75rem", borderBottom: "2px solid rgba(22,163,74,0.15)" }}>
                Active Research Programs
              </h3>

              {programs.map(program => {
                const qs = questions.filter(q => q.program_id === program.id);
                const isVAI = program.slug === 'vai-ai-learning-lab-impact';
                return (
                  <div key={program.id} style={{ marginBottom: "2.5rem" }}>
                    {/* Program header card */}
                    <div style={{
                      background: "linear-gradient(135deg,#0c160a,#162612)",
                      borderRadius: 18, padding: "2rem 2.25rem", marginBottom: "1.25rem",
                      border: "1px solid rgba(22,163,74,0.15)",
                    }}>
                      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: "1rem" }}>
                        <div style={{ flex: 1, minWidth: 260 }}>
                          <div style={{ fontSize: "0.68rem", fontWeight: 700, color: "#4ade80", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "0.45rem" }}>
                            Active Research Program
                          </div>
                          <h4 style={{ fontFamily: "'Playfair Display', serif", fontSize: "clamp(1.1rem,3vw,1.55rem)", fontWeight: 700, color: "#fff", margin: "0 0 0.75rem" }}>
                            {program.title}
                          </h4>
                          <p style={{ fontSize: "0.88rem", color: "rgba(255,255,255,0.58)", lineHeight: 1.75, margin: "0 0 1rem", maxWidth: 620 }}>
                            {program.description}
                          </p>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
                            {program.sites.map((site: string) => (
                              <span key={site} style={{
                                padding: "0.25rem 0.75rem", borderRadius: 99,
                                background: "rgba(74,222,128,0.12)", border: "1px solid rgba(74,222,128,0.2)",
                                fontSize: "0.74rem", fontWeight: 600, color: "#4ade80",
                              }}>📍 {site}</span>
                            ))}
                          </div>
                        </div>
                        {/* Live data for vAI */}
                        {isVAI && latestRow && (
                          <div style={{
                            background: "rgba(255,255,255,0.05)", borderRadius: 14,
                            border: "1px solid rgba(255,255,255,0.08)",
                            padding: "1.25rem 1.5rem", minWidth: 180, textAlign: "center", flexShrink: 0,
                          }}>
                            <div style={{ fontSize: "0.66rem", fontWeight: 700, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "0.5rem" }}>Live Cohort</div>
                            <div style={{ fontFamily: "'Playfair Display', serif", fontSize: "2.6rem", fontWeight: 900, color: "#fff", lineHeight: 1 }}>{latestRow.learner_count}</div>
                            <div style={{ fontSize: "0.72rem", color: "#4ade80", fontWeight: 600, marginTop: "0.3rem" }}>Active Learners</div>
                            <div style={{ height: 1, background: "rgba(255,255,255,0.08)", margin: "0.85rem 0" }} />
                            <div style={{ fontFamily: "'Playfair Display', serif", fontSize: "1.8rem", fontWeight: 900, color: "#fff", lineHeight: 1 }}>{latestRow.sessions_count?.toLocaleString()}</div>
                            <div style={{ fontSize: "0.72rem", color: "#fbbf24", fontWeight: 600, marginTop: "0.3rem" }}>AI Sessions</div>
                          </div>
                        )}
                        {/* iGiTREE — coming soon data badge */}
                        {!isVAI && (
                          <div style={{
                            background: "rgba(255,255,255,0.05)", borderRadius: 14,
                            border: "1px solid rgba(255,255,255,0.08)",
                            padding: "1.25rem 1.5rem", minWidth: 180, textAlign: "center", flexShrink: 0,
                          }}>
                            <div style={{ fontSize: "0.66rem", fontWeight: 700, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "0.75rem" }}>Live Data</div>
                            <span style={{ fontSize: "1.8rem" }}>🧬</span>
                            <div style={{ fontSize: "0.75rem", color: "rgba(255,255,255,0.35)", marginTop: "0.5rem", lineHeight: 1.5 }}>Coming as cohort<br />data matures</div>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Guiding question cards */}
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(290px, 1fr))", gap: "1rem" }}>
                      {qs.map(q => (
                        <div key={q.id} style={{
                          background: "#fff", borderRadius: 14,
                          border: `1px solid ${q.color_hex}28`,
                          padding: "1.5rem", boxShadow: "0 2px 12px rgba(26,18,8,0.05)",
                          position: "relative", overflow: "hidden",
                        }}>
                          <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: q.color_hex }} />
                          <div style={{ display: "flex", alignItems: "flex-start", gap: "0.75rem", marginBottom: "0.9rem" }}>
                            <span style={{ fontSize: "1.4rem", flexShrink: 0, lineHeight: 1 }}>{q.icon}</span>
                            <div>
                              <div style={{ fontSize: "0.66rem", fontWeight: 700, color: q.color_hex, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "0.2rem" }}>{q.domain}</div>
                              <div style={{ fontWeight: 700, color: "#1a1208", fontSize: "0.92rem", lineHeight: 1.35 }}>{q.title}</div>
                            </div>
                          </div>
                          <p style={{ fontSize: "0.82rem", color: "rgba(26,18,8,0.62)", lineHeight: 1.72, margin: "0 0 1rem", fontStyle: "italic" }}>
                            "{q.research_question}"
                          </p>
                          {/* Live indicators for vAI questions */}
                          {isVAI && latestRow && q.slug === 'learning-outcomes' && (
                            <div style={{ display: "flex", gap: "0.65rem", flexWrap: "wrap" }}>
                              {[
                                { label: "AI Proficiency", value: `${latestRow.avg_mean?.toFixed(0) ?? "—"}/100`, color: "#C8963E" },
                                { label: "Role-Ready", value: `${latestRow.role_ready_count ?? "—"} learners`, color: "#16a34a" },
                              ].map(stat => (
                                <div key={stat.label} style={{ background: `${stat.color}12`, border: `1px solid ${stat.color}28`, borderRadius: 8, padding: "0.4rem 0.75rem" }}>
                                  <div style={{ fontSize: "0.62rem", color: stat.color, fontWeight: 700, textTransform: "uppercase" }}>{stat.label}</div>
                                  <div style={{ fontSize: "0.88rem", fontWeight: 700, color: "#1a1208" }}>{stat.value}</div>
                                </div>
                              ))}
                            </div>
                          )}
                          {isVAI && latestRow && q.slug === 'community-spillover' && (
                            <div style={{ display: "flex", gap: "0.65rem", flexWrap: "wrap" }}>
                              {[
                                { label: "PUE Linkage", value: `${latestRow.pue_learner_pct?.toFixed(0) ?? "—"}%`, color: "#5B7A6A" },
                                { label: "Reducing AI Reliance", value: `${latestRow.converging_count ?? "—"}`, color: "#16a34a" },
                              ].map(stat => (
                                <div key={stat.label} style={{ background: `${stat.color}12`, border: `1px solid ${stat.color}28`, borderRadius: 8, padding: "0.4rem 0.75rem" }}>
                                  <div style={{ fontSize: "0.62rem", color: stat.color, fontWeight: 700, textTransform: "uppercase" }}>{stat.label}</div>
                                  <div style={{ fontSize: "0.88rem", fontWeight: 700, color: "#1a1208" }}>{stat.value}</div>
                                </div>
                              ))}
                            </div>
                          )}
                          {isVAI && latestRow && q.slug === 'hope-agency' && (
                            <div style={{ background: "rgba(42,123,136,0.07)", borderRadius: 8, padding: "0.55rem 0.85rem", fontSize: "0.76rem", color: "rgba(26,18,8,0.55)", lineHeight: 1.6 }}>
                              📊 {latestRow.assessed_count ?? "—"} learners assessed this period via monthly AI rubrics
                            </div>
                          )}
                          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem", marginTop: "0.85rem" }}>
                            {q.sites.map((site: string) => (
                              <span key={site} style={{ fontSize: "0.68rem", fontWeight: 600, color: "rgba(26,18,8,0.4)", background: "rgba(26,18,8,0.05)", borderRadius: 99, padding: "0.2rem 0.6rem" }}>
                                {site}
                              </span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* ── Block 2: Open Research Network ── */}
            <div style={{
              background: "linear-gradient(135deg,#1e1b4b,#312e81)",
              borderRadius: 22, padding: "3rem 2.5rem",
              border: "1px solid rgba(139,92,246,0.2)",
            }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 420px), 1fr))", gap: "2.5rem", alignItems: "start" }}>

                {/* Left: vision */}
                <div>
                  <div style={{ fontSize: "0.68rem", fontWeight: 700, color: "#a78bfa", textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: "0.6rem" }}>
                    Coming Soon · Open to Researchers Worldwide
                  </div>
                  <h3 style={{ fontFamily: "'Playfair Display', serif", fontSize: "clamp(1.3rem,3vw,2rem)", fontWeight: 700, color: "#fff", margin: "0 0 1rem", lineHeight: 1.25 }}>
                    A distributed research network — proposed by anyone, vetted for equity, led by communities
                  </h3>
                  <p style={{ fontSize: "0.88rem", color: "rgba(255,255,255,0.58)", lineHeight: 1.8, margin: "0 0 1.5rem" }}>
                    Any researcher — from any university or institution — will be able to propose a study.
                    A review board vets each proposal for scientific merit and, critically, whether it empowers
                    or exploits its participants. Approved studies are then offered to communities, who choose
                    whether to participate. Learners who join become co-researchers: AI-mentored, team-based,
                    and eligible for university research certification upon documented completion.
                  </p>

                  {/* How it works */}
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.85rem" }}>
                    {[
                      { step: "01", icon: "💡", title: "Researcher proposes a study", detail: "Any institution worldwide. Open submission." },
                      { step: "02", icon: "🛡️", title: "AI + board vetting", detail: "Reviewed by the vAI Research Board and an AI IRB for equity, scientific merit, and community empowerment — not exploitation." },
                      { step: "03", icon: "🌍", title: "Community chooses to participate", detail: "Communities are invited, never assigned. They select the studies that matter to them." },
                      { step: "04", icon: "👩‍🔬", title: "Learners join as co-researchers", detail: "AI-mentored, team-based participation. Learners document, analyze, and contribute." },
                      { step: "05", icon: "🎓", title: "University research certification", detail: "Successful participants earn credentials recognized by University of Dayton, Temple University, and partner institutions." },
                    ].map(item => (
                      <div key={item.step} style={{ display: "flex", gap: "1rem", alignItems: "flex-start" }}>
                        <div style={{
                          width: 36, height: 36, borderRadius: "50%", flexShrink: 0,
                          background: "rgba(139,92,246,0.2)", border: "1px solid rgba(139,92,246,0.3)",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: "1rem",
                        }}>{item.icon}</div>
                        <div>
                          <div style={{ fontSize: "0.8rem", fontWeight: 700, color: "#fff", marginBottom: "0.15rem" }}>{item.title}</div>
                          <div style={{ fontSize: "0.75rem", color: "rgba(255,255,255,0.45)", lineHeight: 1.6 }}>{item.detail}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Right: board + CTA */}
                <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>

                  {/* Review Board */}
                  <div style={{
                    background: "rgba(255,255,255,0.05)", borderRadius: 16,
                    border: "1px solid rgba(139,92,246,0.2)", padding: "1.75rem",
                  }}>
                    <div style={{ fontSize: "0.68rem", fontWeight: 700, color: "#a78bfa", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "1rem" }}>
                      Research Review Board
                    </div>
                    {[
                      { name: "Bennywhite Davidson", role: "vAI Co-Founder · Oloibiri, Nigeria", emoji: "🇳🇬" },
                      { name: "Silas Clergy", role: "Youth Representative · vAI Learner & Developer", emoji: "👨‍💻" },
                      { name: "Kevin Hallinan", role: "Emeritus Professor · University of Dayton", emoji: "🎓" },
                      { name: "Jean Akingeneye", role: "Research Partner · iGiTREE", emoji: "🧬" },
                      { name: "UD Representative", role: "University of Dayton · Incoming", emoji: "🏛️" },
                      { name: "Temple Representative", role: "Temple University · Incoming", emoji: "🏛️" },
                    ].map(member => (
                      <div key={member.name} style={{
                        display: "flex", alignItems: "center", gap: "0.75rem",
                        padding: "0.6rem 0", borderBottom: "1px solid rgba(255,255,255,0.06)",
                      }}>
                        <span style={{ fontSize: "1.1rem", flexShrink: 0 }}>{member.emoji}</span>
                        <div>
                          <div style={{ fontSize: "0.82rem", fontWeight: 700, color: "#fff" }}>{member.name}</div>
                          <div style={{ fontSize: "0.72rem", color: "rgba(255,255,255,0.4)", lineHeight: 1.4 }}>{member.role}</div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* CTA */}
                  <div style={{
                    background: "rgba(139,92,246,0.12)", borderRadius: 16,
                    border: "1px solid rgba(139,92,246,0.25)", padding: "1.75rem",
                    textAlign: "center",
                  }}>
                    <div style={{ fontSize: "1.6rem", marginBottom: "0.75rem" }}>🔬</div>
                    <div style={{ fontWeight: 700, color: "#fff", fontSize: "1rem", marginBottom: "0.5rem" }}>Are you a researcher?</div>
                    <p style={{ fontSize: "0.8rem", color: "rgba(255,255,255,0.5)", lineHeight: 1.65, margin: "0 0 1.25rem" }}>
                      We are building the proposal portal now. Register your interest and we will contact you when submissions open.
                    </p>
                    <a
                      href="mailto:bennywhite.davidson@renewvia.com?subject=Research%20Network%20Interest&body=Hello%2C%20I%20am%20interested%20in%20proposing%20a%20study%20through%20the%20vAI%20Open%20Research%20Network.%0A%0AName%3A%20%0AInstitution%3A%20%0AResearch%20area%3A%20%0A%0APlease%20keep%20me%20informed%20of%20when%20submissions%20open."
                      style={{
                        display: "inline-flex", alignItems: "center", gap: "0.5rem",
                        padding: "0.75rem 1.75rem", borderRadius: 10,
                        background: "#7c3aed", color: "#fff",
                        fontSize: "0.88rem", fontWeight: 700, textDecoration: "none",
                        transition: "opacity 0.15s",
                      }}
                      onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.opacity = "0.85"; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.opacity = "1"; }}
                    >
                      ✉️ Register Interest
                    </a>
                  </div>

                  {/* Findings placeholder */}
                  <div style={{
                    background: "rgba(22,163,74,0.08)", border: "1px dashed rgba(22,163,74,0.3)",
                    borderRadius: 12, padding: "1.1rem 1.4rem",
                    display: "flex", alignItems: "center", gap: "0.85rem",
                  }}>
                    <span style={{ fontSize: "1.2rem" }}>📊</span>
                    <div>
                      <div style={{ fontWeight: 700, color: "#15803d", fontSize: "0.82rem", marginBottom: "0.15rem" }}>Findings emerging</div>
                      <div style={{ fontSize: "0.75rem", color: "rgba(26,18,8,0.5)", lineHeight: 1.6 }}>
                        Formal research findings will appear here as the research community documents them.
                      </div>
                    </div>
                  </div>

                </div>
              </div>
            </div>

          </div>
        </section>



        {/* ── New Communities ──────────────────────────────────────────────── */}
        <div id="community" style={{ position: "relative" }}>
          <div style={{
            position: "absolute", inset: 0, zIndex: 0,
            backgroundImage: "url('/home_page_africa.png')",
            backgroundSize: "cover", backgroundPosition: "center 55%",
            filter: "brightness(0.3)",
          }} />
          <div style={{
            position: "absolute", inset: 0, zIndex: 1,
            background: "linear-gradient(135deg,rgba(8,20,6,0.88),rgba(13,148,136,0.55))",
          }} />
          <div style={{ position: "relative", zIndex: 2, padding: "5rem 2rem" }}>
            <div style={{ maxWidth: 860, margin: "0 auto", textAlign: "center" }}>
              <div style={{ fontSize: "0.7rem", fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "#5eead4", marginBottom: "0.6rem" }}>
                For New Communities
              </div>
              <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: "clamp(1.7rem,4vw,2.6rem)", fontWeight: 700, color: "#fff", margin: "0 0 1rem" }}>
                Bring vAI to your community
              </h2>
              <p style={{ color: "rgba(255,255,255,0.68)", lineHeight: 1.8, fontSize: "1.03rem", maxWidth: 620, margin: "0 auto 2rem" }}>
                We partner with community leaders, NGOs, schools, and organisations
                across Sub-Saharan Africa and beyond to establish local AI learning cohorts.
                Each cohort is anchored by a trained on-the-ground facilitator and supported
                by our platform's AI tutoring infrastructure.
              </p>
              <div style={{
                display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))",
                gap: "1rem", marginBottom: "2.5rem",
              }}>
                {[
                  { icon: "🌍", label: "Community cohorts",  desc: "Structured groups with local facilitators" },
                  { icon: "🔑", label: "Join codes",         desc: "Controlled access — contact us to start" },
                  { icon: "📊", label: "Progress reports",   desc: "Monthly AI-assessed data per learner" },
                  { icon: "🤝", label: "Human mentorship",   desc: "On-the-ground support alongside AI" },
                ].map(item => (
                  <div key={item.label} style={{
                    background: "rgba(255,255,255,0.07)",
                    border: "1px solid rgba(255,255,255,0.11)",
                    borderRadius: 12, padding: "1.2rem",
                    backdropFilter: "blur(8px)",
                  }}>
                    <div style={{ fontSize: "1.4rem", marginBottom: "0.45rem" }}>{item.icon}</div>
                    <div style={{ fontWeight: 700, color: "#fff", marginBottom: "0.28rem", fontSize: "0.88rem" }}>{item.label}</div>
                    <div style={{ fontSize: "0.76rem", color: "rgba(255,255,255,0.52)", lineHeight: 1.6 }}>{item.desc}</div>
                  </div>
                ))}
              </div>
              <p style={{ color: "rgba(255,255,255,0.48)", fontSize: "0.88rem", marginBottom: "1.5rem" }}>
                Access is managed — community leaders receive join codes directly from our team.
              </p>
              <a href="mailto:bennywhite.davidson@renewvia.com?subject=New Community Interest — vAI Platform"
                className="pub-btn btn-amber" style={{ fontSize: "1rem", padding: "0.82rem 1.9rem" }}>
                Contact Us to Get Started <ArrowRight size={15} />
              </a>
            </div>
          </div>
        </div>

        {/* ── Support & Donate ─────────────────────────────────────────────── */}
        <section id="support" style={{ background: "#faf7f2", padding: "5rem 2rem" }}>
          <div style={{ maxWidth: 1100, margin: "0 auto" }}>
            <div style={{ textAlign: "center", marginBottom: "2.75rem" }}>
              <div style={{ fontSize: "0.7rem", fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "#d97706", marginBottom: "0.6rem" }}>
                Support the Mission
              </div>
              <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: "clamp(1.7rem,4vw,2.6rem)", fontWeight: 700, color: "#1a1208", margin: "0 0 0.75rem" }}>
                Help us expand human-centred AI learning
              </h2>
              <p style={{ color: "rgba(26,18,8,0.58)", maxWidth: 600, margin: "0 auto", lineHeight: 1.75 }}>
                vAI (Davidson AI Innovation Center) is building toward registered NGO status in Nigeria.
                We welcome partnerships with donors, foundations, universities, and organisations
                who share our conviction that AI capability should reach every community — not just the connected few.
              </p>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(270px,1fr))", gap: "1.25rem", marginBottom: "2.5rem" }}>
              {[
                {
                  icon: <Heart size={20} color="#d97706" />,
                  bg: "#d97706",
                  title: "Individual Donors",
                  desc: "Support a learner's journey directly. Every contribution funds platform infrastructure, facilitator training, and on-the-ground mentorship in communities with no prior digital access.",
                },
                {
                  icon: <Briefcase size={20} color="#7c3aed" />,
                  bg: "#7c3aed",
                  title: "Institutional Partners",
                  desc: "Universities, foundations, and corporations can sponsor cohorts, fund certification pathways, or partner on research. We are actively pursuing Microsoft AI for Good and similar grants.",
                },
                {
                  icon: <Globe size={20} color="#0d9488" />,
                  bg: "#0d9488",
                  title: "NGO & Field Partners",
                  desc: "Organisations working in Sub-Saharan Africa can integrate our AI learning platform into existing community programmes. We provide the tech; you provide the trust.",
                },
              ].map(card => (
                <div key={card.title} className="contact-card">
                  <div style={{
                    width: 42, height: 42, borderRadius: 11,
                    background: `${card.bg}14`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    {card.icon}
                  </div>
                  <h3 style={{ fontFamily: "'Playfair Display', serif", fontSize: "1.05rem", fontWeight: 700, color: "#1a1208", margin: 0 }}>
                    {card.title}
                  </h3>
                  <p style={{ fontSize: "0.87rem", color: "rgba(26,18,8,0.6)", lineHeight: 1.7, margin: 0 }}>
                    {card.desc}
                  </p>
                </div>
              ))}
            </div>

            {/* Contact block */}
            <div style={{
              background: "#1a1208", borderRadius: 20,
              padding: "2.5rem", textAlign: "center",
            }}>
              <div style={{ fontSize: "0.7rem", fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "#d97706", marginBottom: "0.6rem" }}>
                Get In Touch
              </div>
              <h3 style={{ fontFamily: "'Playfair Display', serif", fontSize: "1.55rem", color: "#fff", margin: "0 0 0.65rem" }}>
                Let's build this together
              </h3>
              <p style={{ color: "rgba(255,255,255,0.48)", fontSize: "0.88rem", maxWidth: 460, margin: "0 auto 2rem", lineHeight: 1.7 }}>
                Whether you want to support, partner, or simply learn more about what we're building —
                we'd love to hear from you.
              </p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.9rem", justifyContent: "center" }}>
                <a href="mailto:bennywhite.davidson@renewvia.com" className="pub-btn btn-amber">
                  <Mail size={15} /> bennywhite.davidson@renewvia.com
                </a>
                <a href="https://www.linkedin.com/in/kevinhallinanenergyinnovator123"
                  target="_blank" rel="noopener noreferrer"
                  className="pub-btn" style={{ background: "#0077b5", color: "#fff" }}>
                  <Linkedin size={15} /> LinkedIn
                </a>
                <a href="https://wa.me/19377601499"
                  target="_blank" rel="noopener noreferrer"
                  className="pub-btn" style={{ background: "#25d366", color: "#fff" }}>
                  <MessageCircle size={15} /> WhatsApp
                </a>
              </div>
            </div>
          </div>
        </section>

        {/* ── Footer ──────────────────────────────────────────────────────── */}
        <footer style={{
          background: "#080e06", padding: "2.5rem 2rem",
          textAlign: "center",
          borderTop: "1px solid rgba(255,255,255,0.05)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", justifyContent: "center", marginBottom: "0.65rem" }}>
            <Sparkles size={15} color="#d97706" />
            <span style={{ fontFamily: "'Playfair Display', serif", fontWeight: 700, fontSize: "0.92rem", color: "rgba(255,255,255,0.5)" }}>
              vAI · Davidson AI Innovation Center · Davidson AI Innovation Center
            </span>
          </div>
          <p style={{ fontSize: "0.76rem", color: "rgba(255,255,255,0.22)", margin: "0 0 0.4rem" }}>
            Oloibiri, Bayelsa State, Nigeria · Dayton, Ohio, USA
          </p>
          <p style={{ fontSize: "0.73rem", color: "rgba(255,255,255,0.16)", margin: 0 }}>
            © {new Date().getFullYear()} Davidson AI Innovation Center. ·{" "}
            <Link to="/login" style={{ color: "rgba(255,255,255,0.28)" }}>Log In / Sign Up</Link>
          </p>
        </footer>

      </div>
      <BookModal open={bookOpen} onClose={() => setBookOpen(false)} />
    </>
  );
};

export default PublicLandingPage;