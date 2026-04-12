import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Avatar } from './ui';
import { Colors, Radius, Shadow, Spacing, Typography } from '../utils/theme';

export function AppBackdrop({ children }: { children: React.ReactNode }) {
  return (
    <View style={styles.backdrop}>
      <LinearGradient
        colors={['#080B14', Colors.background, '#0F1320']}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.orbPrimary} />
      <View style={styles.orbSecondary} />
      {children}
    </View>
  );
}

export function BrandWordmark({ compact = false }: { compact?: boolean }) {
  return (
    <View style={compact ? undefined : styles.wordmarkWrap}>
      <Text style={[styles.wordmark, compact && styles.wordmarkCompact]}>SPLITSURE</Text>
    </View>
  );
}

export function TopBar({
  leftIcon,
  onLeftPress,
  title,
  subtitle,
  userName,
  rightIcon = 'settings',
  onRightPress,
}: {
  leftIcon?: keyof typeof MaterialIcons.glyphMap;
  onLeftPress?: () => void;
  title?: React.ReactNode;
  subtitle?: string;
  userName?: string | null;
  rightIcon?: keyof typeof MaterialIcons.glyphMap;
  onRightPress?: () => void;
}) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
      <View style={styles.topSide}>
        {leftIcon ? (
          <Pressable onPress={onLeftPress} style={styles.iconButton}>
            <MaterialIcons color={Colors.primary} name={leftIcon} size={22} />
          </Pressable>
        ) : null}
        <View>
          {typeof title === 'string' ? <Text style={styles.barTitle}>{title}</Text> : title}
          {subtitle ? <Text style={styles.barSubtitle}>{subtitle}</Text> : null}
        </View>
      </View>

      <View style={styles.topRight}>
        <Pressable onPress={onRightPress} style={styles.iconButton}>
          <MaterialIcons color={Colors.textSecondary} name={rightIcon} size={20} />
        </Pressable>
        <Avatar name={userName || 'User'} size={40} />
      </View>
    </View>
  );
}

const dockItems = [
  { key: 'home', label: 'Home', icon: 'home', route: '/(tabs)' },
  { key: 'groups', label: 'Groups', icon: 'group', route: '/(tabs)/groups' },
  { key: 'activity', label: 'Activity', icon: 'analytics', route: '/(tabs)/activity' },
  { key: 'profile', label: 'Profile', icon: 'person', route: '/(tabs)/profile' },
] as const;

export function FloatingDock({ current }: { current: (typeof dockItems)[number]['key'] }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <View pointerEvents="box-none" style={[styles.dockWrap, { bottom: Math.max(insets.bottom + 8, 24) }]}>
      <BlurView intensity={36} tint="dark" style={styles.dock}>
        {dockItems.map((item) => {
          const active = item.key === current;
          return (
            <Pressable
              key={item.key}
              onPress={() => router.push(item.route)}
              style={({ pressed }) => [styles.dockItem, pressed && { opacity: 0.8 }]}
            >
              <MaterialIcons
                color={active ? Colors.secondary : 'rgba(233,234,248,0.4)'}
                name={item.icon}
                size={22}
              />
              <Text style={[styles.dockLabel, active && styles.dockLabelActive]}>{item.label}</Text>
            </Pressable>
          );
        })}
      </BlurView>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  orbPrimary: {
    position: 'absolute',
    top: -80,
    left: -60,
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: 'rgba(96,99,238,0.16)',
    opacity: 0.9,
  },
  orbSecondary: {
    position: 'absolute',
    right: -90,
    top: 120,
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: 'rgba(29,251,165,0.08)',
  },
  wordmarkWrap: {
    alignSelf: 'flex-start',
  },
  wordmark: {
    color: Colors.primary,
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.8,
  },
  wordmarkCompact: {
    fontSize: 24,
  },
  topBar: {
    paddingHorizontal: Spacing.base,
    paddingBottom: Spacing.base,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(11,14,23,0.82)',
  },
  topSide: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    flex: 1,
  },
  topRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1,
    borderColor: Colors.ghostBorder,
  },
  barTitle: {
    color: Colors.textPrimary,
    fontSize: Typography.xl,
    fontWeight: '800',
    letterSpacing: -0.7,
  },
  barSubtitle: {
    color: Colors.textSecondary,
    fontSize: Typography.sm,
    marginTop: 2,
  },
  dockWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  dock: {
    width: '90%',
    maxWidth: 420,
    borderRadius: Radius.xxl,
    borderWidth: 1,
    borderColor: Colors.ghostBorder,
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.sm,
    overflow: 'hidden',
    ...Shadow.glowSm,
  },
  dockItem: {
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 60,
    gap: 4,
  },
  dockLabel: {
    color: 'rgba(233,234,248,0.4)',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.1,
    textTransform: 'uppercase',
  },
  dockLabelActive: {
    color: Colors.secondary,
  },
});
