// src/pages/HomePage.tsx

import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import AppLayout from '../components/layout/AppLayout';
import { Sparkles, Brain, Award, CheckCircle, Globe2, Newspaper, ChevronRight, X as XIcon, Sprout, FlaskConical } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { supabase } from '../lib/supabaseClient';
import { useBranding } from '../lib/useBranding';



const aiReadySkills = [
  {
    name: 'Vibe Coding',
    description: 'algorithm design, debugging, and code generation with AI',
  },
  {
    name: 'Critical Thinking',
    description: 'evaluating claims, evidence, and logic',
  },
  {
    name: 'Creativity',
    description: 'generating original and well-developed ideas',
  },
  {
    name: 'Problem-Solving',
    description: 'designing, testing, and refining solutions',
  },
  {
    name: 'Digital Fluency',
    description: 'navigating digital tools and AI systems confidently',
  },
  {
    name: 'Communication',
    description: 'expressing ideas clearly for real-world impact',
  },
];

interface WeeklyChampion {
  champion_name: string;
  winning_tier: string;
  winning_tier_label: string;
  champion_story: string | null;
  week_start: string;
}

interface ActiveChallenge {
  title: string;
  description: string;
  community_impact_slug: string;
  tier_target: string;
  week_end: string;
}

const HomePage: React.FC = () => {
  const { user } = useAuth();
  const branding = useBranding();
  const [continent, setContinent] = useState<string | null>(null);
  const [orgName, setOrgName] = useState<string | null>(null);
  const [loadingContinent, setLoadingContinent] = useState(true);
  const [communicationLevel, setCommunicationLevel] = useState<number | null>(null);


  // ── News banner ───────────────────────────────────────────────────────────
  interface NewsItem {
    id: number;
    title: string;
    body: string;
    link?: string;
    link_label?: string;
    emoji?: string;
    created_at: string;
    organization_ids: string[];  // UUID[] — empty [] = broadcast to all
  }
  const [newsItems, setNewsItems] = useState<NewsItem[]>([]);
  const [newsDismissed, setNewsDismissed] = useState(false);
  const [newsIndex, setNewsIndex] = useState(0);
  const [weeklyChampion, setWeeklyChampion]   = useState<WeeklyChampion | null>(null);
  const [activeChallenge, setActiveChallenge] = useState<ActiveChallenge | null>(null);

  useEffect(() => {
    const fetchOrgNews = async () => {
      try {
        let orgId: string | null = null;

        if (user?.id) {
          const { data: profileData } = await supabase
            .from('profiles')
            .select('organization_id')
            .eq('id', user.id)
            .single();
          orgId = profileData?.organization_id ?? null;
        }

        // Resolve org slug for platform_news filtering (news uses slugs, not UUIDs)
        let newsOrgSlug: string | null = null;
        if (orgId) {
          const { data: orgData } = await supabase
            .from('organizations').select('name').eq('id', orgId).single();
          const name = orgData?.name?.toLowerCase() ?? '';
          newsOrgSlug = name.includes('ibiade') ? 'ibiade' : 'oloibiri';
        }

        const { data } = await supabase
          .from('platform_news')
          .select('id,title,body,link,link_label,emoji,created_at,organization_ids')
          .eq('active', true)
          .order('created_at', { ascending: false })
          .limit(20);

        if (data) {
          const filtered = data.filter((item: any) => {
            const ids: string[] = item.organization_ids ?? [];
            return ids.length === 0 || (orgId && ids.includes(orgId));
          });
          setNewsItems(filtered as NewsItem[]);
        }

        // Fetch champion + active challenge scoped to org
        if (newsOrgSlug) {
          const [{ data: champ }, { data: challenge }] = await Promise.all([
            supabase
              .from('weekly_champions')
              .select('champion_name, winning_tier, winning_tier_label, champion_story, week_start')
              .eq('org_id', newsOrgSlug)
              .order('week_start', { ascending: false })
              .limit(1)
              .maybeSingle(),
            supabase
              .from('community_challenges')
              .select('title, description, community_impact_slug, tier_target, week_end')
              .eq('org_id', newsOrgSlug)
              .eq('active', true)
              .maybeSingle(),
          ]);
          if (champ) setWeeklyChampion(champ as WeeklyChampion);
          if (challenge) setActiveChallenge(challenge as ActiveChallenge);
        }
      } catch {
        // silent failure — banner is non-critical
      }
    };

    fetchOrgNews();
  }, [user?.id]);



  // ── Seed default personality baseline for brand-new users ───────────────
  // Extracted so it can be called from the useEffect below without being
  // recreated on every render. Silent failure — never blocks page load.
  const seedPersonalityBaseline = async (userId: string): Promise<void> => {
    try {
      const now = new Date().toISOString();
      const { error } = await supabase
        .from('user_personality_baseline')
        .insert({
          user_id:                  userId,
          openness_score:           55,
          conscientiousness_score:  50,
          extraversion_score:       50,
          agreeableness_score:      65,
          neuroticism_score:        50,
          openness_evidence:          ['No sessions recorded yet — default baseline'],
          conscientiousness_evidence: ['No sessions recorded yet — default baseline'],
          extraversion_evidence:      ['No sessions recorded yet — default baseline'],
          agreeableness_evidence:     ['No sessions recorded yet — default baseline'],
          neuroticism_evidence:       ['No sessions recorded yet — default baseline'],
          communication_strategy: {
            preferred_tone: 'warm, patient, and encouraging',
            interaction_style: 'guided step-by-step with one question at a time',
            detail_level: 'simple explanations using short sentences and familiar examples',
            recommendations: [
              'Use plain, everyday language — avoid technical jargon',
              'Ask only one question per turn',
              'Celebrate small wins and validate every attempt',
              'Connect new ideas to things familiar from daily life',
              "Re-explain terms if the learner seems unsure — do not assume prior knowledge",
            ],
          },
          learning_strategy: {
            learning_style: 'concrete and interactive with real-world examples',
            motivation_approach: 'encourage through visible progress and small celebrations',
            pacing_preference: 'slow and steady with frequent check-ins',
            recommendations: [
              'Break tasks into very small, manageable steps',
              'Confirm understanding before moving to the next idea',
              "Use examples drawn from the learner's immediate community or daily experience",
              'Provide gentle correction — frame mistakes as part of learning',
              'Offer positive reinforcement consistently throughout the session',
            ],
          },
          communication_level:  1,
          assessment_model:     'default',
          assessment_version:   'v0.0-seed',
          measured_at:          now,
          created_at:           now,
          updated_at:           now,
        });

      if (error) {
        // 23505 = unique_violation: another tab already seeded — safe to ignore
        if (error.code !== '23505') {
          console.warn('[HomePage] Could not seed personality baseline:', error.message);
        }
      } else {
        console.log('[HomePage] ✅ Default personality baseline seeded for new user');
        setCommunicationLevel(1);
      }
    } catch (err) {
      console.warn('[HomePage] seedPersonalityBaseline error:', err);
    }
  };

  // 1) Fetch the user's profile.continent and personality baseline communication_level.
  //    If no baseline row exists yet, seed one immediately.
  useEffect(() => {
    if (!user?.id) {
      setContinent(null);
      setCommunicationLevel(null);
      setLoadingContinent(false);
      return;
    }

    setLoadingContinent(true);

    Promise.all([
      supabase.from('profiles').select('continent, organization_id').eq('id', user.id).single(),
      supabase.from('user_personality_baseline').select('communication_level').eq('user_id', user.id).maybeSingle(),
    ]).then(([profileRes, baselineRes]) => {
      if (profileRes.error) console.error('Error fetching continent:', profileRes.error);
      setContinent(profileRes.data?.continent ?? null);

      const orgId = profileRes.data?.organization_id;
      if (orgId) {
        supabase.from('organizations').select('name').eq('id', orgId).single()
          .then(({ data }) => { if (data?.name) setOrgName(data.name); });
      }

      if (!baselineRes.error && baselineRes.data) {
        // Row exists — use the stored level
        setCommunicationLevel(baselineRes.data.communication_level ?? 1);
      } else if (!baselineRes.error && !baselineRes.data) {
        // No row yet — seed now (fire-and-forget) and apply level 1 immediately
        seedPersonalityBaseline(user.id);
        setCommunicationLevel(1);
      }
      // If baselineRes.error, fall through — lvl defaults to 1 via `?? 1` below
    }).finally(() => setLoadingContinent(false));
  }, [user?.id]);

  // 2) Determine theme
  const isAfrica       = branding.variant === 'vai' || branding.variant === 'oloibiri' || continent === 'Africa';
  const isNorthAmerica = continent === 'North America';

  // ── Communication-level content ───────────────────────────────────────────
  // level null  = no baseline yet (default to level 1 — Emerging)
  // level 0     = pre-literate / very basic
  // level 1     = emerging
  // level 2     = developing
  // level 3     = proficient
  const lvl = communicationLevel ?? 1;

  const content = {
    // ── Hero headline ────────────────────────────────────────────────────────
    headline1: lvl <= 1
      ? 'Learn AI. Get Your Certificate.'
      : 'Use AI. Get Certified.',
    headline2: lvl <= 1
      ? 'Show What You Can Do.'
      : 'Show the World.',

    // ── Welcome card ────────────────────────────────────────────────────────
    welcomeGreeting: lvl <= 1
      ? `Hello, {name}! 👋`
      : `Welcome back, {name}! 🎉`,
    welcomeSub: lvl <= 0
      ? "Let's start learning today."
      : lvl === 1
      ? "You are in the right place. Let's get started!"
      : "Ready to earn your next certification?",

    // ── Body paragraph ───────────────────────────────────────────────────────
    bodyAfrica: lvl <= 0 ? (
      <>
        <strong className="text-yellow-200">First — English.</strong>{' '}
        Practise speaking and listening. Your AI helper will guide you.{' '}
        <strong className="text-blue-200"> Then — AI skills.</strong>{' '}
        Learn new things with your AI coach.{' '}
        <strong className="text-green-200"> Then — your certificate.</strong>{' '}
        Show schools and employers what you can do.
      </>
    ) : lvl === 1 ? (
      <>
        <strong className="text-yellow-200">Step 1 — Build your English.</strong>{' '}
        Practise speaking and listening with your AI coach.{' '}
        <strong className="text-blue-200"> Step 2 — Learn AI.</strong>{' '}
        Try things yourself. Your coach will help you.{' '}
        <strong className="text-green-200"> Step 3 — Get your certificate.</strong>{' '}
        Show what you know to schools and employers.
      </>
    ) : lvl === 2 ? (
      <>
        <strong className="text-yellow-200">First, build your English.</strong>{' '}
        Practise speaking, listening, reading and writing with your AI language coach.{' '}
        <strong className="text-blue-200"> Then, learn AI skills</strong> through hands-on practice and personalised guidance.{' '}
        <strong className="text-green-200"> Then, get certified.</strong>{' '}
        Earn globally-recognised credentials that open doors to school, work, and community impact.
      </>
    ) : (
      <>
        <strong className="text-yellow-200">First, build your English.</strong>{' '}
        Practise speaking, listening, reading and writing with your AI language coach.{' '}
        <strong className="text-blue-200"> Then, Learn.</strong>{' '}
        Build your AI skills with hands-on practice.{' '}
        <strong className="text-green-200"> Then, Certify.</strong>{' '}
        Earn globally-recognised credentials that open doors to school, work, and community impact.
      </>
    ),

    bodyDefault: lvl <= 1 ? (
      <>
        <strong className="text-yellow-200">Step 1 — Learn.</strong>{' '}
        Build your AI skills with your coach. Go at your own pace.{' '}
        <strong className="text-green-200"> Step 2 — Get your certificate.</strong>{' '}
        Show schools and employers what you have learned.
      </>
    ) : (
      <>
        <strong className="text-yellow-200">First, Learn.</strong>{' '}
        Build your skills with AI-powered lessons and hands-on practice.{' '}
        <strong className="text-green-200"> Then, Certify.</strong>{' '}
        Prove your mastery with globally-recognized credentials{' '}
        that open doors to school, work, and community impact.
      </>
    ),

    // ── CTA buttons (top) ────────────────────────────────────────────────────
    btnEnglish:  lvl <= 1 ? 'Start English 🇬🇧'     : 'Start English Skills',
    btnLearnAI:  lvl <= 1 ? 'Start Learning AI 🤖'   : 'Start Learning AI',
    btnCertify:  lvl <= 1 ? 'Get My Certificate 🏆'  : 'Get Certified',

    // ── English step heading and description (Africa only) ───────────────────
    englishStepHeading: lvl <= 1 ? 'Step 1: Build Your English' : 'Step 1: Build Your English',
    englishStepDesc: lvl <= 0
      ? 'Talk with your AI helper. Learn new words. Go slow — that is fine. It is OK to make mistakes.'
      : lvl === 1
      ? 'Practise speaking, listening, reading and writing with your AI coach. One step at a time. Go at your own pace.'
      : 'Work with your AI English coach to develop confidence in speaking, listening, reading, and writing — all at your own pace, in your own words.',
    englishStepBtn: lvl <= 1 ? 'Go to English Skills →' : 'English Skills →',
    englishStages: lvl <= 1
      ? ['Speaking', 'Listening', 'Reading', 'Writing']
      : ['Oral Expression', 'Listening & Response', 'Reading Fluency', 'Written Communication'],

    // ── Learning step ────────────────────────────────────────────────────────
    learningStepHeading: lvl <= 1
      ? (isAfrica ? 'Step 2: Learn AI' : 'Step 1: Learn AI')
      : (isAfrica ? 'Step 2: Learn'    : 'Step 1: Learn'),
    learningStepDesc: lvl <= 0
      ? 'Learn about AI with your coach. Try things yourself. You can go slowly — that is fine.'
      : lvl === 1
      ? 'Learn AI skills with your coach. Try things yourself. Ask questions any time. Go at your own pace.'
      : 'Start with AI-powered learning modules that teach you essential skills through hands-on practice and personalized guidance.',
    btnAILearning:   lvl <= 1 ? 'AI Learning →'        : 'AI Learning →',
    btnSkillsDev:    lvl <= 1 ? 'Skills Practice →'    : 'Skills Development →',

    // ── Certify step ─────────────────────────────────────────────────────────
    certifyStepHeading: lvl <= 1
      ? (isAfrica ? 'Step 3: Get Your Certificate' : 'Step 2: Get Your Certificate')
      : (isAfrica ? 'Step 3: Get Certified'        : 'Step 2: Get Certified'),
    certifyStepDesc: lvl <= 0
      ? 'When you are ready, show what you have learned. Get your certificate. You can share it with schools and employers.'
      : lvl === 1
      ? 'When you finish learning, take a short test. If you pass, you get a certificate. You can show it to schools and employers.'
      : "Once you've learned the skills, earn globally-recognized certifications that prove your mastery to schools, employers, and communities.",
    btnAIProficiency: lvl <= 1 ? 'AI Certificate →'       : 'AI Proficiency →',
    btnAIReadySkills: lvl <= 1 ? 'Skills Certificate →'   : 'AI Ready Skills →',

    // ── Impact step ──────────────────────────────────────────────────────────
    impactStepHeading: 'Step 4: Impact Your Community',
    impactStepDesc: lvl <= 1
      ? 'Use AI to help people around you — farmers, animal raisers, fisherpeople, entrepreneurs, and community members who need healthcare triage. Your skills can change lives.'
      : 'Apply your AI skills to real community problems — supporting agriculture, health triage, local enterprise, and economic development.',
    impactStepBtn: lvl <= 1 ? 'Explore Community AI →' : 'Community Impact →',
    impactAreas: lvl <= 1
      ? ['Farming 🌾', 'Healthcare 🏥', 'Fishing 🐟', 'Business 💼']
      : ['Agriculture', 'Health Triage', 'Aquaculture', 'Entrepreneurship'],

    // ── Research step ────────────────────────────────────────────────────────
    researchStepHeading: 'Step 5: Be Part of a Research Team',
    researchStepDesc: lvl <= 1
      ? 'Join a real research project with young people from your community. Help answer important questions about learning, health, and AI — and earn a US college research certification. Your voice matters to the world.'
      : 'Join open-source, community-based, youth-led research projects and earn a US college research certification. Contribute to global knowledge on AI, learning outcomes, and community development.',
    researchStepBtn: lvl <= 1 ? 'See Research Projects →' : 'Research Projects →',
    researchAreas: lvl <= 1
      ? ['Learning 📚', 'Health 💊', 'Hope & Future 🌱', 'US College Cert 🎓']
      : ['Learning Outcomes', 'Hope & Agency', 'Community Spillover', 'US Research Certification'],

    // ── Framework footer ──────────────────────────────────────────────────────
    frameworkText: lvl <= 1
      ? '🎓 This programme is trusted by ISTE, UNESCO, and CSTA — big global organisations. Real skills for school, work, and life.'
      : '🎓 Backed by global frameworks like ISTE, UNESCO, and CSTA. Aligned to real-world skills for school, work, and community.',
  };

  const userName = (user as any)?.name ?? '';

  return (
    <div className="min-h-screen">
      <AppLayout>
        <main className="flex-1 relative overflow-x-hidden">
          {/* Static background — matches PublicLandingPage */}
          <div
            className="fixed top-14 left-0 right-0 bottom-0"
            style={{
              backgroundImage: "url('/home_page_africa.png')",
              backgroundSize: 'cover',
              backgroundPosition: 'center 30%',
              backgroundRepeat: 'no-repeat',
              zIndex: 0,
            }}
          >
            <div
              className="absolute inset-0"
              style={{ background: 'linear-gradient(180deg,rgba(8,14,6,0.25) 0%,rgba(8,14,6,0.1) 45%,rgba(8,14,6,0.72) 100%)' }}
            />
          </div>

          {/* Content */}
          <div className="relative z-10 flex flex-col justify-center items-center min-h-screen px-6 py-20 text-center">

            <div className="mb-8 flex flex-col items-center">
              {/* Platform logo — driven by useBranding */}
              {branding.logoPath ? (
                <div className="flex flex-col items-center mb-4">
                  <img
                    src={branding.logoPath}
                    alt={branding.shortName}
                    className="h-40 object-contain rounded-2xl shadow-xl"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                  />
                </div>
              ) : (
                <div className="flex items-center gap-3 mb-4">
                  <Sparkles className="h-10 w-10 text-pink-300 drop-shadow" />
                  <span className="text-3xl font-extrabold text-white drop-shadow-md tracking-tight">
                    {orgName ?? branding.shortName}
                  </span>
                </div>
              )}
              <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold bg-gradient-to-r from-pink-300 via-purple-300 to-blue-300 bg-clip-text text-transparent mb-3">
                {loadingContinent ? 'Loading…' : content.headline1}
              </h1>
              <h2 className="text-4xl md:text-5xl lg:text-6xl font-bold bg-gradient-to-r from-blue-300 via-purple-300 to-pink-300 bg-clip-text text-transparent">
                {content.headline2}
              </h2>
            </div>

            {/* ── News banner ─────────────────────────────────────────────── */}
            {!newsDismissed && newsItems.length > 0 && (
              <div className="w-full max-w-4xl mb-8 animate-fade-in">
                <div className="relative bg-gradient-to-r from-yellow-500/85 to-orange-500/85 backdrop-blur-md border border-yellow-400/50 rounded-2xl px-5 py-4 shadow-xl">
                  {/* Header row */}
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Newspaper size={16} className="text-yellow-300 flex-shrink-0" />
                      <span className="text-xs font-bold text-yellow-300 uppercase tracking-widest">What's New</span>
                      {newsItems.length > 1 && (
                        <span className="text-[10px] text-yellow-400/70 font-medium">
                          {newsIndex + 1} / {newsItems.length}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {newsItems.length > 1 && (
                        <button
                          onClick={() => setNewsIndex(i => (i + 1) % newsItems.length)}
                          className="text-yellow-400 hover:text-yellow-200 transition-colors"
                          title="Next news item"
                        >
                          <ChevronRight size={16} />
                        </button>
                      )}
                      <button
                        onClick={() => setNewsDismissed(true)}
                        className="text-yellow-400/60 hover:text-yellow-200 transition-colors"
                        title="Dismiss"
                      >
                        <XIcon size={14} />
                      </button>
                    </div>
                  </div>

                  {/* News item */}
                  {(() => {
                    const item = newsItems[newsIndex];
                    return (
                      <div className="text-left">
                        <p className="text-sm font-bold text-white mb-0.5">
                          {item.emoji && <span className="mr-1.5">{item.emoji}</span>}
                          {item.title}
                        </p>
                        <p className="text-xs text-gray-200 leading-relaxed">{item.body}</p>
                        {item.link && (
                          <a
                            href={item.link}
                            className="inline-flex items-center gap-1 mt-2 text-xs font-semibold text-yellow-300 hover:text-yellow-100 underline underline-offset-2 transition-colors"
                          >
                            {item.link_label ?? 'Learn more'} <ChevronRight size={11} />
                          </a>
                        )}
                      </div>
                    );
                  })()}
                </div>
              </div>
            )}

            {/* ── Weekly Champion Banner ── */}
            {weeklyChampion && (
              <div className="w-full max-w-4xl mb-4 animate-fade-in">
                <div className="relative bg-gradient-to-r from-amber-500/85 to-yellow-500/85 backdrop-blur-md border border-amber-400/50 rounded-2xl px-5 py-4 shadow-xl text-left">
                  <div className="flex items-start gap-3">
                    <span className="text-2xl leading-none flex-shrink-0">🏆</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-amber-300 uppercase tracking-widest mb-0.5">This Week's Community Champion</p>
                      <p className="text-sm font-bold text-white">
                        {weeklyChampion.champion_name}
                        <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-amber-400/20 border border-amber-400/40 text-amber-200 align-middle">
                          {weeklyChampion.winning_tier_label}
                        </span>
                      </p>
                      {weeklyChampion.champion_story && (
                        <p className="text-xs text-gray-300 mt-1 leading-relaxed line-clamp-2">
                          {weeklyChampion.champion_story.slice(0, 140)}{weeklyChampion.champion_story.length > 140 ? '…' : ''}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ── Active Challenge Teaser ── */}
            {activeChallenge && (
              <div className="w-full max-w-4xl mb-8 animate-fade-in">
                <div className="relative bg-gradient-to-r from-green-500/85 to-teal-500/85 backdrop-blur-md border border-green-400/45 rounded-2xl px-5 py-4 shadow-xl text-left">
                  <div className="flex items-start gap-3">
                    <span className="text-2xl leading-none flex-shrink-0">🌍</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-green-300 uppercase tracking-widest mb-0.5">Active Community Challenge</p>
                      <p className="text-sm font-bold text-white">{activeChallenge.title}</p>
                      <p className="text-xs text-gray-300 mt-1 leading-relaxed line-clamp-2">{activeChallenge.description}</p>
                      <a
                        href="/dashboard"
                        className="inline-flex items-center gap-1 mt-2 text-xs font-semibold text-green-300 hover:text-green-100 underline underline-offset-2 transition-colors"
                      >
                        Take the challenge →
                      </a>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {user && (
              <div className="inline-block bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-lg px-8 py-4 shadow-md mb-8">
                <h2 className="text-2xl md:text-3xl font-semibold">
                  {content.welcomeGreeting.replace('{name}', userName)}
                </h2>
                <p className="text-lg md:text-xl">
                  {content.welcomeSub}
                </p>
              </div>
            )}



            {/* English Skills Step — Africa only */}
            {isAfrica && (
              <div className="max-w-5xl w-full bg-gradient-to-r from-cyan-500/20 to-teal-500/20 backdrop-blur-md rounded-2xl p-8 mb-8 shadow-2xl border-2 border-cyan-400/50">
                <div className="flex items-center justify-center gap-3 mb-6">
                  <Globe2 className="h-10 w-10 text-cyan-300" />
                  <h3 className="text-3xl md:text-4xl font-bold text-white">
                    {content.englishStepHeading}
                  </h3>
                </div>
                <div className="bg-white/80 backdrop-blur-sm rounded-lg p-6 mb-4">
                  <p className="text-xl text-gray-800 text-center mb-4">
                    {content.englishStepDesc}
                  </p>
                  <div className="flex justify-center">
                    <Link to="/english-skills">
                      <button className="bg-white text-cyan-700 hover:bg-cyan-600 hover:text-white px-8 py-3 rounded-lg font-bold text-lg shadow-lg transition-all hover:scale-105">
                        {content.englishStepBtn}
                      </button>
                    </Link>
                  </div>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-2">
                  {content.englishStages.map(stage => (
                    <div key={stage} className="bg-white/80 rounded-lg px-3 py-2 text-center">
                      <p className="text-sm font-semibold text-cyan-700">{stage}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Learning Step */}
            <div className="max-w-5xl w-full bg-gradient-to-r from-blue-500/20 to-cyan-500/20 backdrop-blur-md rounded-2xl p-8 mb-8 shadow-2xl border-2 border-blue-400/50">
              <div className="flex items-center justify-center gap-3 mb-6">
                <Brain className="h-10 w-10 text-blue-300" />
                <h3 className="text-3xl md:text-4xl font-bold text-white">
                  {content.learningStepHeading}
                </h3>
              </div>
              <div className="bg-white/80 backdrop-blur-sm rounded-lg p-6 mb-4">
                <p className="text-xl text-gray-800 text-center mb-4">
                  {content.learningStepDesc}
                </p>
                <div className="flex justify-center gap-4">
                  <Link to="/learning/ai">
                    <button className="bg-white text-blue-700 hover:bg-blue-600 hover:text-white px-8 py-3 rounded-lg font-bold text-lg shadow-lg transition-all hover:scale-105">
                      {content.btnAILearning}
                    </button>
                  </Link>
                  <Link to="/learning/skills">
                    <button className="bg-white text-cyan-700 hover:bg-cyan-600 hover:text-white px-8 py-3 rounded-lg font-bold text-lg shadow-lg transition-all hover:scale-105">
                      {content.btnSkillsDev}
                    </button>
                  </Link>
                </div>
              </div>
            </div>

            {/* Certify Step */}
            <div className="max-w-5xl w-full bg-gradient-to-r from-purple-500/20 to-pink-500/20 backdrop-blur-md rounded-2xl p-8 mb-8 shadow-2xl border-2 border-purple-400/50">
              <div className="flex items-center justify-center gap-3 mb-6">
                <Award className="h-10 w-10 text-yellow-300" />
                <h3 className="text-3xl md:text-4xl font-bold text-white">
                  {content.certifyStepHeading}
                </h3>
              </div>
              <div className="bg-white/80 backdrop-blur-sm rounded-lg p-6 mb-4">
                <p className="text-xl text-gray-800 text-center mb-4">
                  {content.certifyStepDesc}
                </p>
                <div className="flex justify-center gap-4">
                  <Link to="/certifications/ai-proficiency">
                    <button className="bg-white text-purple-700 hover:bg-purple-600 hover:text-white px-8 py-3 rounded-lg font-bold text-lg shadow-lg transition-all hover:scale-105">
                      {content.btnAIProficiency}
                    </button>
                  </Link>
                  <Link to="/certifications/ai-ready-skills">
                    <button className="bg-white text-pink-700 hover:bg-pink-600 hover:text-white px-8 py-3 rounded-lg font-bold text-lg shadow-lg transition-all hover:scale-105">
                      {content.btnAIReadySkills}
                    </button>
                  </Link>
                </div>
              </div>
            </div>

            {/* Step 4: Impact Your Community — Africa only */}
            {isAfrica && (
              <div className="max-w-5xl w-full bg-gradient-to-r from-orange-500/20 to-amber-500/20 backdrop-blur-md rounded-2xl p-8 mb-8 shadow-2xl border-2 border-orange-400/50">
                <div className="flex items-center justify-center gap-3 mb-6">
                  <Sprout className="h-10 w-10 text-orange-300" />
                  <h3 className="text-3xl md:text-4xl font-bold text-white">
                    {content.impactStepHeading}
                  </h3>
                </div>
                <div className="bg-white/80 backdrop-blur-sm rounded-lg p-6 mb-4">
                  <p className="text-xl text-gray-800 text-center mb-4">
                    {content.impactStepDesc}
                  </p>
                  <div className="flex justify-center">
                    <Link to="/community-impact/ai-ambassadors">
                      <button className="bg-white text-orange-700 hover:bg-orange-600 hover:text-white px-8 py-3 rounded-lg font-bold text-lg shadow-lg transition-all hover:scale-105">
                        {content.impactStepBtn}
                      </button>
                    </Link>
                  </div>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {content.impactAreas.map((area: string) => (
                    <div key={area} className="bg-white/80 rounded-lg px-3 py-2 text-center">
                      <p className="text-sm font-semibold text-orange-700">{area}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Step 5: Research Team — Africa only */}
            {isAfrica && (
              <div className="max-w-5xl w-full bg-gradient-to-r from-pink-500/20 to-rose-500/20 backdrop-blur-md rounded-2xl p-8 mb-8 shadow-2xl border-2 border-pink-400/50">
                <div className="flex items-center justify-center gap-3 mb-6">
                  <FlaskConical className="h-10 w-10 text-pink-300" />
                  <h3 className="text-3xl md:text-4xl font-bold text-white">
                    {content.researchStepHeading}
                  </h3>
                </div>
                <div className="bg-white/80 backdrop-blur-sm rounded-lg p-6 mb-4">
                  <p className="text-xl text-gray-800 text-center mb-4">
                    {content.researchStepDesc}
                  </p>
                  <div className="flex justify-center">
                    <Link to="/research/ai-learning-lab">
                      <button className="bg-white text-pink-700 hover:bg-pink-600 hover:text-white px-8 py-3 rounded-lg font-bold text-lg shadow-lg transition-all hover:scale-105">
                        {content.researchStepBtn}
                      </button>
                    </Link>
                  </div>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {content.researchAreas.map((area: string) => (
                    <div key={area} className="bg-white/80 rounded-lg px-3 py-2 text-center">
                      <p className="text-sm font-semibold text-pink-700">{area}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Framework Section */}
            <div className="max-w-4xl w-full bg-gradient-to-r from-blue-500/85 to-purple-500/85 backdrop-blur-sm rounded-xl p-6 border border-white/30">
              <p className="text-lg md:text-xl text-white">
                {content.frameworkText.split(/(ISTE|UNESCO|CSTA)/).map((part, i) =>
                  ['ISTE', 'UNESCO', 'CSTA'].includes(part)
                    ? <strong key={i} className={part === 'ISTE' ? 'text-blue-200' : part === 'UNESCO' ? 'text-purple-200' : 'text-pink-200'}>{part}</strong>
                    : part
                )}
              </p>
            </div>
          </div>
        </main>
      </AppLayout>
    </div>
  );
};

export default HomePage;