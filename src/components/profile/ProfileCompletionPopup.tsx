// src/components/profile/ProfileCompletionPopup.tsx

import React, { useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { findSimilarProfile, type SimilarProfileMatch } from '../../lib/duplicateDetection';
import { User, GraduationCap, Globe, MapPin, Key, Building2, Search, PlusCircle, Upload, Copy, CheckCircle } from 'lucide-react';

// Site leader can either join an existing org (they have a co-leader join code)
// or create a brand-new org for their own cohort.
type LeaderOrgMode = 'choose' | 'join' | 'create';

interface ProfileCompletionPopupProps {
  userId: string;
  email: string;
  onComplete: () => void;
}

// What we fetch from an org when a learner enters a join code
interface OrgContext {
  id: string;
  name: string;
  continent: string;
  country: string;
  state: string | null;
  city: string | null;
  learner_age_min: number | null;
  learner_age_max: number | null;
  learner_gender: 'female' | 'male' | 'both' | null;
}

const CONTINENTS = ['Africa','Asia','Australia','North America','South America'];

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

const NIGERIA_STATES = [
  'Abia','Adamawa','Akwa Ibom','Anambra','Bauchi','Bayelsa',
  'Benue','Borno','Cross River','Delta','Ebonyi','Edo',
  'Ekiti','Enugu','FCT (Abuja)','Gombe','Imo','Jigawa',
  'Kaduna','Kano','Katsina','Kebbi','Kogi','Kwara',
  'Lagos','Nasarawa','Niger','Ogun','Ondo','Osun',
  'Oyo','Plateau','Rivers','Sokoto','Taraba','Yobe','Zamfara',
];

const NIGERIA_STATE_CITY_MAP: Record<string, string> = {
  'Ogun': 'Ibiade',
  'Bayelsa': 'Oloibiri',
};

const ProfileCompletionPopup: React.FC<ProfileCompletionPopupProps> = ({ userId, email, onComplete }) => {
  const [role, setRole] = useState<'student' | 'site_leader'>('student');

  // ── Shared fields ──────────────────────────────────────────────────────────
  const [name, setName] = useState('');
  const [gender, setGender] = useState<'female' | 'male' | 'other'>('female');

  // ── Learner-only ───────────────────────────────────────────────────────────
  const [joinCode, setJoinCode] = useState('');
  const [joinCodeStatus, setJoinCodeStatus] = useState<'idle'|'checking'|'found'|'not_found'>('idle');
  const [orgCtx, setOrgCtx] = useState<OrgContext | null>(null);  // filled when join code found
  const [gradeLevel, setGradeLevel] = useState('3');

  // ── Leader-only ────────────────────────────────────────────────────────────
  const [leaderOrgMode, setLeaderOrgMode] = useState<LeaderOrgMode>('choose');

  // co-leader: joining an existing org
  const [coJoinCode, setCoJoinCode]           = useState('');
  const [coJoinStatus, setCoJoinStatus]       = useState<'idle'|'checking'|'found'|'not_found'>('idle');
  const [coOrgCtx, setCoOrgCtx]               = useState<OrgContext | null>(null);

  // creator: making a new org
  const [orgName, setOrgName] = useState('');
  const [orgDescription, setOrgDescription] = useState('');
  const [continent, setContinent] = useState('');
  const [country, setCountry] = useState('');
  const [state, setState] = useState('');
  const [city, setCity] = useState('');
  const [ageMin, setAgeMin] = useState('');
  const [ageMax, setAgeMax] = useState('');
  const [learnerGender, setLearnerGender] = useState<'female'|'male'|'both'>('both');

  // ── Logo + community context (optional, org creator only) ────────────────
  const [logoFile, setLogoFile]                   = useState<File | null>(null);
  const [logoPreview, setLogoPreview]             = useState<string | null>(null);
  const [communityLivelihood, setCommunityLivelihood] = useState('');
  const [communityChallenges, setCommunityChallenges] = useState('');
  const [communityHopes, setCommunityHopes]       = useState('');

  // ── Join code modal state ─────────────────────────────────────────────────
  const [newOrgJoinCode, setNewOrgJoinCode] = useState<string | null>(null);
  const [newOrgName, setNewOrgName]         = useState<string | null>(null);
  const [codeCopied, setCodeCopied]         = useState(false);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Duplicate-account detection ───────────────────────────────────────────
  const [duplicateMatch, setDuplicateMatch] = useState<SimilarProfileMatch | null>(null);
  const [mergedAndRedirected, setMergedAndRedirected] = useState(false);

  // Confirmed same person as an existing profile: soft-merge this brand-new
  // (throwaway) account into the original instead of creating a duplicate,
  // then send a password reset to the original account's email.
  const handleThatsMe = async () => {
    if (!duplicateMatch) return;
    setIsSubmitting(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) throw new Error('No active session');

      const { error: mergeError } = await supabase
        .from('profiles')
        .update({
          name: name.trim(),
          is_active: false,
          merged_into: duplicateMatch.id,
          profile_completed: true,
          updated_at: new Date().toISOString(),
        })
        .eq('id', session.user.id);
      if (mergeError) throw mergeError;

      const { error: otpError } = await supabase.auth.signInWithOtp({
        email: duplicateMatch.rawEmail,
        options: { emailRedirectTo: `${window.location.origin}/auth/reset-password` },
      });
      if (otpError) throw otpError;

      await supabase.auth.signOut();
      setMergedAndRedirected(true);
    } catch (err: any) {
      setError(err.message || 'Something went wrong sending your reset link.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── Learner join code lookup (array-aware via RPC) ────────────────────────
  const handleJoinCodeChange = async (code: string) => {
    const upper = code.toUpperCase();
    setJoinCode(upper);
    if (upper.length < 6) { setJoinCodeStatus('idle'); setOrgCtx(null); return; }
    setJoinCodeStatus('checking');
    const { data } = await supabase
      .rpc('find_org_by_join_code', { lookup_code: upper });
    const found = Array.isArray(data) ? data[0] ?? null : data ?? null;
    if (found) {
      setJoinCodeStatus('found');
      setOrgCtx(found as OrgContext);
      if (found.learner_gender === 'female') setGender('female');
      if (found.learner_gender === 'male')   setGender('male');
    } else {
      setJoinCodeStatus('not_found');
      setOrgCtx(null);
    }
  };

  // ── Co-leader join code lookup ─────────────────────────────────────────────
  const handleCoJoinCodeChange = async (code: string) => {
    const upper = code.toUpperCase();
    setCoJoinCode(upper);
    if (upper.length < 6) { setCoJoinStatus('idle'); setCoOrgCtx(null); return; }
    setCoJoinStatus('checking');
    const { data } = await supabase
      .rpc('find_org_by_join_code', { lookup_code: upper });
    const found = Array.isArray(data) ? data[0] ?? null : data ?? null;
    if (found) {
      setCoJoinStatus('found');
      setCoOrgCtx(found as OrgContext);
    } else {
      setCoJoinStatus('not_found');
      setCoOrgCtx(null);
    }
  };

  // ── Logo file picker ──────────────────────────────────────────────────────
  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    setLogoFile(file);
    if (file) {
      const reader = new FileReader();
      reader.onload = ev => setLogoPreview(ev.target?.result as string);
      reader.readAsDataURL(file);
    } else {
      setLogoPreview(null);
    }
  };

  // ── Submit ────────────────────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim()) { setError('Please enter your name'); return; }

    if (role === 'site_leader') {
      if (leaderOrgMode === 'choose') {
        setError('Please choose to join an existing organization or create a new one'); return;
      }
      if (leaderOrgMode === 'join') {
        if (!coOrgCtx) { setError('Please enter a valid organization join code'); return; }
      }
      if (leaderOrgMode === 'create') {
        if (!orgName.trim()) { setError('Please enter your organization name'); return; }
        if (!continent)      { setError('Please select your continent'); return; }
        if (!country)        { setError('Please select your country'); return; }
        if (!ageMin || !ageMax) { setError('Please enter the learner age range'); return; }
        if (parseInt(ageMin) >= parseInt(ageMax)) {
          setError('Minimum age must be less than maximum age'); return;
        }
      }
    }

    setIsSubmitting(true);
    try {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !session?.user) throw new Error('No active session');
      const actualUserId = session.user.id;
      const actualEmail  = session.user.email;

      // ── Duplicate-account check ──────────────────────────────────────────
      // Scoped to the organization the person is joining — checking names
      // platform-wide would false-positive on unrelated people who share a
      // common name. Skipped when no org is known yet (leader creating a
      // brand-new org has no cohort to collide with).
      const scopeOrgId =
        role === 'student' ? (orgCtx?.id ?? null) :
        (role === 'site_leader' && leaderOrgMode === 'join') ? (coOrgCtx?.id ?? null) :
        null;

      if (scopeOrgId && !duplicateMatch) {
        const match = await findSimilarProfile({
          name: name.trim(),
          organizationId: scopeOrgId,
          excludeUserId: actualUserId,
        });
        if (match) {
          setDuplicateMatch(match);
          setIsSubmitting(false);
          return; // pause — UI renders the confirmation prompt below
        }
      }
      // If duplicateMatch is already set, the user clicked "No, continue" — proceed

      let organization_id: string | null = null;
      let join_code_used: string | null  = null;

      // ── LEADER: join existing org ──────────────────────────────────────────
      if (role === 'site_leader' && leaderOrgMode === 'join' && coOrgCtx) {
        organization_id = coOrgCtx.id;
        join_code_used  = coJoinCode;
        // co-leader just links their profile to the org; leader_id stays unchanged
      }

      // ── LEADER: create new org ─────────────────────────────────────────────
      if (role === 'site_leader' && leaderOrgMode === 'create') {
        const { data: codeData } = await supabase.rpc('generate_join_code');
        const newCode = codeData as string;
        const { data: orgData, error: orgError } = await supabase
          .from('organizations')
          .insert({
            name:             orgName.trim(),
            description:      orgDescription.trim() || null,
            join_code:        newCode,          // legacy single column — keep for compat
            join_codes:       [newCode],        // new array column
            leader_id:        actualUserId,
            continent,
            country,
            state:            state  || null,
            city:             city   || null,
            learner_age_min:  parseInt(ageMin),
            learner_age_max:  parseInt(ageMax),
            learner_gender:   learnerGender,
          })
          .select('id, join_code, join_codes')
          .single();
        if (orgError) throw new Error('Could not create organization: ' + orgError.message);
        organization_id = orgData.id;
        localStorage.setItem('my_org_join_code',  orgData.join_code);
        localStorage.setItem('my_org_join_codes', JSON.stringify(orgData.join_codes));
        localStorage.setItem('my_org_name',       orgName.trim());

        // Store for join-code modal
        setNewOrgJoinCode(orgData.join_code);
        setNewOrgName(orgName.trim());

        // ── Upload logo (optional) ───────────────────────────────────────────
        let logoUrl: string | null = null;
        if (logoFile) {
          const ext      = logoFile.name.split('.').pop() ?? 'png';
          const filePath = `${orgData.id}/logo.${ext}`;
          const { error: uploadError } = await supabase.storage
            .from('org-logos')
            .upload(filePath, logoFile, { upsert: true, contentType: logoFile.type });
          if (!uploadError) {
            const { data: urlData } = supabase.storage
              .from('org-logos')
              .getPublicUrl(filePath);
            logoUrl = urlData.publicUrl;
          } else {
            console.warn('[ProfileCompletionPopup] Logo upload failed:', uploadError.message);
          }
        }

        // ── Update org with logo + community context ─────────────────────────
        const orgUpdates: Record<string, any> = {};
        if (logoUrl)                          orgUpdates.logo_url              = logoUrl;
        if (communityLivelihood.trim())       orgUpdates.community_livelihood  = communityLivelihood.trim();
        if (communityChallenges.trim())       orgUpdates.community_challenges  = communityChallenges.trim();
        if (communityHopes.trim())            orgUpdates.community_hopes       = communityHopes.trim();
        if (Object.keys(orgUpdates).length) {
          await supabase.from('organizations').update(orgUpdates).eq('id', orgData.id);
        }
      }

      // ── LEARNER with code: link to org ─────────────────────────────────────
      if (role === 'student' && orgCtx) {
        organization_id = orgCtx.id;
        join_code_used  = joinCode;
      }

      // ── Determine location ─────────────────────────────────────────────────
      // Learners inherit from their org. Co-leaders inherit from the org they joined.
      // New-org leaders use what they filled in.
      const profileContinent =
        role === 'student'                        ? (orgCtx?.continent    ?? '') :
        leaderOrgMode === 'join'                  ? (coOrgCtx?.continent  ?? '') :
        continent;
      const profileCountry =
        role === 'student'                        ? (orgCtx?.country      ?? '') :
        leaderOrgMode === 'join'                  ? (coOrgCtx?.country    ?? '') :
        country;
      const profileState =
        role === 'student'                        ? (orgCtx?.state        ?? null) :
        leaderOrgMode === 'join'                  ? (coOrgCtx?.state      ?? null) :
        (state || null);
      const profileCity =
        role === 'student'                        ? (orgCtx?.city         ?? null) :
        leaderOrgMode === 'join'                  ? (coOrgCtx?.city       ?? null) :
        (city || null);

      const profilePayload: Record<string, any> = {
        id:                 actualUserId,
        email:              actualEmail || email,
        name:               name.trim(),
        role,
        gender,
        continent:          profileContinent || null,
        country:            profileCountry   || null,
        state:              profileState,
        city:               profileCity,
        organization_id,
        join_code_used,
        // Primary leaders (who registered the org) get this flag — co-leaders do not
        is_primary_leader:  role === 'site_leader' && leaderOrgMode === 'create',
        profile_completed:  true,
        created_at:         new Date().toISOString(),
        updated_at:         new Date().toISOString(),
      };

      if (role === 'student') {
        profilePayload.grade_level = parseInt(gradeLevel, 10);
      }

      const { data: existing } = await supabase.from('profiles').select('id').eq('id', actualUserId).maybeSingle();
      if (existing) {
        // For UPDATE, remove created_at (immutable field) and send only mutable fields
        const updatePayload = { ...profilePayload };
        delete updatePayload.created_at;
        await supabase.from('profiles').update(updatePayload).eq('id', actualUserId);
      } else {
        await supabase.from('profiles').insert(profilePayload);
      }

      // ── Seed dashboard activities for learners ─────────────────────────────
      if (role === 'student') {
        const seedContinent = profileContinent || 'Africa';
        const { error: rpcError } = await supabase.rpc(
          'create_grade_appropriate_dashboard_activities_by_continent',
          { user_id_param: actualUserId, continent_param: seedContinent }
        );
        if (rpcError) {
          const { data: modules } = await supabase
            .from('learning_modules').select('learning_module_id, title, category, grade_level')
            .eq('continent', seedContinent).eq('public', 1)
            .in('grade_level', [parseInt(gradeLevel, 10), 4]).limit(10);
          if (modules?.length) {
            await supabase.from('dashboard').insert(
              modules.map(mod => ({
                user_id: actualUserId, learning_module_id: mod.learning_module_id,
                status: 'not_started', progress: 0,
                created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
              }))
            );
          }
        }
      }

      // Show join-code modal for new org leaders; proceed immediately for everyone else
      if (role === 'site_leader' && leaderOrgMode === 'create') {
        // modal shown via newOrgJoinCode state — onComplete called when user dismisses
      } else {
        onComplete();
      }
    } catch (err: any) {
      console.error('[ProfileCompletionPopup]', err);
      setError(err.message || 'Something went wrong');
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── Whether the learner must choose their own gender ──────────────────────
  // Only show gender picker to learners if org has mixed genders OR no org linked
  const learnerNeedsGender = role === 'student' && (!orgCtx || orgCtx.learner_gender === 'both');

  // ── Reset link sent after a confirmed duplicate merge ─────────────────────
  if (mergedAndRedirected) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-8 text-center space-y-4">
          <h2 className="text-lg font-semibold text-gray-900">Check your email</h2>
          <p className="text-gray-600 text-sm">
            We sent a password reset link to your original account. Click the
            link in that email to set a new password and sign in — no need
            for a second account.
          </p>
          <button
            onClick={() => { window.location.href = '/login'; }}
            className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors"
          >
            Back to sign in
          </button>
        </div>
      </div>
    );
  }

  // ── Possible duplicate warning ─────────────────────────────────────────────
  if (duplicateMatch) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-5 space-y-3">
            <div className="flex items-start gap-3">
              <span className="text-amber-500 text-xl mt-0.5">⚠️</span>
              <div>
                <h3 className="font-semibold text-gray-900 text-sm">
                  You may already have an account
                </h3>
                <p className="text-gray-600 text-sm mt-1">
                  Someone with a name like <strong>{name.trim()}</strong> already
                  has an account in this organization, registered to{' '}
                  <strong className="font-mono">{duplicateMatch.maskedEmail}</strong>.
                </p>
                <p className="text-gray-600 text-sm mt-2">
                  Is that you? If so, you don't need a new account — just reset
                  your password and sign in with it instead.
                </p>
              </div>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-800 p-3 rounded-md text-sm">
                {error}
              </div>
            )}

            <div className="flex flex-col gap-2 pt-1">
              <button
                type="button"
                disabled={isSubmitting}
                onClick={handleThatsMe}
                className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
              >
                {isSubmitting ? 'Sending…' : "Yes, that's me — send me a password reset link"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setDuplicateMatch(null);
                  // Re-submit now that the user has confirmed they're a different person
                  handleSubmit({ preventDefault: () => {} } as React.FormEvent);
                }}
                className="w-full py-2.5 border border-gray-300 hover:bg-gray-50 text-sm font-medium text-gray-700 rounded-lg transition-colors"
              >
                No, that's a different person — continue signing up
              </button>
              <button
                type="button"
                className="text-sm text-gray-400 hover:text-gray-600 text-center mt-1"
                onClick={() => setDuplicateMatch(null)}
              >
                ← Back
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Join code modal ────────────────────────────────────────────────────────
  if (newOrgJoinCode && newOrgName) {
    return (
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-8 text-center">
          <div className="mx-auto w-16 h-16 bg-indigo-100 rounded-full flex items-center justify-center mb-5">
            <Building2 className="w-8 h-8 text-indigo-600" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-1">Organization Created!</h2>
          <p className="text-gray-500 text-sm mb-6">
            <span className="font-semibold text-gray-700">{newOrgName}</span> is live on the platform.
          </p>
          <div className="bg-indigo-50 border-2 border-indigo-200 rounded-xl p-5 mb-5">
            <p className="text-xs font-bold text-indigo-500 uppercase tracking-widest mb-2">Your Join Code</p>
            <p className="text-5xl font-black text-indigo-900 tracking-widest font-mono mb-4">{newOrgJoinCode}</p>
            <button
              onClick={() => {
                navigator.clipboard.writeText(newOrgJoinCode);
                setCodeCopied(true);
                setTimeout(() => setCodeCopied(false), 2500);
              }}
              className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-lg transition-colors"
            >
              {codeCopied
                ? <><CheckCircle className="w-4 h-4" /> Copied!</>
                : <><Copy className="w-4 h-4" /> Copy Code</>}
            </button>
          </div>
          <div className="bg-gray-50 rounded-xl p-4 text-left space-y-2 mb-6">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">How to use it</p>
            <p className="text-sm text-gray-700">📢 Share this code with your learners <span className="font-semibold">before</span> they sign up.</p>
            <p className="text-sm text-gray-700">📝 During signup, they enter this code to join <span className="font-semibold">{newOrgName}</span>.</p>
            <p className="text-sm text-gray-700">🔑 You can always find this code on your <span className="font-semibold">Profile page</span>.</p>
          </div>
          <button
            onClick={onComplete}
            className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl transition-colors text-base"
          >
            Got it — go to my dashboard!
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full max-h-[95vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex items-center mb-6">
            <div className="p-3 bg-blue-100 rounded-full mr-4">
              <User className="h-6 w-6 text-blue-600" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-gray-900">Complete Your Profile</h2>
              <p className="text-sm text-gray-500">Help us personalize your experience</p>
            </div>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">{error}</div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">

            {/* ── Role picker ─────────────────────────────────────────────── */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <GraduationCap className="inline mr-1" size={15} /> I am a: *
              </label>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { value: 'student',      label: 'Student / Learner',  desc: 'I have a join code from my teacher' },
                  { value: 'site_leader',  label: 'Teacher / Educator', desc: 'I lead a learning group' },
                ].map(opt => (
                  <label key={opt.value}
                    className={'flex flex-col p-3 border-2 rounded-lg cursor-pointer transition-colors ' +
                      (role === opt.value ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-blue-300')}>
                    <input type="radio" name="role" value={opt.value} checked={role === opt.value}
                      onChange={() => setRole(opt.value as 'student' | 'site_leader')} className="sr-only" />
                    <span className="text-sm font-semibold text-gray-900">{opt.label}</span>
                    <span className="text-xs text-gray-500 mt-0.5">{opt.desc}</span>
                  </label>
                ))}
              </div>
              <p className="mt-2 text-xs text-gray-400 italic">
                Research leads and platform administrators are assigned by an admin after signup.
              </p>
            </div>

            {/* ── Name (everyone) ─────────────────────────────────────────── */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Full Name *</label>
              <input type="text" value={name} onChange={e => setName(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                placeholder="Enter your full name" required />
            </div>

            {/* ══════════════════════════════════════════════════════════════
                LEARNER FLOW
            ══════════════════════════════════════════════════════════════ */}
            {role === 'student' && (
              <>
                {/* Join code */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    <Key className="inline mr-1" size={14} /> Organization Join Code
                    <span className="text-gray-400 font-normal ml-1">(optional — ask your leader)</span>
                  </label>
                  <input type="text" value={joinCode}
                    onChange={e => handleJoinCodeChange(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 font-mono tracking-widest uppercase"
                    placeholder="e.g. DAV001" maxLength={6} />

                  {joinCodeStatus === 'checking' && (
                    <p className="mt-1.5 text-xs text-gray-400">Looking up code…</p>
                  )}
                  {joinCodeStatus === 'found' && orgCtx && (
                    <div className="mt-2 p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
                      <p className="text-sm font-semibold text-emerald-800">✓ {orgCtx.name}</p>
                      <p className="text-xs text-emerald-600 mt-0.5">
                        {[orgCtx.city, orgCtx.state, orgCtx.country].filter(Boolean).join(', ')}
                      </p>
                      {(orgCtx.learner_age_min || orgCtx.learner_age_max) && (
                        <p className="text-xs text-emerald-600">
                          Ages {orgCtx.learner_age_min}–{orgCtx.learner_age_max}
                        </p>
                      )}
                    </div>
                  )}
                  {joinCodeStatus === 'not_found' && joinCode.length === 6 && (
                    <p className="mt-1.5 text-sm text-red-600">Code not found — check with your leader</p>
                  )}
                </div>

                {/* Gender — only shown if org has mixed genders or no org */}
                {learnerNeedsGender && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Gender *</label>
                    <div className="flex gap-4">
                      {(['female', 'male', 'other'] as const).map(g => (
                        <label key={g} className="flex items-center">
                          <input type="radio" name="gender" value={g}
                            checked={gender === g} onChange={() => setGender(g)}
                            className="mr-2" required />
                          <span className="text-sm capitalize">{g}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                {/* Level — only shown if no org code (or org found but we still need grade) */}
                {!orgCtx && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Level *</label>
                    <div className="space-y-2">
                      {[
                        { v: '1', label: 'Elementary (Ages 8–11)' },
                        { v: '2', label: 'Middle School (Ages 11–14)' },
                        { v: '3', label: 'High School (Ages 14–18)' },
                        { v: '4', label: 'Adult Learner (18+)' },
                      ].map(g => (
                        <label key={g.v} className="flex items-center">
                          <input type="radio" name="grade_level" value={g.v}
                            checked={gradeLevel === g.v} onChange={() => setGradeLevel(g.v)}
                            className="mr-3" />
                          <span className="text-sm">{g.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                {/* If no org, show full location fields */}
                {!orgCtx && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Continent</label>
                      <select value={continent}
                        onChange={e => { setContinent(e.target.value); setCountry(''); setCity(''); }}
                        className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 bg-white">
                        <option value="">Select a continent (optional)</option>
                        {CONTINENTS.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                    {continent && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          <Globe className="inline mr-1" size={14} /> Country
                        </label>
                        <select value={country} onChange={e => setCountry(e.target.value)}
                          className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 bg-white">
                          <option value="">Select a country</option>
                          {(COUNTRIES_BY_CONTINENT[continent] ?? []).map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </div>
                    )}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        <MapPin className="inline mr-1 text-green-600" size={14} /> City / Town
                      </label>
                      <input type="text" value={city} onChange={e => setCity(e.target.value)}
                        className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                        placeholder="Optional" />
                    </div>
                  </>
                )}
              </>
            )}

            {/* ══════════════════════════════════════════════════════════════
                LEADER FLOW
            ══════════════════════════════════════════════════════════════ */}
            {role === 'site_leader' && (
              <>
                {/* Gender */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Your Gender *</label>
                  <div className="flex gap-4">
                    {(['female', 'male', 'other'] as const).map(g => (
                      <label key={g} className="flex items-center">
                        <input type="radio" name="gender" value={g}
                          checked={gender === g} onChange={() => setGender(g)}
                          className="mr-2" required />
                        <span className="text-sm capitalize">{g}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* ── Join or Create choice ─────────────────────────────── */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    <Building2 className="inline mr-1" size={14} /> Organization *
                  </label>
                  <div className="grid grid-cols-2 gap-3 mb-3">
                    {([
                      { mode: 'create' as LeaderOrgMode, Icon: PlusCircle, label: 'Register My Organization', desc: 'I am the primary leader — set up a new org' },
                      { mode: 'join'   as LeaderOrgMode, Icon: Search,     label: 'Join as Co-Facilitator',   desc: 'Another leader already registered — I have a join code' },
                    ]).map(({ mode, Icon, label, desc }) => (
                      <button key={mode} type="button"
                        onClick={() => setLeaderOrgMode(mode)}
                        className={'flex flex-col items-start p-3 border-2 rounded-lg text-left transition-colors ' +
                          (leaderOrgMode === mode
                            ? 'border-indigo-500 bg-indigo-50'
                            : 'border-gray-200 hover:border-indigo-300')}>
                        <span className={'flex items-center gap-1.5 text-sm font-semibold mb-0.5 ' +
                          (leaderOrgMode === mode ? 'text-indigo-700' : 'text-gray-800')}>
                          <Icon size={13} />{label}
                        </span>
                        <span className="text-xs text-gray-500 leading-snug">{desc}</span>
                      </button>
                    ))}
                  </div>

                  {/* ── Join existing org ────────────────────────────────── */}
                  {leaderOrgMode === 'join' && (
                    <div className="space-y-3 p-4 bg-indigo-50 rounded-xl border border-indigo-100">
                      <p className="text-xs text-indigo-700 font-medium">
                        Enter a join code from the primary leader of the organization you are co-facilitating.
                        Your view will be scoped to learners who joined using this specific code.
                      </p>
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">
                          <Key className="inline mr-1" size={12} /> Organization Join Code *
                        </label>
                        <input type="text" value={coJoinCode}
                          onChange={e => handleCoJoinCodeChange(e.target.value)}
                          className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 font-mono tracking-widest uppercase text-sm"
                          placeholder="e.g. DAV001" maxLength={6} />
                        {coJoinStatus === 'checking' && (
                          <p className="mt-1.5 text-xs text-gray-400">Looking up code…</p>
                        )}
                        {coJoinStatus === 'found' && coOrgCtx && (
                          <div className="mt-2 p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
                            <p className="text-sm font-semibold text-emerald-800">✓ {coOrgCtx.name}</p>
                            <p className="text-xs text-emerald-600 mt-0.5">
                              {[coOrgCtx.city, coOrgCtx.state, coOrgCtx.country].filter(Boolean).join(', ')}
                            </p>
                            <p className="text-xs text-indigo-600 mt-1.5">
                              You will be added as a co-facilitator. The primary leader remains unchanged.
                            </p>
                          </div>
                        )}
                        {coJoinStatus === 'not_found' && coJoinCode.length === 6 && (
                          <p className="mt-1.5 text-sm text-red-600">Code not found — check with the primary leader</p>
                        )}
                      </div>
                    </div>
                  )}

                  {/* ── Create new org ────────────────────────────────────── */}
                  {leaderOrgMode === 'create' && (
                    <div className="space-y-4 p-4 bg-indigo-50 rounded-xl border border-indigo-100">
                      <div className="text-xs font-semibold text-indigo-800 flex items-center gap-2">
                        <Building2 size={13} /> New Organization Details
                      </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Organization Name *</label>
                    <input type="text" value={orgName} onChange={e => setOrgName(e.target.value)}
                      className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 text-sm"
                      placeholder="e.g. Davidson AI Innovation Center" />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Brief Description (optional)</label>
                    <input type="text" value={orgDescription} onChange={e => setOrgDescription(e.target.value)}
                      className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 text-sm"
                      placeholder="What does your group do?" />
                  </div>

                  {/* ── Organization Logo ──────────────────────────────────── */}
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      <Upload className="inline mr-1" size={12} /> Organization Logo (optional)
                    </label>
                    <div className="flex items-center gap-3">
                      {logoPreview && (
                        <img src={logoPreview} alt="Logo preview"
                          className="w-14 h-14 object-contain rounded-lg border border-gray-200 bg-white p-1" />
                      )}
                      <label className="flex-1 cursor-pointer">
                        <div className="w-full px-3 py-2 border-2 border-dashed border-indigo-200 rounded-lg
                                        text-xs text-indigo-500 hover:border-indigo-400 hover:bg-indigo-50
                                        transition-colors text-center">
                          {logoFile ? logoFile.name : 'Click to upload PNG, JPG, or SVG'}
                        </div>
                        <input type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp"
                          onChange={handleLogoChange} className="sr-only" />
                      </label>
                      {logoFile && (
                        <button type="button" onClick={() => { setLogoFile(null); setLogoPreview(null); }}
                          className="text-xs text-red-400 hover:text-red-600">Remove</button>
                      )}
                    </div>
                    <p className="text-xs text-gray-400 mt-1">
                      Your logo will appear across the platform for your learners.
                    </p>
                  </div>

                  {/* ── Community Context ──────────────────────────────────── */}
                  <div className="space-y-3 pt-1">
                    <p className="text-xs font-semibold text-indigo-700">
                      Community Context <span className="font-normal text-gray-400">(optional — helps personalize learning activities)</span>
                    </p>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">
                        🌾 How do people in your community make their livelihood?
                      </label>
                      <textarea value={communityLivelihood} onChange={e => setCommunityLivelihood(e.target.value)}
                        rows={2}
                        className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 text-xs resize-none"
                        placeholder="e.g. Fishing, farming, small-scale trading, oil industry work…" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">
                        ⚡ What are the main challenges your community faces?
                      </label>
                      <textarea value={communityChallenges} onChange={e => setCommunityChallenges(e.target.value)}
                        rows={2}
                        className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 text-xs resize-none"
                        placeholder="e.g. Limited electricity access, youth unemployment, flood risk…" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">
                        🌟 What are your community's hopes for the future?
                      </label>
                      <textarea value={communityHopes} onChange={e => setCommunityHopes(e.target.value)}
                        rows={2}
                        className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 text-xs resize-none"
                        placeholder="e.g. AI-powered income opportunities, better healthcare access, youth empowerment…" />
                    </div>
                  </div>

                  {/* Learner demographics */}
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-2">Learner Age Range *</label>
                    <div className="flex items-center gap-2">
                      <input type="number" value={ageMin} onChange={e => setAgeMin(e.target.value)}
                        className="w-20 px-2 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 text-sm text-center"
                        placeholder="Min" min={3} max={99} />
                      <span className="text-gray-400 text-sm">to</span>
                      <input type="number" value={ageMax} onChange={e => setAgeMax(e.target.value)}
                        className="w-20 px-2 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 text-sm text-center"
                        placeholder="Max" min={3} max={99} />
                      <span className="text-gray-400 text-xs">years old</span>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-2">Learner Gender *</label>
                    <div className="flex gap-4">
                      {([
                        { v: 'female', label: 'Female only' },
                        { v: 'male',   label: 'Male only'   },
                        { v: 'both',   label: 'Both'        },
                      ] as const).map(g => (
                        <label key={g.v} className="flex items-center">
                          <input type="radio" name="learner_gender" value={g.v}
                            checked={learnerGender === g.v} onChange={() => setLearnerGender(g.v)}
                            className="mr-2" />
                          <span className="text-xs">{g.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                      <p className="text-xs text-indigo-600">
                        After completing your profile you will receive a unique 6-character join code to share with your learners.
                        You can generate additional codes later from your Profile page.
                      </p>
                    </div>
                  )}
                </div>

                {/* Location — only for leaders creating a new org */}
                {leaderOrgMode === 'create' && (<>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Continent *</label>
                  <select value={continent}
                    onChange={e => { setContinent(e.target.value); setCountry(''); setState(''); setCity(''); }}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 bg-white" required>
                    <option value="">Select a continent</option>
                    {CONTINENTS.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>

                {continent && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      <Globe className="inline mr-1" size={14} /> Country *
                    </label>
                    <select value={country}
                      onChange={e => { setCountry(e.target.value); setState(''); setCity(''); }}
                      className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 bg-white" required>
                      <option value="">Select a country</option>
                      {(COUNTRIES_BY_CONTINENT[continent] ?? []).map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    <MapPin className="inline mr-1" size={14} /> State / Province
                  </label>
                  {country === 'Nigeria' ? (
                    <select value={state}
                      onChange={e => { setState(e.target.value); setCity(NIGERIA_STATE_CITY_MAP[e.target.value] ?? ''); }}
                      className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 bg-white">
                      <option value="">-- Select a state --</option>
                      {NIGERIA_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  ) : (
                    <input type="text" value={state} onChange={e => setState(e.target.value)}
                      className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                      placeholder="Optional" />
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    <MapPin className="inline mr-1 text-green-600" size={14} /> City / Town / Village *
                  </label>
                  <input type="text" value={city} onChange={e => setCity(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                    placeholder="Enter your city, town, or village" />
                </div>
                </>)}
              </>
            )}

            <div className="pt-2">
              <button type="submit" disabled={isSubmitting}
                className="w-full bg-blue-600 text-white py-3 rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium transition-colors">
                {isSubmitting
                  ? 'Completing...'
                  : role === 'site_leader' && leaderOrgMode === 'create'
                  ? 'Register Organization & Complete Profile'
                  : role === 'site_leader' && leaderOrgMode === 'join'
                  ? 'Join as Co-Facilitator & Complete Profile'
                  : 'Complete Profile'}
              </button>
            </div>
          </form>

          <div className="mt-4 text-xs text-gray-400 text-center">Signed in as: {email}</div>
        </div>
      </div>
    </div>
  );
};

export default ProfileCompletionPopup;