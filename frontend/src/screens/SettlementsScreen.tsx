import React, { useMemo, useState } from 'react';
import { Alert, Linking, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MaterialIcons } from '@expo/vector-icons';
import { AppBackdrop, FloatingDock, TopBar } from '../components/chrome';
import { Avatar, Button, Card, Input } from '../components/ui';
import { groupsAPI, reportsAPI, settlementsAPI, getApiErrorMessage } from '../services/api';
import { Group, GroupBalances, Settlement } from '../types';
import { Radius, Spacing, Typography, useTheme } from '../utils/theme';
import { useAuthStore } from '../store/authStore';
import { UPI_APPS, buildUpiIntent } from '../utils/upi';

function toBase64(bytes: Uint8Array) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let result = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i] ?? 0;
    const b = bytes[i + 1] ?? 0;
    const c = bytes[i + 2] ?? 0;
    const triple = (a << 16) | (b << 8) | c;
    result += chars[(triple >> 18) & 63];
    result += chars[(triple >> 12) & 63];
    result += i + 1 < bytes.length ? chars[(triple >> 6) & 63] : '=';
    result += i + 2 < bytes.length ? chars[triple & 63] : '=';
  }
  return result;
}

function sanitizeFileName(fileName: string) {
  return fileName.replace(/[^a-zA-Z0-9._-]/g, '-');
}



