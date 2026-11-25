/**
 * src/context/LanguageContext.jsx
 * -------------------------------
 * Multilingual interface context supporting English (en), Hindi (hi), and Punjabi (pa).
 */

import React, { createContext, useContext, useState } from 'react';

const TRANSLATIONS = {
  en: {
    brand: 'SmartCare',
    hms: 'HMS',
    signIn: 'Sign In',
    register: 'Register',
    signOut: 'Sign Out',
    forgotPassword: 'Forgot password?',
    navAnalytics: 'Analytics',
    navStaff: 'Staff & Clinics',
    navBeds: 'Ward Beds',
    navBloodStock: 'Blood Stock',
    navBloodRequests: 'Blood Requests',
    navDonors: 'Donors',
    navDisplay: 'Public Display',
    navQueue: 'OPD Queue',
    navMyPortal: 'My Portal',
    navBookToken: 'Book OPD Token',
    navMyPasses: 'My Passes',
    navDoctors: 'Doctors',
    navReceptionDesk: 'Reception Desk',
    navBilling: 'Billing & Invoices',
    navRecords: 'Medical Records',
    patientPortal: 'Patient Portal',
    receptionPortal: 'Reception & Front Desk',
    doctorPortal: 'Doctor Consultation Portal',
    adminPortal: 'Hospital Control Center',
    bloodBankPortal: 'Blood Bank Operations',
    welcome: 'Welcome',
    liveQueueActive: 'Live Auto-Refresh Active (5s)',
    notificationsTitle: 'Queue Proximity Alerts (SMS / WhatsApp)',
    noNotifications: 'No queue notifications yet. Alerts trigger automatically when your token is <= 3 positions away.',
    medicalRecordsTitle: 'Medical Records, Prescriptions & Lab Reports',
    billingTitle: 'Hospital Invoices & PDF Receipts',
    downloadPdf: 'Download PDF Receipt',
    payNow: 'Pay Invoice',
    exportCsv: 'Export CSV',
    exportPdf: 'Export PDF Report',
    auditLogTitle: 'Security & Clinical Access Audit Log',
    advanceSlotLabel: 'Optional Advance Time Slot',
    onLeaveBadge: 'Doctor On Leave',
    submitFeedback: 'Rate Consultation',
    coldStartMsg: 'Waking up Render free-tier backend server (~45–60s cold start on first load)... Please wait.',
    sandboxNotice: 'Synthetic Sandbox Demo: All records are fake test data. Demo Admin login is disabled in live production.',
  },
  hi: {
    brand: 'स्मार्टकेयर',
    hms: 'एचएमएस',
    signIn: 'साइन इन करें',
    register: 'पंजीकरण करें',
    signOut: 'लॉग आउट',
    forgotPassword: 'पासवर्ड भूल गए?',
    navAnalytics: 'विश्लेषण (Analytics)',
    navStaff: 'स्टाफ और क्लीनिक',
    navBeds: 'वार्ड और बेड',
    navBloodStock: 'ब्लड स्टॉक',
    navBloodRequests: 'रक्त अनुरोध',
    navDonors: 'रक्तदाता',
    navDisplay: 'डिस्प्ले स्क्रीन',
    navQueue: 'ओपीडी कतार',
    navMyPortal: 'मेरा पोर्टल',
    navBookToken: 'ओपीडी टोकन बुक करें',
    navMyPasses: 'मेरे टोकन पास',
    navDoctors: 'डॉक्टर सूची',
    navReceptionDesk: 'रिसेप्शन डेस्क',
    navBilling: 'बिल और रसीद',
    navRecords: 'मेडिकल रिकॉर्ड',
    patientPortal: 'रोगी पोर्टल',
    receptionPortal: 'रिसेप्शन एवं फ्रंट डेस्क',
    doctorPortal: 'डॉक्टर परामर्श पोर्टल',
    adminPortal: 'अस्पताल नियंत्रण कक्ष',
    bloodBankPortal: 'ब्लड बैंक प्रबंधन',
    welcome: 'स्वागत है',
    liveQueueActive: 'लाइव ऑटो-अपडेट चालू (5 सेकंड)',
    notificationsTitle: 'कतार अलर्ट (SMS / WhatsApp)',
    noNotifications: 'अभी कोई सूचना नहीं है। टोकन 3 नंबर के भीतर आने पर अलर्ट मिलेगा।',
    medicalRecordsTitle: 'मेडिकल रिकॉर्ड, प्रिस्क्रिप्शन और लैब रिपोर्ट',
    billingTitle: 'अस्पताल बिल और पीडीएफ रसीद',
    downloadPdf: 'पीडीएफ रसीद डाउनलोड करें',
    payNow: 'भुगतान करें',
    exportCsv: 'CSV निर्यात करें',
    exportPdf: 'PDF रिपोर्ट डाउनलोड करें',
    auditLogTitle: 'सुरक्षा एवं क्लिनिकल ऑडिट लॉग',
    advanceSlotLabel: 'अग्रिम समय स्लॉट चुनें (वैकल्पिक)',
    onLeaveBadge: 'डॉक्टर अवकाश पर हैं',
    submitFeedback: 'परामर्श रेटिंग दें',
    coldStartMsg: 'सर्वर चालू हो रहा है (Render फ़्री टियर पर पहली बार ~45–60 सेकंड लग सकते हैं)... कृपया प्रतीक्षा करें।',
    sandboxNotice: 'सिंथेटिक डेमो सैंडबॉक्स: सभी डेटा नकली है। लाइव सर्वर पर एडमिन डेमो लॉगिन बंद है।',
  },
  pa: {
    brand: 'ਸਮਾਰਟਕੇਅਰ',
    hms: 'ਐਚਐਮਐਸ',
    signIn: 'ਸਾਈਨ ਇਨ ਕਰੋ',
    register: 'ਰਜਿਸਟਰ ਕਰੋ',
    signOut: 'ਲੌਗ ਆਊਟ',
    forgotPassword: 'ਪਾਸਵਰਡ ਭੁੱਲ ਗਏ?',
    navAnalytics: 'ਵਿਸ਼ਲੇਸ਼ਣ',
    navStaff: 'ਸਟਾਫ਼ ਅਤੇ ਕਲੀਨਿਕ',
    navBeds: 'ਵਾਰਡ ਅਤੇ ਬੈੱਡ',
    navBloodStock: 'ਬਲੱਡ ਸਟਾਕ',
    navBloodRequests: 'ਖ਼ੂਨ ਦੀ ਮੰਗ',
    navDonors: 'ਖ਼ੂਨਦਾਨੀ',
    navDisplay: 'ਡਿਸਪਲੇ ਸਕ੍ਰੀਨ',
    navQueue: 'ਓਪੀਡੀ ਕਤਾਰ',
    navMyPortal: 'ਮੇਰਾ ਪੋਰਟਲ',
    navBookToken: 'ਓਪੀਡੀ ਟੋਕਨ ਬੁੱਕ ਕਰੋ',
    navMyPasses: 'ਮੇਰੇ ਟੋਕਨ ਪਾਸ',
    navDoctors: 'ਡਾਕਟਰਾਂ ਦੀ ਸੂਚੀ',
    navReceptionDesk: 'ਰਿਸੈਪਸ਼ਨ ਡੈਸਕ',
    navBilling: 'ਬਿੱਲ ਅਤੇ ਰਸੀਦਾਂ',
    navRecords: 'ਮੈਡੀਕਲ ਰਿਕਾਰਡ',
    patientPortal: 'ਮਰੀਜ਼ ਪੋਰਟਲ',
    receptionPortal: 'ਰਿਸੈਪਸ਼ਨ ਅਤੇ ਫਰੰਟ ਡੈਸਕ',
    doctorPortal: 'ਡਾਕਟਰ ਸਲਾਹ ਪੋਰਟਲ',
    adminPortal: 'ਹਸਪਤਾਲ ਕੰਟਰੋਲ ਕੇਂਦਰ',
    bloodBankPortal: 'ਬਲੱਡ ਬੈਂਕ ਪ੍ਰਬੰਧਨ',
    welcome: 'ਜੀ ਆਇਆਂ ਨੂੰ',
    liveQueueActive: 'ਲਾਈਵ ਆਟੋ-ਰਿਫਰੈਸ਼ ਚਾਲੂ (5s)',
    notificationsTitle: 'ਕਤਾਰ ਚੇਤਾਵਨੀਆਂ (SMS / WhatsApp)',
    noNotifications: 'ਹਾਲੇ ਕੋਈ ਸੂਚਨਾ ਨਹੀਂ ਹੈ। ਜਦੋਂ ਤੁਹਾਡਾ ਟੋਕਨ 3 ਨੰਬਰ ਦੇ ਅੰਦਰ ਹੋਵੇਗਾ ਤਾਂ ਚੇਤਾਵਨੀ ਆਵੇਗੀ।',
    medicalRecordsTitle: 'ਮੈਡੀਕਲ ਰਿਕਾਰਡ, ਪਰਚੀਆਂ ਅਤੇ ਲੈਬ ਰਿਪੋਰਟਾਂ',
    billingTitle: 'ਹਸਪਤਾਲ ਬਿੱਲ ਅਤੇ PDF ਰਸੀਦਾਂ',
    downloadPdf: 'PDF ਰਸੀਦ ਡਾਊਨਲੋਡ ਕਰੋ',
    payNow: 'ਭੁਗਤਾਨ ਕਰੋ',
    exportCsv: 'CSV ਐਕਸਪੋਰਟ',
    exportPdf: 'PDF ਰਿਪੋਰਟ ਡਾਊਨਲੋਡ',
    auditLogTitle: 'ਸੁਰੱਖਿਆ ਅਤੇ ਕਲੀਨਿਕਲ ਆਡਿਟ ਲੌਗ',
    advanceSlotLabel: 'ਅਗਾਊਂ ਸਮਾਂ ਸਲਾਟ (ਵਿਕਲਪਿਕ)',
    onLeaveBadge: 'ਡਾਕਟਰ ਛੁੱਟੀ ਤੇ ਹਨ',
    submitFeedback: 'ਡਾਕਟਰ ਨੂੰ ਰੇਟਿੰਗ ਦਿਓ',
    coldStartMsg: 'ਸਰਵਰ ਜਾਗ ਰਿਹਾ ਹੈ (Render ਫ੍ਰੀ ਟੀਅਰ ਉੱਤੇ ਪਹਿਲੀ ਵਾਰ ~45–60 ਸਕਿੰਟ ਲੱਗ ਸਕਦੇ ਹਨ)... ਕਿਰਪਾ ਕਰਕੇ ਉਡੀਕ ਕਰੋ।',
    sandboxNotice: 'ਨਕਲੀ ਡੈਮੋ ਸੈਂਡਬਾਕਸ: ਸਾਰਾ ਡਾਟਾ ਨਕਲੀ ਹੈ। ਲਾਈਵ ਸਰਵਰ ਉੱਤੇ ਐਡਮਿਨ ਡੈਮੋ ਲੌਗਇਨ ਬੰਦ ਹੈ।',
  },
};

const LanguageContext = createContext(null);

export const LanguageProvider = ({ children }) => {
  const [lang, setLang] = useState(() => localStorage.getItem('smartcare_lang') || 'en');

  const changeLanguage = (nextLang) => {
    if (TRANSLATIONS[nextLang]) {
      setLang(nextLang);
      localStorage.setItem('smartcare_lang', nextLang);
    }
  };

  const t = (key) => {
    return TRANSLATIONS[lang]?.[key] || TRANSLATIONS.en[key] || key;
  };

  return (
    <LanguageContext.Provider value={{ lang, setLang: changeLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => {
  const ctx = useContext(LanguageContext);
  if (!ctx) {
    return {
      lang: 'en',
      setLang: () => {},
      t: (k) => TRANSLATIONS.en[k] || k,
    };
  }
  return ctx;
};
