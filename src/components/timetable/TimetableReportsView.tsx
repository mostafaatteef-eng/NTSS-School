import React, { useState, useEffect } from 'react';
import {
  FileText,
  Printer,
  FileSpreadsheet,
  Layers,
  BookOpen,
  UserCheck,
  Award,
  Shield,
  Clock,
  AlertTriangle,
  Search,
} from 'lucide-react';
import { timetableService } from '../../services/timetableService';
import { storageService } from '../../services/storageService';
import * as XLSX from 'xlsx';

export const TimetableReportsView: React.FC = () => {
  const [activeReportTab, setActiveReportTab] = useState<
    'coverage' | 'loads' | 'assignments' | 'reserve_fairness' | 'supervision' | 'conflicts'
  >('coverage');

  const [teacherLoads, setTeacherLoads] = useState<any[]>([]);
  const [fairnessList, setFairnessList] = useState<any[]>([]);
  const [supervisionList, setSupervisionList] = useState<any[]>([]);
  const [allAssignments, setAllAssignments] = useState<any[]>([]);
  const [conflictReport, setConflictReport] = useState<any[]>([]);
  const [coverageData, setCoverageData] = useState<any[]>([]);

  const loadAll = () => {
    setTeacherLoads(timetableService.getAllTeachersLoadCalculations());
    setFairnessList(timetableService.getReserveFairnessReport());
    setSupervisionList(timetableService.getSupervisionAssignments());
    setAllAssignments(timetableService.getAllTeacherAssignments());

    const schedule = storageService.getSchedule();
    const classrooms = ['1/1', '1/2', '2/1', '2/2', '3/1', '3/2'];
    const covs = classrooms.map(c => {
      const gId = c.startsWith('1') ? 'G1' : c.startsWith('2') ? 'G2' : 'G3';
      return timetableService.validateClassroomCurriculumCoverage(c, gId);
    });
    setCoverageData(covs);

    // Detect all conflicts across the schedule
    const conflicts: any[] = [];
    schedule.forEach(item => {
      const val = timetableService.validateScheduleConflicts(item, schedule, { ignoreSelfId: item.id });
      if (val.hasConflict) {
        conflicts.push({
          item,
          reasons: val.conflicts,
        });
      }
    });
    setConflictReport(conflicts);
  };

  useEffect(() => {
    loadAll();
  }, []);

  const handlePrint = () => {
    window.print();
  };

  const handleExportExcel = () => {
    let wsData: any[] = [];
    let sheetName = 'تقرير';

    if (activeReportTab === 'coverage') {
      sheetName = 'مطابقة_الخطة';
      coverageData.forEach(rep => {
        rep.subjectBreakdowns.forEach((s: any) => {
          wsData.push({
            الفصل: rep.classroomName,
            المادة: s.subjectName,
            المطلوب_أسبوعيا: s.requiredPeriods,
            المجدول_فعليا: s.scheduledPeriods,
            الفارق: s.difference,
            الحالة: s.status,
          });
        });
      });
    } else if (activeReportTab === 'loads') {
      sheetName = 'أنصبة_المعلمين';
      wsData = teacherLoads.map(t => ({
        كود_المعلم: t.teacherCode,
        اسم_المعلم: t.teacherName,
        النصاب_المسند: t.assignedLoad,
        المجدول_أساسي: t.scheduledBasePeriods,
        احتياطي_الأسبوع: t.reservePeriodsThisWeek,
        إجمالي_المحتسب: t.totalCountedPeriods,
        المتبقي: t.remainingCapacity,
        الحالة: t.loadStatus,
      }));
    } else if (activeReportTab === 'reserve_fairness') {
      sheetName = 'عدالة_الاحتياطي';
      wsData = fairnessList.map(f => ({
        كود_المعلم: f.teacherCode,
        اسم_المعلم: f.teacherName,
        الأسبوع: f.weeklyCount,
        الشهر: f.monthlyCount,
        الترم: f.termCount,
        السنوي: f.annualCount,
        مؤشر_العدالة: f.fairnessIndicator,
      }));
    } else if (activeReportTab === 'supervision') {
      sheetName = 'سجل_الإشراف';
      wsData = supervisionList.map(s => ({
        التاريخ: s.date,
        اليوم: s.dayOfWeek,
        الفترة: s.shift,
        الموقع: s.locationName,
        المشرف: s.teacherName,
        كود_المعلم: s.teacherCode,
      }));
    } else if (activeReportTab === 'conflicts') {
      sheetName = 'تعارضات_الجدول';
      wsData = conflictReport.map(c => ({
        اليوم: c.item.dayOfWeek,
        الحصة: c.item.periodNumber,
        الفصل: c.item.classroom,
        المعلم: c.item.teacherName,
        المادة: c.item.subject,
        التعارض: c.reasons.join(' | '),
      }));
    }

    const ws = XLSX.utils.json_to_sheet(wsData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    XLSX.writeFile(wb, `${sheetName}_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  return (
    <div className="space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
        <div>
          <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <FileText className="w-6 h-6 text-indigo-600" />
            مركز تقارير وإحصائيات الجدول المدرسي
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            كشوف مطابقة الخطة الوزارية (39 حصة)، أنصبة المعلمين، عدالة الاحتياطي، والإشراف والتعارضات
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

      {/* Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        <button
          onClick={() => setActiveReportTab('coverage')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 border ${
            activeReportTab === 'coverage'
              ? 'bg-indigo-600 text-white border-indigo-600 shadow-md'
              : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
          }`}
        >
          <BookOpen className="w-3.5 h-3.5" />
          تقرير مطابقة الخطة (39 حصة)
        </button>

        <button
          onClick={() => setActiveReportTab('loads')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 border ${
            activeReportTab === 'loads'
              ? 'bg-indigo-600 text-white border-indigo-600 shadow-md'
              : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
          }`}
        >
          <UserCheck className="w-3.5 h-3.5" />
          تقرير أنصبة وسقف الساعات (30 حصة)
        </button>

        <button
          onClick={() => setActiveReportTab('reserve_fairness')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 border ${
            activeReportTab === 'reserve_fairness'
              ? 'bg-indigo-600 text-white border-indigo-600 shadow-md'
              : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
          }`}
        >
          <Award className="w-3.5 h-3.5" />
          تقرير عدالة توزيع الاحتياطي
        </button>

        <button
          onClick={() => setActiveReportTab('supervision')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 border ${
            activeReportTab === 'supervision'
              ? 'bg-indigo-600 text-white border-indigo-600 shadow-md'
              : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
          }`}
        >
          <Shield className="w-3.5 h-3.5" />
          تقرير الإشراف المدرسي
        </button>

        <button
          onClick={() => setActiveReportTab('conflicts')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 border ${
            activeReportTab === 'conflicts'
              ? 'bg-indigo-600 text-white border-indigo-600 shadow-md'
              : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
          }`}
        >
          <AlertTriangle className="w-3.5 h-3.5" />
          تقرير التعارضات ({conflictReport.length})
        </button>
      </div>

      {/* REPORT CONTENT */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden p-5">
        {/* Coverage Report */}
        {activeReportTab === 'coverage' && (
          <div className="space-y-4">
            <h3 className="font-bold text-sm text-slate-800">تقرير مطابقة الخطة الدراسية لجميع فصول المدرسة</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs border-collapse">
                <thead className="bg-slate-100 text-slate-700 font-bold border-b">
                  <tr>
                    <th className="p-3">الفصل</th>
                    <th className="p-3">المستهدف الوزاري</th>
                    <th className="p-3">المجدول فعلياً</th>
                    <th className="p-3">الفارق الإجمالي</th>
                    <th className="p-3">الحالة</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {coverageData.map(c => (
                    <tr key={c.classroomId} className="hover:bg-slate-50">
                      <td className="p-3 font-bold text-slate-900">فصل {c.classroomName}</td>
                      <td className="p-3 text-slate-600">{c.totalRequiredPeriods} حصة</td>
                      <td className="p-3 font-bold text-indigo-700">{c.totalScheduledPeriods} حصة</td>
                      <td className="p-3 font-bold">
                        <span className={c.difference === 0 ? 'text-emerald-600' : 'text-rose-600'}>
                          {c.difference > 0 ? `+${c.difference}` : c.difference}
                        </span>
                      </td>
                      <td className="p-3">
                        <span
                          className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${
                            c.status === 'COMPLETE'
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-rose-100 text-rose-800'
                          }`}
                        >
                          {c.status === 'COMPLETE' ? 'مطابق ومعتمد' : 'عجز في الخطة'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Loads Report */}
        {activeReportTab === 'loads' && (
          <div className="space-y-4">
            <h3 className="font-bold text-sm text-slate-800">تقرير أنصبة المعلمين الأسبوعية وسقف الـ 30 حصة</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs border-collapse">
                <thead className="bg-slate-100 text-slate-700 font-bold border-b">
                  <tr>
                    <th className="p-3">كود المعلم</th>
                    <th className="p-3">اسم المعلم</th>
                    <th className="p-3 text-center">المسند</th>
                    <th className="p-3 text-center">المجدول الأساسي</th>
                    <th className="p-3 text-center">احتياطي الأسبوع</th>
                    <th className="p-3 text-center">المحتسب / 30</th>
                    <th className="p-3 text-center">المتبقي</th>
                    <th className="p-3 text-center">الحالة</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {teacherLoads.map(t => (
                    <tr key={t.teacherId} className="hover:bg-slate-50">
                      <td className="p-3 font-mono font-bold text-indigo-700">{t.teacherCode}</td>
                      <td className="p-3 font-bold text-slate-900">{t.teacherName}</td>
                      <td className="p-3 text-center">{t.assignedLoad}</td>
                      <td className="p-3 text-center font-bold">{t.scheduledBasePeriods}</td>
                      <td className="p-3 text-center text-amber-700 font-bold">{t.reservePeriodsThisWeek}</td>
                      <td className="p-3 text-center font-mono font-bold">{t.totalCountedPeriods}</td>
                      <td className="p-3 text-center font-bold text-emerald-700">{t.remainingCapacity}</td>
                      <td className="p-3 text-center">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            t.loadStatus === 'OVERLOAD'
                              ? 'bg-rose-100 text-rose-800'
                              : t.loadStatus === 'FULL'
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-emerald-50 text-emerald-700'
                          }`}
                        >
                          {t.loadStatus === 'OVERLOAD' ? 'نصاب زائد' : t.loadStatus === 'FULL' ? 'مكتمل' : 'متاح'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Reserve Fairness Report */}
        {activeReportTab === 'reserve_fairness' && (
          <div className="space-y-4">
            <h3 className="font-bold text-sm text-slate-800">تقرير مؤشر عدالة توزيع حصص الاحتياطي التراكمي</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs border-collapse">
                <thead className="bg-slate-100 text-slate-700 font-bold border-b">
                  <tr>
                    <th className="p-3">كود المعلم</th>
                    <th className="p-3">اسم المعلم</th>
                    <th className="p-3 text-center">الأسبوع</th>
                    <th className="p-3 text-center">الشهر</th>
                    <th className="p-3 text-center">الترم</th>
                    <th className="p-3 text-center">الرصيد التراكمي السنوي</th>
                    <th className="p-3 text-center">مؤشر التكافؤ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {fairnessList.map(f => (
                    <tr key={f.teacherId} className="hover:bg-slate-50">
                      <td className="p-3 font-mono font-bold text-indigo-700">{f.teacherCode}</td>
                      <td className="p-3 font-bold text-slate-900">{f.teacherName}</td>
                      <td className="p-3 text-center">{f.weeklyCount}</td>
                      <td className="p-3 text-center">{f.monthlyCount}</td>
                      <td className="p-3 text-center font-bold text-indigo-700">{f.termCount}</td>
                      <td className="p-3 text-center font-bold text-purple-700">{f.annualCount}</td>
                      <td className="p-3 text-center">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700">
                          {f.fairnessIndicator === 'ABOVE_AVERAGE'
                            ? 'أعلى من المتوسط'
                            : f.fairnessIndicator === 'BELOW_AVERAGE'
                            ? 'أقل من المتوسط'
                            : 'متوسط متوازن'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Supervision Report */}
        {activeReportTab === 'supervision' && (
          <div className="space-y-4">
            <h3 className="font-bold text-sm text-slate-800">سجل تكليفات الإشراف المدرسي المسجلة</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs border-collapse">
                <thead className="bg-slate-100 text-slate-700 font-bold border-b">
                  <tr>
                    <th className="p-3">التاريخ</th>
                    <th className="p-3">اليوم</th>
                    <th className="p-3">الموقع</th>
                    <th className="p-3">المشرف</th>
                    <th className="p-3">الفترة / النوبة</th>
                    <th className="p-3">التوقيت</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {supervisionList.map(s => (
                    <tr key={s.id} className="hover:bg-slate-50">
                      <td className="p-3 font-mono">{s.date}</td>
                      <td className="p-3">{s.dayOfWeek}</td>
                      <td className="p-3 font-bold">{s.locationName}</td>
                      <td className="p-3 text-slate-900">
                        {s.teacherName} ({s.teacherCode})
                      </td>
                      <td className="p-3">{s.shift}</td>
                      <td className="p-3 font-mono">{s.timeSlot}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Conflicts Report */}
        {activeReportTab === 'conflicts' && (
          <div className="space-y-4">
            <h3 className="font-bold text-sm text-slate-800">سجل التعارضات وتجاوزات الحصص المكتشفة بالجدول</h3>
            {conflictReport.length === 0 ? (
              <div className="p-8 text-center text-emerald-600 font-bold text-xs bg-emerald-50 rounded-xl">
                ✓ الجدول خالٍ تماماً من أي تعارضات (معلمين، فصول، قاعات، أو أوقات فسح)!
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-right text-xs border-collapse">
                  <thead className="bg-slate-100 text-slate-700 font-bold border-b">
                    <tr>
                      <th className="p-3">اليوم</th>
                      <th className="p-3">الحصة</th>
                      <th className="p-3">الفصل</th>
                      <th className="p-3">المادة</th>
                      <th className="p-3">المعلم</th>
                      <th className="p-3">أسباب التعارض</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {conflictReport.map((c, i) => (
                      <tr key={i} className="hover:bg-rose-50/50 bg-rose-50/20">
                        <td className="p-3 font-bold">{c.item.dayOfWeek}</td>
                        <td className="p-3 font-bold text-indigo-700">الحصة {c.item.periodNumber}</td>
                        <td className="p-3">{c.item.classroom}</td>
                        <td className="p-3 font-medium">{c.item.subject}</td>
                        <td className="p-3">{c.item.teacherName}</td>
                        <td className="p-3 text-rose-600 font-semibold">{c.reasons.join(' | ')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
