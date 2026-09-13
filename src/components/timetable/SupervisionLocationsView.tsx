import React, { useState, useEffect } from 'react';
import {
  Building,
  Plus,
  Trash2,
  Edit2,
  CheckCircle2,
  XCircle,
  Shield,
} from 'lucide-react';
import { SupervisionLocation } from '../../types';
import { timetableService } from '../../services/timetableService';

export const SupervisionLocationsView: React.FC = () => {
  const [locations, setLocations] = useState<SupervisionLocation[]>([]);
  const [editingLoc, setEditingLoc] = useState<Partial<SupervisionLocation> | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const loadData = () => {
    setLocations(timetableService.getSupervisionLocations());
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleOpenAdd = () => {
    setEditingLoc({
      name: '',
      code: `LOC-${locations.length + 1}`,
      description: '',
      sortOrder: locations.length + 1,
      isActive: true,
    });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (loc: SupervisionLocation) => {
    setEditingLoc({ ...loc });
    setIsModalOpen(true);
  };

  const handleSave = () => {
    if (!editingLoc || !editingLoc.name?.trim()) return;

    const locToSave: SupervisionLocation = {
      id: editingLoc.id || `LOC-${Date.now()}`,
      name: editingLoc.name.trim(),
      code: editingLoc.code || `LOC-${Date.now()}`,
      description: editingLoc.description || '',
      sortOrder: Number(editingLoc.sortOrder) || 1,
      isActive: editingLoc.isActive ?? true,
    };

    timetableService.saveSupervisionLocation(locToSave);
    setIsModalOpen(false);
    setEditingLoc(null);
    loadData();
  };

  const handleDelete = (id: string) => {
    if (confirm('هل أنت متأكد من حذف موقع الإشراف هذا؟')) {
      timetableService.deleteSupervisionLocation(id);
      loadData();
    }
  };

  return (
    <div className="space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
        <div>
          <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <Building className="w-6 h-6 text-indigo-600" />
            أماكن ومواقع الإشراف المدرسي
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            تعريف وضبط نقاط ومواقع الإشراف (البوابات، الأدوار، المعامل، الكافتيريا، والباصات)
          </p>
        </div>

        <button
          onClick={handleOpenAdd}
          className="inline-flex items-center gap-2 px-4 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-sm transition"
        >
          <Plus className="w-4 h-4" />
          إضافة موقع إشراف جديد
        </button>
      </div>

      {/* Locations Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {locations.map(loc => (
          <div key={loc.id} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded">
                  {loc.code}
                </span>
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                    loc.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'
                  }`}
                >
                  {loc.isActive ? 'نشط' : 'معطل'}
                </span>
              </div>
              <h3 className="font-bold text-sm text-slate-900 mt-2">{loc.name}</h3>
              <p className="text-xs text-slate-500 mt-1 min-h-[32px]">{loc.description || 'لا يوجد وصف'}</p>
            </div>

            <div className="border-t border-slate-100 pt-3 mt-4 flex items-center justify-between">
              <span className="text-[11px] text-slate-400">ترتيب العرض: {loc.sortOrder}</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleOpenEdit(loc)}
                  className="text-slate-400 hover:text-indigo-600 p-1"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => handleDelete(loc.id)}
                  className="text-slate-400 hover:text-rose-600 p-1"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Edit / Add Modal */}
      {isModalOpen && editingLoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" dir="rtl">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-100 space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="font-bold text-base text-slate-800">
                {editingLoc.id ? 'تعديل موقع إشراف' : 'إضافة موقع إشراف جديد'}
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600 text-lg">
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">اسم الموقع</label>
                <input
                  type="text"
                  value={editingLoc.name || ''}
                  onChange={e => setEditingLoc({ ...editingLoc, name: e.target.value })}
                  placeholder="مثال: البوابة الرئيسية"
                  className="w-full border border-slate-300 rounded-lg p-2 text-xs"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">كود الموقع</label>
                <input
                  type="text"
                  value={editingLoc.code || ''}
                  onChange={e => setEditingLoc({ ...editingLoc, code: e.target.value })}
                  className="w-full border border-slate-300 rounded-lg p-2 text-xs"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">الوصف</label>
                <textarea
                  value={editingLoc.description || ''}
                  onChange={e => setEditingLoc({ ...editingLoc, description: e.target.value })}
                  rows={2}
                  className="w-full border border-slate-300 rounded-lg p-2 text-xs"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">ترتيب العرض</label>
                <input
                  type="number"
                  value={editingLoc.sortOrder || 1}
                  onChange={e => setEditingLoc({ ...editingLoc, sortOrder: Number(e.target.value) })}
                  className="w-full border border-slate-300 rounded-lg p-2 text-xs"
                />
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="locActive"
                  checked={editingLoc.isActive ?? true}
                  onChange={e => setEditingLoc({ ...editingLoc, isActive: e.target.checked })}
                  className="rounded text-indigo-600 focus:ring-indigo-500 h-4 w-4"
                />
                <label htmlFor="locActive" className="text-xs font-semibold text-slate-700">
                  موقع نشط ومعتمد للإشراف
                </label>
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
                onClick={handleSave}
                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold shadow-sm"
              >
                حفظ الموقع
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
