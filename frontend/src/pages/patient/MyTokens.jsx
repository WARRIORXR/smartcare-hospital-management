/**
 * src/pages/patient/MyTokens.jsx
 * ------------------------------
 * Page where Patient can view their OPD tokens, track live queue positions,
 * and cancel waiting tokens.
 */

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import opdService from '../../services/opdService';
import hospitalService from '../../services/hospitalService';
import BookTokenModal from '../../components/opd/BookTokenModal';

const MyTokens = () => {
  const navigate = useNavigate();

  const [tokens, setTokens] = useState([]);
  const [doctors, setDoctors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all'); // 'all' | 'active' | 'history'
  const [showBookModal, setShowBookModal] = useState(false);
  const [alert, setAlert] = useState({ type: '', message: '' });

  const loadData = async () => {
    try {
      setLoading(true);
      const [tokenData, docData] = await Promise.all([
        opdService.getMyTokens(),
        hospitalService.getDoctors({ available: true }),
      ]);
      setTokens(tokenData);
      setDoctors(docData);
    } catch (err) {
      console.error('Failed to load patient tokens', err);
      showAlert('error', 'Could not load your tokens. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const showAlert = (type, message) => {
    setAlert({ type, message });
    setTimeout(() => setAlert({ type: '', message: '' }), 4000);
  };

  const handleCancelToken = async (tokenId, tokenCode) => {
    if (!window.confirm(`Are you sure you want to cancel token ${tokenCode}?`)) return;
    try {
      await opdService.cancelToken(tokenId);
      showAlert('success', `Token ${tokenCode} cancelled.`);
      loadData();
    } catch (err) {
      console.error(err);
      showAlert('error', 'Failed to cancel token.');
    }
  };

  // Filter tokens
  const filteredTokens = tokens.filter((t) => {
    if (filter === 'active') return t.status === 'waiting' || t.status === 'in_progress';
    if (filter === 'history') return t.status === 'completed' || t.status === 'cancelled' || t.status === 'skipped';
    return true;
  });

  const getStatusBadge = (status) => {
    switch (status) {
      case 'waiting':
        return 'bg-amber-100 text-amber-800 border-amber-300';
      case 'in_progress':
        return 'bg-blue-100 text-blue-800 border-blue-300 animate-pulse';
      case 'completed':
        return 'bg-emerald-100 text-emerald-800 border-emerald-300';
      case 'cancelled':
        return 'bg-red-100 text-red-800 border-red-300';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-300';
    }
  };

  const getPriorityBadge = (priority) => {
    switch (priority) {
      case 'emergency':
        return 'bg-red-100 text-red-800 border-red-300 font-bold';
      case 'senior_citizen':
        return 'bg-amber-100 text-amber-800 border-amber-300';
      default:
        return 'bg-blue-50 text-blue-700 border-blue-200';
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center pb-6 border-b border-gray-200 mb-6 gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-gray-900 tracking-tight">
            My OPD Consultation Tokens
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Track your live room queue, view estimated wait times, or book a new appointment.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={() => setShowBookModal(true)}
            className="inline-flex items-center px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-md transition"
          >
            <span className="mr-1.5 text-base">+</span> Book New OPD Token
          </button>
        </div>
      </div>

      {/* Alert banner */}
      {alert.message && (
        <div
          className={`mb-6 p-4 rounded-xl text-sm font-medium border flex items-center justify-between ${
            alert.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
              : 'bg-red-50 text-red-800 border-red-200'
          }`}
        >
          <span>{alert.message}</span>
          <button onClick={() => setAlert({ type: '', message: '' })} className="font-bold text-gray-500 hover:text-gray-800">
            ×
          </button>
        </div>
      )}

      {/* Filter Tabs */}
      <div className="flex space-x-2 border-b border-gray-200 mb-6">
        <button
          onClick={() => setFilter('all')}
          className={`pb-3 px-4 text-xs font-bold border-b-2 transition ${
            filter === 'all'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          All Tokens ({tokens.length})
        </button>
        <button
          onClick={() => setFilter('active')}
          className={`pb-3 px-4 text-xs font-bold border-b-2 transition ${
            filter === 'active'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          Live Queue ({tokens.filter((t) => t.status === 'waiting' || t.status === 'in_progress').length})
        </button>
        <button
          onClick={() => setFilter('history')}
          className={`pb-3 px-4 text-xs font-bold border-b-2 transition ${
            filter === 'history'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          Past / Completed
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center items-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      ) : filteredTokens.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-2xl border border-gray-200">
          <span className="text-4xl block mb-2">🎟️</span>
          <h3 className="text-lg font-bold text-gray-800">No consultation tokens found</h3>
          <p className="text-sm text-gray-500 mt-1 mb-4">
            Select a specialist doctor and get your digital queue token.
          </p>
          <button
            onClick={() => setShowBookModal(true)}
            className="px-4 py-2 bg-blue-600 text-white rounded-xl text-xs font-bold shadow-md hover:bg-blue-700 transition"
          >
            Book Your First Token
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredTokens.map((token) => (
            <div
              key={token.id}
              className="bg-white rounded-2xl p-6 border border-gray-200 shadow-sm hover:shadow-md transition flex flex-col justify-between"
            >
              <div>
                {/* Header: Date & Status */}
                <div className="flex justify-between items-start mb-3">
                  <span className="text-xs text-gray-400 font-medium">
                    📅 {token.appointment_date}
                  </span>
                  <div className="flex items-center space-x-1.5">
                    <span className={`text-[10px] uppercase px-2 py-0.5 rounded-full border ${getPriorityBadge(token.priority)}`}>
                      {token.priority.replace('_', ' ')}
                    </span>
                    <span className={`text-[10px] uppercase px-2.5 py-0.5 rounded-full border font-bold ${getStatusBadge(token.status)}`}>
                      {token.status}
                    </span>
                  </div>
                </div>

                {/* Big Token Code */}
                <div className="text-3xl font-extrabold text-blue-700 tracking-wider font-mono my-2">
                  {token.token_code}
                </div>

                {/* Doctor and Department */}
                <h3 className="text-base font-bold text-gray-900 mt-1">
                  {token.doctor_name}
                </h3>
                <p className="text-xs text-gray-500">
                  {token.department_name} • 📍 <span className="text-blue-700 font-semibold">{token.room_number || 'Room 101'}</span>
                </p>

                {/* Queue Status Box for waiting tokens */}
                {token.status === 'waiting' && (
                  <div className="grid grid-cols-2 gap-2 mt-4 p-3 bg-amber-50/60 rounded-xl border border-amber-200 text-xs">
                    <div>
                      <span className="text-gray-500 block text-[10px] uppercase font-bold">Queue Position</span>
                      <span className="font-extrabold text-amber-900 text-sm">
                        #{token.queue_position} in line
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-500 block text-[10px] uppercase font-bold">Estimated Wait</span>
                      <span className="font-extrabold text-amber-900 text-sm">
                        ⏱️ ~{token.estimated_wait_minutes} mins
                      </span>
                    </div>
                  </div>
                )}

                {token.status === 'in_progress' && (
                  <div className="mt-4 p-3 bg-blue-50 rounded-xl border border-blue-200 text-xs text-blue-800 font-bold text-center">
                    🔔 Please enter {token.room_number || 'Room 101'} — Doctor is waiting for you!
                  </div>
                )}

                {/* Symptoms if any */}
                {token.symptoms && (
                  <p className="mt-3 text-xs text-gray-500 italic bg-gray-50 p-2 rounded-lg">
                    "{token.symptoms}"
                  </p>
                )}
              </div>

              {/* Action buttons */}
              {token.status === 'waiting' && (
                <div className="mt-6 pt-3 border-t border-gray-100 flex justify-end">
                  <button
                    onClick={() => handleCancelToken(token.id, token.token_code)}
                    className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-red-50 text-red-700 hover:bg-red-100 transition"
                  >
                    Cancel Token
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Booking Modal */}
      {showBookModal && (
        <BookTokenModal
          doctors={doctors}
          onClose={() => setShowBookModal(false)}
          onSuccess={() => {
            setShowBookModal(false);
            loadData();
          }}
        />
      )}
    </div>
  );
};

export default MyTokens;
