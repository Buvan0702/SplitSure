import React, { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useMutation } from '@tanstack/react-query';
import { AppBackdrop, TopBar } from '../components/chrome';
import { Avatar, Badge, Button, Card, Input } from '../components/ui';
import { usersAPI } from '../services/api';
import { useAuthStore } from '../store/authStore';
import { Colors, Spacing, Typography } from '../utils/theme';

export default function ProfileScreen() {
  const router = useRouter();
  const { user, logout, updateUser } = useAuthStore();
  const [name, setName] = useState(user?.name || '');
  const [email, setEmail] = useState(user?.email || '');
  const [upiId, setUpiId] = useState(user?.upi_id || '');

  const updateProfile = useMutation({
    mutationFn: () => usersAPI.updateMe({ name, email, upi_id: upiId }),
    onSuccess: ({ data }) => {
      updateUser(data);
      Alert.alert('Profile updated');
    },
    onError: (error: any) => {
      Alert.alert(error?.response?.data?.detail || 'Failed to update profile');
    },
  });

  return (
    <AppBackdrop>
      <TopBar title="PROFILE" subtitle="Identity and payout configuration" userName={user?.name || user?.phone} />
      <ScrollView contentContainerStyle={styles.scroll}>
        <Card style={styles.heroCard}>
          <Avatar name={user?.name || user?.phone} size={84} />
          <Text style={styles.name}>{user?.name || 'Anonymous Operator'}</Text>
          <Text style={styles.phone}>{user?.phone}</Text>
          <Badge
            label={user?.is_paid_tier ? 'Paid Tier' : 'Free Tier'}
            color={user?.is_paid_tier ? Colors.secondary : Colors.textSecondary}
            bgColor={user?.is_paid_tier ? 'rgba(29,251,165,0.1)' : 'rgba(255,255,255,0.05)'}
            style={{ marginTop: Spacing.base }}
          />
        </Card>

        <Card style={styles.formCard}>
          <Input label="Full Name" value={name} onChangeText={setName} placeholder="Enter display name" />
          <Input label="Email" value={email} onChangeText={setEmail} placeholder="operator@domain.com" />
          <Input label="UPI ID" value={upiId} onChangeText={setUpiId} placeholder="name@upi" autoCapitalize="none" />
          <Button title="Save Profile" onPress={() => updateProfile.mutate()} loading={updateProfile.isPending} />
        </Card>

        <Card style={styles.planCard}>
          <Text style={styles.planOverline}>SOVEREIGN ACCESS</Text>
          <Text style={styles.planTitle}>Generate signed reports and premium proof exports.</Text>
          <Text style={styles.planCopy}>Your current tier is {user?.is_paid_tier ? 'paid' : 'free'}.</Text>
        </Card>

        <Button
          title="Log Out"
          variant="danger"
          onPress={async () => {
            await logout();
            router.replace('/login');
          }}
        />
      </ScrollView>
    </AppBackdrop>
  );
}

const styles = StyleSheet.create({
  scroll: {
    paddingHorizontal: Spacing.base,
    paddingTop: Spacing.base,
    paddingBottom: 140,
    gap: Spacing.md,
  },
  heroCard: {
    alignItems: 'center',
  },
  name: {
    color: Colors.textPrimary,
    fontSize: Typography.xl,
    fontWeight: '800',
    marginTop: Spacing.base,
  },
  phone: {
    color: Colors.textSecondary,
    marginTop: 4,
    fontSize: Typography.base,
  },
  formCard: {
    marginTop: Spacing.md,
  },
  planCard: {
    marginVertical: Spacing.md,
  },
  planOverline: {
    color: Colors.primary,
    fontSize: Typography.xs,
    fontWeight: '800',
    letterSpacing: 2,
    marginBottom: Spacing.sm,
  },
  planTitle: {
    color: Colors.textPrimary,
    fontSize: Typography.lg,
    fontWeight: '800',
    marginBottom: 8,
  },
  planCopy: {
    color: Colors.textSecondary,
    fontSize: Typography.base,
  },
});
