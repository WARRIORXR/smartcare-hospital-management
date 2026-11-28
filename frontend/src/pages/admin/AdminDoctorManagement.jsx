/**
 * src/pages/admin/AdminDoctorManagement.jsx
 * -----------------------------------------
 * Admin Governance Directory for Doctors, Outpatient Clinics (Departments),
 * and Non-Doctor RBAC Accounts — aligned with Paper Screen 23.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import hospitalService from '../../services/hospitalService';

const ROLE_BADGE_CLASSES = {
  reception: 'bg-cobalt-tint text-cobalt',
  bloodbank_staff: 'bg-rose-50 text-clinical-danger',
  admin: 'bg-ink text-white',
  doctor: 'bg-emerald-50 text-clinical-success',
};

const AdminDoctorManagement = () => {
  const { user, isAuthenticated, loading: authLoading } = useAuth();

  const [activeTab, setActiveTab] = useState('doctors'); // 'doctors' | 'departments' | 'staff'
  const [searchQuery, setSearchQuery] = useState('');

  // Data states
  const [doctors, setDoctors] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [staffList, setStaffList] = useState([]);
  const [leaves, setLeaves] = useState([]);
  const [loading, setLoading] = useState(true);
  const [alert, setAlert] = useState({ type: '', message: '' });

  // Modal states
  const [showDeptModal, setShowDeptModal] = useState(false);
  const [editingDept, setEditingDept] = useState(null);
  const [deptForm, setDeptForm] = useState({ name: '', description: '', is_active: true });

  const [showStaffModal, setShowStaffModal] = useState(false);
  const [staffSaving, setStaffSaving] = useState(false);
  const [staffForm, setStaffForm] = useState({
    username: '',
    password: '',
    email: '',
    first_name: '',
    last_name: '',
    phone: '',
    role: 'reception',
  });

  const [showDoctorModal, setShowDoctorModal] = useState(false);
  const [editingDoctor, setEditingDoctor] = useState(null);
  const [doctorForm, setDoctorForm] = useState({
    username: '',
    password: '',
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    department: '',
    specialization: '',
    qualification: '',
    experience_years: 0,
    consultation_fee: 500,
    room_number: 'Room 101',
    avg_consult_minutes: 15,
    available_days: 'Mon,Tue,Wed,Thu,Fri',
    is_available: true,
  });

  const isAuthorizedAdmin = Boolean(isAuthenticated && user && (user.role === 'admin' || user.is_staff));

  const showAlert = (type, message) => {
    setAlert({ type, message });
    setTimeout(() => setAlert({ type: '', message: '' }), 4000);
  };

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [deptData, docData, staffData, leavesData] = await Promise.all([
        hospitalService.getDepartments(true),
        hospitalService.getDoctors(),
        hospitalService.getStaffList().catch(() => []),
        hospitalService.getLeaves().catch(() => []),
      ]);
      setDepartments(Array.isArray(deptData) ? deptData : deptData?.results || []);
      setDoctors(Array.isArray(docData) ? docData : docData?.results || []);
      setStaffList(Array.isArray(staffData) ? staffData : staffData?.results || []);
      setLeaves(Array.isArray(leavesData) ? leavesData : leavesData?.results || []);
    } catch (err) {
      console.error('Failed to load directory data', err);
      showAlert('error', 'Failed to fetch departments, doctors, or staff.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isAuthorizedAdmin) return;
    loadData();
  }, [isAuthorizedAdmin, loadData]);

  if (authLoading) {
    return <div className="p-8 text-center text-muted text-sm">Checking authorization...</div>;
  }
  if (!isAuthorizedAdmin) {
    return <Navigate to="/dashboard" replace />;
  }

  // ─── DEPARTMENT HANDLERS ───
  const openAddDept = () => {
    setEditingDept(null);
    setDeptForm({ name: '', description: '', is_active: true });
    setShowDeptModal(true);
  };

  const openEditDept = (dept) => {
    setEditingDept(dept);
    setDeptForm({
      name: dept.name,
      description: dept.description || '',
      is_active: dept.is_active,
    });
    setShowDeptModal(true);
  };

  const handleSaveDept = async (e) => {
    e.preventDefault();
    try {
      if (editingDept) {
        await hospitalService.updateDepartment(editingDept.id, deptForm);
        showAlert('success', `Department "${deptForm.name}" updated cleanly.`);
      } else {
        await hospitalService.createDepartment(deptForm);
        showAlert('success', `Department "${deptForm.name}" created cleanly.`);
      }
      setShowDeptModal(false);
      loadData();
    } catch {
      showAlert('error', 'Failed to save department. Check if name is unique.');
    }
  };

  const handleDeleteDept = async (dept) => {
    if (!window.confirm(`Delete department "${dept.name}"?`)) return;
    try {
      await hospitalService.deleteDepartment(dept.id);
      showAlert('success', `Department "${dept.name}" removed.`);
      loadData();
    } catch {
      showAlert('error', 'Could not delete department.');
    }
  };

  // ─── DOCTOR HANDLERS ───
  const openAddDoctor = () => {
    setEditingDoctor(null);
    setDoctorForm({
      username: '',
      password: '',
      first_name: '',
      last_name: '',
      email: '',
      phone: '',
      department: departments.length > 0 ? departments[0].id : '',
      specialization: '',
      qualification: 'MBBS, MD',
      experience_years: 3,
      consultation_fee: 500,
      room_number: 'Room 101',
      avg_consult_minutes: 15,
      available_days: 'Mon,Tue,Wed,Thu,Fri',
      is_available: true,
    });
    setShowDoctorModal(true);
  };

  const openEditDoctor = (doc) => {
    setEditingDoctor(doc);
    setDoctorForm({
      username: doc.username,
      password: '',
      first_name: doc.first_name || '',
      last_name: doc.last_name || '',
      email: doc.email || '',
      phone: doc.phone || '',
      department: doc.department || '',
      specialization: doc.specialization || '',
      qualification: doc.qualification || '',
      experience_years: doc.experience_years || 0,
      consultation_fee: doc.consultation_fee || 500,
      room_number: doc.room_number || 'Room 101',
      avg_consult_minutes: doc.avg_consult_minutes || 15,
      available_days: doc.available_days || 'Mon,Tue,Wed,Thu,Fri',
      is_available: doc.is_available,
    });
    setShowDoctorModal(true);
  };

  const handleSaveDoctor = async (e) => {
    e.preventDefault();
    try {
      if (editingDoctor) {
        const payload = { ...doctorForm };
        if (!payload.password) delete payload.password;
        await hospitalService.updateDoctor(editingDoctor.id, payload);
        showAlert('success', `Dr. ${doctorForm.first_name} ${doctorForm.last_name} updated cleanly.`);
      } else {
        await hospitalService.createDoctor(doctorForm);
        showAlert('success', `Dr. ${doctorForm.first_name} ${doctorForm.last_name} added to roster.`);
      }
      setShowDoctorModal(false);
      loadData();
    } catch (err) {
      const data = err?.response?.data;
      const msg =
        data?.password?.[0] ||
        data?.non_field_errors?.[0] ||
        data?.detail ||
        'Failed to save doctor. Verify unique username and strong password.';
      showAlert('error', msg);
    }
  };

  const handleDeleteDoctor = async (doc) => {
    if (!window.confirm(`Delete ${doc.doctor_name}? This also removes their login credentials.`)) return;
    try {
      await hospitalService.deleteDoctor(doc.id);
      showAlert('success', `${doc.doctor_name} deleted.`);
      loadData();
    } catch {
      showAlert('error', 'Could not delete doctor.');
    }
  };

  // ─── STAFF HANDLERS ───
  const openAddStaff = () => {
    setStaffForm({
      username: '',
      password: '',
      email: '',
      first_name: '',
      last_name: '',
      phone: '',
      role: 'reception',
    });
    setShowStaffModal(true);
  };

  const handleCreateStaff = async (e) => {
    e.preventDefault();
    try {
      setStaffSaving(true);
      await hospitalService.createStaffAccount(staffForm);
      showAlert('success', `Staff account @${staffForm.username} (${staffForm.role}) provisioned cleanly.`);
      setShowStaffModal(false);
      await loadData();
    } catch (err) {
      const data = err?.response?.data;
      const msg =
        data?.password?.[0] ||
        data?.non_field_errors?.[0] ||
        data?.email?.[0] ||
        data?.username?.[0] ||
        data?.detail ||
        'Could not create staff account. Ensure password is strong (8+ chars, upper/lower/number).';
      showAlert('error', msg);
    } finally {
      setStaffSaving(false);
    }
  };

  // Derived analytics & search filtering
  const availableDoctorsCount = doctors.filter((d) => d.is_available).length;
  const activeDeptsCount = departments.filter((d) => d.is_active).length;
  const staffAccounts = staffList.filter((u) => u.role !== 'patient');
  const nonDoctorStaff = staffAccounts.filter((u) => u.role !== 'doctor');

  const q = searchQuery.trim().toLowerCase();
  const filteredDoctors = !q
    ? doctors
    : doctors.filter(
        (d) =>
          (d.doctor_name || '').toLowerCase().includes(q) ||
          (d.username || '').toLowerCase().includes(q) ||
          (d.department_name || '').toLowerCase().includes(q) ||
          (d.room_number || '').toLowerCase().includes(q) ||
          (d.specialization || '').toLowerCase().includes(q)
      );

  const filteredDepartments = !q
    ? departments
    : departments.filter(
        (d) =>
          (d.name || '').toLowerCase().includes(q) ||
          (d.description || '').toLowerCase().includes(q)
      );

  const filteredStaff = !q
    ? staffAccounts
    : staffAccounts.filter(
        (u) =>
          (u.username || '').toLowerCase().includes(q) ||
          (u.full_name || '').toLowerCase().includes(q) ||
          (u.role || '').toLowerCase().includes(q)
      );

  return (
    <div className="max-w-[1360px] mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-5">
      {/* Header Strip */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center pb-5 border-b border-hairline gap-4">
        <div className="space-y-1">
          <span className="editorial-eyebrow">Hospital Directory · Clinical Governance</span>
          <h1 className="font-display text-2xl sm:text-3xl font-extrabold tracking-tight text-ink">
            Staff, Doctors &amp; Department Clinics
          </h1>
          <p className="text-xs sm:text-sm text-muted">
            Provision medical specialists, manage outpatient clinics, and audit front-desk &amp; blood bank RBAC roles.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <button type="button" onClick={openAddDept} className="editorial-btn-secondary">
            + Add Department
          </button>
          <button
            type="button"
            onClick={activeTab === 'staff' ? openAddStaff : openAddDoctor}
            className="editorial-btn-primary"
          >
            {activeTab === 'staff' ? '+ Provision Staff Role' : '+ Provision Doctor / Staff'}
          </button>
        </div>
      </div>

      {/* Alert Banner */}
      {alert.message && (
        <div
          className={`p-3.5 rounded-xl text-xs font-semibold border flex items-center justify-between ${
            alert.type === 'success'
              ? 'bg-emerald-50 text-clinical-success border-emerald-200'
              : 'bg-rose-50 text-clinical-danger border-rose-200'
          }`}
        >
          <span>{alert.message}</span>
          <button
            type="button"
            onClick={() => setAlert({ type: '', message: '' })}
            className="font-bold text-muted hover:text-ink cursor-pointer"
          >
            ×
          </button>
        </div>
      )}

      {/* 4-Card Governance KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="editorial-card px-4 py-3.5 flex items-center justify-between">
          <span className="text-xs font-medium text-muted">On-Duty Specialists</span>
          <span className="font-mono text-sm font-bold text-cobalt">
            {availableDoctorsCount} / {doctors.length} Active
          </span>
        </div>
        <div className="rounded-xl px-4 py-3.5 flex items-center justify-between bg-emerald-50 border border-emerald-200">
          <span className="text-xs font-semibold text-clinical-success">Outpatient Clinics</span>
          <span className="font-mono text-sm font-bold text-clinical-success">
            {activeDeptsCount} Depts Live
          </span>
        </div>
        <div className="editorial-card px-4 py-3.5 flex items-center justify-between">
          <span className="text-xs font-medium text-muted">Support Staff Accounts</span>
          <span className="font-mono text-sm font-bold text-ink">
            {nonDoctorStaff.length} Provisioned
          </span>
        </div>
        <div className="rounded-xl px-4 py-3.5 flex items-center justify-between bg-amber-50 border border-amber-200">
          <span className="text-xs font-semibold text-clinical-warning">Upcoming CME Leaves</span>
          <span className="font-mono text-sm font-bold text-clinical-warning">
            {leaves.length} Scheduled
          </span>
        </div>
      </div>

      {/* Main 2-Column Split Workspace */}
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-6 items-start">
        {/* Left Directory Card */}
        <div className="bg-canvas rounded-2xl border border-hairline overflow-hidden">
          <div className="p-4 sm:px-5 border-b border-hairline flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => setActiveTab('doctors')}
                className={`px-3.5 py-1.5 rounded-lg text-xs transition cursor-pointer ${
                  activeTab === 'doctors'
                    ? 'bg-cobalt-tint text-cobalt font-bold'
                    : 'text-muted hover:text-ink font-medium'
                }`}
              >
                Doctors Directory ({doctors.length})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('departments')}
                className={`px-3.5 py-1.5 rounded-lg text-xs transition cursor-pointer ${
                  activeTab === 'departments'
                    ? 'bg-cobalt-tint text-cobalt font-bold'
                    : 'text-muted hover:text-ink font-medium'
                }`}
              >
                Departments ({departments.length})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('staff')}
                className={`px-3.5 py-1.5 rounded-lg text-xs transition cursor-pointer ${
                  activeTab === 'staff'
                    ? 'bg-cobalt-tint text-cobalt font-bold'
                    : 'text-muted hover:text-ink font-medium'
                }`}
              >
                Staff Accounts ({staffAccounts.length})
              </button>
            </div>

            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search doctor, room, dept..."
              className="editorial-input py-1.5 px-3 text-xs sm:w-60 bg-surface"
            />
          </div>

          {loading ? (
            <div className="flex justify-center items-center py-16">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cobalt" />
            </div>
          ) : activeTab === 'doctors' ? (
            filteredDoctors.length === 0 ? (
              <div className="text-center py-14 px-6">
                <p className="text-sm font-medium text-muted">No specialists match your current filter.</p>
                <button type="button" onClick={openAddDoctor} className="mt-3 editorial-btn-primary">
                  + Add Specialist Doctor
                </button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-hairline text-left text-sm">
                  <thead className="bg-surface text-muted font-mono uppercase text-[10px] tracking-wider font-bold">
                    <tr>
                      <th className="px-5 py-3">Specialist &amp; Room</th>
                      <th className="px-4 py-3">Department</th>
                      <th className="px-4 py-3">Qualification</th>
                      <th className="px-4 py-3">Fee / Wait</th>
                      <th className="px-4 py-3">Roster</th>
                      <th className="px-5 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-hairline">
                    {filteredDoctors.map((doc) => {
                      const hasLeave = Array.isArray(doc.upcoming_leaves) && doc.upcoming_leaves.length > 0;
                      return (
                        <tr key={doc.id} className="hover:bg-surface/60 transition">
                          <td className="px-5 py-3.5 whitespace-nowrap">
                            <div className="font-display text-[13px] font-bold text-ink">{doc.doctor_name}</div>
                            <div className="font-mono text-[11px] text-muted mt-0.5">
                              @{doc.username} · {doc.room_number || 'Room 101'}
                            </div>
                          </td>
                          <td className="px-4 py-3.5 whitespace-nowrap">
                            <span className="inline-flex px-2.5 py-1 text-[11px] font-semibold rounded-full bg-cobalt-tint text-cobalt">
                              {doc.department_name || 'General'}
                            </span>
                          </td>
                          <td className="px-4 py-3.5">
                            <div className="text-xs font-medium text-ink">{doc.qualification || 'MBBS, MD'}</div>
                            <div className="text-[11px] text-muted mt-0.5">
                              {doc.experience_years || 0} yrs exp{doc.specialization ? ` · ${doc.specialization}` : ''}
                            </div>
                          </td>
                          <td className="px-4 py-3.5 whitespace-nowrap">
                            <div className="font-mono text-xs font-bold text-ink">₹{doc.consultation_fee}</div>
                            <div className="font-mono text-[10px] text-muted mt-0.5">
                              {doc.avg_consult_minutes || 15}m avg
                            </div>
                          </td>
                          <td className="px-4 py-3.5 whitespace-nowrap">
                            {hasLeave ? (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-50 text-clinical-warning">
                                <span className="w-1.5 h-1.5 rounded-full bg-clinical-warning" />
                                CME Leave
                              </span>
                            ) : doc.is_available ? (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-50 text-clinical-success">
                                <span className="w-1.5 h-1.5 rounded-full bg-clinical-success" />
                                On Duty
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-surface text-muted border border-hairline">
                                <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                                Off Duty
                              </span>
                            )}
                          </td>
                          <td className="px-5 py-3.5 text-right whitespace-nowrap">
                            <div className="inline-flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => openEditDoctor(doc)}
                                className="px-2.5 py-1 text-[11px] font-semibold rounded-md border border-hairline bg-canvas text-ink hover:bg-surface transition cursor-pointer whitespace-nowrap"
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteDoctor(doc)}
                                className="px-2.5 py-1 text-[11px] font-semibold rounded-md border border-rose-200 bg-rose-50 text-clinical-danger hover:bg-rose-100 transition cursor-pointer whitespace-nowrap"
                              >
                                Delete
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )
          ) : activeTab === 'departments' ? (
            <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredDepartments.map((dept) => (
                <div key={dept.id} className="p-4 rounded-xl border border-hairline bg-canvas flex flex-col justify-between gap-4">
                  <div className="space-y-2">
                    <div className="flex justify-between items-start gap-2">
                      <h3 className="font-display text-sm font-bold text-ink">{dept.name}</h3>
                      <span
                        className={`font-mono text-[10px] px-2 py-0.5 rounded font-bold uppercase ${
                          dept.is_active ? 'bg-emerald-50 text-clinical-success' : 'bg-surface text-muted'
                        }`}
                      >
                        {dept.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                    <p className="text-xs text-muted">{dept.description || 'Outpatient clinical specialty wing.'}</p>
                  </div>
                  <div className="pt-3 border-t border-hairline flex items-center justify-between">
                    <span className="font-mono text-[11px] font-bold text-cobalt bg-cobalt-tint px-2 py-0.5 rounded">
                      {dept.doctor_count || 0} DOC
                    </span>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => openEditDept(dept)}
                        className="px-2.5 py-1 text-[11px] font-semibold rounded-md border border-hairline bg-surface text-ink hover:bg-canvas transition cursor-pointer"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteDept(dept)}
                        className="px-2.5 py-1 text-[11px] font-semibold rounded-md bg-rose-50 text-clinical-danger hover:bg-rose-100 transition cursor-pointer"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-hairline text-left text-sm">
                <thead className="bg-surface text-muted font-mono uppercase text-[10px] tracking-wider font-bold">
                  <tr>
                    <th className="px-5 py-3">Username</th>
                    <th className="px-4 py-3">Full Name</th>
                    <th className="px-4 py-3">Role</th>
                    <th className="px-5 py-3">Contact</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-hairline">
                  {filteredStaff.map((member) => (
                    <tr key={member.id} className="hover:bg-surface/60 transition">
                      <td className="px-5 py-3.5 font-mono text-xs font-bold text-ink">@{member.username}</td>
                      <td className="px-4 py-3.5 text-xs font-semibold text-ink">
                        {member.first_name || member.last_name
                          ? `${member.first_name} ${member.last_name}`.trim()
                          : member.username}
                      </td>
                      <td className="px-4 py-3.5">
                        <span
                          className={`font-mono px-2.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                            ROLE_BADGE_CLASSES[member.role] || 'bg-surface text-ink'
                          }`}
                        >
                          {member.role?.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-xs text-muted">
                        {member.email || 'No email'} {member.phone ? `· ${member.phone}` : ''}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Right Clinics & RBAC Sidebar */}
        <aside className="space-y-4">
          <div className="bg-canvas rounded-2xl border border-hairline p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-sm font-bold text-ink">
                Outpatient Clinics ({departments.length})
              </h2>
              <span className="font-mono text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-50 text-clinical-success uppercase">
                All Active
              </span>
            </div>

            <div className="space-y-2">
              {departments.slice(0, 6).map((dept, idx) => (
                <button
                  key={dept.id}
                  type="button"
                  onClick={() => openEditDept(dept)}
                  className={`w-full text-left flex items-center justify-between gap-2 p-2.5 rounded-xl border border-hairline transition cursor-pointer hover:border-cobalt/40 ${
                    idx === 0 ? 'bg-surface' : 'bg-canvas'
                  }`}
                >
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-ink truncate">{dept.name}</div>
                    <div className="text-[11px] text-muted truncate">
                      {dept.description || 'Specialist OPD Clinic'}
                    </div>
                  </div>
                  <span className="font-mono text-[10px] font-bold px-2 py-1 rounded-md bg-cobalt-tint text-cobalt shrink-0">
                    {dept.doctor_count || 0} DOC
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="bg-surface rounded-2xl border border-hairline p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-sm font-bold text-ink">Non-Doctor RBAC Accounts</h2>
              <button
                type="button"
                onClick={openAddStaff}
                className="text-xs font-bold text-cobalt hover:underline cursor-pointer"
              >
                + Provision
              </button>
            </div>

            <div className="space-y-2">
              {nonDoctorStaff.length === 0 ? (
                <p className="text-xs text-muted">No support staff accounts found.</p>
              ) : (
                nonDoctorStaff.slice(0, 5).map((member) => (
                  <div
                    key={member.id}
                    className="flex items-center justify-between gap-2 p-2.5 rounded-xl border border-hairline bg-canvas"
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-ink truncate">
                        {member.full_name || member.username}
                      </div>
                      <div className="font-mono text-[11px] text-muted truncate">@{member.username}</div>
                    </div>
                    <span
                      className={`font-mono text-[10px] font-bold px-2 py-1 rounded-md uppercase shrink-0 ${
                        ROLE_BADGE_CLASSES[member.role] || 'bg-cobalt-tint text-cobalt'
                      }`}
                    >
                      {member.role === 'bloodbank_staff' ? 'Blood Bank' : member.role}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </aside>
      </div>

      {/* ─── MODAL: ADD / EDIT DEPARTMENT ─── */}
      {showDeptModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-ink/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-canvas rounded-2xl max-w-md w-full p-6 shadow-xl border border-hairline space-y-4">
            <h3 className="font-display text-lg font-bold text-ink">
              {editingDept ? 'Edit Clinical Department' : 'Add Outpatient Department'}
            </h3>
            <form onSubmit={handleSaveDept} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-ink mb-1">Department Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Cardiology, Neurology, Orthopedics"
                  value={deptForm.name}
                  onChange={(e) => setDeptForm({ ...deptForm, name: e.target.value })}
                  className="editorial-input"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-ink mb-1">Clinic Scope / Description</label>
                <textarea
                  rows="3"
                  placeholder="Short summary of services & OPD room locations..."
                  value={deptForm.description}
                  onChange={(e) => setDeptForm({ ...deptForm, description: e.target.value })}
                  className="editorial-input"
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="dept_active"
                  checked={deptForm.is_active}
                  onChange={(e) => setDeptForm({ ...deptForm, is_active: e.target.checked })}
                  className="h-4 w-4 text-cobalt rounded"
                />
                <label htmlFor="dept_active" className="text-xs font-medium text-ink">
                  Active (available for OPD appointment booking)
                </label>
              </div>

              <div className="pt-3 border-t border-hairline flex justify-end gap-2">
                <button type="button" onClick={() => setShowDeptModal(false)} className="editorial-btn-secondary">
                  Cancel
                </button>
                <button type="submit" className="editorial-btn-primary">
                  {editingDept ? 'Update Department' : 'Create Department'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── MODAL: ADD / EDIT DOCTOR ─── */}
      {showDoctorModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-ink/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-canvas rounded-2xl max-w-2xl w-full p-6 shadow-xl border border-hairline space-y-4">
            <h3 className="font-display text-lg font-bold text-ink">
              {editingDoctor ? `Edit ${editingDoctor.doctor_name}` : 'Provision Specialist Doctor'}
            </h3>
            <form onSubmit={handleSaveDoctor} className="space-y-4">
              {!editingDoctor && (
                <div className="p-3.5 bg-cobalt-tint/60 rounded-xl border border-cobalt/20 space-y-3">
                  <p className="font-mono text-[10px] font-bold text-cobalt uppercase tracking-wider">
                    Doctor Login Credentials
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-ink mb-1">Username *</label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. dr.mehta"
                        value={doctorForm.username}
                        onChange={(e) => setDoctorForm({ ...doctorForm, username: e.target.value })}
                        className="editorial-input py-1.5"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-ink mb-1">Password *</label>
                      <input
                        type="password"
                        required
                        minLength={8}
                        placeholder="8+ chars (Upper, Lower, Digit)"
                        value={doctorForm.password}
                        onChange={(e) => setDoctorForm({ ...doctorForm, password: e.target.value })}
                        className="editorial-input py-1.5"
                      />
                    </div>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-ink mb-1">First Name *</label>
                  <input
                    type="text"
                    required
                    value={doctorForm.first_name}
                    onChange={(e) => setDoctorForm({ ...doctorForm, first_name: e.target.value })}
                    className="editorial-input py-1.5"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-ink mb-1">Last Name *</label>
                  <input
                    type="text"
                    required
                    value={doctorForm.last_name}
                    onChange={(e) => setDoctorForm({ ...doctorForm, last_name: e.target.value })}
                    className="editorial-input py-1.5"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-ink mb-1">Email</label>
                  <input
                    type="email"
                    value={doctorForm.email}
                    onChange={(e) => setDoctorForm({ ...doctorForm, email: e.target.value })}
                    className="editorial-input py-1.5"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-ink mb-1">Phone</label>
                  <input
                    type="tel"
                    value={doctorForm.phone}
                    onChange={(e) => setDoctorForm({ ...doctorForm, phone: e.target.value })}
                    className="editorial-input py-1.5"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-ink mb-1">Department *</label>
                  <select
                    required
                    value={doctorForm.department}
                    onChange={(e) => setDoctorForm({ ...doctorForm, department: e.target.value })}
                    className="editorial-input"
                  >
                    <option value="">Select Department</option>
                    {departments.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-ink mb-1">Specialization</label>
                  <input
                    type="text"
                    value={doctorForm.specialization}
                    onChange={(e) => setDoctorForm({ ...doctorForm, specialization: e.target.value })}
                    className="editorial-input py-1.5"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-ink mb-1">Qualification</label>
                  <input
                    type="text"
                    value={doctorForm.qualification}
                    onChange={(e) => setDoctorForm({ ...doctorForm, qualification: e.target.value })}
                    className="editorial-input py-1.5"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-ink mb-1">Experience (Years)</label>
                  <input
                    type="number"
                    min="0"
                    value={doctorForm.experience_years}
                    onChange={(e) =>
                      setDoctorForm({ ...doctorForm, experience_years: parseInt(e.target.value, 10) || 0 })
                    }
                    className="editorial-input py-1.5 font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-ink mb-1">Room Number *</label>
                  <input
                    type="text"
                    required
                    value={doctorForm.room_number}
                    onChange={(e) => setDoctorForm({ ...doctorForm, room_number: e.target.value })}
                    className="editorial-input py-1.5 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-ink mb-1">Avg Consult (Mins) *</label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={doctorForm.avg_consult_minutes}
                    onChange={(e) =>
                      setDoctorForm({ ...doctorForm, avg_consult_minutes: parseInt(e.target.value, 10) || 15 })
                    }
                    className="editorial-input py-1.5 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-ink mb-1">Consult Fee (₹)</label>
                  <input
                    type="number"
                    min="0"
                    value={doctorForm.consultation_fee}
                    onChange={(e) =>
                      setDoctorForm({ ...doctorForm, consultation_fee: parseFloat(e.target.value) || 0 })
                    }
                    className="editorial-input py-1.5 font-mono"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="doc_available"
                  checked={doctorForm.is_available}
                  onChange={(e) => setDoctorForm({ ...doctorForm, is_available: e.target.checked })}
                  className="h-4 w-4 text-cobalt rounded"
                />
                <label htmlFor="doc_available" className="text-xs font-medium text-ink">
                  Currently on duty / available for consultation
                </label>
              </div>

              <div className="pt-4 border-t border-hairline flex justify-end gap-2">
                <button type="button" onClick={() => setShowDoctorModal(false)} className="editorial-btn-secondary">
                  Cancel
                </button>
                <button type="submit" className="editorial-btn-primary">
                  {editingDoctor ? 'Update Doctor' : 'Save Doctor'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── MODAL: PROVISION STAFF ACCOUNT ─── */}
      {showStaffModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-ink/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-canvas rounded-2xl max-w-md w-full p-6 shadow-xl border border-hairline space-y-4">
            <div>
              <h3 className="font-display text-lg font-bold text-ink">Provision Staff Role</h3>
              <p className="text-xs text-muted mt-1">
                Self-registration is restricted to patients. Staff accounts are provisioned strictly by Administrators.
              </p>
            </div>
            <form onSubmit={handleCreateStaff} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-ink mb-1">Hospital Role *</label>
                <select
                  value={staffForm.role}
                  onChange={(e) => setStaffForm({ ...staffForm, role: e.target.value })}
                  className="editorial-input"
                >
                  <option value="reception">Front Desk / Receptionist</option>
                  <option value="bloodbank_staff">Blood Bank Officer</option>
                  <option value="admin">Hospital Administrator</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-ink mb-1">First Name *</label>
                  <input
                    type="text"
                    required
                    value={staffForm.first_name}
                    onChange={(e) => setStaffForm({ ...staffForm, first_name: e.target.value })}
                    className="editorial-input py-1.5"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-ink mb-1">Last Name *</label>
                  <input
                    type="text"
                    required
                    value={staffForm.last_name}
                    onChange={(e) => setStaffForm({ ...staffForm, last_name: e.target.value })}
                    className="editorial-input py-1.5"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-ink mb-1">Username *</label>
                <input
                  type="text"
                  required
                  value={staffForm.username}
                  onChange={(e) => setStaffForm({ ...staffForm, username: e.target.value })}
                  className="editorial-input py-1.5 font-mono"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-ink mb-1">Email *</label>
                  <input
                    type="email"
                    required
                    value={staffForm.email}
                    onChange={(e) => setStaffForm({ ...staffForm, email: e.target.value })}
                    className="editorial-input py-1.5"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-ink mb-1">Phone</label>
                  <input
                    type="tel"
                    value={staffForm.phone}
                    onChange={(e) => setStaffForm({ ...staffForm, phone: e.target.value })}
                    className="editorial-input py-1.5"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-ink mb-1">Strong Password *</label>
                <input
                  type="password"
                  required
                  minLength={8}
                  placeholder="Min 8 chars, upper, lower, digit"
                  value={staffForm.password}
                  onChange={(e) => setStaffForm({ ...staffForm, password: e.target.value })}
                  className="editorial-input py-1.5"
                />
              </div>
              <div className="pt-3 border-t border-hairline flex justify-end gap-2">
                <button type="button" onClick={() => setShowStaffModal(false)} className="editorial-btn-secondary">
                  Cancel
                </button>
                <button type="submit" disabled={staffSaving} className="editorial-btn-primary">
                  {staffSaving ? 'Creating...' : 'Create Staff Account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminDoctorManagement;
