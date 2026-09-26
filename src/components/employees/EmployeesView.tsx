import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Briefcase,
  CheckCircle2,
  Clock,
  Download,
  Edit2,
  FileSpreadsheet,
  Mail,
  Phone,
  Plus,
  Search,
  Trash2,
  UploadCloud,
  UserCheck,
  UserPlus,
  Users,
  UserX,
  X,
} from 'lucide-react';
import { Employee, EmployeeType, SystemSettings, User } from '../../types';
import { storageService } from '../../services/storageService';
import { ExportService } from '../../services/exportService';
import { StaffImportModal } from './StaffImportModal';
import { hasPermission } from '../../utils/permissions';

interface EmployeesViewProps {
  employees: Employee[];
  settings: SystemSettings;
  currentUser: User | null;
}

export const EmployeesView: React.FC<EmployeesViewProps> = ({
  settings,
  currentUser,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<'الكل' | 'معلم' | 'إداري'>('الكل');
  const [jobTitleFilter, setJobTitleFilter] = useState('الكل');
  const [specializationFilter, setSpecializationFilter] = useState('الكل');
  const [statusFilter, setStatusFilter] = useState('الكل');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [editingEmp, setEditingEmp] = useState<Employee | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [employeesLoading, setEmployeesLoading] = useState(true);
  const [employeesError, setEmployeesError] = useState('');
  const [employeeAction, setEmployeeAction] = useState<string | null>(null);

  // Form Fields - Phase 2 (Salary strictly removed)
  const [id, setId] = useState('');
  const [name, setName] = useState('');
  const [employeeType, setEmployeeType] = useState<EmployeeType>('Teacher');
  const [jobTitle, setJobTitle] = useState('');
  const [specialization, setSpecialization] = useState('');
  const [teacherCode, setTeacherCode] = useState('');
  const [nationalId, setNationalId] = useState('');
  const [hireDate, setHireDate] = useState(new Date().toISOString().split('T')[0]);
  const [workingHours, setWorkingHours] = useState<number>(8);
  const [workStartTime, setWorkStartTime] = useState('07:30');
  const [workEndTime, setWorkEndTime] = useState('14:30');
  const [daysOff, setDaysOff] = useState<string[]>(['الجمعة', 'السبت']);
  const [status, setStatus] = useState<'Active' | 'Inactive'>('Active');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');

  const canCreate = hasPermission(currentUser, 'employees.create');
  const canEdit = hasPermission(currentUser, 'employees.edit');
  const canDelete = hasPermission(currentUser, 'employees.delete');
  const canImport = hasPermission(currentUser, 'employees.import');
  const canManage = canCreate || canEdit || canDelete || canImport;

  const loadEmployees = async () => {
    setEmployeesLoading(true);
    setEmployeesError('');
    const result = await storageService.getEmployeeManagementDataAuthoritative();
    setEmployeesLoading(false);

    if (!result.success) {
      setEmployees([]);
      setEmployeesError(result.message || 'تعذر تحميل بيانات العاملين من الخادم.');
      return false;
    }

    setEmployees(result.employees || []);
    return true;
  };

  useEffect(() => {
    void loadEmployees();
  }, [currentUser?.sessionToken, currentUser?.activeSchoolId, currentUser?.schoolId]);

  // Dynamic Distinct Values for Filters
  const distinctJobTitles = useMemo(() => {
    const list = employees.map(e => e.jobTitle).filter(Boolean);
    return Array.from(new Set(list));
  }, [employees]);

  const distinctSpecializations = useMemo(() => {
    const list = employees.map(e => e.specialization).filter(Boolean);
    return Array.from(new Set(list));
  }, [employees]);

  // Filtering Logic - Driven by employeeType, jobTitle, and specialization
  const filteredEmployees = useMemo(() => {
    return employees.filter(emp => {
      const matchType =
        typeFilter === 'الكل' ||
        (typeFilter === 'معلم' && emp.employeeType === 'Teacher') ||
        (typeFilter === 'إداري' && emp.employeeType === 'Administrative');

      const matchJob = jobTitleFilter === 'الكل' || emp.jobTitle === jobTitleFilter;
      const matchSpec = specializationFilter === 'الكل' || emp.specialization === specializationFilter;
      const matchStatus = statusFilter === 'الكل' || emp.status === statusFilter;

      const q = (searchQuery || '').trim().toLowerCase();
      const matchSearch =
        !q ||
        (emp.name || '').toLowerCase().includes(q) ||
        (emp.id || '').toLowerCase().includes(q) ||
        (emp.jobTitle || '').toLowerCase().includes(q) ||
        (emp.specialization || '').toLowerCase().includes(q) ||
        (emp.teacherCode || '').toLowerCase().includes(q) ||
        (emp.nationalId ? emp.nationalId.includes(q) : false) ||
        (emp.phone ? emp.phone.includes(q) : false);

      return matchType && matchJob && matchSpec && matchStatus && matchSearch;
    });
  }, [employees, typeFilter, jobTitleFilter, specializationFilter, statusFilter, searchQuery]);

  const openAddModal = () => {
    if (!canCreate) return;
    const nextNum = employees.length + 1;
    const nextId = `EMP${String(nextNum).padStart(3, '0')}`;
    const nextTeacherCode = `T-${String(nextNum).padStart(3, '0')}`;

    setEditingEmp(null);
    setId(nextId);
    setName('');
    setEmployeeType('Teacher');
    setJobTitle('معلم');
    setSpecialization('رياضيات');
    setTeacherCode(nextTeacherCode);
    setNationalId('');
    setHireDate(new Date().toISOString().split('T')[0]);
    setWorkingHours(settings.standardDailyHours || 7);
    setWorkStartTime(settings.officialStartTime || '07:30');
    setWorkEndTime(settings.officialEndTime || '14:30');
    setDaysOff(settings.weekendDays || ['الجمعة', 'السبت']);
    setStatus('Active');
    setPhone('');
    setEmail('');
    setErrorMessage('');
    setIsModalOpen(true);
  };

  const openEditModal = (emp: Employee) => {
    if (!canEdit) return;
    setEditingEmp(emp);
    setId(emp.id);
    setName(emp.name);
    setEmployeeType(emp.employeeType || (emp.isTeacher ? 'Teacher' : 'Administrative'));
    setJobTitle(emp.jobTitle || 'موظف');
    setSpecialization(emp.specialization || emp.department || 'عام');
    setTeacherCode(emp.teacherCode || '');
    setNationalId(emp.nationalId || '');
    setHireDate(emp.hireDate || new Date().toISOString().split('T')[0]);
    setWorkingHours(emp.workingHours || settings.standardDailyHours || 7);
    setWorkStartTime(emp.workStartTime || settings.officialStartTime || '07:30');
    setWorkEndTime(emp.workEndTime || settings.officialEndTime || '14:30');
    setDaysOff(emp.daysOff || settings.weekendDays || ['الجمعة', 'السبت']);
    setStatus(emp.status);
    setPhone(emp.phone || '');
    setEmail(emp.email || '');
    setErrorMessage('');
    setIsModalOpen(true);
  };

  const handleSaveEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    if (!id.trim() || !name.trim()) {
      setErrorMessage('رقم الموظف واسم الموظف حقول مطلوبة');
      return;
    }

    if (employeeType === 'Teacher' && !teacherCode.trim()) {
      setErrorMessage('كود المعلم مطلوب للمعلمين لربطه بالجدول المدرسي');
      return;
    }

    const empToSave: Employee = {
      id: id.trim().toUpperCase(),
      name: name.trim(),
      fullName: name.trim(),
      employeeType,
      jobTitle: jobTitle.trim() || (employeeType === 'Teacher' ? 'معلم' : 'إداري'),
      specialization: specialization.trim() || (employeeType === 'Teacher' ? 'تعليم عام' : 'إدارة عامة'),
      teacherCode: employeeType === 'Teacher' ? teacherCode.trim().toUpperCase() : undefined,
      nationalId: nationalId.trim(),
      hireDate,
      workingHours: Number(workingHours) || 7,
      workStartTime,
      workEndTime,
      daysOff,
      status,
      phone: phone.trim(),
      email: email.trim(),
      isTeacher: employeeType === 'Teacher',
      isTeachingStaff: employeeType === 'Teacher',
    };

    setEmployeeAction(editingEmp ? 'update' : 'create');
    const result = editingEmp
      ? await storageService.updateManagedEmployeeAuthoritative(empToSave)
      : await storageService.createManagedEmployeeAuthoritative(empToSave);
    setEmployeeAction(null);

    if (!result.success) {
      setErrorMessage(result.message || 'فشلت عملية الحفظ');
      return;
    }

    setIsModalOpen(false);
    await loadEmployees();
  };

  const handleToggleStatus = async (emp: Employee) => {
    if (!canEdit) return;
    const nextStatus = emp.status === 'Active' ? 'Inactive' : 'Active';

    setEmployeeAction(`status:${emp.id}`);
    const result = await storageService.setManagedEmployeeStatusAuthoritative(emp.id, nextStatus);
    setEmployeeAction(null);

    if (!result.success) {
      setEmployeesError(result.message || 'تعذر تحديث حالة الموظف.');
      return;
    }

    await loadEmployees();
  };

  const handleDeleteEmployee = async (emp: Employee) => {
    if (!canDelete) return;
    if (!window.confirm(`هل أنت متأكد من حذف الموظف (${emp.name}) نهائياً من النظام؟`)) return;

    setEmployeeAction(`delete:${emp.id}`);
    const result = await storageService.deleteManagedEmployeeAuthoritative(emp.id);
    setEmployeeAction(null);

    if (!result.success) {
      setEmployeesError(result.message || 'تعذر حذف الموظف.');
      return;
    }

    await loadEmployees();
  };

  const handleExport = () => {
    ExportService.exportFullDatabaseToExcel(
      employees,
      storageService.getAttendance(),
      storageService.getLeaves(),
      settings,
      storageService.getAuditLogs()
    );
  };

  return (
    <div className="space-y-5">
      {/* Top Header & Actions */}
      <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-teal-50 text-teal-600 flex items-center justify-center">
              <Users className="w-5 h-5" />
            </div>
            <span>دليل وهيكل المعلمين والموظفين (Staff Structure)</span>
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            إدارة الكادر التعليمي والإداري، المسميات الوظيفية، التخصصات، وأكواد التدريس
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {canImport && (
            <button
              id="btn-import-staff-data"
              onClick={() => setIsImportModalOpen(true)}
              className="text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2.5 rounded-2xl transition-colors flex items-center gap-1.5 border border-slate-200 shadow-xs"
            >
              <UploadCloud className="w-4 h-4 text-teal-700" />
              <span>استيراد بيانات العاملين</span>
            </button>
          )}

          {canCreate && (
            <button
              id="btn-add-new-employee"
              onClick={openAddModal}
              className="text-xs font-bold bg-[#008e8b] hover:bg-teal-700 text-white px-4 py-2.5 rounded-2xl shadow-sm transition-colors flex items-center gap-1.5"
            >
              <UserPlus className="w-4 h-4" />
              <span>إضافة موظف / معلم جديد</span>
            </button>
          )}

          <button
            onClick={handleExport}
            className="text-xs font-bold bg-white hover:bg-slate-50 text-slate-700 px-4 py-2.5 rounded-2xl transition-colors flex items-center gap-1.5 border border-slate-200 shadow-xs"
          >
            <Download className="w-4 h-4 text-slate-600" />
            <span>تصدير الموظفين Excel</span>
          </button>
        </div>
      </div>

      {employeesError && (
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-xs font-bold text-rose-800">
          <span className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {employeesError}
          </span>
          <button type="button" onClick={() => void loadEmployees()} className="underline">
            إعادة المحاولة
          </button>
        </div>
      )}

      {employeesLoading && (
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-center text-xs font-bold text-slate-500">
          جارٍ تحميل بيانات العاملين من الخادم المعتمد...
        </div>
      )}

      {/* Filter and Search Bar - Phase 2: employeeType, jobTitle, specialization */}
      <div className="bg-white p-4 rounded-3xl border border-slate-200 shadow-xs flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
        <div className="w-full lg:w-72 relative">
          <Search className="w-4 h-4 text-slate-400 absolute right-3 top-2.5" />
          <input
            type="text"
            placeholder="بحث بالاسم، الكود، التخصص، أو الهاتف..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full text-xs bg-slate-50 border border-slate-200 rounded-xl pr-9 pl-3 py-2 text-slate-900 focus:outline-hidden focus:border-[#008e8b]"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2.5 text-xs font-medium text-slate-700">
          {/* Employee Type Filter */}
          <div className="flex items-center gap-1.5">
            <span className="font-bold text-slate-600">النوع:</span>
            <select
              value={typeFilter}
              onChange={e => setTypeFilter(e.target.value as any)}
              className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-slate-800 focus:outline-hidden focus:border-[#008e8b]"
            >
              <option value="الكل">الكل (معلم وإداري)</option>
              <option value="معلم">معلمون فقط</option>
              <option value="إداري">إداريون فقط</option>
            </select>
          </div>

          {/* Job Title Filter */}
          <div className="flex items-center gap-1.5">
            <span className="font-bold text-slate-600">المسمى الوظيفي:</span>
            <select
              value={jobTitleFilter}
              onChange={e => setJobTitleFilter(e.target.value)}
              className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-slate-800 focus:outline-hidden focus:border-[#008e8b]"
            >
              <option value="الكل">جميع المسميات</option>
              {distinctJobTitles.map(j => (
                <option key={j} value={j}>{j}</option>
              ))}
            </select>
          </div>

          {/* Specialization Filter */}
          <div className="flex items-center gap-1.5">
            <span className="font-bold text-slate-600">التخصص:</span>
            <select
              value={specializationFilter}
              onChange={e => setSpecializationFilter(e.target.value)}
              className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-slate-800 focus:outline-hidden focus:border-[#008e8b]"
            >
              <option value="الكل">جميع التخصصات</option>
              {distinctSpecializations.map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          {/* Status Filter */}
          <div className="flex items-center gap-1.5">
            <span className="font-bold text-slate-600">الحالة:</span>
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-slate-800 focus:outline-hidden focus:border-[#008e8b]"
            >
              <option value="الكل">جميع الحالات</option>
              <option value="Active">نشط بالخدمة</option>
              <option value="Inactive">غير نشط / معطل</option>
            </select>
          </div>
        </div>
      </div>

      {/* Employees Table */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-right">
            <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200">
              <tr>
                <th className="py-3.5 px-4">رقم الموظف</th>
                <th className="py-3.5 px-4">الاسم الكامل</th>
                <th className="py-3.5 px-4">النوع الوظيفي</th>
                <th className="py-3.5 px-4">المسمى الوظيفي</th>
                <th className="py-3.5 px-4">التخصص</th>
                <th className="py-3.5 px-4">كود المعلم</th>
                <th className="py-3.5 px-4">مواعيد العمل</th>
                <th className="py-3.5 px-4">الحالة</th>
                {(canEdit || canDelete) && <th className="py-3.5 px-4 text-center">إجراءات</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium">
              {filteredEmployees.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-16 text-center">
                    <div className="flex flex-col items-center justify-center space-y-3 max-w-sm mx-auto">
                      <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-400">
                        <Users className="w-6 h-6" />
                      </div>
                      <div className="space-y-1">
                        <p className="text-sm font-bold text-slate-800">
                          {employees.length === 0 ? 'لا يوجد موظفون مسجلون بعد' : 'لا توجد نتائج تطابق البحث'}
                        </p>
                        <p className="text-xs text-slate-500">
                          {employees.length === 0
                            ? 'ابدأ بإضافة موظفي ومعلمي المدرسة أو استيرادهم من ملف Excel.'
                            : 'جرّب تغيير كلمات البحث أو إعادة تعيين الفلاتر.'}
                        </p>
                      </div>
                      {(canCreate || canImport) && employees.length === 0 && (
                        <div className="flex items-center gap-2 mt-2">
                          {canCreate && (
                            <button
                              onClick={openAddModal}
                              className="text-xs font-bold bg-[#008e8b] hover:bg-teal-700 text-white px-4 py-2 rounded-xl transition-all shadow-xs inline-flex items-center gap-1.5"
                            >
                              <UserPlus className="w-4 h-4" />
                              <span>إضافة أول موظف الآن</span>
                            </button>
                          )}
                          {canImport && (
                            <button
                              onClick={() => setIsImportModalOpen(true)}
                              className="text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2 rounded-xl transition-all inline-flex items-center gap-1.5"
                            >
                              <UploadCloud className="w-4 h-4 text-teal-600" />
                              <span>استيراد ملف Excel</span>
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                filteredEmployees.map(emp => (
                  <tr key={emp.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3.5 px-4 font-mono font-bold text-slate-700">{emp.id}</td>
                    <td className="py-3.5 px-4">
                      <div className="font-bold text-slate-800">{emp.name}</div>
                      {emp.phone && <div className="text-[10px] text-slate-400 mt-0.5">{emp.phone}</div>}
                    </td>
                    <td className="py-3.5 px-4">
                      <span
                        className={`inline-block px-2.5 py-1 rounded-lg font-bold text-[11px] ${
                          emp.employeeType === 'Teacher'
                            ? 'bg-indigo-50 text-indigo-700'
                            : 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        {emp.employeeType === 'Teacher' ? 'معلم' : 'إداري'}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-slate-700 font-medium">{emp.jobTitle}</td>
                    <td className="py-3.5 px-4">
                      <span className="inline-block px-2 py-0.5 rounded-md bg-teal-50 text-teal-800 font-bold text-[11px]">
                        {emp.specialization || 'عام'}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 font-mono font-bold text-indigo-600">
                      {emp.teacherCode || '-'}
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="text-slate-700 font-mono text-[11px]">
                        {emp.workStartTime || '07:30'} - {emp.workEndTime || '14:30'}
                      </div>
                      <div className="text-[10px] text-slate-400">
                        {emp.workingHours || 7} ساعات يومياً
                      </div>
                    </td>
                    <td className="py-3.5 px-4">
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold ${
                          emp.status === 'Active'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-rose-50 text-rose-700 border border-rose-200'
                        }`}
                      >
                        {emp.status === 'Active' ? 'نشط' : 'معطل'}
                      </span>
                    </td>
                    {(canEdit || canDelete) && (
                      <td className="py-3.5 px-4">
                        <div className="flex items-center justify-center gap-1">
                          {canEdit && (
                            <>
                              <button
                                disabled={employeeAction !== null}
                                onClick={() => openEditModal(emp)}
                                className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors disabled:opacity-40"
                                title="تعديل البيانات"
                              >
                                <Edit2 className="w-4 h-4" />
                              </button>
                              <button
                                disabled={employeeAction !== null}
                                onClick={() => void handleToggleStatus(emp)}
                                className={`p-1.5 rounded-lg transition-colors disabled:opacity-40 ${
                                  emp.status === 'Active'
                                    ? 'text-slate-400 hover:text-rose-600 hover:bg-rose-50'
                                    : 'text-slate-400 hover:text-emerald-600 hover:bg-emerald-50'
                                }`}
                                title={emp.status === 'Active' ? 'تعطيل الحساب' : 'تنشيط الحساب'}
                              >
                                {emp.status === 'Active' ? <UserX className="w-4 h-4" /> : <UserCheck className="w-4 h-4" />}
                              </button>
                            </>
                          )}
                          {canDelete && (
                            <button
                              disabled={employeeAction !== null}
                              onClick={() => void handleDeleteEmployee(emp)}
                              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors disabled:opacity-40"
                              title="حذف الموظف"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add / Edit Employee Modal - Phase 2 */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-2xl overflow-hidden my-8">
            <div className="p-6 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
                <Briefcase className="w-5 h-5 text-[#008e8b]" />
                <span>{editingEmp ? 'تعديل بيانات الموظف / المعلم' : 'إضافة موظف أو معلم جديد'}</span>
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEmployee} className="p-6 space-y-4">
              {errorMessage && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 font-bold flex items-center gap-2">
                  <AlertCircle className="w-4 h-4" />
                  <span>{errorMessage}</span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">الرقم الوظيفي / الكود *</label>
                  <input
                    type="text"
                    required
                    value={id}
                    onChange={e => setId(e.target.value)}
                    disabled={!!editingEmp}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-800 font-mono disabled:opacity-60"
                  />
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1">الاسم الكامل *</label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={e => setName(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-800"
                    placeholder="مثال: أحمد محمد علي"
                  />
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1">نوع الموظف *</label>
                  <select
                    value={employeeType}
                    onChange={e => setEmployeeType(e.target.value as EmployeeType)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-800 font-bold"
                  >
                    <option value="Teacher">معلم (كادر تعليمي)</option>
                    <option value="Administrative">إداري (شؤون / خدمات)</option>
                  </select>
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1">
                    كود المعلم {employeeType === 'Teacher' ? '*' : '(اختياري)'}
                  </label>
                  <input
                    type="text"
                    value={teacherCode}
                    onChange={e => setTeacherCode(e.target.value)}
                    required={employeeType === 'Teacher'}
                    disabled={employeeType !== 'Teacher'}
                    placeholder="مثال: T-101"
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-800 font-mono font-bold disabled:opacity-50"
                  />
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1">المسمى الوظيفي *</label>
                  <input
                    type="text"
                    required
                    value={jobTitle}
                    onChange={e => setJobTitle(e.target.value)}
                    placeholder="مثال: معلم أول، أخصائي شؤون طلاب، سكرتير..."
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-800"
                  />
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1">التخصص *</label>
                  <input
                    type="text"
                    required
                    value={specialization}
                    onChange={e => setSpecialization(e.target.value)}
                    placeholder="مثال: رياضيات، لغة إنجليزية، ذكاء اصطناعي، شؤون طلاب، موارد بشرية، حسابات"
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-800"
                  />
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1">تاريخ التعيين</label>
                  <input
                    type="date"
                    value={hireDate}
                    onChange={e => setHireDate(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-800"
                  />
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1">الرقم القومي (14 رقم)</label>
                  <input
                    type="text"
                    value={nationalId}
                    onChange={e => setNationalId(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-800 font-mono"
                    placeholder="14 رقم قومي"
                  />
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1">بداية الدوام</label>
                  <input
                    type="time"
                    value={workStartTime}
                    onChange={e => setWorkStartTime(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-800 font-mono"
                  />
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1">نهاية الدوام</label>
                  <input
                    type="time"
                    value={workEndTime}
                    onChange={e => setWorkEndTime(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-800 font-mono"
                  />
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1">ساعات العمل اليومية</label>
                  <input
                    type="number"
                    value={workingHours}
                    onChange={e => setWorkingHours(Number(e.target.value))}
                    min={1}
                    max={16}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-800 font-mono"
                  />
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1">رقم الهاتف</label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={e => setPhone(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-800"
                    placeholder="01XXXXXXXXX"
                  />
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1">البريد الإلكتروني</label>
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-800"
                    placeholder="emp@school.edu.eg"
                  />
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1">حالة الحساب</label>
                  <select
                    value={status}
                    onChange={e => setStatus(e.target.value as 'Active' | 'Inactive')}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-800 font-bold"
                  >
                    <option value="Active">نشط بالخدمة</option>
                    <option value="Inactive">معطل / غير نشط</option>
                  </select>
                </div>
              </div>

              <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end gap-2 -mx-6 -mb-6 mt-4">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-slate-600 hover:bg-slate-200 rounded-xl text-xs font-bold"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={employeeAction !== null}
                  className="px-6 py-2 bg-[#008e8b] hover:bg-teal-700 text-white rounded-xl text-xs font-bold shadow-md disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {employeeAction === 'create' || employeeAction === 'update' ? 'جارٍ الحفظ...' : 'حفظ البيانات'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Staff Bulk Import Modal */}
      <StaffImportModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        onImportComplete={() => {
          setIsImportModalOpen(false);
          void loadEmployees();
        }}
      />
    </div>
  );
};
