import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('Quality domain client extraction', () => {
  const storage = fs.readFileSync('src/services/storageService.ts','utf8');
  const client = fs.readFileSync('src/services/quality/qualityApiClient.ts','utf8');

  it('delegates authoritative quality transport out of the storage god service', () => {
    expect(storage).toContain("from './quality/qualityApiClient'");
    expect(storage).toContain('return this.getQualityApiClient().list(recordType,target)');
    expect(storage).toContain('return this.getQualityApiClient().metrics(target)');
    expect(storage).toContain('return this.getQualityApiClient().save(recordType,data,target)');
    expect(storage).toContain('return this.getQualityApiClient().approve(id,target)');
    expect(storage).toContain('return this.getQualityApiClient().delete(id,target)');
  });

  it('keeps PostgreSQL quality transport inside the domain client', () => {
    expect(client).toContain("postgresApiRequest<any>('/quality/manage'");
    for (const action of ['list','metrics','save','approve','delete']) {
      expect(client).toContain(`action: '${action}'`);
    }
  });
});
