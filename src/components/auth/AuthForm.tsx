import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { findSimilarProfile, sendDuplicateResetLink, type SimilarProfileMatch } from '../../lib/duplicateDetection';
import Button from '../ui/Button';
import Input from '../ui/Input';
import { Eye, EyeOff } from 'lucide-react';
import { passwordProblem, friendlyPasswordError, PASSWORD_RULE_TEXT } from '../../lib/passwordRules';

interface AuthFormProps {
  mode: 'login' | 'signup';
}

const AuthForm: React.FC<AuthFormProps> = ({ mode }) => {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [view, setView] = useState<'form' | 'magic-link-sent'>('form');
  const [similarMatch, setSimilarMatch] = useState<SimilarProfileMatch | null>(null);
  const [confirmNew, setConfirmNew] = useState(false);

  // ─── Duplicate email check ────────────────────────────────────────────────
  // Runs pre-auth (anon), so it goes through a SECURITY DEFINER RPC rather
  // than a direct table query — profiles has RLS enabled and the anon role
  // has no policy granting it visibility into other users' rows.
  const emailAlreadyExists = async (email: string): Promise<boolean> => {
    const { data, error } = await supabase.rpc('check_email_exists', { p_email: email });

    if (error) {
      console.error('Email existence check failed:', error);
      return false;
    }
    return !!data;
  };

  const handleForgotPassword = async () => {
    if (!email) {
      setError('Please enter your email address above first.');
      return;
    }

    try {
      setLoading(true);
      setError('');

      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/reset-password`,
        },
      });

      if (error) throw error;
      setView('magic-link-sent');
    } catch (err: any) {
      setError(err?.message || 'Failed to send reset link. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // ─── "That's me" — send reset link to the matched canonical email ──────────
  const handleThatsMe = async () => {
    if (!similarMatch) return;
    try {
      setLoading(true);
      setError('');
      await sendDuplicateResetLink(similarMatch.id, { email });
      setSimilarMatch(null);
      setView('magic-link-sent');
    } catch (err: any) {
      setError(err?.message || 'Failed to send reset link. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // ─── Main auth handler ────────────────────────────────────────────────────
  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      if (mode === 'signup') {
        const problem = passwordProblem(password);
        if (problem) {
          setError(problem);
          setLoading(false);
          return;
        }

        // 1. Exact email match — hard block
        const exists = await emailAlreadyExists(email);
        if (exists) {
          setError(
            'An account with this email already exists. Please sign in instead.'
          );
          setLoading(false);
          return;
        }

        // 2. Fuzzy match — warn and let user decide. No organization is known
        // yet at this point in signup, so this only checks email similarity
        // (name matching needs an org scope — see ProfileCompletionPopup).
        if (!similarMatch) {
          const match = await findSimilarProfile({ email });
          if (match) {
            setSimilarMatch(match);
            setLoading(false);
            return; // pause signup — UI will render the confirmation prompt
          }
        }
        // If similarMatch is already set, user clicked "No, continue" — proceed

        const { data, error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { username, role: 'student' },
          },
        });

        if (signUpError) throw signUpError;
        console.log('Signup successful, awaiting email confirmation:', data);
        navigate('/auth/confirmation');
      } else {
        const { data: loginData, error: signInError } =
          await supabase.auth.signInWithPassword({ email, password });

        if (signInError) throw signInError;
        console.log('Login successful:', loginData);
        // Track unique visitor
        if (loginData.user?.email && loginData.user?.id) {
        }
        navigate('/home');
      }
    } catch (err: any) {
      console.error('Authentication error:', err);

      const raw: string = err?.message || '';
      let friendly = 'An unexpected error occurred. Please try again.';

      if (raw.includes('Invalid login credentials')) {
        friendly = 'Incorrect email or password. Please try again.';
      } else if (raw.includes('Email not confirmed')) {
        friendly =
          'Please confirm your email before signing in. Check your inbox for the confirmation link.';
      } else if (raw.includes('User already registered')) {
        friendly = 'An account with this email already exists. Please sign in instead.';
      } else if (friendlyPasswordError(raw)) {
        friendly = friendlyPasswordError(raw)!;
      } else if (raw) {
        friendly = raw;
      }

      setError(friendly);
    } finally {
      setLoading(false);
    }
  };

  // ─── OAuth ────────────────────────────────────────────────────────────────
  const handleOAuthLogin = async (provider: 'google') => {
    try {
      setError('');
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo: `${window.location.origin}/auth/callback` },
      });
      if (error) throw error;
    } catch (err: any) {
      setError(err?.message || 'OAuth login failed. Please try again.');
    }
  };

  // ─── Magic link sent confirmation ─────────────────────────────────────────
  if (view === 'magic-link-sent') {
    return (
      <div className="text-center stack-y-4">
        <h3 className="text-lg font-semibold text-gray-900">Check your email</h3>
        <p className="text-gray-600 text-sm">
          We sent a password reset link to <strong>{email}</strong>.<br />
          Click the link in the email to set a new password.
        </p>
        <Button variant="outline" onClick={() => setView('form')}>
          Back to sign in
        </Button>
      </div>
    );
  }

  // ─── Similar account warning ──────────────────────────────────────────────
  if (mode === 'signup' && similarMatch) {
    return (
      <div className="max-w-md w-full stack-y-6">
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-5 stack-y-3">
          <div className="flex items-start gap-3">
            <span className="text-amber-500 text-xl mt-0.5">⚠️</span>
            <div>
              <h3 className="font-semibold text-gray-900 text-sm">
                You may already have an account
              </h3>
              <p className="text-gray-600 text-sm mt-1">
                We found an existing account that looks similar to the details
                you entered. It's registered to{' '}
                <strong className="font-mono">{similarMatch.maskedEmail}</strong>.
              </p>
              <p className="text-gray-600 text-sm mt-2">
                Is that you? If so, you don't need a new account — just reset
                your password and sign in.
              </p>
            </div>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-800 p-3 rounded-md text-sm">
              {error}
            </div>
          )}

          <div className="flex flex-col gap-2 pt-1">
            <Button
              type="button"
              fullWidth
              isLoading={loading}
              onClick={handleThatsMe}
            >
              Yes, that's me — send me a password reset link
            </Button>
            {!confirmNew ? (
              <button
                type="button"
                onClick={() => setConfirmNew(true)}
                className="text-xs text-gray-500 underline hover:text-gray-700 text-center"
              >
                No, I am a new user
              </button>
            ) : (
              <div className="rounded-lg border border-gray-200 bg-white p-3 text-center">
                <p className="text-xs text-gray-700">
                  Are you sure? Two accounts split your work in half. If you have ever signed up before, reset your password instead.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setSimilarMatch(null);
                    setConfirmNew(false);
                    // Re-submit the form now that user has confirmed they're new
                    handleAuth({ preventDefault: () => {} } as React.FormEvent);
                  }}
                  className="mt-2 text-xs text-gray-600 underline hover:text-gray-800"
                >
                  Yes, I have never signed up before. Continue.
                </button>
              </div>
            )}
            <button
              type="button"
              className="text-sm text-gray-400 hover:text-gray-600 text-center mt-1"
              onClick={() => setSimilarMatch(null)}
            >
              ← Back
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ─── Main form ────────────────────────────────────────────────────────────
  return (
    <div className="max-w-md w-full stack-y-8">
      <div>
        <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
          {mode === 'login' ? 'Sign in to your account' : 'Create a new account'}
        </h2>
        <p className="mt-2 text-center text-sm text-gray-600">
          {mode === 'login' ? (
            <>
              Or{' '}
              <a
                href="/signup"
                className="font-medium text-blue-600 hover:text-blue-500"
                onClick={(e) => { e.preventDefault(); navigate('/signup'); }}
              >
                create a new account
              </a>
            </>
          ) : (
            <>
              Already have an account?{' '}
              <a
                href="/login"
                className="font-medium text-blue-600 hover:text-blue-500"
                onClick={(e) => { e.preventDefault(); navigate('/login'); }}
              >
                Sign in
              </a>
            </>
          )}
        </p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-800 p-4 rounded-md text-sm">
          {error}
        </div>
      )}

      <form className="mt-8 stack-y-6" onSubmit={handleAuth}>
        {mode === 'signup' && (
          <Input
            label="Username"
            id="username"
            name="username"
            type="text"
            autoComplete="username"
            required
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            fullWidth
          />
        )}

        <Input
          label="Email address"
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          fullWidth
        />

        {/* Password field with show/hide toggle */}
        <div className="relative">
          <Input
            label="Password"
            id="password"
            name="password"
            type={showPassword ? 'text' : 'password'}
            autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            fullWidth
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            className="absolute right-3 top-9 text-gray-400 hover:text-gray-600"
            aria-label={showPassword ? 'Hide password' : 'Show password'}
          >
            {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>

          {mode === 'signup' && (
            <p className="mt-1 text-xs text-gray-500">{PASSWORD_RULE_TEXT}</p>
          )}

        </div>

        <div>
          <Button type="submit" fullWidth isLoading={loading} size="lg">
            {mode === 'login' ? 'Sign in' : 'Sign up'}
          </Button>
        </div>

        {mode === 'login' && (
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-center">
            <p className="text-sm text-blue-900">Forgot your password? Do not make a new account.</p>
            <button
              type="button"
              onClick={handleForgotPassword}
              className="mt-2 w-full rounded-lg bg-white border border-blue-600 text-blue-700 font-semibold py-2 text-sm hover:bg-blue-100"
            >
              Email me a link to reset my password
            </button>
            <p className="mt-1 text-xs text-blue-800">Type your email address above first.</p>
          </div>
        )}
        {mode === 'signup' && (
          <p className="text-xs text-gray-600 text-center">
            Already joined before? Do not make a second account. Go back to sign in and use "Email me a link to reset my password".
          </p>
        )}
      </form>

      {/* OAuth */}
      <div className="mt-6">
        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-gray-300" />
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="px-2 bg-white text-gray-500">Or continue with</span>
          </div>
        </div>

        <div className="mt-6">
          <Button
            type="button"
            variant="outline"
            onClick={() => handleOAuthLogin('google')}
            fullWidth
          >
            Google
          </Button>
        </div>
      </div>
    </div>
  );
};

export default AuthForm;