const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

function token(): string | null {
  return typeof window === 'undefined' ? null : window.localStorage.getItem('finby_admin_token');
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}/api/v1${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token() ? { Authorization: `Bearer ${token()}` } : {}),
      ...init?.headers,
    },
  });
  if (!res.ok) throw new ApiError(res.status, `Request failed: ${res.status}`);
  return (await res.json()) as T;
}

export const api = {
  login: (body: { email: string; password: string; totp?: string }) =>
    request<{ accessToken: string; email: string }>('/admin/auth/login', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  enroll: (body: { email: string; password: string }) =>
    request<{ otpauthUrl: string; secret: string }>('/admin/auth/totp/enroll', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  growth: () => request<import('@finby/shared').GrowthMetrics>('/admin/metrics/growth'),
  engagement: () => request<import('@finby/shared').EngagementMetrics>('/admin/metrics/engagement'),
  revenue: () => request<import('@finby/shared').RevenueMetrics>('/admin/metrics/revenue'),
  streaks: () => request<import('@finby/shared').StreakLeaderboards>('/admin/metrics/streaks'),
  ops: () => request<import('@finby/shared').OpsMetrics>('/admin/metrics/ops'),
  funnel: (funnel: 'activation' | 'monetization' = 'activation', windowDays = 30) =>
    request<import('@finby/shared').FunnelMetrics>(
      `/admin/metrics/funnel?funnel=${funnel}&windowDays=${windowDays}`,
    ),
  users: (page = 1, search = '', plan = '', sort = 'newest') =>
    request<import('@finby/shared').AdminUsersPage>(
      `/admin/users?page=${page}&sort=${sort}` +
        (search ? `&search=${encodeURIComponent(search)}` : '') +
        (plan ? `&plan=${encodeURIComponent(plan)}` : ''),
    ),
  tickets: (status = '') =>
    request<{ tickets: import('@finby/shared').AdminSupportTicket[] }>(
      `/admin/tickets${status ? `?status=${encodeURIComponent(status)}` : ''}`,
    ),
  updateTicket: (id: string, status: string) =>
    request<import('@finby/shared').AdminSupportTicket>(`/admin/tickets/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    }),
  announcements: () =>
    request<import('@finby/shared').AdminAnnouncement[]>('/admin/announcements'),
  announcementAssets: () =>
    request<{ lottie: import('@finby/shared').LottieAsset[] }>('/admin/announcements/assets'),
  createAnnouncement: (body: import('@finby/shared').AdminAnnouncementInput) =>
    request<import('@finby/shared').AdminAnnouncement>('/admin/announcements', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  updateAnnouncement: (id: string, body: Partial<import('@finby/shared').AdminAnnouncementInput>) =>
    request<import('@finby/shared').AdminAnnouncement>(`/admin/announcements/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  archiveAnnouncement: (id: string) =>
    request<import('@finby/shared').AdminAnnouncement>(`/admin/announcements/${id}/archive`, {
      method: 'POST',
    }),
  restoreAnnouncement: (id: string) =>
    request<import('@finby/shared').AdminAnnouncement>(`/admin/announcements/${id}/restore`, {
      method: 'POST',
    }),
};
