import React from 'react';
import {
  View, Text, StyleSheet, FlatList, RefreshControl,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useInfiniteQuery } from '@tanstack/react-query';
import { auditAPI } from '../services/api';
import { AuditLog, AuditEventType } from '../types';
import { Typography, Spacing, Radius, useTheme } from '../utils/theme';
import { Avatar, EmptyState } from '../components/ui';
import { format, formatDistanceToNow } from 'date-fns';

const PAGE_SIZE = 20;

function AuditEntry({ log }: { log: AuditLog }) {
  const { colors } = useTheme();
  const EVENT_META: Record<AuditEventType, { icon: string; color: string; label: string }> = {
    expense_created:       { icon: '➕', color: colors.success,  label: 'added an expense' },
    expense_edited:        { icon: '✏️', color: colors.warning,  label: 'edited an expense' },
    expense_deleted:       { icon: '🗑️', color: colors.danger,   label: 'deleted an expense' },
    settlement_initiated:  { icon: '💸', color: colors.primary,  label: 'initiated a payment' },
    settlement_confirmed:  { icon: '✅', color: colors.success,  label: 'confirmed a payment' },
    settlement_disputed:   { icon: '⚠️', color: colors.danger,   label: 'disputed a transaction' },
    dispute_resolved:      { icon: '🤝', color: colors.success,  label: 'resolved a dispute' },
    member_added:          { icon: '👋', color: colors.primary,  label: 'added a member' },
    member_removed:        { icon: '👤', color: colors.danger,   label: 'removed a member' },
    group_created:         { icon: '🚀', color: colors.primary,  label: 'created the group' },
    group_updated:         { icon: '⚙️', color: colors.warning,  label: 'updated group settings' },
  };

  const meta = EVENT_META[log.event_type] ?? { icon: '📋', color: colors.textTertiary, label: log.event_type };
  const actorName = log.actor.name || log.actor.phone;
  const timeAgo = formatDistanceToNow(new Date(log.created_at), { addSuffix: true });
  const exactTime = format(new Date(log.created_at), 'dd MMM yyyy, HH:mm');

  // Build diff details for edits
  const hasDiff = log.before_json && log.after_json;

  return (
    <View style={styles.entry}>
      <View style={[styles.iconDot, { backgroundColor: meta.color + '20' }]}>
        <Text style={styles.icon}>{meta.icon}</Text>
      </View>
      <View style={[styles.line, { backgroundColor: colors.border }]} />
      <View style={styles.entryContent}>
        <View style={styles.entryHeader}>
          <Avatar name={actorName} size={28} />
          <View style={styles.entryText}>
            <Text style={[styles.entryMain, { color: colors.textPrimary }]}>
              <Text style={styles.actorName}>{actorName}</Text>
              {' '}<Text style={[styles.eventLabel, { color: colors.textSecondary }]}>{meta.label}</Text>
            </Text>
            <Text style={[styles.timeAgo, { color: colors.textTertiary }]}>{timeAgo} · {exactTime}</Text>
          </View>
        </View>

        {/* Show diff for edits */}
        {hasDiff && (
          <View style={[styles.diffBox, { backgroundColor: colors.surfaceAlt, borderLeftColor: colors.warning }]}>
            {Object.keys(log.after_json ?? {}).map(key => {
              const before = (log.before_json ?? {})[key];
              const after = (log.after_json ?? {})[key];
              if (JSON.stringify(before) === JSON.stringify(after)) return null;
              return (
                <View key={key} style={styles.diffRow}>
                  <Text style={[styles.diffKey, { color: colors.textSecondary }]}>{key}:</Text>
                  <Text style={[styles.diffBefore, { color: colors.danger }]}>{String(before)}</Text>
                  <Text style={[styles.diffArrow, { color: colors.textTertiary }]}>→</Text>
                  <Text style={[styles.diffAfter, { color: colors.success }]}>{String(after)}</Text>
                </View>
              );
            })}
          </View>
        )}

        {/* Show metadata */}
        {log.metadata_json && Object.keys(log.metadata_json).length > 0 && (
          <View style={[styles.metaBox, { backgroundColor: colors.primaryLight }]}>
            {Object.entries(log.metadata_json).map(([k, v]) => (
              <Text key={k} style={[styles.metaText, { color: colors.textSecondary }]}>
                <Text style={[styles.metaKey, { color: colors.primary }]}>{k}: </Text>
                {String(v)}
              </Text>
            ))}
          </View>
        )}
      </View>
    </View>
  );
}

