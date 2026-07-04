// src/App.tsx

import React, { useEffect, useMemo } from 'react';
import EnglishSkillsPage from './pages/EnglishSkillsPage';
import MathSkillsPage from './pages/MathSkillsPage';
import ScienceSkillsPage from './pages/ScienceSkillsPage';
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
import { AuthProvider } from './hooks/useAuth';

// Auth Pages
import LoginPage from './pages/auth/LoginPage';
import SignupPage from './pages/auth/SignupPage';
import ResetPasswordPage from './pages/auth/ResetPasswordPage';
import ConfirmationPage from './pages/auth/ConfirmationPage';
import AuthCallback from './pages/auth/AuthCallback';
import EmailConfirmationSuccess from './pages/auth/EmailConfirmationSuccess';

// Main Pages
import PublicLandingPage from './pages/PublicLandingPage';
import HomePage from './pages/HomePage';
import DashboardPage from './pages/DashboardPage';
import AboutPage from './pages/AboutPage';
import ProfilePage from './pages/ProfilePage';

// Learning Pages
import AILearningPage from './pages/AILearningPage';
import SkillsDevelopmentPage from './pages/SkillsDevelopmentPage';

// Certification Pages
import AIProficiencyPage from './pages/AIProficiencyPage';
import AIReadySkillsPage from './pages/AIReadySkillsPage';
import AIPlaygroundPage from './pages/AIPlaygroundPage';

// Tech Skills Pages
import WebDevelopmentPage from './pages/tech-skills/WebDevelopmentPage';
import VibeCodingPage from './pages/tech-skills/VibeCodingPage';
import FullStackDevelopmentPage from './pages/tech-skills/FullStackDevelopmentPage';
import ImageGenerationPage from './pages/tech-skills/ImageGenerationPage';
import VideoGenerationPage from './pages/tech-skills/VideoGenerationPage';
import VideoStudioPage from './pages/tech-skills/VideoStudioPage';
import VoiceCreationPage from './pages/tech-skills/VoiceCreationPage';
import AIContentCreationPage from './pages/AIContentCreationPage';
import AIWorkflowDevPage from './pages/tech-skills/AIWorkflowDevPage';
import AIForBusinessPage from './pages/tech-skills/AIForBusinessPage';
import MicrosoftAI900Page from './pages/tech-skills/MicrosoftAI900Page';
import MicrosoftAB730Page from './pages/tech-skills/MicrosoftAB730Page';
import MicrosoftGH300Page from './pages/tech-skills/MicrosoftGH300Page';
import VibeCodingCertificationPage from './pages/tech-skills/VibeCodingCertificationPage';
import WebDevCertificationPage from './pages/tech-skills/WebDevCertificationPage';
import AIVideoProductionCertificationPage from './pages/tech-skills/AIVideoProductionCertificationPage';
import AIImageCertificationPage from './pages/tech-skills/AIImageCertificationPage';
import AIVoiceCertificationPage from './pages/tech-skills/AIVoiceCertificationPage';
import FullStackCertificationPage from './pages/tech-skills/FullStackCertificationPage';
import AIWorkflowDevCertificationPage from './pages/tech-skills/AIWorkflowDevCertificationPage';
import AIForBusinessCertificationPage from './pages/tech-skills/AIForBusinessCertificationPage';
import AIContentCreationCertificationPage from './pages/tech-skills/AIContentCreationCertificationPage';
import TechSkillsPage from './pages/tech-skills/TechSkillsPage';


// Legacy pages - kept for backwards compatibility
import CodeAssistantPage from './pages/CodeAssistantPage';
import AdminStudentDashboard from './pages/admin/AdminStudentDashboard';

// Community Impact Pages
import AIAmbassadorsPage from './pages/community-impact/AIAmbassadorsPage';
import AIAmbassadorsCertificationPage from './pages/community-impact/AIAmbassadorsCertificationPage';
import AgricultureConsultantPage from './pages/community-impact/AgricultureConsultantPage';
import AgricultureConsultantCertificationPage from './pages/community-impact/AgricultureConsultantCertificationPage';
import FishingConsultantPage from './pages/community-impact/FishingConsultantPage';
import FishingConsultantCertificationPage from './pages/community-impact/FishingConsultantCertificationPage';
import HealthcareNavigatorPage from './pages/community-impact/HealthcareNavigatorPage';
import HealthcareNavigatorCertificationPage from './pages/community-impact/HealthcareNavigatorCertificationPage';
import EntrepreneurshipConsultantPage from './pages/community-impact/EntrepreneurshipConsultantPage';
import EntrepreneurshipConsultantCertificationPage from './pages/community-impact/EntrepreneurshipConsultantCertificationPage';
import AnimalHusbandryPage from './pages/community-impact/AnimalHusbandryPage';
import OfflineClinicalAssessment from './pages/community-impact/OfflineClinicalAssessment';

// Research Pages
import ResearchAILearningLab from './pages/research/ResearchAILearningLab';
import ResearchNewProjectPage from './pages/research/ResearchNewProjectPage';
import IGiTREEResearchPage from './pages/research/ResearchIGiTREE';

// Claude / Agent Builder
import CoworkPage from './pages/CoworkPage';

const AppContent: React.FC = () => {
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
      <Routes>
        {/* Auth Routes */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />
        <Route path="/auth/reset-password" element={<ResetPasswordPage />} />
        <Route path="/auth/confirmation" element={<ConfirmationPage />} />
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route path="/auth/confirmation-success" element={<EmailConfirmationSuccess />} />

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

        {/* Tech Skills Routes */}
        <Route path="/tech-skills/vibe-coding" element={<VibeCodingPage />} />
        <Route path="/tech-skills/web-development" element={<WebDevelopmentPage />} />
        <Route path="/tech-skills/full-stack-development" element={<FullStackDevelopmentPage />} />
        <Route path="/tech-skills/ai-image-creation" element={<ImageGenerationPage />} />
        <Route path="/tech-skills/ai-voice-creation" element={<VoiceCreationPage />} />
        <Route path="/tech-skills/ai-video-creation" element={<VideoGenerationPage />} />
        <Route path="/tech-skills/ai-video-studio" element={<VideoStudioPage />} />
        <Route path="/tech-skills/ai-content-creation" element={<AIContentCreationPage />} />
        <Route path="/tech-skills/ai-workflow-development" element={<AIWorkflowDevPage />} />
        <Route path="/tech-skills/ai-for-business" element={<AIForBusinessPage />} />
        <Route path="/tech-skills/microsoft-ai900" element={<MicrosoftAI900Page />} />
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

        {/* Fallback */}
        <Route path="/" element={<PublicLandingPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>

      {/* Profile Completion Popup — DISABLED FOR DEVELOPMENT */}
      {/* {showPopup && (
        <ProfileCompletionPopup
          userId={user!.id}
          email={user!.email}
          onComplete={handleProfileCompletion}
        />
      )} */}
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