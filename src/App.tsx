// src/App.tsx

import React, { useEffect, useMemo, lazy, Suspense } from 'react';
const EnglishSkillsPage = lazy(() => import('./pages/EnglishSkillsPage'));
const MathSkillsPage = lazy(() => import('./pages/MathSkillsPage'));
const ScienceSkillsPage = lazy(() => import('./pages/ScienceSkillsPage'));
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useLocation,
  useNavigate
} from 'react-router-dom';
import { useAuth } from './hooks/useAuth';
import { usePageTracking } from './hooks/usePageTracking';
import { setChatIdentity } from './lib/chatClient';
import { supabase } from './lib/supabaseClient';
import { ImpersonationProvider, ImpersonationBanner } from './contexts/ImpersonationContext';
import ProfileCompletionPopup from './components/profile/ProfileCompletionPopup';
import RequireAuth from './components/auth/RequireAuth';
import { AuthProvider } from './hooks/useAuth';

// Auth Pages
const LoginPage = lazy(() => import('./pages/auth/LoginPage'));
const SignupPage = lazy(() => import('./pages/auth/SignupPage'));
const ResetPasswordPage = lazy(() => import('./pages/auth/ResetPasswordPage'));
const ConfirmationPage = lazy(() => import('./pages/auth/ConfirmationPage'));
const AuthCallback = lazy(() => import('./pages/auth/AuthCallback'));
const EmailConfirmationSuccess = lazy(() => import('./pages/auth/EmailConfirmationSuccess'));

// Main Pages
const PublicLandingPage = lazy(() => import('./pages/PublicLandingPage'));
const HomePage = lazy(() => import('./pages/HomePage'));
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const AboutPage = lazy(() => import('./pages/AboutPage'));
const ProfilePage = lazy(() => import('./pages/ProfilePage'));

// Learning Pages
const AILearningPage = lazy(() => import('./pages/AILearningPage'));
const SkillsDevelopmentPage = lazy(() => import('./pages/SkillsDevelopmentPage'));

// Certification Pages
const AIProficiencyPage = lazy(() => import('./pages/AIProficiencyPage'));
const AIReadySkillsPage = lazy(() => import('./pages/AIReadySkillsPage'));
const AIPlaygroundPage = lazy(() => import('./pages/AIPlaygroundPage'));
const PlaygroundTogetherPage = lazy(() => import('./pages/PlaygroundTogetherPage'));
const SystemsThinkPage = lazy(() => import('./pages/SystemsThinkPage'));

// Tech Skills Pages
const WebDevelopmentPage = lazy(() => import('./pages/tech-skills/WebDevelopmentPage'));
const VibeCodingPage = lazy(() => import('./pages/tech-skills/VibeCodingPage'));
const CreateGamePage = lazy(() => import('./pages/tech-skills/CreateGamePage'));
const PlayGamePage = lazy(() => import('./pages/tech-skills/PlayGamePage'));
const WebsiteBuilderPage = lazy(() => import('./pages/tech-skills/WebsiteBuilderPage'));
const SiteViewerPage = lazy(() => import('./pages/SiteViewerPage'));
const FullStackDevelopmentPage = lazy(() => import('./pages/tech-skills/FullStackDevelopmentPage'));
const ImageGenerationPage = lazy(() => import('./pages/tech-skills/ImageGenerationPage'));
const VideoGenerationPage = lazy(() => import('./pages/tech-skills/VideoGenerationPage'));
const VideoStudioPage = lazy(() => import('./pages/tech-skills/VideoStudioPage'));
const DocumentStudioPage = lazy(() => import('./pages/tech-skills/DocumentStudioPage'));
const VoiceCreationPage = lazy(() => import('./pages/tech-skills/VoiceCreationPage'));
const AIContentCreationPage = lazy(() => import('./pages/AIContentCreationPage'));
const AIWorkflowDevPage = lazy(() => import('./pages/tech-skills/AIWorkflowDevPage'));
const AIForBusinessPage = lazy(() => import('./pages/tech-skills/AIForBusinessPage'));
const MicrosoftAI900Page = lazy(() => import('./pages/tech-skills/MicrosoftAI900Page'));
const MicrosoftDP900Page = lazy(() => import('./pages/tech-skills/MicrosoftDP900Page'));
const MicrosoftAB730Page = lazy(() => import('./pages/tech-skills/MicrosoftAB730Page'));
const MicrosoftGH300Page = lazy(() => import('./pages/tech-skills/MicrosoftGH300Page'));
const VibeCodingCertificationPage = lazy(() => import('./pages/tech-skills/VibeCodingCertificationPage'));
const WebDevCertificationPage = lazy(() => import('./pages/tech-skills/WebDevCertificationPage'));
const AIVideoProductionCertificationPage = lazy(() => import('./pages/tech-skills/AIVideoProductionCertificationPage'));
const AIImageCertificationPage = lazy(() => import('./pages/tech-skills/AIImageCertificationPage'));
const AIVoiceCertificationPage = lazy(() => import('./pages/tech-skills/AIVoiceCertificationPage'));
const FullStackCertificationPage = lazy(() => import('./pages/tech-skills/FullStackCertificationPage'));
const AIWorkflowDevCertificationPage = lazy(() => import('./pages/tech-skills/AIWorkflowDevCertificationPage'));
const AIForBusinessCertificationPage = lazy(() => import('./pages/tech-skills/AIForBusinessCertificationPage'));
const AIContentCreationCertificationPage = lazy(() => import('./pages/tech-skills/AIContentCreationCertificationPage'));
const TechSkillsPage = lazy(() => import('./pages/tech-skills/TechSkillsPage'));


