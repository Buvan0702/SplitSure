import { create } from 'zustand';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import * as Notifications from 'expo-notifications';
import { User } from '../types';
import { authAPI, registerAuthFailureHandler, usersAPI } from '../services/api';

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
  clearSession: () => Promise<void>;
  loadUser: () => Promise<void>;
  updateUser: (data: Partial<User>) => void;
  registerPushToken: () => Promise<void>;
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

    // Register push token after successful login
    setTimeout(() => { void get().registerPushToken(); }, 1000);
  },

  logout: async () => {
    try {
      await authAPI.logout();
    } catch {}
    await get().clearSession();
  },

  clearSession: async () => {
    await SecureStore.deleteItemAsync('access_token');
    await SecureStore.deleteItemAsync('refresh_token');
    set({ user: null, isAuthenticated: false, isLoading: false });
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

      // Register push token after loading user
      setTimeout(() => { void get().registerPushToken(); }, 1000);
    } catch {
      await get().clearSession();
    } finally {
      set({ isLoading: false });
    }
  },

  updateUser: (data: Partial<User>) => {
    const current = get().user;
    if (current) set({ user: { ...current, ...data } });
  },

  registerPushToken: async () => {
    try {
      if (Platform.OS === 'web') return;

      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;

      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }

      if (finalStatus !== 'granted') return;

      const tokenData = await Notifications.getExpoPushTokenAsync();
      const pushToken = tokenData.data;

      if (pushToken) {
        await usersAPI.registerPushToken(pushToken);
      }
    } catch {
      // Push registration is non-fatal — silently fail
    }
  },
}));

registerAuthFailureHandler(() => {
  void useAuthStore.getState().clearSession();
});
