import React, { useState } from 'react';
import {
  Alert,
  ActivityIndicator,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AppBackdrop, TopBar } from '../components/chrome';
import { Button, Card, Input } from '../components/ui';
import { groupsAPI } from '../services/api';
import { Group } from '../types';
import { Colors, Radius, Spacing, Typography } from '../utils/theme';
import { useAuthStore } from '../store/authStore';

export default function GroupsScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [nameError, setNameError] = useState('');
  const [showJoin, setShowJoin] = useState(false);
  const [inviteToken, setInviteToken] = useState('');
  const [inviteError, setInviteError] = useState('');

  const groupsQuery = useQuery({
    queryKey: ['groups'],
    queryFn: async () => {
      const { data } = await groupsAPI.list();
      return data as Group[];
    },
  });

  const createGroup = useMutation({
    mutationFn: () => groupsAPI.create({ name: name.trim(), description: description.trim() || undefined }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['groups'] });
      setShowCreate(false);
      setName('');
      setDescription('');
      setNameError('');
    },
    onError: (error: any) => {
      setNameError(error?.response?.data?.detail || 'Failed to create group');
    },
  });

  const joinGroup = useMutation({
    mutationFn: () => groupsAPI.joinViaInvite(inviteToken.trim()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['groups'] });
      setShowJoin(false);
      setInviteToken('');
      setInviteError('');
      Alert.alert('Joined group successfully');
    },
    onError: (error: any) => {
      setInviteError(error?.response?.data?.detail || 'Failed to join group');
    },
  });

  return (
    <AppBackdrop>
      <TopBar
        title="ACTIVE GROUPS"
        subtitle="Operational shared ledgers"
        userName={user?.name || user?.phone}
        rightIcon="add"
        onRightPress={() => setShowCreate(true)}
      />

      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={groupsQuery.isLoading} onRefresh={groupsQuery.refetch} tintColor={Colors.primary} />}
      >
        <Text style={styles.overline}>NETWORKED POOLS</Text>
        <Text style={styles.title}>Precision group ledgers for every shared mission.</Text>

        {groupsQuery.isLoading ? (
          <ActivityIndicator color={Colors.primary} style={{ marginTop: 40 }} />
        ) : (
          groupsQuery.data?.map((group, index) => (
            <Pressable key={group.id} onPress={() => router.push(`/group/${group.id}`)} style={({ pressed }) => [pressed && { opacity: 0.9 }]}>
              <Card style={styles.groupCard}>
                <View style={styles.groupTop}>
                  <View style={styles.logoDisc}>
                    <Text style={styles.logoText}>{['🏖', '🏠', '🍱', '🚀'][index % 4]}</Text>
                  </View>
                  <View style={styles.memberCount}>
                    <Text style={styles.memberCountText}>{group.members.length} MEMBERS</Text>
                  </View>
                </View>
                <Text style={styles.groupName}>{group.name}</Text>
                {group.description ? <Text style={styles.groupDescription}>{group.description}</Text> : null}
                <View style={styles.memberRow}>
                  {group.members.slice(0, 5).map((member, memberIndex) => (
                    <View key={member.id} style={[styles.memberBadge, { marginLeft: memberIndex === 0 ? 0 : -10 }]}>
                      <Text style={styles.memberBadgeText}>
                        {(member.user.name || member.user.phone).slice(0, 1).toUpperCase()}
                      </Text>
                    </View>
                  ))}
                  <Text style={styles.tapHint}>Open ledger</Text>
                </View>
              </Card>
            </Pressable>
          ))
        )}
      </ScrollView>

      <Modal animationType="slide" transparent visible={showCreate}>
        <View style={styles.modalOverlay}>
          <Card style={styles.modalCard}>
            <Text style={styles.modalTitle}>Create New Group</Text>
            <Text style={styles.modalSub}>Only the fields shown in the live interface are included.</Text>
            <Input
              label="Group Name"
              value={name}
              onChangeText={(value) => {
                setName(value);
                setNameError('');
              }}
              error={nameError}
              placeholder="Goa Trip 2025"
            />
            <Input
              label="Description"
              value={description}
              onChangeText={setDescription}
              placeholder="Optional context"
            />
            <View style={styles.modalActions}>
              <Button title="Join via Invite" onPress={() => setShowJoin(true)} style={{ flex: 1.2 }} variant="secondary" />
              <Button title="Cancel" onPress={() => setShowCreate(false)} style={{ flex: 1 }} variant="ghost" />
              <Button title="Create Group" onPress={() => createGroup.mutate()} style={{ flex: 1.4 }} loading={createGroup.isPending} />
            </View>
          </Card>
        </View>
      </Modal>

      <Modal animationType="slide" transparent visible={showJoin}>
        <View style={styles.modalOverlay}>
          <Card style={styles.modalCard}>
            <Text style={styles.modalTitle}>Join Group</Text>
            <Text style={styles.modalSub}>Paste the invite token shared by your group admin.</Text>
            <Input
              label="Invite Token"
              value={inviteToken}
              onChangeText={(value) => {
                setInviteToken(value);
                setInviteError('');
              }}
              error={inviteError}
              placeholder="Paste invite token"
              autoCapitalize="none"
              autoCorrect={false}
            />
            <View style={styles.modalActions}>
              <Button title="Back" onPress={() => setShowJoin(false)} style={{ flex: 1 }} variant="ghost" />
              <Button title="Join Group" onPress={() => joinGroup.mutate()} style={{ flex: 1.4 }} loading={joinGroup.isPending} />
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
    paddingBottom: 140,
  },
  overline: {
    color: Colors.textSecondary,
    fontSize: Typography.xs,
    fontWeight: '800',
    letterSpacing: 3,
    marginBottom: Spacing.sm,
  },
  title: {
    color: Colors.textPrimary,
    fontSize: 32,
    lineHeight: 38,
    fontWeight: '800',
    marginBottom: Spacing.xl,
  },
  groupCard: {
    marginBottom: Spacing.md,
  },
  groupTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.base,
  },
  logoDisc: {
    width: 56,
    height: 56,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  logoText: {
    fontSize: 26,
  },
  memberCount: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.ghostBorder,
    backgroundColor: Colors.chip,
  },
  memberCountText: {
    color: Colors.textSecondary,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.3,
  },
  groupName: {
    color: Colors.textPrimary,
    fontSize: Typography.xl,
    fontWeight: '800',
    marginBottom: 6,
  },
  groupDescription: {
    color: Colors.textSecondary,
    fontSize: Typography.base,
    lineHeight: 20,
    marginBottom: Spacing.lg,
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  memberBadge: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: Colors.surfaceHighest,
    borderWidth: 2,
    borderColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  memberBadgeText: {
    color: Colors.textSecondary,
    fontSize: 11,
    fontWeight: '800',
  },
  tapHint: {
    marginLeft: 'auto',
    color: Colors.textMuted,
    fontSize: Typography.sm,
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
