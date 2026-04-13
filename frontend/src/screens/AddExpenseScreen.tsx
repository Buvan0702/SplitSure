import React, { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MaterialIcons } from '@expo/vector-icons';
import { AppBackdrop, FloatingDock, TopBar } from '../components/chrome';
import { Button, Card, Input } from '../components/ui';
import { expensesAPI, groupsAPI } from '../services/api';
import { ExpenseCategory, Group, SplitType } from '../types';
import { Colors, Radius, Spacing, Typography } from '../utils/theme';

const categories: Array<{ value: ExpenseCategory; label: string }> = [
  { value: 'food', label: 'Food' },
  { value: 'transport', label: 'Transport' },
  { value: 'accommodation', label: 'Hotel' },
  { value: 'utilities', label: 'Utilities' },
  { value: 'misc', label: 'Entertainment' },
];

export default function AddExpenseScreen() {
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();

  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<ExpenseCategory>('food');
  const [splitType, setSplitType] = useState<SplitType>('equal');
  const [exactAmounts, setExactAmounts] = useState<Record<number, string>>({});
  const [percentages, setPercentages] = useState<Record<number, string>>({});
  const [proofFile, setProofFile] = useState<DocumentPicker.DocumentPickerAsset | null>(null);

  const groupQuery = useQuery({
    queryKey: ['group', groupId],
    queryFn: async () => {
      const { data } = await groupsAPI.get(Number(groupId));
      return data as Group;
    },
  });

  const createExpense = useMutation({
    mutationFn: async () => {
      const amountPaise = Math.round(parseFloat(amount || '0') * 100);
      if (!description.trim() || amountPaise <= 0) {
        throw new Error('Enter a valid amount and description');
      }

      const members = groupQuery.data?.members || [];
      if (!members.length) {
        throw new Error('Group members are still loading');
      }

      const splits = members.map((member) => {
        if (splitType === 'exact') {
          return {
            user_id: member.user.id,
            amount: Math.round(parseFloat(exactAmounts[member.user.id] || '0') * 100),
          };
        }
        if (splitType === 'percentage') {
          return {
            user_id: member.user.id,
            percentage: parseFloat(percentages[member.user.id] || '0'),
          };
        }
        return { user_id: member.user.id };
      });

      if (splitType === 'exact') {
        const exactTotal = splits.reduce((sum, split) => sum + (split.amount || 0), 0);
        if (exactTotal !== amountPaise) {
          throw new Error('Exact split amounts must add up to the full expense');
        }
      }

      if (splitType === 'percentage') {
        const totalPercentage = splits.reduce((sum, split) => sum + (split.percentage || 0), 0);
        if (Math.abs(totalPercentage - 100) > 0.01) {
          throw new Error('Percentages must add up to 100%');
        }
      }

      const createResponse = await expensesAPI.create(Number(groupId), {
        amount: amountPaise,
        description: description.trim(),
        category,
        split_type: splitType,
        splits,
      });

      if (proofFile) {
        const formData = new FormData();
        formData.append(
          'file',
          {
            uri: proofFile.uri,
            name: proofFile.name,
            type: proofFile.mimeType || 'application/octet-stream',
          } as any,
        );
        await expensesAPI.uploadAttachment(Number(groupId), createResponse.data.id, formData);
      }

      return createResponse;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expenses', groupId] });
      queryClient.invalidateQueries({ queryKey: ['balances', groupId] });
      router.back();
    },
    onError: (error: any) => {
      Alert.alert(error?.message || error?.response?.data?.detail || 'Failed to create expense');
    },
  });

  const pickProof = async () => {
    const result = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true, multiple: false });
    if (!result.canceled) {
      setProofFile(result.assets[0]);
    }
  };

  const amountValue = Math.round(parseFloat(amount || '0') * 100);

  return (
    <AppBackdrop>
      <TopBar leftIcon="arrow-back" onLeftPress={() => router.back()} title="SPLITSURE" subtitle="Expense Architect" />
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.amountHero}>
          <Text style={styles.amountLabel}>Transaction Value</Text>
          <View style={styles.amountRow}>
            <Text style={styles.currency}>₹</Text>
            <Input
              containerStyle={{ flex: 1, marginBottom: 0 }}
              value={amount}
              onChangeText={setAmount}
              keyboardType="decimal-pad"
              placeholder="0.00"
              style={styles.amountInput}
            />
          </View>
        </View>

        <Card style={styles.detailCard}>
          <Input
            label="Floating Description"
            value={description}
            onChangeText={setDescription}
            placeholder="GALAXY GATE DINNER & STAY"
          />
          <Text style={styles.sectionOverline}>Expense Category</Text>
          <View style={styles.chipWrap}>
            {categories.map((item) => {
              const active = item.value === category;
              return (
                <Pressable key={item.value} onPress={() => setCategory(item.value)} style={[styles.categoryChip, active && styles.categoryChipActive]}>
                  <Text style={[styles.categoryChipText, active && styles.categoryChipTextActive]}>{item.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </Card>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionOverline}>Split Mode</Text>
          <View style={styles.toggle}>
            {(['equal', 'exact', 'percentage'] as SplitType[]).map((value) => {
              const active = value === splitType;
              return (
                <Pressable key={value} onPress={() => setSplitType(value)} style={[styles.toggleChip, active && styles.toggleChipActive]}>
                  <Text style={[styles.toggleText, active && styles.toggleTextActive]}>{value === 'percentage' ? 'PERCENT' : value.toUpperCase()}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <Card style={styles.memberTable}>
          {(groupQuery.data?.members || []).map((member) => (
            <View key={member.id} style={styles.memberRow}>
              <View>
                <Text style={styles.memberName}>{member.user.name || member.user.phone}</Text>
                <Text style={styles.memberRole}>{member.role}</Text>
              </View>
              {splitType === 'equal' ? (
                <Text style={styles.memberValue}>
                  ₹{groupQuery.data?.members.length ? (amountValue / Math.max(groupQuery.data.members.length, 1) / 100).toFixed(2) : '0.00'}
                </Text>
              ) : null}
              {splitType === 'exact' ? (
                <Input
                  containerStyle={{ marginBottom: 0, width: 110 }}
                  value={exactAmounts[member.user.id] || ''}
                  onChangeText={(value) => setExactAmounts((current) => ({ ...current, [member.user.id]: value }))}
                  keyboardType="decimal-pad"
                  placeholder="0.00"
                />
              ) : null}
              {splitType === 'percentage' ? (
                <Input
                  containerStyle={{ marginBottom: 0, width: 110 }}
                  value={percentages[member.user.id] || ''}
                  onChangeText={(value) => setPercentages((current) => ({ ...current, [member.user.id]: value }))}
                  keyboardType="decimal-pad"
                  placeholder="0"
                  rightAddon={<Text style={styles.memberRole}>%</Text>}
                />
              ) : null}
            </View>
          ))}
        </Card>

        <Card style={styles.vaultCard}>
          <View style={styles.vaultHeader}>
            <Text style={styles.vaultTitle}>PROOF VAULT</Text>
            <Text style={styles.vaultSeal}>TAMPER-PROOF</Text>
          </View>
          <View style={styles.vaultGrid}>
            <Pressable onPress={pickProof} style={styles.uploadZone}>
              <MaterialIcons color={Colors.textSecondary} name="photo-camera" size={28} />
              <Text style={styles.uploadText}>{proofFile ? proofFile.name : 'Add Invoice Proof'}</Text>
            </Pressable>
            <View style={styles.proofMeta}>
              <Text style={styles.proofHash}>{proofFile ? 'Proof selected and queued for lock' : 'No proof attached yet'}</Text>
              <Text style={styles.proofTime}>Attachment is uploaded after the expense is created.</Text>
            </View>
          </View>
        </Card>

        <Button title="LOCK EXPENSE TO LEDGER" onPress={() => createExpense.mutate()} loading={createExpense.isPending} />
      </ScrollView>
      <FloatingDock current="activity" />
    </AppBackdrop>
  );
}

const styles = StyleSheet.create({
  scroll: {
    paddingHorizontal: Spacing.base,
    paddingTop: Spacing.base,
    paddingBottom: 170,
  },
  amountHero: {
    alignItems: 'center',
    paddingVertical: Spacing.xl,
  },
  amountLabel: {
    color: Colors.textSecondary,
    fontSize: Typography.xs,
    fontWeight: '800',
    letterSpacing: 3,
    textTransform: 'uppercase',
  },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: Spacing.md,
  },
  currency: {
    color: Colors.textPrimary,
    fontSize: 48,
    fontWeight: '300',
    marginRight: 8,
  },
  amountInput: {
    fontSize: 48,
    fontWeight: '800',
    letterSpacing: -1,
  },
  detailCard: {
    marginBottom: Spacing.xl,
  },
  sectionOverline: {
    color: Colors.textSecondary,
    fontSize: Typography.xs,
    fontWeight: '800',
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginBottom: Spacing.sm,
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  categoryChip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: Radius.full,
    backgroundColor: Colors.surfaceLowest,
    borderWidth: 1,
    borderColor: Colors.ghostBorder,
  },
  categoryChipActive: {
    backgroundColor: 'rgba(29,251,165,0.1)',
    borderColor: 'rgba(29,251,165,0.2)',
  },
  categoryChipText: {
    color: Colors.textSecondary,
    fontSize: Typography.sm,
    fontWeight: '700',
  },
  categoryChipTextActive: {
    color: Colors.secondary,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.base,
    gap: Spacing.sm,
  },
  toggle: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.ghostBorder,
    padding: 4,
  },
  toggleChip: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: Radius.sm,
  },
  toggleChipActive: {
    backgroundColor: Colors.primary,
  },
  toggleText: {
    color: Colors.textSecondary,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  toggleTextActive: {
    color: Colors.primaryInk,
  },
  memberTable: {
    paddingVertical: 0,
    marginBottom: Spacing.xl,
  },
  memberRow: {
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
    paddingVertical: Spacing.base,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  memberName: {
    color: Colors.textPrimary,
    fontSize: Typography.base,
    fontWeight: '700',
  },
  memberRole: {
    color: Colors.textSecondary,
    fontSize: Typography.xs,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginTop: 4,
  },
  memberValue: {
    color: Colors.secondary,
    fontSize: Typography.base,
    fontWeight: '800',
  },
  vaultCard: {
    marginBottom: Spacing.xl,
  },
  vaultHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  vaultTitle: {
    color: Colors.textPrimary,
    fontSize: Typography.lg,
    fontWeight: '800',
  },
  vaultSeal: {
    color: Colors.secondary,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.5,
  },
  vaultGrid: {
    gap: Spacing.base,
  },
  uploadZone: {
    minHeight: 180,
    borderRadius: Radius.md,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: 'rgba(255,255,255,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    backgroundColor: 'rgba(0,0,0,0.14)',
  },
  uploadText: {
    color: Colors.textSecondary,
    fontSize: Typography.sm,
    fontWeight: '700',
  },
  proofMeta: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    padding: Spacing.base,
  },
  proofHash: {
    color: Colors.textPrimary,
    fontSize: Typography.sm,
    fontWeight: '700',
    marginBottom: 6,
  },
  proofTime: {
    color: Colors.textSecondary,
    fontSize: Typography.sm,
  },
});
