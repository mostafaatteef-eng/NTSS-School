import React, { useState } from 'react';
import {
  CorrectiveAction,
  CorrectiveActionStatus,
  CorrectiveActionPriority,
  User,
} from '../../types';
import { storageService } from '../../services/storageService';
import {
  CheckSquare,
  Plus,
  Calendar,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Flame,
  User as UserIcon,
  Trash2,
  Edit2,
  Filter,
} from 'lucide-react';

interface Props {
  currentUser: User | null;
  actions: CorrectiveAction[];
  onRefresh: () => void;
  canCreate: boolean;
  canManage: boolean;
}

export const CorrectiveActionsSection: React.FC<Props> = ({
  currentUser,
  actions,
  onRefresh,
  canCreate,
  canManage,
}) => {
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [priorityFilter, setPriorityFilter] = useState<string>('ALL');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingAction, setEditingAction] = useState<CorrectiveAction | null>(null);

  // Form states
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [assignedToName, setAssignedToName] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [priority, setPriority] = useState<CorrectiveActionPriority>('MEDIUM');
  const [status, setStatus] = useState<CorrectiveActionStatus>('OPEN');
  const [resolutionNotes, setResolutionNotes] = useState('');

  const filteredActions = actions.filter((act) => {
    if (statusFilter !== 'ALL' && act.status !== statusFilter) return false;
    if (priorityFilter !== 'ALL' && act.priority !== priorityFilter) return false;
    return true;
  });

  const handleOpenNew = () => {
    setEditingAction(null);
    setTitle('');
    setDescription('');
    setAssignedToName('');
    setDueDate(new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0]);
    setPriority('MEDIUM');
    setStatus('OPEN');
    setResolutionNotes('');
    setIsModalOpen(true);
  };

  const handleOpenEdit = (act: CorrectiveAction) => {
    setEditingAction(act);
    setTitle(act.title);
    setDescription(act.description);
    setAssignedToName(act.assignedToName);
    setDueDate(act.dueDate);
    setPriority(act.priority);
    setStatus(act.status);
    setResolutionNotes(act.resolutionNotes || '');
    setIsModalOpen(true);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !assignedToName || !dueDate) {
      alert('يرجى تعبئة الحقول الأساسية: عنوان الإجراء، المكلف، وتاريخ الاستحقاق.');
      return;
    }

    const payload: Partial<CorrectiveAction> = {
      id: editingAction ? editingAction.id : undefined,
      title: title.trim(),
      description: description.trim(),
      assignedToName: assignedToName.trim(),
      dueDate,
      priority,
      status,
      resolutionNotes: resolutionNotes.trim(),
      resolvedAt: status === 'RESOLVED' || status === 'CLOSED' ? new Date().toISOString() : undefined,
    };

    const res = storageService.saveCorrectiveAction(payload, currentUser);
    if (res.success) {
      setIsModalOpen(false);
      onRefresh();
    } else {
      alert(res.message);
    }
  };

  const handleDelete = (id: string) => {
    if (!window.confirm('هل أنت متأكد من حذف هذا الإجراء التصحيحي؟')) return;
    const res = storageService.deleteCorrectiveAction(id, currentUser);
    if (res.success) {
      onRefresh();
    } else {
      alert(res.message);
    }
  };

  const priorityBadges: Record<CorrectiveActionPriority, { label: string; bg: string; text: string }> = {
    LOW: { label: 'منخفضة', bg: 'bg-slate-100', text: 'text-slate-700' },
    MEDIUM: { label: 'متوسطة', bg: 'bg-blue-100', text: 'text-blue-800' },
    HIGH: { label: 'عالية', bg: 'bg-amber-100', text: 'text-amber-800' },
    CRITICAL: { label: 'حرجة / عاجلة', bg: 'bg-rose-100', text: 'text-rose-800' },
  };

  const statusBadges: Record<CorrectiveActionStatus, { label: string; bg: string; text: string }> = {
    OPEN: { label: 'مفتوح قيد الانتظار', bg: 'bg-amber-50', text: 'text-amber-700' },
    Open: { label: 'مفتوح قيد الانتظار', bg: 'bg-amber-50', text: 'text-amber-700' },
    IN_PROGRESS: { label: 'جاري التنفيذ', bg: 'bg-blue-50', text: 'text-blue-700' },
    'In Progress': { label: 'جاري التنفيذ', bg: 'bg-blue-50', text: 'text-blue-700' },
    RESOLVED: { label: 'تمت المعالجة', bg: 'bg-emerald-50', text: 'text-emerald-700' },
    CLOSED: { label: 'مغلق ومؤرشف', bg: 'bg-slate-100', text: 'text-slate-600' },
    Closed: { label: 'مغلق ومؤرشف', bg: 'bg-slate-100', text: 'text-slate-600' },
    OVERDUE: { label: 'متأخر ومتجاوز للمهلة', bg: 'bg-rose-50', text: 'text-rose-700' },
    Overdue: { label: 'متأخر ومتجاوز للمهلة', bg: 'bg-rose-50', text: 'text-rose-700' },
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <CheckSquare className="w-6 h-6 text-indigo-600" />
            سجل الإجراءات التصحيحية والتحسين (Corrective Actions)
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            متابعة إغلاق الفجوات والملاحظات الناتجة عن الزيارات الصفية وتقارير الجودة الميدانية.
          </p>
        </div>

        {canCreate && (
          <button
            id="create-corrective-action-btn"
            onClick={handleOpenNew}
            className="px-4 py-2 text-sm bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-lg flex items-center gap-2 transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4" />
            تسجيل إجراء تصحيحي جديد
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-slate-500" />
            <span className="text-xs font-bold text-slate-700">الحالة:</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 font-medium"
            >
              <option value="ALL">جميع الحالات</option>
              <option value="OPEN">مفتوح</option>
              <option value="IN_PROGRESS">جاري التنفيذ</option>
              <option value="RESOLVED">تمت المعالجة</option>
              <option value="CLOSED">مغلق</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-700">الأولوية:</span>
            <select
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value)}
              className="px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 font-medium"
            >
              <option value="ALL">جميع الأولويات</option>
              <option value="LOW">منخفضة</option>
              <option value="MEDIUM">متوسطة</option>
              <option value="HIGH">عالية</option>
              <option value="CRITICAL">حرجة / عاجلة</option>
            </select>
          </div>
        </div>

        <div className="text-xs font-bold text-slate-500">
          إجمالي الإجراءات المعروضة: {filteredActions.length} من {actions.length}
        </div>
      </div>

      {/* Actions Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right border-collapse text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-700 font-semibold text-xs">
                <th className="p-3.5">عنوان الإجراء التصحيحي</th>
                <th className="p-3.5">المسؤول عن التنفيذ</th>
                <th className="p-3.5 text-center">الأولوية</th>
                <th className="p-3.5 text-center">تاريخ الاستحقاق</th>
                <th className="p-3.5 text-center">الحالة</th>
                <th className="p-3.5">ملاحظات الإغلاق / المعالجة</th>
                {canManage && <th className="p-3.5 text-center">إجراءات</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredActions.length === 0 ? (
                <tr>
                  <td colSpan={canManage ? 7 : 6} className="text-center py-10 text-slate-400">
                    لا توجد إجراءات تصحيحية مطابقة لخيارات التصفية.
                  </td>
                </tr>
              ) : (
                filteredActions.map((act) => {
                  const pBadge = priorityBadges[act.priority] || priorityBadges.MEDIUM;
                  const sBadge = statusBadges[act.status] || statusBadges.OPEN;
                  const isOverdue =
                    act.status !== 'RESOLVED' &&
                    act.status !== 'CLOSED' &&
                    new Date(act.dueDate) < new Date();

                  return (
                    <tr key={act.id} className="hover:bg-slate-50 transition-colors">
                      <td className="p-3.5">
                        <div className="font-bold text-slate-900">{act.title}</div>
                        {act.description && (
                          <div className="text-xs text-slate-500 mt-0.5 max-w-sm">
                            {act.description}
                          </div>
                        )}
                      </td>
                      <td className="p-3.5">
                        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-700">
                          <UserIcon className="w-3.5 h-3.5 text-slate-400" />
                          {act.assignedToName}
                        </span>
                      </td>
                      <td className="p-3.5 text-center">
                        <span
                          className={`px-2.5 py-1 text-xs font-bold rounded-full ${pBadge.bg} ${pBadge.text}`}
                        >
                          {pBadge.label}
                        </span>
                      </td>
                      <td className="p-3.5 text-center whitespace-nowrap">
                        <span
                          className={`text-xs font-medium ${
                            isOverdue ? 'text-rose-600 font-bold' : 'text-slate-700'
                          }`}
                        >
                          {act.dueDate}
                          {isOverdue && (
                            <span className="block text-[10px] text-rose-500 font-bold">
                              متأخر
                            </span>
                          )}
                        </span>
                      </td>
                      <td className="p-3.5 text-center">
                        <span
                          className={`px-2.5 py-1 text-xs font-bold rounded-md border ${sBadge.bg} ${sBadge.text}`}
                        >
                          {sBadge.label}
                        </span>
                      </td>
                      <td className="p-3.5 text-slate-600 max-w-xs text-xs truncate">
                        {act.resolutionNotes || '—'}
                      </td>
                      {canManage && (
                        <td className="p-3.5 text-center">
                          <div className="flex items-center justify-center gap-2">
                            <button
                              onClick={() => handleOpenEdit(act)}
                              className="p-1 text-slate-400 hover:text-indigo-600 rounded transition-colors"
                              title="تحديث الإجراء"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDelete(act.id)}
                              className="p-1 text-slate-400 hover:text-rose-600 rounded transition-colors"
                              title="حذف"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal: Add/Edit Corrective Action */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl max-w-xl w-full max-h-[90vh] overflow-y-auto shadow-2xl border border-slate-200">
            <div className="p-5 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <CheckSquare className="w-5 h-5 text-indigo-600" />
                {editingAction ? 'تعديل الإجراء التصحيحي' : 'تسجيل إجراء تصحيحي جديد'}
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 text-xl font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSave} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  عنوان الإجراء المطلوب *
                </label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="مثال: صيانة طفايات الحريق في المعمل المدرسي"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  تفاصيل ووصف الإجراء
                </label>
                <textarea
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="شرح الإجراء وخطة التنفيذ المتبعة..."
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    المسؤول عن التنفيذ *
                  </label>
                  <input
                    type="text"
                    required
                    value={assignedToName}
                    onChange={(e) => setAssignedToName(e.target.value)}
                    placeholder="اسم الموظف أو رئيس القسم..."
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    تاريخ الاستحقاق (Due Date) *
                  </label>
                  <input
                    type="date"
                    required
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    مستوى الأولوية *
                  </label>
                  <select
                    value={priority}
                    onChange={(e) => setPriority(e.target.value as CorrectiveActionPriority)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="LOW">منخفضة</option>
                    <option value="MEDIUM">متوسطة</option>
                    <option value="HIGH">عالية</option>
                    <option value="CRITICAL">حرجة / عاجلة</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    حالة الإجراء *
                  </label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as CorrectiveActionStatus)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="OPEN">مفتوح قيد الانتظار</option>
                    <option value="IN_PROGRESS">جاري التنفيذ</option>
                    <option value="RESOLVED">تمت المعالجة والإنجاز</option>
                    <option value="CLOSED">مغلق ومؤرشف</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  ملاحظات التحقق من الإغلاق والمعالجة (Resolution Notes)
                </label>
                <textarea
                  rows={2}
                  value={resolutionNotes}
                  onChange={(e) => setResolutionNotes(e.target.value)}
                  placeholder="توثيق نتيجة المتابعة والتأكد من إغلاق الملاحظة نهائياً..."
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-sm bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-colors font-medium"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-sm bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors font-semibold shadow-sm"
                >
                  حفظ الإجراء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
