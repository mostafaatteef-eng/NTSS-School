import React, { useState, useEffect } from 'react';
import {
  UserCheck,
  AlertTriangle,
  FileSpreadsheet,
  Printer,
  Search,
  Plus,
  Trash2,
  Edit2,
  Clock,
  Shield,
  Layers,
  CheckCircle2,
} from 'lucide-react';
import { TeacherLoadCalculation, TeacherTeachingAssignment, Employee } from '../../types';
import { timetableService } from '../../services/timetableService';
import * as XLSX from 'xlsx';

export const TeacherLoadView: React.FC = () => {
  const [loadList, setLoadList] = useState<TeacherLoadCalculation[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<'ALL' | 'AVAILABLE' | 'FULL' | 'OVERLOAD'>('ALL');
  const [selectedTeacherForAssignments, setSelectedTeacherForAssignments] = useState<TeacherLoadCalculation | null>(null);
  const [assignments, setAssignments] = useState<TeacherTeachingAssignment[]>([]);

  // Add Assignment state
  const [newSubject, setNewSubject] = useState('');
  const [newClassroom, setNewClassroom] = useState('1/1');
  const [newPeriods, setNewPeriods] = useState<number>(4);

  const loadData = () => {
    const list = timetableService.getAllTeachersLoadCalculations();
    setLoadList(list);
  };

  useEffect(() => {
    loadData();
  }, []);

  const openAssignmentsModal = (teacherLoad: TeacherLoadCalculation) => {
    setSelectedTeacherForAssignments(teacherLoad);
    const existing = timetableService.getTeacherAssignments(teacherLoad.teacherId);
    setAssignments(existing);
  };

  const handleAddAssignment = () => {
    if (!selectedTeacherForAssignments || !newSubject.trim()) return;

    const newAssign: TeacherTeachingAssignment = {
      id: `TTA-${Date.now()}`,
      teacherId: selectedTeacherForAssignments.teacherId,
      teacherCode: selectedTeacherForAssignments.teacherCode,
      teacherName: selectedTeacherForAssignments.teacherName,
      subjectId: `SUB-${Date.now()}`,
      subjectName: newSubject.trim(),
      gradeId: newClassroom.startsWith('1') ? 'G1' : newClassroom.startsWith('2') ? 'G2' : 'G3',
      gradeName: newClassroom.startsWith('1') ? 'الصف الأول الثانوي' : newClassroom.startsWith('2') ? 'الصف الثاني الثانوي' : 'الصف الثالث الثانوي',
      classroomId: newClassroom,
      classroomName: newClassroom,
      requiredPeriodsPerWeek: Number(newPeriods) || 1,
      academicYearId: '2024/2025',
      termId: 'FIRST',
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    timetableService.saveTeacherAssignment(newAssign);
    const updated = timetableService.getTeacherAssignments(selectedTeacherForAssignments.teacherId);
    setAssignments(updated);
    setNewSubject('');
    loadData();
  };

  const handleDeleteAssignment = (assignmentId: string) => {
    if (!selectedTeacherForAssignments) return;
    timetableService.deleteTeacherAssignment(assignmentId);
    const updated = timetableService.getTeacherAssignments(selectedTeacherForAssignments.teacherId);
    setAssignments(updated);
    loadData();
  };

  const filteredList = loadList.filter(item => {
    const matchesSearch =
      item.teacherName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (item.teacherCode && item.teacherCode.toLowerCase().includes(searchQuery.toLowerCase()));

    if (!matchesSearch) return false;

    if (filterStatus === 'AVAILABLE') return item.loadStatus === 'AVAILABLE';
    if (filterStatus === 'FULL') return item.loadStatus === 'FULL' || item.loadStatus === 'NEAR_LIMIT';
    if (filterStatus === 'OVERLOAD') return item.loadStatus === 'OVERLOAD';
    return true;
  });

  const totalTeachers = loadList.length;
  const avgLoad = totalTeachers > 0 ? (loadList.reduce((sum, t) => sum + t.totalCountedPeriods, 0) / totalTeachers).toFixed(1) : '0';
  const overloadCount = loadList.filter(t => t.loadStatus === 'OVERLOAD').length;
  const fullCount = loadList.filter(t => t.loadStatus === 'FULL' || t.loadStatus === 'NEAR_LIMIT').length;

  const handleExportExcel = () => {
    const rows = filteredList.map(t => ({
      'كود المعلم': t.teacherCode || '',
      'اسم المعلم': t.teacherName,
      'النصاب المسند': t.assignedLoad,
      'الحصص المجدولة': t.scheduledBasePeriods,
      'احتياطي هذا الأسبوع': t.reservePeriodsThisWeek,
      'إجمالي النصاب المحتسب': t.totalCountedPeriods,
      'الحد الأقصى للنصاب': t.maxAllowedPeriods,
      'الطاقة المتبقية': t.remainingCapacity,
      'نوبات الإشراف': t.supervisionCountThisWeek,
      'رصيد الاحتياطي التراكمي': t.cumulativeReserveCount,
      الحالة:
        t.loadStatus === 'OVERLOAD'
          ? 'نصاب زائد'
          : t.loadStatus === 'FULL'
          ? 'مكتمل'
          : t.loadStatus === 'NEAR_LIMIT'
          ? 'قارب الحد'
          : 'متاح',
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'أنصبة المعلمين');
    XLSX.writeFile(wb, `أنصبة_المعلمين_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
        <div>
          <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <UserCheck className="w-6 h-6 text-indigo-600" />
            أنصبة المعلمين وسقف الساعات القانونية (30 حصة أسبوعياً)
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            متابعة النصاب الأساسي، حصص الاحتياطي، نوبات الإشراف، والطاقة المتبقية لكل معلم بدقة 25 ساعة = 1500 دقيقة
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleExportExcel}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-xl border border-emerald-200 transition"
          >
            <FileSpreadsheet className="w-4 h-4" />
            تصدير Excel
          </button>
          <button
            onClick={handlePrint}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl border border-slate-200 transition"
          >
            <Printer className="w-4 h-4" />
            طباعة
          </button>
        </div>
      </div>

      {/* KPI Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm text-center">
          <div className="text-3xl font-black text-slate-800">{totalTeachers}</div>
          <div className="text-xs font-semibold text-slate-500 mt-1">إجمالي المعلمين المتاحين</div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm text-center">
          <div className="text-3xl font-black text-indigo-600">{avgLoad}</div>
          <div className="text-xs font-semibold text-slate-500 mt-1">متوسط النصاب المحتسب (حصة/أسبوع)</div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm text-center">
          <div className="text-3xl font-black text-amber-600">{fullCount}</div>
          <div className="text-xs font-semibold text-slate-500 mt-1">معلمون قاربوا أو وصلوا للحد (30)</div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm text-center">
          <div className="text-3xl font-black text-rose-600">{overloadCount}</div>
          <div className="text-xs font-semibold text-slate-500 mt-1">معلمون في حالة نصاب زائد (Overload)</div>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 absolute right-3 top-3 text-slate-400" />
          <input
            type="text"
            placeholder="بحث بالاسم أو كود المعلم..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-3 pr-9 py-2 border border-slate-300 rounded-xl text-xs font-medium focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        <div className="inline-flex bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs font-semibold self-end">
          <button
            onClick={() => setFilterStatus('ALL')}
            className={`px-3 py-1.5 rounded-lg ${filterStatus === 'ALL' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-600'}`}
          >
            الكل ({loadList.length})
          </button>
          <button
            onClick={() => setFilterStatus('AVAILABLE')}
            className={`px-3 py-1.5 rounded-lg ${filterStatus === 'AVAILABLE' ? 'bg-white text-emerald-700 shadow-sm' : 'text-slate-600'}`}
          >
            متاح
          </button>
          <button
            onClick={() => setFilterStatus('FULL')}
            className={`px-3 py-1.5 rounded-lg ${filterStatus === 'FULL' ? 'bg-white text-amber-700 shadow-sm' : 'text-slate-600'}`}
          >
            قارب الحد
          </button>
          <button
            onClick={() => setFilterStatus('OVERLOAD')}
            className={`px-3 py-1.5 rounded-lg ${filterStatus === 'OVERLOAD' ? 'bg-white text-rose-700 shadow-sm' : 'text-slate-600'}`}
          >
            نصاب زائد
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs border-collapse">
            <thead className="bg-slate-100 text-slate-700 font-bold border-b">
              <tr>
                <th className="p-3">كود المعلم</th>
                <th className="p-3">اسم المعلم</th>
                <th className="p-3 text-center">المسند</th>
                <th className="p-3 text-center">المجدول</th>
                <th className="p-3 text-center">احتياطي الأسبوع</th>
                <th className="p-3 text-center">إجمالي المحتسب / 30</th>
                <th className="p-3 text-center">المتبقي</th>
                <th className="p-3 text-center">الإشراف</th>
                <th className="p-3 text-center">الرصيد التراكمي</th>
                <th className="p-3 text-center">الحالة</th>
                <th className="p-3 text-center">إسناد المواد</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-800">
              {filteredList.map(t => (
                <tr key={t.teacherId} className="hover:bg-slate-50 transition">
                  <td className="p-3 font-mono font-bold text-indigo-700">{t.teacherCode || '—'}</td>
                  <td className="p-3 font-bold text-slate-900">{t.teacherName}</td>
                  <td className="p-3 text-center font-semibold text-slate-600">{t.assignedLoad}</td>
                  <td className="p-3 text-center font-bold text-slate-800">{t.scheduledBasePeriods}</td>
                  <td className="p-3 text-center font-bold text-amber-700">{t.reservePeriodsThisWeek}</td>
                  <td className="p-3 text-center">
                    <div className="flex items-center justify-center gap-1.5">
                      <div className="w-16 bg-slate-200 rounded-full h-2 overflow-hidden">
                        <div
                          className={`h-full ${
                            t.loadStatus === 'OVERLOAD'
                              ? 'bg-rose-600'
                              : t.loadStatus === 'FULL'
                              ? 'bg-amber-500'
                              : 'bg-indigo-600'
                          }`}
                          style={{ width: `${Math.min((t.totalCountedPeriods / 30) * 100, 100)}%` }}
                        />
                      </div>
                      <span className="font-mono font-bold">{t.totalCountedPeriods}</span>
                    </div>
                  </td>
                  <td className="p-3 text-center font-bold">
                    <span className={t.remainingCapacity <= 0 ? 'text-rose-600' : 'text-emerald-700'}>
                      {t.remainingCapacity}
                    </span>
                  </td>
                  <td className="p-3 text-center text-slate-600">{t.supervisionCountThisWeek}</td>
                  <td className="p-3 text-center font-mono font-semibold text-purple-700">{t.cumulativeReserveCount}</td>
                  <td className="p-3 text-center">
                    {t.loadStatus === 'OVERLOAD' && (
                      <span className="inline-block px-2 py-0.5 rounded bg-rose-100 text-rose-800 font-bold">
                        نصاب زائد (+{t.totalCountedPeriods - 30})
                      </span>
                    )}
                    {t.loadStatus === 'FULL' && (
                      <span className="inline-block px-2 py-0.5 rounded bg-amber-100 text-amber-800 font-bold">مكتمل (30)</span>
                    )}
                    {t.loadStatus === 'NEAR_LIMIT' && (
                      <span className="inline-block px-2 py-0.5 rounded bg-amber-50 text-amber-700 font-bold">قارب الحد</span>
                    )}
                    {t.loadStatus === 'AVAILABLE' && (
                      <span className="inline-block px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 font-bold">متاح</span>
                    )}
                  </td>
                  <td className="p-3 text-center">
                    <button
                      onClick={() => openAssignmentsModal(t)}
                      className="px-2.5 py-1 text-[11px] font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition"
                    >
                      إدارة الإسناد
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Teacher Teaching Assignments Modal */}
      {selectedTeacherForAssignments && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" dir="rtl">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl border border-slate-100 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b pb-3">
              <div>
                <h3 className="font-bold text-base text-slate-800 flex items-center gap-2">
                  <Layers className="w-5 h-5 text-indigo-600" />
                  إسناد المواد والفصول: {selectedTeacherForAssignments.teacherName}
                </h3>
                <span className="text-xs text-slate-500 font-mono">
                  كود المعلم: {selectedTeacherForAssignments.teacherCode || '—'}
                </span>
              </div>
              <button
                onClick={() => setSelectedTeacherForAssignments(null)}
                className="text-slate-400 hover:text-slate-600 text-lg"
              >
                ✕
              </button>
            </div>

            {/* Add New Assignment Form */}
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
              <div className="text-xs font-bold text-slate-700">إضافة إسناد مادة وفصل جديد للمعلم:</div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">المادة</label>
                  <input
                    type="text"
                    value={newSubject}
                    onChange={e => setNewSubject(e.target.value)}
                    placeholder="اسم المادة..."
                    className="w-full border border-slate-300 rounded-lg p-2 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">الفصل</label>
                  <select
                    value={newClassroom}
                    onChange={e => setNewClassroom(e.target.value)}
                    className="w-full border border-slate-300 rounded-lg p-2 text-xs"
                  >
                    <option value="1/1">فصل 1/1</option>
                    <option value="1/2">فصل 1/2</option>
                    <option value="2/1">فصل 2/1</option>
                    <option value="2/2">فصل 2/2</option>
                    <option value="3/1">فصل 3/1</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">الحصص أسبوعياً</label>
                  <input
                    type="number"
                    min={1}
                    max={30}
                    value={newPeriods}
                    onChange={e => setNewPeriods(Number(e.target.value))}
                    className="w-full border border-slate-300 rounded-lg p-2 text-xs"
                  />
                </div>
              </div>
              <button
                onClick={handleAddAssignment}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition flex items-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                إضافة الإسناد
              </button>
            </div>

            {/* Existing Assignments Table */}
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <table className="w-full text-right text-xs">
                <thead className="bg-slate-100 text-slate-700 font-bold">
                  <tr>
                    <th className="p-2.5">المادة</th>
                    <th className="p-2.5">الصف / الفصل</th>
                    <th className="p-2.5 text-center">الحصص الأسبوعية</th>
                    <th className="p-2.5 text-center">حذف</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {assignments.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="p-4 text-center text-slate-400">
                        لا توجد مواد مسندة حالياً لهذا المعلم
                      </td>
                    </tr>
                  ) : (
                    assignments.map(a => (
                      <tr key={a.id} className="hover:bg-slate-50">
                        <td className="p-2.5 font-bold text-slate-800">{a.subjectName}</td>
                        <td className="p-2.5 text-slate-600">
                          {a.gradeName} - فصل {a.classroomName}
                        </td>
                        <td className="p-2.5 text-center font-bold text-indigo-600">{a.weeklyPeriods} حصة</td>
                        <td className="p-2.5 text-center">
                          <button
                            onClick={() => handleDeleteAssignment(a.id)}
                            className="text-rose-500 hover:text-rose-700 p-1"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setSelectedTeacherForAssignments(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-lg"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