// Legacy pages - kept for backwards compatibility
const CodeAssistantPage = lazy(() => import('./pages/CodeAssistantPage'));
const AdminStudentDashboard = lazy(() => import('./pages/admin/AdminStudentDashboard'));

// Community Impact Pages
const AIAmbassadorsPage = lazy(() => import('./pages/community-impact/AIAmbassadorsPage'));
const AIAmbassadorsCertificationPage = lazy(() => import('./pages/community-impact/AIAmbassadorsCertificationPage'));
const AgricultureConsultantPage = lazy(() => import('./pages/community-impact/AgricultureConsultantPage'));
const AgricultureConsultantCertificationPage = lazy(() => import('./pages/community-impact/AgricultureConsultantCertificationPage'));
const FishingConsultantPage = lazy(() => import('./pages/community-impact/FishingConsultantPage'));
const FishingConsultantCertificationPage = lazy(() => import('./pages/community-impact/FishingConsultantCertificationPage'));
const HealthcareNavigatorPage = lazy(() => import('./pages/community-impact/HealthcareNavigatorPage'));
const HealthcareNavigatorCertificationPage = lazy(() => import('./pages/community-impact/HealthcareNavigatorCertificationPage'));
const EntrepreneurshipConsultantPage = lazy(() => import('./pages/community-impact/EntrepreneurshipConsultantPage'));
const EntrepreneurshipConsultantCertificationPage = lazy(() => import('./pages/community-impact/EntrepreneurshipConsultantCertificationPage'));
const AnimalHusbandryPage = lazy(() => import('./pages/community-impact/AnimalHusbandryPage'));
const OfflineClinicalAssessment = lazy(() => import('./pages/community-impact/OfflineClinicalAssessment'));

// Research Pages
const ResearchAILearningLab = lazy(() => import('./pages/research/ResearchAILearningLab'));
const ResearchNewProjectPage = lazy(() => import('./pages/research/ResearchNewProjectPage'));
const IGiTREEResearchPage = lazy(() => import('./pages/research/ResearchIGiTREE'));

// Claude / Agent Builder
const CoworkPage = lazy(() => import('./pages/CoworkPage'));

// Tutorials
const TutorialsPage = lazy(() => import('./pages/tutorials/TutorialsPage'));
const FishMarketTutorialPage = lazy(() => import('./pages/tutorials/FishMarketTutorialPage'));
const AILearningStartPage = lazy(() => import('./pages/tutorials/AILearningStartPage'));
const SkillDevelopmentStartPage = lazy(() => import('./pages/tutorials/SkillDevelopmentStartPage'));
const AddNewGuidePage = lazy(() => import('./pages/tutorials/AddNewGuidePage'));
const VibeCodingGuidePage = lazy(() => import('./pages/tutorials/VibeCodingGuidePage'));
const SupabaseDatabaseGuidePage = lazy(() => import('./pages/tutorials/SupabaseDatabaseGuidePage'));
const AILearningCategoryGuidePage = lazy(() => import('./pages/tutorials/AILearningCategoryGuidePage'));
const SkillDevelopmentCategoryGuidePage = lazy(() => import('./pages/tutorials/SkillDevelopmentCategoryGuidePage'));
const FoundationsCategoryGuidePage = lazy(() => import('./pages/tutorials/FoundationsCategoryGuidePage'));
const CreativeAICategoryGuidePage = lazy(() => import('./pages/tutorials/CreativeAICategoryGuidePage'));
const CreateGameGuidePage = lazy(() => import('./pages/tutorials/CreateGameGuidePage'));
const AIContentCreationGuidePage = lazy(() => import('./pages/tutorials/AIContentCreationGuidePage'));

