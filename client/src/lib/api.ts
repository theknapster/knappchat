export interface SessionUser {
  userId: string;
  email: string;
  nickname: string | null;
}

export function displayName(user: SessionUser): string {
  return user.nickname ?? user.email;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    credentials: 'include',
    ...init,
    headers: {
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...init?.headers,
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message ?? body.error ?? `request failed: ${res.status}`);
  }
  return res.json();
}

export function fetchMe(): Promise<{ user: SessionUser | null }> {
  return request('/me');
}

export function requestLoginLink(email: string): Promise<{ ok: true }> {
  return request('/auth/request-link', {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
}

export function logout(): Promise<{ ok: true }> {
  return request('/auth/logout', { method: 'POST' });
}

export interface ChatMessage {
  id: string;
  body: string;
  created_at: string;
  author_id: string;
  author_name: string;
}

export interface OnlineUser {
  userId: string;
  name: string;
}

export function setNickname(nickname: string): Promise<{ nickname: string | null }> {
  return request('/me/nickname', {
    method: 'PUT',
    body: JSON.stringify({ nickname }),
  });
}

export function fetchMessages(before?: string): Promise<{ messages: ChatMessage[] }> {
  const qs = before ? `?before=${encodeURIComponent(before)}` : '';
  return request(`/messages${qs}`);
}

export function fetchVoiceToken(): Promise<{ token: string; url: string }> {
  return request('/voice/token', { method: 'POST' });
}
