import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, RefreshControl,
  TouchableOpacity, Modal, KeyboardAvoidingView, Platform,
  ScrollView, Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { groupsAPI } from '../services/api';
import { Group } from '../types';
import { Colors, Typography, Spacing, Radius, Shadow } from '../utils/theme';
import { Button, Card, Input, Avatar, Badge, EmptyState } from '../components/ui';
import { useAuthStore } from '../store/authStore';
import { format } from 'date-fns';

function GroupCard({ group, userId }: { group: Group; userId: number }) {
  const router = useRouter();
  const memberCount = group.members.length;
  const isAdmin = group.members.find(m => m.user.id === userId)?.role === 'admin';

  return (
    <Card onPress={() => router.push(`/group/${group.id}`)} style={styles.groupCard}>
      <View style={styles.groupCardHeader}>
        <View style={styles.groupIconWrap}>
          <Text style={styles.groupIcon}>
            {group.name.charAt(0).toUpperCase()}
          </Text>
        </View>
        <View style={styles.groupInfo}>
          <Text style={styles.groupName} numberOfLines={1}>{group.name}</Text>
          {group.description && (
            <Text style={styles.groupDesc} numberOfLines={1}>{group.description}</Text>
          )}
          <Text style={styles.groupMeta}>
            {memberCount} member{memberCount !== 1 ? 's' : ''} · {format(new Date(group.created_at), 'MMM d, yyyy')}
          </Text>
        </View>
        {isAdmin && (
          <Badge label="Admin" color={Colors.primary} bgColor={Colors.primaryLight} />
        )}
      </View>

      {/* Member avatars */}
      <View style={styles.memberAvatars}>
        {group.members.slice(0, 5).map((m, i) => (
          <View key={m.id} style={[styles.avatarBorder, { marginLeft: i > 0 ? -10 : 0, zIndex: 5 - i }]}>
            <Avatar name={m.user.name || m.user.phone} size={32} />
          </View>
        ))}
        {memberCount > 5 && (
          <View style={[styles.avatarBorder, styles.moreAvatar, { marginLeft: -10 }]}>
            <Text style={styles.moreAvatarText}>+{memberCount - 5}</Text>
          </View>
        )}
        <Text style={styles.tapHint}>Tap to open →</Text>
      </View>
    </Card>
  );
}

export default function GroupsScreen() {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [nameError, setNameError] = useState('');

  const { data: groups, isLoading, refetch } = useQuery({
    queryKey: ['groups'],
    queryFn: async () => {
      const { data } = await groupsAPI.list();
      return data as Group[];
    },
  });

  const createMutation = useMutation({
    mutationFn: () => groupsAPI.create({ name: name.trim(), description: desc.trim() || undefined }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['groups'] });
      setShowCreate(false);
      setName('');
      setDesc('');
    },
    onError: (e: any) => {
      setNameError(e?.response?.data?.detail || 'Failed to create group');
    },
  });

  const handleCreate = () => {
    setNameError('');
    if (name.trim().length < 2) {
      setNameError('Group name must be at least 2 characters');
      return;
    }
    createMutation.mutate();
  };

  return (
    <View style={styles.container}>
      {/* Top bar */}
      <View style={styles.topBar}>
        <View>
          <Text style={styles.greeting}>Hello, {user?.name?.split(' ')[0] || 'there'} 👋</Text>
          <Text style={styles.subtitle}>Your expense groups</Text>
        </View>
        <Button
          title="+ New Group"
          onPress={() => setShowCreate(true)}
          size="sm"
        />
      </View>

      <FlatList
        data={groups}
        keyExtractor={g => String(g.id)}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <GroupCard group={item} userId={user?.id ?? 0} />
        )}
        ListEmptyComponent={
          isLoading ? null : (
            <EmptyState
              icon="👥"
              title="No groups yet"
              subtitle="Create a group to start splitting expenses with friends"
            />
          )
        }
        refreshControl={
          <RefreshControl refreshing={isLoading} onRefresh={refetch} tintColor={Colors.primary} />
        }
      />

      {/* Create Group Modal */}
      <Modal visible={showCreate} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View style={[styles.modalCard, Shadow.lg]}>
              <Text style={styles.modalTitle}>Create New Group</Text>
              <Text style={styles.modalSub}>Groups help you organize expenses by context</Text>

              <Input
                label="Group Name *"
                value={name}
                onChangeText={val => { setName(val); setNameError(''); }}
                placeholder="e.g., Goa Trip 2025, Flatmates"
                maxLength={50}
                error={nameError}
                autoFocus
              />

              <Input
                label="Description (optional)"
                value={desc}
                onChangeText={setDesc}
                placeholder="What's this group for?"
                maxLength={200}
                multiline
                numberOfLines={2}
                style={{ height: 70, textAlignVertical: 'top', paddingTop: Spacing.sm }}
              />

              <View style={styles.modalActions}>
                <Button
                  title="Cancel"
                  onPress={() => { setShowCreate(false); setName(''); setDesc(''); setNameError(''); }}
                  variant="ghost"
                  style={{ flex: 1, marginRight: Spacing.sm }}
                />
                <Button
                  title="Create Group"
                  onPress={handleCreate}
                  loading={createMutation.isPending}
                  style={{ flex: 1.5 }}
                />
              </View>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.base, paddingTop: 16, paddingBottom: Spacing.md,
    backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  greeting: { fontSize: Typography.lg, fontWeight: '800', color: Colors.textPrimary },
  subtitle: { fontSize: Typography.sm, color: Colors.textSecondary, marginTop: 2 },
  list: { padding: Spacing.base, paddingBottom: 80 },

  groupCard: { marginBottom: Spacing.md },
  groupCardHeader: { flexDirection: 'row', alignItems: 'center' },
  groupIconWrap: {
    width: 50, height: 50, borderRadius: Radius.md,
    backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center',
    marginRight: Spacing.md,
  },
  groupIcon: { fontSize: 22, color: Colors.textInverse, fontWeight: '700' },
  groupInfo: { flex: 1, marginRight: Spacing.sm },
  groupName: { fontSize: Typography.md, fontWeight: '700', color: Colors.textPrimary },
  groupDesc: { fontSize: Typography.sm, color: Colors.textSecondary, marginTop: 2 },
  groupMeta: { fontSize: Typography.xs, color: Colors.textTertiary, marginTop: 4 },

  memberAvatars: { flexDirection: 'row', alignItems: 'center', marginTop: Spacing.md },
  avatarBorder: {
    borderWidth: 2, borderColor: Colors.surface, borderRadius: 99,
  },
  moreAvatar: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: Colors.surfaceAlt, alignItems: 'center', justifyContent: 'center',
  },
  moreAvatarText: { fontSize: Typography.xs, fontWeight: '700', color: Colors.textSecondary },
  tapHint: { marginLeft: 'auto', fontSize: Typography.xs, color: Colors.textTertiary, fontStyle: 'italic' },

  modalOverlay: { flex: 1, backgroundColor: Colors.overlay, justifyContent: 'flex-end' },
  modalCard: {
    backgroundColor: Colors.surface, borderTopLeftRadius: Radius.xl, borderTopRightRadius: Radius.xl,
    padding: Spacing.xl, paddingBottom: Spacing.xxxl,
  },
  modalTitle: { fontSize: Typography.xl, fontWeight: '800', color: Colors.textPrimary, marginBottom: 4 },
  modalSub: { fontSize: Typography.sm, color: Colors.textSecondary, marginBottom: Spacing.lg },
  modalActions: { flexDirection: 'row', marginTop: Spacing.sm },
});
