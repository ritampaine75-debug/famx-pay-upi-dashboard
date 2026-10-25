import { auth } from './firebase';

const DEV_SESSION_STORAGE_KEY = 'famx_dev_fallback_session';

export interface DevFallbackSession {
  uid: string;
  email: string;
  displayName: string;
  token: string;
}

export function createDevJwtToken(uid: string, email: string, name: string): string {
  const header = btoa(JSON.stringify({ alg: 'none', typ: 'JWT' }))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  const payload = btoa(
    JSON.stringify({
      sub: uid,
      user_id: uid,
      email,
      name,
      aud: 'hiiii-72d78',
      exp: Math.floor(Date.now() / 1000) + 86400 * 7,
    })
  )
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  return `${header}.${payload}.devsig`;
}

export function getStoredDevSession(): DevFallbackSession | null {
  try {
    const raw = sessionStorage.getItem(DEV_SESSION_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as DevFallbackSession;
  } catch {
    return null;
  }
}

export function setStoredDevSession(session: DevFallbackSession | null): void {
  try {
    if (!session) {
      sessionStorage.removeItem(DEV_SESSION_STORAGE_KEY);
    } else {
      sessionStorage.setItem(DEV_SESSION_STORAGE_KEY, JSON.stringify(session));
    }
  } catch {
    // Ignore storage errors
  }
}

export async function getAuthToken(): Promise<string | null> {
  if (auth.currentUser) {
    try {
      return await auth.currentUser.getIdToken();
    } catch {
      // Fall through
    }
  }
  const devSession = getStoredDevSession();
  return devSession?.token || null;
}

export async function apiRequest<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = await getAuthToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> | undefined),
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(path, {
    ...options,
    headers,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const errMsg =
      data?.error?.message || data?.message || `Request failed with HTTP ${res.status}`;
    const errCode = data?.error?.code || `HTTP_${res.status}`;
    const error = new Error(errMsg) as Error & { code?: string; status?: number };
    error.code = errCode;
    error.status = res.status;
    throw error;
  }

  return data as T;
}