// Shown briefly while a lazy-loaded route's chunk downloads. Matches the
// full-page auth-loading spinner's style above for visual consistency.
const RouteLoadingFallback: React.FC = () => (
  <div className="min-h-screen flex items-center justify-center bg-gray-50">
    <div className="text-center">
      <div className="animate-spin rounded-full h-12 w-12
                      border-t-2 border-b-2 border-blue-500
                      mx-auto mb-4"></div>
      <p className="text-gray-600">Loading...</p>
    </div>
  </div>
);

export const AppContent: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const {
    user,
    session,
    loading,
    needsProfileCompletion,
    markProfileCompleted
  } = useAuth();

  // ─── Page tracking ────────────────────────────────────────────────────────
  usePageTracking(user?.id ?? null, user?.user_metadata?.cohort ?? null);

  // location changes are now handled by usePageTracking

  const showPopup = useMemo(
    () =>
      session !== null &&
      user !== null &&
      needsProfileCompletion === true,
    [session, user, needsProfileCompletion]
  );

  useEffect(() => {
    console.log('[AppContent] auth state →', {
      loading,
      hasSession: !!session,
      hasUser: !!user,
      needsProfileCompletion,
      userEmail: user?.email,
      showPopup
    });
  }, [loading, session, user, needsProfileCompletion, showPopup]);

  // Set chat identity for cost attribution — fires once when user logs in
  useEffect(() => {
    if (!user?.id) {
      setChatIdentity(null, null);
      return;
    }
    supabase
      .from('profiles')
      .select('city')
      .eq('id', user.id)
      .single()
      .then(({ data }) => {
        setChatIdentity(user.id, data?.city ?? null);
      })
      .catch(() => {
        setChatIdentity(user.id, null);
      });
  }, [user?.id]);

  const handleProfileCompletion = async () => {
    // Called by ProfileCompletionPopup's onComplete — which fires AFTER
    // the user clicks "Got it" on the join-code modal (for leaders) or
    // immediately after profile save (for learners).
    // markProfileCompleted no longer awaits refreshUserProfile, so the
    // popup is never unmounted prematurely by a re-render.
    console.log('[AppContent] profile completion triggered');
    if (user?.id) {
      try {
        await markProfileCompleted(user.id);
        console.log('[AppContent] profile marked as completed, navigating to /dashboard');
        navigate('/dashboard', { replace: true });
      } catch (error) {
        console.error('[AppContent] error in profile completion:', error);
      }
    }
  };

  if (loading) {
    console.log('[AppContent] loading, showing spinner');
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12
                          border-t-2 border-b-2 border-blue-500
                          mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <Suspense fallback={<RouteLoadingFallback />}>
      <Routes>
        {/* Auth Routes */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />
        <Route path="/auth/reset-password" element={<ResetPasswordPage />} />
        <Route path="/auth/confirmation" element={<ConfirmationPage />} />
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route path="/auth/confirmation-success" element={<EmailConfirmationSuccess />} />

        {/* Everything below requires sign-in. Anonymous visitors only ever
            see the Auth Routes above and the Public Landing Page / catch-all
            below — this single gate keeps that true even for pages that
            don't render AppLayout themselves. */}
        <Route element={<RequireAuth />}>

        {/* Main App Routes */}
        <Route path="/home" element={<HomePage />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/about" element={<AboutPage />} />
        <Route path="/profile" element={<ProfilePage />} />

        {/* Learning Routes */}
        <Route path="/english-skills" element={<EnglishSkillsPage />} />
        <Route path="/math-skills" element={<MathSkillsPage />} />
        <Route path="/science-skills" element={<ScienceSkillsPage />} />
        <Route path="/learning/ai" element={<AILearningPage />} />
        <Route path="/learning/skills" element={<SkillsDevelopmentPage />} />

        {/* Certification Routes */}
        <Route path="/certifications/ai-proficiency" element={<AIProficiencyPage />} />
        <Route path="/certifications/ai-ready-skills" element={<AIReadySkillsPage />} />
        <Route path="/certifications/vibe-coding" element={<VibeCodingCertificationPage />} />
        <Route path="/certifications/web-dev-certification" element={<WebDevCertificationPage />} />
        <Route path="/certifications/full-stack-certification" element={<FullStackCertificationPage />} />
        <Route path="/certifications/ai-video-production" element={<AIVideoProductionCertificationPage />} />
        <Route path="/certifications/ai-image-creation-cert" element={<AIImageCertificationPage />} />
        <Route path="/certifications/ai-voice-creation" element={<AIVoiceCertificationPage />} />
        <Route path="/certifications/ai-content-creation" element={<AIContentCreationCertificationPage />} />
        <Route path="/certifications/ai-workflow-dev" element={<AIWorkflowDevCertificationPage />} />
        <Route path="/certifications/ai-for-business" element={<AIForBusinessCertificationPage />} />
        <Route path="/playground" element={<AIPlaygroundPage />} />
        <Route path="/playground/together" element={<PlaygroundTogetherPage />} />
        <Route path="/systems-think" element={<SystemsThinkPage />} />

        {/* Tech Skills Routes */}
        <Route path="/tech-skills/vibe-coding" element={<VibeCodingPage />} />
        <Route path="/tech-skills/create-game" element={<CreateGamePage />} />
        <Route path="/tech-skills/games/:gameId" element={<PlayGamePage />} />
        <Route path="/tech-skills/website-builder" element={<WebsiteBuilderPage />} />
        <Route path="/tech-skills/sites/:siteId/:slug" element={<SiteViewerPage />} />
        <Route path="/tech-skills/web-development" element={<WebDevelopmentPage />} />
        <Route path="/tech-skills/full-stack-development" element={<FullStackDevelopmentPage />} />
        <Route path="/tech-skills/ai-image-creation" element={<ImageGenerationPage />} />
        <Route path="/tech-skills/ai-voice-creation" element={<VoiceCreationPage />} />
        <Route path="/tech-skills/ai-video-creation" element={<VideoGenerationPage />} />
        <Route path="/tech-skills/ai-video-studio" element={<VideoStudioPage />} />
        <Route path="/tech-skills/document-studio" element={<DocumentStudioPage />} />
        <Route path="/tech-skills/ai-content-creation" element={<AIContentCreationPage />} />
        <Route path="/tech-skills/ai-workflow-development" element={<AIWorkflowDevPage />} />
        <Route path="/tech-skills/ai-for-business" element={<AIForBusinessPage />} />
        <Route path="/tech-skills/microsoft-ai900" element={<MicrosoftAI900Page />} />
        <Route path="/tech-skills/microsoft-dp900" element={<MicrosoftDP900Page />} />
        <Route path="/tech-skills/microsoft-ab730" element={<MicrosoftAB730Page />} />
        <Route path="/tech-skills/github-gh300" element={<MicrosoftGH300Page />} />
        <Route path="/tech-skills" element={<TechSkillsPage />} />

        {/* Community Impact Routes */}
        <Route path="/community-impact/ai-ambassadors" element={<AIAmbassadorsPage />} />
        <Route path="/community-impact/ai-ambassadors/certification" element={<AIAmbassadorsCertificationPage />} />
        <Route path="/community-impact/agriculture" element={<AgricultureConsultantPage />} />
        <Route path="/community-impact/agriculture/certification" element={<AgricultureConsultantCertificationPage />} />
        <Route path="/community-impact/fishing" element={<FishingConsultantPage />} />
        <Route path="/community-impact/fishing/certification" element={<FishingConsultantCertificationPage />} />
        <Route path="/community-impact/healthcare" element={<HealthcareNavigatorPage />} />
        <Route path="/community-impact/healthcare/certification" element={<HealthcareNavigatorCertificationPage />} />
        <Route path="/community-impact/entrepreneurship" element={<EntrepreneurshipConsultantPage />} />
        <Route path="/community-impact/entrepreneurship/certification" element={<EntrepreneurshipConsultantCertificationPage />} />
        <Route path="/community-impact/animal-husbandry" element={<AnimalHusbandryPage />} />
        <Route path="/community-impact/healthcare-offline" element={<OfflineClinicalAssessment />} />

        {/* Research Routes */}
        <Route path="/research/ai-learning-lab" element={<ResearchAILearningLab />} />
        <Route path="/research/new" element={<ResearchNewProjectPage />} />
        <Route path="/research/igitree" element={<IGiTREEResearchPage />} />

        {/* Claude / Agent Builder */}
        <Route path="/claude/agents" element={<CoworkPage />} />

        {/* Tutorials */}
        <Route path="/tutorials" element={<TutorialsPage />} />
        <Route path="/tutorials/ai-learning-start" element={<AILearningStartPage />} />
        <Route path="/tutorials/skill-development-start" element={<SkillDevelopmentStartPage />} />
        <Route path="/tutorials/add-new-guide" element={<AddNewGuidePage />} />
        <Route path="/tutorials/vibe-coding" element={<VibeCodingGuidePage />} />
        <Route path="/tutorials/supabase-database" element={<SupabaseDatabaseGuidePage />} />
        <Route path="/tutorials/ai-learning/:categoryId" element={<AILearningCategoryGuidePage />} />
        <Route path="/tutorials/skill-development/:categoryId" element={<SkillDevelopmentCategoryGuidePage />} />
        <Route path="/tutorials/foundations/:categoryId" element={<FoundationsCategoryGuidePage />} />
        <Route path="/tutorials/creative-ai/:categoryId" element={<CreativeAICategoryGuidePage />} />
        <Route path="/tutorials/create-game" element={<CreateGameGuidePage />} />
        <Route path="/tutorials/ai-content-creation" element={<AIContentCreationGuidePage />} />
        <Route path="/tutorials/fish-market" element={<FishMarketTutorialPage />} />

        {/* Legacy Route Redirects */}
        <Route path="/ai-proficiency" element={<Navigate to="/certifications/ai-proficiency" replace />} />
        <Route path="/ai-ready-skills" element={<Navigate to="/certifications/ai-ready-skills" replace />} />
        <Route path="/skills" element={<Navigate to="/learning/skills" replace />} />
        <Route path="/ai-learning" element={<Navigate to="/learning/ai" replace />} />
        <Route path="/tutor-ai" element={<Navigate to="/learning/ai" replace />} />
        <Route path="/code-assistant" element={<CodeAssistantPage />} />
        <Route path="/create" element={<Navigate to="/learning/skills" replace />} />
        <Route path="/teams" element={<Navigate to="/dashboard" replace />} />
        <Route path="/team/:teamId" element={<Navigate to="/dashboard" replace />} />
        <Route path="/projects" element={<Navigate to="/dashboard" replace />} />
        <Route path="/projects/new" element={<Navigate to="/dashboard" replace />} />

        {/* Admin */}
        <Route path="/admin" element={<DashboardPage />} />
        <Route path="/admin/analytics" element={<DashboardPage />} />
        <Route path="/admin/teams/new" element={<DashboardPage />} />
        <Route path="/admin/projects" element={<DashboardPage />} />
        <Route path="/admin/education" element={<DashboardPage />} />
        <Route path="/admin/student-dashboard" element={<AdminStudentDashboard />} />
        <Route path="/teacher-dashboard" element={<Navigate to="/admin/student-dashboard" replace />} />

        </Route>

        {/* Fallback */}
        <Route path="/" element={<PublicLandingPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      </Suspense>

      {showPopup && (
        <ProfileCompletionPopup
          userId={user!.id}
          email={user!.email}
          onComplete={handleProfileCompletion}
        />
      )}
    </>
  );
};

function App() {
  useEffect(() => {
    if (import.meta.env.DEV) {
      document.title = 'AI-ing and Vibing [DEV]';
    }
  }, []);

  return (
    <AuthProvider>
      <ImpersonationProvider>
        <BrowserRouter>
          <ImpersonationBanner />
          <AppContent />
        </BrowserRouter>
      </ImpersonationProvider>
    </AuthProvider>
  );
}

export default App;