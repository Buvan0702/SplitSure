import React from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { AppBackdrop, TopBar } from '../components/chrome';
import { Button, Card, EmptyState } from '../components/ui';
import { expensesAPI, getApiErrorMessage, groupsAPI, invitationsAPI } from '../services/api';
import { Expense, Group, Invitation } from '../types';
import { Spacing, Typography, useTheme } from '../utils/theme';
import { useAuthStore } from '../store/authStore';

export default function ActivityScreen() {
  const { colors, isDark } = useTheme();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useAuthStore();

  const pendingInvitesQuery = useQuery({
    queryKey: ['pending-invitations', user?.id],
    queryFn: () => invitationsAPI.listPending(),
    refetchInterval: 15_000,
    staleTime: 5_000,
  });

  const acceptInvite = useMutation({
    mutationFn: (invitationId: number) => invitationsAPI.accept(invitationId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pending-invitations'] });
      queryClient.invalidateQueries({ queryKey: ['groups'] });
      Alert.alert('Joined group', 'Invitation accepted successfully.');
    },
    onError: (error: unknown) => {
      Alert.alert('Unable to accept invite', getApiErrorMessage(error, 'Failed to accept invitation'));
    },
  });

  const rejectInvite = useMutation({
    mutationFn: (invitationId: number) => invitationsAPI.reject(invitationId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pending-invitations'] });
    },
    onError: (error: unknown) => {
      Alert.alert('Unable to reject invite', getApiErrorMessage(error, 'Failed to reject invitation'));
    },
  });

  const groupsQuery = useQuery({
    queryKey: ['groups', user?.id],
    queryFn: async () => {
      const { data } = await groupsAPI.list();
      return data as Group[];
    },
  });

  const activityQuery = useQuery({
    queryKey: ['recent-expenses', user?.id, groupsQuery.data?.map((group) => group.id).join(',')],
    enabled: !!groupsQuery.data?.length,
    queryFn: async () => {
      const result = await Promise.all(
        (groupsQuery.data || []).slice(0, 10).map(async (group) => {
          const { data } = await expensesAPI.list(group.id, { limit: 5 });
          return (data as Expense[]).map((expense) => ({ expense, group }));
        }),
      );
      return result.flat().sort((a, b) => +new Date(b.expense.created_at) - +new Date(a.expense.created_at)).slice(0, 8);
    },
  });

  return (
    <AppBackdrop>
      <TopBar
        title="ACTIVITY"
        subtitle="Invitations and recent proof-locked movement"
        userName={user?.name || user?.phone}
      />
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={[styles.overline, { color: colors.textSecondary }]}>LEDGER FEED</Text>
        <Text style={[styles.title, { color: colors.textPrimary }]}>The latest expense events across your active networks.</Text>

        <View style={styles.invitesSection}>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Pending Invitations</Text>
          {pendingInvitesQuery.isLoading ? (
            <ActivityIndicator color={colors.primary} style={{ marginTop: 12 }} />
          ) : pendingInvitesQuery.data?.length ? (
            pendingInvitesQuery.data.map((invitation, index) => (
              <Animated.View key={invitation.id} entering={FadeInDown.delay(index * 70).springify().damping(80)}>
                <Card style={styles.inviteCard}>
                  <Text style={[styles.inviteTitle, { color: colors.textPrimary }]}>{invitation.group_name}</Text>
                  <Text style={[styles.inviteMeta, { color: colors.textSecondary }]}>
                    Invited by {invitation.inviter_name} • {new Date(invitation.created_at).toLocaleString()}
                  </Text>
                  {invitation.message ? (
                    <Text style={[styles.inviteMessage, { color: colors.textSecondary }]}>{invitation.message}</Text>
                  ) : null}
                  <View style={styles.inviteActions}>
                    <Button
                      title="Reject"
                      onPress={() => rejectInvite.mutate(invitation.id)}
                      variant="ghost"
                      style={{ flex: 1 }}
                      loading={rejectInvite.isPending && rejectInvite.variables === invitation.id}
                    />
                    <Button
                      title="Accept"
                      onPress={() => acceptInvite.mutate(invitation.id)}
                      style={{ flex: 1 }}
                      loading={acceptInvite.isPending && acceptInvite.variables === invitation.id}
                    />
                  </View>
                </Card>
              </Animated.View>
            ))
          ) : (
            <Card style={styles.inviteEmptyCard}>
              <Text style={[styles.inviteEmptyText, { color: colors.textSecondary }]}>No pending invitations right now.</Text>
            </Card>
          )}
        </View>

        {activityQuery.isLoading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 36 }} />
        ) : activityQuery.data?.length ? (
          activityQuery.data.map(({ expense, group }, index) => (
            <Animated.View key={`${group.id}-${expense.id}`} entering={FadeInDown.delay(index * 80).springify().damping(80)}>
              <Pressable onPress={() => router.push(`/group/${group.id}`)}>
                <Card style={styles.itemCard}>
                  <View style={styles.itemTop}>
                    <Text style={[styles.itemTitle, { color: colors.textPrimary }]}>{expense.description}</Text>
                    <Text style={[styles.amount, { color: colors.secondary }]}>RS{(expense.amount / 100).toFixed(0)}</Text>
                  </View>
                  <Text style={[styles.meta, { color: colors.textSecondary }]}>{group.name} * Paid by {expense.paid_by_user.name || expense.paid_by_user.phone}</Text>
                  <View style={styles.flags}>
                    <Text style={[styles.flag, { color: colors.secondary }, expense.is_disputed && { color: colors.danger }]}>
                      {expense.is_disputed ? 'DISPUTED' : expense.proof_attachments.length ? 'PROOF LOCKED' : 'ACTIVE'}
                    </Text>
                    <Text style={[styles.timestamp, { color: colors.textMuted }]}>{new Date(expense.created_at).toLocaleDateString('en-IN')}</Text>
                  </View>
                </Card>
              </Pressable>
            </Animated.View>
          ))
        ) : (
          <EmptyState icon="" title="No recent activity" subtitle="Your expense activity will appear here" />
        )}
      </ScrollView>
    </AppBackdrop>
  );
}

