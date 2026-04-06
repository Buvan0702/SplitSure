import React, { useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, RefreshControl,
  TouchableOpacity, Alert, Modal, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { settlementsAPI } from '../services/api';
import { Settlement, SettlementStatus } from '../types';
import { Colors, Typography, Spacing, Radius, Shadow } from '../utils/theme';
import { Card, Avatar, Badge, Button, Input, EmptyState } from '../components/ui';
import { useAuthStore } from '../store/authStore';
import { format, formatDistanceToNow } from 'date-fns';

const STATUS_CONFIG: Record<SettlementStatus, { label: string; color: string; bg: string; icon: string }> = {
  pending:   { label: 'Pending',   color: Colors.warning,  bg: Colors.warningLight,  icon: '⏳' },
  confirmed: { label: 'Confirmed', color: Colors.success,  bg: Colors.successLight,  icon: '✅' },
  disputed:  { label: 'Disputed',  color: Colors.danger,   bg: Colors.dangerLight,   icon: '⚠️' },
};

function SettlementCard({
  settlement,
  currentUserId,
  isAdmin,
  groupId,
}: {
  settlement: Settlement;
  currentUserId: number;
  isAdmin: boolean;
  groupId: number;
}) {
  const queryClient = useQueryClient();
  const [showDisputeModal, setShowDisputeModal] = useState(false);
  const [showResolveModal, setShowResolveModal] = useState(false);
  const [disputeNote, setDisputeNote] = useState('');
  const [resolveNote, setResolveNote] = useState('');
  const [noteError, setNoteError] = useState('');

  const isReceiver = settlement.receiver.id === currentUserId;
  const isPayer = settlement.payer.id === currentUserId;
  const isPending = settlement.status === 'pending';
  const isDisputed = settlement.status === 'disputed';

  const sc = STATUS_CONFIG[settlement.status];
  const amountRs = (settlement.amount / 100).toFixed(2);

  const confirmMutation = useMutation({
    mutationFn: () => settlementsAPI.confirm(groupId, settlement.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settlements', String(groupId)] });
      queryClient.invalidateQueries({ queryKey: ['balances', String(groupId)] });
      Alert.alert('✅ Confirmed!', 'Payment confirmed. Balance updated.');
    },
    onError: (e: any) => Alert.alert('Error', e?.response?.data?.detail || 'Failed to confirm'),
  });

  const disputeMutation = useMutation({
    mutationFn: () => settlementsAPI.dispute(groupId, settlement.id, disputeNote),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settlements', String(groupId)] });
      setShowDisputeModal(false);
    },
    onError: (e: any) => setNoteError(e?.response?.data?.detail || 'Failed to dispute'),
  });

  const resolveMutation = useMutation({
    mutationFn: () => settlementsAPI.resolve(groupId, settlement.id, resolveNote),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settlements', String(groupId)] });
      queryClient.invalidateQueries({ queryKey: ['balances', String(groupId)] });
      setShowResolveModal(false);
      Alert.alert('✅ Dispute Resolved', 'The settlement has been confirmed.');
    },
    onError: (e: any) => setNoteError(e?.response?.data?.detail || 'Failed to resolve'),
  });

  return (
    <>
      <Card style={[styles.card, isPending && isReceiver && styles.cardHighlight]}>
        {/* Header row */}
        <View style={styles.cardHeader}>
          <View style={[styles.statusDot, { backgroundColor: sc.bg }]}>
            <Text style={styles.statusIcon}>{sc.icon}</Text>
          </View>
          <View style={styles.cardMeta}>
            <Text style={styles.cardTime}>
              {formatDistanceToNow(new Date(settlement.created_at), { addSuffix: true })}
            </Text>
            <Badge label={sc.label} color={sc.color} bgColor={sc.bg} />
          </View>
        </View>

        {/* Transfer row */}
        <View style={styles.transferRow}>
          <View style={styles.person}>
            <Avatar name={settlement.payer.name || settlement.payer.phone} size={40} />
            <Text style={styles.personName} numberOfLines={1}>
              {settlement.payer.id === currentUserId ? 'You' : (settlement.payer.name || settlement.payer.phone)}
            </Text>
            <Text style={styles.personRole}>payer</Text>
          </View>

          <View style={styles.amountCenter}>
            <Text style={styles.transferArrow}>→</Text>
            <Text style={styles.transferAmount}>₹{amountRs}</Text>
          </View>

          <View style={styles.person}>
            <Avatar name={settlement.receiver.name || settlement.receiver.phone} size={40} />
            <Text style={styles.personName} numberOfLines={1}>
              {settlement.receiver.id === currentUserId ? 'You' : (settlement.receiver.name || settlement.receiver.phone)}
            </Text>
            <Text style={styles.personRole}>receiver</Text>
          </View>
        </View>

        {/* Dispute note */}
        {settlement.dispute_note && (
          <View style={styles.noteBox}>
            <Text style={styles.noteLabel}>Dispute reason:</Text>
            <Text style={styles.noteText}>{settlement.dispute_note}</Text>
          </View>
        )}

        {/* Resolution note */}
        {settlement.resolution_note && (
          <View style={[styles.noteBox, { borderLeftColor: Colors.success }]}>
            <Text style={[styles.noteLabel, { color: Colors.success }]}>Resolution:</Text>
            <Text style={styles.noteText}>{settlement.resolution_note}</Text>
          </View>
        )}

        {/* Confirmed at */}
        {settlement.confirmed_at && (
          <Text style={styles.confirmedAt}>
            ✅ Confirmed {format(new Date(settlement.confirmed_at), 'dd MMM yyyy, HH:mm')}
          </Text>
        )}

        {/* Actions for receiver when pending */}
        {isPending && isReceiver && (
          <View style={styles.actionRow}>
            <Button
              title="✅ Confirm Received"
              onPress={() => Alert.alert(
                'Confirm Payment',
                `Confirm that you received ₹${amountRs} from ${settlement.payer.name || settlement.payer.phone}?`,
                [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Yes, Confirm', onPress: () => confirmMutation.mutate() },
                ]
              )}
              loading={confirmMutation.isPending}
              size="sm"
              style={{ flex: 1, marginRight: Spacing.sm }}
            />
            <Button
              title="⚠️ Dispute"
              onPress={() => { setNoteError(''); setShowDisputeModal(true); }}
              variant="secondary"
              size="sm"
              style={{ flex: 1, borderColor: Colors.danger }}
            />
          </View>
        )}

        {/* Admin can resolve disputed settlements */}
        {isDisputed && isAdmin && (
          <Button
            title="🤝 Resolve Dispute"
            onPress={() => { setNoteError(''); setShowResolveModal(true); }}
            variant="secondary"
            size="sm"
            style={{ marginTop: Spacing.sm }}
          />
        )}

        {/* Payer waiting message */}
        {isPending && isPayer && (
          <View style={styles.waitingBox}>
            <Text style={styles.waitingText}>
              ⏳ Waiting for {settlement.receiver.name || settlement.receiver.phone} to confirm...
            </Text>
          </View>
        )}
      </Card>

      {/* Dispute modal */}
      <Modal visible={showDisputeModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View style={[styles.modalCard, Shadow.lg]}>
              <Text style={styles.modalTitle}>Dispute This Payment</Text>
              <Text style={styles.modalSub}>
                You're claiming you did NOT receive ₹{amountRs} from{' '}
                <Text style={{ fontWeight: '700' }}>{settlement.payer.name || settlement.payer.phone}</Text>.
              </Text>
              <Input
                label="Reason *"
                value={disputeNote}
                onChangeText={v => { setDisputeNote(v); setNoteError(''); }}
                placeholder="Explain why you're disputing this payment..."
                multiline
                numberOfLines={3}
                style={{ height: 80, textAlignVertical: 'top', paddingTop: Spacing.sm }}
                error={noteError}
                autoFocus
              />
              <View style={styles.modalActions}>
                <Button title="Cancel" onPress={() => setShowDisputeModal(false)} variant="ghost" style={{ flex: 1, marginRight: Spacing.sm }} />
                <Button
                  title="Submit Dispute"
                  onPress={() => {
                    if (disputeNote.trim().length < 10) { setNoteError('Min 10 characters required'); return; }
                    disputeMutation.mutate();
                  }}
                  loading={disputeMutation.isPending}
                  variant="danger"
                  style={{ flex: 1.5 }}
                />
              </View>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* Resolve modal */}
      <Modal visible={showResolveModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View style={[styles.modalCard, Shadow.lg]}>
              <Text style={styles.modalTitle}>Resolve Dispute</Text>
              <Text style={styles.modalSub}>As admin, you're confirming this payment is valid. Add a resolution note.</Text>
              <Input
                label="Resolution Note *"
                value={resolveNote}
                onChangeText={v => { setResolveNote(v); setNoteError(''); }}
                placeholder="e.g., Confirmed via bank statement screenshot..."
                multiline
                numberOfLines={3}
                style={{ height: 80, textAlignVertical: 'top', paddingTop: Spacing.sm }}
                error={noteError}
                autoFocus
              />
              <View style={styles.modalActions}>
                <Button title="Cancel" onPress={() => setShowResolveModal(false)} variant="ghost" style={{ flex: 1, marginRight: Spacing.sm }} />
                <Button
                  title="Resolve & Confirm"
                  onPress={() => {
                    if (resolveNote.trim().length < 5) { setNoteError('Please provide a resolution note'); return; }
                    resolveMutation.mutate();
                  }}
                  loading={resolveMutation.isPending}
                  style={{ flex: 1.5 }}
                />
              </View>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </>
  );
}

