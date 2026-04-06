// app/(tabs)/_layout.tsx
import { Tabs, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors, Typography } from '../../src/utils/theme';
import { useAuthStore } from '../../src/store/authStore';

function TabIcon({ icon, label, focused }: { icon: string; label: string; focused: boolean }) {
  return (
    <View style={styles.tabIcon}>
      <Text style={[styles.tabEmoji, { opacity: focused ? 1 : 0.5 }]}>{icon}</Text>
      <Text style={[styles.tabLabel, { color: focused ? Colors.primary : Colors.textTertiary }]}>
        {label}
      </Text>
    </View>
  );
}

export default function TabLayout() {
  const router = useRouter();
  const { isAuthenticated, isLoading } = useAuthStore();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace('/login');
    }
  }, [isAuthenticated, isLoading]);

  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: Colors.surface },
        headerTintColor: Colors.textPrimary,
        headerTitleStyle: { fontWeight: '800', fontSize: 18 },
        headerShadowVisible: false,
        tabBarStyle: styles.tabBar,
        tabBarShowLabel: false,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'My Groups',
          tabBarIcon: ({ focused }) => <TabIcon icon="🏠" label="Groups" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ focused }) => <TabIcon icon="👤" label="Profile" focused={focused} />,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: Colors.surface,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    height: 70,
    paddingBottom: 8,
    paddingTop: 4,
  },
  tabIcon: { alignItems: 'center', gap: 2 },
  tabEmoji: { fontSize: 24 },
  tabLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 0.3 },
});
