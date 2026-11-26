/**
 * src/pages/ResetPassword.jsx
 * ---------------------------
 * Editorial Clinical Password Reset Confirmation Page.
 */

import React, { useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import authService from '../services/authService';
import { BrandLogo } from '../components/common/Navbar';

const ResetPassword = () => {
  const { uid, token } = useParams();
  const navigate = useNavigate();

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    try {
      setLoading(true);
      const res = await authService.confirmPasswordReset({
        uid,
        token,
        new_password: newPassword,
        confirm_password: confirmPassword,
      });
      setSuccess(res.message);
      setTimeout(() => navigate('/login'), 2000);
    } catch (err) {
      const data = err.response?.data;
      if (data?.new_password) {
        setError(Array.isArray(data.new_password) ? data.new_password[0] : data.new_password);
      } else {
        setError(data?.detail || 'Invalid or expired password reset link.');
      }
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
            <p className="editorial-eyebrow">Credential Update</p>
            <h1 className="font-display text-xl font-bold text-ink">Choose New Strong Password</h1>
            <p className="text-xs text-muted leading-relaxed">
              Minimum 8 characters with uppercase, lowercase, and a number or symbol.
            </p>
          </div>

          {success && (
            <div className="p-3.5 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-clinical-success font-semibold">
              {success} Redirecting to sign in...
            </div>
          )}
          {error && (
            <div className="p-3.5 rounded-lg bg-rose-50 border border-rose-200 text-xs text-clinical-danger font-medium">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-ink mb-1.5">New Password</label>
              <input
                type="password"
                required
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Min 8 chars, A-Z, a-z, 0-9"
                className="editorial-input font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-ink mb-1.5">Confirm Password</label>
              <input
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Repeat new password"
                className="editorial-input font-mono"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full editorial-btn-primary py-2.5 text-sm"
            >
              {loading ? 'Updating Password...' : 'Update Password'}
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

export default ResetPassword;
