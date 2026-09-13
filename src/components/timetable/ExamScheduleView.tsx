import React, { useState, useEffect } from 'react';
import {
  Award,
  Calendar,
  Clock,
  Plus,
  Trash2,
  Edit2,
  CheckCircle2,
  Building,
  Printer,
  FileSpreadsheet,
  Globe,
  Lock,
} from 'lucide-react';
import { ExamSchedule, Employee } from '../../types';
import { timetableService } from '../../services/timetableService';
import * as XLSX from 'xlsx';

export const ExamScheduleView: React.FC = () => {
  const [exams, setExams] = useState<ExamSchedule[]>([]);
  const [selectedGrade, setSelectedGrade] = useState<string>('ALL');
  const [teachers, setTeachers] = useState<Employee[]>([]);

  // Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingExam, setEditingExam] = useState<Partial<ExamSchedule> | null>(null);

  const loadData = () => {
    setExams(timetableService.getExamSchedules());
    setTeachers(timetableService.getTeachingStaff());
  };

  useEffect(() => {
    loadData();
  }, []);

  const filteredExams = exams.filter(e => {
    if (selectedGrade !== 'ALL' && e.gradeName !== selectedGrade && e.gradeId !== selectedGrade) {
      return false;
    }
    return true;
  });

  const handleOpenAdd = () => {
    setEditingExam({
      academicYear: '2024/2025',
      term: 'FIRST',
      examType: 'MIDTERM',
      subjectName: '',
      gradeId: 'G1',
      gradeName: 'الصف الأول الثانوي',
      classroomId: '1/1',
      classroomName: '1/1',
      examDate: new Date().toISOString().split('T')[0],
      startTime: '09:00',
      durationMinutes: 90,
      roomName: 'قاعة الامتحانات الكبرى',
      status: 'DRAFT',
      instructions: 'الرجاء الحضور قبل موعد الامتحان بـ 15 دقيقة مصطحباً بطاقة الطالب والأدوات الهندسية.',
    });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (item: ExamSchedule) => {
    setEditingExam({ ...item });
    setIsModalOpen(true);
  };

  const handleSaveExam = () => {
    if (!editingExam || !editingExam.subjectName?.trim()) return;

    const examToSave: ExamSchedule = {
      id: editingExam.id || `EXM-${Date.now()}`,
      academicYearId: editingExam.academicYearId || editingExam.academicYear || '2024/2025',
      academicYear: editingExam.academicYear || '2024/2025',
      term: editingExam.term || 'FIRST',
      termId: editingExam.termId || 'FIRST',
      examType: editingExam.examType || 'MIDTERM',
      subjectId: editingExam.subjectId || `SUB-${Date.now()}`,
      subjectName: editingExam.subjectName.trim(),
      gradeId: editingExam.gradeId || 'G1',
      gradeName: editingExam.gradeName || 'الصف الأول الثانوي',
      classroomId: editingExam.classroomId,
      classroomName: editingExam.classroomName,
      date: editingExam.date || editingExam.examDate || new Date().toISOString().split('T')[0],
      examDate: editingExam.examDate || editingExam.date || new Date().toISOString().split('T')[0],
      startTime: editingExam.startTime || '09:00',
      durationMinutes: Number(editingExam.durationMinutes) || 90,
      roomName: editingExam.roomName || 'قاعة الامتحانات الكبرى',
      chiefInvigilatorId: editingExam.chiefInvigilatorId,
      chiefInvigilatorName: editingExam.chiefInvigilatorName,
      instructions: editingExam.instructions,
      status: editingExam.status || 'DRAFT',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    timetableService.saveExamSchedule(examToSave);
    setIsModalOpen(false);
    setEditingExam(null);
    loadData();
  };

  const handleToggleStatus = (exam: ExamSchedule, newStatus: 'DRAFT' | 'APPROVED' | 'PUBLISHED') => {
    const updated = { ...exam, status: newStatus, updatedAt: new Date().toISOString() };
    timetableService.saveExamSchedule(updated);
    loadData();
  };

  const handleDelete = (id: string) => {
    if (confirm('هل أنت متأكد من حذف هذا الامتحان من الجدول؟')) {
      timetableService.deleteExamSchedule(id);
      loadData();
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const handleExportExcel = () => {
    const rows = filteredExams.map(e => ({
      المادة: e.subjectName,
      نوع_الامتحان: e.examType,
      الصف: e.gradeName,
      الفصل: e.classroomName || 'جميع الفصول',
      التاريخ: e.examDate,
      وقت_البدء: e.startTime,
      المدة_بالدقائق: e.durationMinutes,
      القاعة: e.roomName,
      الحالة: e.status,
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'جدول الامتحانات');
    XLSX.writeFile(wb, `جدول_الامتحانات_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  return (
    <div className="space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
        <div>
          <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <Award className="w-6 h-6 text-indigo-600" />
            جدول الامتحانات والاختبارات المدرسية
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            إدارة اختبارات نصف الفصل، والامتحانات العملية والنهائية ونشرها على بوابات المعلمين والطلاب
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
          <button
            onClick={handleOpenAdd}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-sm transition mr-2"
          >
            <Plus className="w-4 h-4" />
            إضافة موعد امتحان
          </button>
        </div>
      </div>

      {/* Grade Selector */}
      <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 flex items-center gap-3">
        <span className="text-xs font-bold text-slate-700">تصفية حسب الصف:</span>
        <select
          value={selectedGrade}
          onChange={e => setSelectedGrade(e.target.value)}
          className="bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-xs font-medium focus:ring-2 focus:ring-indigo-500"
        >
          <option value="ALL">جميع الصفوف الدراسية</option>
          <option value="الصف الأول الثانوي">الصف الأول الثانوي</option>
          <option value="الصف الثاني الثانوي">الصف الثاني الثانوي</option>
          <option value="الصف الثالث الثانوي">الصف الثالث الثانوي</option>
        </select>
      </div>

      {/* Exams Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs border-collapse">
            <thead className="bg-slate-100 text-slate-700 font-bold border-b">
              <tr>
                <th className="p-3">المادة</th>
                <th className="p-3">نوع الامتحان</th>
                <th className="p-3">الصف / الفصل</th>
                <th className="p-3">التاريخ</th>
                <th className="p-3 text-center">التوقيت</th>
                <th className="p-3 text-center">المدة</th>
                <th className="p-3">المقر / القاعة</th>
                <th className="p-3 text-center">الحالة والنشر</th>
                <th className="p-3 text-center">الإجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-800">
              {filteredExams.length === 0 ? (
                <tr>
                  <td colSpan={9} className="p-8 text-center text-slate-400">
                    لا توجد مواعيد امتحانات مجدولة حتى الآن
                  </td>
                </tr>
              ) : (
                filteredExams.map(exam => (
                  <tr key={exam.id} className="hover:bg-slate-50 transition">
                    <td className="p-3 font-bold text-slate-900">{exam.subjectName}</td>
                    <td className="p-3">
                      <span className="inline-block px-2 py-0.5 rounded text-[11px] font-bold bg-indigo-50 text-indigo-700">
                        {exam.examType === 'MIDTERM'
                          ? 'نصف الفصل'
                          : exam.examType === 'FINAL'
                          ? 'نهاية الفصل'
                          : exam.examType === 'PRACTICAL'
                          ? 'عملي / معامل'
                          : exam.examType === 'ORAL'
                          ? 'شفوي'
                          : 'اختبار شهري'}
                      </span>
                    </td>
                    <td className="p-3 text-slate-700">
                      {exam.gradeName} {exam.classroomName ? `(${exam.classroomName})` : ''}
                    </td>
                    <td className="p-3 font-mono font-medium">{exam.examDate}</td>
                    <td className="p-3 text-center font-mono font-bold text-slate-800">{exam.startTime}</td>
                    <td className="p-3 text-center">{exam.durationMinutes} دقيقة</td>
                    <td className="p-3 text-slate-600">{exam.roomName}</td>
                    <td className="p-3 text-center">
                      <div className="inline-flex items-center gap-1.5">
                        {exam.status === 'PUBLISHED' && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                            <Globe className="w-3 h-3" /> منشور للطلاب
                          </span>
                        )}
                        {exam.status === 'APPROVED' && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-indigo-100 text-indigo-800">
                            <CheckCircle2 className="w-3 h-3" /> معتمد
                          </span>
                        )}
                        {exam.status === 'DRAFT' && (
                          <span className="inline-block px-2.5 py-1 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600">
                            مسودة
                          </span>
                        )}

                        {/* Status cycle button */}
                        <button
                          onClick={() => {
                            const next =
                              exam.status === 'DRAFT'
                                ? 'APPROVED'
                                : exam.status === 'APPROVED'
                                ? 'PUBLISHED'
                                : 'DRAFT';
                            handleToggleStatus(exam, next);
                          }}
                          title="تغيير حالة الاعتماد / النشر"
                          className="text-[10px] text-indigo-600 hover:underline mr-1 font-bold"
                        >
                          تغيير
                        </button>
                      </div>
                    </td>
                    <td className="p-3 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => handleOpenEdit(exam)}
                          className="text-slate-400 hover:text-indigo-600 p-1"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDelete(exam.id)}
                          className="text-slate-400 hover:text-rose-600 p-1"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit / Add Modal */}
      {isModalOpen && editingExam && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" dir="rtl">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-100 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="font-bold text-base text-slate-800">
                {editingExam.id ? 'تعديل موعد امتحان' : 'إضافة موعد امتحان جديد'}
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600 text-lg">
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">المادة الدراسية</label>
                <input
                  type="text"
                  value={editingExam.subjectName || ''}
                  onChange={e => setEditingExam({ ...editingExam, subjectName: e.target.value })}
                  placeholder="اسم المادة..."
                  className="w-full border border-slate-300 rounded-lg p-2 text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">نوع الامتحان</label>
                  <select
                    value={editingExam.examType}
                    onChange={e => setEditingExam({ ...editingExam, examType: e.target.value as any })}
                    className="w-full border border-slate-300 rounded-lg p-2 text-xs"
                  >
                    <option value="MIDTERM">اختبار نصف الفصل الدراسي</option>
                    <option value="FINAL">امتحان نهاية الفصل الدراسي</option>
                    <option value="PRACTICAL">امتحان عملي / تقييم جدارات</option>
                    <option value="ORAL">امتحان شفوي</option>
                    <option value="QUIZ">اختبار شهري دوري</option>
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">الصف الدراسي</label>
                  <select
                    value={editingExam.gradeName}
                    onChange={e =>
                      setEditingExam({
                        ...editingExam,
                        gradeName: e.target.value,
                        gradeId: e.target.value.includes('الأول') ? 'G1' : e.target.value.includes('الثاني') ? 'G2' : 'G3',
                      })
                    }
                    className="w-full border border-slate-300 rounded-lg p-2 text-xs"
                  >
                    <option value="الصف الأول الثانوي">الصف الأول الثانوي</option>
                    <option value="الصف الثاني الثانوي">الصف الثاني الثانوي</option>
                    <option value="الصف الثالث الثانوي">الصف الثالث الثانوي</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">تاريخ الامتحان</label>
                  <input
                    type="date"
                    value={editingExam.examDate || ''}
                    onChange={e => setEditingExam({ ...editingExam, examDate: e.target.value })}
                    className="w-full border border-slate-300 rounded-lg p-2 text-xs"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">وقت البدء</label>
                  <input
                    type="time"
                    value={editingExam.startTime || '09:00'}
                    onChange={e => setEditingExam({ ...editingExam, startTime: e.target.value })}
                    className="w-full border border-slate-300 rounded-lg p-2 text-xs"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">المدة (بالدقائق)</label>
                  <input
                    type="number"
                    value={editingExam.durationMinutes || 90}
                    onChange={e => setEditingExam({ ...editingExam, durationMinutes: Number(e.target.value) })}
                    className="w-full border border-slate-300 rounded-lg p-2 text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">القاعة / مقر اللجنة</label>
                <input
                  type="text"
                  value={editingExam.roomName || ''}
                  onChange={e => setEditingExam({ ...editingExam, roomName: e.target.value })}
                  placeholder="قاعة الامتحانات الكبرى"
                  className="w-full border border-slate-300 rounded-lg p-2 text-xs"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">تعليمات للطلاب</label>
                <textarea
                  value={editingExam.instructions || ''}
                  onChange={e => setEditingExam({ ...editingExam, instructions: e.target.value })}
                  rows={2}
                  className="w-full border border-slate-300 rounded-lg p-2 text-xs"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">حالة الامتحان</label>
                <select
                  value={editingExam.status}
                  onChange={e => setEditingExam({ ...editingExam, status: e.target.value as any })}
                  className="w-full border border-slate-300 rounded-lg p-2 text-xs"
                >
                  <option value="DRAFT">مسودة (غير معتمد)</option>
                  <option value="APPROVED">معتمد (جاهز للنشر)</option>
                  <option value="PUBLISHED">منشور رسمياً على بوابات المعلمين والطلاب</option>
                </select>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t pt-3">
              <button
                onClick={() => setIsModalOpen(false)}
                className="px-4 py-2 text-xs text-slate-600 hover:text-slate-800"
              >
                إلغاء
              </button>
              <button
                onClick={handleSaveExam}
                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold shadow-sm"
              >
                حفظ موعد الامتحان
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
