// Shared API client for the StockSure backend (server/API_CONTRACT.md).
//   success: { success: true,  message, data }
//   error:   { success: false, message, data: null, errors?: [{ field, message }] }   (errors only on 422)
// Auth is an httpOnly session cookie (never stored in JS). Every POST/PUT/PATCH/DELETE
// carries the CSRF token in the X-CSRF-Token header. The token is kept in memory only.

const BASE = import.meta.env.VITE_API_URL || '/api';
const CSRF_ERROR = 'Invalid or missing CSRF token';

export class ApiError extends Error {
  constructor(message, status, details) {
    super(message);
    this.status = status;
    this.details = details; // 422 field errors
  }
}

let csrfToken = null;
let onUnauthorized = null;

async function fetchCsrf() {
  const res = await fetch(`${BASE}/csrf-token`, { credentials: 'include' });
  const body = await res.json().catch(() => null);
  csrfToken = body?.data?.csrfToken ?? null;
  return csrfToken;
}

const FRIENDLY = {
  403: 'You do not have permission to do this.',
  404: 'Record not found.',
  413: 'That request is too large.',
  429: 'Too many attempts. Please wait a few minutes and try again.',
  500: 'Something went wrong on the server. Please try again.',
};

async function request(method, path, payload, retried = false) {
  const isMutation = method !== 'GET';
  if (isMutation && !csrfToken) await fetchCsrf();

  let res;
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      credentials: 'include',
      headers: {
        ...(payload ? { 'Content-Type': 'application/json' } : {}),
        ...(isMutation && csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
      },
      body: payload ? JSON.stringify(payload) : undefined,
    });
  } catch {
    throw new ApiError('Cannot reach the server. Is the backend running?', 0);
  }

  const body = await res.json().catch(() => null);

  if (!res.ok || body?.success === false) {
    // Token rotated (login/logout) or session expired: fetch a fresh one and retry once.
    if (res.status === 403 && body?.message === CSRF_ERROR && !retried) {
      await fetchCsrf();
      return request(method, path, payload, true);
    }
    if (res.status === 401 && onUnauthorized && path !== '/auth/login' && path !== '/auth/me') onUnauthorized();

    let message = body?.message || FRIENDLY[res.status] || 'Something went wrong';
    if (res.status === 422 && body?.errors?.length) message = body.errors.map((e) => e.message).join('. ');
    throw new ApiError(message, res.status, body?.errors);
  }
  return body?.data;
}

/** GET every page of a paginated list endpoint ({ items, pagination }). */
async function getAll(path) {
  const sep = path.includes('?') ? '&' : '?';
  const first = await request('GET', `${path}${sep}page=1&pageSize=100`);
  const items = [...first.items];
  for (let page = 2; page <= (first.pagination?.totalPages ?? 1); page += 1) {
    const next = await request('GET', `${path}${sep}page=${page}&pageSize=100`);
    items.push(...next.items);
  }
  return items;
}

export const api = {
  get: (p) => request('GET', p),
  getAll,
  post: (p, b) => request('POST', p, b ?? {}),
  put: (p, b) => request('PUT', p, b ?? {}),
  patch: (p, b) => request('PATCH', p, b ?? {}),
  del: (p) => request('DELETE', p),
  setCsrfToken: (t) => { csrfToken = t ?? null; },
  resetCsrf: () => { csrfToken = null; },
  onUnauthorized: (fn) => { onUnauthorized = fn; },
};
