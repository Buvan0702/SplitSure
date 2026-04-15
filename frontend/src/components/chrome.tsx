import React, { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, interpolate } from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Avatar } from './ui';
import { Colors, Radius, Shadow, Spacing, Typography, useTheme } from '../utils/theme';
import { SPRING_CONFIG } from '../utils/animations';

export function AppBackdrop({ children }: { children: React.ReactNode }) {
  const { colors, isDark } = useTheme();
  
  // Gradient colors adapt to theme
  const gradientColors = isDark 
    ? ['#080B14', colors.background, '#0F1320']
    : ['#E8EAF5', colors.background, '#F0F2FA'];
  
  return (
    <View style={[styles.backdrop, { backgroundColor: colors.background }]}>
      <LinearGradient
        colors={gradientColors}
        style={StyleSheet.absoluteFill}
      />
      <View style={[
        styles.orbPrimary, 
        { 
          backgroundColor: isDark 
            ? 'rgba(96,99,238,0.16)' 
            : 'rgba(96,99,238,0.12)' 
        }
      ]} />
      <View style={[
        styles.orbSecondary,
        {
          backgroundColor: isDark
            ? 'rgba(29,251,165,0.08)'
            : 'rgba(14,204,132,0.06)'
        }
      ]} />
      {children}
    </View>
  );
}

export function BrandWordmark({ compact = false }: { compact?: boolean }) {
  const { colors } = useTheme();
  
  return (
    <View style={compact ? undefined : styles.wordmarkWrap}>
      <Text style={[styles.wordmark, { color: colors.primary }, compact && styles.wordmarkCompact]}>SPLITSURE</Text>
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
  hideRightIcon = false,
}: {
  leftIcon?: keyof typeof MaterialIcons.glyphMap;
  onLeftPress?: () => void;
  title?: React.ReactNode;
  subtitle?: string;
  userName?: string | null;
  rightIcon?: keyof typeof MaterialIcons.glyphMap;
  onRightPress?: () => void;
  hideRightIcon?: boolean;
}) {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View style={[
      styles.topBar,
      {
        paddingTop: insets.top + 8,
        backgroundColor: isDark
          ? 'rgba(11,14,23,0.82)'
          : 'rgba(245,246,250,0.88)',
      }
    ]}>
      <View style={styles.topSide}>
        {leftIcon ? (
          <Pressable onPress={onLeftPress} style={[styles.iconButton, { borderColor: colors.ghostBorder }]}>
            <MaterialIcons color={colors.primary} name={leftIcon} size={22} />
          </Pressable>
        ) : null}
        <View>
          {typeof title === 'string' ? <Text style={[styles.barTitle, { color: colors.textPrimary }]}>{title}</Text> : title}
          {subtitle ? <Text style={[styles.barSubtitle, { color: colors.textSecondary }]}>{subtitle}</Text> : null}
        </View>
      </View>

      <View style={styles.topRight}>
        {!hideRightIcon && (
          <Pressable onPress={onRightPress} style={[styles.iconButton, { borderColor: colors.ghostBorder }]}>
            <MaterialIcons color={colors.textSecondary} name={rightIcon} size={20} />
          </Pressable>
        )}
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

function DockItem({ item, active, onPress, isDark, colors }: {
  item: typeof dockItems[number];
  active: boolean;
  onPress: () => void;
  isDark: boolean;
  colors: typeof Colors;
}) {
  const scale = useSharedValue(1);
  const activeProgress = useSharedValue(active ? 1 : 0);

  useEffect(() => {
    activeProgress.value = withSpring(active ? 1 : 0, SPRING_CONFIG);
  }, [active]);

  const handlePressIn = () => {
    scale.value = withSpring(0.9, { damping: 20, stiffness: 300 });
  };

  const handlePressOut = () => {
    scale.value = withSpring(1, { damping: 20, stiffness: 300 });
  };

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const iconAnimatedStyle = useAnimatedStyle(() => ({
    color: active
      ? colors.secondary
      : (isDark ? 'rgba(233,234,248,0.4)' : 'rgba(26,29,46,0.4)'),
    transform: [
      {
        scale: interpolate(activeProgress.value, [0, 1], [1, 1.1]),
      },
    ],
  }));

  const labelAnimatedStyle = useAnimatedStyle(() => ({
    color: active
      ? colors.secondary
      : (isDark ? 'rgba(233,234,248,0.4)' : 'rgba(26,29,46,0.4)'),
    opacity: interpolate(activeProgress.value, [0, 1], [0.6, 1]),
  }));

  return (
    <Pressable
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={styles.dockItem}
    >
      <Animated.View style={animatedStyle}>
        <Animated.Text style={iconAnimatedStyle}>
          <MaterialIcons
            name={item.icon}
            size={22}
            color={active ? colors.secondary : (isDark ? 'rgba(233,234,248,0.4)' : 'rgba(26,29,46,0.4)')}
          />
        </Animated.Text>
        <Animated.Text style={[styles.dockLabel, labelAnimatedStyle]}>
          {item.label}
        </Animated.Text>
      </Animated.View>
    </Pressable>
  );
}

export function FloatingDock({ current }: { current: (typeof dockItems)[number]['key'] }) {
  const { colors, isDark } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <View pointerEvents="box-none" style={[styles.dockWrap, { bottom: Math.max(insets.bottom + 8, 24) }]}>
      <BlurView
        intensity={isDark ? 36 : 20}
        tint={isDark ? "dark" : "light"}
        style={[
          styles.dock,
          {
            borderColor: colors.ghostBorder,
            shadowColor: colors.primaryDim,
          }
        ]}
      >
        {dockItems.map((item) => (
          <DockItem
            key={item.key}
            item={item}
            active={item.key === current}
            onPress={() => router.push(item.route)}
            isDark={isDark}
            colors={colors}
          />
        ))}
      </BlurView>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
  },
  orbPrimary: {
    position: 'absolute',
    top: -80,
    left: -60,
    width: 260,
    height: 260,
    borderRadius: 130,
    opacity: 0.9,
  },
  orbSecondary: {
    position: 'absolute',
    right: -90,
    top: 120,
    width: 260,
    height: 260,
    borderRadius: 130,
  },
  wordmarkWrap: {
    alignSelf: 'flex-start',
  },
  wordmark: {
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
  },
  barTitle: {
    fontSize: Typography.xl,
    fontWeight: '800',
    letterSpacing: -0.7,
  },
  barSubtitle: {
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
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.1,
    textTransform: 'uppercase',
  },
});
