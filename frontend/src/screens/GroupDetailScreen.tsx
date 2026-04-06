import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, RefreshControl,
  TouchableOpacity, ScrollView, Alert, Share, Modal,
  KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { groupsAPI, expensesAPI, reportsAPI } from '../services/api';
import { Group, Expense, CATEGORY_ICONS, CATEGORY_COLORS, GroupMember } from '../types';
import { Colors, Typography, Spacing, Radius, Shadow } from '../utils/theme';
import { Button, Card, Avatar, Badge, EmptyState, Input, Divider } from '../components/ui';
import { useAuthStore } from '../store/authStore';
import { format, formatDistanceToNow } from 'date-fns';

type Tab = 'expenses' | 'members' | 'balances' | 'audit';

// ── Expense Row ───────────────────────────────────────────────────────────────
function ExpenseRow({ expense, onPress }: { expense: Expense; onPress: () => void }) {
  const amountRs = (expense.amount / 100).toFixed(2);
  const catColor = CATEGORY_COLORS[expense.category];

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.8} style={[styles.expRow, Shadow.sm]}>
      <View style={[styles.expCatDot, { backgroundColor: catColor + '25' }]}>
        <Text style={styles.expCatIcon}>{CATEGORY_ICONS[expense.category]}</Text>
      </View>
      <View style={styles.expInfo}>
        <View style={styles.expTopRow}>
          <Text style={styles.expDesc} numberOfLines={1}>{expense.description}</Text>
          <Text style={styles.expAmount}>₹{amountRs}</Text>
        </View>
        <View style={styles.expBottomRow}>
          <Text style={styles.expMeta}>
            Paid by <Text style={{ fontWeight: '700' }}>{expense.paid_by_user.name || expense.paid_by_user.phone}</Text>
          </Text>
          <Text style={styles.expTime}>{formatDistanceToNow(new Date(expense.created_at), { addSuffix: true })}</Text>
        </View>
        <View style={styles.expFlags}>
          {expense.proof_attachments.length > 0 && (
            <View style={styles.expFlag}>
              <Text style={styles.expFlagText}>📎 {expense.proof_attachments.length} proof</Text>
            </View>
          )}
          {expense.is_disputed && (
            <View style={[styles.expFlag, { backgroundColor: Colors.dangerLight }]}>
              <Text style={[styles.expFlagText, { color: Colors.danger }]}>⚠️ Disputed</Text>
            </View>
          )}
          {expense.is_settled && (
            <View style={[styles.expFlag, { backgroundColor: Colors.successLight }]}>
              <Text style={[styles.expFlagText, { color: Colors.success }]}>✅ Settled</Text>
            </View>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
}

// ── Member Row ────────────────────────────────────────────────────────────────
function MemberRow({
  member, isAdmin, currentUserId, groupId, onRemove,
}: {
  member: GroupMember;
  isAdmin: boolean;
  currentUserId: number;
  groupId: number;
  onRemove: (userId: number, name: string) => void;
}) {
  const isMe = member.user.id === currentUserId;
  return (
    <View style={styles.memberRow}>
      <Avatar name={member.user.name || member.user.phone} size={44} />
      <View style={styles.memberInfo}>
        <Text style={styles.memberName}>
          {member.user.name || member.user.phone}{isMe ? ' (You)' : ''}
        </Text>
        <Text style={styles.memberPhone}>{member.user.phone}</Text>
        {member.user.upi_id && (
          <Text style={styles.memberUpi}>💳 {member.user.upi_id}</Text>
        )}
      </View>
      <View style={styles.memberRight}>
        <Badge
          label={member.role === 'admin' ? 'Admin' : 'Member'}
          color={member.role === 'admin' ? Colors.primary : Colors.textTertiary}
          bgColor={member.role === 'admin' ? Colors.primaryLight : Colors.surfaceAlt}
        />
        {isAdmin && !isMe && (
          <TouchableOpacity
            onPress={() => onRemove(member.user.id, member.user.name || member.user.phone)}
            style={styles.removeBtn}
          >
            <Text style={styles.removeBtnText}>✕</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

// ── Main Screen ───────────────────────────────────────────────────────────────
export default function GroupDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useAuthStore();

  const [activeTab, setActiveTab] = useState<Tab>('expenses');
  const [showAddMember, setShowAddMember] = useState(false);
  const [newPhone, setNewPhone] = useState('');
  const [phoneError, setPhoneError] = useState('');
  const [search, setSearch] = useState('');
  const [reportLoading, setReportLoading] = useState(false);

  // ── Queries ──────────────────────────────────────────────────────────────
  const { data: group, isLoading: groupLoading, refetch: refetchGroup } = useQuery({
    queryKey: ['group', id],
    queryFn: async () => {
      const { data } = await groupsAPI.get(Number(id));
      return data as Group;
    },
  });

  const { data: expenses, isLoading: expLoading, refetch: refetchExp } = useQuery({
    queryKey: ['expenses', id],
    queryFn: async () => {
      const { data } = await expensesAPI.list(Number(id));
      return data as Expense[];
    },
    enabled: activeTab === 'expenses',
  });

  const isAdmin = group?.members.find(m => m.user.id === user?.id)?.role === 'admin';

  // ── Mutations ─────────────────────────────────────────────────────────────
  const addMemberMutation = useMutation({
    mutationFn: () => groupsAPI.addMember(Number(id), newPhone.startsWith('+') ? newPhone : `+91${newPhone.replace(/\D/g,'')}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['group', id] });
      setShowAddMember(false);
      setNewPhone('');
    },
    onError: (e: any) => setPhoneError(e?.response?.data?.detail || 'User not found'),
  });

  const removeMemberMutation = useMutation({
    mutationFn: (userId: number) => groupsAPI.removeMember(Number(id), userId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['group', id] }),
    onError: (e: any) => Alert.alert('Error', e?.response?.data?.detail || 'Failed to remove member'),
  });

  const handleRemoveMember = (userId: number, name: string) => {
    Alert.alert('Remove Member', `Remove ${name} from this group?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => removeMemberMutation.mutate(userId) },
    ]);
  };

  const handleShareInvite = async () => {
    try {
      const { data } = await groupsAPI.createInvite(Number(id));
      await Share.share({
        message: `Join "${group?.name}" on SplitSure! Use this link to join:\nsplitsure://join/${data.token}\n\nValid for 72 hours.`,
      });
    } catch (e) {
      Alert.alert('Error', 'Failed to generate invite link');
    }
  };

  const handleGenerateReport = async () => {
    if (!user?.is_paid_tier) {
      Alert.alert('Pro Feature', 'PDF reports are available on the Pro tier. Upgrade to unlock this feature!', [
        { text: 'Maybe Later', style: 'cancel' },
        { text: 'Upgrade', onPress: () => router.push('/profile') },
      ]);
      return;
    }
    setReportLoading(true);
    try {
      await reportsAPI.generate(Number(id));
      Alert.alert('✅ Report Ready', 'Your PDF report has been generated and downloaded.');
    } catch (e) {
      Alert.alert('Error', 'Failed to generate report');
    } finally {
      setReportLoading(false);
    }
  };

  const filteredExpenses = expenses?.filter(e =>
    !search || e.description.toLowerCase().includes(search.toLowerCase())
  ) ?? [];

  const totalExpenses = expenses?.reduce((s, e) => s + e.amount, 0) ?? 0;
  const disputedCount = expenses?.filter(e => e.is_disputed).length ?? 0;

  if (groupLoading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Group Header */}
      <View style={[styles.groupHeader, Shadow.sm]}>
        <View style={styles.groupHeaderTop}>
          <View style={styles.groupIconWrap}>
            <Text style={styles.groupIconText}>{group?.name.charAt(0).toUpperCase()}</Text>
          </View>
          <View style={styles.groupHeaderInfo}>
            <Text style={styles.groupName} numberOfLines={1}>{group?.name}</Text>
            {group?.description && (
              <Text style={styles.groupDesc} numberOfLines={1}>{group.description}</Text>
            )}
            <Text style={styles.groupMeta}>{group?.members.length} members</Text>
          </View>
          {isAdmin && (
            <TouchableOpacity onPress={handleGenerateReport} style={styles.pdfBtn}>
              {reportLoading
                ? <ActivityIndicator size="small" color={Colors.primary} />
                : <Text style={styles.pdfBtnText}>📄 PDF</Text>
              }
            </TouchableOpacity>
          )}
        </View>

        {/* Quick stats */}
        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <Text style={styles.statVal}>₹{(totalExpenses / 100).toFixed(0)}</Text>
            <Text style={styles.statLabel}>Total</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statVal}>{expenses?.length ?? 0}</Text>
            <Text style={styles.statLabel}>Expenses</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={[styles.statVal, disputedCount > 0 && { color: Colors.danger }]}>
              {disputedCount}
            </Text>
            <Text style={styles.statLabel}>Disputed</Text>
          </View>
        </View>
      </View>

      {/* Tab bar */}
      <View style={styles.tabBar}>
        {([
          { key: 'expenses', label: '💰 Expenses' },
          { key: 'members',  label: '👥 Members' },
          { key: 'balances', label: '⚖️ Balances' },
          { key: 'audit',    label: '🔒 Audit' },
        ] as { key: Tab; label: string }[]).map(tab => (
          <TouchableOpacity
            key={tab.key}
            onPress={() => setActiveTab(tab.key)}
            style={[styles.tab, activeTab === tab.key && styles.tabActive]}
          >
            <Text style={[styles.tabText, activeTab === tab.key && styles.tabTextActive]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* ── Expenses Tab ───────────────────────────────────────────────── */}
      {activeTab === 'expenses' && (
        <View style={{ flex: 1 }}>
          <View style={styles.searchRow}>
            <Input
              value={search}
              onChangeText={setSearch}
              placeholder="Search expenses..."
              containerStyle={{ flex: 1, marginBottom: 0, marginRight: Spacing.sm }}
              leftIcon={<Text>🔍</Text>}
            />
            <Button
              title="+ Add"
              onPress={() => router.push(`/add-expense?groupId=${id}`)}
              size="sm"
            />
          </View>

          <FlatList
            data={filteredExpenses}
            keyExtractor={e => String(e.id)}
            contentContainerStyle={styles.listContent}
            renderItem={({ item }) => (
              <ExpenseRow
                expense={item}
                onPress={() => router.push(`/expense/${item.id}?groupId=${id}`)}
              />
            )}
            ListEmptyComponent={
              expLoading ? (
                <ActivityIndicator style={{ marginTop: 40 }} color={Colors.primary} />
              ) : (
                <EmptyState
                  icon="💸"
                  title="No expenses yet"
                  subtitle="Add the first expense for this group"
                />
              )
            }
            refreshControl={
              <RefreshControl refreshing={expLoading} onRefresh={refetchExp} tintColor={Colors.primary} />
            }
          />
        </View>
      )}

      {/* ── Members Tab ────────────────────────────────────────────────── */}
      {activeTab === 'members' && (
        <ScrollView contentContainerStyle={styles.listContent}>
          <View style={styles.memberActions}>
            {isAdmin && (
              <>
                <Button
                  title="+ Add Member"
                  onPress={() => setShowAddMember(true)}
                  size="sm"
                  style={{ flex: 1, marginRight: Spacing.sm }}
                />
                <Button
                  title="🔗 Invite Link"
                  onPress={handleShareInvite}
                  variant="secondary"
                  size="sm"
                  style={{ flex: 1 }}
                />
              </>
            )}
          </View>

          {group?.members.map(m => (
            <MemberRow
              key={m.id}
              member={m}
              isAdmin={isAdmin ?? false}
              currentUserId={user?.id ?? 0}
              groupId={Number(id)}
              onRemove={handleRemoveMember}
            />
          ))}
        </ScrollView>
      )}

      {/* ── Balances Tab (lazy-loaded component) ──────────────────────── */}
      {activeTab === 'balances' && (
        <View style={{ flex: 1 }}>
          {/* Inline import to avoid circular dep */}
          <BalancesTabContent groupId={Number(id)} userId={user?.id ?? 0} />
        </View>
      )}

      {/* ── Audit Tab ──────────────────────────────────────────────────── */}
      {activeTab === 'audit' && (
        <View style={{ flex: 1 }}>
          <AuditTabContent groupId={Number(id)} />
        </View>
      )}

      {/* FAB for add expense */}
      {activeTab === 'expenses' && (
        <TouchableOpacity
          style={[styles.fab, Shadow.lg]}
          onPress={() => router.push(`/add-expense?groupId=${id}`)}
          activeOpacity={0.85}
        >
          <Text style={styles.fabText}>+</Text>
        </TouchableOpacity>
      )}

      {/* Add member modal */}
      <Modal visible={showAddMember} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View style={[styles.modalCard, Shadow.lg]}>
              <Text style={styles.modalTitle}>Add Member</Text>
              <Text style={styles.modalSub}>Enter their phone number (must be registered on SplitSure)</Text>
              <Input
                label="Phone Number"
                value={newPhone}
                onChangeText={v => { setNewPhone(v); setPhoneError(''); }}
                keyboardType="phone-pad"
                placeholder="+91 98765 43210"
                error={phoneError}
                autoFocus
              />
              <View style={styles.modalActions}>
                <Button
                  title="Cancel"
                  onPress={() => { setShowAddMember(false); setNewPhone(''); setPhoneError(''); }}
                  variant="ghost"
                  style={{ flex: 1, marginRight: Spacing.sm }}
                />
                <Button
                  title="Add Member"
                  onPress={() => addMemberMutation.mutate()}
                  loading={addMemberMutation.isPending}
                  style={{ flex: 1.5 }}
                />
              </View>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </View>
  );
}

// ── Inline Balances Tab ───────────────────────────────────────────────────────
function BalancesTabContent({ groupId, userId }: { groupId: number; userId: number }) {
  const router = useRouter();
  return (
    <View style={{ flex: 1, padding: Spacing.base }}>
      <Card style={{ alignItems: 'center', padding: Spacing.xl }}>
        <Text style={{ fontSize: 48, marginBottom: Spacing.md }}>⚖️</Text>
        <Text style={{ fontSize: Typography.lg, fontWeight: '800', color: Colors.textPrimary, marginBottom: 6, textAlign: 'center' }}>
          View Balances & Settle Up
        </Text>
        <Text style={{ fontSize: Typography.sm, color: Colors.textSecondary, textAlign: 'center', marginBottom: Spacing.lg }}>
          See who owes what and pay directly via UPI
        </Text>
        <Button
          title="Open Balances"
          onPress={() => router.push(`/balances?groupId=${groupId}`)}
          size="lg"
          style={{ width: '100%' }}
        />
      </Card>
    </View>
  );
}

// ── Inline Audit Tab ──────────────────────────────────────────────────────────
function AuditTabContent({ groupId }: { groupId: number }) {
  const router = useRouter();
  return (
    <View style={{ flex: 1, padding: Spacing.base }}>
      <Card style={{ alignItems: 'center', padding: Spacing.xl }}>
        <Text style={{ fontSize: 48, marginBottom: Spacing.md }}>🔒</Text>
        <Text style={{ fontSize: Typography.lg, fontWeight: '800', color: Colors.textPrimary, marginBottom: 6, textAlign: 'center' }}>
          Immutable Audit Trail
        </Text>
        <Text style={{ fontSize: Typography.sm, color: Colors.textSecondary, textAlign: 'center', marginBottom: Spacing.lg }}>
          Every action is permanently recorded. Nothing can be hidden.
        </Text>
        <Button
          title="View Full Audit Log"
          onPress={() => router.push(`/audit?groupId=${groupId}`)}
          size="lg"
          style={{ width: '100%' }}
        />
      </Card>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  groupHeader: {
    backgroundColor: Colors.surface,
    paddingHorizontal: Spacing.base,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  groupHeaderTop: { flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.md },
  groupIconWrap: {
    width: 52, height: 52, borderRadius: Radius.md,
    backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center',
    marginRight: Spacing.md,
  },
  groupIconText: { fontSize: 24, color: Colors.textInverse, fontWeight: '800' },
  groupHeaderInfo: { flex: 1 },
  groupName: { fontSize: Typography.lg, fontWeight: '800', color: Colors.textPrimary },
  groupDesc: { fontSize: Typography.sm, color: Colors.textSecondary, marginTop: 2 },
  groupMeta: { fontSize: Typography.xs, color: Colors.textTertiary, marginTop: 2 },
  pdfBtn: {
    paddingHorizontal: Spacing.sm, paddingVertical: Spacing.xs,
    backgroundColor: Colors.primaryLight, borderRadius: Radius.sm,
    borderWidth: 1, borderColor: Colors.primary,
  },
  pdfBtnText: { fontSize: Typography.xs, fontWeight: '700', color: Colors.primary },

  statsRow: { flexDirection: 'row', paddingVertical: Spacing.sm },
  statItem: { flex: 1, alignItems: 'center' },
  statVal: { fontSize: Typography.lg, fontWeight: '800', color: Colors.textPrimary },
  statLabel: { fontSize: Typography.xs, color: Colors.textTertiary, marginTop: 2 },
  statDivider: { width: 1, backgroundColor: Colors.border },

  tabBar: {
    flexDirection: 'row', backgroundColor: Colors.surface,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  tab: { flex: 1, paddingVertical: Spacing.md, alignItems: 'center' },
  tabActive: { borderBottomWidth: 2, borderBottomColor: Colors.primary },
  tabText: { fontSize: 11, fontWeight: '600', color: Colors.textTertiary },
  tabTextActive: { color: Colors.primary, fontWeight: '700' },

  searchRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.sm,
    backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  listContent: { padding: Spacing.base, paddingBottom: 100 },

  expRow: {
    flexDirection: 'row', alignItems: 'flex-start',
    backgroundColor: Colors.surface, borderRadius: Radius.lg,
    padding: Spacing.md, marginBottom: Spacing.sm,
  },
  expCatDot: { width: 44, height: 44, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center', marginRight: Spacing.md },
  expCatIcon: { fontSize: 22 },
  expInfo: { flex: 1 },
  expTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  expDesc: { fontSize: Typography.base, fontWeight: '700', color: Colors.textPrimary, flex: 1, marginRight: Spacing.sm },
  expAmount: { fontSize: Typography.md, fontWeight: '800', color: Colors.primary },
  expBottomRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  expMeta: { fontSize: Typography.xs, color: Colors.textSecondary },
  expTime: { fontSize: Typography.xs, color: Colors.textTertiary },
  expFlags: { flexDirection: 'row', marginTop: 6, gap: Spacing.xs },
  expFlag: { backgroundColor: Colors.primaryLight, borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 2 },
  expFlagText: { fontSize: 10, fontWeight: '600', color: Colors.primary },

  memberActions: { flexDirection: 'row', marginBottom: Spacing.md },
  memberRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.surface, borderRadius: Radius.lg,
    padding: Spacing.md, marginBottom: Spacing.sm,
  },
  memberInfo: { flex: 1, marginLeft: Spacing.md },
  memberName: { fontSize: Typography.base, fontWeight: '700', color: Colors.textPrimary },
  memberPhone: { fontSize: Typography.xs, color: Colors.textSecondary, marginTop: 2 },
  memberUpi: { fontSize: Typography.xs, color: Colors.success, marginTop: 2 },
  memberRight: { alignItems: 'flex-end', gap: Spacing.xs },
  removeBtn: {
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: Colors.dangerLight, alignItems: 'center', justifyContent: 'center',
  },
  removeBtnText: { fontSize: 12, color: Colors.danger, fontWeight: '700' },

  fab: {
    position: 'absolute', bottom: 24, right: 24,
    width: 58, height: 58, borderRadius: 29,
    backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center',
  },
  fabText: { fontSize: 30, color: Colors.textInverse, fontWeight: '300', lineHeight: 36 },

  modalOverlay: { flex: 1, backgroundColor: Colors.overlay, justifyContent: 'flex-end' },
  modalCard: {
    backgroundColor: Colors.surface, borderTopLeftRadius: Radius.xl, borderTopRightRadius: Radius.xl,
    padding: Spacing.xl, paddingBottom: Spacing.xxxl,
  },
  modalTitle: { fontSize: Typography.xl, fontWeight: '800', color: Colors.textPrimary, marginBottom: 4 },
  modalSub: { fontSize: Typography.sm, color: Colors.textSecondary, marginBottom: Spacing.lg },
  modalActions: { flexDirection: 'row', marginTop: Spacing.sm },
});
