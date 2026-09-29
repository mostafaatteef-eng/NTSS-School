import React, { useMemo, useState } from 'react';
import {
  AlertCircle,
  AlertOctagon,
  AlertTriangle,
  Award,
  Bell,
  CheckCircle,
  CheckCircle2,
  Download,
  Edit2,
  Filter,
  HeartHandshake,
  Layers,
  PhoneCall,
  Plus,
  RotateCcw,
  Search,
  Settings,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  User,
  Users,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { BehaviorType, BehaviorViolation, PositiveBehaviorType, Student } from '../../types';
import { storageService } from '../../services/storageService';
import { getSamatStudentLevel } from '../../services/behavior/samatScoring';
import {
  formatEgyptianDate,
  getCairoCurrentDate,
  getEgyptianDayName,
} from '../../utils/egyptianTime';

export const BehaviorView: React.FC = () => {
  const [violations, setViolations] = useState<BehaviorViolation[]>(() => storageService.getBehaviorViolations());
  const [behaviorTypes, setBehaviorTypes] = useState<BehaviorType[]>(() => storageService.getBehaviorTypes());
  const [students, setStudents] = useState<Student[]>(() => storageService.getStudents());
  const [positiveTypes] = useState<PositiveBehaviorType[]>(() => storageService.getPositiveBehaviorTypes());
  const [isPositiveModalOpen, setIsPositiveModalOpen] = useState(false);
  const [positiveStudentId, setPositiveStudentId] = useState('');
  const [positiveTypeId, setPositiveTypeId] = useState('');
  const [positiveNotes, setPositiveNotes] = useState('');
  const [restoreStudentId, setRestoreStudentId] = useState('');
  const [restorePoints, setRestorePoints] = useState(5);
  const [restoreReason, setRestoreReason] = useState('');
  const [isRestoreModalOpen, setIsRestoreModalOpen] = useState(false);
  const [profileStudentId, setProfileStudentId] = useState<string | null>(null);
  const [isPlanModalOpen, setIsPlanModalOpen] = useState(false);
  const [planStudentId, setPlanStudentId] = useState('');
  const [planGoal, setPlanGoal] = useState('');
  const [planAction, setPlanAction] = useState('');
  const [planFollowUpDate, setPlanFollowUpDate] = useState('');
  const [followupCaseId, setFollowupCaseId] = useState<string | null>(null);
  const [followupResult, setFollowupResult] = useState('');
  const [followupNextAction, setFollowupNextAction] = useState('');
  const [followupNextDate, setFollowupNextDate] = useState('');
  const [closePlanId, setClosePlanId] = useState<string | null>(null);
  const [closePlanResult, setClosePlanResult] = useState('');

  const [activeSubTab, setActiveSubTab] = useState<'violations' | 'positive' | 'types_manager' | 'at_risk'>('violations');

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSeverity, setSelectedSeverity] = useState('ALL');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  // Add violation form state
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [selectedTypeId, setSelectedTypeId] = useState('');
  const [violationDate, setViolationDate] = useState(() => getCairoCurrentDate());
  const [actionTaken, setActionTaken] = useState('تنبيه شفوي وتوثيق في السجل');
  const [parentNotified, setParentNotified] = useState(false);
  const [notes, setNotes] = useState('');

  // Behavior Type Editor State
  const [isTypeEditorOpen, setIsTypeEditorOpen] = useState(false);
  const [editingType, setEditingType] = useState<BehaviorType | null>(null);
  const [typeName, setTypeName] = useState('');
  const [typeCategory, setTypeCategory] = useState('سلوكية داخل الفصل');
  const [typeSeverity, setTypeSeverity] = useState('متوسطة');
  const [typePoints, setTypePoints] = useState(5);
  const [typeDefaultAction, setTypeDefaultAction] = useState('إنذار كتابي وتكليف إضافي');
  const [typeNotifyParent, setTypeNotifyParent] = useState(true);
  const [typeRequiresReview, setTypeRequiresReview] = useState(false);
  const [typeIsActive, setTypeIsActive] = useState(true);

  const reloadData = () => {
    setViolations(storageService.getBehaviorViolations());
    setBehaviorTypes(storageService.getBehaviorTypes());
    setStudents(storageService.getStudents());
  };

  const filteredViolations = useMemo(() => {
    return violations.filter(v => {
      const matchSearch =
        !searchTerm.trim() ||
        v.studentName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        v.violationName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (v.grade && v.grade.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (v.classroom && v.classroom.includes(searchTerm));

      const matchSev = selectedSeverity === 'ALL' || v.severity === selectedSeverity;
      return matchSearch && matchSev;
    });
  }, [violations, searchTerm, selectedSeverity]);

  // Overall School Behavior Stats
  const stats = useMemo(() => {
    const total = violations.length;
    const level1 = violations.filter(v => v.severity === 'بسيطة').length;
    const level2 = violations.filter(v => v.severity === 'متوسطة').length;
    const level3 = violations.filter(v => v.severity?.includes('شديدة') || v.severity?.includes('خطيرة')).length;

    // Students with behavior scores
    const studentScoreMap = new Map<string, number>();
    violations.forEach(v => {
      studentScoreMap.set(v.studentId, (studentScoreMap.get(v.studentId) || 0) + (v.pointsDeducted || 0));
    });

    let atRiskCount = 0;
    students.forEach(s => {
      const score = Math.max(0, (s.initialBehaviorScore || 100) - (studentScoreMap.get(s.id) || 0));
      if (score < 85) atRiskCount++;
    });

    return { total, level1, level2, level3, atRiskCount };
  }, [violations, students]);

  // Students list with computed behavior score
  const traitStats = useMemo(() => {
    const map = new Map<string, { name: string; incidents: number; deducted: number }>();
    violations.forEach(v => {
      const type = behaviorTypes.find(t => t.id === (v.behaviorTypeId || v.violationTypeId));
      const name = type?.traitName || 'سمة غير مصنفة';
      const current = map.get(name) || { name, incidents: 0, deducted: 0 };
      current.incidents += 1;
      current.deducted += Number(v.pointsDeducted || 0);
      map.set(name, current);
    });
    return Array.from(map.values()).sort((a, b) => b.incidents - a.incidents);
  }, [violations, behaviorTypes]);

  const profileStudent = useMemo(() => students.find(s => s.id === profileStudentId) || null, [students, profileStudentId]);
  const allImprovementPlans = useMemo(() => storageService.getBehaviorCases().filter(x => x.severity === 'خطة تحسين'), [violations, students, isPlanModalOpen, followupCaseId, closePlanId]);
  const planStats = useMemo(() => {
    const today = getCairoCurrentDate();
    const closed = allImprovementPlans.filter(p => p.status === 'CLOSED' || p.status === 'Closed').length;
    const open = allImprovementPlans.length - closed;
    const overdue = allImprovementPlans.filter(p => {
      if (p.status === 'CLOSED' || p.status === 'Closed') return false;
      const latest = p.followups?.[p.followups.length - 1];
      return Boolean(latest?.followUpDate && latest.followUpDate < today);
    }).length;
    return { open, overdue, closed };
  }, [allImprovementPlans]);
  const profilePlans = useMemo(() => profileStudentId ? allImprovementPlans.filter(x => x.studentId === profileStudentId) : [], [profileStudentId, allImprovementPlans]);
  const profileTimeline = useMemo(() => {
    if (!profileStudentId) return [];
    const negative = violations.filter(v => v.studentId === profileStudentId).map(v => ({
      id: v.id, date: v.date, kind: 'VIOLATION', title: v.violationName, points: -Math.abs(v.pointsDeducted || 0),
      detail: v.notes || v.actionTaken || '', balanceAfter: undefined as number | undefined,
    }));
    const ledger = storageService.getBehaviorLedger(profileStudentId).filter(e => e.type === 'POSITIVE' || e.type === 'RESTORE' || e.type === 'credit').map(e => ({
      id: e.id, date: e.date, kind: e.type, title: e.type === 'RESTORE' ? 'استعادة نقاط بعد المتابعة' : 'تميز وتعزيز إيجابي',
      points: Math.abs(Number(e.pointsAwarded ?? e.points ?? 0)), detail: e.reason || '', balanceAfter: e.balanceAfter,
    }));
    return [...negative, ...ledger].sort((a,b) => String(b.date).localeCompare(String(a.date)));
  }, [profileStudentId, violations]);

  const studentsWithScores = useMemo(() => {
    const studentDeductionsMap = new Map<string, { total: number; count: number }>();
    violations.forEach(v => {
      const cur = studentDeductionsMap.get(v.studentId) || { total: 0, count: 0 };
      studentDeductionsMap.set(v.studentId, {
        total: cur.total + (v.pointsDeducted || 0),
        count: cur.count + 1,
      });
    });

    return students
      .map(s => {
        const d = studentDeductionsMap.get(s.id) || { total: 0, count: 0 };
        const score = Math.max(0, (s.initialBehaviorScore || 100) - d.total);
        return {
          ...s,
          score,
          samatLevel: getSamatStudentLevel(score),
          deducted: d.total,
          violationCount: d.count,
        };
      })
      .sort((a, b) => a.score - b.score);
  }, [students, violations]);

  const handleSaveViolation = (e: React.FormEvent) => {
    e.preventDefault();
    const student = students.find(s => s.id === selectedStudentId);
    const bType = behaviorTypes.find(t => t.id === selectedTypeId);

    if (!student || !bType) {
      alert('يرجى اختيار الطالب ونوع المخالفة');
      return;
    }

    const pointsDeducted = bType.points || bType.weight || 5;

    const newViolation: BehaviorViolation = {
      id: `VIO-${Date.now()}`,
      studentId: student.id,
      studentCode: student.studentCode || student.id,
      studentName: student.name,
      grade: student.grade,
      classroom: student.classroom,
      date: violationDate,
      behaviorTypeId: bType.id,
      violationTypeId: bType.id,
      violationName: bType.name,
      severity: bType.severity,
      pointsDeducted,
      actionTaken,
      parentNotified,
      notes,
      status: bType.requiresAdminReview ? 'قيد المراجعة' : 'معتمدة',
      recordedBy: storageService.getCurrentUser()?.fullName || 'الأخصائي الاجتماعي',
      createdAt: new Date().toISOString(),
    };

    storageService.saveBehaviorViolation(newViolation);
    reloadData();
    setIsAddModalOpen(false);
    setSelectedStudentId('');
    setSelectedTypeId('');
    setNotes('');
    alert(`تم تسجيل الموقف السلوكي بنجاح واحتساب (${pointsDeducted}) نقاط من رصيد الطالب.`);
  };

  const handleSavePositiveBehavior = (e: React.FormEvent) => {
    e.preventDefault();
    const student = students.find(s => s.id === positiveStudentId);
    const type = positiveTypes.find(t => t.id === positiveTypeId);
    if (!student || !type) {
      alert('يرجى اختيار الطالب ونوع التميز');
      return;
    }
    const result = storageService.addBehaviorScoreTransaction({
      id: `SAMAT-POS-${Date.now()}`,
      studentId: student.id,
      studentName: student.name,
      type: 'POSITIVE',
      sourceType: 'positive_behavior',
      sourceId: type.id,
      points: Math.abs(type.points),
      pointsAwarded: Math.abs(type.points),
      grade: student.grade,
      classroom: student.classroom,
      date: getCairoCurrentDate(),
      reason: positiveNotes.trim() || type.name,
    });
    setIsPositiveModalOpen(false);
    setPositiveStudentId('');
    setPositiveTypeId('');
    setPositiveNotes('');
    reloadData();
    alert(`تم تسجيل التميز وإضافة ${type.points} نقاط. الرصيد الحالي: ${result.newScore}`);
  };

  const handleRestorePoints = (e: React.FormEvent) => {
    e.preventDefault();
    const student = students.find(s => s.id === restoreStudentId);
    const points = Math.max(1, Math.min(30, Number(restorePoints) || 0));
    if (!student || !restoreReason.trim()) {
      alert('اختر الطالب واكتب سبب استعادة النقاط بعد المتابعة.');
      return;
    }
    const before = storageService.calculateStudentBehaviorScore(student.id).currentScore;
    const result = storageService.addBehaviorScoreTransaction({
      id: `SAMAT-RESTORE-${Date.now()}`,
      studentId: student.id,
      studentName: student.name,
      type: 'RESTORE',
      sourceType: 'adjustment',
      points,
      pointsAwarded: points,
      grade: student.grade,
      classroom: student.classroom,
      date: getCairoCurrentDate(),
      reason: restoreReason.trim(),
    });
    setIsRestoreModalOpen(false);
    setRestoreStudentId('');
    setRestorePoints(5);
    setRestoreReason('');
    reloadData();
    alert(`تم توثيق استعادة النقاط بعد المتابعة: ${before} ← ${result.newScore}`);
  };

  const handleCreateImprovementPlan = (e: React.FormEvent) => {
    e.preventDefault();
    const student = students.find(s => s.id === planStudentId);
    if (!student || !planGoal.trim() || !planAction.trim() || !planFollowUpDate) {
      alert('أكمل الطالب والهدف والإجراء وموعد المتابعة.');
      return;
    }
    const user = storageService.getCurrentUser();
    const now = new Date().toISOString();
    storageService.saveBehaviorCase({
      id: `SAMAT-PLAN-${Date.now()}`,
      caseCode: `SAMAT-${Date.now()}`,
      studentId: student.id,
      studentName: student.name,
      grade: student.grade,
      classroom: student.classroom,
      openedDate: getCairoCurrentDate(),
      status: 'Monitoring',
      severity: 'خطة تحسين',
      assignedTo: user?.id || 'SOCIAL_SPECIALIST',
      assignedToName: user?.fullName || 'الأخصائي الاجتماعي',
      summary: planGoal.trim(),
      violationIds: violations.filter(v => v.studentId === student.id).map(v => v.id),
      createdBy: user?.fullName || 'الأخصائي الاجتماعي',
      createdAt: now,
      followups: [{
        id: `FOL-${Date.now()}`,
        caseId: `SAMAT-PLAN-${Date.now()}`,
        date: getCairoCurrentDate(),
        actionType: 'خطة تحسين سمات',
        summary: planAction.trim(),
        notes: planAction.trim(),
        performedBy: user?.id || 'SOCIAL_SPECIALIST',
        performedByName: user?.fullName || 'الأخصائي الاجتماعي',
        nextAction: 'قياس التحسن وتحديث الخطة',
        followUpDate: planFollowUpDate,
        status: 'مجدولة',
        createdAt: now,
      }],
    });
    setIsPlanModalOpen(false); setPlanStudentId(''); setPlanGoal(''); setPlanAction(''); setPlanFollowUpDate('');
    alert('تم إنشاء خطة تحسين سمات وجدولة المتابعة.');
  };

  const handlePlanFollowup = (e: React.FormEvent) => {
    e.preventDefault();
    if (!followupCaseId || !followupResult.trim()) return;
    const user = storageService.getCurrentUser();
    storageService.addBehaviorCaseFollowup(followupCaseId, {
      caseId: followupCaseId,
      date: getCairoCurrentDate(),
      actionType: 'متابعة خطة تحسين سمات',
      summary: followupResult.trim(),
      notes: followupResult.trim(),
      performedBy: user?.id || 'SOCIAL_SPECIALIST',
      performedByName: user?.fullName || 'الأخصائي الاجتماعي',
      nextAction: followupNextAction.trim() || undefined,
      followUpDate: followupNextDate || undefined,
      status: followupNextDate ? 'متابعة مستمرة' : 'تم القياس',
    });
    setFollowupCaseId(null); setFollowupResult(''); setFollowupNextAction(''); setFollowupNextDate('');
    alert('تم تسجيل نتيجة متابعة خطة سمات.');
  };

  const handleCloseImprovementPlan = (e: React.FormEvent) => {
    e.preventDefault();
    if (!closePlanId || !closePlanResult.trim()) return;
    const plan = allImprovementPlans.find(p => p.id === closePlanId);
    const score = plan ? storageService.calculateStudentBehaviorScore(plan.studentId).currentScore : undefined;
    const summary = `${closePlanResult.trim()}${score !== undefined ? ` | رصيد سمات عند الإغلاق: ${score}` : ''}`;
    storageService.closeBehaviorCase(closePlanId, summary);
    setClosePlanId(null); setClosePlanResult('');
    alert('تم إغلاق خطة تحسين سمات وتوثيق نتيجة الإغلاق.');
  };

  const handleDeleteViolation = (id: string) => {
    if (window.confirm('هل أنت متأكد من رغبتك في حذف هذا السجل؟ سيتم إعادة النقاط لرصيد الطالب.')) {
      storageService.deleteBehaviorViolation(id);
      reloadData();
    }
  };

  // Open Type Editor Modal
  const handleOpenTypeEditor = (type?: BehaviorType) => {
    if (type) {
      setEditingType(type);
      setTypeName(type.name);
      setTypeCategory(type.category);
      setTypeSeverity(type.severity);
      setTypePoints(type.points || type.weight || 5);
      setTypeDefaultAction(type.defaultAction || '');
      setTypeNotifyParent(type.notifyParent);
      setTypeRequiresReview(type.requiresAdminReview);
      setTypeIsActive(type.isActive);
    } else {
      setEditingType(null);
      setTypeName('');
      setTypeCategory('سلوكية داخل الفصل');
      setTypeSeverity('متوسطة');
      setTypePoints(5);
      setTypeDefaultAction('إنذار كتابي وتكليف إضافي');
      setTypeNotifyParent(true);
      setTypeRequiresReview(false);
      setTypeIsActive(true);
    }
    setIsTypeEditorOpen(true);
  };

  const handleSaveBehaviorType = (e: React.FormEvent) => {
    e.preventDefault();
    if (!typeName.trim()) {
      alert('يرجى كتابة اسم بند المخالفة');
      return;
    }

    const typeObj: BehaviorType = {
      id: editingType ? editingType.id : `BEH-${Date.now()}`,
      name: typeName.trim(),
      category: typeCategory,
      severity: typeSeverity as any,
      points: Number(typePoints),
      weight: Number(typePoints),
      defaultAction: typeDefaultAction.trim(),
      notifyParent: typeNotifyParent,
      requiresAdminReview: typeRequiresReview,
      isActive: typeIsActive,
      sortOrder: editingType?.sortOrder || behaviorTypes.length + 1,
    };

    storageService.saveBehaviorType(typeObj);
    reloadData();
    setIsTypeEditorOpen(false);
    alert(editingType ? 'تم تعديل بند المخالفة بنجاح' : 'تمت إضافة بند المخالفة الجديد بنجاح');
  };

  const handleToggleTypeStatus = (type: BehaviorType) => {
    const updated = { ...type, isActive: !type.isActive };
    storageService.saveBehaviorType(updated);
    reloadData();
  };

  const handleExportExcel = () => {
    const exportData = filteredViolations.map((v, idx) => ({
      'م': idx + 1,
      'تاريخ المخالفة': v.date,
      'كود الطالب': v.studentCode || v.studentId,
      'اسم الطالب': v.studentName,
      'الصف الدراسي': v.grade,
      'الفصل': v.classroom,
      'بند المخالفة': v.violationName,
      'درجة الخطورة': v.severity,
      'النقاط المخصومة': v.pointsDeducted,
      'الإجراء المتخذ': v.actionTaken || '',
      'إخطار ولي الأمر': v.parentNotified ? 'نعم' : 'لا',
      'حالة الاعتماد': v.status || 'معتمدة',
      'المسؤول': v.recordedBy || '',
      'ملاحظات': v.notes || '',
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'سجل المواقف السلوكية');
    XLSX.writeFile(wb, `سجل_المخالفات_السلوكية_${getCairoCurrentDate()}.xlsx`);
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center font-bold text-xl shrink-0">
            <Shield className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-extrabold text-slate-900">سمات | السلوك والمهارات والانضباط</h1>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-50 text-amber-700 border border-amber-200">
                منظومة سمات
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              بناء سمات الطالب من خلال رصد السلوك والانضباط والتميز، وقياس الأثر والتدخل التربوي والمتابعة
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => handleExportExcel()}
            className="px-3.5 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 text-emerald-600" />
            <span>تصدير Excel</span>
          </button>

          <button
            onClick={() => setIsAddModalOpen(true)}
            className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-xs cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>تسجيل موقف سلوكي</span>
          </button>
        </div>
      </div>

      {traitStats.length > 0 && (
        <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between gap-3 mb-3">
            <div>
              <h2 className="text-sm font-extrabold text-slate-900">مؤشرات سمات المدرسة</h2>
              <p className="text-[11px] text-slate-500 mt-0.5">توزيع المواقف المرصودة على السمات المستهدفة لتحديد أولويات التدخل التربوي.</p>
            </div>
            <Award className="w-5 h-5 text-amber-600" />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-2">
            {traitStats.map(trait => (
              <div key={trait.name} className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                <div className="text-[11px] font-extrabold text-slate-800">{trait.name}</div>
                <div className="text-lg font-black text-slate-900 mt-1">{trait.incidents}</div>
                <div className="text-[10px] text-slate-500">موقف مرصود · أثر {trait.deducted} نقطة</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-white rounded-2xl p-4 border border-slate-200"><div className="text-[11px] text-slate-500">خطط تحسين مفتوحة</div><div className="text-2xl font-black text-slate-900 mt-1">{planStats.open}</div></div>
        <div className="bg-white rounded-2xl p-4 border border-rose-100"><div className="text-[11px] text-rose-600">متابعات متأخرة</div><div className="text-2xl font-black text-rose-700 mt-1">{planStats.overdue}</div></div>
        <div className="bg-white rounded-2xl p-4 border border-emerald-100"><div className="text-[11px] text-emerald-600">خطط مكتملة</div><div className="text-2xl font-black text-emerald-700 mt-1">{planStats.closed}</div></div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs">
          <div className="text-[11px] text-slate-500 font-bold">إجمالي المواقف المسجلة</div>
          <div className="text-xl font-black text-slate-900 mt-1">{stats.total}</div>
          <div className="text-[10px] text-slate-400 mt-1">حالة مسجلة بالعام الحالي</div>
        </div>

        <div className="bg-white rounded-2xl p-4 border border-blue-100 shadow-xs">
          <div className="text-[11px] text-blue-700 font-bold">مخالفات بسيطة</div>
          <div className="text-xl font-black text-blue-600 mt-1">{stats.level1}</div>
          <div className="text-[10px] text-blue-600 mt-1">خصم 2-3 نقاط</div>
        </div>

        <div className="bg-white rounded-2xl p-4 border border-amber-100 shadow-xs">
          <div className="text-[11px] text-amber-700 font-bold">مخالفات متوسطة</div>
          <div className="text-xl font-black text-amber-600 mt-1">{stats.level2}</div>
          <div className="text-[10px] text-amber-600 mt-1">خصم 5 نقاط</div>
        </div>

        <div className="bg-white rounded-2xl p-4 border border-rose-100 shadow-xs">
          <div className="text-[11px] text-rose-700 font-bold">مخالفات جسيمة / خطيرة</div>
          <div className="text-xl font-black text-rose-600 mt-1">{stats.level3}</div>
          <div className="text-[10px] text-rose-600 mt-1">خصم 10-30 نقطة</div>
        </div>
      </div>

      {/* Sub Tabs Navigation */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
        <button
          onClick={() => setActiveSubTab('violations')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-2 ${
            activeSubTab === 'violations'
              ? 'bg-amber-600 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Shield className="w-4 h-4" />
          <span>سجل المواقف السلوكية ({violations.length})</span>
        </button>

        <button
          onClick={() => setActiveSubTab('positive')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-2 ${activeSubTab === 'positive' ? 'bg-emerald-600 text-white shadow-xs' : 'text-slate-600 hover:bg-slate-100'}`}
        >
          <Award className="w-4 h-4" />
          <span>التميز والتعزيز</span>
        </button>

        <button
          onClick={() => setActiveSubTab('types_manager')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-2 ${
            activeSubTab === 'types_manager'
              ? 'bg-amber-600 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Settings className="w-4 h-4" />
          <span>إدارة مواقف سمات وأوزانها ({behaviorTypes.length})</span>
        </button>

        <button
          onClick={() => setActiveSubTab('at_risk')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-2 ${
            activeSubTab === 'at_risk'
              ? 'bg-amber-600 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <ShieldAlert className="w-4 h-4" />
          <span>ملف الطالب ومستوى سمات ({stats.atRiskCount})</span>
        </button>
        <button onClick={() => setIsRestoreModalOpen(true)} className="px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-2 text-slate-600 hover:bg-slate-100">
          <RotateCcw className="w-4 h-4" /><span>استعادة نقاط بعد المتابعة</span>
        </button>
      </div>

      {/* 1. SubTab: VIOLATIONS LOG */}
      {activeSubTab === 'violations' && (
        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            {/* Search */}
            <div className="relative flex-1 max-w-sm">
              <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="البحث باسم الطالب أو نوع المخالفة أو الصف..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full pl-3 pr-9 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
              />
            </div>

            {/* Severity Filter */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500 font-bold">الدرجة:</span>
              <select
                value={selectedSeverity}
                onChange={e => setSelectedSeverity(e.target.value)}
                className="bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-bold text-slate-800 focus:outline-none"
              >
                <option value="ALL">جميع الدرجات</option>
                <option value="بسيطة">بسيطة</option>
                <option value="متوسطة">متوسطة</option>
                <option value="شديدة">شديدة</option>
                <option value="خطيرة جداً">خطيرة جداً</option>
              </select>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
                <tr>
                  <th className="p-3">التاريخ</th>
                  <th className="p-3">اسم الطالب</th>
                  <th className="p-3">الصف / الفصل</th>
                  <th className="p-3">نوع المخالفة</th>
                  <th className="p-3 text-center">الدرجة</th>
                  <th className="p-3 text-center">النقاط</th>
                  <th className="p-3">الإجراء المتخذ</th>
                  <th className="p-3 text-center">إخطار ولي الأمر</th>
                  <th className="p-3 text-center">إجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {filteredViolations.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="text-center py-10 text-slate-400">
                      لا توجد مخالفات مطابقة للبحث.
                    </td>
                  </tr>
                ) : (
                  filteredViolations.map(v => (
                    <tr key={v.id} className="hover:bg-slate-50">
                      <td className="p-3 text-slate-600 font-mono whitespace-nowrap">{v.date}</td>
                      <td className="p-3 font-bold text-slate-900">{v.studentName}</td>
                      <td className="p-3 text-slate-600">{v.grade} — {v.classroom}</td>
                      <td className="p-3 font-semibold text-slate-800">{v.violationName}</td>
                      <td className="p-3 text-center">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          v.severity === 'بسيطة'
                            ? 'bg-blue-50 text-blue-700'
                            : v.severity === 'متوسطة'
                            ? 'bg-amber-50 text-amber-700'
                            : 'bg-rose-50 text-rose-700'
                        }`}>
                          {v.severity}
                        </span>
                      </td>
                      <td className="p-3 text-center font-bold text-rose-600 font-mono">
                        -{v.pointsDeducted}
                      </td>
                      <td className="p-3 text-slate-700">{v.actionTaken}</td>
                      <td className="p-3 text-center">
                        {v.parentNotified ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700">
                            تم الإخطار ✓
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-500">
                            لم يخطر
                          </span>
                        )}
                      </td>
                      <td className="p-3 text-center">
                        <button
                          onClick={() => handleDeleteViolation(v.id)}
                          className="p-1 text-slate-400 hover:text-rose-600 transition-colors cursor-pointer"
                          title="حذف المخالفة"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeSubTab === 'positive' && (
        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="font-bold text-slate-900 text-sm">التميز والتعزيز في سمات</h2>
              <p className="text-xs text-slate-500 mt-0.5">تعزيز السلوك الإيجابي وربطه بالسمة المستهدفة وإضافته إلى رصيد الطالب.</p>
            </div>
            <button onClick={() => setIsPositiveModalOpen(true)} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5">
              <Plus className="w-4 h-4" /> تسجيل تميز
            </button>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {positiveTypes.filter(t => t.isActive).map(t => (
              <div key={t.id} className="rounded-xl border border-emerald-100 bg-emerald-50/40 p-4">
                <div className="text-xs font-extrabold text-slate-900">{t.name}</div>
                <div className="text-[11px] text-slate-500 mt-1">{t.traitName || t.category}</div>
                <div className="text-lg font-black text-emerald-700 mt-2">+{t.points}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 2. SubTab: BEHAVIOR TYPES & WEIGHTS MANAGER */}
      {activeSubTab === 'types_manager' && (
        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="font-bold text-slate-900 text-sm">مواقف سمات وأوزان الأثر</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                تحديد أنواع المخالفات، تصنيفاتها، خصم النقاط، إشعار ولي الأمر، وتفعيل/تعطيل البنود
              </p>
            </div>

            <button
              onClick={() => handleOpenTypeEditor()}
              className="px-4 py-2 bg-[#008e8b] hover:bg-[#007775] text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-xs cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>إضافة بند مخالفة جديد</span>
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
                <tr>
                  <th className="p-3">#</th>
                  <th className="p-3">اسم المخالفة</th>
                  <th className="p-3">التصنيف</th>
                  <th className="p-3 text-center">الدرجة</th>
                  <th className="p-3 text-center">النقاط المخصومة</th>
                  <th className="p-3">الإجراء المقترح</th>
                  <th className="p-3 text-center">إخطار ولي الأمر</th>
                  <th className="p-3 text-center">اعتماد الإدارة</th>
                  <th className="p-3 text-center">الحالة</th>
                  <th className="p-3 text-center">إجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {behaviorTypes.map((type, idx) => (
                  <tr key={type.id} className={`hover:bg-slate-50 ${!type.isActive ? 'opacity-50' : ''}`}>
                    <td className="p-3 font-mono text-slate-400">{idx + 1}</td>
                    <td className="p-3 font-bold text-slate-900">{type.name}</td>
                    <td className="p-3 text-slate-600">{type.category}</td>
                    <td className="p-3 text-center">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        type.severity === 'بسيطة'
                          ? 'bg-blue-50 text-blue-700'
                          : type.severity === 'متوسطة'
                          ? 'bg-amber-50 text-amber-700'
                          : 'bg-rose-50 text-rose-700'
                      }`}>
                        {type.severity}
                      </span>
                    </td>
                    <td className="p-3 text-center font-bold text-rose-600 font-mono">
                      -{type.points || type.weight} نقاط
                    </td>
                    <td className="p-3 text-slate-600">{type.defaultAction || '—'}</td>
                    <td className="p-3 text-center">
                      {type.notifyParent ? (
                        <span className="text-emerald-600 font-bold">نعم ✓</span>
                      ) : (
                        <span className="text-slate-400">اختياري</span>
                      )}
                    </td>
                    <td className="p-3 text-center">
                      {type.requiresAdminReview ? (
                        <span className="text-amber-600 font-bold">مطلوب</span>
                      ) : (
                        <span className="text-slate-400">مباشر</span>
                      )}
                    </td>
                    <td className="p-3 text-center">
                      <button
                        onClick={() => handleToggleTypeStatus(type)}
                        className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold cursor-pointer transition-all ${
                          type.isActive
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-slate-100 text-slate-500'
                        }`}
                      >
                        {type.isActive ? 'مفعل' : 'معطل'}
                      </button>
                    </td>
                    <td className="p-3 text-center">
                      <button
                        onClick={() => handleOpenTypeEditor(type)}
                        className="p-1 text-slate-400 hover:text-[#008e8b] transition-colors cursor-pointer"
                        title="تعديل البند"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 3. SubTab: AT RISK & BEHAVIOR SCORES */}
      {activeSubTab === 'at_risk' && (
        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
            <h2 className="font-bold text-slate-900 text-sm">ملف سمات للطلاب</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              متابعة رصيد سمات ومستوى كل طالب لتحديد الاحتياج للتعزيز أو التدخل التربوي نفسياً وتربوياً
            </p></div>
            <button onClick={()=>setIsPlanModalOpen(true)} className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5"><Plus className="w-4 h-4"/> خطة تحسين سمات</button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
                <tr>
                  <th className="p-3">كود الطالب</th>
                  <th className="p-3">اسم الطالب</th>
                  <th className="p-3">الصف والفصل</th>
                  <th className="p-3 text-center">عدد المخالفات</th>
                  <th className="p-3 text-center">مجموع النقاط المخصومة</th>
                  <th className="p-3 text-center">رصيد السلوك الحالي</th>
                  <th className="p-3 text-center">التقييم العام</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {studentsWithScores.map(st => (
                  <tr key={st.id} className="hover:bg-slate-50">
                    <td className="p-3 font-mono text-slate-500">{st.studentCode || st.id}</td>
                    <td className="p-3 font-bold text-slate-900"><button onClick={()=>setProfileStudentId(st.id)} className="hover:text-teal-700 underline-offset-2 hover:underline">{st.name}</button></td>
                    <td className="p-3 text-slate-600">{st.grade} — {st.classroom}</td>
                    <td className="p-3 text-center font-bold text-slate-700">{st.violationCount}</td>
                    <td className="p-3 text-center font-bold text-rose-600 font-mono">
                      {st.deducted > 0 ? `-${st.deducted}` : '0'}
                    </td>
                    <td className="p-3 text-center">
                      <span className={`px-2.5 py-0.5 rounded-full text-xs font-black font-mono ${
                        st.score >= 90
                          ? 'bg-emerald-50 text-emerald-700'
                          : st.score >= 80
                          ? 'bg-amber-50 text-amber-700'
                          : 'bg-rose-50 text-rose-700 border border-rose-200'
                      }`}>
                        {st.score}%
                      </span>
                    </td>
                    <td className="p-3 text-center font-bold">
                      <span className={st.score >= 85 ? 'text-emerald-600' : st.score >= 60 ? 'text-amber-600' : 'text-rose-600 font-black'}>{st.samatLevel}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {closePlanId && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs">
          <form onSubmit={handleCloseImprovementPlan} className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-lg p-6 space-y-4">
            <div className="flex items-center justify-between"><h3 className="text-base font-bold text-slate-900">إغلاق خطة تحسين سمات</h3><button type="button" onClick={()=>setClosePlanId(null)} className="text-slate-400">✕</button></div>
            <p className="text-xs text-slate-500">وثّق دليل تحقق الهدف أو نتيجة التحسن قبل إغلاق الخطة. سيتم حفظ رصيد سمات الحالي ضمن نتيجة الإغلاق.</p>
            <textarea required value={closePlanResult} onChange={e=>setClosePlanResult(e.target.value)} placeholder="نتيجة التحسن ودليل تحقق الهدف" className="w-full text-xs bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 min-h-28"/>
            <button type="submit" className="w-full py-2.5 bg-emerald-600 text-white rounded-xl text-xs font-bold">تأكيد تحقق الهدف وإغلاق الخطة</button>
          </form>
        </div>
      )}

      {followupCaseId && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs">
          <form onSubmit={handlePlanFollowup} className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-lg p-6 space-y-4">
            <div className="flex items-center justify-between"><h3 className="text-base font-bold text-slate-900">نتيجة متابعة خطة سمات</h3><button type="button" onClick={()=>setFollowupCaseId(null)} className="text-slate-400">✕</button></div>
            <textarea required value={followupResult} onChange={e=>setFollowupResult(e.target.value)} placeholder="ما الذي تغير؟ وما نتيجة المتابعة؟" className="w-full text-xs bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 min-h-24"/>
            <textarea value={followupNextAction} onChange={e=>setFollowupNextAction(e.target.value)} placeholder="الإجراء التالي إن كانت المتابعة مستمرة" className="w-full text-xs bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 min-h-20"/>
            <input type="date" value={followupNextDate} onChange={e=>setFollowupNextDate(e.target.value)} className="w-full text-xs bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5"/>
            <button type="submit" className="w-full py-2.5 bg-teal-600 text-white rounded-xl text-xs font-bold">حفظ نتيجة المتابعة</button>
          </form>
        </div>
      )}

      {isPlanModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs">
          <form onSubmit={handleCreateImprovementPlan} className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-lg p-6 space-y-4">
            <div className="flex items-center justify-between"><h3 className="text-base font-bold text-slate-900">إنشاء خطة تحسين سمات</h3><button type="button" onClick={()=>setIsPlanModalOpen(false)} className="text-slate-400">✕</button></div>
            <select required value={planStudentId} onChange={e=>setPlanStudentId(e.target.value)} className="w-full text-xs bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5"><option value="">— اختر الطالب —</option>{students.map(s=><option key={s.id} value={s.id}>{s.name} ({s.grade} - {s.classroom})</option>)}</select>
            <textarea required value={planGoal} onChange={e=>setPlanGoal(e.target.value)} placeholder="هدف التحسين السلوكي/المهاري" className="w-full text-xs bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 min-h-20"/>
            <textarea required value={planAction} onChange={e=>setPlanAction(e.target.value)} placeholder="الإجراء أو النشاط التربوي المتفق عليه" className="w-full text-xs bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 min-h-24"/>
            <div><label className="block text-xs font-bold text-slate-700 mb-1">موعد قياس التحسن</label><input required type="date" value={planFollowUpDate} onChange={e=>setPlanFollowUpDate(e.target.value)} className="w-full text-xs bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5"/></div>
            <button type="submit" className="w-full py-2.5 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-bold">حفظ الخطة وجدولة المتابعة</button>
          </form>
        </div>
      )}

      {profileStudent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-3xl p-6 space-y-5 my-6">
            <div className="flex items-start justify-between gap-4">
              <div><h3 className="text-lg font-black text-slate-900">ملف سمات الطالب</h3><p className="text-xs text-slate-500 mt-1">{profileStudent.name} · {profileStudent.grade} — {profileStudent.classroom}</p></div>
              <button onClick={()=>setProfileStudentId(null)} className="text-slate-400 hover:text-slate-700">✕</button>
            </div>
            {(() => { const score=storageService.calculateStudentBehaviorScore(profileStudent.id); return (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <div className="rounded-xl bg-slate-50 border border-slate-100 p-4"><div className="text-[11px] text-slate-500">الرصيد الحالي</div><div className="text-2xl font-black text-slate-900">{score.currentScore}%</div></div>
                <div className="rounded-xl bg-teal-50 border border-teal-100 p-4"><div className="text-[11px] text-teal-700">مستوى سمات</div><div className="text-sm font-black text-teal-800 mt-1">{getSamatStudentLevel(score.currentScore)}</div></div>
                <div className="rounded-xl bg-slate-50 border border-slate-100 p-4"><div className="text-[11px] text-slate-500">المواقف المسجلة</div><div className="text-2xl font-black text-slate-900">{profileTimeline.length}</div></div>
              </div>
            ); })()}
            {profilePlans.length > 0 && <div>
              <h4 className="text-sm font-extrabold text-slate-900 mb-3">خطط تحسين سمات</h4>
              <div className="space-y-2 mb-5">{profilePlans.map(plan => {
                const latest=plan.followups?.[plan.followups.length-1];
                return <div key={plan.id} className="rounded-xl border border-teal-100 bg-teal-50/40 p-4">
                  <div className="flex items-start justify-between gap-3"><div><div className="text-xs font-black text-slate-900">{plan.summary}</div><div className="text-[11px] text-slate-500 mt-1">{latest?.summary || 'لم تسجل متابعة بعد'}{latest?.followUpDate ? ` · المتابعة القادمة: ${latest.followUpDate}` : ''}</div></div><span className="text-[10px] font-bold text-teal-700">{plan.status}</span></div>
                  {plan.status !== 'CLOSED' && plan.status !== 'Closed' && <div className="mt-3 flex gap-2"><button onClick={()=>setFollowupCaseId(plan.id)} className="px-3 py-1.5 rounded-lg bg-white border border-teal-200 text-teal-700 text-[11px] font-bold">تسجيل نتيجة متابعة</button><button onClick={()=>setClosePlanId(plan.id)} className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-[11px] font-bold">تحقق الهدف وإغلاق الخطة</button></div>}
                </div>;
              })}</div>
            </div>}
            <div>
              <h4 className="text-sm font-extrabold text-slate-900 mb-3">السجل الزمني لسمات</h4>
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {profileTimeline.length === 0 ? <div className="text-xs text-slate-500 p-4 bg-slate-50 rounded-xl">لا توجد مواقف مسجلة لهذا الطالب حتى الآن.</div> : profileTimeline.map(item => (
                  <div key={item.id} className="flex items-start justify-between gap-4 p-3 rounded-xl border border-slate-100 bg-slate-50/60">
                    <div><div className="text-xs font-extrabold text-slate-900">{item.title}</div><div className="text-[11px] text-slate-500 mt-1">{item.date}{item.detail ? ` · ${item.detail}` : ''}</div>{item.balanceAfter !== undefined && <div className="text-[10px] text-slate-400 mt-1">الرصيد بعد العملية: {item.balanceAfter}</div>}</div>
                    <span className={`text-sm font-black ${item.points >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{item.points >= 0 ? '+' : ''}{item.points}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {isPositiveModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs">
          <form onSubmit={handleSavePositiveBehavior} className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-lg p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900">تسجيل تميز وتعزيز</h3>
              <button type="button" onClick={() => setIsPositiveModalOpen(false)} className="text-slate-400">✕</button>
            </div>
            <select required value={positiveStudentId} onChange={e=>setPositiveStudentId(e.target.value)} className="w-full text-xs bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5">
              <option value="">— اختر الطالب —</option>
              {students.map(s=><option key={s.id} value={s.id}>{s.name} ({s.grade} - {s.classroom})</option>)}
            </select>
            <select required value={positiveTypeId} onChange={e=>setPositiveTypeId(e.target.value)} className="w-full text-xs bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5">
              <option value="">— اختر نوع التميز —</option>
              {positiveTypes.filter(t=>t.isActive).map(t=><option key={t.id} value={t.id}>{t.name} (+{t.points})</option>)}
            </select>
            <textarea value={positiveNotes} onChange={e=>setPositiveNotes(e.target.value)} placeholder="ملاحظات أو وصف التميز" className="w-full text-xs bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 min-h-24" />
            <button type="submit" className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold">حفظ التعزيز وإضافة النقاط</button>
          </form>
        </div>
      )}

      {isRestoreModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs">
          <form onSubmit={handleRestorePoints} className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-lg p-6 space-y-4">
            <div className="flex items-center justify-between"><h3 className="text-base font-bold text-slate-900">استعادة نقاط بعد المتابعة التربوية</h3><button type="button" onClick={()=>setIsRestoreModalOpen(false)} className="text-slate-400">✕</button></div>
            <p className="text-xs text-slate-500">يستخدم هذا الإجراء بعد تحقق تحسن موثق. يجب تسجيل سبب الاستعادة، ولا يمكن إضافة أكثر من 30 نقطة في العملية الواحدة.</p>
            <select required value={restoreStudentId} onChange={e=>setRestoreStudentId(e.target.value)} className="w-full text-xs bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5"><option value="">— اختر الطالب —</option>{students.map(s=><option key={s.id} value={s.id}>{s.name} ({s.grade} - {s.classroom})</option>)}</select>
            <input type="number" min="1" max="30" value={restorePoints} onChange={e=>setRestorePoints(Number(e.target.value))} className="w-full text-xs bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5" />
            <textarea required value={restoreReason} onChange={e=>setRestoreReason(e.target.value)} placeholder="سبب الاستعادة والتحسن الذي تم التحقق منه" className="w-full text-xs bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 min-h-24" />
            <button type="submit" className="w-full py-2.5 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-bold">توثيق الاستعادة وتحديث الرصيد</button>
          </form>
        </div>
      )}

      {/* Record Violation Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden my-6">
            <div className="p-6 bg-amber-50 border-b border-amber-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Shield className="w-5 h-5 text-amber-600" />
                <h3 className="text-base font-bold text-slate-900">تسجيل موقف سلوكي لطالب</h3>
              </div>
              <button onClick={() => setIsAddModalOpen(false)} className="text-slate-400 hover:text-slate-700 cursor-pointer">
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveViolation} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  اسم الطالب <span className="text-rose-500">*</span>
                </label>
                <select
                  required
                  value={selectedStudentId}
                  onChange={e => setSelectedStudentId(e.target.value)}
                  className="w-full text-xs bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-slate-800 focus:outline-none focus:border-[#008e8b]"
                >
                  <option value="">— اختر من قائمة الطلاب —</option>
                  {students.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.grade} - {s.classroom})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  الموقف المرصود في منظومة سمات <span className="text-rose-500">*</span>
                </label>
                <select
                  required
                  value={selectedTypeId}
                  onChange={e => {
                    setSelectedTypeId(e.target.value);
                    const selected = behaviorTypes.find(t => t.id === e.target.value);
                    if (selected?.defaultAction) setActionTaken(selected.defaultAction);
                    if (selected?.notifyParent) setParentNotified(true);
                  }}
                  className="w-full text-xs bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-slate-800 focus:outline-none focus:border-[#008e8b]"
                >
                  <option value="">— اختر الموقف السلوكي —</option>
                  {behaviorTypes.filter(t => t.isActive).map(t => (
                    <option key={t.id} value={t.id}>
                      {t.name} (خصم: {t.points || t.weight} نقاط — {t.severity})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">تاريخ الواقعة</label>
                  <input
                    type="date"
                    value={violationDate}
                    onChange={e => setViolationDate(e.target.value)}
                    className="w-full text-xs bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">الإجراء المتخذ</label>
                  <input
                    type="text"
                    value={actionTaken}
                    onChange={e => setActionTaken(e.target.value)}
                    className="w-full text-xs bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 p-3 bg-slate-50 rounded-xl border border-slate-200">
                <input
                  type="checkbox"
                  id="parentNotifyCheck"
                  checked={parentNotified}
                  onChange={e => setParentNotified(e.target.checked)}
                  className="w-4 h-4 text-[#008e8b] rounded-sm"
                />
                <label htmlFor="parentNotifyCheck" className="text-xs font-bold text-slate-700 cursor-pointer">
                  تم إخطار ولي الأمر بالمخالفة هاتفياً أو عبر رسالة
                </label>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">تفاصيل الواقعة وملاحظات</label>
                <textarea
                  rows={3}
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="وصف مختصر للواقعة..."
                  className="w-full text-xs bg-slate-50 border border-slate-200 rounded-xl p-3 text-slate-800"
                />
              </div>

              <div className="pt-4 border-t border-slate-200 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-xl text-xs font-bold cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-6 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold shadow-xs cursor-pointer"
                >
                  تسجيل وخصم النقاط
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add / Edit Behavior Type Modal */}
      {isTypeEditorOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden my-6">
            <div className="p-6 bg-teal-50 border-b border-teal-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Settings className="w-5 h-5 text-[#008e8b]" />
                <h3 className="text-base font-bold text-slate-900">
                  {editingType ? 'تعديل بند مخالفة' : 'إضافة بند مخالفة جديد للائحة'}
                </h3>
              </div>
              <button onClick={() => setIsTypeEditorOpen(false)} className="text-slate-400 hover:text-slate-700 cursor-pointer">
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveBehaviorType} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  اسم بند المخالفة <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={typeName}
                  onChange={e => setTypeName(e.target.value)}
                  placeholder="مثال: التأخر عن الطابور الصباحي"
                  className="w-full text-xs bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-slate-800 focus:outline-none focus:border-[#008e8b]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">التصنيف</label>
                  <select
                    value={typeCategory}
                    onChange={e => setTypeCategory(e.target.value)}
                    className="w-full text-xs bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800"
                  >
                    <option value="انضباط مدرسي">انضباط مدرسي</option>
                    <option value="سلوكية داخل الفصل">سلوكية داخل الفصل</option>
                    <option value="مظهر وانضباط">مظهر وانضباط</option>
                    <option value="أخلاقية وتربوية">أخلاقية وتربوية</option>
                    <option value="ممتلكات عامة">ممتلكات عامة</option>
                    <option value="خطيرة">خطيرة</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">درجة الخطورة</label>
                  <select
                    value={typeSeverity}
                    onChange={e => setTypeSeverity(e.target.value)}
                    className="w-full text-xs bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800"
                  >
                    <option value="بسيطة">بسيطة</option>
                    <option value="متوسطة">متوسطة</option>
                    <option value="شديدة">شديدة</option>
                    <option value="خطيرة جداً">خطيرة جداً</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  النقاط المخصومة من السلوك <span className="text-rose-500">*</span>
                </label>
                <input
                  type="number"
                  min="1"
                  max="50"
                  required
                  value={typePoints}
                  onChange={e => setTypePoints(Number(e.target.value))}
                  className="w-full text-xs bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800 font-mono font-bold"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">الإجراء الافتراضي المقترح</label>
                <input
                  type="text"
                  value={typeDefaultAction}
                  onChange={e => setTypeDefaultAction(e.target.value)}
                  placeholder="مثال: تنبيه شفوي وتسجيل تأخير"
                  className="w-full text-xs bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800"
                />
              </div>

              <div className="space-y-2 pt-1">
                <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={typeNotifyParent}
                    onChange={e => setTypeNotifyParent(e.target.checked)}
                    className="w-4 h-4 text-[#008e8b] rounded-sm"
                  />
                  <span>إخطار ولي الأمر تلقائياً عند تسجيل هذا البند</span>
                </label>

                <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={typeRequiresReview}
                    onChange={e => setTypeRequiresReview(e.target.checked)}
                    className="w-4 h-4 text-[#008e8b] rounded-sm"
                  />
                  <span>يتطلب اعتماد ومراجعة الإدارة المدرسية</span>
                </label>

                <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={typeIsActive}
                    onChange={e => setTypeIsActive(e.target.checked)}
                    className="w-4 h-4 text-[#008e8b] rounded-sm"
                  />
                  <span>تفعيل هذا البند في نماذج الرصد</span>
                </label>
              </div>

              <div className="pt-4 border-t border-slate-200 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsTypeEditorOpen(false)}
                  className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-xl text-xs font-bold cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-6 py-2 bg-[#008e8b] hover:bg-[#007775] text-white rounded-xl text-xs font-bold shadow-xs cursor-pointer"
                >
                  {editingType ? 'حفظ التعديلات' : 'إضافة البند'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
