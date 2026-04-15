import React, { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useMutation } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import { AppBackdrop, TopBar } from '../components/chrome';
import { Avatar, Badge, Button, Card, Input } from '../components/ui';
import { usersAPI } from '../services/api';
import { useAuthStore } from '../store/authStore';
import { Spacing, Typography, useTheme } from '../utils/theme';

export default function ProfileScreen() {
  const router = useRouter();
  const { user, logout, updateUser } = useAuthStore();
  const { colors, isDark, toggleTheme } = useTheme();
  const [name, setName] = useState(user?.name || '');
  const [email, setEmail] = useState(user?.email || '');
  const [upiId, setUpiId] = useState(user?.upi_id || '');
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

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

  const handleAvatarPick = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission Required', 'Please allow access to your photo library.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
      allowsEditing: true,
      aspect: [1, 1],
    });

    if (result.canceled || !result.assets[0]) return;

    const asset = result.assets[0];
    if ((asset.fileSize ?? 0) > 2 * 1024 * 1024) {
      Alert.alert('File Too Large', 'Please select an image under 2MB.');
      return;
    }

    setUploadingAvatar(true);
    try {
      const formData = new FormData();
      // React Native FormData accepts {uri, name, type} objects for file uploads
      // TypeScript's lib.dom FormData types don't include this, so we cast
      formData.append('file', {
        uri: asset.uri,
        name: asset.fileName || 'avatar.jpg',
        type: asset.mimeType || 'image/jpeg',
      } as any);

      const { data } = await usersAPI.uploadAvatar(formData);
      updateUser(data);
      Alert.alert('Avatar updated!');
    } catch (e: any) {
      Alert.alert('Upload Failed', e?.response?.data?.detail || 'Failed to upload avatar');
    } finally {
      setUploadingAvatar(false);
    }
  };

  return (
    <AppBackdrop>
      <TopBar
        title="PROFILE"
        subtitle="Identity and payout configuration"
        userName={user?.name || user?.phone}
      />
      <ScrollView contentContainerStyle={styles.scroll}>
        <Card style={styles.heroCard}>
          <Pressable onPress={handleAvatarPick} style={styles.avatarWrap}>
            <Avatar name={user?.name || user?.phone} size={84} imageUrl={user?.avatar_url} />
            <View style={[styles.avatarEditBadge, { backgroundColor: colors.primary, borderColor: colors.surface }]}>
              <Text style={styles.avatarEditIcon}>📷</Text>
            </View>
          </Pressable>
          {uploadingAvatar && <Text style={[styles.uploadingText, { color: colors.primary }]}>Uploading...</Text>}
          <Text style={[styles.name, { color: colors.textPrimary }]}>{user?.name || 'Anonymous Operator'}</Text>
          <Text style={[styles.phone, { color: colors.textSecondary }]}>{user?.phone}</Text>
          <Badge
            label={user?.is_paid_tier ? 'Paid Tier' : 'Free Tier'}
            color={user?.is_paid_tier ? colors.secondary : colors.textSecondary}
            bgColor={user?.is_paid_tier ? 'rgba(29,251,165,0.1)' : colors.chip}
            style={{ marginTop: Spacing.base }}
          />
        </Card>

        <Card style={styles.formCard}>
          <Input label="Full Name" value={name} onChangeText={setName} placeholder="Enter display name" />
          <Input label="Email" value={email} onChangeText={setEmail} placeholder="operator@domain.com" />
          <Input label="UPI ID" value={upiId} onChangeText={setUpiId} placeholder="name@upi" autoCapitalize="none" />
          <Button title="Save Profile" onPress={() => updateProfile.mutate()} loading={updateProfile.isPending} />
        </Card>

        <Card style={[styles.planCard, { backgroundColor: colors.surface }]}>
          <Text style={[styles.planOverline, { color: colors.primary }]}>SOVEREIGN ACCESS</Text>
          <Text style={[styles.planTitle, { color: colors.textPrimary }]}>Generate signed reports and premium proof exports.</Text>
          <Text style={[styles.planCopy, { color: colors.textSecondary }]}>Your current tier is {user?.is_paid_tier ? 'paid' : 'free'}.</Text>
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
  avatarWrap: {
    position: 'relative',
  },
  avatarEditBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
  },
  avatarEditIcon: {
    fontSize: 12,
  },
  uploadingText: {
    fontSize: Typography.xs,
    fontWeight: '700',
    marginTop: Spacing.sm,
  },
  name: {
    fontSize: Typography.xl,
    fontWeight: '800',
    marginTop: Spacing.base,
  },
  phone: {
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
    fontSize: Typography.xs,
    fontWeight: '800',
    letterSpacing: 2,
    marginBottom: Spacing.sm,
  },
  planTitle: {
    fontSize: Typography.lg,
    fontWeight: '800',
    marginBottom: 8,
  },
  planCopy: {
    fontSize: Typography.base,
  },
});
