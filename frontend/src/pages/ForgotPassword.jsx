/**
 * src/pages/ForgotPassword.jsx
 * ----------------------------
 * Initiates secure password reset email dispatch.
 */

import React, { useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import authService from '../services/authService';

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
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md bg-white p-8 rounded-2xl border border-slate-200 shadow-sm">
        <h2 className="text-xl font-bold text-slate-900 mb-1">Reset Your Password</h2>
        <p className="text-xs text-slate-500 mb-5">
          Enter your registered email address and we will send password reset instructions.
        </p>

        {message && (
          <div className="mb-4 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 space-y-2">
            <p className="font-semibold">{message}</p>
            {devPreview && (
              <Link
                to={`/reset-password/${devPreview.uid}/${devPreview.token}`}
                className="inline-block font-bold text-blue-700 underline"
              >
                Dev Mode Reset Link →
              </Link>
            )}
          </div>
        )}

        {error && (
          <div className="mb-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700 font-medium">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Email Address</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold disabled:opacity-50 transition cursor-pointer"
          >
            {loading ? 'Sending Reset Email...' : 'Send Password Reset Link'}
          </button>
        </form>

        <div className="mt-5 text-center text-xs">
          <Link to="/login" className="text-blue-600 font-semibold hover:underline">
            ← Back to Sign In
          </Link>
        </div>
      </div>
    </div>
  );
};

export default ForgotPassword;
