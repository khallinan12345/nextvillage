import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import Button from '../ui/Button';
import Input from '../ui/Input';
import { Github, Eye, EyeOff } from 'lucide-react';

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
  const [similarMatch, setSimilarMatch] = useState<{ maskedEmail: string; rawEmail: string } | null>(null);

  // ─── Active user tracking on component mount ──────────────────────────────
  useEffect(() => {
  }, []);

  // ─── Visitor tracking ─────────────────────────────────────────────────────
    }
  };

  // ─── Duplicate email check ────────────────────────────────────────────────
  const emailAlreadyExists = async (email: string): Promise<boolean> => {
    const { data, error } = await supabase
      .from('profiles')
      .select('id')
      .eq('email', email)
      .maybeSingle();

    if (error) {
      console.error('Email existence check failed:', error);
      return false;
    }
    return !!data;
  };

  // ─── Fuzzy duplicate check ────────────────────────────────────────────────
  // Returns the best-matching canonical email if a near-duplicate is found,
  // or null if the user appears genuinely new.
  const findSimilarAccount = async (
    inputEmail: string,
    inputName: string
  ): Promise<{ maskedEmail: string; rawEmail: string } | null> => {
    const emailLocal = inputEmail.split('@')[0].toLowerCase();
    const nameLower  = inputName.trim().toLowerCase();

    // Fetch all active profiles — small table, acceptable for now
    const { data, error } = await supabase
      .from('profiles')
      .select('email, name')
      .eq('is_active', true);

    if (error || !data) return null;

    // Levenshtein distance (simple iterative implementation)
    const lev = (a: string, b: string): number => {
      const m = a.length, n = b.length;
      const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
        Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
      );
      for (let i = 1; i <= m; i++)
        for (let j = 1; j <= n; j++)
          dp[i][j] = a[i-1] === b[j-1]
            ? dp[i-1][j-1]
            : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
      return dp[m][n];
    };

    const maskEmail = (e: string) => {
      const [local, domain] = e.split('@');
      if (!domain) return e;
      const visible = local.slice(0, 2);
      return `${visible}${'*'.repeat(Math.max(local.length - 2, 2))}@${domain}`;
    };

    for (const profile of data) {
      if (!profile.email) continue;
      const profileLocal = profile.email.split('@')[0].toLowerCase();
      const profileName  = (profile.name ?? '').toLowerCase();

      // Same email local part (different domain suffix e.g. gmail.co vs gmail.com)
      const sameLocal = profileLocal === emailLocal;
      // Email local part within 2 edits (typo tolerance)
      const emailClose = lev(emailLocal, profileLocal) <= 2;
      // Name match: exact or within 2 edits (handles "Princss" vs "Princess")
      const nameMatch = nameLower.length >= 3 &&
        (profileName === nameLower || lev(profileName, nameLower) <= 2);

      if (sameLocal || emailClose || nameMatch) {
        return { maskedEmail: maskEmail(profile.email), rawEmail: profile.email };
      }
    }
    return null;
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
      const { error } = await supabase.auth.signInWithOtp({
        email: similarMatch.rawEmail,
        options: { emailRedirectTo: `${window.location.origin}/auth/reset-password` },
      });
      if (error) throw error;
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
        // 1. Exact email match — hard block
        const exists = await emailAlreadyExists(email);
        if (exists) {
          setError(
            'An account with this email already exists. Please sign in instead.'
          );
          setLoading(false);
          return;
        }

        // 2. Fuzzy match — warn and let user decide
        if (!similarMatch) {
          const match = await findSimilarAccount(email, username);
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
      } else if (raw.includes('Password should be')) {
        friendly = 'Password must be at least 6 characters.';
      } else if (raw) {
        friendly = raw;
      }

      setError(friendly);
    } finally {
      setLoading(false);
    }
  };

  // ─── OAuth ────────────────────────────────────────────────────────────────
  const handleOAuthLogin = async (provider: 'google' | 'github') => {
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
      <div className="text-center space-y-4">
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
      <div className="max-w-md w-full space-y-6">
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-5 space-y-3">
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
            <Button
              type="button"
              variant="outline"
              fullWidth
              onClick={() => {
                setSimilarMatch(null);
                // Re-submit the form now that user has confirmed they're new
                handleAuth({ preventDefault: () => {} } as React.FormEvent);
              }}
            >
              No, I'm a new user — continue signing up
            </Button>
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
    <div className="max-w-md w-full space-y-8">
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

      <form className="mt-8 space-y-6" onSubmit={handleAuth}>
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

          {/* Forgot password link — login mode only */}
          {mode === 'login' && (
            <div className="mt-2 text-right">
              <button
                type="button"
                onClick={handleForgotPassword}
                className="text-sm text-blue-600 hover:text-blue-500 font-medium"
              >
                Forgot your password?
              </button>
            </div>
          )}
        </div>

        <div>
          <Button type="submit" fullWidth isLoading={loading} size="lg">
            {mode === 'login' ? 'Sign in' : 'Sign up'}
          </Button>
        </div>
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

        <div className="mt-6 grid grid-cols-2 gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => handleOAuthLogin('google')}
            fullWidth
          >
            Google
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => handleOAuthLogin('github')}
            icon={<Github size={16} />}
            fullWidth
          >
            GitHub
          </Button>
        </div>
      </div>
    </div>
  );
};

export default AuthForm;