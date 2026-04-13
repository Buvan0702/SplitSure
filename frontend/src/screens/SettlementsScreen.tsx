import React, { useMemo, useState } from 'react';
import { Alert, Linking, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MaterialIcons } from '@expo/vector-icons';
import { AppBackdrop, FloatingDock, TopBar } from '../components/chrome';
import { Avatar, Button, Card, Input } from '../components/ui';
import { groupsAPI, reportsAPI, settlementsAPI } from '../services/api';
import { Group, GroupBalances, Settlement } from '../types';
import { Colors, Radius, Spacing, Typography } from '../utils/theme';
import { useAuthStore } from '../store/authStore';

const upiApps = [
  { name: 'GPay', icon: 'G', color: '#1A73E8', scheme: 'gpay://' },
  { name: 'PhonePe', icon: 'P', color: '#5F259F', scheme: 'phonepe://' },
  { name: 'Paytm', icon: 'Y', color: '#00BAF2', scheme: 'paytmmp://' },
];

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

function buildUpiIntent(baseLink: string, appScheme: string) {
  return baseLink.replace(/^upi:\/\//, appScheme);
}

export default function SettlementsScreen() {
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
    onError: (error: any) => Alert.alert(error?.response?.data?.detail || 'Failed to initiate settlement'),
  });

  const confirmSettlement = useMutation({
    mutationFn: (settlementId: number) => settlementsAPI.confirm(Number(groupId), settlementId),
    onSuccess: () => {
      refreshQueries();
      Alert.alert('Settlement confirmed');
    },
    onError: (error: any) => Alert.alert(error?.response?.data?.detail || 'Failed to confirm settlement'),
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
    onError: (error: any) => setNoteError(error?.response?.data?.detail || 'Failed to dispute settlement'),
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
    onError: (error: any) => setNoteError(error?.response?.data?.detail || 'Failed to resolve dispute'),
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
    onError: (error: any) => Alert.alert(error?.response?.data?.detail || 'Failed to generate report'),
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
          <View style={styles.savedChip}>
            <MaterialIcons color={Colors.primary} name="bolt" size={14} />
            <Text style={styles.savedChipText}>{myInstructions.length} TXNS SAVED</Text>
          </View>
          <View>
            <Text style={styles.headerLabel}>Net Settlement</Text>
            <Text style={styles.headerAmount}>₹{(netSettlement / 100).toFixed(2)}</Text>
          </View>
        </View>

        <Card style={styles.matrixCard}>
          <Text style={styles.panelTitle}>Pending Optimized Transfers</Text>
          <Text style={styles.panelCopy}>These are the minimum payments needed after confirmed settlements are applied.</Text>
          {(balancesQuery.data?.optimized_settlements || []).length ? (
            (balancesQuery.data?.optimized_settlements || []).slice(0, 4).map((instruction, index) => (
              <View key={`${instruction.payer_id}-${instruction.receiver_id}-${index}`} style={styles.inlineTransfer}>
                <Text style={styles.inlineTransferText}>{instruction.payer_name}</Text>
                <Text style={styles.inlineTransferAmount}>₹{(instruction.amount / 100).toFixed(0)}</Text>
                <Text style={styles.inlineTransferText}>{instruction.receiver_name}</Text>
              </View>
            ))
          ) : (
            <Text style={styles.emptyCopy}>No optimized settlements pending.</Text>
          )}
        </Card>

        <View style={styles.upiRow}>
          {upiApps.map((app) => (
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
                <Text style={styles.upiName}>{app.name}</Text>
              </Card>
            </Pressable>
          ))}
        </View>

        <Card style={styles.reportCard}>
          <View style={styles.reportLeft}>
            <View style={styles.reportIconWrap}>
              <MaterialIcons color={Colors.primaryInk} name="workspace-premium" size={24} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.reportTitle}>Generate Proof Report</Text>
              <Text style={styles.reportCopy}>Creates a shareable PDF in dev mode and opens the system share sheet.</Text>
            </View>
          </View>
          <Button title="EXPORT PDF" onPress={() => generateReport.mutate()} loading={generateReport.isPending} />
        </Card>

        {myInstructions.map((item, index) => (
          <Button
            key={`${item.receiver_id}-${index}`}
            title={`MARK ₹${(item.amount / 100).toFixed(0)} PAID TO ${item.receiver_name.toUpperCase()}`}
            onPress={() => initiateSettlement.mutate({ receiver_id: item.receiver_id, amount: item.amount })}
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
              <Card key={settlement.id} style={[styles.transactionCard, pending && styles.transactionPending, disputed && styles.transactionDisputed]}>
                <View style={styles.transactionTop}>
                  <Text style={[styles.transactionCode, disputed && { color: Colors.danger }]}>TRANSACTION #{String(settlement.id).padStart(3, '0')}</Text>
                  <Text style={[styles.transactionStatus, disputed ? { color: Colors.danger } : pending ? { color: Colors.warning } : { color: Colors.secondary }]}>
                    {settlement.status.toUpperCase()}
                  </Text>
                </View>
                <View style={styles.transactionFlow}>
                  <Text style={styles.transactionName}>{settlement.payer.name || settlement.payer.phone}</Text>
                  <Text style={[styles.transactionAmount, disputed && { color: Colors.danger }]}>₹{(settlement.amount / 100).toFixed(0)}</Text>
                  <Text style={styles.transactionName}>{settlement.receiver.name || settlement.receiver.phone}</Text>
                </View>
                {settlement.dispute_note ? <Text style={styles.transactionNote}>{settlement.dispute_note}</Text> : null}
                {settlement.resolution_note ? <Text style={styles.transactionNote}>Resolved: {settlement.resolution_note}</Text> : null}
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
        <View style={styles.modalOverlay}>
          <Card style={styles.modalCard}>
            <Text style={styles.modalTitle}>Dispute Settlement</Text>
            <Text style={styles.modalSub}>Explain why this payment cannot be confirmed.</Text>
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
        <View style={styles.modalOverlay}>
          <Card style={styles.modalCard}>
            <Text style={styles.modalTitle}>Resolve Dispute</Text>
            <Text style={styles.modalSub}>Add a short admin note before resolving this disputed payment.</Text>
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
    backgroundColor: 'rgba(163,166,255,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(163,166,255,0.18)',
  },
  savedChipText: {
    color: Colors.primary,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  headerLabel: {
    color: Colors.textSecondary,
    fontSize: Typography.xs,
    fontWeight: '700',
    letterSpacing: 2,
    textTransform: 'uppercase',
    textAlign: 'right',
  },
  headerAmount: {
    color: Colors.secondary,
    fontSize: Typography.xl,
    fontWeight: '800',
    marginTop: 4,
  },
  matrixCard: {
    marginBottom: Spacing.xl,
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
    flex: 1,
  },
  inlineTransferAmount: {
    color: Colors.secondary,
    fontSize: Typography.base,
    fontWeight: '800',
    marginHorizontal: Spacing.sm,
  },
  emptyCopy: {
    color: Colors.textSecondary,
    fontSize: Typography.base,
  },
  section: {
    gap: Spacing.md,
    marginTop: Spacing.xl,
  },
  transactionCard: {},
  transactionPending: {
    borderColor: 'rgba(245,158,11,0.2)',
  },
  transactionDisputed: {
    borderColor: 'rgba(255,110,132,0.2)',
  },
  transactionTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: Spacing.base,
  },
  transactionCode: {
    color: Colors.primary,
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
    color: Colors.textPrimary,
    fontSize: Typography.base,
    fontWeight: '700',
  },
  transactionAmount: {
    color: Colors.secondary,
    fontSize: Typography.base,
    fontWeight: '800',
  },
  transactionNote: {
    color: Colors.textSecondary,
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
    color: Colors.textSecondary,
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
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reportTitle: {
    color: Colors.textPrimary,
    fontSize: Typography.base,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  reportCopy: {
    color: Colors.textSecondary,
    fontSize: Typography.sm,
    marginTop: 4,
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
  modalSub: {
    color: Colors.textSecondary,
    fontSize: Typography.base,
    marginBottom: Spacing.lg,
  },
  modalActions: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
});
