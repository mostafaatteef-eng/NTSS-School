import type { MonthlyAttendanceClosing, User } from '../types';
import { postgresApiRequest } from './backend/postgresRuntime';

type ClosingResult = { success: boolean; code?: string; message?: string; closing?: MonthlyAttendanceClosing; available?: boolean };

const activeSchoolId = (user: User | null): string =>
  String((user as any)?.activeSchoolId || (user as any)?.schoolId || '').trim();

async function post(user: User | null, action: string, month: number, year: number, extra: Record<string, unknown> = {}): Promise<ClosingResult> {
  const token = String((user as any)?.sessionToken || '').trim();
  const schoolId = activeSchoolId(user);
  if (!user || !token) return { success:false, code:'AUTH_REQUIRED', message:'يجب تسجيل الدخول بجلسة معتمدة.' };
  if (!schoolId) return { success:false, code:'SCHOOL_CONTEXT_REQUIRED', message:'يرجى اختيار المدرسة أولاً.' };
  const response = await postgresApiRequest<any>('/attendance-month-closing', token, {
    method:'POST',
    body:JSON.stringify({ action, schoolId, month, year, ...extra }),
  });
  const body=response.body||{};
  if (!response.ok || body.status!=='success') return { success:false, code:body.code||`HTTP_${response.status}`, message:body.message||'تعذر تنفيذ عملية إقفال الحضور.' };
  return { success:true, closing:body.data || undefined, available:body.available };
}

export const hrAttendanceClosingService = {
  capability: async (user: User | null, month: number, year: number) => post(user,'capability',month,year),
  get: async (user: User | null, month: number, year: number) => post(user,'get',month,year),
  close: async (user: User | null, month: number, year: number, notes: string) => post(user,'close',month,year,{notes}),
  reopen: async (user: User | null, month: number, year: number, reason: string) => post(user,'reopen',month,year,{reason}),
};
