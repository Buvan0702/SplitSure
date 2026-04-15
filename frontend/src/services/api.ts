import axios, { AxiosError } from 'axios';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import type { ExpenseCategory, SplitType } from '../types';

export function getApiErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof AxiosError) {
    return error.response?.data?.detail || fallback;
  }
  if (error instanceof Error) {
    return error.message || fallback;
  }
  return fallback;
}

const DEFAULT_DEV_API_URL = 'https://splitsure.onrender.com/api/v1';
const DEFAULT_PROD_API_URL = 'https://splitsure.onrender.com/api/v1';
const API_TIMEOUT_MS = 60000;
const AUTH_TIMEOUT_MS = 90000;

function normalizeBaseUrl(baseUrl: string) {
  return baseUrl.trim().replace(/\/+$/, '');
}

const RAW_BASE_URL = normalizeBaseUrl(
  process.env.EXPO_PUBLIC_API_URL || (__DEV__ ? DEFAULT_DEV_API_URL : DEFAULT_PROD_API_URL)
);

function resolveBaseUrl(baseUrl: string) {
  if (Platform.OS !== 'android') return baseUrl;

  // Android emulator cannot reach host machine via localhost.
  return baseUrl
    .replace('://localhost', '://10.0.2.2')
    .replace('://127.0.0.1', '://10.0.2.2');
}

const BASE_URL = resolveBaseUrl(RAW_BASE_URL);
const API_ROOT_URL = BASE_URL.replace(/\/api\/v1\/?$/, '');
const HEALTHCHECK_URL = `${API_ROOT_URL}/health`;

export const api = axios.create({
  baseURL: BASE_URL,
  timeout: API_TIMEOUT_MS,
  headers: { 'Content-Type': 'application/json' },
});

let backendWakePromise: Promise<void> | null = null;
let authFailureHandler: (() => void) | null = null;

export function registerAuthFailureHandler(handler: (() => void) | null) {
  authFailureHandler = handler;
}

function isTransientNetworkError(error: unknown) {
  const axiosError = error as AxiosError;
  return axiosError.code === 'ECONNABORTED' || axiosError.message === 'Network Error';
}

async function ensureBackendAwake() {
  if (backendWakePromise) {
    await backendWakePromise;
    return;
  }

  backendWakePromise = axios
    .get(HEALTHCHECK_URL, { timeout: AUTH_TIMEOUT_MS })
    .then(() => undefined)
    .finally(() => {
      backendWakePromise = null;
    });

  await backendWakePromise;
}

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
        authFailureHandler?.();
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
  sendOTP: async (phone: string) => {
    try {
      await ensureBackendAwake();
    } catch {}

    try {
      return await api.post('/auth/send-otp', { phone }, { timeout: AUTH_TIMEOUT_MS });
    } catch (error) {
      if (!isTransientNetworkError(error)) throw error;
      await ensureBackendAwake();
      return api.post('/auth/send-otp', { phone }, { timeout: AUTH_TIMEOUT_MS });
    }
  },
  verifyOTP: async (phone: string, otp: string) => {
    try {
      return await api.post('/auth/verify-otp', { phone, otp }, { timeout: AUTH_TIMEOUT_MS });
    } catch (error) {
      if (!isTransientNetworkError(error)) throw error;
      await ensureBackendAwake();
      return api.post('/auth/verify-otp', { phone, otp }, { timeout: AUTH_TIMEOUT_MS });
    }
  },
  refresh: (refresh_token: string) =>
    api.post('/auth/refresh', { refresh_token }),
  logout: () => api.post('/auth/logout'),
};

// ── Users ─────────────────────────────────────────────────────────────────
export const usersAPI = {
  getMe: () => api.get('/users/me'),
  updateMe: (data: { name?: string; email?: string; upi_id?: string }) =>
    api.patch('/users/me', data),
  uploadAvatar: (formData: FormData) =>
    api.post('/users/me/avatar', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),
  registerPushToken: (push_token: string) =>
    api.post('/users/me/push-token', { push_token }),
  checkPhoneRegistration: (phone: string) =>
    api.post('/users/check-phone', { phone }).then(res => res.data),
};

// ── Groups ────────────────────────────────────────────────────────────────
export const groupsAPI = {
  list: (params?: { include_archived?: boolean }) => api.get('/groups', { params }),
  get: (id: number) => api.get(`/groups/${id}`),
  create: (data: { name: string; description?: string }) =>
    api.post('/groups', data),
  update: (id: number, data: { name?: string; description?: string }) =>
    api.patch(`/groups/${id}`, data),
  archive: (id: number) => api.delete(`/groups/${id}`),
  unarchive: (id: number) => api.post(`/groups/${id}/unarchive`),
  addMember: (groupId: number, phone: string) =>
    api.post(`/groups/${groupId}/members`, { phone }),
  removeMember: (groupId: number, userId: number) =>
    api.delete(`/groups/${groupId}/members/${userId}`),
  createInvite: (groupId: number) => api.post(`/groups/${groupId}/invite`),
  joinViaInvite: (token: string) => api.post(`/groups/join/${token}`),
};

// ── Expenses ──────────────────────────────────────────────────────────────
export const expensesAPI = {
  list: (groupId: number, params?: { category?: string; search?: string; limit?: number; offset?: number }) =>
    api.get(`/groups/${groupId}/expenses`, { params }),
  get: (groupId: number, id: number) =>
    api.get(`/groups/${groupId}/expenses/${id}`),
  create: (
    groupId: number,
    data: {
      amount: number;
      description: string;
      category: ExpenseCategory;
      split_type: SplitType;
      splits: Array<{ user_id: number; amount?: number; percentage?: number }>;
    }
  ) =>
    api.post(`/groups/${groupId}/expenses`, data),
  update: (
    groupId: number,
    id: number,
    data: {
      amount?: number;
      description?: string;
      category?: ExpenseCategory;
      split_type?: SplitType;
      splits?: Array<{ user_id: number; amount?: number; percentage?: number }>;
    }
  ) =>
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
    api.get(`/groups/${groupId}/report`, { responseType: 'arraybuffer' }),
};