export default function SettlementsScreen() {
  const { colors, isDark } = useTheme();
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const [showDisputeModal, setShowDisputeModal] = useState(false);
  const [showResolveModal, setShowResolveModal] = useState(false);
  const [selectedSettlement, setSelectedSettlement] = useState<Settlement | null>(null);
  const [note, setNote] = useState('');
  const [noteError, setNoteError] = useState('');

  const balancesQuery = useQuery({
    queryKey: ['balances', groupId],
    queryFn: async () => {
      const { data } = await settlementsAPI.getBalances(Number(groupId));
      return data as GroupBalances;
    },
  });

  const settlementsQuery = useQuery({
    queryKey: ['settlements', groupId],
    queryFn: async () => {
      const { data } = await settlementsAPI.list(Number(groupId));
      return data as Settlement[];
    },
  });

  const groupQuery = useQuery({
    queryKey: ['group', groupId],
    queryFn: async () => {
      const { data } = await groupsAPI.get(Number(groupId));
      return data as Group;
    },
  });

  const refreshQueries = () => {
    queryClient.invalidateQueries({ queryKey: ['balances', groupId] });
    queryClient.invalidateQueries({ queryKey: ['settlements', groupId] });
    queryClient.invalidateQueries({ queryKey: ['audit', groupId] });
    queryClient.invalidateQueries({ queryKey: ['home-balances'] });
  };

  const initiateSettlement = useMutation({
    mutationFn: (payload: { receiver_id: number; amount: number }) => settlementsAPI.initiate(Number(groupId), payload),
    onSuccess: () => {
      refreshQueries();
      Alert.alert('Settlement initiated');
    },
    onError: (error: unknown) => Alert.alert(getApiErrorMessage(error, 'Failed to initiate settlement')),
  });

  const confirmSettlement = useMutation({
    mutationFn: (settlementId: number) => settlementsAPI.confirm(Number(groupId), settlementId),
    onSuccess: () => {
      refreshQueries();
      Alert.alert('Settlement confirmed');
    },
    onError: (error: unknown) => Alert.alert(getApiErrorMessage(error, 'Failed to confirm settlement')),
  });

  const disputeSettlement = useMutation({
    mutationFn: ({ settlementId, value }: { settlementId: number; value: string }) => settlementsAPI.dispute(Number(groupId), settlementId, value),
    onSuccess: () => {
      refreshQueries();
      setShowDisputeModal(false);
      setSelectedSettlement(null);
      setNote('');
      setNoteError('');
      Alert.alert('Settlement disputed');
    },
    onError: (error: unknown) => setNoteError(getApiErrorMessage(error, 'Failed to dispute settlement')),
  });

  const resolveSettlement = useMutation({
    mutationFn: ({ settlementId, value }: { settlementId: number; value: string }) => settlementsAPI.resolve(Number(groupId), settlementId, value),
    onSuccess: () => {
      refreshQueries();
      setShowResolveModal(false);
      setSelectedSettlement(null);
      setNote('');
      setNoteError('');
      Alert.alert('Dispute resolved');
    },
    onError: (error: unknown) => setNoteError(getApiErrorMessage(error, 'Failed to resolve dispute')),
  });

  const generateReport = useMutation({
    mutationFn: () => reportsAPI.generate(Number(groupId)),
    onSuccess: async ({ data, headers }) => {
      try {
        const bytes = new Uint8Array(data as ArrayBuffer);
        const base64 = toBase64(bytes);
        const disposition = String(headers?.['content-disposition'] || '');
        const match = disposition.match(/filename=\"?([^\";]+)\"?/i);
        const fileName = sanitizeFileName(match?.[1] || `splitsure-report-${groupId}.pdf`);
        const fileUri = `${FileSystem.cacheDirectory || FileSystem.documentDirectory}${fileName}`;
        await FileSystem.writeAsStringAsync(fileUri, base64, { encoding: FileSystem.EncodingType.Base64 });
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(fileUri, { mimeType: 'application/pdf' });
        } else {
          Alert.alert('Report ready', `Saved to ${fileUri}`);
        }
      } catch {
        Alert.alert('Failed to save report');
      }
    },
    onError: (error: unknown) => Alert.alert(getApiErrorMessage(error, 'Failed to generate report')),
  });

  const isAdmin = (groupQuery.data?.members || []).some((member) => member.user.id === user?.id && member.role === 'admin');
  const myInstructions = (balancesQuery.data?.optimized_settlements || []).filter((item) => item.payer_id === user?.id);
  const netSettlement = myInstructions.reduce((sum, item) => sum + item.amount, 0);

  const openDisputeModal = (settlement: Settlement) => {
    setSelectedSettlement(settlement);
    setNote('');
    setNoteError('');
    setShowDisputeModal(true);
  };

  const openResolveModal = (settlement: Settlement) => {
    setSelectedSettlement(settlement);
    setNote('');
    setNoteError('');
    setShowResolveModal(true);
  };

  const settlementCards = useMemo(() => settlementsQuery.data || [], [settlementsQuery.data]);

  return (
    <AppBackdrop>
      <TopBar title="SETTLE UP" subtitle="Optimized payment matrix" userName={user?.name || user?.phone} />
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.headerRow}>
          <View style={[styles.savedChip, { backgroundColor: colors.primaryLight, borderColor: colors.ghostBorderStrong }]}>
            <MaterialIcons color={colors.primary} name="bolt" size={14} />
            <Text style={[styles.savedChipText, { color: colors.primary }]}>{myInstructions.length} TXNS SAVED</Text>
          </View>
          <View>
            <Text style={[styles.headerLabel, { color: colors.textSecondary }]}>Net Settlement</Text>
            <Text style={[styles.headerAmount, { color: colors.secondary }]}>₹{(netSettlement / 100).toFixed(2)}</Text>
          </View>
        </View>

        <Card style={styles.matrixCard}>
          <Text style={[styles.panelTitle, { color: colors.textPrimary }]}>Pending Optimized Transfers</Text>
          <Text style={[styles.panelCopy, { color: colors.textSecondary }]}>These are the minimum payments needed after confirmed settlements are applied.</Text>
          {(balancesQuery.data?.optimized_settlements || []).length ? (
            (balancesQuery.data?.optimized_settlements || []).slice(0, 4).map((instruction, index) => (
              <View key={`${instruction.payer_id}-${instruction.receiver_id}-${index}`} style={styles.inlineTransfer}>
                <Text style={[styles.inlineTransferText, { color: colors.textPrimary }]}>{instruction.payer_name}</Text>
                <Text style={[styles.inlineTransferAmount, { color: colors.secondary }]}>₹{(instruction.amount / 100).toFixed(0)}</Text>
                <Text style={[styles.inlineTransferText, { color: colors.textPrimary }]}>{instruction.receiver_name}</Text>
              </View>
            ))
          ) : (
            <Text style={[styles.emptyCopy, { color: colors.textSecondary }]}>No optimized settlements pending.</Text>
          )}
        </Card>

        <View style={styles.upiRow}>
          {UPI_APPS.map((app) => (
            <Pressable
              key={app.name}
              onPress={async () => {
                const link = myInstructions[0]?.upi_deep_link;
                if (!link) {
                  Alert.alert('No UPI deep link available');
                  return;
                }
                const appLink = buildUpiIntent(link, app.scheme);
                const fallbackLink = link;
                try {
                  if (await Linking.canOpenURL(appLink)) {
                    await Linking.openURL(appLink);
                    return;
                  }
                  if (await Linking.canOpenURL(fallbackLink)) {
                    await Linking.openURL(fallbackLink);
                    return;
                  }
                  Alert.alert(`${app.name} unavailable`, 'No compatible UPI app was found on this device.');
                } catch {
                  Alert.alert(`Unable to open ${app.name}`);
                }
              }}
            >
              <Card style={styles.upiCard}>
                <View style={[styles.upiIcon, { backgroundColor: `${app.color}22` }]}>
                  <Text style={[styles.upiIconText, { color: app.color }]}>{app.icon}</Text>
                </View>
                <Text style={[styles.upiName, { color: colors.textSecondary }]}>{app.name}</Text>
              </Card>
            </Pressable>
          ))}
        </View>

        <Card style={styles.reportCard}>
          <View style={styles.reportLeft}>
            <View style={[styles.reportIconWrap, { backgroundColor: colors.primary }]}>
              <MaterialIcons color={colors.primaryInk} name="workspace-premium" size={24} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.reportTitle, { color: colors.textPrimary }]}>Generate Proof Report</Text>
              <Text style={[styles.reportCopy, { color: colors.textSecondary }]}>Creates a shareable PDF in dev mode and opens the system share sheet.</Text>
            </View>
          </View>
          <Button title="EXPORT PDF" onPress={() => generateReport.mutate()} loading={generateReport.isPending} />
        </Card>

        {myInstructions.map((item, index) => (
          <Button
            key={`${item.receiver_id}-${index}`}
            title={`MARK ₹${(item.amount / 100).toFixed(0)} PAID TO ${item.receiver_name.toUpperCase()}`}
            onPress={() => {
              Alert.alert(
                'Confirm Payment',
                'Are you sure you want to confirm this settlement?',
                [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Confirm', onPress: () => initiateSettlement.mutate({ receiver_id: item.receiver_id, amount: item.amount }) },
                ]
              );
            }}
            loading={initiateSettlement.isPending}
            style={{ marginTop: index === 0 ? 0 : Spacing.sm }}
          />
        ))}

        <View style={styles.section}>
          {settlementCards.map((settlement) => {
            const pending = settlement.status === 'pending';
            const disputed = settlement.status === 'disputed';
            const canConfirm = pending && settlement.receiver.id === user?.id;
            const canDispute = pending && settlement.receiver.id === user?.id;
            const canResolve = disputed && isAdmin;

            return (
              <Card key={settlement.id} style={[styles.transactionCard, pending && [styles.transactionPending, { borderColor: colors.warningLight }], disputed && [styles.transactionDisputed, { borderColor: colors.dangerLight }]]}>
                <View style={styles.transactionTop}>
                  <Text style={[styles.transactionCode, { color: colors.primary }, disputed && { color: colors.danger }]}>TRANSACTION #{String(settlement.id).padStart(3, '0')}</Text>
                  <Text style={[styles.transactionStatus, disputed ? { color: colors.danger } : pending ? { color: colors.warning } : { color: colors.secondary }]}>
                    {disputed ? '⚠️ ' : pending ? '⏳ ' : '✅ '}{settlement.status.toUpperCase()}
                  </Text>
                </View>
                <View style={styles.transactionFlow}>
                  <Text style={[styles.transactionName, { color: colors.textPrimary }]}>{settlement.payer.name || settlement.payer.phone}</Text>
                  <Text style={[styles.transactionAmount, { color: colors.secondary }, disputed && { color: colors.danger }]}>₹{(settlement.amount / 100).toFixed(0)}</Text>
                  <Text style={[styles.transactionName, { color: colors.textPrimary }]}>{settlement.receiver.name || settlement.receiver.phone}</Text>
                </View>
                {settlement.dispute_note ? <Text style={[styles.transactionNote, { color: colors.textSecondary }]}>{settlement.dispute_note}</Text> : null}
                {settlement.resolution_note ? <Text style={[styles.transactionNote, { color: colors.textSecondary }]}>Resolved: {settlement.resolution_note}</Text> : null}
                {(canConfirm || canDispute || canResolve) ? (
                  <View style={styles.transactionActions}>
                    {canConfirm ? (
                      <Button title="Confirm" onPress={() => confirmSettlement.mutate(settlement.id)} loading={confirmSettlement.isPending} style={{ flex: 1 }} size="sm" />
                    ) : null}
                    {canDispute ? (
                      <Button title="Dispute" onPress={() => openDisputeModal(settlement)} variant="danger" style={{ flex: 1 }} size="sm" />
                    ) : null}
                    {canResolve ? (
                      <Button title="Resolve" onPress={() => openResolveModal(settlement)} variant="secondary" style={{ flex: 1 }} size="sm" />
                    ) : null}
                  </View>
                ) : null}
              </Card>
            );
          })}
        </View>
      </ScrollView>

      <FloatingDock current="groups" />

      <Modal visible={showDisputeModal} transparent animationType="slide">
        <View style={[styles.modalOverlay, { backgroundColor: colors.overlay }]}>
          <Card style={styles.modalCard}>
            <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>Dispute Settlement</Text>
            <Text style={[styles.modalSub, { color: colors.textSecondary }]}>Explain why this payment cannot be confirmed.</Text>
            <Input
              label="Dispute Note"
              value={note}
              onChangeText={(value) => {
                setNote(value);
                setNoteError('');
              }}
              error={noteError}
              placeholder="Enter dispute note"
              multiline
            />
            <View style={styles.modalActions}>
              <Button title="Cancel" onPress={() => setShowDisputeModal(false)} style={{ flex: 1 }} variant="ghost" />
              <Button
                title="Submit"
                onPress={() => {
                  if (!selectedSettlement) return;
                  disputeSettlement.mutate({ settlementId: selectedSettlement.id, value: note });
                }}
                style={{ flex: 1.2 }}
                loading={disputeSettlement.isPending}
              />
            </View>
          </Card>
        </View>
      </Modal>

      <Modal visible={showResolveModal} transparent animationType="slide">
        <View style={[styles.modalOverlay, { backgroundColor: colors.overlay }]}>
          <Card style={styles.modalCard}>
            <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>Resolve Dispute</Text>
            <Text style={[styles.modalSub, { color: colors.textSecondary }]}>Add a short admin note before resolving this disputed payment.</Text>
            <Input
              label="Resolution Note"
              value={note}
              onChangeText={(value) => {
                setNote(value);
                setNoteError('');
              }}
              error={noteError}
              placeholder="Enter resolution note"
              multiline
            />
            <View style={styles.modalActions}>
              <Button title="Cancel" onPress={() => setShowResolveModal(false)} style={{ flex: 1 }} variant="ghost" />
              <Button
                title="Resolve"
                onPress={() => {
                  if (!selectedSettlement) return;
                  resolveSettlement.mutate({ settlementId: selectedSettlement.id, value: note });
                }}
                style={{ flex: 1.2 }}
                loading={resolveSettlement.isPending}
              />
            </View>
          </Card>
        </View>
      </Modal>
    </AppBackdrop>
  );
}

