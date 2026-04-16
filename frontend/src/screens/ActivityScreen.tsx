import React from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { AppBackdrop, TopBar } from '../components/chrome';
import { Card, EmptyState } from '../components/ui';
import { expensesAPI, groupsAPI } from '../services/api';
import { Expense, Group } from '../types';
import { Spacing, Typography, useTheme } from '../utils/theme';
import { useAuthStore } from '../store/authStore';

export default function ActivityScreen() {
  const { colors, isDark } = useTheme();
  const router = useRouter();
  const { user } = useAuthStore();

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
        subtitle="Recent proof-locked movement"
        userName={user?.name || user?.phone}
      />
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={[styles.overline, { color: colors.textSecondary }]}>LEDGER FEED</Text>
        <Text style={[styles.title, { color: colors.textPrimary }]}>The latest expense events across your active networks.</Text>

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
