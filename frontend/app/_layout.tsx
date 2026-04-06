// app/_layout.tsx — Root layout
import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import { StatusBar } from 'expo-status-bar';
import { useAuthStore } from '../src/store/authStore';
import { Colors } from '../src/utils/theme';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 2 },
    mutations: { retry: 0 },
  },
});

export default function RootLayout() {
  const { loadUser } = useAuthStore();

  useEffect(() => {
    loadUser();
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <StatusBar style="dark" />
          <Stack
            screenOptions={{
              headerStyle: { backgroundColor: Colors.surface },
              headerTintColor: Colors.textPrimary,
              headerTitleStyle: { fontWeight: '800', fontSize: 17 },
              headerShadowVisible: false,
              contentStyle: { backgroundColor: Colors.background },
            }}
          >
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="login" options={{ headerShown: false }} />
            <Stack.Screen
              name="group/[id]"
              options={{ title: 'Group', headerBackTitle: 'Groups' }}
            />
            <Stack.Screen
              name="expense/[id]"
              options={{ title: 'Expense Detail', headerBackTitle: 'Back' }}
            />
            <Stack.Screen
              name="add-expense"
              options={{ title: 'Add Expense', presentation: 'modal' }}
            />
            <Stack.Screen
              name="balances"
              options={{ title: 'Balances', headerBackTitle: 'Group' }}
            />
            <Stack.Screen
              name="settlements"
              options={{ title: 'Settlements', headerBackTitle: 'Group' }}
            />
            <Stack.Screen
              name="audit"
              options={{ title: 'Audit Trail', headerBackTitle: 'Group' }}
            />
          </Stack>
          <Toast />
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
