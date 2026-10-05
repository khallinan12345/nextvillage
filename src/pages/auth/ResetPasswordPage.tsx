import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import { Eye, EyeOff } from 'lucide-react';
import { passwordProblem, friendlyPasswordError, PASSWORD_MIN_LENGTH, PASSWORD_RULE_TEXT } from '../../lib/passwordRules';

const ResetPasswordPage: React.FC = () => {
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const problem = passwordProblem(password);
    if (problem) {
      setError(problem);
      return;
    }

    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }

    try {
      setLoading(true);

      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;

      setSuccess(true);
      setTimeout(() => navigate('/home'), 2500);
    } catch (err: any) {
      const raw = err?.message || '';
      setError(friendlyPasswordError(raw) || raw || 'Failed to reset password. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
        <div className="sm:mx-auto sm:w-full sm:max-w-md">
          <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10 text-center">
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Password updated!</h2>
            <p className="text-gray-600">Redirecting you to the app…</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <h1 className="text-center text-3xl font-extrabold text-blue-600">
          AI'ing & Vibing
        </h1>
        <p className="mt-2 text-center text-sm text-gray-600">Set a new password</p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-800 p-4 rounded-md text-sm mb-6">
              {error}
            </div>
          )}

          <form onSubmit={handleReset} className="space-y-6">
            {/* New password */}
            <div className="relative">
              <Input
                label="New password"
                id="password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
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
              <p className="mt-1 text-xs text-gray-500">{PASSWORD_RULE_TEXT}</p>
            </div>

            {/* Confirm password */}
            <div className="relative">
              <Input
                label="Confirm new password"
                id="confirm"
                name="confirm"
                type={showConfirm ? 'text' : 'password'}
                autoComplete="new-password"
                required
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                fullWidth
              />
              <button
                type="button"
                onClick={() => setShowConfirm((v) => !v)}
                className="absolute right-3 top-9 text-gray-400 hover:text-gray-600"
                aria-label={showConfirm ? 'Hide password' : 'Show password'}
              >
                {showConfirm ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>

              {/* Live match indicator */}
              {confirm.length > 0 && (
                <p
                  className={`mt-1 text-xs font-medium ${
                    password === confirm ? 'text-green-600' : 'text-red-500'
                  }`}
                >
                  {password === confirm ? '✓ Passwords match' : '✗ Passwords do not match'}
                </p>
              )}
            </div>

            <Button
              type="submit"
              fullWidth
              isLoading={loading}
              size="lg"
              disabled={password !== confirm || password.length < PASSWORD_MIN_LENGTH}
            >
              Reset password
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default ResetPasswordPage;
