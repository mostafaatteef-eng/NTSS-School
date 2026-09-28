/**
 * Runtime backend routing for the staged GAS -> Neon migration.
 * A PostgreSQL-issued session must never be sent to the legacy GAS backend.
 */
export const POSTGRES_API_URL =
  ((typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_POSTGRES_API_URL) as string || '')
    .trim()
    .replace(/\/$/, '');

export const isPostgresBackendEnabled = (): boolean => POSTGRES_API_URL.length > 0;

export async function postgresApiRequest<T>(
  path: string,
  sessionToken: string,
  init: RequestInit = {}
): Promise<{ ok: boolean; status: number; body: T | any }> {
  if (!POSTGRES_API_URL) {
    return { ok: false, status: 0, body: { status: 'error', code: 'POSTGRES_API_NOT_CONFIGURED' } };
  }
  const headers = new Headers(init.headers || {});
  headers.set('Accept', 'application/json');
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  if (sessionToken) headers.set('Authorization', `Bearer ${sessionToken}`);

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);
    const response = await fetch(`${POSTGRES_API_URL}/api${path.startsWith('/') ? path : `/${path}`}`, {
      ...init,
      headers,
      signal: init.signal || controller.signal,
    });
    clearTimeout(timeoutId);
    const body = await response.json().catch(() => ({}));
    return { ok: response.ok, status: response.status, body };
  } catch (error) {
    const isAbort = typeof DOMException !== 'undefined' && error instanceof DOMException && error.name === 'AbortError';
    const code = isAbort ? 'POSTGRES_API_TIMEOUT' : 'POSTGRES_API_UNREACHABLE';
    return { ok: false, status: 0, body: { status: 'error', code } };
  }
}
