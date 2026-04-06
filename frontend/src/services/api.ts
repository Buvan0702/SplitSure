import axios, { AxiosError } from 'axios';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const RAW_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:8000/api/v1';

function resolveBaseUrl(baseUrl: string) {
  if (Platform.OS !== 'android') return baseUrl;

  // Android emulator cannot reach host machine via localhost.
  return baseUrl
    .replace('://localhost', '://10.0.2.2')
    .replace('://127.0.0.1', '://10.0.2.2');
}

const BASE_URL = resolveBaseUrl(RAW_BASE_URL);

export const api = axios.create({
  baseURL: BASE_URL,
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
});

// ── Request interceptor: attach access token ──────────────────────────────
api.interceptors.request.use(async (config) => {
  const token = await SecureStore.getItemAsync('access_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// ── Response interceptor: refresh on 401 ─────────────────────────────────
let isRefreshing = false;
let failedQueue: Array<{ resolve: Function; reject: Function }> = [];

function processQueue(error: AxiosError | null, token: string | null) {
  failedQueue.forEach(({ resolve, reject }) => {
    if (error) reject(error);
    else resolve(token);
  });
  failedQueue = [];
}

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as any;
    if (error.response?.status === 401 && !originalRequest._retry) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        }).then((token) => {
          originalRequest.headers.Authorization = `Bearer ${token}`;
          return api(originalRequest);
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const refreshToken = await SecureStore.getItemAsync('refresh_token');
        if (!refreshToken) throw new Error('No refresh token');

        const { data } = await axios.post(`${BASE_URL}/auth/refresh`, {
          refresh_token: refreshToken,
        });

        await SecureStore.setItemAsync('access_token', data.access_token);
        await SecureStore.setItemAsync('refresh_token', data.refresh_token);

        api.defaults.headers.common.Authorization = `Bearer ${data.access_token}`;
        processQueue(null, data.access_token);
        return api(originalRequest);
      } catch (err) {
        processQueue(err as AxiosError, null);
        await SecureStore.deleteItemAsync('access_token');
        await SecureStore.deleteItemAsync('refresh_token');
        // Trigger logout in store
        return Promise.reject(err);
      } finally {
        isRefreshing = false;
      }
    }
    return Promise.reject(error);
  }
);

// ── Auth ──────────────────────────────────────────────────────────────────
export const authAPI = {
  sendOTP: (phone: string) => api.post('/auth/send-otp', { phone }),
  verifyOTP: (phone: string, otp: string) =>
    api.post('/auth/verify-otp', { phone, otp }),
  refresh: (refresh_token: string) =>
    api.post('/auth/refresh', { refresh_token }),
  logout: () => api.post('/auth/logout'),
};

// ── Users ─────────────────────────────────────────────────────────────────
export const usersAPI = {
  getMe: () => api.get('/users/me'),
  updateMe: (data: { name?: string; email?: string; upi_id?: string }) =>
    api.patch('/users/me', data),
};

// ── Groups ────────────────────────────────────────────────────────────────
export const groupsAPI = {
  list: () => api.get('/groups'),
  get: (id: number) => api.get(`/groups/${id}`),
  create: (data: { name: string; description?: string }) =>
    api.post('/groups', data),
  update: (id: number, data: { name?: string; description?: string }) =>
    api.patch(`/groups/${id}`, data),
  archive: (id: number) => api.delete(`/groups/${id}`),
  addMember: (groupId: number, phone: string) =>
    api.post(`/groups/${groupId}/members`, { phone }),
  removeMember: (groupId: number, userId: number) =>
    api.delete(`/groups/${groupId}/members/${userId}`),
  createInvite: (groupId: number) => api.post(`/groups/${groupId}/invite`),
  joinViaInvite: (token: string) => api.post(`/groups/join/${token}`),
};

// ── Expenses ──────────────────────────────────────────────────────────────
export const expensesAPI = {
  list: (groupId: number, params?: { category?: string; search?: string }) =>
    api.get(`/groups/${groupId}/expenses`, { params }),
  get: (groupId: number, id: number) =>
    api.get(`/groups/${groupId}/expenses/${id}`),
  create: (groupId: number, data: any) =>
    api.post(`/groups/${groupId}/expenses`, data),
  update: (groupId: number, id: number, data: any) =>
    api.patch(`/groups/${groupId}/expenses/${id}`, data),
  delete: (groupId: number, id: number) =>
    api.delete(`/groups/${groupId}/expenses/${id}`),
  dispute: (groupId: number, id: number, note: string) =>
    api.post(`/groups/${groupId}/expenses/${id}/dispute`, { note }),
  resolveDispute: (groupId: number, id: number) =>
    api.post(`/groups/${groupId}/expenses/${id}/resolve-dispute`),
  uploadAttachment: (groupId: number, expenseId: number, formData: FormData) =>
    api.post(`/groups/${groupId}/expenses/${expenseId}/attachments`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),
};

// ── Settlements ───────────────────────────────────────────────────────────
export const settlementsAPI = {
  getBalances: (groupId: number) =>
    api.get(`/groups/${groupId}/settlements/balances`),
  list: (groupId: number) => api.get(`/groups/${groupId}/settlements`),
  initiate: (groupId: number, data: { receiver_id: number; amount: number }) =>
    api.post(`/groups/${groupId}/settlements`, data),
  confirm: (groupId: number, id: number) =>
    api.post(`/groups/${groupId}/settlements/${id}/confirm`),
  dispute: (groupId: number, id: number, note: string) =>
    api.post(`/groups/${groupId}/settlements/${id}/dispute`, { note }),
  resolve: (groupId: number, id: number, resolution_note: string) =>
    api.post(`/groups/${groupId}/settlements/${id}/resolve`, { resolution_note }),
};

// ── Audit ─────────────────────────────────────────────────────────────────
export const auditAPI = {
  list: (groupId: number, params?: { limit?: number; offset?: number }) =>
    api.get(`/groups/${groupId}/audit`, { params }),
};

// ── Reports ───────────────────────────────────────────────────────────────
export const reportsAPI = {
  generate: (groupId: number) =>
    api.get(`/groups/${groupId}/report`, { responseType: 'blob' }),
};
