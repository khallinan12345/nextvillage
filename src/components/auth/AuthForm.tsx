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

  // ─── Active user tracking on component mount ──────────────────────────────
  useEffect(() => {
    const trackActiveUser = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        try {
          await supabase
            .from('visitor_logs')
            .upsert(
              { id: session.user.id, email: session.user.email, created_at: new Date().toISOString() },
              { onConflict: 'id' }
            );
          console.log("Unique visitor tracked!");
        } catch (err) {
          console.error("Tracking error:", err);
        }
      }
    };
    trackActiveUser();
  }, []);

  // ─── Visitor tracking ─────────────────────────────────────────────────────
  const logVisitor = async (userEmail: string, userId: string) => {
    try {
      await supabase
        .from('visitor_logs')
        .upsert(
          { id: userId, email: userEmail, created_at: new Date().toISOString() },
          { onConflict: 'id' }
        );
      console.log("Unique visitor tracked successfully!");
    } catch (err) {
      console.error("Tracking error:", err);
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

  // ─── Forgot password (magic link to reset page) ───────────────────────────
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

  // ─── Main auth handler ────────────────────────────────────────────────────
  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      if (mode === 'signup') {
        const exists = await emailAlreadyExists(email);
        if (exists) {
          setError(
            'An account with this email already exists. Please sign in instead.'
          );
          setLoading(false);
          return;
        }

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
          await logVisitor(loginData.user.email, loginData.user.id);
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