const styles = StyleSheet.create({
  scroll: {
    paddingHorizontal: Spacing.base,
    paddingTop: Spacing.base,
    paddingBottom: 140,
  },
  overline: {
    fontSize: Typography.xs,
    fontWeight: '800',
    letterSpacing: 3,
    marginBottom: Spacing.sm,
  },
  title: {
    fontSize: 32,
    lineHeight: 38,
    fontWeight: '800',
    marginBottom: Spacing.xl,
  },
  invitesSection: {
    marginBottom: Spacing.xl,
    gap: Spacing.sm,
  },
  sectionTitle: {
    fontSize: Typography.lg,
    fontWeight: '800',
    marginBottom: 4,
  },
  inviteCard: {
    marginBottom: Spacing.sm,
  },
  inviteTitle: {
    fontSize: Typography.md,
    fontWeight: '800',
  },
  inviteMeta: {
    fontSize: Typography.sm,
    marginTop: 6,
  },
  inviteMessage: {
    fontSize: Typography.base,
    marginTop: 8,
  },
  inviteActions: {
    marginTop: Spacing.base,
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  inviteEmptyCard: {
    marginBottom: Spacing.sm,
  },
  inviteEmptyText: {
    fontSize: Typography.base,
  },
  itemCard: {
    marginBottom: Spacing.md,
  },
  itemTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: Spacing.md,
    marginBottom: 8,
  },
  itemTitle: {
    flex: 1,
    fontSize: Typography.lg,
    fontWeight: '800',
  },
  amount: {
    fontSize: Typography.lg,
    fontWeight: '800',
  },
  meta: {
    fontSize: Typography.base,
    marginBottom: Spacing.base,
  },
  flags: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  flag: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  flagDanger: {
  },
  timestamp: {
    fontSize: Typography.sm,
  },
});
