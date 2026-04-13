import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Image, TouchableOpacity,
  Alert, Modal, KeyboardAvoidingView, Platform, Linking,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { expensesAPI, groupsAPI } from '../services/api';
import { Expense, Group, CATEGORY_ICONS, CATEGORY_COLORS } from '../types';
import { Colors, Typography, Spacing, Radius, Shadow } from '../utils/theme';
import { Button, Card, Avatar, Badge, Input, Divider } from '../components/ui';
import { useAuthStore } from '../store/authStore';
import { format } from 'date-fns';

export default function ExpenseDetailScreen() {
  const { id, groupId } = useLocalSearchParams<{ id: string; groupId: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useAuthStore();

  const [showDisputeModal, setShowDisputeModal] = useState(false);
  const [disputeNote, setDisputeNote] = useState('');
  const [disputeError, setDisputeError] = useState('');
  const [selectedProof, setSelectedProof] = useState<{ url: string; fileName: string; mimeType: string } | null>(null);
  const [uploadingProof, setUploadingProof] = useState(false);

  const { data: expense, isLoading, refetch } = useQuery({
    queryKey: ['expense', id],
    queryFn: async () => {
      const { data } = await expensesAPI.get(Number(groupId), Number(id));
      return data as Expense;
    },
  });

  const { data: group } = useQuery({
    queryKey: ['group', groupId],
    queryFn: async () => {
      const { data } = await groupsAPI.get(Number(groupId));
      return data as Group;
    },
    enabled: !!groupId,
  });

  const disputeMutation = useMutation({
    mutationFn: () => expensesAPI.dispute(Number(groupId), Number(id), disputeNote),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expense', id] });
      queryClient.invalidateQueries({ queryKey: ['expenses', groupId] });
      setShowDisputeModal(false);
      setDisputeNote('');
    },
    onError: (e: any) => setDisputeError(e?.response?.data?.detail || 'Failed to raise dispute'),
  });

  const deleteExpenseMutation = useMutation({
    mutationFn: () => expensesAPI.delete(Number(groupId), Number(id)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expenses', groupId] });
      router.back();
    },
    onError: (e: any) => Alert.alert('Error', e?.response?.data?.detail || 'Cannot delete expense'),
  });

  const resolveDisputeMutation = useMutation({
    mutationFn: () => expensesAPI.resolveDispute(Number(groupId), Number(id)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expense', id] });
      queryClient.invalidateQueries({ queryKey: ['expenses', groupId] });
      Alert.alert('Dispute resolved');
    },
    onError: (e: any) => Alert.alert('Error', e?.response?.data?.detail || 'Failed to resolve dispute'),
  });

  const handleDelete = () => {
    Alert.alert('Delete Expense', 'This action will be logged to the audit trail. Continue?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteExpenseMutation.mutate() },
    ]);
  };

  const handleUploadProof = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission Required', 'Please allow access to your photo library to upload proof.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
      allowsMultipleSelection: false,
    });

    if (result.canceled || !result.assets[0]) return;

    const asset = result.assets[0];
    if ((asset.fileSize ?? 0) > 5 * 1024 * 1024) {
      Alert.alert('File Too Large', 'Please select an image under 5MB.');
      return;
    }

    setUploadingProof(true);
    try {
      const formData = new FormData();
      formData.append('file', {
        uri: asset.uri,
        name: asset.fileName || 'proof.jpg',
        type: asset.mimeType || 'image/jpeg',
      } as any);

      await expensesAPI.uploadAttachment(Number(groupId), Number(id), formData);
      queryClient.invalidateQueries({ queryKey: ['expense', id] });
      Alert.alert('✅ Proof Uploaded', 'Your receipt has been securely stored and stamped with your identity.');
    } catch (e: any) {
      Alert.alert('Upload Failed', e?.response?.data?.detail || 'Failed to upload proof');
    } finally {
      setUploadingProof(false);
    }
  };

  const handleDispute = () => {
    setDisputeError('');
    if (disputeNote.trim().length < 10) {
      setDisputeError('Dispute reason must be at least 10 characters');
      return;
    }
    disputeMutation.mutate();
  };

  const downloadProof = async (url: string, fileName: string, mimeType: string) => {
    try {
      const target = `${FileSystem.cacheDirectory || FileSystem.documentDirectory}${Date.now()}-${fileName.replace(/[^a-zA-Z0-9._-]/g, '-')}`;
      const download = await FileSystem.downloadAsync(url, target);
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(download.uri, { mimeType });
      } else {
        Alert.alert('Proof Ready', `Saved to ${download.uri}`);
      }
    } catch {
      Alert.alert('Download failed', 'Unable to open this attachment right now.');
    }
  };

  const openProofAttachment = async (url: string, fileName: string, mimeType: string) => {
    if (mimeType.startsWith('image/')) {
      setSelectedProof({ url, fileName, mimeType });
      return;
    }
    await downloadProof(url, fileName, mimeType);
  };

  if (isLoading || !expense) {
    return (
      <View style={styles.loading}>
        <Text style={styles.loadingText}>Loading expense...</Text>
      </View>
    );
  }

  const isMyExpense = expense.paid_by_user.id === user?.id;
  const myShare = expense.splits.find(s => s.user.id === user?.id);
  const catColor = CATEGORY_COLORS[expense.category];
  const canEdit = !expense.is_settled && !expense.is_disputed;
  const isAdmin = (group?.members || []).some((member) => member.user.id === user?.id && member.role === 'admin');

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scroll}>
      {/* Hero card */}
      <View style={[styles.heroCard, { borderTopColor: catColor, borderTopWidth: 4 }]}>
        <View style={styles.heroTop}>
          <View style={[styles.catBadge, { backgroundColor: catColor + '20' }]}>
            <Text style={styles.catIcon}>{CATEGORY_ICONS[expense.category]}</Text>
            <Text style={[styles.catLabel, { color: catColor }]}>
              {expense.category.charAt(0).toUpperCase() + expense.category.slice(1)}
            </Text>
          </View>
          <View style={styles.statusBadges}>
            {expense.is_disputed && (
              <Badge label="⚠️ Disputed" color={Colors.danger} bgColor={Colors.dangerLight} />
            )}
            {expense.is_settled && (
              <Badge label="✅ Settled" color={Colors.success} bgColor={Colors.successLight} />
            )}
          </View>
        </View>

        <Text style={styles.heroAmount}>₹{(expense.amount / 100).toFixed(2)}</Text>
        <Text style={styles.heroDesc}>{expense.description}</Text>
        <Text style={styles.heroTime}>{format(new Date(expense.created_at), 'EEEE, d MMMM yyyy · HH:mm')}</Text>

        <Divider style={{ marginVertical: Spacing.md }} />

        <View style={styles.paidByRow}>
          <Avatar name={expense.paid_by_user.name || expense.paid_by_user.phone} size={36} />
          <View style={styles.paidByText}>
            <Text style={styles.paidByLabel}>Paid by</Text>
            <Text style={styles.paidByName}>
              {expense.paid_by_user.name || expense.paid_by_user.phone}
              {isMyExpense ? ' (You)' : ''}
            </Text>
          </View>
          <View style={styles.splitTypeBadge}>
            <Text style={styles.splitTypeText}>
              {expense.split_type === 'equal' ? '⚖️ Equal' :
               expense.split_type === 'exact' ? '🎯 Exact' : '% Percent'}
            </Text>
          </View>
        </View>
      </View>

      {/* My share highlight */}
      {myShare && (
        <View style={[styles.myShareCard, Shadow.sm]}>
          <Text style={styles.myShareLabel}>Your share</Text>
          <Text style={styles.myShareAmount}>₹{(myShare.amount / 100).toFixed(2)}</Text>
          {myShare.percentage && (
            <Text style={styles.mySharePct}>{myShare.percentage.toFixed(1)}%</Text>
          )}
        </View>
      )}

      {/* Split breakdown */}
      <Card style={styles.section}>
        <Text style={styles.sectionTitle}>Split Breakdown</Text>
        {expense.splits.map(split => (
          <View key={split.id} style={styles.splitRow}>
            <Avatar name={split.user.name || split.user.phone} size={32} />
            <Text style={styles.splitName} numberOfLines={1}>
              {split.user.name || split.user.phone}
              {split.user.id === user?.id ? ' (You)' : ''}
            </Text>
            <View style={styles.splitRight}>
              {split.percentage && (
                <Text style={styles.splitPct}>{split.percentage.toFixed(0)}%</Text>
              )}
              <Text style={styles.splitAmount}>₹{(split.amount / 100).toFixed(2)}</Text>
            </View>
          </View>
        ))}
      </Card>

      {/* Proof Attachments */}
      <Card style={styles.section}>
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>
            📎 Proof ({expense.proof_attachments.length}/{5})
          </Text>
          {canEdit && expense.proof_attachments.length < 5 && (
            <Button
              title={uploadingProof ? 'Uploading...' : '+ Add'}
              onPress={handleUploadProof}
              variant="secondary"
              size="sm"
              loading={uploadingProof}
            />
          )}
        </View>

        {expense.proof_attachments.length === 0 ? (
          <View style={styles.noProof}>
            <Text style={styles.noProofIcon}>📷</Text>
            <Text style={styles.noProofText}>No proof attached yet</Text>
            <Text style={styles.noProofSub}>Upload receipts or bills to strengthen accountability</Text>
          </View>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.proofScroll}>
            {expense.proof_attachments.map(att => (
              <TouchableOpacity
                key={att.id}
                onPress={() => att.presigned_url && openProofAttachment(att.presigned_url, att.file_name, att.mime_type)}
                style={styles.proofThumb}
              >
                {att.presigned_url && att.mime_type.startsWith('image/') ? (
                  <Image source={{ uri: att.presigned_url }} style={styles.proofImage} resizeMode="cover" />
                ) : (
                  <View style={[styles.proofImage, styles.proofPDF]}>
                    <Text style={styles.proofPDFIcon}>📄</Text>
                  </View>
                )}
                <View style={styles.proofMeta}>
                  <Text style={styles.proofUploader} numberOfLines={1}>
                    by {att.uploader.name || att.uploader.phone}
                  </Text>
                  <Text style={styles.proofTime}>
                    {format(new Date(att.uploaded_at), 'dd/MM HH:mm')}
                  </Text>
                </View>
                <View style={styles.proofLock}>
                  <Text style={styles.proofLockText}>🔒</Text>
                </View>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        <View style={styles.proofInfo}>
          <Text style={styles.proofInfoText}>
            🔐 Proofs are server-timestamped and SHA-256 verified. They cannot be backdated.
          </Text>
        </View>
      </Card>

      {/* Dispute section */}
        {expense.is_disputed && expense.dispute_note && (
          <Card style={[styles.section, styles.disputeCard]}>
            <Text style={styles.disputeTitle}>⚠️ Dispute Active</Text>
            <Text style={styles.disputeNote}>{expense.dispute_note}</Text>
            <Text style={styles.disputeFooter}>
              Raised by a group member · Frozen until resolved by admin
            </Text>
            {isAdmin ? (
              <Button
                title="Resolve Dispute"
                onPress={() => resolveDisputeMutation.mutate()}
                loading={resolveDisputeMutation.isPending}
                style={{ marginTop: Spacing.sm }}
              />
            ) : null}
          </Card>
        )}

      {/* Actions */}
      <View style={styles.actions}>
        {canEdit && !expense.is_disputed && (
          <Button
            title="⚠️ Raise Dispute"
            onPress={() => setShowDisputeModal(true)}
            variant="secondary"
            style={{ marginBottom: Spacing.sm, borderColor: Colors.warning, flex: 1 }}
          />
        )}
        {isMyExpense && canEdit && (
          <Button
            title="🗑️ Delete"
            onPress={handleDelete}
            variant="danger"
            loading={deleteExpenseMutation.isPending}
          />
        )}
      </View>

      {/* Proof viewer modal */}
      <Modal visible={!!selectedProof} transparent animationType="fade">
        <View style={styles.proofModal}>
          <View style={styles.proofModalHeader}>
            <TouchableOpacity style={styles.proofModalClose} onPress={() => setSelectedProof(null)}>
              <Text style={styles.proofModalCloseText}>✕ Close</Text>
            </TouchableOpacity>
            {selectedProof ? (
              <TouchableOpacity
                style={styles.proofModalDownload}
                onPress={() => downloadProof(selectedProof.url, selectedProof.fileName, selectedProof.mimeType)}
              >
                <Text style={styles.proofModalCloseText}>Download</Text>
              </TouchableOpacity>
            ) : null}
          </View>
          {selectedProof ? (
            <Image
              source={{ uri: selectedProof.url }}
              style={styles.proofModalImage}
              resizeMode="contain"
            />
          ) : null}
        </View>
      </Modal>

      {/* Dispute modal */}
      <Modal visible={showDisputeModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View style={[styles.modalCard, Shadow.lg]}>
              <Text style={styles.modalTitle}>Raise Dispute</Text>
              <Text style={styles.modalSub}>
                This expense will be frozen until the dispute is resolved by a group admin.
                All members will be notified.
              </Text>
              <Input
                label="Reason for Dispute *"
                value={disputeNote}
                onChangeText={v => { setDisputeNote(v); setDisputeError(''); }}
                placeholder="Describe why you're disputing this expense..."
                multiline
                numberOfLines={3}
                style={{ height: 80, textAlignVertical: 'top', paddingTop: Spacing.sm }}
                error={disputeError}
                autoFocus
              />
              <Text style={styles.charCount}>{disputeNote.length}/500 chars (min 10)</Text>
              <View style={styles.modalActions}>
                <Button
                  title="Cancel"
                  onPress={() => { setShowDisputeModal(false); setDisputeNote(''); setDisputeError(''); }}
                  variant="ghost"
                  style={{ flex: 1, marginRight: Spacing.sm }}
                />
                <Button
                  title="Submit Dispute"
                  onPress={handleDispute}
                  variant="danger"
                  loading={disputeMutation.isPending}
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
  scroll: { padding: Spacing.base, paddingBottom: 60 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loadingText: { color: Colors.textSecondary },

  heroCard: {
    backgroundColor: Colors.surface, borderRadius: Radius.xl,
    padding: Spacing.lg, marginBottom: Spacing.sm, overflow: 'hidden',
    ...Shadow.md,
  },
  heroTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: Spacing.md },
  catBadge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.sm, paddingVertical: 4, borderRadius: Radius.full },
  catIcon: { fontSize: 16, marginRight: 4 },
  catLabel: { fontSize: Typography.xs, fontWeight: '700' },
  statusBadges: { flexDirection: 'row', gap: 4 },
  heroAmount: { fontSize: Typography.xxxl, fontWeight: '900', color: Colors.textPrimary, letterSpacing: -1 },
  heroDesc: { fontSize: Typography.lg, fontWeight: '600', color: Colors.textSecondary, marginTop: 4 },
  heroTime: { fontSize: Typography.xs, color: Colors.textTertiary, marginTop: 8 },
  paidByRow: { flexDirection: 'row', alignItems: 'center' },
  paidByText: { flex: 1, marginLeft: Spacing.sm },
  paidByLabel: { fontSize: Typography.xs, color: Colors.textTertiary },
  paidByName: { fontSize: Typography.base, fontWeight: '700', color: Colors.textPrimary },
  splitTypeBadge: {
    backgroundColor: Colors.surfaceAlt, borderRadius: Radius.sm,
    paddingHorizontal: Spacing.sm, paddingVertical: 4,
  },
  splitTypeText: { fontSize: Typography.xs, fontWeight: '700', color: Colors.textSecondary },

  myShareCard: {
    backgroundColor: Colors.primary, borderRadius: Radius.lg,
    padding: Spacing.lg, marginBottom: Spacing.sm,
    flexDirection: 'row', alignItems: 'center',
  },
  myShareLabel: { flex: 1, color: 'rgba(255,255,255,0.8)', fontSize: Typography.sm, fontWeight: '600' },
  myShareAmount: { fontSize: Typography.xxl, fontWeight: '900', color: Colors.textInverse },
  mySharePct: { fontSize: Typography.sm, color: 'rgba(255,255,255,0.8)', marginLeft: Spacing.xs },

  section: { marginBottom: Spacing.sm },
  sectionTitle: { fontSize: Typography.base, fontWeight: '800', color: Colors.textPrimary, marginBottom: Spacing.md },
  sectionHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.md },

  splitRow: { flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.sm },
  splitName: { flex: 1, fontSize: Typography.base, color: Colors.textPrimary, fontWeight: '600', marginLeft: Spacing.sm },
  splitRight: { alignItems: 'flex-end' },
  splitPct: { fontSize: Typography.xs, color: Colors.textTertiary },
  splitAmount: { fontSize: Typography.base, fontWeight: '700', color: Colors.textPrimary },

  noProof: { alignItems: 'center', paddingVertical: Spacing.lg },
  noProofIcon: { fontSize: 36, marginBottom: Spacing.sm },
  noProofText: { fontSize: Typography.base, fontWeight: '700', color: Colors.textSecondary },
  noProofSub: { fontSize: Typography.xs, color: Colors.textTertiary, textAlign: 'center', marginTop: 4 },

  proofScroll: { marginBottom: Spacing.sm },
  proofThumb: {
    width: 120, marginRight: Spacing.sm,
    borderRadius: Radius.md, overflow: 'hidden',
    backgroundColor: Colors.surfaceAlt, borderWidth: 1, borderColor: Colors.border,
  },
  proofImage: { width: 120, height: 90 },
  proofPDF: { alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.primaryLight },
  proofPDFIcon: { fontSize: 36 },
  proofMeta: { padding: 6 },
  proofUploader: { fontSize: 10, fontWeight: '600', color: Colors.textSecondary },
  proofTime: { fontSize: 9, color: Colors.textTertiary },
  proofLock: { position: 'absolute', top: 4, right: 4, backgroundColor: 'rgba(0,0,0,0.4)', borderRadius: 8, padding: 2 },
  proofLockText: { fontSize: 10 },

  proofInfo: {
    backgroundColor: Colors.successLight, borderRadius: Radius.sm,
    padding: Spacing.sm, marginTop: Spacing.xs,
  },
  proofInfoText: { fontSize: Typography.xs, color: Colors.success, lineHeight: 16 },

  disputeCard: { borderLeftWidth: 4, borderLeftColor: Colors.danger },
  disputeTitle: { fontSize: Typography.base, fontWeight: '800', color: Colors.danger, marginBottom: Spacing.sm },
  disputeNote: { fontSize: Typography.sm, color: Colors.textPrimary, lineHeight: 20 },
  disputeFooter: { fontSize: Typography.xs, color: Colors.textTertiary, marginTop: Spacing.sm },

  actions: { marginTop: Spacing.md, gap: Spacing.sm },

  proofModal: { flex: 1, backgroundColor: 'rgba(0,0,0,0.95)', justifyContent: 'center' },
  proofModalHeader: {
    position: 'absolute',
    top: 50,
    left: 0,
    right: 0,
    zIndex: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
  },
  proofModalClose: { padding: Spacing.md },
  proofModalDownload: { padding: Spacing.md },
  proofModalCloseText: { color: Colors.textInverse, fontSize: Typography.base, fontWeight: '600' },
  proofModalImage: { width: '100%', height: '80%' },

  modalOverlay: { flex: 1, backgroundColor: Colors.overlay, justifyContent: 'flex-end' },
  modalCard: {
    backgroundColor: Colors.surface, borderTopLeftRadius: Radius.xl, borderTopRightRadius: Radius.xl,
    padding: Spacing.xl, paddingBottom: Spacing.xxxl,
  },
  modalTitle: { fontSize: Typography.xl, fontWeight: '800', color: Colors.textPrimary, marginBottom: 4 },
  modalSub: { fontSize: Typography.sm, color: Colors.textSecondary, marginBottom: Spacing.lg, lineHeight: 20 },
  charCount: { fontSize: Typography.xs, color: Colors.textTertiary, textAlign: 'right', marginTop: -8, marginBottom: Spacing.md },
  modalActions: { flexDirection: 'row' },
});
