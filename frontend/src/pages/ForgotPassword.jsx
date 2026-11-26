/**
 * src/pages/ForgotPassword.jsx
 * ----------------------------
 * Editorial Clinical Password Reset Request Page.
 */

import React, { useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import authService from '../services/authService';
import { BrandLogo } from '../components/common/Navbar';

const ForgotPassword = () => {
  const { user, isAuthenticated, getDashboardPath } = useAuth();

  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [devPreview, setDevPreview] = useState(null);

  if (isAuthenticated && user) {
    return <Navigate to={getDashboardPath(user.role)} replace />;
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');
    try {
      setLoading(true);
      const res = await authService.requestPasswordReset(email.trim());
      setMessage(res.message);
      if (res.dev_preview) setDevPreview(res.dev_preview);
    } catch (err) {
      setError(err.response?.data?.detail || 'Unable to process password reset right now.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-surface flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md space-y-6">
        <div className="flex justify-center">
          <BrandLogo size="lg" />
        </div>

        <div className="editorial-card p-7 sm:p-8 space-y-5">
          <div className="space-y-1">
            <p className="editorial-eyebrow">Account Recovery</p>
            <h1 className="font-display text-xl font-bold text-ink">Reset Your Password</h1>
            <p className="text-xs text-muted leading-relaxed">
              Enter your registered email address and we will send password reset instructions.
            </p>
          </div>

          {message && (
            <div className="p-3.5 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-clinical-success space-y-2">
              <p className="font-semibold">{message}</p>
              {devPreview && (
                <Link
                  to={`/reset-password/${devPreview.uid}/${devPreview.token}`}
                  className="inline-block font-bold text-cobalt underline"
                >
                  Open Dev Mode Reset Link →
                </Link>
              )}
            </div>
          )}

          {error && (
            <div className="p-3.5 rounded-lg bg-rose-50 border border-rose-200 text-xs text-clinical-danger font-medium">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-ink mb-1.5">Email Address</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="editorial-input"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full editorial-btn-primary py-2.5 text-sm"
            >
              {loading ? 'Sending Reset Email...' : 'Send Password Reset Link'}
            </button>
          </form>

          <div className="pt-3 border-t border-hairline text-center text-xs">
            <Link to="/login" className="text-cobalt font-semibold hover:underline">
              ← Back to Sign In
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ForgotPassword;
