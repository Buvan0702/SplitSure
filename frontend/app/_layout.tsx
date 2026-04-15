// app/_layout.tsx — Root layout
import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import { StatusBar } from 'expo-status-bar';
import * as Notifications from 'expo-notifications';
import { useAuthStore } from '../src/store/authStore';
import { ThemeProvider, useTheme } from '../src/utils/theme';

// Configure how notifications appear when the app is in the foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 2 },
    mutations: { retry: 0 },
  },
});

// Inner component that has access to theme context
function ThemedRootLayout() {
  const { loadUser } = useAuthStore();
  const { colors, isDark } = useTheme();

  useEffect(() => {
    loadUser();
  }, []);

  // Handle notification taps (deep link routing could be added here)
  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener((_response) => {
      // Navigation based on notification data can be added here
      // e.g., navigate to specific group/settlement screen
    });
    return () => subscription.remove();
  }, []);

  return (
    <>
      <StatusBar style={isDark ? "light" : "dark"} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="login" />
        <Stack.Screen name="group/[id]" />
        <Stack.Screen name="expense/[id]" />
        <Stack.Screen name="add-expense" />
        <Stack.Screen name="edit-expense" />
        <Stack.Screen name="balances" />
        <Stack.Screen name="settlements" />
        <Stack.Screen name="audit" />
        <Stack.Screen name="join/[token]" />
      </Stack>
      <Toast />
    </>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <ThemeProvider>
            <ThemedRootLayout />
          </ThemeProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
