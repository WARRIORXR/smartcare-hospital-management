/**
 * src/pages/bloodbank/DonorRegistrationPage.jsx
 * ---------------------------------------------
 * Voluntary Blood Donor Registration & Donor Directory.
 *
 * Requirements:
 *  - Form: Name, Blood Group, Phone, City, Last Donation Date
 *  - Directory of registered donors with live search by City and filter by Blood Group
 *  - Clinical eligibility check (90-day cooldown between whole blood donations)
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import bloodBankService from '../../services/bloodBankService';
import Navbar from '../../components/common/Navbar';
import { Link, Navigate } from 'react-router-dom';

const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'];

const DonorRegistrationPage = () => {
  const { user, isAuthenticated, loading: authLoading } = useAuth();

  const isAuthorizedBloodStaff = Boolean(
    isAuthenticated && user && ['admin', 'doctor', 'bloodbank_staff'].includes(user.role)
  );

  const [donors, setDonors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);

  // Filters
  const [selectedGroup, setSelectedGroup] = useState('all');
  const [cityFilter, setCityFilter] = useState('');

  // Form State
  const [isFirstTimeDonor, setIsFirstTimeDonor] = useState(false);
  const [formData, setFormData] = useState({
    name: user?.first_name ? `${user.first_name} ${user.last_name}` : '',
    blood_group: 'O+',
    phone: user?.phone || '',
    city: '',
    last_donation_date: '',
    age: 25,
    gender: 'M',
    notes: '',
  });

  // Fetch Donors
  const fetchDonors = useCallback(async () => {
    try {
      setLoading(true);
      const params = {};
      if (selectedGroup !== 'all') params.blood_group = selectedGroup;
      if (cityFilter.trim()) params.city = cityFilter.trim();

      const data = await bloodBankService.getDonors(params);
      setDonors(data || []);
    } catch (err) {
      console.error('Failed to load donors', err);
      setErrorMsg('Could not load donors directory.');
    } finally {
      setLoading(false);
    }
  }, [selectedGroup, cityFilter]);

  useEffect(() => {
    if (!isAuthorizedBloodStaff) return;
    fetchDonors();
  }, [isAuthorizedBloodStaff, fetchDonors]);

  // Defensive Guard: Only Admin, Doctor, and Blood Bank Staff can manage/view donors
  if (authLoading) {
    return <div className="p-8 text-center text-gray-500">Checking authorization...</div>;
  }
  if (!isAuthorizedBloodStaff) {
    return <Navigate to="/dashboard" replace />;
  }

  // Submit Donor Registration
  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!formData.name.trim() || !formData.phone.trim() || !formData.city.trim()) {
      alert('Please fill in Name, Phone, and City.');
      return;
    }

    try {
      setSubmitting(true);
      const payload = {
        name: formData.name,
        blood_group: formData.blood_group,
        phone: formData.phone,
        city: formData.city,
        last_donation_date: isFirstTimeDonor ? null : formData.last_donation_date || null,
        age: parseInt(formData.age, 10) || 25,
        gender: formData.gender,
        notes: formData.notes,
        is_eligible: true,
      };

      await bloodBankService.registerDonor(payload);
      setSuccessMsg(`Thank you, ${formData.name}! You are registered as an eligible ${formData.blood_group} donor.`);

      // Reset Form
      setFormData({
        name: '',
        blood_group: 'O+',
        phone: '',
        city: '',
        last_donation_date: '',
        age: 25,
        gender: 'M',
        notes: '',
      });
      setIsFirstTimeDonor(false);

      await fetchDonors();
    } catch (err) {
      console.error('Registration failed:', err);
      setErrorMsg(err.response?.data?.detail || 'Failed to register donor. Please check inputs.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50/50">
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Navigation Breadcrumb */}
        <div className="flex items-center gap-2 text-xs font-semibold text-gray-500 mb-6">
          <Link to="/bloodbank" className="hover:text-rose-600 transition">
            🩸 Blood Bank Inventory
          </Link>
          <span>/</span>
          <span className="text-gray-900">Donor Registration</span>
        </div>

        {/* Success Alert */}
        {successMsg && (
          <div className="mb-6 p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm font-semibold flex items-center justify-between shadow-xs animate-fadeIn">
            <div className="flex items-center gap-2">
              <span className="text-lg">🎉</span>
              <span>{successMsg}</span>
            </div>
            <button
              onClick={() => setSuccessMsg(null)}
              className="text-emerald-700 hover:text-emerald-900 font-bold"
            >
              ✕
            </button>
          </div>
        )}

        {/* Error Alert */}
        {errorMsg && (
          <div className="mb-6 p-4 rounded-2xl bg-red-50 border border-red-200 text-red-800 text-sm font-semibold flex items-center justify-between shadow-xs">
            <span>{errorMsg}</span>
            <button
              onClick={() => setErrorMsg(null)}
              className="text-red-700 hover:text-red-900 font-bold"
            >
              ✕
            </button>
          </div>
        )}

        {/* Hero Banner */}
        <div className="bg-gradient-to-r from-rose-700 via-red-700 to-rose-900 rounded-3xl p-6 sm:p-8 text-white shadow-xl mb-8 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
          <div>
            <div className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-white/20 backdrop-blur-xs mb-3">
              ❤️ Save Lives — Give Blood
            </div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight">
              Voluntary Blood Donor Registration
            </h1>
            <p className="text-rose-100 text-xs sm:text-sm mt-1 max-w-xl">
              Register in our emergency hospital network. When local patients face critical shortages,
              our team can reach out to you directly.
            </p>
          </div>

          <Link
            to="/bloodbank/requests"
            className="px-5 py-2.5 rounded-2xl bg-white text-rose-700 hover:bg-rose-50 text-xs font-black uppercase tracking-wider shadow-md transition self-start md:self-auto"
          >
            📋 Request Blood Instead →
          </Link>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* ── LEFT: REGISTRATION FORM ── */}
          <div className="bg-white rounded-3xl border border-gray-200/90 p-6 sm:p-8 shadow-xs lg:col-span-1">
            <h2 className="text-lg font-black text-gray-900 flex items-center gap-2">
              <span>✍️</span> Register as a Donor
            </h2>
            <p className="text-xs text-gray-500 mt-1 mb-6">
              Fill in your contact and donation details.
            </p>

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Full Name */}
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase mb-1">
                  Full Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Vikram Malhotra"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3.5 py-2 text-sm rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-rose-500"
                />
              </div>

              {/* Blood Group */}
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase mb-1">
                  Blood Group *
                </label>
                <select
                  value={formData.blood_group}
                  onChange={(e) => setFormData({ ...formData, blood_group: e.target.value })}
                  className="w-full px-3.5 py-2 text-sm rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-rose-500 bg-white font-bold text-rose-700"
                >
                  {BLOOD_GROUPS.map((bg) => (
                    <option key={bg} value={bg}>
                      {bg}
                    </option>
                  ))}
                </select>
              </div>

              {/* Phone & City */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase mb-1">
                    Phone # *
                  </label>
                  <input
                    type="tel"
                    required
                    placeholder="9876543210"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="w-full px-3.5 py-2 text-sm rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-rose-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase mb-1">
                    City *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Mumbai, Delhi"
                    value={formData.city}
                    onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                    className="w-full px-3.5 py-2 text-sm rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-rose-500"
                  />
                </div>
              </div>

              {/* Age & Gender */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase mb-1">
                    Age (18-65)
                  </label>
                  <input
                    type="number"
                    min="18"
                    max="65"
                    value={formData.age}
                    onChange={(e) => setFormData({ ...formData, age: e.target.value })}
                    className="w-full px-3.5 py-2 text-sm rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-rose-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase mb-1">
                    Gender
                  </label>
                  <select
                    value={formData.gender}
                    onChange={(e) => setFormData({ ...formData, gender: e.target.value })}
                    className="w-full px-3.5 py-2 text-sm rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-rose-500 bg-white"
                  >
                    <option value="M">Male</option>
                    <option value="F">Female</option>
                    <option value="O">Other</option>
                  </select>
                </div>
              </div>

              {/* Last Donation Date */}
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase mb-1">
                  Last Donation Date
                </label>
                <input
                  type="date"
                  disabled={isFirstTimeDonor}
                  value={formData.last_donation_date}
                  onChange={(e) =>
                    setFormData({ ...formData, last_donation_date: e.target.value })
                  }
                  className="w-full px-3.5 py-2 text-sm rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-rose-500 disabled:bg-gray-100 disabled:text-gray-400"
                />

                <label className="mt-2 flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isFirstTimeDonor}
                    onChange={(e) => setIsFirstTimeDonor(e.target.checked)}
                    className="rounded text-rose-600 focus:ring-rose-500 w-4 h-4 cursor-pointer"
                  />
                  <span className="text-xs text-gray-600 font-semibold">
                    First-time donor (never donated before)
                  </span>
                </label>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full py-3 px-4 rounded-xl text-xs font-black uppercase tracking-wider text-white bg-rose-600 hover:bg-rose-700 shadow-md transition disabled:opacity-50"
                >
                  {submitting ? 'Registering...' : 'Complete Registration'}
                </button>
              </div>
            </form>
          </div>

          {/* ── RIGHT: REGISTERED DONORS DIRECTORY ── */}
          <div className="bg-white rounded-3xl border border-gray-200/90 p-6 sm:p-8 shadow-xs lg:col-span-2 flex flex-col justify-between">
            <div>
              {/* Header & Filter Controls */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-gray-100">
                <div>
                  <h2 className="text-lg font-black text-gray-900 flex items-center gap-2">
                    <span>👥</span> Hospital Donor Directory
                  </h2>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Verified voluntary donors available for emergency blood collection.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {/* City Search */}
                  <input
                    type="text"
                    placeholder="Filter by city..."
                    value={cityFilter}
                    onChange={(e) => setCityFilter(e.target.value)}
                    className="w-36 sm:w-40 px-3 py-1.5 text-xs rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-rose-500"
                  />

                  {/* Group Filter */}
                  <select
                    value={selectedGroup}
                    onChange={(e) => setSelectedGroup(e.target.value)}
                    className="px-2.5 py-1.5 text-xs rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-rose-500 bg-white font-bold"
                  >
                    <option value="all">All Groups</option>
                    {BLOOD_GROUPS.map((bg) => (
                      <option key={bg} value={bg}>
                        {bg}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Donors List */}
              {loading ? (
                <div className="py-20 text-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-rose-600 mx-auto"></div>
                  <p className="mt-3 text-xs text-gray-500 font-semibold">
                    Loading donors directory...
                  </p>
                </div>
              ) : donors.length === 0 ? (
                <div className="p-12 text-center text-gray-500">
                  <span className="text-4xl block mb-2">🔍</span>
                  <p className="font-bold text-sm">No Donors Found</p>
                  <p className="text-xs text-gray-400 mt-1">
                    No registered donors match your current filter criteria.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto mt-4">
                  <table className="min-w-full divide-y divide-gray-200 text-left text-sm">
                    <thead className="bg-gray-50 text-gray-500 uppercase text-[10px] font-bold tracking-wider">
                      <tr>
                        <th className="px-4 py-3">Group</th>
                        <th className="px-4 py-3">Donor Name</th>
                        <th className="px-4 py-3">City</th>
                        <th className="px-4 py-3">Phone</th>
                        <th className="px-4 py-3">Last Donated</th>
                        <th className="px-4 py-3 text-right">Eligibility</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {donors.map((d) => (
                        <tr key={d.id} className="hover:bg-gray-50/70 transition">
                          <td className="px-4 py-3">
                            <span className="inline-block px-2.5 py-1 rounded-xl bg-rose-100 text-rose-800 font-black text-xs">
                              {d.blood_group}
                            </span>
                          </td>
                          <td className="px-4 py-3 font-bold text-gray-900">{d.name}</td>
                          <td className="px-4 py-3 text-xs text-gray-600 font-medium">
                            📍 {d.city || 'Local'}
                          </td>
                          <td className="px-4 py-3 text-xs font-mono font-bold text-blue-700">
                            <a href={`tel:${d.phone}`} className="hover:underline">
                              📞 {d.phone}
                            </a>
                          </td>
                          <td className="px-4 py-3 text-xs text-gray-500">
                            {d.last_donation_date ? d.last_donation_date : 'First-time'}
                          </td>
                          <td className="px-4 py-3 text-right">
                            {d.can_donate_now ? (
                              <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold border border-emerald-300">
                                ✅ Ready to Donate
                              </span>
                            ) : (
                              <span className="px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[10px] font-bold border border-amber-300">
                                ⏳ Cooldown
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Clinical Note Footer */}
            <div className="mt-6 pt-4 border-t border-gray-100 text-2xs text-gray-500 flex items-center justify-between">
              <span>Standard Donation Interval: 90 Days between whole blood donations.</span>
              <span>Total Donors: {donors.length}</span>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default DonorRegistrationPage;
