import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MaterialIcons } from '@expo/vector-icons';
import { AppBackdrop, FloatingDock, TopBar } from '../components/chrome';
import { Avatar, Badge, Button, Card, Input, EmptyState, StatusBadge } from '../components/ui';
import { auditAPI, expensesAPI, groupsAPI, settlementsAPI, getApiErrorMessage } from '../services/api';
import { AuditLog, Expense, Group, GroupBalances } from '../types';
import { Radius, Shadow, Spacing, Typography, useTheme } from '../utils/theme';
import { useAuthStore } from '../store/authStore';

type GroupTab = 'expenses' | 'balances' | 'audit';

const categoryStyles: Record<string, { bg: string; text: string; icon: keyof typeof MaterialIcons.glyphMap }> = {
  food: { bg: 'rgba(251,146,60,0.15)', text: '#FB923C', icon: 'restaurant' },
  transport: { bg: 'rgba(96,165,250,0.15)', text: '#60A5FA', icon: 'local-taxi' },
  accommodation: { bg: 'rgba(168,85,247,0.15)', text: '#A855F7', icon: 'hotel' },
  utilities: { bg: 'rgba(250,204,21,0.15)', text: '#FACC15', icon: 'flash-on' },
  misc: { bg: 'rgba(163,166,255,0.15)', text: '#A3A6FF', icon: 'receipt-long' },
};

