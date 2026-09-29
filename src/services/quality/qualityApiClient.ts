import type { QualityKpiContract } from '../../types';
import { postgresApiRequest } from '../backend/postgresRuntime';

export type QualityRecordType =
  | 'TEACHER_VISIT'
  | 'DAILY_REPORT'
  | 'COMPREHENSIVE_EVALUATION'
  | 'CORRECTIVE_ACTION'
  | 'QUALITY_STANDARD';

type SessionProvider = () => string;

export class QualityApiClient {
  constructor(private readonly getSessionToken: SessionProvider) {}

  private async request(body: Record<string, unknown>) {
    const response = await postgresApiRequest<any>('/quality/manage', this.getSessionToken(), {
      method: 'POST',
      body: JSON.stringify(body),
    });
    if (!response.ok || response.body?.status !== 'success') {
      throw new Error(response.body?.code || 'QUALITY_API_REQUEST_FAILED');
    }
    return response.body;
  }

  async list(recordType: QualityRecordType, schoolId: string): Promise<any[]> {
    const result = await this.request({ action: 'list', schoolId, recordType });
    return Array.isArray(result.data) ? result.data : [];
  }

  async metrics(schoolId: string): Promise<QualityKpiContract> {
    const result = await this.request({ action: 'metrics', schoolId });
    const data = result.data || {};
    const sampleSize = Math.max(0, Number(data.sampleSize) || 0);
    const value = data.value === null || data.value === undefined ? null : Number(data.value);
    return {
      value: Number.isFinite(value as number) ? value : null,
      sampleSize,
      period: data.period && typeof data.period === 'object'
        ? { from: String(data.period.from || ''), to: String(data.period.to || '') }
        : null,
      status: sampleSize > 0 && Number.isFinite(value as number) ? 'AVAILABLE' : 'N/A',
    };
  }

  async save(recordType: QualityRecordType, data: any, schoolId: string): Promise<any> {
    const result = await this.request({ action: 'save', schoolId, data: { ...data, recordType } });
    return result.data;
  }

  async approve(id: string, schoolId: string): Promise<any> {
    const result = await this.request({ action: 'approve', schoolId, data: { id } });
    return result.data;
  }

  async delete(id: string, schoolId: string): Promise<void> {
    await this.request({ action: 'delete', schoolId, data: { id } });
  }
}
