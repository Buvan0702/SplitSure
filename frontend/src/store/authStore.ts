import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import { User } from '../types';
import { authAPI, usersAPI } from '../services/api';

type SendOtpResponse = {
  message: string;
  dev_otp?: string;
  dev_note?: string;
};

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;

  // Actions
  sendOTP: (phone: string) => Promise<SendOtpResponse>;
  verifyOTP: (phone: string, otp: string) => Promise<void>;
  logout: () => Promise<void>;
  loadUser: () => Promise<void>;
  updateUser: (data: Partial<User>) => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  isAuthenticated: false,
  isLoading: true,

  sendOTP: async (phone: string) => {
    const { data } = await authAPI.sendOTP(phone);
    return data; // includes dev_otp when USE_DEV_OTP=true
  },

  verifyOTP: async (phone: string, otp: string) => {
    const { data } = await authAPI.verifyOTP(phone, otp);
    await SecureStore.setItemAsync('access_token', data.access_token);
    await SecureStore.setItemAsync('refresh_token', data.refresh_token);
    set({ user: data.user, isAuthenticated: true });
  },

  logout: async () => {
    try {
      await authAPI.logout();
    } catch {}
    await SecureStore.deleteItemAsync('access_token');
    await SecureStore.deleteItemAsync('refresh_token');
    set({ user: null, isAuthenticated: false });
  },

  loadUser: async () => {
    set({ isLoading: true });
    try {
      const token = await SecureStore.getItemAsync('access_token');
      if (!token) {
        set({ isLoading: false });
        return;
      }
      const { data } = await usersAPI.getMe();
      set({ user: data, isAuthenticated: true });
    } catch {
      set({ user: null, isAuthenticated: false });
    } finally {
      set({ isLoading: false });
    }
  },

  updateUser: (data: Partial<User>) => {
    const current = get().user;
    if (current) set({ user: { ...current, ...data } });
  },
}));