export default function GroupDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const { colors, isDark } = useTheme();
  const [tab, setTab] = useState<GroupTab>('expenses');
  const [showAddMember, setShowAddMember] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [memberPhone, setMemberPhone] = useState('');
  const [memberError, setMemberError] = useState('');
  const [groupName, setGroupName] = useState('');
  const [groupDescription, setGroupDescription] = useState('');
  const [groupError, setGroupError] = useState('');
  const [searchText, setSearchText] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState<string | undefined>(undefined);

  // Debounce search input
  React.useEffect(() => {
    const timeout = setTimeout(() => setDebouncedSearch(searchText), 400);
    return () => clearTimeout(timeout);
  }, [searchText]);

  const groupQuery = useQuery({
    queryKey: ['group', id],
    queryFn: async () => {
      const { data } = await groupsAPI.get(Number(id));
      return data as Group;
    },
  });

  const EXPENSE_PAGE_SIZE = 20;

  const expensesQuery = useQuery({
    queryKey: ['expenses', id, debouncedSearch, filterCategory],
    queryFn: async () => {
      const params: { search?: string; category?: string; limit?: number; offset?: number } = {};
      if (debouncedSearch) params.search = debouncedSearch;
      if (filterCategory) params.category = filterCategory;
      const { data } = await expensesAPI.list(Number(id), { ...params, limit: EXPENSE_PAGE_SIZE, offset: 0 });
      return data as Expense[];
    },
  });

  const balancesQuery = useQuery({
    queryKey: ['balances', id],
    queryFn: async () => {
      const { data } = await settlementsAPI.getBalances(Number(id));
      return data as GroupBalances;
    },
  });

  const auditQuery = useQuery({
    queryKey: ['audit', id],
    queryFn: async () => {
      const { data } = await auditAPI.list(Number(id), { limit: 5, offset: 0 });
      return data as AuditLog[];
    },
  });

  const isAdmin = (groupQuery.data?.members || []).some((member) => member.user.id === user?.id && member.role === 'admin');

  const addMember = useMutation({
    mutationFn: () => groupsAPI.addMember(Number(id), memberPhone),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['group', id] });
      queryClient.invalidateQueries({ queryKey: ['groups'] });
      setShowAddMember(false);
      setMemberPhone('');
      setMemberError('');
    },
    onError: (error: unknown) => {
      setMemberError(getApiErrorMessage(error, 'Failed to add member'));
    },
  });

  const updateGroup = useMutation({
    mutationFn: () => groupsAPI.update(Number(id), { name: groupName.trim(), description: groupDescription.trim() || undefined }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['group', id] });
      queryClient.invalidateQueries({ queryKey: ['groups'] });
      setShowSettings(false);
      setGroupError('');
    },
    onError: (error: unknown) => {
      setGroupError(getApiErrorMessage(error, 'Failed to update group'));
    },
  });

  const removeMember = useMutation({
    mutationFn: (userId: number) => groupsAPI.removeMember(Number(id), userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['group', id] });
      queryClient.invalidateQueries({ queryKey: ['groups'] });
    },
    onError: (error: unknown) => {
      Alert.alert('Unable to remove member', getApiErrorMessage(error, 'Failed to remove member'));
    },
  });

  const archiveGroup = useMutation({
    mutationFn: () => groupsAPI.archive(Number(id)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['groups'] });
      router.replace('/(tabs)/groups');
    },
    onError: (error: unknown) => {
      Alert.alert('Unable to archive group', getApiErrorMessage(error, 'Failed to archive group'));
    },
  });

  const createInvite = useMutation({
    mutationFn: () => groupsAPI.createInvite(Number(id)),
    onSuccess: async ({ data }) => {
      const message = `Join my SplitSure group using this invite token:\n\n${data.token}\n\nIt expires on ${new Date(data.expires_at).toLocaleString()}.`;
      try {
        await Share.share({ message });
      } catch {
        Alert.alert('Invite ready', message);
      }
    },
    onError: (error: unknown) => {
      Alert.alert('Unable to create invite', getApiErrorMessage(error, 'Failed to create invite'));
    },
  });

  const memberBalances = useMemo(() => {
    const lookup = new Map((balancesQuery.data?.balances || []).map((item) => [item.user.id, item.net_balance]));
    return (groupQuery.data?.members || []).map((member) => ({
      member,
      net: lookup.get(member.user.id) || 0,
    }));
  }, [balancesQuery.data, groupQuery.data]);

  const openSettings = () => {
    setGroupName(groupQuery.data?.name || '');
    setGroupDescription(groupQuery.data?.description || '');
    setGroupError('');
    setShowSettings(true);
  };

  const closeAddMemberModal = () => {
    setShowAddMember(false);
    setMemberPhone('');
    setMemberError('');
  };

  const closeSettingsModal = () => {
    setShowSettings(false);
    setGroupError('');
  };

  const title = (
    <View>
      <Text style={[styles.groupHeading, { color: colors.textPrimary }]}>{groupQuery.data?.name || 'GROUP'}</Text>
      <View style={{ marginTop: 4 }}>
        <Badge label={isAdmin ? 'Admin Mode Active' : 'Audit Shield Active'} />
      </View>
    </View>
  );

  return (
    <AppBackdrop>
      <TopBar title={title} userName={user?.name || user?.phone} />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {groupQuery.isError ? (
          <View style={{ alignItems: 'center', padding: 20 }}>
            <Text style={{ color: colors.danger, fontSize: 14, textAlign: 'center' }}>Failed to load group</Text>
            <Pressable onPress={() => groupQuery.refetch()} style={{ marginTop: 8 }}>
              <Text style={{ color: colors.primary, fontSize: 14 }}>Tap to retry</Text>
            </Pressable>
          </View>
        ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.memberStrip}>
          {memberBalances.length ? memberBalances.map(({ member, net }) => {
            const positive = net >= 0;
            const isCurrentUser = member.user.id === user?.id;

            return (
              <Card key={member.id} style={[styles.memberCard, isCurrentUser && { borderColor: colors.ghostBorderStrong, ...styles.memberCardActive }]}>
                {isAdmin && !isCurrentUser ? (
                  <Pressable
                    onPress={() => Alert.alert('Remove member', `Remove ${member.user.name || member.user.phone} from this group?`, [
                      { text: 'Cancel', style: 'cancel' },
                      { text: 'Remove', style: 'destructive', onPress: () => removeMember.mutate(member.user.id) },
                    ])}
                    style={styles.memberRemove}
                  >
                    <MaterialIcons color={colors.textPrimary} name="close" size={14} />
                  </Pressable>
                ) : null}
                <Avatar name={member.user.name || member.user.phone} size={40} />
                <Text style={[styles.memberName, { color: colors.textSecondary }, isCurrentUser && { color: colors.primary }]}>
                  {isCurrentUser ? 'YOU' : (member.user.name || member.user.phone).split(' ')[0].toUpperCase()}
                </Text>
                <Text style={[styles.memberRole, { color: colors.textMuted }, member.role === 'admin' && { color: colors.primary }]}>
                  {member.role.toUpperCase()}
                </Text>
                <StatusBadge status={member.is_registered === false ? 'not_registered' : 'active'} size="sm" />
                <Text style={[styles.memberNet, { color: positive ? colors.secondary : colors.danger }]}>
                  {positive ? '+' : '-'}{Math.abs(net / 100).toFixed(0)}
                </Text>
              </Card>
            );
          }) : (
            <ActivityIndicator color={colors.primary} />
          )}
        </ScrollView>
        )}

        {isAdmin ? (
          <View style={styles.actionRow}>
            <Button title="Add Member" onPress={() => setShowAddMember(true)} style={{ flex: 1 }} variant="secondary" size="sm" />
            <Button title="Share Invite" onPress={() => createInvite.mutate()} style={{ flex: 1 }} loading={createInvite.isPending} size="sm" />
            <Button title="Edit Group" onPress={openSettings} style={{ flex: 1 }} variant="ghost" size="sm" />
          </View>
        ) : null}

        <View style={[styles.tabSwitcher, { backgroundColor: colors.glass, borderColor: colors.ghostBorder }]}>
          {(['expenses', 'balances', 'audit'] as GroupTab[]).map((item) => {
            const label = item === 'expenses' ? 'Expenses' : item === 'balances' ? 'Balances' : 'Audit Trail';
            const icon = item === 'expenses' ? 'bolt' : item === 'balances' ? 'account-balance' : 'manage-search';
            const active = item === tab;

            return (
              <Pressable key={item} onPress={() => setTab(item)} style={[styles.tabPill, active && { backgroundColor: colors.primary, ...styles.tabPillActive }]}>
                <MaterialIcons color={active ? colors.primaryInk : colors.textMuted} name={icon} size={16} />
                <Text style={[styles.tabText, { color: active ? colors.primaryInk : colors.textMuted }]}>{label}</Text>
              </Pressable>
            );
          })}
        </View>

        {tab === 'expenses' ? (
          <View style={styles.section}>
            <Input
              containerStyle={{ marginBottom: Spacing.sm }}
              value={searchText}
              onChangeText={setSearchText}
              placeholder="Search expenses..."
              leftAddon={<MaterialIcons name="search" size={18} color={colors.textMuted} />}
            />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: Spacing.base }}>
              {[undefined, 'food', 'transport', 'accommodation', 'utilities', 'misc'].map((cat) => {
                const label = cat ? cat.charAt(0).toUpperCase() + cat.slice(1) : 'All';
                const active = cat === filterCategory;
                return (
                  <Pressable
                    key={cat || 'all'}
                    onPress={() => setFilterCategory(cat)}
                    style={[styles.filterChip, { backgroundColor: colors.surfaceLowest, borderColor: colors.ghostBorder }, active && { backgroundColor: colors.primaryLight, borderColor: colors.ghostBorderStrong }]}
                  >
                    <Text style={[styles.filterChipText, { color: active ? colors.primary : colors.textSecondary }]}>{label}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
            {expensesQuery.isLoading ? (
              <ActivityIndicator color={colors.primary} style={{ marginTop: 32 }} />
            ) : expensesQuery.data?.length === 0 ? (
              <EmptyState icon="📋" title="No expenses yet" subtitle="Add your first expense to get started" />
            ) : (
              expensesQuery.data?.map((expense) => {
                const visual = categoryStyles[expense.category] || categoryStyles.misc;
                return (
                  <Pressable
                    key={expense.id}
                    onPress={() => router.push(`/expense/${expense.id}?groupId=${id}`)}
                    style={({ pressed }) => [pressed && { opacity: 0.92 }]}
                  >
                    <Card style={styles.expenseCard}>
                      <View style={[styles.expenseIconWrap, { backgroundColor: visual.bg }]}>
                        <MaterialIcons color={visual.text} name={visual.icon} size={24} />
                      </View>
                      <View style={styles.expenseBody}>
                        <View style={styles.expenseTop}>
                          <Text style={[styles.expenseTitle, { color: colors.textPrimary }]}>{expense.description}</Text>
                          <Text style={[styles.expenseAmount, { color: colors.textPrimary }]}>₹{(expense.amount / 100).toFixed(0)}</Text>
                        </View>
                        <View style={styles.expenseBottom}>
                          <Text style={[styles.expenseMeta, { color: colors.textTertiary }]}>
                            Paid by {expense.paid_by_user.name || expense.paid_by_user.phone} • {expense.split_type.toUpperCase()}
                          </Text>
                          {expense.is_disputed ? (
                            <Text style={[styles.statusChip, { color: colors.danger }]}>DISPUTED</Text>
                          ) : expense.proof_attachments.length ? (
                            <Text style={styles.statusChip}>PROOF</Text>
                          ) : (
                            <Text style={[styles.statusChip, { color: colors.warning }]}>PENDING</Text>
                          )}
                        </View>
                      </View>
                    </Card>
                  </Pressable>
                );
              })
            )}
          </View>
        ) : null}

        {tab === 'balances' ? (
          <View style={styles.section}>
            <Pressable onPress={() => router.push(`/settlements?groupId=${id}`)}>
              <Card>
                <Text style={[styles.panelTitle, { color: colors.textPrimary }]}>Settlement Command</Text>
                <Text style={[styles.panelCopy, { color: colors.textSecondary }]}>Open the full balance matrix and complete pending payment confirmations.</Text>
                {(balancesQuery.data?.optimized_settlements || []).slice(0, 3).map((instruction, index) => (
                  <View key={`${instruction.payer_id}-${index}`} style={styles.inlineTransfer}>
                    <Text style={[styles.inlineTransferText, { color: colors.textPrimary }]}>{instruction.payer_name}</Text>
                    <Text style={[styles.inlineTransferAmount, { color: colors.secondary }]}>₹{(instruction.amount / 100).toFixed(0)}</Text>
                    <Text style={[styles.inlineTransferText, { color: colors.textPrimary }]}>{instruction.receiver_name}</Text>
                  </View>
                ))}
              </Card>
            </Pressable>
          </View>
        ) : null}

        {tab === 'audit' ? (
          <View style={styles.section}>
            <Pressable onPress={() => router.push(`/audit?groupId=${id}`)}>
              <Card>
                <Text style={[styles.panelTitle, { color: colors.textPrimary }]}>Immutable Audit Ledger</Text>
                <Text style={[styles.panelCopy, { color: colors.textSecondary }]}>Recent tamper-evident events from this group.</Text>
                {(auditQuery.data || []).map((event) => (
                  <View key={event.id} style={styles.auditRow}>
                    <Text style={[styles.auditType, { color: colors.textPrimary }]}>{event.event_type.replaceAll('_', ' ').toUpperCase()}</Text>
                    <Text style={[styles.auditMeta, { color: colors.textSecondary }]}>{event.actor.name || event.actor.phone}</Text>
                  </View>
                ))}
              </Card>
            </Pressable>
          </View>
        ) : null}
      </ScrollView>

      <Pressable onPress={() => router.push(`/add-expense?groupId=${id}`)} style={[styles.fab, { backgroundColor: colors.primary }]}>
        <MaterialIcons color={colors.primaryInk} name="add" size={30} />
      </Pressable>
      <FloatingDock current="groups" />

      <Modal animationType="slide" transparent visible={showAddMember}>
        <View style={[styles.modalOverlay, { backgroundColor: colors.overlay }]}>
          <Card style={styles.modalCard}>
            <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>Add Member</Text>
            <Text style={[styles.modalCopy, { color: colors.textSecondary }]}>In dev mode, adding a new phone number will create a placeholder account automatically.</Text>
            <Input
              label="Phone Number"
              value={memberPhone}
              onChangeText={(value) => {
                setMemberPhone(value);
                setMemberError('');
              }}
              error={memberError}
              placeholder="+91 9876543210"
              keyboardType="phone-pad"
            />
            <View style={styles.modalActions}>
              <Button title="Cancel" onPress={closeAddMemberModal} style={{ flex: 1 }} variant="ghost" />
              <Button title="Add" onPress={() => addMember.mutate()} style={{ flex: 1.3 }} loading={addMember.isPending} />
            </View>
          </Card>
        </View>
      </Modal>

      <Modal animationType="slide" transparent visible={showSettings}>
        <View style={[styles.modalOverlay, { backgroundColor: colors.overlay }]}>
          <Card style={styles.modalCard}>
            <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>Group Settings</Text>
            <Input
              label="Group Name"
              value={groupName}
              onChangeText={(value) => {
                setGroupName(value);
                setGroupError('');
              }}
              error={groupError}
              placeholder="Enter group name"
            />
            <Input
              label="Description"
              value={groupDescription}
              onChangeText={setGroupDescription}
              placeholder="Optional description"
            />
            <View style={styles.modalActions}>
              <Button title="Close" onPress={closeSettingsModal} style={{ flex: 1 }} variant="ghost" />
              <Button title="Save" onPress={() => updateGroup.mutate()} style={{ flex: 1.2 }} loading={updateGroup.isPending} />
            </View>
            <Button
              title="Archive Group"
              onPress={() => Alert.alert('Archive group', 'Archive this group and remove it from active lists?', [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Archive', style: 'destructive', onPress: () => archiveGroup.mutate() },
              ])}
              variant="danger"
              loading={archiveGroup.isPending}
              style={{ marginTop: Spacing.sm }}
            />
          </Card>
        </View>
      </Modal>
    </AppBackdrop>
  );
}

