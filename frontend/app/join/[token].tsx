import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { groupsAPI } from '../../src/services/api';
import { useAuthStore } from '../../src/store/authStore';
import { Spacing, Typography, Radius, Shadow, useTheme } from '../../src/utils/theme';
import { Button, Card } from '../../src/components/ui';
import { MaterialIcons } from '@expo/vector-icons';

export default function JoinGroupScreen() {
  const { colors, isDark } = useTheme();
  const { token } = useLocalSearchParams<{ token: string }>();
  const router = useRouter();
  const { isAuthenticated, isLoading: authLoading } = useAuthStore();
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [groupName, setGroupName] = useState('');

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      Alert.alert(
        'Login Required',
        'You need to log in before joining a group.',
        [{ text: 'OK', onPress: () => router.replace('/login') }],
      );
    }
  }, [authLoading, isAuthenticated]);

  const handleJoin = async () => {
    if (!token) return;

    setJoining(true);
    setError('');
    try {
      const { data } = await groupsAPI.joinViaInvite(token);
      setSuccess(true);
      setGroupName(data.group?.name || 'the group');
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Failed to join group. The invite may be expired or invalid.');
    } finally {
      setJoining(false);
    }
  };

  if (authLoading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Card style={styles.card}>
        {success ? (
          <>
            <View style={styles.iconWrap}>
              <MaterialIcons color={colors.secondary} name="check-circle" size={64} />
            </View>
            <Text style={[styles.title, { color: colors.textPrimary }]}>Welcome!</Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
              You've successfully joined {groupName}. Expenses and settlements are now shared.
            </Text>
            <Button
              title="Open Group"
              onPress={() => router.replace('/(tabs)/groups')}
              style={{ marginTop: Spacing.lg }}
            />
          </>
        ) : (
          <>
            <View style={styles.iconWrap}>
              <MaterialIcons color={colors.primary} name="group-add" size={64} />
            </View>
            <Text style={[styles.title, { color: colors.textPrimary }]}>Join Group</Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
              You've been invited to join a SplitSure group. Tap below to accept.
            </Text>
            {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}
            <Button
              title="Accept Invite"
              onPress={handleJoin}
              loading={joining}
              style={{ marginTop: Spacing.lg }}
            />
            <Button
              title="Cancel"
              onPress={() => router.back()}
              variant="ghost"
              style={{ marginTop: Spacing.sm }}
            />
          </>
        )}
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.xl,
  },
  card: {
    width: '100%',
    maxWidth: 400,
    alignItems: 'center',
    padding: Spacing.xl,
  },
  iconWrap: {
    marginBottom: Spacing.lg,
  },
  title: {
    fontSize: Typography.xl,
    fontWeight: '800',
    marginBottom: Spacing.sm,
  },
  subtitle: {
    fontSize: Typography.base,
    textAlign: 'center',
    lineHeight: 22,
  },
  error: {
    fontSize: Typography.sm,
    marginTop: Spacing.base,
    textAlign: 'center',
  },
});
