import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import AppLayout from '../components/layout/AppLayout';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import { 
  User, 
  Mail, 
  Shield, 
  Users, 
  Award, 
  Edit3, 
  Save, 
  X,
  Camera,
  Key,
  TrendingUp,
  Calendar,
  CheckCircle,
  Globe,
  MapPin
} from 'lucide-react';
import classNames from 'classnames';
import { useAuth } from '../hooks/useAuth';

// Grade level scale used platform-wide: 1=Elementary, 2=Middle School, 3=High School, 4=Adult Learner (18+)
const GRADE_LEVEL_LABELS = {
  '1': { name: 'Elementary (Grades 3–5)', ages: 'Ages 8–11' },
  '2': { name: 'Middle School (Grades 6–8)', ages: 'Ages 11–14' },
  '3': { name: 'High School (Grades 9–12)', ages: 'Ages 14–18' },
  '4': { name: 'Adult Learner (18+)', ages: 'Ages 18+' },
} as const;

interface UserProfile {
  id: string;
  name: string;
  email: string;
  role: 'student' | 'teacher' | 'platform_administrator' | 'site_leader' | 'research_lead';
  grade_level?: number;
  gender?: 'female' | 'male' | 'other';
  continent?: string;
  country?: string;
  state?: string;
  city?: string;
  school_name?: string;
  avatar_url?: string;
  team_id?: string;
  organization_id?: string;
  join_code_used?: string;
  is_primary_leader?: boolean;
  created_at: string;
  updated_at: string;
}

interface OrgInfo {
  id: string;
  name: string;
  join_code: string;       // legacy single code — still present
  join_codes: string[];    // array of all active codes
  continent: string | null;
  country: string | null;
  city: string | null;
  description: string | null;
  learner_count?: number;
}

interface SkillProgress {
  skill: string;
  progress: number;
  updated_at: string;
}

interface TeamInfo {
  id: string;
  name: string;
  facilitator: {
    name: string;
    email: string;
  };
}

// Continents (requested list)
const CONTINENTS = [
  'Africa',
  'Asia',
  'Australia',
  'North America',
  'South America',
];

// Countries grouped by continent
const COUNTRIES_BY_CONTINENT: Record<string, string[]> = {
  Africa: [
    'Algeria','Angola','Benin','Botswana','Burkina Faso','Burundi','Cabo Verde',
    'Cameroon','Central African Republic','Chad','Comoros','Congo',
    'Democratic Republic of the Congo','Djibouti','Egypt','Equatorial Guinea',
    'Eritrea','Eswatini','Ethiopia','Gabon','Gambia','Ghana','Guinea',
    'Guinea-Bissau','Ivory Coast','Kenya','Lesotho','Liberia','Libya',
    'Madagascar','Malawi','Mali','Mauritania','Mauritius','Morocco',
    'Mozambique','Namibia','Niger','Nigeria','Rwanda','Senegal','Seychelles',
    'Sierra Leone','Somalia','South Africa','South Sudan','Sudan','Tanzania',
    'Togo','Tunisia','Uganda','Zambia','Zimbabwe',
  ],
  Asia: [
    'Afghanistan','Armenia','Azerbaijan','Bahrain','Bangladesh','Bhutan',
    'Brunei','Cambodia','China','Cyprus','Georgia','India','Indonesia',
    'Iran','Iraq','Israel','Japan','Jordan','Kazakhstan','Kuwait',
    'Kyrgyzstan','Laos','Lebanon','Malaysia','Maldives','Mongolia','Myanmar',
    'Nepal','North Korea','Oman','Pakistan','Philippines','Qatar',
    'Saudi Arabia','Singapore','South Korea','Sri Lanka','Syria','Taiwan',
    'Tajikistan','Thailand','Timor-Leste','Turkey','Turkmenistan',
    'United Arab Emirates','Uzbekistan','Vietnam','Yemen',
  ],
  Australia: [
    'Australia','Fiji','Kiribati','Marshall Islands','Micronesia','Nauru',
    'New Zealand','Palau','Papua New Guinea','Samoa','Solomon Islands',
    'Tonga','Tuvalu','Vanuatu',
  ],
  'North America': [
    'Antigua and Barbuda','Bahamas','Barbados','Belize','Canada','Costa Rica',
    'Cuba','Dominica','Dominican Republic','El Salvador','Grenada','Guatemala',
    'Haiti','Honduras','Jamaica','Mexico','Nicaragua','Panama',
    'Saint Kitts and Nevis','Saint Lucia','Saint Vincent and the Grenadines',
    'Trinidad and Tobago','United States',
  ],
  'South America': [
    'Argentina','Bolivia','Brazil','Chile','Colombia','Ecuador','Guyana',
    'Paraguay','Peru','Suriname','Uruguay','Venezuela',
  ],
};

// City dropdown options by continent (null = free-text only)
const CITY_OPTIONS: Record<string, string[]> = {
  Africa:        ['Oloibiri area', 'Other'],
  'North America': ['Cincinnati', 'Dayton', 'Other'],
};

// School/organization dropdown for African users
const AFRICA_SCHOOL_OPTIONS = ['Davidson AI Innovation Lab', 'Other'];

// All 36 Nigerian states + FCT
const NIGERIA_STATES = [
  'Abia', 'Adamawa', 'Akwa Ibom', 'Anambra', 'Bauchi', 'Bayelsa',
  'Benue', 'Borno', 'Cross River', 'Delta', 'Ebonyi', 'Edo',
  'Ekiti', 'Enugu', 'FCT (Abuja)', 'Gombe', 'Imo', 'Jigawa',
  'Kaduna', 'Kano', 'Katsina', 'Kebbi', 'Kogi', 'Kwara',
  'Lagos', 'Nasarawa', 'Niger', 'Ogun', 'Ondo', 'Osun',
  'Oyo', 'Plateau', 'Rivers', 'Sokoto', 'Taraba', 'Yobe', 'Zamfara',
];

