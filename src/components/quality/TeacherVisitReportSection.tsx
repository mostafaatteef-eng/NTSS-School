import React, { useState } from 'react';
import {
  TeacherVisitReport,
  QualityStandard,
  StandardScore,
  User,
  VisitType,
} from '../../types';
import { storageService } from '../../services/storageService';
import {
  UserCheck,
  Plus,
  Calendar,
  CheckCircle2,
  Clock,
  Send,
  Eye,
  Trash2,
  Award,
  Sparkles,
  BookOpen,
  GraduationCap,
  Filter,
} from 'lucide-react';

interface Props {
  currentUser: User | null;
  standards: QualityStandard[];
  reports: TeacherVisitReport[];
  onRefresh: () => void;
  canCreate: boolean;
  canApprove: boolean;
}

export const TeacherVisitReportSection: React.FC<Props> = ({
  currentUser,
  standards,
  reports,
  onRefresh,
  canCreate,
  canApprove,
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [viewingReport, setViewingReport] = useState<TeacherVisitReport | null>(null);

  // Filter states
  const [filterTeacher, setFilterTeacher] = useState<string>('ALL');

  // Teacher Visit standards
  const visitStandards = standards.filter(
    (s) => s.isActive && s.applicableTo?.includes('TEACHER_VISIT')
  );

  // Form states
  const [visitDate, setVisitDate] = useState(new Date().toISOString().split('T')[0]);
  const [periodNumber, setPeriodNumber] = useState<number>(1);
  const [visitType, setVisitType] = useState<VisitType>('DIAGNOSTIC');
  const [teacherId, setTeacherId] = useState('');
  const [teacherName, setTeacherName] = useState('');
  const [subject, setSubject] = useState('');
  const [grade, setGrade] = useState('');
  const [classroom, setClassroom] = useState('');
  const [lessonTopic, setLessonTopic] = useState('');
  const [strengths, setStrengths] = useState('');
  const [weaknesses, setWeaknesses] = useState('');
  const [recommendations, setRecommendations] = useState('');
  const [teacherFeedback, setTeacherFeedback] = useState('');
  const [scores, setScores] = useState<Record<string, { score: number; notes: string }>>({});

  // Teachers list from storage
  const allTeachers = storageService.getTeachers();

  const handleTeacherSelect = (tId: string) => {
    setTeacherId(tId);
    const found = allTeachers.find((t) => t.id === tId);
    if (found) {
      setTeacherName(found.name);
      if (found.specialization) setSubject(found.specialization);
    }
  };

  const handleOpenNew = () => {
    setViewingReport(null);
    setVisitDate(new Date().toISOString().split('T')[0]);
    setPeriodNumber(1);
    setVisitType('DIAGNOSTIC');
    setTeacherId('');
    setTeacherName('');
    setSubject('');
    setGrade('الصف الأول');
    setClassroom('1/1');
    setLessonTopic('');
    setStrengths('');
    setWeaknesses('');
    setRecommendations('');
    setTeacherFeedback('');

    const initScores: Record<string, { score: number; notes: string }> = {};
    visitStandards.forEach((s) => {
      initScores[s.id] = { score: s.evaluationScale || 4, notes: '' };
    });
    setScores(initScores);
    setIsModalOpen(true);
  };

  const handleScoreChange = (stdId: string, val: number) => {
    setScores((prev) => ({
      ...prev,
      [stdId]: {
        ...(prev[stdId] || { notes: '' }),
        score: val,
      },
    }));
  };

  const handleNotesChange = (stdId: string, txt: string) => {
    setScores((prev) => ({
      ...prev,
      [stdId]: {
        ...(prev[stdId] || { score: 4 }),
        notes: txt,
      },
    }));
  };

  const handleSaveVisit = (asDraft: boolean) => {
    if (!teacherName || !subject || !lessonTopic) {
      alert('يرجى تحديد المعلم، المادة، وموضوع الدرس.');
      return;
    }

    const standardScores: StandardScore[] = (
      Object.entries(scores) as [string, { score: number; notes: string }][]
    ).map(([stdId, data]) => {
      const std = standards.find((s) => s.id === stdId);
      return {
        standardId: stdId,
        standardCode: std?.code || '',
        score: data.score,
        maxScore: std?.evaluationScale || 4,
        weight: std?.weight || 10,
        notes: data.notes,
      };
    });

    const calcResult = storageService.calculateWeightedScore(standardScores, standards);

    const newReport: Partial<TeacherVisitReport> = {
      visitDate,
      periodNumber,
      visitType,
      visitorId: currentUser?.id || 'USR-01',
      visitorName: currentUser?.name || 'المشرف التربوي',
      visitorRole: currentUser?.role || 'QualityOfficer',
      teacherId,
      teacherName,
      subject,
      grade,
      classroom,
      lessonTopic,
      status: asDraft ? 'DRAFT' : 'SUBMITTED',
      standardScores,
      totalScore: calcResult.totalScore,
      earnedScore: calcResult.earnedScore,
      percentage: calcResult.percentage,
      strengths: strengths ? strengths.split('\n').filter(Boolean) : [],
      weaknesses: weaknesses ? weaknesses.split('\n').filter(Boolean) : [],
      recommendations: recommendations ? recommendations.split('\n').filter(Boolean) : [],
      teacherFeedback: teacherFeedback.trim(),
    };

    const res = storageService.saveTeacherVisitReport(newReport, currentUser);

    if (res.success) {
      setIsModalOpen(false);
      onRefresh();
    } else {
      alert(res.message);
    }
  };

  const handleApprove = (report: TeacherVisitReport) => {
    if (!window.confirm('هل ترغب في اعتماد تقرير الزيارة الصفية هذا؟')) return;
    const res = storageService.approveTeacherVisitReport(report.id, currentUser);
    if (res.success) {
      onRefresh();
      if (viewingReport && viewingReport.id === report.id) {
        setViewingReport({ ...viewingReport, status: 'APPROVED' });
      }
    } else {
      alert(res.message);
    }
  };

  const handleDelete = (id: string) => {
    if (!window.confirm('هل أنت متأكد من رغبتك في حذف هذا التقرير؟')) return;
    const res = storageService.deleteTeacherVisitReport(id, currentUser);
    if (res.success) {
      onRefresh();
      if (viewingReport?.id === id) setViewingReport(null);
    } else {
      alert(res.message);
    }
  };

  const filteredReports = reports.filter((rep) => {
    if (filterTeacher !== 'ALL' && rep.teacherName !== filterTeacher) return false;
    return true;
  });

  const uniqueTeacherNames = Array.from(new Set(reports.map((r) => r.teacherName).filter(Boolean)));

  const visitTypeLabels: Record<VisitType, string> = {
    DIAGNOSTIC: 'تشخيصية استطلاعية',
    DEVELOPMENTAL: 'تطويرية إشرافية',
    EVALUATIVE: 'تقويمية ختامية',
    FOLLOW_UP: 'متابعة أثر وإجراءات',
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <UserCheck className="w-6 h-6 text-indigo-600" />
            تقارير زيارات المعلمين الصفية (Teacher Visit Reports)
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            متابعة وتقويم الأداء التدريسي والصفّي وفق معايير إتقان مع حساب الدرجة الموزونة بدقة.
          </p>
        </div>

        {canCreate && (
          <button
            id="create-teacher-visit-report-btn"
            onClick={handleOpenNew}
            className="px-4 py-2 text-sm bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-lg flex items-center gap-2 transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4" />
            تسجيل زيارة صفية جديدة
          </button>
        )}
      </div>

      {/* Filter by Teacher */}
      {uniqueTeacherNames.length > 0 && (
        <div className="flex items-center gap-2 bg-slate-50 p-3.5 rounded-xl border border-slate-200">
          <Filter className="w-4 h-4 text-slate-500" />
          <span className="text-xs font-bold text-slate-700">تصفية حسب المعلم:</span>
          <select
            value={filterTeacher}
            onChange={(e) => setFilterTeacher(e.target.value)}
            className="px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 font-medium"
          >
            <option value="ALL">جميع المعلمين ({reports.length} تقرير)</option>
            {uniqueTeacherNames.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Reports Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right border-collapse text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-700 font-semibold text-xs">
                <th className="p-3.5">تاريخ الزيارة</th>
                <th className="p-3.5">المعلم</th>
                <th className="p-3.5">المادة والصف</th>
                <th className="p-3.5">موضوع الدرس</th>
                <th className="p-3.5">نوع الزيارة</th>
                <th className="p-3.5 text-center">الدرجة الموزونة</th>
                <th className="p-3.5 text-center">النسبة</th>
                <th className="p-3.5 text-center">الحالة</th>
                <th className="p-3.5 text-center">إجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredReports.length === 0 ? (
                <tr>
                  <td colSpan={9} className="text-center py-10 text-slate-400">
                    لا توجد تقارير زيارة صفية مسجلة.
                  </td>
                </tr>
              ) : (
                filteredReports.map((rep) => (
                  <tr key={rep.id} className="hover:bg-slate-50 transition-colors">
                    <td className="p-3.5 font-bold text-slate-900 whitespace-nowrap">
                      {rep.visitDate}
                      <span className="block text-[11px] text-slate-400 font-normal">
                        الحصة {rep.periodNumber}
                      </span>
                    </td>
                    <td className="p-3.5 font-semibold text-slate-800">{rep.teacherName}</td>
                    <td className="p-3.5 text-slate-600">
                      <div>{rep.subject}</div>
                      <div className="text-xs text-slate-400">
                        {rep.grade} - {rep.classroom}
                      </div>
                    </td>
                    <td className="p-3.5 text-slate-700 max-w-xs truncate">{rep.lessonTopic}</td>
                    <td className="p-3.5">
                      <span className="px-2 py-0.5 text-xs rounded bg-slate-100 text-slate-700 font-medium">
                        {visitTypeLabels[rep.visitType] || rep.visitType}
                      </span>
                    </td>
                    <td className="p-3.5 text-center font-bold text-slate-900">
                      {rep.earnedScore.toFixed(1)} / {rep.totalScore.toFixed(1)}
                    </td>
                    <td className="p-3.5 text-center">
                      <span
                        className={`px-2.5 py-1 text-xs font-bold rounded-full ${
                          rep.percentage >= 85
                            ? 'bg-emerald-100 text-emerald-800'
                            : rep.percentage >= 70
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-rose-100 text-rose-800'
                        }`}
                      >
                        {rep.percentage.toFixed(1)}%
                      </span>
                    </td>
                    <td className="p-3.5 text-center">
                      {rep.status === 'APPROVED' ? (
                        <span className="inline-flex items-center gap-1 text-xs text-emerald-600 font-bold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                          <CheckCircle2 className="w-3.5 h-3.5" /> معتمد
                        </span>
                      ) : rep.status === 'SUBMITTED' ? (
                        <span className="inline-flex items-center gap-1 text-xs text-blue-600 font-bold bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                          <Clock className="w-3.5 h-3.5" /> بانتظار الاعتماد
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs text-slate-500 font-bold bg-slate-100 px-2 py-0.5 rounded">
                          مسودة
                        </span>
                      )}
                    </td>
                    <td className="p-3.5 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => setViewingReport(rep)}
                          className="px-2.5 py-1 text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 rounded font-medium transition-colors flex items-center gap-1"
                        >
                          <Eye className="w-3.5 h-3.5" /> عرض
                        </button>
                        {canApprove && rep.status === 'SUBMITTED' && (
                          <button
                            onClick={() => handleApprove(rep)}
                            className="px-2.5 py-1 text-xs bg-emerald-600 hover:bg-emerald-700 text-white rounded font-medium transition-colors"
                          >
                            اعتماد
                          </button>
                        )}
                        {canCreate && rep.status === 'DRAFT' && (
                          <button
                            onClick={() => handleDelete(rep.id)}
                            className="p-1 text-slate-400 hover:text-rose-600 rounded transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal: New Visit */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl max-w-3xl w-full max-h-[92vh] overflow-y-auto shadow-2xl border border-slate-200">
            <div className="p-5 border-b border-slate-200 flex items-center justify-between sticky top-0 bg-white z-10">
              <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <UserCheck className="w-5 h-5 text-indigo-600" />
                تسجيل زيارة صفية وتقويم معلم
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 text-xl font-bold"
              >
                ✕
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* Visit Details */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    تاريخ الزيارة *
                  </label>
                  <input
                    type="date"
                    required
                    value={visitDate}
                    onChange={(e) => setVisitDate(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    الحصة الدراسية *
                  </label>
                  <select
                    value={periodNumber}
                    onChange={(e) => setPeriodNumber(parseInt(e.target.value, 10))}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                  >
                    {[1, 2, 3, 4, 5, 6, 7, 8].map((p) => (
                      <option key={p} value={p}>
                        الحصة {p}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    نوع الزيارة *
                  </label>
                  <select
                    value={visitType}
                    onChange={(e) => setVisitType(e.target.value as VisitType)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="DIAGNOSTIC">تشخيصية استطلاعية</option>
                    <option value="DEVELOPMENTAL">تطويرية إشرافية</option>
                    <option value="EVALUATIVE">تقويمية ختامية</option>
                    <option value="FOLLOW_UP">متابعة أثر وإجراءات</option>
                  </select>
                </div>
              </div>

              {/* Teacher and Subject selection */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    المعلم المستهدف *
                  </label>
                  {allTeachers.length > 0 ? (
                    <select
                      value={teacherId}
                      onChange={(e) => handleTeacherSelect(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="">-- اختر المعلم من القائمة --</option>
                      {allTeachers.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name} ({t.specialization || 'معلم'})
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      required
                      placeholder="اسم المعلم..."
                      value={teacherName}
                      onChange={(e) => setTeacherName(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                    />
                  )}
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    المادة الدراسية *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="مثال: الرياضيات، اللغة العربية..."
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">الصف</label>
                  <input
                    type="text"
                    placeholder="مثال: الأول الثانوي"
                    value={grade}
                    onChange={(e) => setGrade(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">الفصل / القاعة</label>
                  <input
                    type="text"
                    placeholder="مثال: 1/1"
                    value={classroom}
                    onChange={(e) => setClassroom(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    موضوع الدرس *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="مثال: حل المعادلات الخطية"
                    value={lessonTopic}
                    onChange={(e) => setLessonTopic(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              {/* Dynamic Standards Scoring */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-indigo-600" />
                    تقييم معايير الزيارة الصفية ({visitStandards.length} معيار)
                  </h4>
                  <span className="text-xs text-slate-400">
                    الوزن والدرجات تُحسب وفق معايير إتقان المسجلة
                  </span>
                </div>

                {visitStandards.length === 0 ? (
                  <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-xs">
                    لم يتم العثور على معايير مطبقة على زيارة المعلم الصفية. يرجى تفعيل أو إضافة معايير من تبويب "معايير إتقان".
                  </div>
                ) : (
                  <div className="space-y-3">
                    {visitStandards.map((std) => {
                      const curScore = scores[std.id]?.score ?? 4;
                      const curNotes = scores[std.id]?.notes ?? '';
                      return (
                        <div
                          key={std.id}
                          className="p-3.5 border border-slate-200 rounded-xl bg-slate-50 space-y-2"
                        >
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-mono text-xs font-bold text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded">
                                  {std.code}
                                </span>
                                <span className="text-sm font-bold text-slate-800">
                                  {std.standard}
                                </span>
                              </div>
                              <div className="text-xs text-slate-600 mt-1">{std.indicator}</div>
                            </div>

                            <div className="flex items-center gap-3">
                              <span className="text-xs font-bold text-slate-500">
                                الوزن: {std.weight}
                              </span>
                              <div className="flex items-center gap-1">
                                {[...Array(std.evaluationScale || 4)].map((_, i) => {
                                  const val = i + 1;
                                  return (
                                    <button
                                      key={val}
                                      type="button"
                                      onClick={() => handleScoreChange(std.id, val)}
                                      className={`w-7 h-7 text-xs font-bold rounded-md transition-colors ${
                                        curScore === val
                                          ? 'bg-indigo-600 text-white shadow-sm'
                                          : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
                                      }`}
                                    >
                                      {val}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          </div>

                          <input
                            type="text"
                            value={curNotes}
                            onChange={(e) => handleNotesChange(std.id, e.target.value)}
                            placeholder="شواهد الممارسة الصفية أو توصيات خاصة بهذا المعيار..."
                            className="w-full px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:ring-1 focus:ring-indigo-500"
                          />
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Qualitative Observations */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-emerald-800 mb-1">
                    نقاط القوة والتميز في الحصة (سطر لكل نقطة)
                  </label>
                  <textarea
                    rows={3}
                    value={strengths}
                    onChange={(e) => setStrengths(e.target.value)}
                    placeholder="استخدام وسائل تعليمية محفزة&#10;تفاعل طلابي ممتاز وتغذية راجعة"
                    className="w-full px-3 py-2 text-sm border border-emerald-200 bg-emerald-50/30 rounded-lg focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-amber-800 mb-1">
                    جوانب تحتاج إلى تحسين وتطوير (سطر لكل نقطة)
                  </label>
                  <textarea
                    rows={3}
                    value={weaknesses}
                    onChange={(e) => setWeaknesses(e.target.value)}
                    placeholder="إدارة الوقت في الجزء الختامي&#10;مراعاة الفروق الفردية للطلاب المتأخرين"
                    className="w-full px-3 py-2 text-sm border border-amber-200 bg-amber-50/30 rounded-lg focus:ring-2 focus:ring-amber-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  التوصيات والتوجيهات المهنية للمعلم
                </label>
                <textarea
                  rows={2}
                  value={recommendations}
                  onChange={(e) => setRecommendations(e.target.value)}
                  placeholder="التوصية بحضور حصة مشاهدة لدى زميل متميز، وتفعيل استراتيجيات التقييم التكويني..."
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  رأي وتغذية راجعة من المعلم (Teacher Feedback)
                </label>
                <textarea
                  rows={2}
                  value={teacherFeedback}
                  onChange={(e) => setTeacherFeedback(e.target.value)}
                  placeholder="ملاحظات المعلم أثناء جلسة النقاش الختامية للزيارة..."
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between pt-4 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-sm bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-colors font-medium"
                >
                  إلغاء
                </button>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleSaveVisit(true)}
                    className="px-4 py-2 text-sm bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-lg transition-colors font-semibold"
                  >
                    حفظ كمسودة
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSaveVisit(false)}
                    className="px-5 py-2 text-sm bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors font-semibold shadow-sm flex items-center gap-2"
                  >
                    <Send className="w-4 h-4" />
                    تقديم تقرير الزيارة للاعتماد
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal: View Visit Details */}
      {viewingReport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto shadow-2xl border border-slate-200">
            <div className="p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50 rounded-t-2xl">
              <div>
                <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                  <UserCheck className="w-5 h-5 text-indigo-600" />
                  تقرير زيارة صفية - المعلم: {viewingReport.teacherName}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  المشرف الزائر: {viewingReport.visitorName} | التاريخ: {viewingReport.visitDate} (الحصة {viewingReport.periodNumber})
                </p>
              </div>
              <button
                onClick={() => setViewingReport(null)}
                className="text-slate-400 hover:text-slate-600 text-xl font-bold"
              >
                ✕
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* Score Highlight */}
              <div className="bg-gradient-to-r from-indigo-50 to-purple-50 p-4 rounded-xl border border-indigo-100 flex items-center justify-between">
                <div>
                  <div className="text-xs font-bold text-indigo-800">الدرجة الموزونة المحققة</div>
                  <div className="text-2xl font-black text-indigo-950 mt-0.5">
                    {viewingReport.earnedScore.toFixed(1)}{' '}
                    <span className="text-sm font-normal text-indigo-600">
                      / {viewingReport.totalScore.toFixed(1)}
                    </span>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs font-bold text-indigo-800">مستوى الأداء الصفّي</div>
                  <span
                    className={`inline-block px-3 py-1 text-sm font-bold rounded-full mt-1 ${
                      viewingReport.percentage >= 85
                        ? 'bg-emerald-100 text-emerald-800'
                        : viewingReport.percentage >= 70
                        ? 'bg-amber-100 text-amber-800'
                        : 'bg-rose-100 text-rose-800'
                    }`}
                  >
                    {viewingReport.percentage.toFixed(1)}%
                  </span>
                </div>
              </div>

              {/* Lesson details grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 p-3.5 rounded-xl border border-slate-200 text-xs">
                <div>
                  <span className="text-slate-400 block">المادة:</span>
                  <span className="font-bold text-slate-800">{viewingReport.subject}</span>
                </div>
                <div>
                  <span className="text-slate-400 block">الصف والفصل:</span>
                  <span className="font-bold text-slate-800">
                    {viewingReport.grade} - {viewingReport.classroom}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block">نوع الزيارة:</span>
                  <span className="font-bold text-slate-800">
                    {visitTypeLabels[viewingReport.visitType]}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block">موضوع الدرس:</span>
                  <span className="font-bold text-slate-800">{viewingReport.lessonTopic}</span>
                </div>
              </div>

              {/* Standard breakdown */}
              <div>
                <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                  تفاصيل تقييم المعايير
                </h4>
                <div className="border border-slate-200 rounded-lg overflow-hidden">
                  <table className="w-full text-right text-xs">
                    <thead className="bg-slate-100 font-semibold text-slate-700">
                      <tr>
                        <th className="p-2.5">الكود</th>
                        <th className="p-2.5">المعيار والمؤشر</th>
                        <th className="p-2.5 text-center">الدرجة</th>
                        <th className="p-2.5 text-center">الوزن</th>
                        <th className="p-2.5">الملاحظات</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {viewingReport.standardScores.map((sc, i) => (
                        <tr key={i}>
                          <td className="p-2.5 font-mono font-bold text-indigo-600">{sc.standardCode}</td>
                          <td className="p-2.5 text-slate-800">
                            {standards.find((s) => s.id === sc.standardId)?.standard || 'معيار'}
                          </td>
                          <td className="p-2.5 text-center font-bold">
                            {sc.score} / {sc.maxScore}
                          </td>
                          <td className="p-2.5 text-center">{sc.weight}</td>
                          <td className="p-2.5 text-slate-600">{sc.notes || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Strengths & Areas */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {viewingReport.strengths?.length > 0 && (
                  <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
                    <h5 className="text-xs font-bold text-emerald-900 mb-2">نقاط التميز والقوة</h5>
                    <ul className="list-disc list-inside text-xs text-emerald-800 space-y-1">
                      {viewingReport.strengths.map((item, idx) => (
                        <li key={idx}>{item}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {viewingReport.weaknesses?.length > 0 && (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                    <h5 className="text-xs font-bold text-amber-900 mb-2">فرص التحسين المهني</h5>
                    <ul className="list-disc list-inside text-xs text-amber-800 space-y-1">
                      {viewingReport.weaknesses.map((item, idx) => (
                        <li key={idx}>{item}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              {/* Recommendations */}
              {viewingReport.recommendations?.length > 0 && (
                <div>
                  <h4 className="text-xs font-bold text-slate-700 mb-1">التوصيات الإشرافية</h4>
                  <ul className="list-disc list-inside text-xs text-slate-700 bg-slate-50 p-3 rounded-lg border border-slate-200 space-y-1">
                    {viewingReport.recommendations.map((rec, idx) => (
                      <li key={idx}>{rec}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Footer */}
              <div className="flex items-center justify-between pt-4 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setViewingReport(null)}
                  className="px-4 py-2 text-sm bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-colors font-medium"
                >
                  إغلاق
                </button>

                {canApprove && viewingReport.status === 'SUBMITTED' && (
                  <button
                    type="button"
                    onClick={() => handleApprove(viewingReport)}
                    className="px-5 py-2 text-sm bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors font-semibold shadow-sm flex items-center gap-2"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    اعتماد تقرير الزيارة
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