const styles = StyleSheet.create({
  scroll: {
    paddingHorizontal: Spacing.base,
    paddingTop: Spacing.base,
    paddingBottom: 170,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginBottom: Spacing.xl,
  },
  savedChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: Radius.full,
    borderWidth: 1,
  },
  savedChipText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  headerLabel: {
    fontSize: Typography.xs,
    fontWeight: '700',
    letterSpacing: 2,
    textTransform: 'uppercase',
    textAlign: 'right',
  },
  headerAmount: {
    fontSize: Typography.xl,
    fontWeight: '800',
    marginTop: 4,
  },
  matrixCard: {
    marginBottom: Spacing.xl,
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
    flex: 1,
  },
  inlineTransferAmount: {
    fontSize: Typography.base,
    fontWeight: '800',
    marginHorizontal: Spacing.sm,
  },
  emptyCopy: {
    fontSize: Typography.base,
  },
  section: {
    gap: Spacing.md,
    marginTop: Spacing.xl,
  },
  transactionCard: {},
  transactionPending: {},
  transactionDisputed: {},
  transactionTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: Spacing.base,
  },
  transactionCode: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  transactionStatus: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  transactionFlow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
  },
  transactionName: {
    flex: 1,
    fontSize: Typography.base,
    fontWeight: '700',
  },
  transactionAmount: {
    fontSize: Typography.base,
    fontWeight: '800',
  },
  transactionNote: {
    fontSize: Typography.sm,
    marginTop: Spacing.sm,
  },
  transactionActions: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.base,
  },
  upiRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginBottom: Spacing.xl,
  },
  upiCard: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.base,
    width: 100,
  },
  upiIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  upiIconText: {
    fontWeight: '800',
  },
  upiName: {
    fontSize: Typography.sm,
    fontWeight: '700',
  },
  reportCard: {
    marginBottom: Spacing.lg,
  },
  reportLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.base,
    marginBottom: Spacing.base,
  },
  reportIconWrap: {
    width: 52,
    height: 52,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reportTitle: {
    fontSize: Typography.base,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  reportCopy: {
    fontSize: Typography.sm,
    marginTop: 4,
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
  modalSub: {
    fontSize: Typography.base,
    marginBottom: Spacing.lg,
  },
  modalActions: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
});
