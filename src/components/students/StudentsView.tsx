import React, { useEffect, useMemo, useState } from 'react';
import {
  Download,
  Edit,
  Eye,
  FileSpreadsheet,
  Filter,
  GraduationCap,
  Plus,
  RotateCcw,
  Search,
  Trash2,
  Upload,
  UserCheck,
  UserX,
  Users,
  ArrowRightLeft,
  CheckCircle,
  Archive,
  Phone,
  Layers,
  Sparkles
} from 'lucide-react';
import * as XLSX from 'xlsx';
import {
  Student,
  normalizeStudentGender,
  normalizeStudentReligion,
  normalizeStudentEnrollmentState,
} from '../../types';
import { storageService } from '../../services/storageService';
import { hasPermission } from '../../utils/permissions';
import { ImportWizardModal } from '../import/ImportWizardModal';
import { StudentProfileModal } from './StudentProfileModal';
import { StudentPromotionWizard } from './StudentPromotionWizard';
import { formatEgyptianDate } from '../../utils/egyptianTime';

export const StudentsView: React.FC = () => {
  const [students, setStudents] = useState<Student[]>(() => storageService.getStudents());
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStage, setSelectedStage] = useState('ALL');
  const [selectedGrade, setSelectedGrade] = useState('ALL');
  const [selectedClassroom, setSelectedClassroom] = useState('ALL');
  const [selectedStatus, setSelectedStatus] = useState('ALL');
  const [genderFilter, setGenderFilter] = useState<'ALL' | 'ذكر' | 'أنثى' | 'غير محدد'>('ALL');
  const [religionFilter, setReligionFilter] = useState<'ALL' | 'مسلم' | 'مسيحي' | 'غير محدد'>('ALL');
  const [studentStatusFilter, setStudentStatusFilter] = useState<'ALL' | 'مستجد' | 'باقي' | 'غير محدد'>('ALL');

  // Modals state
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [isPromotionWizardOpen, setIsPromotionWizardOpen] = useState(false);
  const [selectedStudentForProfile, setSelectedStudentForProfile] = useState<Student | null>(null);
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [managementLoading, setManagementLoading] = useState(false);
  const [managementError, setManagementError] = useState('');
  const [managementAction, setManagementAction] = useState<string | null>(null);

  const currentUser = storageService.getCurrentUser();
  const canCreateStudent = hasPermission(currentUser, 'students.create');
  const canEditStudent = hasPermission(currentUser, 'students.edit');
  const canImportStudents = hasPermission(currentUser, 'students.import');

  // Quick Transfer Modal
  const [transferModalStudent, setTransferModalStudent] = useState<Student | null>(null);
  const [transferData, setTransferData] = useState({
    toGrade: '',
    toClassroom: '',
    reason: 'إعادة توزيع الفصول الدراسية',
    notes: ''
  });

  // Form State
  const [formData, setFormData] = useState<Partial<Student>>({
    name: '',
    studentCode: '',
    nationalId: '',
    gender: 'ذكر',
    stage: 'المرحلة الثانوية',
    grade: 'الصف الأول الثانوي',
    classroom: '1/1',
    section: 'أ',
    academicYear: '2025/2026',
    status: 'نشط',
    parentName: '',
    relationship: 'أب',
    parentPhone: '',
    parentEmail: '',
    phone: '',
    address: '',
    notes: '',
  });

  const settings = storageService.getSettings();
  const stages = settings.stages || [];
  const activeAcademicYear = storageService.getActiveAcademicYear();

  const reloadStudents = async () => {
    setManagementLoading(true);
    setManagementError('');
    const result = await storageService.getStudentManagementDataAuthoritative();
    setManagementLoading(false);

    if (!result.success) {
      setManagementError(result.message || 'تعذر تحميل سجل الطلاب من الخادم المعتمد.');
      return false;
    }

    setStudents(result.students || []);
    return true;
  };

  useEffect(() => {
    void reloadStudents();
  }, [currentUser?.sessionToken, currentUser?.activeSchoolId, currentUser?.schoolId]);

  // Extract unique stages, grades, classrooms
  const availableGrades = useMemo(() => {
    if (selectedStage === 'ALL') {
      return Array.from(new Set(students.map(s => s.grade).filter(Boolean)));
    }
    const stageObj = (stages || []).find(s => s.name === selectedStage);
    return stageObj?.grades ? stageObj.grades.map(g => g.name) : [];
  }, [selectedStage, students, stages]);

  const availableClassrooms = useMemo(() => {
    if (selectedGrade === 'ALL') {
      return Array.from(new Set(students.map(s => s.classroom).filter(Boolean)));
    }
    const foundStage = (stages || []).find(s => (s.grades || []).some(g => g.name === selectedGrade));
    const gradeObj = foundStage?.grades?.find(g => g.name === selectedGrade);
    return gradeObj?.classrooms ? gradeObj.classrooms : Array.from(new Set(students.filter(s => s.grade === selectedGrade).map(s => s.classroom)));
  }, [selectedGrade, students, stages]);

  // Filtered Students
  const filteredStudents = useMemo(() => {
    return students.filter(s => {
      const matchSearch =
        !searchTerm.trim() ||
        s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        s.studentCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (s.nationalId && s.nationalId.includes(searchTerm)) ||
        (s.parentPhone && s.parentPhone.includes(searchTerm)) ||
        (s.parentName && s.parentName.toLowerCase().includes(searchTerm.toLowerCase()));

      const matchStage = selectedStage === 'ALL' || s.stage === selectedStage;
      const matchGrade = selectedGrade === 'ALL' || s.grade === selectedGrade;
      const matchClassroom = selectedClassroom === 'ALL' || s.classroom === selectedClassroom;
      const matchStatus = selectedStatus === 'ALL' || s.status === selectedStatus;
      const matchGender = genderFilter === 'ALL' || normalizeStudentGender(s.gender) === genderFilter;
      const matchReligion = religionFilter === 'ALL' || normalizeStudentReligion(s.religion) === religionFilter;
      const matchStudentStatus = studentStatusFilter === 'ALL' || normalizeStudentEnrollmentState(s.studentStatus) === studentStatusFilter;

      return matchSearch && matchStage && matchGrade && matchClassroom && matchStatus && matchGender && matchReligion && matchStudentStatus;
    });
  }, [students, searchTerm, selectedStage, selectedGrade, selectedClassroom, selectedStatus, genderFilter, religionFilter, studentStatusFilter]);

  const handleOpenAdd = () => {
    if (!canCreateStudent) {
      setManagementError('ليست لديك صلاحية إضافة طالب جديد.');
      return;
    }
    setEditingStudent(null);
    const currYear = activeAcademicYear?.name || settings.currentAcademicYear || '2025/2026';
    setFormData({
      name: '',
      studentCode: `STD-${Date.now().toString().slice(-5)}`,
      nationalId: '',
      gender: undefined,
      religion: undefined,
      studentStatus: undefined,
      stage: stages[0]?.name || 'المرحلة الثانوية',
      grade: stages[0]?.grades[0]?.name || 'الصف الأول الثانوي',
      classroom: stages[0]?.grades[0]?.classrooms[0] || '1/1',
      section: 'أ',
      academicYear: currYear,
      status: 'نشط',
      parentName: '',
      relationship: 'أب',
      parentPhone: '',
      parentEmail: '',
      phone: '',
      address: '',
      notes: '',
    });
    setIsFormModalOpen(true);
  };

  const handleOpenEdit = (student: Student) => {
    if (!canEditStudent) {
      setManagementError('ليست لديك صلاحية تعديل بيانات الطلاب.');
      return;
    }
    setEditingStudent(student);
    setFormData({ ...student });
    setIsFormModalOpen(true);
  };

  const handleSaveForm = async (e: React.FormEvent) => {
    e.preventDefault();
    setManagementError('');

    const requiredPermission = editingStudent ? canEditStudent : canCreateStudent;
    if (!requiredPermission) {
      setManagementError('ليست لديك الصلاحية اللازمة لتنفيذ هذه العملية.');
      return;
    }

    if (!formData.name?.trim() || !formData.grade?.trim() || !formData.classroom?.trim()) {
      setManagementError('يرجى ملء الحقول الأساسية: اسم الطالب، الصف الدراسي، والفصل.');
      return;
    }

    const currentYear = activeAcademicYear?.name || formData.academicYear || settings.currentAcademicYear || '2025/2026';
    const currentYearId = activeAcademicYear?.id || 'AY-CURRENT';
    const normalizedG = formData.gender ? normalizeStudentGender(formData.gender) : undefined;
    const normalizedR = formData.religion ? normalizeStudentReligion(formData.religion) : undefined;
    const normalizedS = formData.studentStatus ? normalizeStudentEnrollmentState(formData.studentStatus) : undefined;
    const desiredStatus = String(formData.status || editingStudent?.status || 'نشط') as
      | 'نشط'
      | 'غير نشط'
      | 'موقوف'
      | 'منقول'
      | 'متخرج';

    const studentInput: Partial<Student> = {
      studentCode: formData.studentCode?.trim() || undefined,
      name: formData.name.trim(),
      nationalId: formData.nationalId?.trim() || undefined,
      gender: normalizedG === 'غير محدد' ? undefined : normalizedG,
      religion: normalizedR === 'غير محدد' ? undefined : normalizedR,
      studentStatus: normalizedS === 'غير محدد' ? undefined : normalizedS,
      birthDate: formData.birthDate,
      stage: formData.stage || 'المرحلة الثانوية',
      stageId: formData.stageId,
      grade: formData.grade,
      gradeId: formData.gradeId,
      gradeName: formData.gradeName,
      classroom: formData.classroom,
      classroomId: formData.classroomId,
      classroomNumber: formData.classroomNumber,
      section: formData.section || 'أ',
      academicYear: currentYear,
      academicYearId: currentYearId,
      enrollmentDate: activeAcademicYear?.startDate,
      parentName: formData.parentName?.trim() || '',
      relationship: formData.relationship?.trim() || '',
      parentPhone: formData.parentPhone?.trim() || '',
      parentEmail: formData.parentEmail?.trim() || '',
      phone: formData.phone?.trim() || '',
      address: formData.address?.trim() || '',
      notes: formData.notes?.trim() || '',
      initialBehaviorScore: formData.initialBehaviorScore ?? 100,
    };

    setManagementAction(editingStudent ? 'update-student' : 'create-student');
    const result = editingStudent
      ? await storageService.updateManagedStudentAuthoritative(
          editingStudent.id,
          studentInput,
          {
            academicYearId: currentYearId,
            academicYearName: currentYear,
            enrollmentDate: activeAcademicYear?.startDate,
          }
        )
      : await storageService.createManagedStudentAuthoritative(
          studentInput,
          {
            academicYearId: currentYearId,
            academicYearName: currentYear,
            enrollmentDate: activeAcademicYear?.startDate,
          }
        );

    if (!result.success || !result.student) {
      setManagementAction(null);
      setManagementError(result.message || 'تعذر حفظ بيانات الطالب.');
      return;
    }

    const currentStatus = String(result.student.status || 'نشط');
    if (desiredStatus !== currentStatus) {
      if (!canEditStudent) {
        setManagementAction(null);
        setManagementError('تم إنشاء الطالب بحالة نشط، لكن تغيير الحالة يتطلب صلاحية تعديل الطلاب.');
        await reloadStudents();
        return;
      }
      const statusResult = await storageService.setManagedStudentStatusAuthoritative(result.student.id, desiredStatus);
      if (!statusResult.success) {
        setManagementAction(null);
        setManagementError(statusResult.message || 'تم حفظ بيانات الطالب لكن تعذر تحديث حالته.');
        await reloadStudents();
        return;
      }
    }

    setManagementAction(null);
    setIsFormModalOpen(false);
    setEditingStudent(null);
    await reloadStudents();
  };

  const handleOpenTransfer = (student: Student) => {
    if (!canEditStudent) {
      setManagementError('ليست لديك صلاحية نقل الطلاب بين الفصول.');
      return;
    }
    setTransferModalStudent(student);
    setTransferData({
      toGrade: student.grade,
      toClassroom: student.classroom,
      reason: 'إعادة توزيع ونقل فصل دراسي',
      notes: ''
    });
  };

  const handleExecuteTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    setManagementError('');

    if (!canEditStudent) {
      setManagementError('ليست لديك صلاحية نقل الطلاب بين الفصول.');
      return;
    }

    if (!transferModalStudent || !transferData.toGrade || !transferData.toClassroom) {
      setManagementError('يرجى تحديد الصف والفصل المحول إليه.');
      return;
    }

    setManagementAction(`transfer-student:${transferModalStudent.id}`);
    const result = await storageService.transferManagedStudentAuthoritative({
      studentId: transferModalStudent.id,
      academicYearId: activeAcademicYear?.id,
      toGrade: transferData.toGrade,
      toClassroom: transferData.toClassroom,
      reason: transferData.reason,
      notes: transferData.notes,
    });
    setManagementAction(null);

    if (!result.success) {
      setManagementError(result.message || 'تعذر نقل الطالب.');
      return;
    }

    setTransferModalStudent(null);
    await reloadStudents();
  };

  const handleDelete = async (id: string, name: string) => {
    if (!canEditStudent) {
      setManagementError('ليست لديك صلاحية أرشفة أو تغيير حالة الطالب.');
      return;
    }
    if (!window.confirm(`هل تريد نقل الطالب (${name}) إلى حالة "مؤرشف / غير نشط" للحفاظ على السجلات التاريخية؟`)) {
      return;
    }

    setManagementAction(`archive-student:${id}`);
    const result = await storageService.setManagedStudentStatusAuthoritative(id, 'غير نشط');
    setManagementAction(null);

    if (!result.success) {
      setManagementError(result.message || 'تعذر أرشفة الطالب.');
      return;
    }

    await reloadStudents();
  };

  const exportToExcel = () => {
    const dataToExport = filteredStudents.map((s, idx) => ({
      'م': idx + 1,
      'كود الطالب': s.studentCode,
      'اسم الطالب رباعي': s.name,
      'الرقم القومي': s.nationalId || '—',
      'النوع': normalizeStudentGender(s.gender),
      'الديانة': normalizeStudentReligion(s.religion),
      'حالة القيد': normalizeStudentEnrollmentState(s.studentStatus),
      'المرحلة': s.stage,
      'الصف الدراسي': s.grade,
      'الفصل': s.classroom,
      'الحالة': s.status,
      'اسم ولي الأمر': s.parentName,
      'صلة القرابة': s.relationship,
      'هاتف ولي الأمر': s.parentPhone,
      'هاتف الطالب': s.phone || '—',
      'العنوان': s.address || '—',
    }));

    const ws = XLSX.utils.json_to_sheet(dataToExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'قائمة_الطلاب');
    XLSX.writeFile(wb, `سجل_الطلاب_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  return (
    <div className="space-y-6" dir="rtl">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-6 rounded-3xl border border-slate-200 shadow-xs">
        <div>
          <h1 className="text-xl font-bold text-slate-800 flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#008e8b]/10 text-[#008e8b] flex items-center justify-center">
              <GraduationCap className="w-6 h-6" />
            </div>
            <span>إدارة شؤون الطلاب والصفوف</span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            سجل الطلاب العام، بيانات أولياء الأمور، توزيع الفصول، واستيراد وتصدير القوائم
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setIsPromotionWizardOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-xs rounded-2xl border border-indigo-200 transition-colors shadow-xs cursor-pointer"
          >
            <Sparkles className="w-4 h-4 text-indigo-600" />
            <span>معالج ترحيل الطلاب</span>
          </button>

          {canImportStudents && (
          <button
            onClick={() => setIsImportModalOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-slate-50 hover:bg-slate-100 text-slate-700 font-bold text-xs rounded-2xl border border-slate-200 transition-colors shadow-xs cursor-pointer"
          >
            <Upload className="w-4 h-4 text-[#008e8b]" />
            <span>استيراد ملف Excel</span>
          </button>
          )}

          <button
            onClick={exportToExcel}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-slate-50 hover:bg-slate-100 text-slate-700 font-bold text-xs rounded-2xl border border-slate-200 transition-colors shadow-xs cursor-pointer"
          >
            <Download className="w-4 h-4 text-emerald-600" />
            <span>تصدير Excel</span>
          </button>

          {canCreateStudent && (
          <button
            onClick={handleOpenAdd}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#008e8b] hover:bg-teal-700 text-white font-bold text-xs rounded-2xl transition-colors shadow-md cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>إضافة طالب جديد</span>
          </button>
          )}
        </div>
      </div>

      {managementError && (
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-xs font-bold text-rose-800">
          <span>{managementError}</span>
          <button type="button" onClick={() => void reloadStudents()} className="underline">
            إعادة المحاولة
          </button>
        </div>
      )}

      {managementLoading && (
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-center text-xs font-bold text-slate-500">
          جارٍ تحميل سجل الطلاب من الخادم المعتمد...
        </div>
      )}

      {/* Advanced Filter Bar */}
      <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-700">
            <Filter className="w-4 h-4 text-[#008e8b]" />
            <span>فلاتر البحث والتصفية المتقدمة</span>
          </div>
          <button
            onClick={() => {
              setSearchTerm('');
              setSelectedStage('ALL');
              setSelectedGrade('ALL');
              setSelectedClassroom('ALL');
              setSelectedStatus('ALL');
              setGenderFilter('ALL');
              setReligionFilter('ALL');
              setStudentStatusFilter('ALL');
            }}
            className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-[#008e8b] transition-colors cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>إعادة تعيين الفلاتر</span>
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
          {/* Search box */}
          <div className="relative md:col-span-2">
            <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-3" />
            <input
              type="text"
              placeholder="ابحث بالاسم، الكود، الرقم القومي، أو هاتف ولي الأمر..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full text-xs bg-slate-50 border border-slate-300 rounded-xl pr-10 pl-4 py-2.5 text-slate-800 placeholder-slate-400 focus:outline-hidden focus:border-[#008e8b]"
            />
          </div>

          {/* Stage Filter */}
          <div>
            <select
              value={selectedStage}
              onChange={(e) => {
                setSelectedStage(e.target.value);
                setSelectedGrade('ALL');
                setSelectedClassroom('ALL');
              }}
              className="w-full text-xs bg-slate-50 border border-slate-300 rounded-xl px-3 py-2.5 text-slate-700 focus:outline-hidden focus:border-[#008e8b]"
            >
              <option value="ALL">جميع المراحل</option>
              {stages.map(st => (
                <option key={st.id} value={st.name}>{st.name}</option>
              ))}
            </select>
          </div>

          {/* Grade Filter */}
          <div>
            <select
              value={selectedGrade}
              onChange={(e) => {
                setSelectedGrade(e.target.value);
                setSelectedClassroom('ALL');
              }}
              className="w-full text-xs bg-slate-50 border border-slate-300 rounded-xl px-3 py-2.5 text-slate-700 focus:outline-hidden focus:border-[#008e8b]"
            >
              <option value="ALL">جميع الصفوف</option>
              {availableGrades.map(g => (
                <option key={g} value={g}>{g}</option>
              ))}
            </select>
          </div>

          {/* Classroom Filter */}
          <div>
            <select
              value={selectedClassroom}
              onChange={(e) => setSelectedClassroom(e.target.value)}
              className="w-full text-xs bg-slate-50 border border-slate-300 rounded-xl px-3 py-2.5 text-slate-700 focus:outline-hidden focus:border-[#008e8b]"
            >
              <option value="ALL">جميع الفصول</option>
              {availableClassrooms.map(c => (
                <option key={c} value={c}>فصل {c}</option>
              ))}
            </select>
          </div>

          {/* Gender Filter */}
          <div>
            <select
              value={genderFilter}
              onChange={(e) => setGenderFilter(e.target.value as any)}
              className="w-full text-xs bg-slate-50 border border-slate-300 rounded-xl px-3 py-2.5 text-slate-700 focus:outline-hidden focus:border-[#008e8b]"
            >
              <option value="ALL">النوع (الكل)</option>
              <option value="ذكر">ذكر</option>
              <option value="أنثى">أنثى</option>
              <option value="غير محدد">غير محدد</option>
            </select>
          </div>

          {/* Religion Filter */}
          <div>
            <select
              value={religionFilter}
              onChange={(e) => setReligionFilter(e.target.value as any)}
              className="w-full text-xs bg-slate-50 border border-slate-300 rounded-xl px-3 py-2.5 text-slate-700 focus:outline-hidden focus:border-[#008e8b]"
            >
              <option value="ALL">الديانة (الكل)</option>
              <option value="مسلم">مسلم</option>
              <option value="مسيحي">مسيحي</option>
              <option value="غير محدد">غير محدد</option>
            </select>
          </div>

          {/* Student Status Filter */}
          <div>
            <select
              value={studentStatusFilter}
              onChange={(e) => setStudentStatusFilter(e.target.value as any)}
              className="w-full text-xs bg-slate-50 border border-slate-300 rounded-xl px-3 py-2.5 text-slate-700 focus:outline-hidden focus:border-[#008e8b]"
            >
              <option value="ALL">حالة القيد (الكل)</option>
              <option value="مستجد">مستجد</option>
              <option value="باقي">باقي</option>
              <option value="غير محدد">غير محدد</option>
            </select>
          </div>
        </div>
      </div>

      {/* Summary Count Bar */}
      <div className="flex items-center justify-between text-xs text-slate-600 px-2 font-semibold">
        <div className="flex items-center gap-3">
          <span>إجمالي الطلاب المطابقين: <strong className="text-[#008e8b] font-mono text-sm">{filteredStudents.length}</strong> طالب</span>
          <span>•</span>
          <span>إجمالي الطلاب المسجلين بالمدرسة: <strong className="text-slate-800 font-mono">{students.length}</strong></span>
        </div>
      </div>

      {/* Students Table */}
      <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-right border-collapse">
            <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200">
              <tr>
                <th className="p-4">كود الطالب</th>
                <th className="p-4">اسم الطالب رباعي</th>
                <th className="p-4">النوع</th>
                <th className="p-4">الديانة</th>
                <th className="p-4">حالة القيد</th>
                <th className="p-4">الصف / الفصل</th>
                <th className="p-4">المرحلة</th>
                <th className="p-4">ولي الأمر</th>
                <th className="p-4">هاتف ولي الأمر</th>
                <th className="p-4">حالة الحساب</th>
                <th className="p-4 text-center">الإجراءات والتحكم</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredStudents.length === 0 ? (
                <tr>
                  <td colSpan={11} className="p-12 text-center text-slate-400">
                    <Users className="w-12 h-12 mx-auto mb-2 text-slate-300" />
                    <p className="text-sm font-semibold text-slate-600">لا يوجد طلاب مطابقين للبحث أو الفلتر المختار</p>
                    <p className="text-xs text-slate-400 mt-1">يمكنك إضافة طالب جديد أو استيراد ملف Excel</p>
                  </td>
                </tr>
              ) : (
                filteredStudents.map(student => {
                  const gVal = normalizeStudentGender(student.gender);
                  const rVal = normalizeStudentReligion(student.religion);
                  const sVal = normalizeStudentEnrollmentState(student.studentStatus);

                  return (
                    <tr key={student.id} className="hover:bg-teal-50/30 transition-colors">
                      <td className="p-4 font-mono font-bold text-[#008e8b]">
                        {student.studentCode}
                      </td>
                      <td className="p-4">
                        <div className="font-bold text-slate-800">{student.name}</div>
                        {student.nationalId && (
                          <div className="text-[10px] text-slate-400 font-mono mt-0.5">الرقم القومي: {student.nationalId}</div>
                        )}
                      </td>
                      <td className="p-4">
                        <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-bold ${
                          gVal === 'ذكر' ? 'bg-blue-50 text-blue-700' :
                          gVal === 'أنثى' ? 'bg-pink-50 text-pink-700' :
                          'bg-slate-100 text-slate-500'
                        }`}>
                          {gVal}
                        </span>
                      </td>
                      <td className="p-4">
                        <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-medium ${
                          rVal === 'مسلم' ? 'bg-emerald-50 text-emerald-700' :
                          rVal === 'مسيحي' ? 'bg-indigo-50 text-indigo-700' :
                          'bg-slate-100 text-slate-500'
                        }`}>
                          {rVal}
                        </span>
                      </td>
                      <td className="p-4">
                        <span className={`inline-block px-2.5 py-0.5 rounded text-[11px] font-bold ${
                          sVal === 'مستجد' ? 'bg-teal-50 text-teal-700 border border-teal-200' :
                          sVal === 'باقي' ? 'bg-amber-50 text-amber-700 border border-amber-200' :
                          'bg-slate-100 text-slate-500 border border-slate-200'
                        }`}>
                          {sVal}
                        </span>
                      </td>
                      <td className="p-4">
                        <div className="font-semibold text-slate-800">{student.grade}</div>
                        <span className="inline-block bg-teal-100 text-[#008e8b] font-bold px-2 py-0.5 rounded-md text-[11px] mt-0.5">
                          فصل: {student.classroom} {student.section ? `(شعبة ${student.section})` : ''}
                        </span>
                      </td>
                      <td className="p-4 text-slate-600">{student.stage}</td>
                      <td className="p-4">
                        <div className="text-slate-800 font-medium">{student.parentName}</div>
                        <div className="text-[10px] text-slate-400">({student.relationship || 'ولي أمر'})</div>
                      </td>
                      <td className="p-4 font-mono text-slate-700">
                        {student.parentPhone ? (
                          <a href={`tel:${student.parentPhone}`} className="hover:text-[#008e8b] hover:underline flex items-center gap-1">
                            <Phone className="w-3 h-3 text-slate-400" />
                            <span>{student.parentPhone}</span>
                          </a>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="p-4">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold ${
                            student.status === 'نشط'
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : student.status === 'موقوف'
                              ? 'bg-amber-50 text-amber-700 border border-amber-200'
                              : 'bg-rose-50 text-rose-700 border border-rose-200'
                          }`}
                        >
                          {student.status === 'نشط' ? <UserCheck className="w-3 h-3" /> : <UserX className="w-3 h-3" />}
                          <span>{student.status}</span>
                        </span>
                      </td>
                    <td className="p-4">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          onClick={() => {
                            setSelectedStudentForProfile(student);
                            setIsProfileModalOpen(true);
                          }}
                          className="p-1.5 text-slate-500 hover:text-[#008e8b] hover:bg-teal-50 rounded-lg transition-colors cursor-pointer"
                          title="عرض ملف الطالب الشامل (Student 360)"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        {canEditStudent && (
                          <button
                            disabled={managementAction !== null}
                            onClick={() => handleOpenTransfer(student)}
                            className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors cursor-pointer disabled:opacity-40"
                            title="نقل فصل / تحويل شعبة"
                          >
                            <ArrowRightLeft className="w-4 h-4" />
                          </button>
                        )}
                        {canEditStudent && (
                          <>
                            <button
                              disabled={managementAction !== null}
                              onClick={() => handleOpenEdit(student)}
                              className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer disabled:opacity-40"
                              title="تعديل بيانات الطالب"
                            >
                              <Edit className="w-4 h-4" />
                            </button>
                            <button
                              disabled={managementAction !== null}
                              onClick={() => void handleDelete(student.id, student.name)}
                              className="p-1.5 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer disabled:opacity-40"
                              title="أرشفة / تعطيل الطالب"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
          </table>
        </div>
      </div>

      {/* Quick Transfer Modal */}
      {transferModalStudent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full border border-slate-200 shadow-2xl space-y-4 text-right">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <ArrowRightLeft className="w-5 h-5 text-indigo-600" />
                <span>نقل وتحويل الطالب: {transferModalStudent.name}</span>
              </h3>
              <button onClick={() => setTransferModalStudent(null)} className="text-slate-400 hover:text-slate-600 cursor-pointer">✕</button>
            </div>

            <form onSubmit={handleExecuteTransfer} className="space-y-3.5">
              <div className="p-3 bg-indigo-50 rounded-xl text-xs text-indigo-900">
                <span>الصف والفصل الحالي: <strong>{transferModalStudent.grade} (فصل {transferModalStudent.classroom})</strong></span>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700">الصف المحول إليه <span className="text-rose-500">*</span></label>
                <select
                  required
                  value={transferData.toGrade}
                  onChange={(e) => setTransferData({ ...transferData, toGrade: e.target.value })}
                  className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                >
                  <option value="">— اختر الصف —</option>
                  {(stages.flatMap(s => s.grades || [])).map(g => (
                    <option key={g.id} value={g.name}>{g.name}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700">الفصل الجديد <span className="text-rose-500">*</span></label>
                <select
                  required
                  value={transferData.toClassroom}
                  onChange={(e) => setTransferData({ ...transferData, toClassroom: e.target.value })}
                  className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                >
                  <option value="">— اختر الفصل —</option>
                  {(() => {
                    const gradeObj = (stages.flatMap(s => s.grades || [])).find(g => g.name === transferData.toGrade);
                    const classList = gradeObj?.classrooms || ['1/1', '1/2', '1/3', '2/1', '2/2', '3/1'];
                    return classList.map(c => (
                      <option key={c} value={c}>{c}</option>
                    ));
                  })()}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700">سبب النقل / القرار</label>
                <input
                  type="text"
                  required
                  value={transferData.reason}
                  onChange={(e) => setTransferData({ ...transferData, reason: e.target.value })}
                  placeholder="مثال: إعادة توزيع الكثافة، طلب ولي الأمر"
                  className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setTransferModalStudent(null)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={managementAction !== null}
                  className="px-6 py-2 rounded-xl text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 cursor-pointer shadow-xs disabled:opacity-50"
                >
                  {managementAction?.startsWith('transfer-student:') ? 'جارٍ النقل...' : 'تأكيد النقل الآن'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add / Edit Student Modal */}
      {isFormModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-2xl overflow-hidden my-6">
            <div className="p-6 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
                <GraduationCap className="w-5 h-5 text-[#008e8b]" />
                <span>{editingStudent ? 'تعديل بيانات طالب' : 'إضافة طالب جديد'}</span>
              </h3>
              <button onClick={() => setIsFormModalOpen(false)} className="text-slate-400 hover:text-slate-700 cursor-pointer">
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveForm} className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    اسم الطالب رباعي <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.name || ''}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="مثال: أحمد محمد محمود إبراهيم"
                    className="w-full text-xs bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-800 focus:outline-hidden focus:border-[#008e8b]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    كود الطالب / رقم الجلوس
                  </label>
                  <input
                    type="text"
                    value={formData.studentCode || ''}
                    onChange={(e) => setFormData({ ...formData, studentCode: e.target.value })}
                    placeholder="مثال: STD-1001"
                    className="w-full text-xs font-mono bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-800 focus:outline-hidden focus:border-[#008e8b]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    الرقم القومي (14 رقم)
                  </label>
                  <input
                    type="text"
                    maxLength={14}
                    value={formData.nationalId || ''}
                    onChange={(e) => setFormData({ ...formData, nationalId: e.target.value })}
                    placeholder="الرقم القومي للطالب"
                    className="w-full text-xs font-mono bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-800 focus:outline-hidden focus:border-[#008e8b]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">النوع (Gender)</label>
                  <select
                    value={formData.gender || ''}
                    onChange={(e) => setFormData({ ...formData, gender: e.target.value as any })}
                    className="w-full text-xs bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-800 focus:outline-hidden focus:border-[#008e8b]"
                  >
                    <option value="">غير محدد</option>
                    <option value="ذكر">ذكر (Male)</option>
                    <option value="أنثى">أنثى (Female)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">الديانة (Religion)</label>
                  <select
                    value={formData.religion || ''}
                    onChange={(e) => setFormData({ ...formData, religion: e.target.value as any })}
                    className="w-full text-xs bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-800 focus:outline-hidden focus:border-[#008e8b]"
                  >
                    <option value="">غير محدد</option>
                    <option value="مسلم">مسلم (Muslim)</option>
                    <option value="مسيحي">مسيحي (Christian)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">حالة القيد (Enrollment Status)</label>
                  <select
                    value={formData.studentStatus || ''}
                    onChange={(e) => setFormData({ ...formData, studentStatus: e.target.value as any })}
                    className="w-full text-xs bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-800 focus:outline-hidden focus:border-[#008e8b]"
                  >
                    <option value="">غير محدد</option>
                    <option value="مستجد">مستجد (New)</option>
                    <option value="باقي">باقي (Remaining)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    المرحلة الدراسية
                  </label>
                  <select
                    value={formData.stage || ''}
                    onChange={(e) => {
                      const st = stages.find(s => s.name === e.target.value);
                      setFormData({
                        ...formData,
                        stage: e.target.value,
                        grade: st?.grades[0]?.name || '',
                        classroom: st?.grades[0]?.classrooms[0] || '1/1',
                      });
                    }}
                    className="w-full text-xs bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-800 focus:outline-hidden focus:border-[#008e8b]"
                  >
                    {stages.map(st => (
                      <option key={st.id} value={st.name}>{st.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    الصف الدراسي <span className="text-rose-500">*</span>
                  </label>
                  <select
                    required
                    value={formData.grade || ''}
                    onChange={(e) => {
                      const selectedGradeName = e.target.value;
                      const foundStage = (stages || []).find(s => (s.grades || []).some(g => g.name === selectedGradeName));
                      const grObj = foundStage?.grades?.find(g => g.name === selectedGradeName);
                      setFormData({
                        ...formData,
                        grade: selectedGradeName,
                        classroom: grObj?.classrooms?.[0] || '1/1',
                      });
                    }}
                    className="w-full text-xs bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-800 focus:outline-hidden focus:border-[#008e8b]"
                  >
                    <option value="">— اختر الصف الدراسي —</option>
                    {((stages || []).find(s => s.name === formData.stage)?.grades || (stages || []).flatMap(s => s.grades || [])).map(g => (
                      <option key={g.id} value={g.name}>{g.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    الفصل / الشعبة <span className="text-rose-500">*</span>
                  </label>
                  <select
                    required
                    value={formData.classroom || ''}
                    onChange={(e) => setFormData({ ...formData, classroom: e.target.value })}
                    className="w-full text-xs bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-800 focus:outline-hidden focus:border-[#008e8b]"
                  >
                    <option value="">— اختر الفصل —</option>
                    {(() => {
                      const currentStage = (stages || []).find(s => s.name === formData.stage);
                      const currentGrade = currentStage?.grades?.find(g => g.name === formData.grade) || (stages || []).flatMap(s => s.grades || []).find(g => g.name === formData.grade);
                      const classList = currentGrade?.classrooms || ['1/1', '1/2', '2/1', '2/2', '3/1', '3/2'];
                      return classList.map(c => (
                        <option key={c} value={c}>{c}</option>
                      ));
                    })()}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">حالة الحساب / النشاط</label>
                  <select
                    value={formData.status || 'نشط'}
                    disabled={!canEditStudent}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value as any })}
                    className="w-full text-xs bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-800 focus:outline-hidden focus:border-[#008e8b]"
                  >
                    <option value="نشط">نشط</option>
                    <option value="موقوف">موقوف</option>
                    <option value="منقول">منقول</option>
                    <option value="متخرج">متخرج</option>
                    <option value="غير نشط">غير نشط</option>
                  </select>
                </div>

                <div className="md:col-span-2 pt-2 border-t border-slate-200">
                  <h4 className="text-xs font-bold text-[#008e8b] mb-3">بيانات ولي الأمر والمتابعة</h4>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">اسم ولي الأمر</label>
                  <input
                    type="text"
                    value={formData.parentName || ''}
                    onChange={(e) => setFormData({ ...formData, parentName: e.target.value })}
                    placeholder="اسم ولي الأمر"
                    className="w-full text-xs bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-800 focus:outline-hidden focus:border-[#008e8b]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">صلة القرابة</label>
                  <select
                    value={formData.relationship || 'أب'}
                    onChange={(e) => setFormData({ ...formData, relationship: e.target.value })}
                    className="w-full text-xs bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-800 focus:outline-hidden focus:border-[#008e8b]"
                  >
                    <option value="أب">أب</option>
                    <option value="أم">أم</option>
                    <option value="وصي قانوني">وصي قانوني</option>
                    <option value="أخرى">أخرى</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">رقم هاتف ولي الأمر</label>
                  <input
                    type="text"
                    value={formData.parentPhone || ''}
                    onChange={(e) => setFormData({ ...formData, parentPhone: e.target.value })}
                    placeholder="010xxxxxxxx"
                    className="w-full text-xs font-mono bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-800 focus:outline-hidden focus:border-[#008e8b]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">هاتف الطالب إن وجد</label>
                  <input
                    type="text"
                    value={formData.phone || ''}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    placeholder="01xxxxxxxxx"
                    className="w-full text-xs font-mono bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-800 focus:outline-hidden focus:border-[#008e8b]"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-xs font-bold text-slate-700 mb-1">العنوان السكني</label>
                  <input
                    type="text"
                    value={formData.address || ''}
                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                    placeholder="العنوان بالتفصيل"
                    className="w-full text-xs bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-800 focus:outline-hidden focus:border-[#008e8b]"
                  />
                </div>
              </div>

              <div className="pt-4 border-t border-slate-200 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsFormModalOpen(false)}
                  className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-xl text-xs font-bold cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={managementAction !== null}
                  className="px-6 py-2 bg-[#008e8b] hover:bg-teal-700 text-white rounded-xl text-xs font-bold shadow-md cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {managementAction === 'create-student' || managementAction === 'update-student'
                    ? 'جارٍ الحفظ...'
                    : 'حفظ بيانات الطالب'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Profile Modal */}
      {isProfileModalOpen && selectedStudentForProfile && (
        <StudentProfileModal
          isOpen={isProfileModalOpen}
          student={selectedStudentForProfile}
          onClose={() => {
            setIsProfileModalOpen(false);
            setSelectedStudentForProfile(null);
          }}
          onEdit={(student) => handleOpenEdit(student)}
        />
      )}

      {/* Import Modal */}
      {isImportModalOpen && (
        <ImportWizardModal
          isOpen={isImportModalOpen}
          defaultMode="students"
          onClose={() => setIsImportModalOpen(false)}
          onImportComplete={reloadStudents}
        />
      )}

      {/* Promotion Wizard Modal */}
      {isPromotionWizardOpen && (
        <StudentPromotionWizard
          isOpen={isPromotionWizardOpen}
          onClose={() => setIsPromotionWizardOpen(false)}
          onSuccess={() => {
            reloadStudents();
            setIsPromotionWizardOpen(false);
          }}
        />
      )}
    </div>
  );
};
