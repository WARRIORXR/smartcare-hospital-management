/**
 * src/pages/public/PublicDisplayScreen.jsx
 * -----------------------------------------
 * Public Hospital Waiting Lounge TV Display Screen.
 * Accessible without login (/display/:doctorId or /display).
 * Features:
 *  - High-contrast TV theme with giant readable typography
 *  - Massive "NOW SERVING" Token Code display with room callout
 *  - "NEXT 5 TOKENS" queue list with priority tags
 *  - Auto-refreshes every 5 seconds
 *  - Web Speech synthesis voice announcement on token change
 *  - Live digital clock and fullscreen mode
 */

import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, Navigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import opdService from '../../services/opdService';
import hospitalService from '../../services/hospitalService';

const PublicDisplayScreen = () => {
  const { user, isAuthenticated, loading: authLoading } = useAuth();
  const { doctorId } = useParams();
  const navigate = useNavigate();

  const [activeDoctorId, setActiveDoctorId] = useState(doctorId || '');
  const [doctors, setDoctors] = useState([]);
  const [displayData, setDisplayData] = useState(null);
  const [displayError, setDisplayError] = useState(null);
  const [currentTime, setCurrentTime] = useState(() => new Date().toLocaleTimeString());
  const [serverFallbackDate] = useState(() => new Date().toLocaleDateString());
  const [soundEnabled, setSoundEnabled] = useState(false);
  const lastAnnouncedTokenRef = useRef(null);

  const isDisplayAuthorized = Boolean(isAuthenticated && user && ['admin', 'doctor', 'reception'].includes(user.role));

  // Live Digital Clock (every 1 second)
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date().toLocaleTimeString());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Fetch available doctors if no doctorId or for selector
  useEffect(() => {
    if (!isDisplayAuthorized) return;
    const fetchDoctors = async () => {
      try {
        const docList = await hospitalService.getDoctors();
        setDoctors(docList);
        if (!doctorId && docList.length > 0) {
          setActiveDoctorId(docList[0].id.toString());
        }
      } catch (err) {
        console.error('Failed to load doctors list', err);
      }
    };
    fetchDoctors();
  }, [isDisplayAuthorized, doctorId]);

  // Fetch Display Data (Every 5 seconds)
  const fetchDisplay = async () => {
    const targetId = doctorId || activeDoctorId;
    if (!targetId || !isDisplayAuthorized) return false;

    try {
      const data = await opdService.getPublicDisplayData(targetId);
      setDisplayError(null);
      setDisplayData(data);

      // Voice announcement if token changed
      const currentCode = data?.now_serving?.token_code;
      if (currentCode && currentCode !== lastAnnouncedTokenRef.current) {
        lastAnnouncedTokenRef.current = currentCode;
        if (soundEnabled && 'speechSynthesis' in window) {
          const room = data.doctor?.room_number || 'the clinic';
          const utterance = new SpeechSynthesisUtterance(
            `Token number ${currentCode}. Please proceed to ${room}.`
          );
          utterance.rate = 0.9;
          window.speechSynthesis.speak(utterance);
        }
      }
      return true;
    } catch (err) {
      const status = err?.response?.status;
      setDisplayData(null);
      if (status === 404 || status === 400) {
        setDisplayError(`Clinic display screen unavailable for Doctor ID "${targetId}".`);
        return false;
      }
      setDisplayError('Unable to reach live queue display service.');
      return true;
    }
  };

  useEffect(() => {
    if (!isDisplayAuthorized) return;
    let active = true;
    let interval = null;

    setDisplayError(null);
    fetchDisplay().then((shouldPoll) => {
      if (!active || !shouldPoll) return;
      interval = setInterval(fetchDisplay, 5000);
    });

    return () => {
      active = false;
      if (interval) clearInterval(interval);
    };
  }, [isDisplayAuthorized, doctorId, activeDoctorId, soundEnabled]);

  // Defensive Guard: Only authorized clinical/front-desk staff (Doctor / Admin / Reception) can view Clinic Screen
  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-white">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (!isDisplayAuthorized) {
    return <Navigate to="/dashboard" replace />;
  }

  // Fullscreen toggle helper
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  };

  const doctor = displayData?.doctor;
  const nowServing = displayData?.now_serving;
  const nextTokens = displayData?.next_tokens || [];

  return (
    <div className="min-h-screen bg-[#0B1220] text-white font-sans flex flex-col justify-between selection:bg-cobalt selection:text-white">
      {/* ─── TOP TV HEADER ─── */}
      <header className="bg-[#0B1220] border-b border-slate-800/80 px-6 sm:px-10 py-5 flex flex-wrap justify-between items-center gap-4">
        <div className="flex items-center gap-4">
          <div>
            <div className="flex items-center gap-3">
              <span className="font-display text-xl sm:text-2xl font-bold tracking-tight text-white">
                SmartCare Hospital
              </span>
              <span className="font-mono text-[10px] font-semibold px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 uppercase tracking-wider">
                LIVE 5S QUEUE
              </span>
            </div>
            <p className="text-xs sm:text-sm text-slate-400 mt-0.5">
              {doctor?.department || 'Outpatient Department'} · <span className="text-slate-200 font-medium">{doctor?.name || 'On-Duty Clinic'}</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-5">
          <div className="text-right">
            <span className="block font-mono text-[10px] font-semibold uppercase tracking-widest text-slate-400">
              Clinic Room
            </span>
            <span className="font-mono text-xl sm:text-2xl font-bold text-blue-400">
              {doctor?.room_number?.toUpperCase() || 'ROOM 101'}
            </span>
          </div>

          <div className="text-right hidden sm:block pl-5 border-l border-slate-800">
            <span className="block font-mono text-2xl sm:text-3xl font-bold tracking-wider text-white">
              {currentTime}
            </span>
            <span className="font-mono text-[10px] text-slate-500 uppercase">
              {displayData?.server_date || serverFallbackDate}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setSoundEnabled(!soundEnabled)}
              title={soundEnabled ? 'Voice Announcements ON' : 'Turn Voice Announcements ON'}
              className={`px-3 py-2 rounded-lg border text-xs font-semibold transition cursor-pointer ${
                soundEnabled
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                  : 'bg-[#111A2E] text-slate-400 border-slate-800 hover:text-white'
              }`}
            >
              {soundEnabled ? 'Voice ON' : 'Mute'}
            </button>
            <button
              onClick={toggleFullscreen}
              title="Fullscreen Mode for TV Screen"
              className="px-3 py-2 rounded-lg bg-[#111A2E] hover:bg-slate-800 text-slate-300 border border-slate-800 text-xs font-semibold transition cursor-pointer"
            >
              Fullscreen
            </button>
          </div>
        </div>
      </header>

      {/* Doctor selector bar if multiple doctors are available */}
      {doctors.length > 1 && (
        <div className="bg-[#0F172A] border-b border-slate-800/80 px-6 sm:px-10 py-2.5 flex items-center justify-between overflow-x-auto text-xs">
          <span className="font-mono text-[10px] text-slate-400 font-semibold uppercase tracking-wider mr-3 whitespace-nowrap">
            Clinic Screen:
          </span>
          <div className="flex gap-2 overflow-x-auto">
            {doctors.map((d) => (
              <button
                key={d.id}
                onClick={() => {
                  setActiveDoctorId(d.id.toString());
                  navigate(`/display/${d.id}`);
                }}
                className={`px-3 py-1 rounded-lg font-semibold transition whitespace-nowrap cursor-pointer ${
                  (doctorId || activeDoctorId) === d.id.toString()
                    ? 'bg-cobalt text-white'
                    : 'bg-[#111A2E] text-slate-400 hover:text-white border border-slate-800'
                }`}
              >
                {d.doctor_name} ({d.room_number || 'Room 101'})
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ─── MAIN TV STAGE (2 COLUMNS) ─── */}
      {displayError ? (
        <main className="flex-1 flex items-center justify-center p-8">
          <div className="bg-[#111A2E] border border-rose-500/40 rounded-2xl p-8 max-w-md w-full text-center space-y-4">
            <h2 className="font-display text-xl font-bold text-white">Clinic Display Not Found</h2>
            <p className="text-sm text-rose-300">{displayError}</p>
            <button
              type="button"
              onClick={() => {
                setDisplayError(null);
                navigate('/display');
              }}
              className="px-5 py-2.5 rounded-lg bg-cobalt hover:bg-cobalt-hover text-white text-xs font-semibold transition cursor-pointer"
            >
              Switch to Default Clinic Display
            </button>
          </div>
        </main>
      ) : (
        <main className="flex-1 p-6 sm:p-10 grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch max-w-[1440px] mx-auto w-full">
          {/* ─── LEFT: NOW SERVING (HERO - 7 COLS) ─── */}
          <section className="lg:col-span-7 bg-[#111A2E] border border-slate-800 rounded-2xl p-8 sm:p-10 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="font-mono text-xs font-semibold tracking-widest text-blue-400 uppercase">
                NOW SERVING IN CLINIC
              </span>

              {nowServing && (
                <span
                  className={`font-mono text-[11px] uppercase px-3 py-1 rounded-full font-bold tracking-wider border ${
                    nowServing.priority === 'emergency'
                      ? 'bg-rose-500/15 text-rose-300 border-rose-500/40'
                      : nowServing.priority === 'senior_citizen'
                      ? 'bg-amber-500/15 text-amber-300 border-amber-500/40'
                      : 'bg-cobalt/20 text-blue-300 border-blue-500/30'
                  }`}
                >
                  {nowServing.priority.replace('_', ' ')}
                </span>
              )}
            </div>

            {nowServing ? (
              <div className="my-10 space-y-4">
                <div className="font-mono text-7xl sm:text-8xl md:text-[112px] font-bold tracking-tight text-white leading-none">
                  {nowServing.token_code}
                </div>
                <p className="text-sm sm:text-base text-slate-400">
                  {doctor?.department || 'Outpatient Clinic'} · Privacy Mode Active (Patient Names Hidden)
                </p>
              </div>
            ) : (
              <div className="my-14 space-y-2">
                <div className="font-display text-3xl sm:text-5xl font-bold text-slate-400">
                  Doctor Ready
                </div>
                <p className="text-sm text-slate-500">
                  Waiting for next patient to be called into consultation room...
                </p>
              </div>
            )}

            <div className="px-6 py-4 bg-cobalt rounded-xl flex items-center justify-between">
              <span className="font-display text-base sm:text-xl font-bold text-white">
                {nowServing
                  ? `Please proceed to ${doctor?.room_number || 'Room 101'}`
                  : 'Please wait in the lounge'}
              </span>
              <span className="font-mono text-lg text-white/90">→</span>
            </div>
          </section>

          {/* ─── RIGHT: NEXT IN LINE (5 COLS) ─── */}
          <section className="lg:col-span-5 bg-[#111A2E] border border-slate-800 rounded-2xl p-6 sm:p-8 flex flex-col justify-between">
            <div className="space-y-5">
              <div className="flex justify-between items-center pb-4 border-b border-slate-800">
                <h2 className="font-display text-lg font-bold text-white">Next In Line</h2>
                <span className="font-mono text-xs font-semibold text-blue-400 uppercase">
                  {displayData?.stats?.waiting_count || 0} WAITING
                </span>
              </div>

              {nextTokens.length === 0 ? (
                <div className="text-center py-16 text-slate-500">
                  <p className="text-base font-semibold">No Waiting Patients</p>
                  <p className="text-xs text-slate-600 mt-1">Queue is all caught up.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {nextTokens.map((token, idx) => (
                    <div
                      key={token.id}
                      className={`p-4 rounded-xl border flex items-center justify-between ${
                        idx === 0
                          ? 'bg-[#16223D] border-cobalt/60'
                          : 'bg-[#0F172A] border-slate-800'
                      }`}
                    >
                      <div>
                        <div className="font-mono text-2xl font-bold text-white tracking-wide">
                          {token.token_code}
                        </div>
                        <div className="text-xs text-slate-400 mt-0.5 capitalize">
                          {token.time_slot ? `Advance Slot ${token.time_slot}` : 'Scheduled Walk-In'} · {token.priority.replace('_', ' ')}
                        </div>
                      </div>

                      <div className="font-mono text-sm font-bold text-emerald-400">
                        ~{token.approx_waiting_time || (idx + 1) * 15}m
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="mt-6 pt-4 border-t border-slate-800 text-[11px] font-mono text-slate-500 uppercase tracking-wider">
              SmartCare HMS · Clinical Lounge Display
            </div>
          </section>
        </main>
      )}
    </div>
  );
};

export default PublicDisplayScreen;
