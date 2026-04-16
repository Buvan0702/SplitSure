import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { getApiErrorMessage, invitationsAPI } from '../../src/services/api';
import { useAuthStore } from '../../src/store/authStore';
import { Spacing, Typography, Radius, Shadow, useTheme } from '../../src/utils/theme';
import { Button, Card } from '../../src/components/ui';
import { MaterialIcons } from '@expo/vector-icons';
import { Invitation } from '../../src/types';

export default function JoinGroupScreen() {
  const { colors, isDark } = useTheme();
  const { token } = useLocalSearchParams<{ token: string }>();
  const router = useRouter();
  const { isAuthenticated, isLoading: authLoading } = useAuthStore();
  const [loadingInvite, setLoadingInvite] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState('');
  const [successState, setSuccessState] = useState<'accepted' | 'rejected' | null>(null);
  const [invite, setInvite] = useState<Invitation | null>(null);

  useEffect(() => {
    if (authLoading) return;

    if (!isAuthenticated) {
      const redirectPath = token ? `/join/${token}` : '/(tabs)/groups';
      Alert.alert(
        'Login Required',
        'You need to log in before handling this invite.',
        [{ text: 'OK', onPress: () => router.replace({ pathname: '/login', params: { redirect: redirectPath } }) }],
      );
      return;
    }

    if (!token) {
      setError('Invalid invitation link.');
      setLoadingInvite(false);
      return;
    }

    const validateInvite = async () => {
      setLoadingInvite(true);
      setError('');
      try {
        const data = await invitationsAPI.validateLink(token);
        setInvite(data.invitation);
        if (!data.is_valid) {
          if (data.reason === 'already_used') {
            setError('This invite link has already been used.');
          } else if (data.reason === 'rejected') {
            setError('This invite has already been rejected.');
          } else if (data.reason === 'expired') {
            setError('This invite link has expired.');
          } else {
            setError('This invitation is no longer valid.');
          }
        }
      } catch (e: unknown) {
        setError(getApiErrorMessage(e, 'Failed to validate invite link.'));
      } finally {
        setLoadingInvite(false);
      }
    };

    void validateInvite();
  }, [authLoading, isAuthenticated, token, router]);

  const handleAccept = async () => {
    if (!token) return;

    setActionLoading(true);
    setError('');
    try {
      const data = await invitationsAPI.acceptViaLink(token);
      setInvite(data.invitation);
      setSuccessState('accepted');
    } catch (e: unknown) {
      setError(getApiErrorMessage(e, 'Failed to accept invite.'));
    } finally {
      setActionLoading(false);
    }
  };

  const handleReject = async () => {
    if (!token) return;

    setActionLoading(true);
    setError('');
    try {
      const data = await invitationsAPI.rejectViaLink(token);
      setInvite(data.invitation);
      setSuccessState('rejected');
    } catch (e: unknown) {
      setError(getApiErrorMessage(e, 'Failed to reject invite.'));
    } finally {
      setActionLoading(false);
    }
  };

  if (authLoading || loadingInvite) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Card style={styles.card}>
        {successState === 'accepted' ? (
          <>
            <View style={styles.iconWrap}>
              <MaterialIcons color={colors.secondary} name="check-circle" size={64} />
            </View>
            <Text style={[styles.title, { color: colors.textPrimary }]}>Welcome!</Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
              You've successfully joined {invite?.group_name || 'the group'}. Expenses and settlements are now shared.
            </Text>
            <Button
              title="Open Group"
              onPress={() => router.replace('/(tabs)/groups')}
              style={{ marginTop: Spacing.lg }}
            />
          </>
        ) : successState === 'rejected' ? (
          <>
            <View style={styles.iconWrap}>
              <MaterialIcons color={colors.warning} name="cancel" size={64} />
            </View>
            <Text style={[styles.title, { color: colors.textPrimary }]}>Invitation Declined</Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>You rejected this invitation for {invite?.group_name || 'the group'}.</Text>
            <Button
              title="Back to Groups"
              onPress={() => router.replace('/(tabs)/groups')}
              style={{ marginTop: Spacing.lg }}
            />
          </>
        ) : (
          <>
            <View style={styles.iconWrap}>
              <MaterialIcons color={colors.primary} name="group-add" size={64} />
            </View>
            <Text style={[styles.title, { color: colors.textPrimary }]}>Group Invitation</Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
              {invite
                ? `${invite.inviter_name} invited you to join ${invite.group_name}.`
                : 'We could not load invitation details for this link.'}
            </Text>
            {invite?.message ? (
              <Text style={[styles.subtitle, { color: colors.textSecondary, marginTop: Spacing.sm }]}>
                "{invite.message}"
              </Text>
            ) : null}
            {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}
            {error ? (
              <Button
                title="Back"
                onPress={() => router.replace('/(tabs)/groups')}
                variant="ghost"
                style={{ marginTop: Spacing.lg }}
              />
            ) : (
              <>
                <Button
                  title="Accept Invite"
                  onPress={handleAccept}
                  loading={actionLoading}
                  style={{ marginTop: Spacing.lg }}
                />
                <Button
                  title="Reject Invite"
                  onPress={handleReject}
                  loading={actionLoading}
                  variant="ghost"
                  style={{ marginTop: Spacing.sm }}
                />
              </>
            )}
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
