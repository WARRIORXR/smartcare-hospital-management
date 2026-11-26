/**
 * src/components/common/ColdStartBanner.jsx
 * -----------------------------------------
 * Editorial toast displayed whenever the backend server is waking from cold start.
 */

import React, { useEffect, useState } from 'react';
import { useLanguage } from '../../context/LanguageContext';

const ColdStartBanner = () => {
  const { t } = useLanguage();
  const [waking, setWaking] = useState(false);

  useEffect(() => {
    const handler = (e) => setWaking(Boolean(e?.detail?.waking));
    window.addEventListener('smartcare:cold-start', handler);
    return () => window.removeEventListener('smartcare:cold-start', handler);
  }, []);

  if (!waking) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 max-w-md bg-ink text-white border border-slate-700 rounded-xl px-4 py-3 shadow-xl flex items-center gap-3">
      <div className="animate-spin rounded-full h-4 w-4 border-2 border-blue-400 border-t-transparent shrink-0" />
      <p className="text-xs font-medium leading-relaxed text-slate-200">{t('coldStartMsg')}</p>
    </div>
  );
};

export default ColdStartBanner;
