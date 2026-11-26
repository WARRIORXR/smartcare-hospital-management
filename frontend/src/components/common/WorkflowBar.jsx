/**
 * src/components/common/WorkflowBar.jsx
 * -------------------------------------
 * Interactive Role-Based Workflow Pipeline Bar rendered across all protected pages.
 * Helps any user immediately understand:
 *  - All connected stages of their SmartCare journey (Step 1 -> 2 -> 3 -> 4)
 *  - Which step they are currently on
 *  - One-click navigation to any step or the next recommended step
 */

import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

const ROLE_WORKFLOWS = {
  patient: [
    { step: 1, title: 'Portal Home', hint: 'Overview & Alerts', path: '/patient/dashboard' },
    { step: 2, title: 'Live Queues', hint: 'Compare Doctors', path: '/patient/book-token', matches: ['/patient/book-token', '/patient/doctors'] },
    { step: 3, title: 'Reserve Slot', hint: 'Priority Checkout', path: '/patient/book-slot', prefixMatch: '/patient/book-slot' },
    { step: 4, title: 'QR Token Pass', hint: 'Track Live Turn', path: '/patient/tokens' },
    { step: 5, title: 'Care Journey', hint: '5-Stage Timeline', path: '/patient/journey', prefixMatch: '/patient/journey' },
    { step: 6, title: 'Rx & Labs', hint: 'Prescriptions & PDFs', path: '/records' },
    { step: 7, title: 'Bills & PDF', hint: 'Pay & Receipts', path: '/billing' },
  ],
  doctor: [
    { step: 1, title: 'OPD Room', hint: 'Call & Treat Patients', path: '/doctor/dashboard' },
    { step: 2, title: 'Write Rx & Labs', hint: 'Author Prescription', path: '/records/new', matches: ['/records/new', '/records'] },
    { step: 3, title: 'Inpatients & Beds', hint: 'Wards & Discharges', path: '/beds/inpatients', matches: ['/beds/inpatients', '/beds'] },
    { step: 4, title: 'Blood Bank', hint: 'Stock & Transfusion', path: '/bloodbank/requests', matches: ['/bloodbank', '/bloodbank/stock', '/bloodbank/requests', '/bloodbank/donors'] },
    { step: 5, title: 'Generate Bill', hint: 'OPD & Ward Invoice', path: '/billing/new', matches: ['/billing/new', '/billing'] },
  ],
  reception: [
    { step: 1, title: 'Front-Desk Queue', hint: 'Issue Walk-In Tokens', path: '/reception/dashboard' },
    { step: 2, title: 'Ward Grid', hint: 'Real-Time Occupancy', path: '/beds' },
    { step: 3, title: 'Inpatients', hint: 'Admissions & Discharge', path: '/beds/inpatients' },
    { step: 4, title: 'Generate Bill', hint: 'Invoice & PDF Print', path: '/billing/new', matches: ['/billing/new', '/billing'] },
    { step: 5, title: 'Blood Requests', hint: 'Emergency Requisition', path: '/bloodbank/requests' },
    { step: 6, title: 'Lounge TV', hint: 'Queue Display', path: '/display' },
  ],
  bloodbank_staff: [
    { step: 1, title: 'Live Stock', hint: '8 Blood Groups Inventory', path: '/bloodbank/stock', matches: ['/bloodbank', '/bloodbank/stock'] },
    { step: 2, title: 'Blood Requests', hint: 'Approve & Issue Units', path: '/bloodbank/requests' },
    { step: 3, title: 'Donor Registry', hint: 'Match & Contact Donors', path: '/bloodbank/donors' },
  ],
  admin: [
    { step: 1, title: 'Analytics & Audit', hint: 'KPIs & PHI Security', path: '/admin/dashboard', matches: ['/admin/dashboard', '/admin/analytics'] },
    { step: 2, title: 'Staff & Clinics', hint: 'Doctors & Provisioning', path: '/admin/manage' },
    { step: 3, title: 'Ward Beds', hint: 'Grid & Inpatients', path: '/beds', matches: ['/beds', '/beds/inpatients', '/admin/beds'] },
    { step: 4, title: 'Blood Bank', hint: 'Stock, Requests & Donors', path: '/bloodbank', matches: ['/bloodbank', '/bloodbank/stock', '/bloodbank/requests', '/bloodbank/donors'] },
    { step: 5, title: 'Billing Counter', hint: 'Invoices & Receipts', path: '/billing', matches: ['/billing', '/billing/new'] },
  ],
};

const WorkflowBar = () => {
  const { user } = useAuth();
  const location = useLocation();

  if (!user) return null;
  const steps = ROLE_WORKFLOWS[user.role];
  if (!steps || steps.length === 0) return null;

  const isStepActive = (item) => {
    if (item.prefixMatch && location.pathname.startsWith(item.prefixMatch)) return true;
    if (item.matches) return item.matches.includes(location.pathname);
    return location.pathname === item.path;
  };

  const activeIndex = steps.findIndex(isStepActive);
  const nextStep = activeIndex >= 0 && activeIndex < steps.length - 1 ? steps[activeIndex + 1] : null;

  return (
    <div className="bg-surface border-b border-hairline">
      <div className="max-w-[1360px] mx-auto px-4 sm:px-6 lg:px-8 py-2.5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2.5">
          {/* Guided Stepper Links */}
          <div className="flex items-center gap-1 overflow-x-auto pb-0.5 lg:pb-0">
            <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-muted mr-1 shrink-0 hidden sm:inline">
              Workflow:
            </span>
            {steps.map((item, idx) => {
              const active = isStepActive(item);
              const completed = activeIndex > idx;
              return (
                <React.Fragment key={item.path}>
                  <Link
                    to={item.path}
                    className={`group flex items-center gap-1.5 px-2 py-1 rounded-lg border text-left transition shrink-0 ${
                      active
                        ? 'bg-white border-cobalt/40 text-ink shadow-2xs'
                        : completed
                        ? 'bg-white/70 border-hairline text-ink hover:border-slate-300'
                        : 'bg-transparent border-transparent text-muted hover:bg-white hover:border-hairline hover:text-ink'
                    }`}
                  >
                    <span
                      className={`w-5 h-5 rounded-full font-mono text-[10px] font-bold flex items-center justify-center shrink-0 ${
                        active
                          ? 'bg-cobalt text-white'
                          : completed
                          ? 'bg-emerald-100 text-clinical-success'
                          : 'bg-slate-200/80 text-muted group-hover:bg-slate-300/70'
                      }`}
                    >
                      {completed ? '✓' : item.step}
                    </span>
                    <div className="leading-tight">
                      <span className={`block text-[11px] font-semibold whitespace-nowrap ${active ? 'text-cobalt' : ''}`}>
                        {item.title}
                      </span>
                      <span className="hidden 2xl:block text-[10px] text-muted whitespace-nowrap">
                        {item.hint}
                      </span>
                    </div>
                  </Link>
                  {idx < steps.length - 1 && (
                    <span className="text-slate-300 text-xs shrink-0 select-none">→</span>
                  )}
                </React.Fragment>
              );
            })}
          </div>

          {/* Contextual Next Step Prompt */}
          {nextStep && (
            <Link
              to={nextStep.path}
              className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cobalt-tint/80 hover:bg-cobalt-tint border border-cobalt/20 text-[11px] font-semibold text-cobalt transition shrink-0 whitespace-nowrap"
            >
              <span>Next: {nextStep.title}</span>
              <span>→</span>
            </Link>
          )}
        </div>
      </div>
    </div>
  );
};

export default WorkflowBar;