export default function SettlementsScreen() {
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  const { user } = useAuthStore();
  const [filter, setFilter] = useState<SettlementStatus | 'all'>('all');

  // Need to know if user is admin
  const [isAdmin] = useState(false); // Would pull from group query in real impl

  const { data: settlements, isLoading, refetch } = useQuery({
    queryKey: ['settlements', groupId],
    queryFn: async () => {
      const { data } = await settlementsAPI.list(Number(groupId));
      return data as Settlement[];
    },
  });

  const filtered = settlements?.filter(s =>
    filter === 'all' || s.status === filter
  ) ?? [];

  const pendingCount = settlements?.filter(s => s.status === 'pending').length ?? 0;
  const pendingForMe = settlements?.filter(
    s => s.status === 'pending' && s.receiver.id === user?.id
  ).length ?? 0;

  return (
    <View style={styles.container}>
      {/* Pending alert banner */}
      {pendingForMe > 0 && (
        <TouchableOpacity
          style={styles.alertBanner}
          onPress={() => setFilter('pending')}
        >
          <Text style={styles.alertBannerText}>
            🔔 {pendingForMe} payment{pendingForMe > 1 ? 's' : ''} waiting for your confirmation
          </Text>
          <Text style={styles.alertBannerAction}>Review →</Text>
        </TouchableOpacity>
      )}

      {/* Summary row */}
      <View style={styles.summaryRow}>
        {(['all', 'pending', 'confirmed', 'disputed'] as const).map(f => {
          const count = f === 'all' ? (settlements?.length ?? 0) :
                        settlements?.filter(s => s.status === f).length ?? 0;
          const sc = f === 'all' ? { color: Colors.primary, bg: Colors.primaryLight } : STATUS_CONFIG[f];
          return (
            <TouchableOpacity
              key={f}
              onPress={() => setFilter(f)}
              style={[styles.filterChip, filter === f && { backgroundColor: sc.color }]}
            >
              <Text style={[styles.filterCount, filter === f && { color: Colors.textInverse }]}>{count}</Text>
              <Text style={[styles.filterLabel, filter === f && { color: Colors.textInverse }]}>
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <FlatList
        data={filtered}
        keyExtractor={s => String(s.id)}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <SettlementCard
            settlement={item}
            currentUserId={user?.id ?? 0}
            isAdmin={isAdmin}
            groupId={Number(groupId)}
          />
        )}
        ListEmptyComponent={
          isLoading ? null : (
            <EmptyState
              icon="💸"
              title={filter === 'all' ? 'No settlements yet' : `No ${filter} settlements`}
              subtitle="Settlements appear here once someone marks a payment as made"
            />
          )
        }
        refreshControl={
          <RefreshControl refreshing={isLoading} onRefresh={refetch} tintColor={Colors.primary} />
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },

  alertBanner: {
    backgroundColor: Colors.warning, flexDirection: 'row',
    alignItems: 'center', padding: Spacing.md, paddingHorizontal: Spacing.base,
  },
  alertBannerText: { flex: 1, fontSize: Typography.sm, fontWeight: '700', color: Colors.textPrimary },
  alertBannerAction: { fontSize: Typography.sm, fontWeight: '800', color: Colors.textPrimary },

  summaryRow: {
    flexDirection: 'row', backgroundColor: Colors.surface,
    padding: Spacing.sm, borderBottomWidth: 1, borderBottomColor: Colors.border, gap: Spacing.xs,
  },
  filterChip: {
    flex: 1, alignItems: 'center', paddingVertical: Spacing.sm,
    borderRadius: Radius.md, backgroundColor: Colors.surfaceAlt,
  },
  filterCount: { fontSize: Typography.lg, fontWeight: '900', color: Colors.textPrimary },
  filterLabel: { fontSize: 9, fontWeight: '700', color: Colors.textTertiary, textTransform: 'uppercase' },

  list: { padding: Spacing.base, paddingBottom: 60 },

  card: { marginBottom: Spacing.md },
  cardHighlight: { borderWidth: 2, borderColor: Colors.warning },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing.md },
  statusDot: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  statusIcon: { fontSize: 18 },
  cardMeta: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  cardTime: { fontSize: Typography.xs, color: Colors.textTertiary },

  transferRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing.md },
  person: { alignItems: 'center', width: 80 },
  personName: { fontSize: Typography.xs, fontWeight: '700', color: Colors.textPrimary, marginTop: 4, textAlign: 'center' },
  personRole: { fontSize: 9, color: Colors.textTertiary, textTransform: 'uppercase', letterSpacing: 0.5 },
  amountCenter: { flex: 1, alignItems: 'center' },
  transferArrow: { fontSize: 24, color: Colors.primary },
  transferAmount: { fontSize: Typography.xl, fontWeight: '900', color: Colors.primary },

  noteBox: {
    backgroundColor: Colors.dangerLight, borderRadius: Radius.sm, padding: Spacing.sm,
    borderLeftWidth: 3, borderLeftColor: Colors.danger, marginBottom: Spacing.sm,
  },
  noteLabel: { fontSize: Typography.xs, fontWeight: '700', color: Colors.danger, marginBottom: 2 },
  noteText: { fontSize: Typography.sm, color: Colors.textPrimary, lineHeight: 18 },

  confirmedAt: { fontSize: Typography.xs, color: Colors.success, fontWeight: '600', textAlign: 'center', marginBottom: Spacing.sm },

  actionRow: { flexDirection: 'row', marginTop: Spacing.sm },
  waitingBox: { backgroundColor: Colors.warningLight, borderRadius: Radius.sm, padding: Spacing.sm, marginTop: Spacing.sm },
  waitingText: { fontSize: Typography.xs, color: Colors.textSecondary, textAlign: 'center' },

  modalOverlay: { flex: 1, backgroundColor: Colors.overlay, justifyContent: 'flex-end' },
  modalCard: {
    backgroundColor: Colors.surface, borderTopLeftRadius: Radius.xl, borderTopRightRadius: Radius.xl,
    padding: Spacing.xl, paddingBottom: Spacing.xxxl,
  },
  modalTitle: { fontSize: Typography.xl, fontWeight: '800', color: Colors.textPrimary, marginBottom: 4 },
  modalSub: { fontSize: Typography.sm, color: Colors.textSecondary, marginBottom: Spacing.lg, lineHeight: 20 },
  modalActions: { flexDirection: 'row', marginTop: Spacing.sm },
});
