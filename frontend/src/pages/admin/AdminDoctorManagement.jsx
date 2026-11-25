/**
 * src/pages/admin/AdminDoctorManagement.jsx
 * -----------------------------------------
 * Admin portal for managing Departments, Doctors, and Hospital Staff Roles
 * (Receptionists, Blood Bank Staff, Doctors, Admins) with strong password validation.
 */

import React, { useState, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import hospitalService from '../../services/hospitalService';

const AdminDoctorManagement = () => {
  const { user, isAuthenticated, loading: authLoading } = useAuth();

  const [activeTab, setActiveTab] = useState('doctors'); // 'doctors' | 'departments' | 'staff'

  // Data states
  const [doctors, setDoctors] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [staffList, setStaffList] = useState([]);
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

  // Load initial data
  const loadData = async () => {
    try {
      setLoading(true);
      const [deptData, docData, staffData] = await Promise.all([
        hospitalService.getDepartments(true),
        hospitalService.getDoctors(),
        hospitalService.getStaffList().catch(() => []),
      ]);
      setDepartments(deptData);
      setDoctors(docData);
      setStaffList(Array.isArray(staffData) ? staffData : staffData?.results || []);
    } catch (err) {
      console.error('Failed to load data', err);
      showAlert('error', 'Failed to fetch departments, doctors, or staff.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isAuthorizedAdmin) return;
    loadData();
  }, [isAuthorizedAdmin]);

  // Defensive Guard: Only Admin can access
  if (authLoading) {
    return <div className="p-8 text-center text-gray-500">Checking authorization...</div>;
  }
  if (!isAuthorizedAdmin) {
    return <Navigate to="/dashboard" replace />;
  }

  const showAlert = (type, message) => {
    setAlert({ type, message });
    setTimeout(() => setAlert({ type: '', message: '' }), 4000);
  };

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
        showAlert('success', `Department "${deptForm.name}" updated successfully.`);
      } else {
        await hospitalService.createDepartment(deptForm);
        showAlert('success', `Department "${deptForm.name}" created successfully.`);
      }
      setShowDeptModal(false);
      loadData();
    } catch (err) {
      console.error(err);
      showAlert('error', 'Failed to save department. Check if name is unique.');
    }
  };

  const handleDeleteDept = async (dept) => {
    if (!window.confirm(`Are you sure you want to delete department "${dept.name}"?`)) return;
    try {
      await hospitalService.deleteDepartment(dept.id);
      showAlert('success', `Department "${dept.name}" deleted.`);
      loadData();
    } catch (err) {
      console.error(err);
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
      first_name: doc.first_name,
      last_name: doc.last_name,
      email: doc.email,
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

  const handleSaveDoctor = async (e) => {
    e.preventDefault();
    try {
      if (editingDoctor) {
        await hospitalService.updateDoctor(editingDoctor.id, doctorForm);
        showAlert('success', `Dr. ${doctorForm.first_name} ${doctorForm.last_name} updated successfully.`);
      } else {
        await hospitalService.createDoctor(doctorForm);
        showAlert('success', `Dr. ${doctorForm.first_name} ${doctorForm.last_name} added to staff.`);
      }
      setShowDoctorModal(false);
      loadData();
    } catch (err) {
      console.error(err);
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
    } catch (err) {
      console.error(err);
      showAlert('error', 'Could not delete doctor.');
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center pb-6 border-b border-gray-200 mb-6 gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-gray-900 tracking-tight">
            Staff & Department Management
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Add, update, or remove hospital departments and doctor consultation schedules.
          </p>
        </div>

        {/* Action Button */}
        <div>
          {activeTab === 'doctors' ? (
            <button
              onClick={openAddDoctor}
              className="inline-flex items-center px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-medium text-sm shadow-md transition"
            >
              <span className="mr-2 text-base font-bold">+</span> Add New Doctor
            </button>
          ) : activeTab === 'departments' ? (
            <button
              onClick={openAddDept}
              className="inline-flex items-center px-4 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-medium text-sm shadow-md transition"
            >
              <span className="mr-2 text-base font-bold">+</span> Add Department
            </button>
          ) : (
            <button
              onClick={openAddStaff}
              className="inline-flex items-center px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-sm shadow-md transition"
            >
              <span className="mr-2 text-base font-bold">+</span> Provision Staff Role
            </button>
          )}
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

      {/* Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-gray-200 mb-6">
        <button
          onClick={() => setActiveTab('doctors')}
          className={`pb-3 px-4 text-sm font-bold border-b-2 transition ${
            activeTab === 'doctors'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          👨‍⚕️ Doctors Directory ({doctors.length})
        </button>
        <button
          onClick={() => setActiveTab('departments')}
          className={`pb-3 px-4 text-sm font-bold border-b-2 transition ${
            activeTab === 'departments'
              ? 'border-purple-600 text-purple-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          🏢 Departments ({departments.length})
        </button>
        <button
          onClick={() => setActiveTab('staff')}
          className={`pb-3 px-4 text-sm font-bold border-b-2 transition ${
            activeTab === 'staff'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          🛡️ Staff Provisioning ({staffList.filter((u) => u.role !== 'patient').length})
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center items-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      ) : activeTab === 'doctors' ? (
        /* ─── DOCTORS LIST ─── */
        <div>
          {doctors.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-2xl border border-gray-100">
              <span className="text-4xl block mb-2">👨‍⚕️</span>
              <p className="text-gray-500 text-sm">No doctors added yet.</p>
              <button
                onClick={openAddDoctor}
                className="mt-3 text-sm text-blue-600 font-semibold hover:underline"
              >
                Add your first doctor
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto bg-white rounded-2xl shadow-sm border border-gray-200">
              <table className="min-w-full divide-y divide-gray-200 text-left text-sm">
                <thead className="bg-gray-50 text-gray-600 uppercase text-xs font-semibold">
                  <tr>
                    <th className="px-6 py-3.5">Doctor</th>
                    <th className="px-6 py-3.5">Department</th>
                    <th className="px-6 py-3.5">Room & Time</th>
                    <th className="px-6 py-3.5">Consultation Fee</th>
                    <th className="px-6 py-3.5">Status</th>
                    <th className="px-6 py-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {doctors.map((doc) => (
                    <tr key={doc.id} className="hover:bg-gray-50/70 transition">
                      <td className="px-6 py-4">
                        <div className="font-bold text-gray-900">{doc.doctor_name}</div>
                        <div className="text-xs text-gray-500">
                          {doc.specialization} • {doc.qualification || 'MBBS'}
                        </div>
                        <div className="text-xs text-gray-400 mt-0.5">@{doc.username}</div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="inline-block px-2.5 py-1 text-xs font-semibold rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                          {doc.department_name}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="font-medium text-gray-800">📍 {doc.room_number || 'Room 101'}</div>
                        <div className="text-xs text-gray-500 mt-0.5">⏱️ {doc.avg_consult_minutes || 15} mins/patient</div>
                      </td>
                      <td className="px-6 py-4 font-semibold text-gray-800">
                        ₹{doc.consultation_fee}
                      </td>
                      <td className="px-6 py-4">
                        {doc.is_available ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-emerald-100 text-emerald-800">
                            Available
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800">
                            Off Duty
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right space-x-2">
                        <button
                          onClick={() => openEditDoctor(doc)}
                          className="px-2.5 py-1 text-xs font-semibold rounded-md bg-blue-50 text-blue-700 hover:bg-blue-100 transition"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDeleteDoctor(doc)}
                          className="px-2.5 py-1 text-xs font-semibold rounded-md bg-red-50 text-red-700 hover:bg-red-100 transition"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : activeTab === 'departments' ? (
        /* ─── DEPARTMENTS LIST ─── */
        <div>
          {departments.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-2xl border border-gray-100">
              <span className="text-4xl block mb-2">🏢</span>
              <p className="text-gray-500 text-sm">No departments created yet.</p>
              <button
                onClick={openAddDept}
                className="mt-3 text-sm text-purple-600 font-semibold hover:underline"
              >
                Create your first department
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {departments.map((dept) => (
                <div key={dept.id} className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm flex flex-col justify-between">
                  <div>
                    <div className="flex justify-between items-start">
                      <h3 className="text-lg font-bold text-gray-900">{dept.name}</h3>
                      <span
                        className={`text-xs px-2 py-0.5 rounded font-semibold ${
                          dept.is_active
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-gray-100 text-gray-600'
                        }`}
                      >
                        {dept.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                    <p className="text-sm text-gray-500 mt-2">
                      {dept.description || 'No description provided.'}
                    </p>
                    <div className="mt-4 text-xs font-medium text-purple-700 bg-purple-50 inline-block px-2.5 py-1 rounded-md">
                      👨‍⚕️ {dept.doctor_count || 0} Doctors assigned
                    </div>
                  </div>

                  <div className="mt-6 pt-4 border-t border-gray-100 flex justify-end space-x-2">
                    <button
                      onClick={() => openEditDept(dept)}
                      className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-800 transition"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDeleteDept(dept)}
                      className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-red-50 hover:bg-red-100 text-red-700 transition"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        /* ─── STAFF PROVISIONING TABLE (RECEPTION, BLOOD BANK, ADMIN, DOCTOR) ─── */
        <div className="overflow-x-auto bg-white rounded-2xl shadow-sm border border-gray-200">
          <table className="min-w-full divide-y divide-gray-200 text-left text-sm">
            <thead className="bg-gray-50 text-gray-600 uppercase text-xs font-semibold">
              <tr>
                <th className="px-6 py-3.5">Username</th>
                <th className="px-6 py-3.5">Full Name</th>
                <th className="px-6 py-3.5">Role</th>
                <th className="px-6 py-3.5">Email / Phone</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {staffList
                .filter((u) => u.role !== 'patient')
                .map((member) => (
                  <tr key={member.id} className="hover:bg-gray-50">
                    <td className="px-6 py-3.5 font-mono font-bold text-gray-900">@{member.username}</td>
                    <td className="px-6 py-3.5 text-gray-800">
                      {member.first_name || member.last_name
                        ? `${member.first_name} ${member.last_name}`.trim()
                        : member.username}
                    </td>
                    <td className="px-6 py-3.5">
                      <span className="px-2.5 py-0.5 rounded-full text-xs font-bold uppercase bg-indigo-50 text-indigo-700 border border-indigo-200">
                        {member.role?.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-6 py-3.5 text-xs text-gray-500">
                      {member.email || 'No email'} {member.phone ? `• ${member.phone}` : ''}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ─── MODAL: ADD / EDIT DEPARTMENT ─── */}
      {showDeptModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-gray-100">
            <h3 className="text-xl font-bold text-gray-900 mb-4">
              {editingDept ? 'Edit Department' : 'Add New Department'}
            </h3>
            <form onSubmit={handleSaveDept} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Department Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Cardiology, Neurology, Orthopedics"
                  value={deptForm.name}
                  onChange={(e) => setDeptForm({ ...deptForm, name: e.target.value })}
                  className="w-full px-3.5 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Description
                </label>
                <textarea
                  rows="3"
                  placeholder="Short description of department services..."
                  value={deptForm.description}
                  onChange={(e) => setDeptForm({ ...deptForm, description: e.target.value })}
                  className="w-full px-3.5 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:outline-none"
                />
              </div>

              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="dept_active"
                  checked={deptForm.is_active}
                  onChange={(e) => setDeptForm({ ...deptForm, is_active: e.target.checked })}
                  className="h-4 w-4 text-purple-600 rounded focus:ring-purple-500"
                />
                <label htmlFor="dept_active" className="text-sm font-medium text-gray-700">
                  Active (available for OPD booking)
                </label>
              </div>

              <div className="pt-4 flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setShowDeptModal(false)}
                  className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-sm font-semibold text-white bg-purple-600 hover:bg-purple-700 rounded-lg shadow-md transition"
                >
                  {editingDept ? 'Update Department' : 'Create Department'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── MODAL: ADD / EDIT DOCTOR ─── */}
      {showDoctorModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl border border-gray-100">
            <h3 className="text-xl font-bold text-gray-900 mb-4">
              {editingDoctor ? `Edit ${editingDoctor.doctor_name}` : 'Add New Doctor to Staff'}
            </h3>
            <form onSubmit={handleSaveDoctor} className="space-y-4">
              {/* Doctor Account Info (required for new doctors) */}
              {!editingDoctor && (
                <div className="p-3 bg-blue-50/70 rounded-xl border border-blue-100 space-y-3">
                  <p className="text-xs font-bold text-blue-900 uppercase">
                    Account Credentials (for Doctor Login)
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1">Username *</label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. drsharma"
                        value={doctorForm.username}
                        onChange={(e) => setDoctorForm({ ...doctorForm, username: e.target.value })}
                        className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1">Password *</label>
                      <input
                        type="password"
                        required
                        minLength={8}
                        placeholder="8+ chars (Upper, Lower, Digit)"
                        value={doctorForm.password}
                        onChange={(e) => setDoctorForm({ ...doctorForm, password: e.target.value })}
                        className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg bg-white"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Names */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">First Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Rajesh"
                    value={doctorForm.first_name}
                    onChange={(e) => setDoctorForm({ ...doctorForm, first_name: e.target.value })}
                    className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Last Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Sharma"
                    value={doctorForm.last_name}
                    onChange={(e) => setDoctorForm({ ...doctorForm, last_name: e.target.value })}
                    className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* Email & Phone */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Email</label>
                  <input
                    type="email"
                    placeholder="doctor@hospital.com"
                    value={doctorForm.email}
                    onChange={(e) => setDoctorForm({ ...doctorForm, email: e.target.value })}
                    className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Mobile</label>
                  <input
                    type="tel"
                    placeholder="10 digit number"
                    value={doctorForm.phone}
                    onChange={(e) => setDoctorForm({ ...doctorForm, phone: e.target.value })}
                    className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg"
                  />
                </div>
              </div>

              {/* Department & Specialization */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Department *</label>
                  <select
                    required
                    value={doctorForm.department}
                    onChange={(e) => setDoctorForm({ ...doctorForm, department: e.target.value })}
                    className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg bg-white"
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
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Specialization</label>
                  <input
                    type="text"
                    placeholder="e.g. Senior Cardiologist"
                    value={doctorForm.specialization}
                    onChange={(e) => setDoctorForm({ ...doctorForm, specialization: e.target.value })}
                    className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg"
                  />
                </div>
              </div>

              {/* Qualification & Experience */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Qualification</label>
                  <input
                    type="text"
                    placeholder="e.g. MBBS, MD (Cardiology)"
                    value={doctorForm.qualification}
                    onChange={(e) => setDoctorForm({ ...doctorForm, qualification: e.target.value })}
                    className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Experience (Years)</label>
                  <input
                    type="number"
                    min="0"
                    value={doctorForm.experience_years}
                    onChange={(e) => setDoctorForm({ ...doctorForm, experience_years: parseInt(e.target.value) || 0 })}
                    className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg"
                  />
                </div>
              </div>

              {/* Room Number, Avg Consult Time, Fee */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Room Number *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Room 102"
                    value={doctorForm.room_number}
                    onChange={(e) => setDoctorForm({ ...doctorForm, room_number: e.target.value })}
                    className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Avg Consult Time (Mins) *</label>
                  <input
                    type="number"
                    min="1"
                    required
                    placeholder="15"
                    value={doctorForm.avg_consult_minutes}
                    onChange={(e) => setDoctorForm({ ...doctorForm, avg_consult_minutes: parseInt(e.target.value) || 15 })}
                    className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Consultation Fee (₹)</label>
                  <input
                    type="number"
                    min="0"
                    placeholder="500"
                    value={doctorForm.consultation_fee}
                    onChange={(e) => setDoctorForm({ ...doctorForm, consultation_fee: parseFloat(e.target.value) || 0 })}
                    className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg"
                  />
                </div>
              </div>

              {/* Availability */}
              <div className="flex items-center space-x-2 pt-1">
                <input
                  type="checkbox"
                  id="doc_available"
                  checked={doctorForm.is_available}
                  onChange={(e) => setDoctorForm({ ...doctorForm, is_available: e.target.checked })}
                  className="h-4 w-4 text-blue-600 rounded"
                />
                <label htmlFor="doc_available" className="text-sm font-medium text-gray-700">
                  Currently on duty / available for consultation
                </label>
              </div>

              <div className="pt-4 flex justify-end space-x-3 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setShowDoctorModal(false)}
                  className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-md transition"
                >
                  {editingDoctor ? 'Update Doctor' : 'Save Doctor'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── MODAL: PROVISION STAFF ACCOUNT (RECEPTION / BLOOD BANK / ADMIN) ─── */}
      {showStaffModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-gray-100">
            <h3 className="text-xl font-bold text-gray-900 mb-1">Provision Staff Account</h3>
            <p className="text-xs text-gray-500 mb-4">
              Self-registration is restricted to patients. Staff logins are created strictly by Admins with strong passwords.
            </p>
            <form onSubmit={handleCreateStaff} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Hospital Role *</label>
                <select
                  value={staffForm.role}
                  onChange={(e) => setStaffForm({ ...staffForm, role: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white"
                >
                  <option value="reception">Front Desk / Receptionist</option>
                  <option value="bloodbank_staff">Blood Bank Staff</option>
                  <option value="admin">Hospital Administrator</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">First Name *</label>
                  <input
                    type="text"
                    required
                    value={staffForm.first_name}
                    onChange={(e) => setStaffForm({ ...staffForm, first_name: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Last Name *</label>
                  <input
                    type="text"
                    required
                    value={staffForm.last_name}
                    onChange={(e) => setStaffForm({ ...staffForm, last_name: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Username *</label>
                <input
                  type="text"
                  required
                  value={staffForm.username}
                  onChange={(e) => setStaffForm({ ...staffForm, username: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Email *</label>
                  <input
                    type="email"
                    required
                    value={staffForm.email}
                    onChange={(e) => setStaffForm({ ...staffForm, email: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Phone</label>
                  <input
                    type="tel"
                    value={staffForm.phone}
                    onChange={(e) => setStaffForm({ ...staffForm, phone: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Strong Password *</label>
                <input
                  type="password"
                  required
                  minLength={8}
                  placeholder="Min 8 chars, upper, lower, digit"
                  value={staffForm.password}
                  onChange={(e) => setStaffForm({ ...staffForm, password: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg"
                />
              </div>
              <div className="pt-3 flex justify-end gap-2 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setShowStaffModal(false)}
                  className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={staffSaving}
                  className="px-5 py-2 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-md transition disabled:opacity-50"
                >
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