export default function AuditScreen() {
  const { colors } = useTheme();
  const { groupId } = useLocalSearchParams<{ groupId: string }>();

  const {
    data,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    refetch,
  } = useInfiniteQuery({
    queryKey: ['audit', groupId],
    queryFn: async ({ pageParam = 0 }) => {
      const { data: logs } = await auditAPI.list(Number(groupId), {
        limit: PAGE_SIZE,
        offset: pageParam,
      });
      return logs as AuditLog[];
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      if (lastPage.length < PAGE_SIZE) return undefined;
      return allPages.flat().length;
    },
  });

  const logs = data?.pages.flat() ?? [];

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>🔒 Audit Trail</Text>
        <Text style={[styles.headerSub, { color: colors.textTertiary }]}>Immutable record of all group activity</Text>
      </View>

      <FlatList
        data={logs}
        keyExtractor={l => String(l.id)}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => <AuditEntry log={item} />}
        ListEmptyComponent={
          isLoading ? null : (
            <EmptyState icon="📋" title="No activity yet" subtitle="Actions taken in this group will appear here" />
          )
        }
        onEndReached={() => {
          if (hasNextPage && !isFetchingNextPage) {
            fetchNextPage();
          }
        }}
        onEndReachedThreshold={0.5}
        ListFooterComponent={
          isFetchingNextPage ? (
            <Text style={[styles.loadingMore, { color: colors.textSecondary }]}>Loading more...</Text>
          ) : null
        }
        refreshControl={
          <RefreshControl refreshing={isLoading} onRefresh={refetch} tintColor={colors.primary} />
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { padding: Spacing.base, borderBottomWidth: 1 },
  headerTitle: { fontSize: Typography.lg, fontWeight: '800' },
  headerSub: { fontSize: Typography.sm, marginTop: 2 },
  list: { padding: Spacing.base, paddingBottom: 40 },

  entry: { flexDirection: 'row', marginBottom: Spacing.lg },
  iconDot: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', zIndex: 1 },
  icon: { fontSize: 16 },
  line: {
    position: 'absolute', left: 17, top: 36,
    width: 2, height: '100%',
  },
  entryContent: { flex: 1, marginLeft: Spacing.md, paddingBottom: Spacing.sm },
  entryHeader: { flexDirection: 'row', alignItems: 'flex-start' },
  entryText: { flex: 1, marginLeft: Spacing.sm },
  entryMain: { fontSize: Typography.sm, lineHeight: 18 },
  actorName: { fontWeight: '700' },
  eventLabel: {},
  timeAgo: { fontSize: Typography.xs, marginTop: 2 },

  diffBox: {
    borderRadius: Radius.sm,
    padding: Spacing.sm, marginTop: Spacing.sm, borderLeftWidth: 3,
  },
  diffRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', marginBottom: 2 },
  diffKey: { fontSize: Typography.xs, fontWeight: '700', marginRight: 4 },
  diffBefore: { fontSize: Typography.xs, textDecorationLine: 'line-through', marginRight: 4 },
  diffArrow: { fontSize: Typography.xs, marginRight: 4 },
  diffAfter: { fontSize: Typography.xs, fontWeight: '600' },

  metaBox: {
    borderRadius: Radius.sm,
    padding: Spacing.sm, marginTop: Spacing.sm,
  },
  metaText: { fontSize: Typography.xs, marginBottom: 2 },
  metaKey: { fontWeight: '700' },

  loadingMore: {
    textAlign: 'center',
    fontSize: Typography.sm,
    paddingVertical: Spacing.base,
  },
});
