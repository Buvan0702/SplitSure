import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Alert, Switch,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { usersAPI } from '../services/api';
import { Colors, Typography, Spacing, Radius, Shadow } from '../utils/theme';
import { Button, Card, Input, Avatar, Divider } from '../components/ui';
import { useAuthStore } from '../store/authStore';

export default function ProfileScreen() {
  const { user, logout, updateUser } = useAuthStore();
  const router = useRouter();

  const [name, setName] = useState(user?.name || '');
  const [email, setEmail] = useState(user?.email || '');
  const [upiId, setUpiId] = useState(user?.upi_id || '');
  const [editing, setEditing] = useState(false);

  const updateMutation = useMutation({
    mutationFn: () => usersAPI.updateMe({ name, email, upi_id: upiId }),
    onSuccess: ({ data }) => {
      updateUser(data);
      setEditing(false);
      Alert.alert('✅ Profile Updated', 'Your profile has been saved.');
    },
    onError: (e: any) => {
      Alert.alert('Error', e?.response?.data?.detail || 'Failed to update profile');
    },
  });

  const handleLogout = () => {
    Alert.alert('Logout', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Logout', style: 'destructive',
        onPress: async () => { await logout(); router.replace('/login'); },
      },
    ]);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scroll}>
      {/* Profile header */}
      <View style={[styles.profileHeader, Shadow.md]}>
        <Avatar name={user?.name || user?.phone} size={80} />
        <Text style={styles.profileName}>{user?.name || 'Set your name'}</Text>
        <Text style={styles.profilePhone}>{user?.phone}</Text>
        {user?.is_paid_tier ? (
          <View style={styles.proBadge}>
            <Text style={styles.proBadgeText}>⭐ Pro Member</Text>
          </View>
        ) : (
          <View style={styles.freeBadge}>
            <Text style={styles.freeBadgeText}>Free Tier</Text>
          </View>
        )}
      </View>

      {/* Edit fields */}
      <Card style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Personal Info</Text>
          {!editing && (
            <Button title="Edit" onPress={() => setEditing(true)} variant="ghost" size="sm" />
          )}
        </View>

        <Input
          label="Full Name"
          value={name}
          onChangeText={setName}
          editable={editing}
          placeholder="Your full name"
          style={!editing && styles.readOnly}
        />

        <Input
          label="Email (optional)"
          value={email}
          onChangeText={setEmail}
          editable={editing}
          keyboardType="email-address"
          placeholder="you@example.com"
          style={!editing && styles.readOnly}
        />

        {editing && (
          <View style={styles.editActions}>
            <Button
              title="Cancel"
              onPress={() => {
                setEditing(false);
                setName(user?.name || '');
                setEmail(user?.email || '');
                setUpiId(user?.upi_id || '');
              }}
              variant="ghost"
              style={{ flex: 1, marginRight: Spacing.sm }}
            />
            <Button
              title="Save Changes"
              onPress={() => updateMutation.mutate()}
              loading={updateMutation.isPending}
              style={{ flex: 1.5 }}
            />
          </View>
        )}
      </Card>

      {/* UPI ID */}
      <Card style={styles.section}>
        <Text style={styles.sectionTitle}>💳 UPI ID</Text>
        <Text style={styles.sectionDesc}>
          Add your UPI ID so others can pay you directly via GPay, PhonePe, or Paytm
        </Text>
        <Input
          label="UPI ID"
          value={upiId}
          onChangeText={setUpiId}
          placeholder="yourname@upi"
          keyboardType="email-address"
          autoCapitalize="none"
        />
        <Button
          title="Save UPI ID"
          onPress={() => {
            usersAPI.updateMe({ upi_id: upiId }).then(({ data }) => {
              updateUser(data);
              Alert.alert('✅ UPI ID Saved');
            });
          }}
          variant="secondary"
          size="sm"
        />
      </Card>

      {/* Plan */}
      {!user?.is_paid_tier && (
        <Card style={[styles.section, styles.upgradeCard]}>
          <Text style={styles.upgradeTitle}>🚀 Upgrade to Pro</Text>
          <Text style={styles.upgradeDesc}>
            Get unlimited groups, full audit history, PDF settlement reports, and priority support.
          </Text>
          <View style={styles.pricingRow}>
            <View style={styles.pricingOption}>
              <Text style={styles.pricingAmount}>₹99</Text>
              <Text style={styles.pricingPeriod}>/month</Text>
            </View>
            <View style={[styles.pricingOption, styles.pricingPopular]}>
              <Text style={styles.popularLabel}>BEST VALUE</Text>
              <Text style={[styles.pricingAmount, { color: Colors.textInverse }]}>₹199</Text>
              <Text style={[styles.pricingPeriod, { color: 'rgba(255,255,255,0.8)' }]}>3 months</Text>
            </View>
            <View style={styles.pricingOption}>
              <Text style={styles.pricingAmount}>₹299</Text>
              <Text style={styles.pricingPeriod}>/year</Text>
            </View>
          </View>
          <Button title="Upgrade Now" onPress={() => Alert.alert('Coming soon!')} style={{ marginTop: Spacing.md }} />
        </Card>
      )}

      {/* Stats */}
      <Card style={styles.section}>
        <Text style={styles.sectionTitle}>📊 Your Stats</Text>
        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>—</Text>
            <Text style={styles.statLabel}>Groups</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>—</Text>
            <Text style={styles.statLabel}>Expenses</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>—</Text>
            <Text style={styles.statLabel}>Settled</Text>
          </View>
        </View>
      </Card>

      <Divider style={{ marginVertical: Spacing.md }} />

      <Button
        title="Log Out"
        onPress={handleLogout}
        variant="danger"
        style={{ marginBottom: Spacing.xxxl }}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  scroll: { paddingBottom: 80 },

  profileHeader: {
    alignItems: 'center', backgroundColor: Colors.surface,
    paddingTop: Spacing.xl, paddingBottom: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  profileName: { fontSize: Typography.xl, fontWeight: '800', color: Colors.textPrimary, marginTop: Spacing.md },
  profilePhone: { fontSize: Typography.sm, color: Colors.textSecondary, marginTop: 2 },
  proBadge: {
    backgroundColor: Colors.warning, borderRadius: Radius.full,
    paddingHorizontal: Spacing.md, paddingVertical: 4, marginTop: Spacing.sm,
  },
  proBadgeText: { fontSize: Typography.xs, fontWeight: '700', color: Colors.textPrimary },
  freeBadge: {
    backgroundColor: Colors.surfaceAlt, borderRadius: Radius.full,
    paddingHorizontal: Spacing.md, paddingVertical: 4, marginTop: Spacing.sm,
    borderWidth: 1, borderColor: Colors.border,
  },
  freeBadgeText: { fontSize: Typography.xs, fontWeight: '600', color: Colors.textSecondary },

  section: { marginHorizontal: Spacing.base, marginBottom: Spacing.sm },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.md },
  sectionTitle: { fontSize: Typography.base, fontWeight: '800', color: Colors.textPrimary },
  sectionDesc: { fontSize: Typography.sm, color: Colors.textSecondary, marginBottom: Spacing.md, lineHeight: 18 },
  readOnly: { color: Colors.textSecondary },
  editActions: { flexDirection: 'row', marginTop: Spacing.sm },

  upgradeCard: { backgroundColor: Colors.primary },
  upgradeTitle: { fontSize: Typography.lg, fontWeight: '800', color: Colors.textInverse, marginBottom: 6 },
  upgradeDesc: { fontSize: Typography.sm, color: 'rgba(255,255,255,0.8)', lineHeight: 18, marginBottom: Spacing.md },
  pricingRow: { flexDirection: 'row', gap: Spacing.sm },
  pricingOption: {
    flex: 1, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: Radius.md,
    padding: Spacing.md, alignItems: 'center',
  },
  pricingPopular: { backgroundColor: Colors.primaryDark },
  popularLabel: { fontSize: 8, fontWeight: '800', color: Colors.warning, marginBottom: 2 },
  pricingAmount: { fontSize: Typography.lg, fontWeight: '800', color: Colors.textInverse },
  pricingPeriod: { fontSize: Typography.xs, color: 'rgba(255,255,255,0.7)', marginTop: 1 },

  statsRow: { flexDirection: 'row', justifyContent: 'space-around', marginTop: Spacing.sm },
  statItem: { alignItems: 'center' },
  statValue: { fontSize: Typography.xl, fontWeight: '800', color: Colors.primary },
  statLabel: { fontSize: Typography.xs, color: Colors.textSecondary, marginTop: 2 },
});
