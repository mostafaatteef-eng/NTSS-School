import React, { useState, useEffect } from 'react';
import {
  BookOpen,
  CheckCircle2,
  AlertCircle,
  Clock,
  Printer,
  FileSpreadsheet,
  Layers,
  ArrowUpDown,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import { ClassroomCoverageReport } from '../../types';
import { timetableService } from '../../services/timetableService';
import { storageService } from '../../services/storageService';
import * as XLSX from 'xlsx';

export const CurriculumCoverageView: React.FC = () => {
  const [reports, setReports] = useState<ClassroomCoverageReport[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<string>('1/1');
  const [selectedGradeId, setSelectedGradeId] = useState<string>('G1');

  const availableClassrooms = ['1/1', '1/2', '2/1', '2/2', '3/1', '3/2'];

  const loadData = () => {
    // Generate coverage for each classroom
    const results = availableClassrooms.map(c => {
      const gId = c.startsWith('1') ? 'G1' : c.startsWith('2') ? 'G2' : 'G3';
      return timetableService.validateClassroomCurriculumCoverage(c, gId);
    });
    setReports(results);
  };

  useEffect(() => {
    loadData();
  }, []);

  const activeReport = reports.find(r => r.classroomId === selectedClassId) || reports[0];

  const handleExportExcel = () => {
    if (!activeReport) return;
    const rows = activeReport.subjectBreakdowns.map(s => ({
      المادة: s.subjectName,
      'النصاب الوزاري المقرر': s.requiredPeriods,
      'الحصص المجدولة فعلياً': s.scheduledPeriods,
      الفارق: s.difference,
      'نظام أسبوعين (A/B)': s.isBiWeekly ? 'نعم' : 'لا',
      الحالة: s.status === 'COMPLETE' ? 'مكتمل' : s.status === 'DEFICIT' ? 'عجز' : 'زيادة',
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `خطة_${activeReport.classroomName}`);
    XLSX.writeFile(wb, `مطابقة_الخطة_الدراسية_فصل_${activeReport.classroomName}.xlsx`);
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
            <BookOpen className="w-6 h-6 text-indigo-600" />
            مطابقة الخطة الدراسية والأنصبة الوزارية (39 حصة أسبوعياً)
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            مقارنة جدول الفصول بالخطة الدراسية المعتمدة لمدارس التكنولوجيا التطبيقية الصناعية ونظام الأسبوعين (A/B)
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
            طباعة الكشف
          </button>
        </div>
      </div>

      {/* Classroom Selector Pills */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        <span className="text-xs font-bold text-slate-600 ml-2">اختر الفصل:</span>
        {availableClassrooms.map(c => {
          const rep = reports.find(r => r.classroomId === c);
          const isComplete = rep?.status === 'COMPLETE';
          const isSelected = selectedClassId === c;

          return (
            <button
              key={c}
              onClick={() => setSelectedClassId(c)}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 border ${
                isSelected
                  ? 'bg-indigo-600 text-white border-indigo-600 shadow-md shadow-indigo-100'
                  : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
              }`}
            >
              <span>فصل {c}</span>
              {rep && (
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                    isComplete
                      ? isSelected
                        ? 'bg-indigo-500 text-white'
                        : 'bg-emerald-100 text-emerald-800'
                      : isSelected
                      ? 'bg-rose-500 text-white'
                      : 'bg-rose-100 text-rose-800'
                  }`}
                >
                  {rep.totalScheduledPeriods} / {rep.totalRequiredPeriods}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {activeReport && (
        <div className="space-y-6">
          {/* Summary KPIs */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm text-center">
              <div className="text-3xl font-black text-slate-800">{activeReport.totalRequiredPeriods}</div>
              <div className="text-xs font-semibold text-slate-500 mt-1">المستهدف الوزاري الأسبوعي</div>
              <span className="inline-block mt-2 text-[11px] font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-md">
                39 حصة أسبوعياً
              </span>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm text-center">
              <div className="text-3xl font-black text-indigo-600">{activeReport.totalScheduledPeriods}</div>
              <div className="text-xs font-semibold text-slate-500 mt-1">الحصص المجدولة بالجدول</div>
              <span className="inline-block mt-2 text-[11px] font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-md">
                شاملة الحصص التبادلية A/B
              </span>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm text-center">
              <div
                className={`text-3xl font-black ${
                  activeReport.difference === 0
                    ? 'text-emerald-600'
                    : activeReport.difference < 0
                    ? 'text-rose-600'
                    : 'text-amber-600'
                }`}
              >
                {activeReport.difference > 0 ? `+${activeReport.difference}` : activeReport.difference}
              </div>
              <div className="text-xs font-semibold text-slate-500 mt-1">فارق المطابقة الإجمالي</div>
              <span
                className={`inline-block mt-2 text-[11px] font-bold px-2 py-0.5 rounded-md ${
                  activeReport.difference === 0
                    ? 'bg-emerald-50 text-emerald-700'
                    : activeReport.difference < 0
                    ? 'bg-rose-50 text-rose-700'
                    : 'bg-amber-50 text-amber-700'
                }`}
              >
                {activeReport.difference === 0 ? 'مطابق تماماً' : activeReport.difference < 0 ? 'عجز بالحصص' : 'زيادة بالحصص'}
              </span>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm text-center">
              <div className="flex items-center justify-center gap-1.5 mt-1">
                {activeReport.status === 'COMPLETE' ? (
                  <CheckCircle2 className="w-8 h-8 text-emerald-600" />
                ) : (
                  <AlertCircle className="w-8 h-8 text-rose-600" />
                )}
              </div>
              <div className="text-xs font-semibold text-slate-500 mt-2">حالة اعتماد الخطة للفصل</div>
              <span
                className={`inline-block mt-1 text-xs font-black px-2.5 py-1 rounded-lg ${
                  activeReport.status === 'COMPLETE'
                    ? 'bg-emerald-100 text-emerald-800'
                    : 'bg-rose-100 text-rose-800'
                }`}
              >
                {activeReport.status === 'COMPLETE' ? 'معتمدة ومكتملة' : 'غير مكتملة (تتطلب استكمال الجدول)'}
              </span>
            </div>
          </div>

          {/* Breakdown Table */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="font-bold text-sm text-slate-800 flex items-center gap-2">
                <Layers className="w-4 h-4 text-indigo-600" />
                التوزيع التفصيلي لمواد فصل ({activeReport.classroomName}) مقارنة بالخطة الرسمية
              </h3>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs border-collapse">
                <thead className="bg-slate-100 text-slate-700 font-bold border-b">
                  <tr>
                    <th className="p-3">#</th>
                    <th className="p-3">المادة الدراسية</th>
                    <th className="p-3 text-center">المطلوب أسبوعياً</th>
                    <th className="p-3 text-center">المجدول بالجدول</th>
                    <th className="p-3 text-center">الفارق</th>
                    <th className="p-3 text-center">نظام الدورة</th>
                    <th className="p-3 text-center">الحالة</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-800">
                  {activeReport.subjectBreakdowns.map((sub, idx) => (
                    <tr
                      key={sub.subjectId}
                      className={`hover:bg-slate-50/70 transition ${
                        sub.status === 'DEFICIT' ? 'bg-rose-50/30' : sub.status === 'SURPLUS' ? 'bg-amber-50/30' : ''
                      }`}
                    >
                      <td className="p-3 font-mono text-slate-400">{idx + 1}</td>
                      <td className="p-3 font-bold text-slate-900">{sub.subjectName}</td>
                      <td className="p-3 text-center font-bold text-slate-700">{sub.requiredPeriods} حصة</td>
                      <td className="p-3 text-center font-bold text-indigo-700">{sub.scheduledPeriods} حصة</td>
                      <td className="p-3 text-center">
                        <span
                          className={`font-black ${
                            sub.difference === 0
                              ? 'text-emerald-600'
                              : sub.difference < 0
                              ? 'text-rose-600'
                              : 'text-amber-600'
                          }`}
                        >
                          {sub.difference > 0 ? `+${sub.difference}` : sub.difference}
                        </span>
                      </td>
                      <td className="p-3 text-center">
                        {sub.isBiWeekly ? (
                          <span className="inline-block px-2 py-0.5 rounded bg-purple-100 text-purple-800 text-[10px] font-bold">
                            دورة أسبوعين (حصة كل أسبوعين)
                          </span>
                        ) : (
                          <span className="text-slate-400">أسبوعي</span>
                        )}
                      </td>
                      <td className="p-3 text-center">
                        {sub.status === 'COMPLETE' && (
                          <span className="inline-flex items-center gap-1 text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded">
                            <CheckCircle2 className="w-3 h-3" /> مكتمل
                          </span>
                        )}
                        {sub.status === 'DEFICIT' && (
                          <span className="inline-flex items-center gap-1 text-rose-700 font-bold bg-rose-50 px-2 py-0.5 rounded">
                            <TrendingDown className="w-3 h-3" /> عجز ({Math.abs(sub.difference)})
                          </span>
                        )}
                        {sub.status === 'SURPLUS' && (
                          <span className="inline-flex items-center gap-1 text-amber-700 font-bold bg-amber-50 px-2 py-0.5 rounded">
                            <TrendingUp className="w-3 h-3" /> زيادة ({sub.difference})
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