const styles = StyleSheet.create({
  scroll: {
    paddingHorizontal: Spacing.base,
    paddingTop: Spacing.sm,
    paddingBottom: 170,
  },
  groupHeading: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.8,
    textTransform: 'uppercase',
  },
  memberStrip: {
    gap: Spacing.sm,
    paddingBottom: Spacing.base,
  },
  memberCard: {
    width: 92,
    minHeight: 112,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.sm,
  },
  memberCardActive: {
    ...Shadow.glowSm,
  },
  memberRemove: {
    position: 'absolute',
    right: 6,
    top: 6,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  memberName: {
    fontSize: 10,
    fontWeight: '800',
    marginTop: 8,
  },
  memberRole: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1,
    marginTop: 4,
  },
  memberNet: {
    fontSize: 10,
    fontWeight: '800',
    marginTop: 4,
  },
  actionRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginBottom: Spacing.base,
  },
  tabSwitcher: {
    flexDirection: 'row',
    borderRadius: Radius.full,
    borderWidth: 1,
    padding: 6,
    gap: 6,
    marginBottom: Spacing.xl,
  },
  tabPill: {
    flex: 1,
    minHeight: 44,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  tabPillActive: {
  },
  tabText: {
    fontSize: 11,
    fontWeight: '700',
  },
  tabTextActive: {
  },
  section: {
    gap: Spacing.md,
  },
  expenseCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.base,
  },
  expenseIconWrap: {
    width: 48,
    height: 48,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  expenseBody: {
    flex: 1,
  },
  expenseTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: Spacing.md,
  },
  expenseTitle: {
    flex: 1,
    fontSize: Typography.lg,
    fontWeight: '800',
  },
  expenseAmount: {
    fontSize: Typography.md,
    fontWeight: '800',
  },
  expenseBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
    gap: Spacing.sm,
  },
  expenseMeta: {
    flex: 1,
    fontSize: 12,
  },
  statusChip: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.1,
  },
  panelTitle: {
    fontSize: Typography.lg,
    fontWeight: '800',
    marginBottom: 8,
  },
  panelCopy: {
    fontSize: Typography.base,
    marginBottom: Spacing.lg,
  },
  inlineTransfer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
  },
  inlineTransferText: {
    fontSize: Typography.base,
    fontWeight: '700',
  },
  inlineTransferAmount: {
    fontSize: Typography.base,
    fontWeight: '800',
  },
  auditRow: {
    paddingVertical: 10,
  },
  auditType: {
    fontSize: Typography.sm,
    fontWeight: '800',
    letterSpacing: 1,
  },
  auditMeta: {
    marginTop: 4,
  },
  fab: {
    position: 'absolute',
    right: Spacing.base,
    bottom: 118,
    width: 56,
    height: 56,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadow.glowMd,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    padding: Spacing.base,
  },
  modalCard: {
    marginBottom: Spacing.lg,
  },
  modalTitle: {
    fontSize: Typography.xl,
    fontWeight: '800',
    marginBottom: 8,
  },
  modalCopy: {
    fontSize: Typography.base,
    marginBottom: Spacing.lg,
  },
  modalActions: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: Radius.full,
    borderWidth: 1,
    marginRight: Spacing.sm,
  },
  filterChipActive: {
  },
  filterChipText: {
    fontSize: Typography.xs,
    fontWeight: '700',
  },
  filterChipTextActive: {
  },
});
