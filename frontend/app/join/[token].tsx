import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { groupsAPI } from '../../src/services/api';
import { useAuthStore } from '../../src/store/authStore';
import { Colors, Spacing, Typography, Radius, Shadow } from '../../src/utils/theme';
import { Button, Card } from '../../src/components/ui';
import { MaterialIcons } from '@expo/vector-icons';

export default function JoinGroupScreen() {
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
      <View style={styles.container}>
        <ActivityIndicator color={Colors.primary} size="large" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Card style={styles.card}>
        {success ? (
          <>
            <View style={styles.iconWrap}>
              <MaterialIcons color={Colors.secondary} name="check-circle" size={64} />
            </View>
            <Text style={styles.title}>Welcome!</Text>
            <Text style={styles.subtitle}>
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
              <MaterialIcons color={Colors.primary} name="group-add" size={64} />
            </View>
            <Text style={styles.title}>Join Group</Text>
            <Text style={styles.subtitle}>
              You've been invited to join a SplitSure group. Tap below to accept.
            </Text>
            {error ? <Text style={styles.error}>{error}</Text> : null}
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
    backgroundColor: Colors.background,
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
    color: Colors.textPrimary,
    fontSize: Typography.xl,
    fontWeight: '800',
    marginBottom: Spacing.sm,
  },
  subtitle: {
    color: Colors.textSecondary,
    fontSize: Typography.base,
    textAlign: 'center',
    lineHeight: 22,
  },
  error: {
    color: Colors.danger,
    fontSize: Typography.sm,
    marginTop: Spacing.base,
    textAlign: 'center',
  },
});
