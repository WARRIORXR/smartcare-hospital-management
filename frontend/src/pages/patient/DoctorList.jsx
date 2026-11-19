/**
 * src/pages/patient/DoctorList.jsx
 * ---------------------------------
 * Patient view for browsing hospital doctors.
 * Displays Department, Room Number, Average Consultation Time, Fee, and Availability.
 */

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import hospitalService from '../../services/hospitalService';

const DoctorList = () => {
  const navigate = useNavigate();

  const [doctors, setDoctors] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDept, setSelectedDept] = useState('');
  const [onlyAvailable, setOnlyAvailable] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const [depts, docs] = await Promise.all([
          hospitalService.getDepartments(false),
          hospitalService.getDoctors(),
        ]);
        setDepartments(depts);
        setDoctors(docs);
      } catch (err) {
        console.error('Failed to load doctor directory', err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  // Filter doctors locally for instant search response
  const filteredDoctors = doctors.filter((doc) => {
    // Search filter
    const matchesSearch =
      doc.doctor_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (doc.specialization && doc.specialization.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (doc.department_name && doc.department_name.toLowerCase().includes(searchTerm.toLowerCase()));

    // Department filter
    const matchesDept = selectedDept ? doc.department === parseInt(selectedDept) : true;

    // Availability filter
    const matchesAvailability = onlyAvailable ? doc.is_available : true;

    return matchesSearch && matchesDept && matchesAvailability;
  });

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-blue-600 to-indigo-700 rounded-2xl p-6 sm:p-8 text-white shadow-lg mb-8">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <span className="inline-block px-3 py-1 rounded-full text-xs font-semibold bg-white/20 text-white mb-2">
              🏥 Doctor Directory
            </span>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
              Hospital Doctors & Specialist Clinics
            </h1>
            <p className="mt-1 text-blue-100 text-sm">
              Find doctor room numbers, average consultation durations, and check duty availability.
            </p>
          </div>
          <button
            onClick={() => navigate('/patient/dashboard')}
            className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 border border-white/30 text-white text-xs font-bold transition"
          >
            ← Back to Dashboard
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm mb-8 space-y-4 sm:space-y-0 sm:flex sm:items-center sm:justify-between sm:gap-4">
        {/* Search input */}
        <div className="flex-1 relative">
          <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400 text-sm">
            🔍
          </span>
          <input
            type="text"
            placeholder="Search by doctor name, specialty, or clinic..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 text-sm border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none"
          />
        </div>

        {/* Department selector */}
        <div className="sm:w-64">
          <select
            value={selectedDept}
            onChange={(e) => setSelectedDept(e.target.value)}
            className="w-full px-3.5 py-2.5 text-sm border border-gray-300 rounded-xl bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
          >
            <option value="">All Departments ({departments.length})</option>
            {departments.map((dept) => (
              <option key={dept.id} value={dept.id}>
                {dept.name}
              </option>
            ))}
          </select>
        </div>

        {/* Availability Toggle */}
        <div className="flex items-center space-x-2 pl-1">
          <input
            type="checkbox"
            id="availableToggle"
            checked={onlyAvailable}
            onChange={(e) => setOnlyAvailable(e.target.checked)}
            className="h-4 w-4 text-blue-600 rounded"
          />
          <label htmlFor="availableToggle" className="text-xs font-semibold text-gray-700 whitespace-nowrap">
            Available Only
          </label>
        </div>
      </div>

      {/* Doctors Grid */}
      {loading ? (
        <div className="flex justify-center items-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      ) : filteredDoctors.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-2xl border border-gray-200">
          <span className="text-4xl block mb-2">🔍</span>
          <h3 className="text-lg font-bold text-gray-800">No doctors found</h3>
          <p className="text-sm text-gray-500 mt-1">
            Try adjusting your search query or department filter.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredDoctors.map((doc) => (
            <div
              key={doc.id}
              className="bg-white rounded-2xl p-6 border border-gray-200 shadow-sm hover:shadow-md transition flex flex-col justify-between"
            >
              <div>
                {/* Top Badge: Department & Status */}
                <div className="flex justify-between items-start mb-3">
                  <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                    {doc.department_name || 'General OPD'}
                  </span>
                  {doc.is_available ? (
                    <span className="flex items-center text-xs font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 mr-1.5 animate-pulse"></span>
                      Available Today
                    </span>
                  ) : (
                    <span className="text-xs font-semibold text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                      Off Duty
                    </span>
                  )}
                </div>

                {/* Doctor Name & Qualifications */}
                <h3 className="text-xl font-bold text-gray-900 tracking-tight">
                  {doc.doctor_name}
                </h3>
                <p className="text-xs font-medium text-gray-500 mt-0.5">
                  {doc.specialization} • {doc.qualification || 'MBBS'}
                </p>

                {/* Info Cards: Room, Time, Fee */}
                <div className="grid grid-cols-3 gap-2 mt-5 p-3 bg-gray-50 rounded-xl border border-gray-100 text-center">
                  <div>
                    <span className="block text-[10px] uppercase font-bold text-gray-400">Clinic Room</span>
                    <span className="text-xs font-bold text-gray-800 mt-0.5 block">
                      📍 {doc.room_number || 'OPD-101'}
                    </span>
                  </div>
                  <div>
                    <span className="block text-[10px] uppercase font-bold text-gray-400">Avg Consult</span>
                    <span className="text-xs font-bold text-blue-700 mt-0.5 block">
                      ⏱️ {doc.avg_consult_minutes || 15}m
                    </span>
                  </div>
                  <div>
                    <span className="block text-[10px] uppercase font-bold text-gray-400">Fee</span>
                    <span className="text-xs font-bold text-emerald-700 mt-0.5 block">
                      ₹{doc.consultation_fee}
                    </span>
                  </div>
                </div>

                {/* Available Days */}
                <div className="mt-4 text-xs text-gray-600 flex items-center justify-between">
                  <span className="text-gray-400">OPD Days:</span>
                  <span className="font-medium text-gray-800">{doc.available_days || 'Mon, Tue, Wed, Thu, Fri'}</span>
                </div>
              </div>

              {/* Action Button */}
              <div className="mt-6 pt-4 border-t border-gray-100">
                <button
                  onClick={() => alert(`OPD Token booking for ${doc.doctor_name} will be active in Step 5!`)}
                  disabled={!doc.is_available}
                  className="w-full py-2.5 px-4 rounded-xl font-semibold text-xs transition shadow-sm flex items-center justify-center space-x-1.5 disabled:opacity-40 disabled:cursor-not-allowed bg-blue-600 hover:bg-blue-700 text-white"
                >
                  <span>🎟️</span>
                  <span>Book Consultation Token</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default DoctorList;
