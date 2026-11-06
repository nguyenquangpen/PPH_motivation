import type { ErrorBody, Page } from '@pph/shared';

export const API_BASE = '/api/v1';

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export const isApiError = (e: unknown): e is ApiError => e instanceof ApiError;
export const isNotFound = (e: unknown): boolean => isApiError(e) && e.status === 404;

/** Message to show the user for any error. */
export function errorMessage(e: unknown): string {
  if (isApiError(e)) return e.message;
  if (e instanceof Error) return e.message;
  return 'Đã xảy ra lỗi không xác định';
}

export function newIdempotencyKey(): string {
  const c = globalThis.crypto as Crypto | undefined;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    return (ch === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export type Query = Record<string, string | number | boolean | null | undefined>;

export type RequestOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  query?: Query;
  /** Send an Idempotency-Key header (ledger-changing endpoints). */
  idempotent?: boolean;
};

export function buildUrl(path: string, query?: Query): string {
  const params = new URLSearchParams();
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v === undefined || v === null || v === '') continue;
      params.set(k, String(v));
    }
  }
  const qs = params.toString();
  return `${API_BASE}${path}${qs ? `?${qs}` : ''}`;
}

export async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  if (opts.idempotent) headers['Idempotency-Key'] = newIdempotencyKey();

  let res: Response;
  try {
    res = await fetch(buildUrl(path, opts.query), {
      method: opts.method ?? 'GET',
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'NETWORK', 'Không kết nối được máy chủ');
  }

  const text = await res.text();
  let data: unknown = undefined;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = undefined;
    }
  }

  if (!res.ok) {
    const err = (data as Partial<ErrorBody> | undefined)?.error;
    if (err && typeof err.message === 'string') {
      throw new ApiError(res.status, err.code ?? 'ERROR', err.message, err.details);
    }
    const fallback =
      res.status === 404 ? 'Không tìm thấy (chức năng có thể chưa sẵn sàng)' : `Lỗi máy chủ (${res.status})`;
    throw new ApiError(res.status, res.status === 404 ? 'NOT_FOUND' : 'HTTP_ERROR', fallback);
  }
  return data as T;
}

/** Accept either a Page<T> or a plain array from the server. */
export function toPage<T>(r: Page<T> | T[] | null | undefined, page = 1, pageSize = 50): Page<T> {
  if (!r) return { items: [], page, pageSize, total: 0 };
  if (Array.isArray(r)) return { items: r, page, pageSize: r.length || pageSize, total: r.length };
  return r;
}

export function toArray<T>(r: T[] | Page<T> | { items: T[] } | null | undefined): T[] {
  if (!r) return [];
  if (Array.isArray(r)) return r;
  return Array.isArray(r.items) ? r.items : [];
}