// Auto-populate city_town for known Nigerian states
const NIGERIA_STATE_CITY_MAP: Record<string, string> = {
  'Ogun':    'Ibiade',
  'Bayelsa': 'Oloibiri',
};

const ProfilePage: React.FC = () => {
  const { user: authUser, refreshUserProfile } = useAuth();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [teamInfo, setTeamInfo] = useState<TeamInfo | null>(null);
  const [orgInfo,  setOrgInfo]  = useState<OrgInfo | null>(null);
  const [savedJoinCode, setSavedJoinCode] = useState<string | null>(null);
  const [generatingCode, setGeneratingCode] = useState(false);
  const [orgStudents, setOrgStudents]     = useState<{ id: string; name: string; email: string; join_code_used: string | null; created_at: string }[]>([]);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [skillsProgress, setSkillsProgress] = useState<SkillProgress[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cityChoice, setCityChoice] = useState(''); // tracks dropdown selection for smart city field
  const [schoolChoice, setSchoolChoice] = useState(''); // tracks dropdown selection for smart school field
  const [success, setSuccess] = useState<string | null>(null);
  
  // Form state - updated to include all profile fields
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    role: 'student' as 'student' | 'teacher' | 'platform_administrator' | 'site_leader' | 'research_lead',
    grade_level: '1',
    gender: 'female' as 'female' | 'male' | 'other',
    continent: '',
    country: '',
    state: '',
    city: '',
    school_name: ''
  });

  // ── Seed a default personality baseline for new users ─────────────────────
  // Called once after profile load. Uses .maybeSingle() so it never throws
  // on a missing row. The row is only inserted if one doesn't already exist.
  //
  // Values are set to level-1 (Emerging) defaults:
  //   • Big Five scores at low-mid range (reflecting an unknown baseline)
  //   • communication_strategy  — warm, simple, patient  (level 1)
  //   • learning_strategy       — step-by-step, concrete, encouraging
  //   • communication_level     — 1 (Emerging)
  //
  const seedPersonalityBaseline = async (userId: string): Promise<void> => {
    try {
      // Check for an existing row first — never overwrite a real assessment
      const { data: existing } = await supabase
        .from('user_personality_baseline')
        .select('user_id')
        .eq('user_id', userId)
        .maybeSingle();

      if (existing) return; // Already assessed — nothing to do

      const now = new Date().toISOString();

      const { error } = await supabase
        .from('user_personality_baseline')
        .insert({
          user_id: userId,

          // ── Big Five: conservative mid-low defaults ──────────────────────
          // These will be updated after real sessions are assessed.
          openness_score:           55,
          conscientiousness_score:  50,
          extraversion_score:       50,
          agreeableness_score:      65,
          neuroticism_score:        50,

          // ── Evidence arrays: placeholder until real sessions are assessed ─
          openness_evidence:           ['No sessions recorded yet — default baseline'],
          conscientiousness_evidence:  ['No sessions recorded yet — default baseline'],
          extraversion_evidence:       ['No sessions recorded yet — default baseline'],
          agreeableness_evidence:      ['No sessions recorded yet — default baseline'],
          neuroticism_evidence:        ['No sessions recorded yet — default baseline'],

          // ── Communication strategy — Level 1 (Emerging) ─────────────────
          // Short sentences, simple vocabulary, patient and warm.
          communication_strategy: {
            preferred_tone: 'warm, patient, and encouraging',
            interaction_style: 'guided step-by-step with one question at a time',
            detail_level: 'simple explanations using short sentences and familiar examples',
            recommendations: [
              'Use plain, everyday language — avoid technical jargon',
              'Ask only one question per turn',
              'Celebrate small wins and validate every attempt',
              'Connect new ideas to things familiar from daily life',
              'Re-explain terms if the learner seems unsure — do not assume prior knowledge',
            ],
          },

          // ── Learning strategy — general level-1 defaults ─────────────────
          learning_strategy: {
            learning_style: 'concrete and interactive with real-world examples',
            motivation_approach: 'encourage through visible progress and small celebrations',
            pacing_preference: 'slow and steady with frequent check-ins',
            recommendations: [
              'Break tasks into very small, manageable steps',
              'Confirm understanding before moving to the next idea',
              'Use examples drawn from the learner\'s immediate community or daily experience',
              'Provide gentle correction — frame mistakes as part of learning',
              'Offer positive reinforcement consistently throughout the session',
            ],
          },

          // ── Communication level ───────────────────────────────────────────
          communication_level: 1,

          // ── Metadata ─────────────────────────────────────────────────────
          assessment_model: 'default',
          assessment_version: 'v0.0-seed',
          measured_at: now,
          created_at: now,
          updated_at: now,
        });

      if (error) {
        console.warn('[ProfilePage] Could not seed personality baseline:', error.message);
      } else {
        console.log('[ProfilePage] ✅ Default personality baseline seeded for new user');
      }
    } catch (err) {
      // Non-fatal — the rest of the page should still load
      console.warn('[ProfilePage] seedPersonalityBaseline skipped:', err);
    }
  };

  const fetchProfileData = useCallback(async () => {
    if (!authUser) return;

    try {
      setLoading(true);
      setError(null);

      console.log('[ProfilePage] Fetching profile data for user:', authUser.id);

      // Fetch user profile
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', authUser.id)
        .single();

      if (profileError) {
        console.error('[ProfilePage] Profile fetch error:', profileError);
        throw profileError;
      }
      
      console.log('[ProfilePage] Profile data fetched:', profileData);
      setProfile(profileData);
      setFormData({
        name: profileData.name || '',
        email: profileData.email || '',
        role: profileData.role || 'student',
        grade_level: profileData.grade_level?.toString() || '1',
        gender: profileData.gender || 'female',
        continent: profileData.continent || '',
        country: profileData.country || '',
        state: profileData.state || '',
        city: profileData.city || '',
        school_name: profileData.school_name || ''
      });

      // Initialise cityChoice dropdown from saved city value
      const c = profileData.continent || '';
      const savedCity = profileData.city || '';
      const opts = CITY_OPTIONS[c] ?? [];
      if (opts.length > 0) {
        const namedOption = opts.find(o => o !== 'Other' && o.toLowerCase().replace(' area','') === savedCity.toLowerCase().replace(' area',''));
        setCityChoice(namedOption ? namedOption : savedCity ? 'Other' : '');
      } else {
        setCityChoice('');
      }

      // Initialise schoolChoice dropdown from saved school value (Africa only)
      const savedSchool = profileData.school_name || '';
      if (c === 'Africa') {
        const namedSchool = AFRICA_SCHOOL_OPTIONS.find(o => o !== 'Other' && o === savedSchool);
        setSchoolChoice(namedSchool ? namedSchool : savedSchool ? 'Other' : '');
      } else {
        setSchoolChoice('');
      }

      // Seed a default personality baseline for new users (no-op if already exists)
      seedPersonalityBaseline(authUser.id);

      // Fetch team info if user has a team
      if (profileData.team_id) {
        console.log('[ProfilePage] Fetching team info for team:', profileData.team_id);
        const { data: teamData, error: teamError } = await supabase
          .from('teams')
          .select(`
            id,
            name,
            facilitator:profiles!teams_facilitator_id_fkey(
              name,
              email
            )
          `)
          .eq('id', profileData.team_id)
          .single();

        if (teamError) {
          console.warn('[ProfilePage] Team fetch error:', teamError);
        } else {
          console.log('[ProfilePage] Team data fetched:', teamData);
          setTeamInfo(teamData);
        }
      }

      // Fetch org info — or check localStorage for newly created org code
      const savedCode = localStorage.getItem('my_org_join_code');
      if (savedCode) setSavedJoinCode(savedCode);

      if (profileData.organization_id) {
        const { data: orgData } = await supabase
          .from('organizations')
          .select('id, name, join_code, join_codes, continent, country, city, description')
          .eq('id', profileData.organization_id)
          .single();
        if (orgData) {
          // Normalise: if join_codes is empty/null, fall back to [join_code]
          const codes: string[] =
            Array.isArray(orgData.join_codes) && orgData.join_codes.length > 0
              ? orgData.join_codes
              : orgData.join_code ? [orgData.join_code] : [];

          // Learner count
          const { count } = await supabase
            .from('profiles')
            .select('id', { count: 'exact', head: true })
            .eq('organization_id', profileData.organization_id)
            .not('role', 'in', '("site_leader","platform_administrator","research_lead")');

          setOrgInfo({ ...orgData, join_codes: codes, learner_count: count ?? 0 });

          // For leaders — fetch the student list scoped by their role
          if (['site_leader', 'platform_administrator', 'research_lead'].includes(profileData.role)) {
            setLoadingStudents(true);
            let studentQuery = supabase
              .from('profiles')
              .select('id, name, email, join_code_used, created_at')
              .not('role', 'in', '("site_leader","platform_administrator","research_lead")')
              .order('created_at', { ascending: false });

            if (profileData.is_primary_leader) {
              // Primary leader sees ALL learners in their org
              studentQuery = studentQuery.eq('organization_id', profileData.organization_id);
            } else {
              // Co-leader sees only learners who used the same code they joined with
              studentQuery = studentQuery.eq('join_code_used', profileData.join_code_used ?? '');
            }

            const { data: students } = await studentQuery;
            setOrgStudents(students ?? []);
            setLoadingStudents(false);
          }
        }
      }

      // Fetch skills progress
      const { data: skillsData, error: skillsError } = await supabase
        .from('skills_progress')
        .select('*')
        .eq('user_id', authUser.id)
        .order('updated_at', { ascending: false });

      if (skillsError) {
        console.warn('[ProfilePage] Skills fetch error:', skillsError);
      } else {
        console.log('[ProfilePage] Skills data fetched:', skillsData?.length || 0, 'skills');
        setSkillsProgress(skillsData || []);
      }

    } catch (err) {
      console.error('[ProfilePage] Error fetching profile data:', err);
      setError(err instanceof Error ? err.message : 'Failed to load profile data');
    } finally {
      setLoading(false);
    }
  }, [authUser]);

  useEffect(() => {
    if (authUser) {
      fetchProfileData();
    }
  }, [authUser, fetchProfileData]);

  // Updated handleSaveProfile to include location fields
  const handleSaveProfile = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    console.log('[ProfilePage] handleSaveProfile called');
    
    if (!authUser || !profile) {
      console.error('[ProfilePage] Missing authUser or profile');
      setError('User information not available');
      return;
    }

    try {
      setSaving(true);
      setError(null);
      setSuccess(null);

      console.log('[ProfilePage] Updating profile with data:', formData);

      const { error: updateError } = await supabase
        .from('profiles')
        .update({
          name: formData.name,
          email: formData.email,
          role: formData.role,
          grade_level: formData.role === 'student' ? parseInt(formData.grade_level, 10) : null,
          gender: formData.gender,
          continent: formData.continent || null,
          country: formData.country || null,
          state: formData.state || null,
          city: formData.city || null,
          school_name: formData.school_name || null,
          updated_at: new Date().toISOString()
        })
        .eq('id', authUser.id);

      if (updateError) {
        console.error('[ProfilePage] Update error:', updateError);
        throw updateError;
      }

      console.log('[ProfilePage] Profile updated successfully');

      // Update local state
      setProfile(prev => prev ? {
        ...prev,
        name: formData.name,
        email: formData.email,
        role: formData.role,
        grade_level: formData.role === 'student' ? parseInt(formData.grade_level, 10) : undefined,
        gender: formData.gender,
        continent: formData.continent,
        country: formData.country,
        state: formData.state,
        city: formData.city,
        school_name: formData.school_name,
        updated_at: new Date().toISOString()
      } : null);

      // Refresh the auth user profile
      await refreshUserProfile();

      setEditing(false);
      setSuccess('Profile updated successfully!');
      setTimeout(() => setSuccess(null), 3000);

    } catch (err) {
      console.error('[ProfilePage] Error updating profile:', err);
      setError(err instanceof Error ? err.message : 'Failed to update profile');
    } finally {
      setSaving(false);
    }
  }, [authUser, profile, formData, refreshUserProfile]);

  const handlePasswordReset = useCallback(async () => {
    if (!profile?.email) {
      setError('No email address available');
      return;
    }

    try {
      console.log('[ProfilePage] Sending password reset to:', profile.email);
      const { error } = await supabase.auth.resetPasswordForEmail(profile.email, {
        redirectTo: `${window.location.origin}/auth/reset-password`
      });
      
      if (error) {
        console.error('[ProfilePage] Password reset error:', error);
        throw error;
      }
      
      setSuccess('Password reset email sent! Check your inbox.');
      setTimeout(() => setSuccess(null), 5000);
    } catch (err) {
      console.error('[ProfilePage] Error sending password reset:', err);
      setError(err instanceof Error ? err.message : 'Failed to send password reset email');
    }
  }, [profile?.email]);

  const getSkillCompletionRate = useCallback(() => {
    if (skillsProgress.length === 0) return 0;
    const totalProgress = skillsProgress.reduce((sum, skill) => sum + skill.progress, 0);
    return Math.round(totalProgress / skillsProgress.length);
  }, [skillsProgress]);

  const getCompletedSkillsCount = useCallback(() => {
    return skillsProgress.filter(skill => skill.progress === 100).length;
  }, [skillsProgress]);

  // ── Generate a new join code for the org ────────────────────────────────────
  const handleGenerateCode = useCallback(async () => {
    if (!authUser || !orgInfo) return;
    setGeneratingCode(true);
    try {
      const { data, error } = await supabase
        .rpc('add_org_join_code', {
          org_id:               orgInfo.id,
          requesting_user_id:   authUser.id,
        });
      if (error) throw error;
      const newCode = data as string;
      setOrgInfo(prev => prev ? { ...prev, join_codes: [...prev.join_codes, newCode] } : prev);
      setSuccess(`New join code generated: ${newCode}`);
      setTimeout(() => setSuccess(null), 5000);
    } catch (err: any) {
      setError(err.message || 'Could not generate join code');
    } finally {
      setGeneratingCode(false);
    }
  }, [authUser, orgInfo]);

  const handleCancelEdit = useCallback(() => {
    setEditing(false);
    setFormData({
      name: profile?.name || '',
      email: profile?.email || '',
      role: (profile?.role as any) || 'student',
      grade_level: profile?.grade_level?.toString() || '1',
      gender: profile?.gender || 'female',
      continent: profile?.continent || '',
        country: profile?.country || '',
        state: profile?.state || '',
        city: profile?.city || '',
        school_name: profile?.school_name || ''
    });
    // Reinitialise cityChoice when edit starts
    const c = profile?.continent || '';
    const savedCity = profile?.city || '';
    const opts = CITY_OPTIONS[c] ?? [];
    if (opts.length > 0) {
      const namedOption = opts.find(o => o !== 'Other' && o.toLowerCase().replace(' area','') === savedCity.toLowerCase().replace(' area',''));
      setCityChoice(namedOption ? namedOption : savedCity ? 'Other' : '');
    } else {
      setCityChoice('');
    }

    // Reinitialise schoolChoice when edit starts (Africa only)
    const savedSchool = profile?.school_name || '';
    if (c === 'Africa') {
      const namedSchool = AFRICA_SCHOOL_OPTIONS.find(o => o !== 'Other' && o === savedSchool);
      setSchoolChoice(namedSchool ? namedSchool : savedSchool ? 'Other' : '');
    } else {
      setSchoolChoice('');
    }
    setError(null);
  }, [profile]);

  if (loading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center min-h-screen">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
        </div>
      </AppLayout>
    );
  }

  if (!profile) {
    return (
      <AppLayout>
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-red-800">Failed to load profile data.</p>
            <Button 
              onClick={fetchProfileData} 
              className="mt-2" 
              size="sm"
            >
              Retry
            </Button>
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 flex items-center">
            <User className="h-8 w-8 text-blue-600 mr-3" />
            My Profile
          </h1>
          <p className="mt-2 text-gray-600">
            Manage your personal information and track your learning progress.
          </p>
        </div>

        {/* Alert Messages */}
        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-red-800">{error}</p>
          </div>
        )}

        {success && (
          <div className="mb-6 bg-green-50 border border-green-200 rounded-lg p-4">
            <p className="text-green-800">{success}</p>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Profile Info */}
          <div className="lg:col-span-2 space-y-6">
            {/* Personal Information */}
            <div className="bg-white rounded-lg shadow">
              <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
                <h2 className="text-xl font-semibold text-gray-900">Personal Information</h2>
                {!editing ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setEditing(true)}
                    icon={<Edit3 size={16} />}
                  >
                    Edit
                  </Button>
                ) : (
                  <div className="flex space-x-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleCancelEdit}
                      icon={<X size={16} />}
                    >
                      Cancel
                    </Button>
                  </div>
                )}
              </div>

              <div className="p-6">
                {editing ? (
                  <form onSubmit={handleSaveProfile} className="space-y-6">
                    {/* Full Name Field */}
                    <div className="w-full">
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        <User className="inline h-4 w-4 mr-1" />
                        Full Name *
                      </label>
                      <input
                        type="text"
                        value={formData.name}
                        onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                        required
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                        placeholder="Enter your full name"
                      />
                    </div>
                    
                    {/* Email Field */}
                    <div className="w-full">
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        <Mail className="inline h-4 w-4 mr-1" />
                        Email Address *
                      </label>
                      <input
                        type="email"
                        value={formData.email}
                        onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                        required
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                        placeholder="Enter your email address"
                      />
                    </div>

                    {/* Role Selection */}
                    <div className="w-full">
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        <Shield className="inline h-4 w-4 mr-1" />
                        Role
                      </label>

                      {/* platform_administrator can assign any role via dropdown */}
                      {profile.role === 'platform_administrator' ? (
                        <select
                          value={formData.role}
                          onChange={(e) => setFormData(prev => ({
                            ...prev,
                            role: e.target.value as typeof formData.role
                          }))}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                        >
                          <option value="student">Student</option>
                          <option value="teacher">Teacher / Educator</option>
                          <option value="site_leader">Site Leader</option>
                          <option value="research_lead">Research Lead</option>
                          <option value="platform_administrator">Platform Administrator</option>
                        </select>
                      ) : (
                        /* All other roles: read-only — role is set by join code or admin */
                        <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-700">
                          <Shield className="h-4 w-4 text-gray-400 flex-shrink-0" />
                          <span className="capitalize font-medium">
                            {formData.role === 'student'                ? 'Student'
                              : formData.role === 'teacher'             ? 'Teacher / Educator'
                              : formData.role === 'site_leader'         ? 'Site Leader'
                              : formData.role === 'research_lead'       ? 'Research Lead'
                              : formData.role === 'platform_administrator' ? 'Platform Administrator'
                              : formData.role}
                          </span>
                          <span className="ml-auto text-xs text-gray-400 italic">assigned by your organization</span>
                        </div>
                      )}
                    </div>

                    {/* Grade Level (students only) */}
                    {formData.role === 'student' && (
                      <div className="w-full">
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Grade Level *
                        </label>
                        <div className="space-y-2">
                          {(['1', '2', '3', '4'] as const).map((grade) => (
                            <label key={grade} className="flex items-start">
                              <input
                                type="radio"
                                name="grade_level"
                                value={grade}
                                checked={formData.grade_level === grade}
                                onChange={(e) => setFormData(prev => ({ ...prev, grade_level: e.target.value }))}
                                className="mr-3 mt-1"
                                required
                              />
                              <div>
                                <div className="font-medium text-gray-900">
                                  {GRADE_LEVEL_LABELS[grade].name}
                                </div>
                                <div className="text-sm text-gray-500">
                                  {GRADE_LEVEL_LABELS[grade].ages}
                                </div>
                              </div>
                            </label>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Gender */}
                    <div className="w-full">
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Gender *
                      </label>
                      <div className="space-y-2">
                        {(['female', 'male', 'other'] as const).map((gender) => (
                          <label key={gender} className="flex items-center">
                            <input
                              type="radio"
                              name="gender"
                              value={gender}
                              checked={formData.gender === gender}
                              onChange={(e) => setFormData(prev => ({ ...prev, gender: e.target.value as 'female' | 'male' | 'other' }))}
                              className="mr-3"
                              required
                            />
                            <span className="capitalize">{gender}</span>
                          </label>
                        ))}
                      </div>
                    </div>

                    {/* Continent */}
                    <div className="w-full">
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Continent *
                      </label>
                      <select
                        value={formData.continent}
                        onChange={(e) => {
                          const val = e.target.value;
                          setFormData(prev => ({ ...prev, continent: val, country: '', city: '', school_name: '' }));
                          setCityChoice('');
                          setSchoolChoice('');
                        }}
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
                        required
                      >
                        <option value="">-- Select a continent --</option>
                        {CONTINENTS.map((c) => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
                    </div>

                    {/* Country — filtered by continent */}
                    {formData.continent && (
                      <div className="w-full">
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          <Globe className="inline h-4 w-4 mr-1" />
                          Country
                        </label>
                        <select
                          value={formData.country}
                          onChange={(e) => {
                            setFormData(prev => ({ ...prev, country: e.target.value, state: '', city: '' }));
                            setCityChoice('');
                          }}
                          className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
                        >
                          <option value="">-- Select a country --</option>
                          {(COUNTRIES_BY_CONTINENT[formData.continent] ?? []).map((country) => (
                            <option key={country} value={country}>{country}</option>
                          ))}
                        </select>
                      </div>
                    )}

                    {/* State/Province */}
                    <div className="w-full">
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        <MapPin className="inline h-4 w-4 mr-1" />
                        State/Province
                      </label>
                      {formData.country === 'Nigeria' ? (
                        <select
                          value={formData.state}
                          onChange={(e) => {
                            const selectedState = e.target.value;
                            const autoCity = NIGERIA_STATE_CITY_MAP[selectedState] ?? '';
                            setFormData(prev => ({ ...prev, state: selectedState, city: autoCity }));
                            setCityChoice('');
                          }}
                          className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
                        >
                          <option value="">-- Select a state --</option>
                          {NIGERIA_STATES.map((s) => (
                            <option key={s} value={s}>{s}</option>
                          ))}
                        </select>
                      ) : (
                        <input
                          type="text"
                          value={formData.state}
                          onChange={(e) => setFormData(prev => ({ ...prev, state: e.target.value }))}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                          placeholder="e.g., Ohio, Ontario, Bayelsa"
                        />
                      )}
                    </div>

                    {/* City — Nigeria: plain input (may be auto-populated by state); 
                           Other Africa / North America: smart dropdown; elsewhere: free text */}
                    <div className="w-full">
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        City
                      </label>
                      {formData.country === 'Nigeria' ? (
                        <input
                          type="text"
                          value={formData.city}
                          onChange={(e) => setFormData(prev => ({ ...prev, city: e.target.value }))}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                          placeholder="e.g., Ibiade, Oloibiri, Lagos"
                        />
                      ) : CITY_OPTIONS[formData.continent] ? (
                        <>
                          <select
                            value={cityChoice}
                            onChange={(e) => {
                              const val = e.target.value;
                              setCityChoice(val);
                              if (val !== 'Other') {
                                if (val === 'Cincinnati') {
                                  setFormData(prev => ({
                                    ...prev,
                                    city: val,
                                    school_name: '100 Black Girls Breaking Barriers in STEM'
                                  }));
                                } else {
                                  setFormData(prev => ({
                                    ...prev,
                                    city: val,
                                    school_name: prev.school_name === '100 Black Girls Breaking Barriers in STEM' ? '' : prev.school_name
                                  }));
                                }
                              } else {
                                setFormData(prev => ({
                                  ...prev,
                                  city: '',
                                  school_name: prev.school_name === '100 Black Girls Breaking Barriers in STEM' ? '' : prev.school_name
                                }));
                              }
                            }}
                            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white mb-2"
                          >
                            <option value="">-- Select a city --</option>
                            {CITY_OPTIONS[formData.continent].map((opt) => (
                              <option key={opt} value={opt}>{opt}</option>
                            ))}
                          </select>
                          {cityChoice === 'Other' && (
                            <input
                              type="text"
                              value={formData.city}
                              onChange={(e) => setFormData(prev => ({ ...prev, city: e.target.value }))}
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                              placeholder="Enter your city or town"
                              autoFocus
                            />
                          )}
                        </>
                      ) : (
                        <input
                          type="text"
                          value={formData.city}
                          onChange={(e) => setFormData(prev => ({ ...prev, city: e.target.value }))}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                          placeholder="e.g., Tokyo, Sydney, London"
                        />
                      )}
                    </div>
                    <div className="w-full">
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        School/Organization
                      </label>

                      {/* Africa: dropdown with Davidson AI Innovation Lab or Other */}
                      {formData.continent === 'Africa' ? (
                        <>
                          <select
                            value={schoolChoice}
                            onChange={(e) => {
                              const val = e.target.value;
                              setSchoolChoice(val);
                              if (val !== 'Other') {
                                setFormData(prev => ({ ...prev, school_name: val }));
                              } else {
                                setFormData(prev => ({ ...prev, school_name: '' }));
                              }
                            }}
                            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white mb-2"
                          >
                            <option value="">Select a school or organization</option>
                            {AFRICA_SCHOOL_OPTIONS.map((opt) => (
                              <option key={opt} value={opt}>{opt}</option>
                            ))}
                          </select>
                          {schoolChoice === 'Other' && (
                            <input
                              type="text"
                              value={formData.school_name}
                              onChange={(e) => setFormData(prev => ({ ...prev, school_name: e.target.value }))}
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                              placeholder="Enter your school or organization name"
                              autoFocus
                            />
                          )}
                        </>
                      ) : /* North America + Cincinnati: auto-populated read-only field */
                      formData.continent === 'North America' && cityChoice === 'Cincinnati' ? (
                        <input
                          type="text"
                          value={formData.school_name}
                          readOnly
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-gray-50 text-gray-600 text-sm cursor-default"
                        />
                      ) : (
                        /* All other users: free text */
                        <input
                          type="text"
                          value={formData.school_name}
                          onChange={(e) => setFormData(prev => ({ ...prev, school_name: e.target.value }))}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                          placeholder="Optional - Enter school or organization name"
                        />
                      )}
                    </div>

                    {/* School/Organization */}
                    <div className="flex justify-end space-x-3 pt-4 border-t border-gray-200">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={handleCancelEdit}
                        disabled={saving}
                      >
                        Cancel
                      </Button>
                      <Button
                        type="submit"
                        isLoading={saving}
                        disabled={saving}
                        icon={<Save size={16} />}
                      >
                        {saving ? 'Saving...' : 'Save Changes'}
                      </Button>
                    </div>
                  </form>
                ) : (
                  <div className="space-y-6">
                    {/* Profile Header */}
                    <div className="flex items-center">
                      <div className="w-16 h-16 bg-gray-200 rounded-full flex items-center justify-center mr-4">
                        {profile.avatar_url ? (
                          <img
                            src={profile.avatar_url}
                            alt={profile.name}
                            className="w-16 h-16 rounded-full object-cover"
                          />
                        ) : (
                          <User className="h-8 w-8 text-gray-400" />
                        )}
                      </div>
                      <div>
                        <h3 className="text-lg font-semibold text-gray-900">{profile.name}</h3>
                        <p className="text-gray-600">{profile.email}</p>
                      </div>
                    </div>

                    {/* Profile Details Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4">
                      <div className="flex items-center text-sm text-gray-600">
                        <Shield className="h-4 w-4 mr-2 text-blue-500" />
                        <span className="font-medium">Role:</span>
                        <span className="ml-1 capitalize">{profile.role}</span>
                      </div>
                      
                      {profile.role === 'student' && profile.grade_level && (
                        <div className="flex items-center text-sm text-gray-600">
                          <Award className="h-4 w-4 mr-2 text-purple-500" />
                          <span className="font-medium">Grade Level:</span>
                          <span className="ml-1">
                            {GRADE_LEVEL_LABELS[String(profile.grade_level) as keyof typeof GRADE_LEVEL_LABELS]?.name ?? 'High School (9-12)'}
                          </span>
                        </div>
                      )}
                      
                      {profile.gender && (
                        <div className="flex items-center text-sm text-gray-600">
                          <User className="h-4 w-4 mr-2 text-green-500" />
                          <span className="font-medium">Gender:</span>
                          <span className="ml-1 capitalize">{profile.gender}</span>
                        </div>
                      )}
                      
                      <div className="flex items-center text-sm text-gray-600">
                        <Calendar className="h-4 w-4 mr-2 text-green-500" />
                        <span className="font-medium">Joined:</span>
                        <span className="ml-1">{new Date(profile.created_at).toLocaleDateString()}</span>
                      </div>
                      
                      {profile.continent && (
                        <div className="flex items-center text-sm text-gray-600">
                          <Globe className="h-4 w-4 mr-2 text-indigo-500" />
                          <span className="font-medium">Continent:</span>
                          <span className="ml-1">{profile.continent}</span>
                        </div>
                      )}
                      
                      {profile.country && (
                        <div className="flex items-center text-sm text-gray-600">
                          <Globe className="h-4 w-4 mr-2 text-blue-500" />
                          <span className="font-medium">Country:</span>
                          <span className="ml-1">{profile.country}</span>
                        </div>
                      )}
                      
                      {(profile.state || profile.city) && (
                        <div className="flex items-center text-sm text-gray-600">
                          <MapPin className="h-4 w-4 mr-2 text-red-500" />
                          <span className="font-medium">Location:</span>
                          <span className="ml-1">
                            {[profile.city, profile.state].filter(Boolean).join(', ')}
                          </span>
                        </div>
                      )}

                      {profile.school_name && (
                        <div className="flex items-center text-sm text-gray-600">
                          <div className="h-4 w-4 mr-2 text-yellow-500 flex items-center justify-center">
                            🏫
                          </div>
                          <span className="font-medium">School/Organization:</span>
                          <span className="ml-1">{profile.school_name}</span>
                        </div>
                      )}
                    </div>

                    {/* Show empty fields message if key profile info not set */}
                    {(!profile.continent || !profile.country || (!profile.state && !profile.city)) && (
                      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mt-4">
                        <p className="text-blue-800 text-sm">
                          <Globe className="inline h-4 w-4 mr-1" />
                          Complete your profile by adding missing location information.
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Team Information */}
            {teamInfo && (
              <div className="bg-white rounded-lg shadow">
                <div className="px-6 py-4 border-b border-gray-200">
                  <h2 className="text-xl font-semibold text-gray-900 flex items-center">
                    <Users className="h-5 w-5 mr-2" />
                    Team Information
                  </h2>
                </div>
                <div className="p-6">
                  <div className="space-y-3">
                    <div>
                      <h3 className="font-medium text-gray-900">{teamInfo.name}</h3>
                      <p className="text-sm text-gray-600">Your current team</p>
                    </div>
                    <div>
                      <h4 className="text-sm font-medium text-gray-700">Facilitator</h4>
                      <p className="text-sm text-gray-600">
                        {teamInfo.facilitator.name} • {teamInfo.facilitator.email}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Organization Info (for leaders and learners linked to an org) */}
            {(orgInfo || savedJoinCode) && (
              <div className="bg-white rounded-lg shadow">
                <div className="px-6 py-4 border-b border-gray-200">
                  <h2 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
                    <span>🏢</span> Organization
                  </h2>
                </div>
                <div className="p-6 space-y-4">
                  {orgInfo && (
                    <>
                      <div>
                        <h3 className="font-semibold text-gray-900 text-lg">{orgInfo.name}</h3>
                        {orgInfo.description && <p className="text-sm text-gray-500 mt-1">{orgInfo.description}</p>}
                        <p className="text-sm text-gray-500 mt-1">
                          {[orgInfo.city, orgInfo.country, orgInfo.continent].filter(Boolean).join(', ')}
                        </p>
                      </div>

                      {/* Join codes — leaders only */}
                      {(profile?.role === 'leader' || profile?.role === 'platform_administrator') && (
                        <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 space-y-3">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-xs font-semibold text-indigo-700 uppercase tracking-wider">
                                Join Codes
                              </p>
                              {profile?.is_primary_leader
                                ? <p className="text-[10px] text-indigo-500 mt-0.5">You are the primary leader of this organization</p>
                                : <p className="text-[10px] text-indigo-500 mt-0.5">You are a co-facilitator — contact the primary leader to generate new codes</p>
                              }
                            </div>
                            {profile?.is_primary_leader && (
                              <button
                                onClick={handleGenerateCode}
                                disabled={generatingCode}
                                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors disabled:opacity-50"
                              >
                                {generatingCode ? (
                                  <span className="animate-spin">⟳</span>
                                ) : (
                                  <Key className="h-3 w-3" />
                                )}
                                Generate New Code
                              </button>
                            )}
                          </div>

                          {/* Code chips */}
                          <div className="flex flex-wrap gap-2">
                            {(orgInfo.join_codes.length > 0 ? orgInfo.join_codes : [orgInfo.join_code]).map((code, i) => (
                              <div key={code} className="flex items-center gap-2 bg-white border border-indigo-200 rounded-lg px-3 py-2">
                                <span className="text-lg font-black text-indigo-900 tracking-widest font-mono">{code}</span>
                                {i === 0 && (
                                  <span className="text-[10px] font-medium text-indigo-500 bg-indigo-100 rounded px-1.5 py-0.5">primary</span>
                                )}
                                <button
                                  onClick={() => navigator.clipboard.writeText(code)}
                                  className="text-indigo-400 hover:text-indigo-700 transition-colors"
                                  title="Copy to clipboard"
                                >
                                  <CheckCircle className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            ))}
                          </div>

                          <p className="text-xs text-indigo-600">
                            Share any code with learners during signup. Generate a new code for each new session cohort.
                          </p>
                          <div className="text-sm text-gray-600 pt-1 border-t border-indigo-100">
                            <span className="font-semibold">{orgInfo.learner_count ?? 0}</span> learners enrolled
                          </div>
                        </div>
                      )}

                      {/* Student list — leaders only */}
                      {(profile?.role === 'leader' || profile?.role === 'platform_administrator') && (
                        <div className="space-y-2">
                          <h4 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                            <Users className="h-4 w-4 text-indigo-500" />
                            {profile?.is_primary_leader ? 'All Enrolled Learners' : 'Learners in Your Cohort'}
                          </h4>
                          {loadingStudents ? (
                            <div className="flex items-center gap-2 py-4">
                              <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-indigo-500" />
                              <span className="text-sm text-gray-400">Loading learners…</span>
                            </div>
                          ) : orgStudents.length === 0 ? (
                            <p className="text-sm text-gray-400 py-2">
                              No learners have joined yet. Share a join code to get started.
                            </p>
                          ) : (
                            <div className="overflow-x-auto rounded-lg border border-gray-200">
                              <table className="min-w-full text-sm">
                                <thead className="bg-gray-50">
                                  <tr>
                                    <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Name</th>
                                    <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Email</th>
                                    <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Code Used</th>
                                    <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Joined</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                  {orgStudents.map(student => (
                                    <tr key={student.id} className="hover:bg-gray-50 transition-colors">
                                      <td className="px-4 py-2 font-medium text-gray-900">{student.name || '—'}</td>
                                      <td className="px-4 py-2 text-gray-600 truncate max-w-[180px]">{student.email}</td>
                                      <td className="px-4 py-2 font-mono text-xs text-indigo-700">{student.join_code_used || '—'}</td>
                                      <td className="px-4 py-2 text-gray-500 text-xs">
                                        {new Date(student.created_at).toLocaleDateString()}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      )}
                    </>
                  )}

                  {/* Fallback: localStorage code if org not yet in DB */}
                  {!orgInfo && savedJoinCode && (
                    <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4">
                      <p className="text-xs font-semibold text-indigo-700 uppercase tracking-wider mb-2">Your Join Code</p>
                      <p className="text-3xl font-black text-indigo-900 tracking-widest font-mono">{savedJoinCode}</p>
                      <p className="text-xs text-indigo-600 mt-2">Share this code with learners so they can join your organization during signup.</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Account Settings */}
            <div className="bg-white rounded-lg shadow">
              <div className="px-6 py-4 border-b border-gray-200">
                <h2 className="text-xl font-semibold text-gray-900">Account Settings</h2>
              </div>
              <div className="p-6">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-medium text-gray-900 flex items-center">
                        <Key className="h-4 w-4 mr-2" />
                        Password
                      </h3>
                      <p className="text-sm text-gray-600">Reset your password via email</p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handlePasswordReset}
                    >
                      Reset Password
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Progress Sidebar */}
          <div className="lg:col-span-1 space-y-6">
            {/* Learning Progress */}
            <div className="bg-white rounded-lg shadow">
              <div className="px-6 py-4 border-b border-gray-200">
                <h3 className="text-lg font-medium text-gray-900 flex items-center">
                  <Award className="h-5 w-5 mr-2" />
                  Learning Progress
                </h3>
              </div>
              <div className="p-6">
                <div className="text-center mb-6">
                  <div className="relative inline-flex items-center justify-center w-20 h-20 mb-4">
                    <svg className="w-20 h-20 transform -rotate-90" viewBox="0 0 36 36">
                      <path
                        className="text-gray-200"
                        d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="3"
                      />
                      <path
                        className="text-green-600"
                        d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="3"
                        strokeDasharray={`${getSkillCompletionRate()}, 100`}
                      />
                    </svg>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="text-xl font-bold text-gray-900">
                        {getSkillCompletionRate()}%
                      </span>
                    </div>
                  </div>
                  <p className="text-sm text-gray-600">Overall Progress</p>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">Skills Completed</span>
                    <span className="text-sm font-medium text-gray-900">
                      {getCompletedSkillsCount()} / {skillsProgress.length || 4}
                    </span>
                  </div>
                  
                  <div className="space-y-3">
                    {skillsProgress.length > 0 ? (
                      skillsProgress.map((skill) => (
                        <div key={skill.skill} className="flex items-center justify-between">
                          <div className="flex items-center">
                            {skill.progress === 100 ? (
                              <CheckCircle className="h-4 w-4 text-green-500 mr-2" />
                            ) : (
                              <div className="h-4 w-4 rounded-full bg-gray-200 mr-2" />
                            )}
                            <span className="text-sm text-gray-700 capitalize">
                              {skill.skill.replace('-', ' ')}
                            </span>
                          </div>
                          <span className="text-xs text-gray-500">
                            {skill.progress}%
                          </span>
                        </div>
                      ))
                    ) : (
                      <p className="text-sm text-gray-500 text-center py-4">
                        No skills progress yet. Start learning to see your progress here!
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Quick Stats */}
            <div className="bg-white rounded-lg shadow">
              <div className="px-6 py-4 border-b border-gray-200">
                <h3 className="text-lg font-medium text-gray-900 flex items-center">
                  <TrendingUp className="h-5 w-5 mr-2" />
                  Quick Stats
                </h3>
              </div>
              <div className="p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Account Age</span>
                  <span className="text-sm font-medium text-gray-900">
                    {Math.floor((Date.now() - new Date(profile.created_at).getTime()) / (1000 * 60 * 60 * 24))} days
                  </span>
                </div>
                
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Last Updated</span>
                  <span className="text-sm font-medium text-gray-900">
                    {new Date(profile.updated_at).toLocaleDateString()}
                  </span>
                </div>

                {teamInfo && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">Team Status</span>
                    <span className="text-sm font-medium text-green-600">Active</span>
                  </div>
                )}
              </div>
            </div>

            {/* Achievement Badges (Placeholder for future) */}
            <div className="bg-white rounded-lg shadow">
              <div className="px-6 py-4 border-b border-gray-200">
                <h3 className="text-lg font-medium text-gray-900">Achievements</h3>
              </div>
              <div className="p-6">
                <div className="text-center py-8">
                  <Award className="h-12 w-12 text-gray-300 mx-auto mb-4" />
                  <p className="text-sm text-gray-500">
                    Achievement system coming soon! Keep learning to unlock badges.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Recent Activity (Placeholder) */}
        <div className="mt-8 bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-xl font-semibold text-gray-900">Recent Activity</h2>
          </div>
          <div className="p-6">
            <div className="text-center py-8">
              <Calendar className="h-12 w-12 text-gray-300 mx-auto mb-4" />
              <p className="text-sm text-gray-500">
                Activity tracking coming soon! Your learning journey will be displayed here.
              </p>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
};

export default ProfilePage;