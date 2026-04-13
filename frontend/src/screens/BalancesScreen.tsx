import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, RefreshControl,
  TouchableOpacity, Linking, Alert, Modal, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { settlementsAPI, reportsAPI } from '../services/api';
import { GroupBalances, SettlementInstruction } from '../types';
import { Colors, Typography, Spacing, Radius, Shadow } from '../utils/theme';
import { Button, Card, Avatar, Badge, Input, EmptyState } from '../components/ui';
import { useAuthStore } from '../store/authStore';

const UPI_APPS = [
  { name: 'GPay', icon: '🟢', scheme: 'gpay://' },
  { name: 'PhonePe', icon: '🟣', scheme: 'phonepe://' },
  { name: 'Paytm', icon: '💙', scheme: 'paytmmp://' },
];

function buildUpiIntent(baseLink: string, appScheme: string) {
  return baseLink.replace(/^upi:\/\//, appScheme);
}

function BalanceCard({ instruction, isMySettlement, onSettle }: {
  instruction: SettlementInstruction;
  isMySettlement: boolean;
  onSettle: (i: SettlementInstruction) => void;
}) {
  const amountRs = (instruction.amount / 100).toFixed(2);

  const openUPI = async (appScheme: string) => {
    if (!instruction.upi_deep_link) {
      Alert.alert('No UPI ID', 'The receiver has not registered a UPI ID yet.');
      return;
    }
    const appLink = buildUpiIntent(instruction.upi_deep_link, appScheme);
    try {
      if (await Linking.canOpenURL(appLink)) {
        await Linking.openURL(appLink);
        return;
      }
      if (await Linking.canOpenURL(instruction.upi_deep_link)) {
        await Linking.openURL(instruction.upi_deep_link);
        return;
      }
      Alert.alert('App not found', 'No compatible UPI app is installed on this device.');
    } catch {
      Alert.alert('Unable to open UPI app', 'The selected payment app could not be launched.');
    }
  };

  return (
    <Card style={[styles.settlCard, isMySettlement && styles.settlCardHighlight]}>
      <View style={styles.settlRow}>
        <Avatar name={instruction.payer_name} size={40} />
        <View style={styles.settlArrow}>
          <Text style={styles.arrowAmount}>₹{amountRs}</Text>
          <Text style={styles.arrowIcon}>→</Text>
        </View>
        <Avatar name={instruction.receiver_name} size={40} />
      </View>

      <View style={styles.settlNames}>
        <Text style={styles.settlName}>{instruction.payer_name}</Text>
        <Text style={styles.settlNameRight}>{instruction.receiver_name}</Text>
      </View>

      {isMySettlement && (
        <>
          {instruction.upi_deep_link && (
            <View style={styles.upiRow}>
              {UPI_APPS.map(app => (
                <TouchableOpacity
                  key={app.name}
                  onPress={() => {
                    void openUPI(app.scheme);
                  }}
                  style={styles.upiBtn}
                >
                  <Text style={styles.upiIcon}>{app.icon}</Text>
                  <Text style={styles.upiName}>{app.name}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
          <Button
            title="Mark as Paid"
            onPress={() => onSettle(instruction)}
            size="sm"
            style={{ marginTop: Spacing.sm }}
          />
        </>
      )}
    </Card>
  );
}

export default function BalancesScreen() {
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const [showSettleModal, setShowSettleModal] = useState(false);
  const [selectedInstruction, setSelectedInstruction] = useState<SettlementInstruction | null>(null);
  const [note, setNote] = useState('');

  const { data: balances, isLoading, refetch } = useQuery({
    queryKey: ['balances', groupId],
    queryFn: async () => {
      const { data } = await settlementsAPI.getBalances(Number(groupId));
      return data as GroupBalances;
    },
  });

  const initiateMutation = useMutation({
    mutationFn: (inst: SettlementInstruction) =>
      settlementsAPI.initiate(Number(groupId), {
        receiver_id: inst.receiver_id,
        amount: inst.amount,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['balances', groupId] });
      queryClient.invalidateQueries({ queryKey: ['settlements', groupId] });
      setShowSettleModal(false);
      Alert.alert('✅ Payment Marked', 'The receiver will be notified to confirm your payment.');
    },
    onError: (e: any) => {
      Alert.alert('Error', e?.response?.data?.detail || 'Failed to initiate settlement');
    },
  });

  const handleSettle = (inst: SettlementInstruction) => {
    setSelectedInstruction(inst);
    setShowSettleModal(true);
  };

  const myBalance = balances?.balances.find(b => b.user.id === user?.id);
  const totalExpenses = balances?.total_expenses ?? 0;
  const isSettled = balances?.optimized_settlements.length === 0;
  const mySettlements = balances?.optimized_settlements.filter(i => i.payer_id === user?.id) ?? [];
  const otherSettlements = balances?.optimized_settlements.filter(i => i.payer_id !== user?.id) ?? [];

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.scroll}
      refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refetch} tintColor={Colors.primary} />}
    >
      {/* Summary bar */}
      <View style={[styles.summaryCard, Shadow.md]}>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryValue}>₹{(totalExpenses / 100).toFixed(0)}</Text>
          <Text style={styles.summaryLabel}>Total Spent</Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryItem}>
          {myBalance && (
            <>
              <Text style={[
                styles.summaryValue,
                { color: myBalance.net_balance >= 0 ? Colors.success : Colors.danger },
              ]}>
                {myBalance.net_balance >= 0 ? '+' : '-'}₹{(Math.abs(myBalance.net_balance) / 100).toFixed(0)}
              </Text>
              <Text style={styles.summaryLabel}>
                {myBalance.net_balance === 0 ? 'Settled' : myBalance.net_balance > 0 ? 'You\'re owed' : 'You owe'}
              </Text>
            </>
          )}
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryItem}>
          <Text style={[styles.summaryValue, { color: isSettled ? Colors.success : Colors.warning }]}>
            {isSettled ? '✅' : balances?.optimized_settlements.length}
          </Text>
          <Text style={styles.summaryLabel}>{isSettled ? 'All Clear' : 'Pending'}</Text>
        </View>
      </View>

      {/* Per-member balances */}
      <Text style={styles.sectionTitle}>Member Balances</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: Spacing.lg }}>
        {balances?.balances.map(b => (
          <View key={b.user.id} style={[styles.memberBalCard, Shadow.sm]}>
            <Avatar name={b.user.name || b.user.phone} size={44} />
            <Text style={styles.memberBalName} numberOfLines={1}>
              {b.user.name?.split(' ')[0] || b.user.phone.slice(-4)}
            </Text>
            <Text style={[
              styles.memberBalAmount,
              { color: b.net_balance === 0 ? Colors.textTertiary : b.net_balance > 0 ? Colors.success : Colors.danger },
            ]}>
              {b.net_balance === 0 ? 'Settled' : `${b.net_balance > 0 ? '+' : ''}₹${(b.net_balance / 100).toFixed(0)}`}
            </Text>
          </View>
        ))}
      </ScrollView>

      {/* My settlements */}
      {mySettlements.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>You Need to Pay</Text>
          {mySettlements.map((inst, i) => (
            <BalanceCard
              key={i}
              instruction={inst}
              isMySettlement={true}
              onSettle={handleSettle}
            />
          ))}
        </>
      )}

      {/* Other settlements */}
      {otherSettlements.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>Other Pending</Text>
          {otherSettlements.map((inst, i) => (
            <BalanceCard
              key={i}
              instruction={inst}
              isMySettlement={false}
              onSettle={() => {}}
            />
          ))}
        </>
      )}

      {isSettled && !isLoading && (
        <EmptyState
          icon="🎉"
          title="All Settled!"
          subtitle="Everyone is even. Great job keeping it clean!"
        />
      )}

      {/* Confirm settlement modal */}
      <Modal visible={showSettleModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View style={[styles.modalCard, Shadow.lg]}>
              <Text style={styles.modalTitle}>Confirm Payment</Text>
              <Text style={styles.modalSub}>
                You're marking that you paid{' '}
                <Text style={{ fontWeight: '700', color: Colors.primary }}>
                  ₹{((selectedInstruction?.amount ?? 0) / 100).toFixed(2)}
                </Text>{' '}
                to{' '}
                <Text style={{ fontWeight: '700' }}>{selectedInstruction?.receiver_name}</Text>.
              </Text>
              <Text style={styles.modalNote}>
                ⚠️ The receiver will need to confirm this payment in the app.
              </Text>
              <View style={styles.modalActions}>
                <Button
                  title="Cancel"
                  onPress={() => setShowSettleModal(false)}
                  variant="ghost"
                  style={{ flex: 1, marginRight: Spacing.sm }}
                />
                <Button
                  title="Yes, I Paid"
                  onPress={() => selectedInstruction && initiateMutation.mutate(selectedInstruction)}
                  loading={initiateMutation.isPending}
                  style={{ flex: 1.5 }}
                />
              </View>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  scroll: { padding: Spacing.base, paddingBottom: 80 },

  summaryCard: {
    flexDirection: 'row', backgroundColor: Colors.primary,
    borderRadius: Radius.xl, padding: Spacing.lg, marginBottom: Spacing.xl,
  },
  summaryItem: { flex: 1, alignItems: 'center' },
  summaryValue: { fontSize: Typography.xl, fontWeight: '800', color: Colors.textInverse },
  summaryLabel: { fontSize: Typography.xs, color: 'rgba(255,255,255,0.75)', marginTop: 2, textAlign: 'center' },
  summaryDivider: { width: 1, backgroundColor: 'rgba(255,255,255,0.2)', marginHorizontal: Spacing.sm },

  sectionTitle: { fontSize: Typography.base, fontWeight: '800', color: Colors.textPrimary, marginBottom: Spacing.md },

  memberBalCard: {
    backgroundColor: Colors.surface, borderRadius: Radius.lg, padding: Spacing.md,
    alignItems: 'center', marginRight: Spacing.sm, width: 90,
  },
  memberBalName: { fontSize: Typography.xs, fontWeight: '600', color: Colors.textSecondary, marginTop: 6, textAlign: 'center' },
  memberBalAmount: { fontSize: Typography.sm, fontWeight: '700', marginTop: 2, textAlign: 'center' },

  settlCard: { marginBottom: Spacing.md },
  settlCardHighlight: { borderWidth: 2, borderColor: Colors.primary },
  settlRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  settlArrow: { alignItems: 'center', flex: 1 },
  arrowAmount: { fontSize: Typography.base, fontWeight: '700', color: Colors.primary },
  arrowIcon: { fontSize: 20, color: Colors.primary },
  settlNames: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  settlName: { fontSize: Typography.xs, color: Colors.textSecondary, fontWeight: '600' },
  settlNameRight: { fontSize: Typography.xs, color: Colors.textSecondary, fontWeight: '600' },

  upiRow: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.md, justifyContent: 'center' },
  upiBtn: {
    alignItems: 'center', backgroundColor: Colors.surfaceAlt, borderRadius: Radius.md,
    paddingVertical: Spacing.sm, paddingHorizontal: Spacing.md, borderWidth: 1, borderColor: Colors.border,
  },
  upiIcon: { fontSize: 22 },
  upiName: { fontSize: Typography.xs, fontWeight: '700', color: Colors.textSecondary, marginTop: 2 },

  modalOverlay: { flex: 1, backgroundColor: Colors.overlay, justifyContent: 'flex-end' },
  modalCard: {
    backgroundColor: Colors.surface, borderTopLeftRadius: Radius.xl, borderTopRightRadius: Radius.xl,
    padding: Spacing.xl, paddingBottom: Spacing.xxxl,
  },
  modalTitle: { fontSize: Typography.xl, fontWeight: '800', color: Colors.textPrimary, marginBottom: 6 },
  modalSub: { fontSize: Typography.base, color: Colors.textSecondary, lineHeight: 22, marginBottom: Spacing.md },
  modalNote: { fontSize: Typography.sm, color: Colors.warning, backgroundColor: Colors.warningLight, borderRadius: Radius.md, padding: Spacing.md, marginBottom: Spacing.md },
  modalActions: { flexDirection: 'row' },
});
