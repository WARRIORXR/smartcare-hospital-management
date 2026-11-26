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
  const [loading, setLoading] = useState(true);
  const [currentTime, setCurrentTime] = useState(new Date().toLocaleTimeString());
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
    } finally {
      setLoading(false);
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
    <div className="min-h-screen bg-slate-950 text-white font-sans flex flex-col justify-between selection:bg-blue-600 selection:text-white">
      {/* ─── TOP TV HEADER ─── */}
      <header className="bg-slate-900/90 border-b border-slate-800 px-6 sm:px-10 py-5 flex flex-wrap justify-between items-center gap-4">
        {/* Hospital & Doctor Brand */}
        <div className="flex items-center space-x-4">
          <div className="w-14 h-14 rounded-2xl bg-blue-600 flex items-center justify-center text-3xl shadow-lg shadow-blue-500/20">
            🏥
          </div>
          <div>
            <div className="flex items-center space-x-3">
              <span className="text-xl sm:text-2xl font-black tracking-tight text-white">
                SmartCare Hospital
              </span>
              <span className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-xs px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider animate-pulse">
                Live OPD
              </span>
            </div>
            <p className="text-sm sm:text-base text-slate-400 mt-0.5 font-medium">
              {doctor?.department} • <strong className="text-white font-bold">{doctor?.name}</strong>
            </p>
          </div>
        </div>

        {/* Room & Live Clock */}
        <div className="flex items-center space-x-4 sm:space-x-6">
          {/* Clinic Room Callout */}
          <div className="bg-blue-600/20 border-2 border-blue-500 text-blue-300 px-5 py-2.5 rounded-2xl text-center shadow-inner">
            <span className="block text-[10px] sm:text-xs font-bold uppercase tracking-widest text-blue-400">
              Clinic Destination
            </span>
            <span className="text-xl sm:text-2xl font-black text-white font-mono">
              📍 {doctor?.room_number || 'ROOM 101'}
            </span>
          </div>

          {/* Clock */}
          <div className="text-right hidden sm:block">
            <span className="block text-2xl sm:text-3xl font-black font-mono tracking-wider text-cyan-400">
              {currentTime}
            </span>
            <span className="text-xs text-slate-500 font-semibold uppercase">
              {displayData?.server_date || new Date().toLocaleDateString()}
            </span>
          </div>

          {/* TV Controls: Fullscreen & Voice */}
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setSoundEnabled(!soundEnabled)}
              title={soundEnabled ? 'Voice Announcements ON' : 'Turn Voice Announcements ON'}
              className={`p-2.5 rounded-xl border text-sm transition ${
                soundEnabled
                  ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                  : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-white'
              }`}
            >
              {soundEnabled ? '🔊 Voice ON' : '🔇 Mute'}
            </button>
            <button
              onClick={toggleFullscreen}
              title="Fullscreen Mode for TV Screen"
              className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-sm transition"
            >
              ⛶ TV
            </button>
          </div>
        </div>
      </header>

      {/* Doctor selector bar if multiple doctors are available */}
      {doctors.length > 1 && (
        <div className="bg-slate-900/60 border-b border-slate-800/80 px-6 py-2.5 flex items-center justify-between overflow-x-auto text-xs">
          <span className="text-slate-400 font-bold uppercase tracking-wider mr-3 whitespace-nowrap">
            Switch Clinic Screen:
          </span>
          <div className="flex space-x-2 overflow-x-auto">
            {doctors.map((d) => (
              <button
                key={d.id}
                onClick={() => {
                  setActiveDoctorId(d.id.toString());
                  navigate(`/display/${d.id}`);
                }}
                className={`px-3 py-1 rounded-lg font-bold transition whitespace-nowrap ${
                  (doctorId || activeDoctorId) === d.id.toString()
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white'
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
          <div className="bg-slate-900 border border-rose-500/40 rounded-3xl p-8 max-w-md w-full text-center space-y-4 shadow-2xl">
            <div className="text-4xl">📺</div>
            <h2 className="text-xl font-black text-white">Clinic Display Not Found</h2>
            <p className="text-sm text-rose-300">{displayError}</p>
            <button
              type="button"
              onClick={() => {
                setDisplayError(null);
                navigate('/display');
              }}
              className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition cursor-pointer"
            >
              Switch to Default Clinic Display
            </button>
          </div>
        </main>
      ) : (
      <main className="flex-1 p-6 sm:p-10 grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch max-w-8xl mx-auto w-full">
        {/* ─── LEFT: NOW SERVING (HERO - 7 COLS) ─── */}
        <section className="lg:col-span-7 bg-gradient-to-br from-slate-900 via-slate-900 to-blue-950/60 border-2 border-blue-500/40 rounded-3xl p-8 sm:p-12 flex flex-col justify-between shadow-2xl relative overflow-hidden">
          {/* Subtle background glow */}
          <div className="absolute top-0 right-0 -mr-20 -mt-20 w-80 h-80 rounded-full bg-blue-600/10 blur-3xl pointer-events-none"></div>

          <div>
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs sm:text-sm font-black tracking-widest text-blue-400 uppercase bg-blue-500/10 border border-blue-500/30 px-3 py-1 rounded-full flex items-center">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-400 mr-2 animate-ping"></span>
                Now Serving In Clinic Room
              </span>

              {nowServing && (
                <span
                  className={`text-xs uppercase px-3 py-1 rounded-full font-extrabold tracking-wider ${
                    nowServing.priority === 'emergency'
                      ? 'bg-red-500/30 text-red-300 border border-red-500/50'
                      : nowServing.priority === 'senior_citizen'
                      ? 'bg-amber-500/30 text-amber-300 border border-amber-500/50'
                      : 'bg-blue-500/20 text-blue-300'
                  }`}
                >
                  {nowServing.priority.replace('_', ' ')}
                </span>
              )}
            </div>

            {/* Giant Token Code */}
            {nowServing ? (
              <div className="my-6 sm:my-10 text-center">
                <div className="text-7xl sm:text-8xl md:text-9xl font-black font-mono tracking-widest text-cyan-300 drop-shadow-[0_0_35px_rgba(34,211,238,0.35)] leading-none animate-pulse">
                  {nowServing.token_code}
                </div>

                <div className="mt-8 text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
                  {nowServing.doctor_name || doctor?.name || 'OPD Consultation'}
                </div>
                <div className="text-sm sm:text-base text-slate-400 font-mono mt-1">
                  {nowServing.time_slot ? `Scheduled Slot: ${nowServing.time_slot}` : `Priority Queue • Privacy Mode`}
                </div>
              </div>
            ) : (
              <div className="my-16 text-center">
                <span className="text-6xl block mb-4 opacity-50">⏳</span>
                <div className="text-3xl sm:text-5xl font-extrabold text-slate-500">
                  Doctor Ready
                </div>
                <p className="text-sm text-slate-400 mt-2">
                  Waiting for next patient to be called into consultation room...
                </p>
              </div>
            )}
          </div>

          {/* Destination Banner */}
          <div className="mt-6 p-5 sm:p-6 bg-blue-600 rounded-2xl text-center shadow-xl shadow-blue-600/30">
            <span className="text-xs uppercase font-extrabold tracking-widest text-blue-200 block mb-0.5">
              Attention Please
            </span>
            <div className="text-xl sm:text-3xl font-black text-white tracking-tight">
              {nowServing
                ? `👉 PLEASE PROCEED TO ${doctor?.room_number?.toUpperCase() || 'ROOM 101'}`
                : `PLEASE WAIT IN THE LOUNGE`}
            </div>
          </div>
        </section>

        {/* ─── RIGHT: NEXT 5 TOKENS (UPCOMING - 5 COLS) ─── */}
        <section className="lg:col-span-5 bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 flex flex-col justify-between shadow-xl">
          <div>
            <div className="flex justify-between items-center pb-4 border-b border-slate-800 mb-5">
              <div>
                <h2 className="text-lg sm:text-xl font-black text-white uppercase tracking-wider">
                  Next In Line
                </h2>
                <span className="text-xs text-slate-400">
                  Upcoming 5 Patients Waiting
                </span>
              </div>
              <span className="text-xs font-bold bg-slate-800 text-cyan-400 px-3 py-1 rounded-xl font-mono">
                {displayData?.stats?.waiting_count || 0} Waiting
              </span>
            </div>

            {/* Next 5 Cards Stack */}
            {nextTokens.length === 0 ? (
              <div className="text-center py-16 text-slate-500">
                <span className="text-4xl block mb-2 opacity-50">☕</span>
                <p className="text-base font-bold">No Waiting Patients</p>
                <p className="text-xs text-slate-400 mt-1">Queue is all caught up!</p>
              </div>
            ) : (
              <div className="space-y-3">
                {nextTokens.map((token, idx) => (
                  <div
                    key={token.id}
                    className={`p-4 rounded-2xl border transition flex items-center justify-between ${
                      idx === 0
                        ? 'bg-slate-800/90 border-cyan-500/50 shadow-md shadow-cyan-500/10'
                        : 'bg-slate-800/40 border-slate-700/60'
                    }`}
                  >
                    <div className="flex items-center space-x-3.5">
                      {/* Position pill */}
                      <span
                        className={`w-8 h-8 rounded-xl font-mono font-black text-sm flex items-center justify-center ${
                          idx === 0
                            ? 'bg-cyan-500 text-slate-950'
                            : 'bg-slate-700 text-slate-300'
                        }`}
                      >
                        {idx + 1}
                      </span>

                      {/* Token Code */}
                      <div>
                        <div className="text-2xl sm:text-3xl font-black font-mono text-white tracking-wide">
                          {token.token_code}
                        </div>
                        <div className="text-xs text-slate-400 font-medium">
                          {token.time_slot ? `Slot ${token.time_slot}` : token.doctor_name || `OPD #${token.token_number}`}
                        </div>
                      </div>
                    </div>

                    {/* Priority & Approx Wait */}
                    <div className="text-right space-y-1">
                      <span
                        className={`inline-block text-[10px] uppercase px-2 py-0.5 rounded-md font-extrabold ${
                          token.priority === 'emergency'
                            ? 'bg-red-500/30 text-red-300 border border-red-500/50'
                            : token.priority === 'senior_citizen'
                            ? 'bg-amber-500/30 text-amber-300 border border-amber-500/50'
                            : 'bg-slate-700 text-slate-300'
                        }`}
                      >
                        {token.priority.replace('_', ' ')}
                      </span>
                      <span className="block text-[11px] font-mono font-bold text-cyan-400">
                        ⏱️ ~{token.approx_waiting_time || (idx + 1) * 15}m
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Footer note inside right column */}
          <div className="mt-6 pt-4 border-t border-slate-800/80 text-center text-xs text-slate-500">
            Patients are called in order of Medical Priority & Token Number.
          </div>
        </section>
      </main>
      )}

      {/* ─── TV FOOTER TICKER ─── */}
      <footer className="bg-slate-900 border-t border-slate-800 px-6 py-3 flex flex-wrap justify-between items-center text-xs text-slate-400">
        <div className="flex items-center space-x-2">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
          <span className="font-medium">
            Live Queue Auto-Refresh Active (Every 5s)
          </span>
        </div>

        <div className="font-mono text-slate-500">
          SmartCare Hospital Integrated Management System • Public Display Terminal
        </div>
      </footer>
    </div>
  );
};

export default PublicDisplayScreen;
