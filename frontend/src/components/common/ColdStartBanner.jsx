/**
 * src/components/common/ColdStartBanner.jsx
 * -----------------------------------------
 * Displays a helpful banner whenever the Render free-tier backend takes >3.5s
 * to wake up from sleep, reassuring users instead of showing a blank/frozen UI.
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
    <div className="fixed bottom-4 right-4 z-50 max-w-md bg-amber-950 text-amber-50 border border-amber-500/40 rounded-2xl px-4 py-3 shadow-2xl flex items-center space-x-3">
      <div className="animate-spin rounded-full h-5 w-5 border-2 border-amber-300 border-t-transparent shrink-0" />
      <p className="text-xs font-medium leading-relaxed">{t('coldStartMsg')}</p>
    </div>
  );
};

export default ColdStartBanner;
