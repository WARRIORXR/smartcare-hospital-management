/**
 * src/pages/Register.jsx
 * ----------------------
 * Patient Self-Registration Portal (Editorial Clinical).
 * Enforces strict patient-only registration (staff accounts created by Admin)
 * and strong password complexity rules matching backend Django validators.
 */

import React, { useState } from 'react';
import { Link, useNavigate, Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { BrandLogo } from '../components/common/Navbar';

const Register = () => {
  const { user, isAuthenticated, register, getDashboardPath } = useAuth();
  const navigate = useNavigate();

  const [formData, setFormData] = useState({
    username: '',
    email: '',
    first_name: '',
    last_name: '',
    phone: '',
    password: '',
    password_confirm: '',
    gender: 'M',
    blood_group: 'O+',
    date_of_birth: '',
    address: '',
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (isAuthenticated && user) {
    return <Navigate to={getDashboardPath(user.role)} replace />;
  }

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (formData.password !== formData.password_confirm) {
      setError('Passwords do not match.');
      return;
    }

    if (formData.password.length < 8) {
      setError('Password must be at least 8 characters with uppercase, lowercase, and a number/symbol.');
      return;
    }

    try {
      setLoading(true);
      const loggedUser = await register({
        ...formData,
        date_of_birth: formData.date_of_birth || null,
      });
      navigate(getDashboardPath(loggedUser.role), { replace: true });
    } catch (err) {
      console.error('Registration failed:', err);
      const data = err.response?.data;
      if (data) {
        if (typeof data === 'string') {
          setError(data);
        } else if (data.detail) {
          setError(data.detail);
        } else {
          const firstKey = Object.keys(data)[0];
          const firstVal = Array.isArray(data[firstKey]) ? data[firstKey][0] : data[firstKey];
          setError(`${firstKey}: ${firstVal}`);
        }
      } else {
        setError('Registration failed. Please verify your inputs.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-surface flex flex-col justify-center py-10 px-4 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-xl space-y-6">
        <div className="flex flex-col items-center text-center space-y-2">
          <BrandLogo size="lg" />
          <h1 className="font-display text-2xl font-bold text-ink pt-1">
            Patient Portal Registration
          </h1>
          <p className="text-xs text-muted max-w-md">
            Self-registration creates a Patient account. Staff &amp; Doctors are provisioned by Hospital Admin.
          </p>
        </div>

        <div className="editorial-card p-6 sm:p-8 space-y-5">
          {error && (
            <div className="p-3.5 rounded-lg bg-rose-50 border border-rose-200 border-l-4 border-l-clinical-danger text-xs text-clinical-danger font-medium">
              {error}
            </div>
          )}

          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-ink mb-1.5">First Name *</label>
                <input
                  type="text"
                  name="first_name"
                  required
                  value={formData.first_name}
                  onChange={handleChange}
                  placeholder="e.g. Rahul"
                  className="editorial-input"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-ink mb-1.5">Last Name *</label>
                <input
                  type="text"
                  name="last_name"
                  required
                  value={formData.last_name}
                  onChange={handleChange}
                  placeholder="e.g. Verma"
                  className="editorial-input"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-ink mb-1.5">Username *</label>
                <input
                  type="text"
                  name="username"
                  required
                  value={formData.username}
                  onChange={handleChange}
                  placeholder="e.g. rahulv"
                  className="editorial-input"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-ink mb-1.5">Email Address *</label>
                <input
                  type="email"
                  name="email"
                  required
                  value={formData.email}
                  onChange={handleChange}
                  placeholder="rahul@example.com"
                  className="editorial-input"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-ink mb-1.5">Phone Number (for SMS/WhatsApp alerts)</label>
              <input
                type="tel"
                name="phone"
                value={formData.phone}
                onChange={handleChange}
                placeholder="+91-9876543210"
                className="editorial-input"
              />
            </div>

            <div className="p-4 bg-surface rounded-xl border border-hairline space-y-3">
              <p className="font-mono text-[10px] font-semibold text-cobalt uppercase tracking-wider">
                Patient Medical Details
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-ink mb-1">Gender</label>
                  <select
                    name="gender"
                    value={formData.gender}
                    onChange={handleChange}
                    className="editorial-input"
                  >
                    <option value="M">Male</option>
                    <option value="F">Female</option>
                    <option value="O">Other</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-ink mb-1">Blood Group</label>
                  <select
                    name="blood_group"
                    value={formData.blood_group}
                    onChange={handleChange}
                    className="editorial-input"
                  >
                    {['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'].map((bg) => (
                      <option key={bg} value={bg}>{bg}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-ink mb-1">Date of Birth</label>
                  <input
                    type="date"
                    name="date_of_birth"
                    value={formData.date_of_birth}
                    onChange={handleChange}
                    className="editorial-input"
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-ink mb-1.5">Strong Password *</label>
                <input
                  type="password"
                  name="password"
                  required
                  value={formData.password}
                  onChange={handleChange}
                  placeholder="Min 8 chars, A-Z, a-z, 0-9"
                  className="editorial-input font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-ink mb-1.5">Confirm Password *</label>
                <input
                  type="password"
                  name="password_confirm"
                  required
                  value={formData.password_confirm}
                  onChange={handleChange}
                  placeholder="Repeat password"
                  className="editorial-input font-mono"
                />
              </div>
            </div>
            <p className="text-[11px] text-muted">
              Password policy: minimum 8 characters including uppercase, lowercase, and a number or symbol.
            </p>

            <button
              type="submit"
              disabled={loading}
              className="w-full editorial-btn-primary py-3 text-sm"
            >
              {loading ? 'Creating Patient Account...' : 'Create Patient Account'}
            </button>
          </form>

          <div className="pt-4 border-t border-hairline text-center text-xs text-muted">
            <span>Already registered? </span>
            <Link to="/login" className="font-semibold text-cobalt hover:underline">
              Sign In here
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Register;
