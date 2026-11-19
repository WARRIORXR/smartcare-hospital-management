/**
 * src/context/ToastContext.jsx
 * ----------------------------
 * Global Toast Notification Context for SmartCare HMS.
 * Provides user feedback for success messages, errors, warnings, and alerts.
 */

import React, { createContext, useContext, useState, useCallback } from 'react';

const ToastContext = createContext(null);

export const ToastProvider = ({ children }) => {
  const [toasts, setToasts] = useState([]);

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback((message, type = 'success', duration = 4000) => {
    const id = Date.now() + Math.random().toString(36).substring(2, 5);
    const newToast = { id, message, type };

    setToasts((prev) => [...prev, newToast]);

    if (duration > 0) {
      setTimeout(() => {
        removeToast(id);
      }, duration);
    }
  }, [removeToast]);

  return (
    <ToastContext.Provider value={{ showToast, removeToast }}>
      {children}
      {/* Toast Notification Container */}
      <div className="fixed bottom-5 right-5 z-50 flex flex-col space-y-2.5 max-w-sm w-full pointer-events-none">
        {toasts.map((toast) => {
          let bgClass = 'bg-emerald-600 text-white';
          let icon = '✅';
          if (toast.type === 'error') {
            bgClass = 'bg-rose-600 text-white';
            icon = '❌';
          } else if (toast.type === 'warning') {
            bgClass = 'bg-amber-600 text-white';
            icon = '⚠️';
          } else if (toast.type === 'info') {
            bgClass = 'bg-blue-600 text-white';
            icon = 'ℹ️';
          }

          return (
            <div
              key={toast.id}
              className={`pointer-events-auto flex items-start justify-between p-4 rounded-xl shadow-xl transition-all duration-300 transform translate-y-0 ${bgClass}`}
            >
              <div className="flex items-start space-x-2.5 pr-2">
                <span className="text-base select-none">{icon}</span>
                <p className="text-xs font-semibold leading-relaxed mt-0.5">{toast.message}</p>
              </div>
              <button
                onClick={() => removeToast(toast.id)}
                className="text-white/80 hover:text-white text-sm font-bold ml-2 select-none"
              >
                ✕
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
};

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    // Graceful fallback if called outside ToastProvider
    return {
      showToast: (msg) => console.log('Toast:', msg),
      removeToast: () => {},
    };
  }
  return context;
};

export default ToastContext;
