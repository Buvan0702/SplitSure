import React from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { AppBackdrop, TopBar } from '../components/chrome';
import { Card, EmptyState } from '../components/ui';
import { expensesAPI, groupsAPI } from '../services/api';
import { Expense, Group } from '../types';
import { Colors, Spacing, Typography } from '../utils/theme';
import { useAuthStore } from '../store/authStore';

export default function ActivityScreen() {
  const router = useRouter();
  const { user } = useAuthStore();

  const groupsQuery = useQuery({
    queryKey: ['groups'],
    queryFn: async () => {
      const { data } = await groupsAPI.list();
      return data as Group[];
    },
  });

  const activityQuery = useQuery({
    queryKey: ['recent-expenses', groupsQuery.data?.map((group) => group.id).join(',')],
    enabled: !!groupsQuery.data?.length,
    queryFn: async () => {
      const result = await Promise.all(
        (groupsQuery.data || []).map(async (group) => {
          const { data } = await expensesAPI.list(group.id);
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
        subtitle="Recent proof-locked movement"
        userName={user?.name || user?.phone}
      />
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.overline}>LEDGER FEED</Text>
        <Text style={styles.title}>The latest expense events across your active networks.</Text>

        {activityQuery.isLoading ? (
          <ActivityIndicator color={Colors.primary} style={{ marginTop: 36 }} />
        ) : activityQuery.data?.length ? (
          activityQuery.data.map(({ expense, group }) => (
            <Pressable key={`${group.id}-${expense.id}`} onPress={() => router.push(`/group/${group.id}`)}>
              <Card style={styles.itemCard}>
                <View style={styles.itemTop}>
                  <Text style={styles.itemTitle}>{expense.description}</Text>
                  <Text style={styles.amount}>₹{(expense.amount / 100).toFixed(0)}</Text>
                </View>
                <Text style={styles.meta}>{group.name} • Paid by {expense.paid_by_user.name || expense.paid_by_user.phone}</Text>
                <View style={styles.flags}>
                  <Text style={[styles.flag, expense.is_disputed && styles.flagDanger]}>
                    {expense.is_disputed ? 'DISPUTED' : expense.proof_attachments.length ? 'PROOF LOCKED' : 'ACTIVE'}
                  </Text>
                  <Text style={styles.timestamp}>{new Date(expense.created_at).toLocaleDateString('en-IN')}</Text>
                </View>
              </Card>
            </Pressable>
          ))
        ) : (
          <EmptyState icon="◇" title="No activity yet" subtitle="Expense events will stream here once the first ledger entry is created." />
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
    color: Colors.textSecondary,
    fontSize: Typography.xs,
    fontWeight: '800',
    letterSpacing: 3,
    marginBottom: Spacing.sm,
  },
  title: {
    color: Colors.textPrimary,
    fontSize: 32,
    lineHeight: 38,
    fontWeight: '800',
    marginBottom: Spacing.xl,
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
    color: Colors.textPrimary,
    fontSize: Typography.lg,
    fontWeight: '800',
  },
  amount: {
    color: Colors.secondary,
    fontSize: Typography.lg,
    fontWeight: '800',
  },
  meta: {
    color: Colors.textSecondary,
    fontSize: Typography.base,
    marginBottom: Spacing.base,
  },
  flags: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  flag: {
    color: Colors.secondary,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  flagDanger: {
    color: Colors.danger,
  },
  timestamp: {
    color: Colors.textMuted,
    fontSize: Typography.sm,
  },
});
