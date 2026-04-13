import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MaterialIcons } from '@expo/vector-icons';
import { AppBackdrop, FloatingDock, TopBar } from '../components/chrome';
import { Avatar, Badge, Button, Card, Input } from '../components/ui';
import { auditAPI, expensesAPI, groupsAPI, settlementsAPI } from '../services/api';
import { AuditLog, Expense, Group, GroupBalances } from '../types';
import { Colors, Radius, Shadow, Spacing, Typography } from '../utils/theme';
import { useAuthStore } from '../store/authStore';

type GroupTab = 'expenses' | 'balances' | 'audit';

const categoryStyles: Record<string, { bg: string; text: string; icon: keyof typeof MaterialIcons.glyphMap }> = {
  food: { bg: 'rgba(251,146,60,0.15)', text: '#FB923C', icon: 'restaurant' },
  transport: { bg: 'rgba(96,165,250,0.15)', text: '#60A5FA', icon: 'local-taxi' },
  accommodation: { bg: 'rgba(168,85,247,0.15)', text: '#A855F7', icon: 'hotel' },
  utilities: { bg: 'rgba(250,204,21,0.15)', text: '#FACC15', icon: 'flash-on' },
  misc: { bg: 'rgba(163,166,255,0.15)', text: Colors.primary, icon: 'receipt-long' },
};

