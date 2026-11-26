/**
 * src/pages/patient/PatientDashboard.jsx
 * --------------------------------------
 * Editorial Clinical Patient Portal:
 *  - Clean Header Strip with Patient ID & Book OPD Token / Care Journey CTAs
 *  - Asymmetric 2-Column Workspace:
 *    Left: Live Active OPD Pass (5s auto-refresh) + Care & Records Modules
 *    Right: Patient Profile table + Live Proximity Alerts Feed (SMS / WhatsApp)
 */

import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import authService from '../../services/authService';
import opdService from '../../services/opdService';
import PatientJourneyModal from '../../components/common/PatientJourneyModal';

const PatientDashboard = () => {
  const { user, isAuthenticated, loading: authLoading } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();

  const [profile, setProfile] = useState(null);
  const [activeToken, setActiveToken] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notifications, setNotifications] = useState([]);
  const [notifLoading, setNotifLoading] = useState(false);
  const [journeyModalOpen, setJourneyModalOpen] = useState(false);

  const loadLivePatientState = useCallback(async () => {
    try {
      const [notifData, tokensData] = await Promise.all([
        opdService.getNotifications(),
        opdService.getMyTokens().catch(() => []),
      ]);
      const notifList = Array.isArray(notifData) ? notifData : notifData?.results || [];
      setNotifications(notifList);

      const tokenList = Array.isArray(tokensData) ? tokensData : tokensData?.results || [];
      const live = tokenList.find((tk) => ['waiting', 'called', 'in_progress'].includes(tk.status));
      setActiveToken(live || null);
    } catch (err) {
      console.error('Could not fetch live patient updates', err);
    }
  }, []);

  useEffect(() => {
    if (!isAuthenticated || !user || user.role !== 'patient') return;

    const fetchInitial = async () => {
      try {
        const data = await authService.getProfile();
        setProfile(data.profile);
      } catch (err) {
        console.error('Could not fetch patient profile', err);
      } finally {
        setLoading(false);
      }
      await loadLivePatientState();
    };

    fetchInitial();
    const intervalId = setInterval(loadLivePatientState, 5000);
    return () => clearInterval(intervalId);
  }, [isAuthenticated, user, loadLivePatientState]);

  if (authLoading) {
    return <div className="p-8 text-center text-muted text-sm">Checking authorization...</div>;
  }
  if (!isAuthenticated || !user || user.role !== 'patient') {
    return <Navigate to="/dashboard" replace />;
  }

  const handleMarkNotificationRead = async (id) => {
    try {
      setNotifLoading(true);
      await opdService.markNotificationRead(id);
      await loadLivePatientState();
    } catch (err) {
      console.error('Failed to mark notification read', err);
    } finally {
      setNotifLoading(false);
    }
  };

  const handleMarkAllRead = async () => {
    try {
      setNotifLoading(true);
      await opdService.markAllNotificationsRead();
      await loadLivePatientState();
    } catch (err) {
      console.error('Failed to mark all notifications read', err);
    } finally {
      setNotifLoading(false);
    }
  };

  const unreadCount = notifications.filter((n) => !n.is_read).length;
  const resolvedPatientId = profile?.id || user?.patient_id_pk || user?.id;
  const displayPatientCode = loading ? '...' : profile?.patient_id || user?.patient_id || 'PAT-0001';

  const modules = [
    {
      title: 'OPD Tokens & Advance Slots',
      desc: 'Book same-day queue tokens, select advance time slots, and browse doctor availability.',
      action: 'Book Now',
      path: '/patient/book-token',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
          <line x1="16" y1="2" x2="16" y2="6" />
          <line x1="8" y1="2" x2="8" y2="6" />
          <line x1="3" y1="10" x2="21" y2="10" />
        </svg>
      ),
    },
    {
      title: t('medicalRecordsTitle'),
      desc: 'Review doctor prescriptions, visit notes, diagnoses, and uploaded lab reports.',
      action: 'Open',
      path: '/records',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="16" y1="13" x2="8" y2="13" />
          <line x1="16" y1="17" x2="8" y2="17" />
        </svg>
      ),
    },
    {
      title: t('billingTitle'),
      desc: 'Inspect itemized OPD & ward invoices, settle balances, and download PDF receipts.',
      action: 'View',
      path: '/billing',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
          <line x1="1" y1="10" x2="23" y2="10" />
        </svg>
      ),
    },
    {
      title: 'Doctor Directory & Ratings',
      desc: 'Find specialist clinics, room numbers, consultation fees, and submit visit ratings.',
      action: 'Browse',
      path: '/patient/doctors',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      ),
    },
    {
      title: 'Emergency Blood Requisition',
      desc: 'Submit urgent or planned blood unit requests and track blood bank fulfillment.',
      action: 'Request',
      path: '/bloodbank/requests',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z" />
        </svg>
      ),
    },
  ];

  return (
    <div className="max-w-[1360px] mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Header Strip */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-hairline">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="editorial-eyebrow">{t('patientPortal')}</span>
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-clinical-success border border-emerald-200">
              <span className="w-1.5 h-1.5 rounded-full bg-clinical-success animate-pulse" />
              {t('liveQueueActive')}
            </span>
          </div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-ink">
            {t('welcome')}, {user?.first_name || user?.username}
          </h1>
          <p className="text-sm text-muted">
            Track your live OPD queue pass, prescriptions, lab reports, and billing under ID{' '}
            <span className="font-mono font-semibold text-ink">{displayPatientCode}</span>.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={() => navigate('/patient/journey')}
            className="editorial-btn-secondary"
          >
            View Care Journey
          </button>
          <button
            type="button"
            onClick={() => navigate('/patient/book-slot')}
            className="editorial-btn-primary"
          >
            + {t('navBookToken')}
          </button>
        </div>
      </div>

      {/* Main 2-Column Asymmetric Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6 items-start">
        {/* Left Primary Column */}
        <div className="space-y-6">
          {/* Active OPD Pass Hero Card */}
          {activeToken ? (
            <div className="editorial-card p-6 border-cobalt/30 bg-gradient-to-br from-white to-cobalt-tint/30 space-y-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-cobalt text-white">
                      LIVE OPD PASS
                    </span>
                    <span className="font-mono text-[11px] font-semibold text-clinical-success uppercase">
                      {activeToken.status?.replace('_', ' ')}
                    </span>
                  </div>
                  <p className="font-mono text-3xl sm:text-4xl font-bold text-ink tracking-tight pt-1">
                    {activeToken.token_code}
                  </p>
                  <p className="text-sm text-muted">
                    {activeToken.doctor_name} · {activeToken.department_name || 'Outpatient Clinic'}
                    {activeToken.room_number ? ` · Room ${activeToken.room_number}` : ''}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => navigate('/patient/tokens')}
                    className="editorial-btn-primary"
                  >
                    Open QR Pass
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4 pt-4 border-t border-hairline">
                <div>
                  <p className="font-mono text-[10px] font-semibold uppercase tracking-wider text-muted">Tokens Ahead</p>
                  <p className="font-display text-xl font-bold text-ink mt-0.5">
                    {activeToken.tokens_ahead ?? 0}
                  </p>
                </div>
                <div>
                  <p className="font-mono text-[10px] font-semibold uppercase tracking-wider text-muted">Est. Wait</p>
                  <p className="font-display text-xl font-bold text-cobalt mt-0.5">
                    ~{activeToken.estimated_wait_minutes ?? (activeToken.tokens_ahead ?? 0) * 10}m
                  </p>
                </div>
                <div>
                  <p className="font-mono text-[10px] font-semibold uppercase tracking-wider text-muted">Priority</p>
                  <p className="font-display text-xl font-bold text-ink capitalize mt-0.5">
                    {activeToken.priority || 'Normal'}
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="editorial-card p-6 bg-surface/60 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-1">
                <p className="editorial-eyebrow">No Active OPD Token</p>
                <h2 className="font-display text-lg font-bold text-ink">
                  Ready to schedule your next consultation?
                </h2>
                <p className="text-xs text-muted">
                  Check real-time doctor queue lengths and book a walk-in token or advance time slot.
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => navigate('/patient/tokens')}
                  className="editorial-btn-secondary"
                >
                  {t('navMyPasses')}
                </button>
                <button
                  type="button"
                  onClick={() => navigate('/patient/book-token')}
                  className="editorial-btn-primary"
                >
                  {t('navBookToken')}
                </button>
              </div>
            </div>
          )}

          {/* Care & Records Modules */}
          <div className="editorial-card overflow-hidden">
            <div className="px-6 py-4 border-b border-hairline flex items-center justify-between">
              <h2 className="font-display text-base font-bold text-ink">Care &amp; Records Modules</h2>
              <span className="font-mono text-[11px] text-muted">5 INTEGRATED SERVICES</span>
            </div>

            <div className="divide-y divide-hairline">
              {modules.map((mod) => (
                <div
                  key={mod.path}
                  className="px-6 py-4 flex items-center justify-between gap-4 hover:bg-surface/60 transition"
                >
                  <div className="flex items-center gap-4 min-w-0">
                    <div className="w-9 h-9 rounded-lg bg-cobalt-tint text-cobalt flex items-center justify-center shrink-0">
                      {mod.icon}
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-sm font-semibold text-ink truncate">{mod.title}</h3>
                      <p className="text-xs text-muted truncate sm:whitespace-normal">{mod.desc}</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => navigate(mod.path)}
                    className="editorial-btn-secondary shrink-0 px-3.5 py-2"
                  >
                    {mod.action} →
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Rail */}
        <aside className="space-y-6">
          {/* Patient Profile Summary */}
          <div className="editorial-card overflow-hidden">
            <div className="px-5 py-3.5 border-b border-hairline flex items-center justify-between bg-surface/60">
              <h2 className="font-display text-sm font-bold text-ink">Patient Profile</h2>
              <span className="font-mono text-[11px] font-semibold text-cobalt">{displayPatientCode}</span>
            </div>
            <div className="divide-y divide-hairline text-xs">
              <div className="px-5 py-3 flex items-center justify-between">
                <span className="text-muted">Blood Group</span>
                <span className="font-mono font-bold text-clinical-danger">
                  {profile?.blood_group || user?.blood_group || 'Not Set'}
                </span>
              </div>
              <div className="px-5 py-3 flex items-center justify-between">
                <span className="text-muted">Gender</span>
                <span className="font-semibold text-ink">
                  {profile?.gender === 'M' ? 'Male' : profile?.gender === 'F' ? 'Female' : 'Other'}
                </span>
              </div>
              <div className="px-5 py-3 flex items-center justify-between">
                <span className="text-muted">Registered Mobile</span>
                <span className="font-mono font-medium text-ink">{user?.phone || 'Not set'}</span>
              </div>
              <div className="px-5 py-3 flex items-center justify-between">
                <span className="text-muted">Portal Status</span>
                <span className="inline-flex items-center gap-1.5 font-semibold text-clinical-success">
                  <span className="w-2 h-2 rounded-full bg-clinical-success" />
                  Active
                </span>
              </div>
            </div>
          </div>

          {/* Live Proximity Alerts Feed */}
          <div className={`editorial-card overflow-hidden ${unreadCount > 0 ? 'border-amber-300' : ''}`}>
            <div className={`px-5 py-3.5 border-b border-hairline flex items-center justify-between ${unreadCount > 0 ? 'bg-amber-50/70' : 'bg-surface/60'}`}>
              <div className="flex items-center gap-2">
                <h2 className="font-display text-sm font-bold text-ink">Proximity Alerts</h2>
                {unreadCount > 0 && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-clinical-warning text-white">
                    {unreadCount} New
                  </span>
                )}
              </div>
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={handleMarkAllRead}
                  disabled={notifLoading}
                  className="text-[11px] font-semibold text-cobalt hover:underline cursor-pointer"
                >
                  Mark All Read
                </button>
              )}
            </div>

            <div className="p-4">
              {notifications.length === 0 ? (
                <p className="text-xs text-muted leading-relaxed">{t('noNotifications')}</p>
              ) : (
                <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
                  {notifications.slice(0, 6).map((n) => (
                    <div
                      key={n.id}
                      className={`p-3 rounded-lg border text-xs space-y-1.5 ${
                        n.is_read
                          ? 'bg-surface/60 border-hairline text-muted'
                          : 'bg-amber-50/50 border-amber-200 text-ink'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded bg-cobalt-tint text-cobalt">
                            {n.channel || 'in_app'}
                          </span>
                          {n.token_code && (
                            <span className="font-mono text-[11px] font-bold text-ink">{n.token_code}</span>
                          )}
                        </div>
                        <span className="font-mono text-[10px] text-muted">
                          {new Date(n.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <p className="font-semibold text-ink">{n.title}</p>
                      <p className="leading-relaxed">{n.message}</p>
                      {!n.is_read && (
                        <button
                          type="button"
                          onClick={() => handleMarkNotificationRead(n.id)}
                          disabled={notifLoading}
                          className="text-[11px] font-semibold text-cobalt hover:underline cursor-pointer"
                        >
                          Mark as Read
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </aside>
      </div>

      {/* Unified Patient Journey Timeline Modal */}
      <PatientJourneyModal
        isOpen={journeyModalOpen}
        onClose={() => setJourneyModalOpen(false)}
        patientId={resolvedPatientId}
      />
    </div>
  );
};

export default PatientDashboard;
