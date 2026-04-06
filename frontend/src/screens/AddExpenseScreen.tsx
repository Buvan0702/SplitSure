import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  KeyboardAvoidingView, Platform, Switch, Alert,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { groupsAPI, expensesAPI } from '../services/api';
import { Group, SplitType, ExpenseCategory, CATEGORY_ICONS, CATEGORY_COLORS } from '../types';
import { Colors, Typography, Spacing, Radius, Shadow } from '../utils/theme';
import { Button, Input, Avatar, Card } from '../components/ui';
import { useAuthStore } from '../store/authStore';

const CATEGORIES: { value: ExpenseCategory; label: string }[] = [
  { value: 'food', label: 'Food' },
  { value: 'transport', label: 'Transport' },
  { value: 'accommodation', label: 'Stay' },
  { value: 'utilities', label: 'Utilities' },
  { value: 'misc', label: 'Misc' },
];

const SPLIT_TYPES: { value: SplitType; label: string; desc: string }[] = [
  { value: 'equal', label: 'Equal', desc: 'Split evenly among all' },
  { value: 'exact', label: 'Exact', desc: 'Specify each person\'s share' },
  { value: 'percentage', label: '%', desc: 'Split by percentage' },
];

export default function AddExpenseScreen() {
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useAuthStore();

  const [description, setDescription] = useState('');
  const [amountStr, setAmountStr] = useState('');
  const [category, setCategory] = useState<ExpenseCategory>('misc');
  const [splitType, setSplitType] = useState<SplitType>('equal');
  const [selectedMembers, setSelectedMembers] = useState<Set<number>>(new Set());
  const [exactAmounts, setExactAmounts] = useState<Record<number, string>>({});
  const [percentages, setPercentages] = useState<Record<number, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  const { data: group } = useQuery({
    queryKey: ['group', groupId],
    queryFn: async () => {
      const { data } = await groupsAPI.get(Number(groupId));
      return data as Group;
    },
    onSuccess: (g: Group) => {
      // Select all members by default
      setSelectedMembers(new Set(g.members.map(m => m.user.id)));
    },
  });

  const createMutation = useMutation({
    mutationFn: (payload: any) => expensesAPI.create(Number(groupId), payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expenses', groupId] });
      queryClient.invalidateQueries({ queryKey: ['balances', groupId] });
      router.back();
    },
    onError: (e: any) => {
      Alert.alert('Error', e?.response?.data?.detail || 'Failed to add expense');
    },
  });

  const amountPaise = Math.round(parseFloat(amountStr || '0') * 100);
  const members = group?.members || [];
  const selectedMembersList = members.filter(m => selectedMembers.has(m.user.id));

  const toggleMember = (userId: number) => {
    const next = new Set(selectedMembers);
    if (next.has(userId)) {
      if (next.size <= 1) return; // At least 1 member
      next.delete(userId);
    } else {
      next.add(userId);
    }
    setSelectedMembers(next);
  };

  const getEqualShare = () => {
    if (selectedMembersList.length === 0) return 0;
    return Math.floor(amountPaise / selectedMembersList.length);
  };

  const getTotalExact = () =>
    Object.values(exactAmounts).reduce((s, v) => s + Math.round(parseFloat(v || '0') * 100), 0);

  const getTotalPct = () =>
    Object.values(percentages).reduce((s, v) => s + parseFloat(v || '0'), 0);

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!description.trim()) errs.description = 'Description is required';
    if (!amountStr || amountPaise <= 0) errs.amount = 'Enter a valid amount';
    if (splitType === 'exact') {
      const total = getTotalExact();
      if (total !== amountPaise) errs.splits = `Amounts must sum to ₹${(amountPaise/100).toFixed(2)} (currently ₹${(total/100).toFixed(2)})`;
    }
    if (splitType === 'percentage') {
      const total = getTotalPct();
      if (Math.abs(total - 100) > 0.01) errs.splits = `Percentages must sum to 100% (currently ${total.toFixed(1)}%)`;
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = () => {
    if (!validate()) return;

    const splits = selectedMembersList.map(m => {
      if (splitType === 'equal') return { user_id: m.user.id };
      if (splitType === 'exact') return {
        user_id: m.user.id,
        amount: Math.round(parseFloat(exactAmounts[m.user.id] || '0') * 100),
      };
      return {
        user_id: m.user.id,
        percentage: parseFloat(percentages[m.user.id] || '0'),
      };
    });

    createMutation.mutate({
      amount: amountPaise,
      description: description.trim(),
      category,
      split_type: splitType,
      splits,
    });
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        {/* Amount */}
        <Card style={styles.amountCard}>
          <Text style={styles.sectionLabel}>Total Amount</Text>
          <View style={styles.amountRow}>
            <Text style={styles.rupeeSign}>₹</Text>
            <Input
              value={amountStr}
              onChangeText={v => { setAmountStr(v); setErrors(e => ({ ...e, amount: '' })); }}
              keyboardType="decimal-pad"
              placeholder="0.00"
              style={styles.amountInput}
              error={errors.amount}
              containerStyle={{ flex: 1, marginBottom: 0 }}
            />
          </View>
        </Card>

        {/* Description */}
        <Input
          label="What's it for?"
          value={description}
          onChangeText={v => { setDescription(v); setErrors(e => ({ ...e, description: '' })); }}
          placeholder="e.g., Lunch at Café, Train tickets"
          error={errors.description}
        />

        {/* Category */}
        <Text style={styles.sectionLabel}>Category</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.catScroll}>
          {CATEGORIES.map(c => (
            <TouchableOpacity
              key={c.value}
              onPress={() => setCategory(c.value)}
              style={[
                styles.catChip,
                category === c.value && {
                  backgroundColor: CATEGORY_COLORS[c.value],
                  borderColor: CATEGORY_COLORS[c.value],
                },
              ]}
            >
              <Text style={styles.catIcon}>{CATEGORY_ICONS[c.value]}</Text>
              <Text style={[
                styles.catLabel,
                category === c.value && { color: Colors.textInverse },
              ]}>{c.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Split Type */}
        <Text style={[styles.sectionLabel, { marginTop: Spacing.lg }]}>Split Type</Text>
        <View style={styles.splitTypeRow}>
          {SPLIT_TYPES.map(s => (
            <TouchableOpacity
              key={s.value}
              onPress={() => setSplitType(s.value)}
              style={[
                styles.splitTypeBtn,
                splitType === s.value && styles.splitTypeBtnActive,
              ]}
            >
              <Text style={[
                styles.splitTypeName,
                splitType === s.value && { color: Colors.primary },
              ]}>{s.label}</Text>
              <Text style={styles.splitTypeDesc}>{s.desc}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Members */}
        <Text style={[styles.sectionLabel, { marginTop: Spacing.lg }]}>Split Among</Text>
        {members.map(m => {
          const selected = selectedMembers.has(m.user.id);
          const isMe = m.user.id === user?.id;
          const share = selected ? getEqualShare() : 0;

          return (
            <TouchableOpacity
              key={m.user.id}
              onPress={() => toggleMember(m.user.id)}
              style={[styles.memberRow, !selected && styles.memberRowUnsel]}
            >
              <View style={styles.memberLeft}>
                <Avatar name={m.user.name || m.user.phone} size={38} />
                <View style={styles.memberText}>
                  <Text style={styles.memberName}>
                    {m.user.name || m.user.phone}{isMe ? ' (You)' : ''}
                  </Text>
                  {splitType === 'equal' && selected && amountPaise > 0 && (
                    <Text style={styles.memberShare}>₹{(share / 100).toFixed(2)}</Text>
                  )}
                </View>
              </View>

              <View style={styles.memberRight}>
                {splitType === 'exact' && selected && (
                  <Input
                    value={exactAmounts[m.user.id] || ''}
                    onChangeText={v => setExactAmounts(prev => ({ ...prev, [m.user.id]: v }))}
                    keyboardType="decimal-pad"
                    placeholder="0.00"
                    containerStyle={{ marginBottom: 0, width: 90 }}
                    style={styles.splitInput}
                    leftIcon={<Text style={styles.smallRupee}>₹</Text>}
                  />
                )}
                {splitType === 'percentage' && selected && (
                  <Input
                    value={percentages[m.user.id] || ''}
                    onChangeText={v => setPercentages(prev => ({ ...prev, [m.user.id]: v }))}
                    keyboardType="decimal-pad"
                    placeholder="0"
                    containerStyle={{ marginBottom: 0, width: 80 }}
                    style={styles.splitInput}
                    rightIcon={<Text style={styles.pctSign}>%</Text>}
                  />
                )}
                <View style={[styles.checkbox, selected && styles.checkboxActive]}>
                  {selected && <Text style={styles.checkmark}>✓</Text>}
                </View>
              </View>
            </TouchableOpacity>
          );
        })}

        {errors.splits && (
          <Text style={styles.splitError}>{errors.splits}</Text>
        )}

        {/* Summary for exact/pct */}
        {splitType === 'exact' && amountPaise > 0 && (
          <View style={styles.splitSummary}>
            <Text style={styles.splitSummaryText}>
              Remaining: ₹{((amountPaise - getTotalExact()) / 100).toFixed(2)}
            </Text>
          </View>
        )}
        {splitType === 'percentage' && (
          <View style={styles.splitSummary}>
            <Text style={styles.splitSummaryText}>
              Total: {getTotalPct().toFixed(1)}% {Math.abs(getTotalPct() - 100) < 0.01 ? '✅' : ''}
            </Text>
          </View>
        )}

        <Button
          title="Add Expense"
          onPress={handleSubmit}
          loading={createMutation.isPending}
          size="lg"
          style={{ marginTop: Spacing.xl }}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  scroll: { padding: Spacing.base, paddingBottom: 80 },

  amountCard: { alignItems: 'center', marginBottom: Spacing.lg, backgroundColor: Colors.primary },
  amountRow: { flexDirection: 'row', alignItems: 'center' },
  rupeeSign: { fontSize: 36, fontWeight: '300', color: Colors.textInverse, marginRight: 4, marginBottom: 2 },
  amountInput: { fontSize: 42, fontWeight: '700', color: Colors.textInverse, textAlign: 'left', height: 60 },

  sectionLabel: { fontSize: Typography.sm, fontWeight: '700', color: Colors.textSecondary, marginBottom: Spacing.sm, textTransform: 'uppercase', letterSpacing: 0.5 },

  catScroll: { marginBottom: Spacing.md },
  catChip: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm, borderRadius: Radius.full,
    borderWidth: 1.5, borderColor: Colors.border, marginRight: Spacing.sm,
    backgroundColor: Colors.surface,
  },
  catIcon: { fontSize: 16, marginRight: 4 },
  catLabel: { fontSize: Typography.sm, fontWeight: '600', color: Colors.textSecondary },

  splitTypeRow: { flexDirection: 'row', gap: Spacing.sm },
  splitTypeBtn: {
    flex: 1, padding: Spacing.md, borderRadius: Radius.md,
    borderWidth: 1.5, borderColor: Colors.border, backgroundColor: Colors.surface,
    alignItems: 'center',
  },
  splitTypeBtnActive: { borderColor: Colors.primary, backgroundColor: Colors.primaryLight },
  splitTypeName: { fontSize: Typography.md, fontWeight: '800', color: Colors.textSecondary },
  splitTypeDesc: { fontSize: Typography.xs, color: Colors.textTertiary, marginTop: 2, textAlign: 'center' },

  memberRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: Colors.surface, borderRadius: Radius.md, padding: Spacing.md,
    marginBottom: Spacing.sm, borderWidth: 1.5, borderColor: Colors.border,
  },
  memberRowUnsel: { opacity: 0.4 },
  memberLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  memberText: { marginLeft: Spacing.sm },
  memberName: { fontSize: Typography.base, fontWeight: '600', color: Colors.textPrimary },
  memberShare: { fontSize: Typography.sm, color: Colors.primary, fontWeight: '700', marginTop: 2 },
  memberRight: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  splitInput: { fontSize: Typography.sm, height: 40, paddingHorizontal: 4 },
  smallRupee: { fontSize: Typography.sm, color: Colors.textSecondary },
  pctSign: { fontSize: Typography.sm, color: Colors.textSecondary },
  checkbox: {
    width: 24, height: 24, borderRadius: 12, borderWidth: 2,
    borderColor: Colors.border, alignItems: 'center', justifyContent: 'center',
  },
  checkboxActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  checkmark: { color: Colors.textInverse, fontSize: 14, fontWeight: '700' },

  splitError: { color: Colors.danger, fontSize: Typography.sm, marginTop: Spacing.xs, textAlign: 'center' },
  splitSummary: {
    backgroundColor: Colors.primaryLight, borderRadius: Radius.md,
    padding: Spacing.sm, marginTop: Spacing.sm, alignItems: 'center',
  },
  splitSummaryText: { color: Colors.primary, fontWeight: '700', fontSize: Typography.sm },
});