export default function GroupDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
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

  const expensesQuery = useQuery({
    queryKey: ['expenses', id, debouncedSearch, filterCategory],
    queryFn: async () => {
      const params: { search?: string; category?: string } = {};
      if (debouncedSearch) params.search = debouncedSearch;
      if (filterCategory) params.category = filterCategory;
      const { data } = await expensesAPI.list(Number(id), params);
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
    onError: (error: any) => {
      setMemberError(error?.response?.data?.detail || 'Failed to add member');
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
    onError: (error: any) => {
      setGroupError(error?.response?.data?.detail || 'Failed to update group');
    },
  });

  const removeMember = useMutation({
    mutationFn: (userId: number) => groupsAPI.removeMember(Number(id), userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['group', id] });
      queryClient.invalidateQueries({ queryKey: ['groups'] });
    },
    onError: (error: any) => {
      Alert.alert('Unable to remove member', error?.response?.data?.detail || 'Failed to remove member');
    },
  });

  const archiveGroup = useMutation({
    mutationFn: () => groupsAPI.archive(Number(id)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['groups'] });
      router.replace('/(tabs)/groups');
    },
    onError: (error: any) => {
      Alert.alert('Unable to archive group', error?.response?.data?.detail || 'Failed to archive group');
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
    onError: (error: any) => {
      Alert.alert('Unable to create invite', error?.response?.data?.detail || 'Failed to create invite');
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

  const title = (
    <View>
      <Text style={styles.groupHeading}>{groupQuery.data?.name || 'GROUP'}</Text>
      <View style={{ marginTop: 4 }}>
        <Badge label={isAdmin ? 'Admin Mode Active' : 'Audit Shield Active'} />
      </View>
    </View>
  );

  return (
    <AppBackdrop>
      <TopBar title={title} userName={user?.name || user?.phone} />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.memberStrip}>
          {memberBalances.length ? memberBalances.map(({ member, net }) => {
            const positive = net >= 0;
            const isCurrentUser = member.user.id === user?.id;

            return (
              <Card key={member.id} style={[styles.memberCard, isCurrentUser && styles.memberCardActive]}>
                {isAdmin && !isCurrentUser ? (
                  <Pressable
                    onPress={() => Alert.alert('Remove member', `Remove ${member.user.name || member.user.phone} from this group?`, [
                      { text: 'Cancel', style: 'cancel' },
                      { text: 'Remove', style: 'destructive', onPress: () => removeMember.mutate(member.user.id) },
                    ])}
                    style={styles.memberRemove}
                  >
                    <MaterialIcons color={Colors.textPrimary} name="close" size={14} />
                  </Pressable>
                ) : null}
                <Avatar name={member.user.name || member.user.phone} size={40} />
                <Text style={[styles.memberName, isCurrentUser && { color: Colors.primary }]}>
                  {isCurrentUser ? 'YOU' : (member.user.name || member.user.phone).split(' ')[0].toUpperCase()}
                </Text>
                <Text style={[styles.memberRole, member.role === 'admin' && { color: Colors.primary }]}>
                  {member.role.toUpperCase()}
                </Text>
                <Text style={[styles.memberNet, { color: positive ? Colors.secondary : Colors.danger }]}>
                  {positive ? '+' : '-'}{Math.abs(net / 100).toFixed(0)}
                </Text>
              </Card>
            );
          }) : (
            <ActivityIndicator color={Colors.primary} />
          )}
        </ScrollView>

        {isAdmin ? (
          <View style={styles.actionRow}>
            <Button title="Add Member" onPress={() => setShowAddMember(true)} style={{ flex: 1 }} variant="secondary" size="sm" />
            <Button title="Share Invite" onPress={() => createInvite.mutate()} style={{ flex: 1 }} loading={createInvite.isPending} size="sm" />
            <Button title="Edit Group" onPress={openSettings} style={{ flex: 1 }} variant="ghost" size="sm" />
          </View>
        ) : null}

        <View style={styles.tabSwitcher}>
          {(['expenses', 'balances', 'audit'] as GroupTab[]).map((item) => {
            const label = item === 'expenses' ? 'Expenses' : item === 'balances' ? 'Balances' : 'Audit Trail';
            const icon = item === 'expenses' ? 'bolt' : item === 'balances' ? 'account-balance' : 'manage-search';
            const active = item === tab;

            return (
              <Pressable key={item} onPress={() => setTab(item)} style={[styles.tabPill, active && styles.tabPillActive]}>
                <MaterialIcons color={active ? Colors.primaryInk : 'rgba(233,234,248,0.5)'} name={icon} size={16} />
                <Text style={[styles.tabText, active && styles.tabTextActive]}>{label}</Text>
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
              leftAddon={<MaterialIcons name="search" size={18} color={Colors.textMuted} />}
            />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: Spacing.base }}>
              {[undefined, 'food', 'transport', 'accommodation', 'utilities', 'misc'].map((cat) => {
                const label = cat ? cat.charAt(0).toUpperCase() + cat.slice(1) : 'All';
                const active = cat === filterCategory;
                return (
                  <Pressable
                    key={cat || 'all'}
                    onPress={() => setFilterCategory(cat)}
                    style={[styles.filterChip, active && styles.filterChipActive]}
                  >
                    <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>{label}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
            {expensesQuery.isLoading ? (
              <ActivityIndicator color={Colors.primary} style={{ marginTop: 32 }} />
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
                          <Text style={styles.expenseTitle}>{expense.description}</Text>
                          <Text style={styles.expenseAmount}>₹{(expense.amount / 100).toFixed(0)}</Text>
                        </View>
                        <View style={styles.expenseBottom}>
                          <Text style={styles.expenseMeta}>
                            Paid by {expense.paid_by_user.name || expense.paid_by_user.phone} • {expense.split_type.toUpperCase()}
                          </Text>
                          {expense.is_disputed ? (
                            <Text style={[styles.statusChip, { color: Colors.danger }]}>DISPUTED</Text>
                          ) : expense.proof_attachments.length ? (
                            <Text style={styles.statusChip}>PROOF</Text>
                          ) : (
                            <Text style={[styles.statusChip, { color: Colors.warning }]}>PENDING</Text>
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
                <Text style={styles.panelTitle}>Settlement Command</Text>
                <Text style={styles.panelCopy}>Open the full balance matrix and complete pending payment confirmations.</Text>
                {(balancesQuery.data?.optimized_settlements || []).slice(0, 3).map((instruction, index) => (
                  <View key={`${instruction.payer_id}-${index}`} style={styles.inlineTransfer}>
                    <Text style={styles.inlineTransferText}>{instruction.payer_name}</Text>
                    <Text style={styles.inlineTransferAmount}>₹{(instruction.amount / 100).toFixed(0)}</Text>
                    <Text style={styles.inlineTransferText}>{instruction.receiver_name}</Text>
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
                <Text style={styles.panelTitle}>Immutable Audit Ledger</Text>
                <Text style={styles.panelCopy}>Recent tamper-evident events from this group.</Text>
                {(auditQuery.data || []).map((event) => (
                  <View key={event.id} style={styles.auditRow}>
                    <Text style={styles.auditType}>{event.event_type.replaceAll('_', ' ').toUpperCase()}</Text>
                    <Text style={styles.auditMeta}>{event.actor.name || event.actor.phone}</Text>
                  </View>
                ))}
              </Card>
            </Pressable>
          </View>
        ) : null}
      </ScrollView>

      <Pressable onPress={() => router.push(`/add-expense?groupId=${id}`)} style={styles.fab}>
        <MaterialIcons color={Colors.primaryInk} name="add" size={30} />
      </Pressable>
      <FloatingDock current="groups" />

      <Modal animationType="slide" transparent visible={showAddMember}>
        <View style={styles.modalOverlay}>
          <Card style={styles.modalCard}>
            <Text style={styles.modalTitle}>Add Member</Text>
            <Text style={styles.modalCopy}>In dev mode, adding a new phone number will create a placeholder account automatically.</Text>
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
              <Button title="Cancel" onPress={() => setShowAddMember(false)} style={{ flex: 1 }} variant="ghost" />
              <Button title="Add" onPress={() => addMember.mutate()} style={{ flex: 1.3 }} loading={addMember.isPending} />
            </View>
          </Card>
        </View>
      </Modal>

      <Modal animationType="slide" transparent visible={showSettings}>
        <View style={styles.modalOverlay}>
          <Card style={styles.modalCard}>
            <Text style={styles.modalTitle}>Group Settings</Text>
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
              <Button title="Close" onPress={() => setShowSettings(false)} style={{ flex: 1 }} variant="ghost" />
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
    color: Colors.textPrimary,
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
    borderColor: Colors.ghostBorderStrong,
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
    color: Colors.textSecondary,
    fontSize: 10,
    fontWeight: '800',
    marginTop: 8,
  },
  memberRole: {
    color: Colors.textMuted,
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
    backgroundColor: Colors.glass,
    borderWidth: 1,
    borderColor: Colors.ghostBorder,
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
    backgroundColor: Colors.primary,
  },
  tabText: {
    color: 'rgba(233,234,248,0.5)',
    fontSize: 11,
    fontWeight: '700',
  },
  tabTextActive: {
    color: Colors.primaryInk,
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
    color: Colors.textPrimary,
    fontSize: Typography.lg,
    fontWeight: '800',
  },
  expenseAmount: {
    color: Colors.textPrimary,
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
    color: 'rgba(233,234,248,0.45)',
    fontSize: 12,
  },
  statusChip: {
    color: Colors.secondary,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.1,
  },
  panelTitle: {
    color: Colors.textPrimary,
    fontSize: Typography.lg,
    fontWeight: '800',
    marginBottom: 8,
  },
  panelCopy: {
    color: Colors.textSecondary,
    fontSize: Typography.base,
    marginBottom: Spacing.lg,
  },
  inlineTransfer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
  },
  inlineTransferText: {
    color: Colors.textPrimary,
    fontSize: Typography.base,
    fontWeight: '700',
  },
  inlineTransferAmount: {
    color: Colors.secondary,
    fontSize: Typography.base,
    fontWeight: '800',
  },
  auditRow: {
    paddingVertical: 10,
  },
  auditType: {
    color: Colors.textPrimary,
    fontSize: Typography.sm,
    fontWeight: '800',
    letterSpacing: 1,
  },
  auditMeta: {
    color: Colors.textSecondary,
    marginTop: 4,
  },
  fab: {
    position: 'absolute',
    right: Spacing.base,
    bottom: 118,
    width: 56,
    height: 56,
    borderRadius: 18,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadow.glowMd,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: Colors.overlay,
    padding: Spacing.base,
  },
  modalCard: {
    marginBottom: Spacing.lg,
  },
  modalTitle: {
    color: Colors.textPrimary,
    fontSize: Typography.xl,
    fontWeight: '800',
    marginBottom: 8,
  },
  modalCopy: {
    color: Colors.textSecondary,
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
    backgroundColor: Colors.surfaceLowest,
    borderWidth: 1,
    borderColor: Colors.ghostBorder,
    marginRight: Spacing.sm,
  },
  filterChipActive: {
    backgroundColor: 'rgba(163,166,255,0.15)',
    borderColor: 'rgba(163,166,255,0.3)',
  },
  filterChipText: {
    color: Colors.textSecondary,
    fontSize: Typography.xs,
    fontWeight: '700',
  },
  filterChipTextActive: {
    color: Colors.primary,
  },
});
