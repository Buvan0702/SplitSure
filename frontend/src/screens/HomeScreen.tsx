import React from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { MaterialIcons } from '@expo/vector-icons';
import { AppBackdrop, BrandWordmark, TopBar } from '../components/chrome';
import { Card } from '../components/ui';
import { groupsAPI, settlementsAPI } from '../services/api';
import { Group, GroupBalances } from '../types';
import { Colors, Radius, Shadow, Spacing, Typography } from '../utils/theme';
import { useAuthStore } from '../store/authStore';

const formatMoney = (value: number) => {
  const absolute = Math.abs(value) / 100;
  return `₹ ${absolute.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
};

export default function HomeScreen() {
  const router = useRouter();
  const { user } = useAuthStore();

  const groupsQuery = useQuery({
    queryKey: ['groups'],
    queryFn: async () => {
      const { data } = await groupsAPI.list();
      return data as Group[];
    },
  });

  const balancesQuery = useQuery({
    queryKey: ['home-balances', user?.id, groupsQuery.data?.map((group) => group.id).join(',')],
    enabled: !!user && !!groupsQuery.data?.length,
    queryFn: async () => {
      const results = await Promise.all(
        (groupsQuery.data || []).map(async (group) => {
          const { data } = await settlementsAPI.getBalances(group.id);
          return data as GroupBalances;
        }),
      );
      return results;
    },
  });

  const summaries = balancesQuery.data || [];
  let owed = 0;
  let owe = 0;

  summaries.forEach((summary) => {
    const mine = summary.balances.find((balance) => balance.user.id === user?.id);
    if (!mine) return;
    if (mine.net_balance > 0) owed += mine.net_balance;
    if (mine.net_balance < 0) owe += Math.abs(mine.net_balance);
  });

  const net = owed - owe;
  const groups = groupsQuery.data || [];
  const leadGroup = groups[0];
  const loading = groupsQuery.isLoading || balancesQuery.isLoading;

  return (
    <AppBackdrop>
      <TopBar title={<BrandWordmark compact />} userName={user?.name || user?.phone} />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.heroWrap}>
          <View style={styles.heroBorder}>
            <Card style={styles.heroCard}>
              <Text style={styles.heroLabel}>NET POSITION</Text>
              <Text style={[styles.heroAmount, net < 0 && { color: Colors.danger }]}>
                {net < 0 ? '-' : ''}
                {formatMoney(net)}
              </Text>
              <Text style={styles.heroSub}>across {groups.length} active groups</Text>

              <View style={styles.statChips}>
                <View style={styles.statChip}>
                  <View style={[styles.signalDot, { backgroundColor: Colors.secondary }]} />
                  <Text style={styles.statChipLabel}>OWED</Text>
                  <Text style={styles.statChipValue}>{formatMoney(owed)}</Text>
                </View>
                <View style={styles.statChip}>
                  <View style={[styles.signalDot, { backgroundColor: Colors.danger }]} />
                  <Text style={styles.statChipLabel}>OWE</Text>
                  <Text style={styles.statChipValue}>{formatMoney(owe)}</Text>
                </View>
              </View>
            </Card>
          </View>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.actionsRow}>
          <QuickAction
            color={Colors.primary}
            icon="photo-camera"
            label="Scan Receipt"
            onPress={() => leadGroup && router.push(`/add-expense?groupId=${leadGroup.id}`)}
          />
          <QuickAction
            color={Colors.secondary}
            icon="bolt"
            label="Quick Split"
            onPress={() => router.push('/(tabs)/groups')}
          />
          <QuickAction
            color={Colors.tertiary}
            icon="payments"
            label="Settle Now"
            onPress={() => leadGroup && router.push(`/settlements?groupId=${leadGroup.id}`)}
          />
        </ScrollView>

        <View style={styles.sectionHead}>
          <Text style={styles.sectionTitle}>Active Groups</Text>
          <Pressable onPress={() => router.push('/(tabs)/groups')}>
            <Text style={styles.sectionAction}>See All</Text>
          </Pressable>
        </View>

        {loading ? (
          <ActivityIndicator color={Colors.primary} style={{ marginTop: 40 }} />
        ) : (
          <View style={styles.groupGrid}>
            {groups.map((group, index) => {
              const summary = summaries.find((item) => item.group_id === group.id);
              const mine = summary?.balances.find((balance) => balance.user.id === user?.id);
              const balance = mine?.net_balance || 0;
              const positive = balance >= 0;

              return (
                <Pressable
                  key={group.id}
                  onPress={() => router.push(`/group/${group.id}`)}
                  style={({ pressed }) => [styles.groupPressable, pressed && { opacity: 0.9 }]}
                >
                  <Card style={[styles.groupCard, groups.length % 2 === 1 && index === groups.length - 1 && styles.groupCardWide]}>
                    <View style={styles.groupCardTop}>
                      <Text style={styles.groupEmoji}>{group.description?.slice(0, 2) || ['🏖', '🏠', '🍱', '🚀'][index % 4]}</Text>
                      <View style={[styles.groupPill, positive ? styles.groupPillPositive : styles.groupPillNegative]}>
                        <Text style={[styles.groupPillText, { color: positive ? Colors.secondary : Colors.danger }]}>
                          {positive ? '+' : '-'}
                          {formatMoney(balance).replace('₹ ', '₹')}
                        </Text>
                      </View>
                    </View>
                    <Text style={styles.groupName}>{group.name}</Text>
                    <View style={styles.groupBottom}>
                      <View style={styles.memberCluster}>
                        {group.members.slice(0, 4).map((member, memberIndex) => (
                          <View key={member.id} style={[styles.memberDot, { marginLeft: memberIndex === 0 ? 0 : -10 }]}>
                            <Text style={styles.memberDotText}>
                              {(member.user.name || member.user.phone).slice(0, 1).toUpperCase()}
                            </Text>
                          </View>
                        ))}
                        {group.members.length > 4 ? (
                          <View style={[styles.memberDot, styles.memberDotMore]}>
                            <Text style={styles.memberDotText}>+{group.members.length - 4}</Text>
                          </View>
                        ) : null}
                      </View>
                      <View style={styles.sparkline}>
                        {[0.4, 0.65, 1, 0.3, 0.75, 0.5, 0.86].map((bar, barIndex) => (
                          <View
                            key={`${group.id}-${barIndex}`}
                            style={[
                              styles.sparkBar,
                              { height: 10 + bar * 22, backgroundColor: positive ? Colors.secondary : Colors.danger, opacity: 0.25 + bar / 2 },
                            ]}
                          />
                        ))}
                      </View>
                    </View>
                  </Card>
                </Pressable>
              );
            })}
          </View>
        )}
      </ScrollView>
    </AppBackdrop>
  );
}

function QuickAction({
  icon,
  label,
  color,
  onPress,
}: {
  icon: keyof typeof MaterialIcons.glyphMap;
  label: string;
  color: string;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [pressed && { opacity: 0.85 }]}>
      <Card style={styles.quickCard}>
        <MaterialIcons color={color} name={icon} size={20} />
        <Text style={styles.quickLabel}>{label}</Text>
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  scroll: {
    paddingHorizontal: Spacing.base,
    paddingTop: Spacing.base,
    paddingBottom: 140,
  },
  heroWrap: {
    borderRadius: Radius.xxl,
    padding: 1,
    backgroundColor: Colors.primaryDim,
  },
  heroBorder: {
    borderRadius: Radius.xxl,
    padding: 1,
    backgroundColor: 'transparent',
    overflow: 'hidden',
  },
  heroCard: {
    borderRadius: Radius.xxl,
    alignItems: 'center',
    paddingVertical: Spacing.xxl,
    ...Shadow.glowLg,
  },
  heroLabel: {
    color: Colors.textSecondary,
    fontSize: Typography.xs,
    fontWeight: '800',
    letterSpacing: 3,
  },
  heroAmount: {
    color: Colors.secondary,
    fontSize: 58,
    fontWeight: '800',
    letterSpacing: -2,
    marginTop: Spacing.sm,
  },
  heroSub: {
    color: 'rgba(233,234,248,0.6)',
    marginTop: Spacing.sm,
    fontSize: Typography.base,
  },
  statChips: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.xl,
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  statChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(11,14,23,0.45)',
    borderRadius: Radius.full,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  signalDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statChipLabel: {
    color: Colors.textSecondary,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.4,
  },
  statChipValue: {
    color: Colors.textPrimary,
    fontSize: Typography.base,
    fontWeight: '800',
  },
  actionsRow: {
    gap: Spacing.sm,
    paddingVertical: Spacing.xl,
  },
  quickCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.base,
    paddingHorizontal: Spacing.lg,
  },
  quickLabel: {
    color: Colors.textPrimary,
    fontSize: Typography.base,
    fontWeight: '700',
  },
  sectionHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.base,
  },
  sectionTitle: {
    color: Colors.textPrimary,
    fontSize: Typography.xl,
    fontWeight: '800',
  },
  sectionAction: {
    color: Colors.primary,
    fontSize: Typography.sm,
    fontWeight: '800',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  groupGrid: {
    gap: Spacing.md,
  },
  groupPressable: {
    width: '100%',
  },
  groupCard: {
    minHeight: 170,
  },
  groupCardWide: {
    width: '100%',
  },
  groupCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: Spacing.lg,
  },
  groupEmoji: {
    fontSize: 30,
  },
  groupPill: {
    borderRadius: Radius.full,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
  },
  groupPillPositive: {
    backgroundColor: 'rgba(29,251,165,0.1)',
    borderColor: 'rgba(29,251,165,0.2)',
  },
  groupPillNegative: {
    backgroundColor: 'rgba(255,110,132,0.1)',
    borderColor: 'rgba(255,110,132,0.2)',
  },
  groupPillText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.1,
  },
  groupName: {
    color: Colors.textPrimary,
    fontSize: Typography.lg,
    fontWeight: '800',
    marginBottom: Spacing.lg,
  },
  groupBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  memberCluster: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  memberDot: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.surfaceHigh,
    borderWidth: 2,
    borderColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  memberDotMore: {
    backgroundColor: Colors.surfaceHighest,
  },
  memberDotText: {
    color: Colors.textSecondary,
    fontSize: 10,
    fontWeight: '800',
  },
  sparkline: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 4,
    height: 36,
  },
  sparkBar: {
    width: 4,
    borderRadius: 3,
  },
});
