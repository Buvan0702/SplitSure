import React, { useEffect, useState, useCallback } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  TouchableOpacity,
  View,
  ViewStyle,
  Dimensions,
} from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming, interpolate } from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialIcons } from '@expo/vector-icons';
import { Colors, Radius, Shadow, Spacing, Typography, useTheme } from '../utils/theme';
import { useFadeInUp, useScaleIn, useShimmer, useGlassPulse, useSlideFromTop, getStaggerDelay, SPRING_CONFIG } from '../utils/animations';
import ReactNativeHapticFeedback from 'react-native-haptic-feedback';

interface ButtonProps {
  title: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  variant?: 'primary' | 'ghost' | 'danger' | 'secondary';
  size?: 'sm' | 'md' | 'lg';
}

export function Button({
  title,
  onPress,
  loading,
  disabled,
  style,
  variant = 'primary',
  size = 'md',
  accessibilityLabel,
}: ButtonProps & { accessibilityLabel?: string }) {
  const { colors, isDark } = useTheme();
  const minHeight = size === 'sm' ? 44 : size === 'lg' ? 60 : 56;
  const content = (
    <>
      {loading ? (
        <ActivityIndicator color={variant === 'primary' ? colors.textInverse : colors.textPrimary} />
      ) : (
        <Text style={[
          styles.buttonText, 
          { color: variant === 'primary' ? colors.textInverse : colors.textPrimary },
          size === 'sm' && { fontSize: Typography.sm }
        ]}>
          {title}
        </Text>
      )}
    </>
  );

  if (variant === 'primary') {
    return (
      <Pressable onPress={onPress} disabled={disabled || loading} style={({ pressed }) => [style, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel={accessibilityLabel || title}>
        <LinearGradient
          colors={[colors.primaryDim, colors.primary, colors.secondaryDim]}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={[styles.button, styles.primaryButton, { minHeight, shadowColor: colors.primaryDim }, disabled && styles.disabled]}
        >
          {content}
        </LinearGradient>
      </Pressable>
    );
  }

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel || title}
      style={[
        styles.button,
        { minHeight },
        {
          backgroundColor: colors.chip,
          borderWidth: 1,
          borderColor: colors.ghostBorder,
        },
        variant === 'danger' && {
          backgroundColor: colors.dangerLight,
          borderColor: colors.dangerLight,
        },
        style,
        disabled && styles.disabled,
      ]}
    >
      {content}
    </TouchableOpacity>
  );
}

interface CardProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
}

export function Card({ children, style, onPress }: CardProps) {
  const { colors, isDark } = useTheme();
  
  const body = (
    <BlurView 
      intensity={isDark ? 28 : 16} 
      tint={isDark ? "dark" : "light"} 
      style={[
        styles.card, 
        { 
          backgroundColor: colors.glass,
          borderColor: colors.ghostBorder 
        },
        style
      ]}
    >
      {children}
    </BlurView>
  );

  if (onPress) {
    return (
      <Pressable onPress={onPress} style={({ pressed }) => [pressed && styles.pressed]}>
        {body}
      </Pressable>
    );
  }

  return body;
}

interface InputProps extends TextInputProps {
  label?: string;
  error?: string;
  containerStyle?: StyleProp<ViewStyle>;
  leftAddon?: React.ReactNode;
  rightAddon?: React.ReactNode;
}

export function Input({
  label,
  error,
  containerStyle,
  leftAddon,
  rightAddon,
  style,
  ...props
}: InputProps) {
  const { colors, isDark } = useTheme();
  
  return (
    <View style={[styles.inputContainer, containerStyle]}>
      {label ? <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>{label}</Text> : null}
      <View style={[
        styles.inputShell, 
        { 
          backgroundColor: colors.surfaceLowest,
          borderColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.06)',
        },
        !!error && { borderColor: colors.danger }
      ]}>
        {leftAddon ? <View style={styles.inputAddon}>{leftAddon}</View> : null}
        <TextInput
          placeholderTextColor={colors.textMuted}
          style={[styles.input, { color: colors.textPrimary }, style]}
          {...props}
        />
        {rightAddon ? <View style={styles.inputAddon}>{rightAddon}</View> : null}
      </View>
      {error ? <Text style={[styles.inputError, { color: colors.danger }]}>{error}</Text> : null}
    </View>
  );
}

interface AvatarProps {
  name?: string | null;
  size?: number;
  imageUrl?: string | null;
}

export function Avatar({ name, size = 40, imageUrl }: AvatarProps) {
  const { colors, isDark } = useTheme();
  
  if (imageUrl) {
    return (
      <Image
        source={{ uri: imageUrl }}
        style={{ width: size, height: size, borderRadius: size / 2 }}
      />
    );
  }

  const initials = (name || '?')
    .split(' ')
    .map((part) => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <LinearGradient
      colors={[colors.primaryDim, colors.primary, colors.secondary]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[
        styles.avatar,
        { width: size, height: size, borderRadius: size / 2 },
      ]}
    >
      <View style={[styles.avatarInner, { borderRadius: size / 2 - 1, backgroundColor: colors.surfaceHigh }]}>
        <Text style={[styles.avatarText, { color: colors.textPrimary, fontSize: Math.max(10, size * 0.28) }]}>{initials}</Text>
      </View>
    </LinearGradient>
  );
}

export function Badge({
  label,
  color,
  bgColor,
  style,
}: {
  label: string;
  color?: string;
  bgColor?: string;
  style?: ViewStyle;
}) {
  const { colors, isDark } = useTheme();
  const resolvedColor = color ?? colors.secondary;
  const resolvedBgColor = bgColor ?? (isDark ? 'rgba(29,251,165,0.10)' : 'rgba(14,204,132,0.10)');
  
  return (
    <View style={[styles.badge, { backgroundColor: resolvedBgColor, borderColor: colors.ghostBorder }, style]}>
      <Text style={[styles.badgeText, { color: resolvedColor }]}>{label}</Text>
    </View>
  );
}

export function Divider({ style }: { style?: ViewStyle }) {
  const { isDark } = useTheme();
  return <View style={[styles.divider, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)' }, style]} />;
}

export function EmptyState({
  icon,
  title,
  subtitle,
}: {
  icon: string;
  title: string;
  subtitle?: string;
}) {
  const { colors } = useTheme();
  
  return (
    <View style={styles.empty}>
      <Text style={styles.emptyIcon}>{icon}</Text>
      <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>{title}</Text>
      {subtitle ? <Text style={[styles.emptySub, { color: colors.textSecondary }]}>{subtitle}</Text> : null}
    </View>
  );
}

// AnimatedCard — A Card with entrance animation
export function AnimatedCard({ children, index = 0, style, onPress, ...props }: CardProps & { index?: number }) {
  const { animatedStyle } = useFadeInUp(getStaggerDelay(index, 60));

  return (
    <Animated.View style={[animatedStyle, { width: '100%' }]}>
      <Card style={style} onPress={onPress} {...props}>
        {children}
      </Card>
    </Animated.View>
  );
}

// SkeletonLoader — Shimmer loading placeholder
export function SkeletonLoader({ width, height, borderRadius = Radius.md }: { width: number | string; height: number; borderRadius?: number }) {
  const { colors, isDark } = useTheme();
  const { animatedStyle, opacityStyle } = useShimmer();

  return (
    <View style={[{ width: width as number, height, borderRadius, overflow: 'hidden', backgroundColor: colors.glass }]}>
      <Animated.View style={[StyleSheet.absoluteFill, opacityStyle, { backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)' }]} />
      <Animated.View
        style={[
          animatedStyle,
          {
            width: '40%',
            height: '100%',
            backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)',
          },
        ]}
      />
    </View>
  );
}

// ThemeToggle — Animated sun/moon toggle
export function ThemeToggle() {
  const { colors, isDark, toggleTheme } = useTheme();
  const rotation = useSharedValue(isDark ? 0 : 1);

  useEffect(() => {
    rotation.value = withSpring(isDark ? 0 : 1, SPRING_CONFIG);
  }, [isDark]);

  const handleToggle = () => {
    ReactNativeHapticFeedback.trigger('impactLight', { enableVibrateFallback: true, ignoreAndroidSystemSettings: false });
    toggleTheme();
  };

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { rotate: `${interpolate(rotation.value, [0, 1], [0, 180])}deg` },
      { scale: interpolate(rotation.value, [0, 0.5, 1], [1, 0.8, 1]) },
    ],
  }));

  const sunOpacity = useAnimatedStyle(() => ({
    opacity: interpolate(rotation.value, [0, 1], [1, 0]),
  }));

  const moonOpacity = useAnimatedStyle(() => ({
    opacity: interpolate(rotation.value, [0, 1], [0, 1]),
  }));

  return (
    <TouchableOpacity onPress={handleToggle} style={[styles.themeToggle, { backgroundColor: colors.chip, borderColor: colors.ghostBorder }]} activeOpacity={0.8}>
      <View style={styles.themeToggleInner}>
        <Animated.View style={[StyleSheet.absoluteFill, sunOpacity, styles.themeIconContainer]}>
          <MaterialIcons name="wb-sunny" size={20} color={colors.warning} />
        </Animated.View>
        <Animated.View style={[StyleSheet.absoluteFill, moonOpacity, styles.themeIconContainer]}>
          <MaterialIcons name="nightlight-round" size={20} color={colors.primary} />
        </Animated.View>
      </View>
    </TouchableOpacity>
  );
}

// StatusBadge — Registration/status indicator
export function StatusBadge({ status, size = 'sm' }: { status: 'registered' | 'not_registered' | 'pending' | 'active'; size?: 'sm' | 'md' }) {
  const { colors, isDark } = useTheme();

  const config = {
    registered: { color: colors.success, bgColor: colors.successLight, icon: 'check-circle' as const, label: 'Registered' },
    active: { color: colors.success, bgColor: colors.successLight, icon: 'check-circle' as const, label: 'Active' },
    not_registered: { color: colors.danger, bgColor: colors.dangerLight, icon: 'error-outline' as const, label: 'Not Registered' },
    pending: { color: colors.warning, bgColor: colors.warningLight, icon: 'access-time' as const, label: 'Pending' },
  };

  const { color, bgColor, icon, label } = config[status];
  const paddingHorizontal = size === 'md' ? 12 : 10;
  const paddingVertical = size === 'md' ? 8 : 6;
  const fontSize = size === 'md' ? 12 : 10;
  const iconSize = size === 'md' ? 16 : 14;

  return (
    <BlurView intensity={isDark ? 20 : 10} tint={isDark ? 'dark' : 'light'} style={[styles.statusBadge, { backgroundColor: bgColor, borderColor: colors.ghostBorder, paddingHorizontal, paddingVertical }]}>
      <MaterialIcons name={icon} size={iconSize} color={color} style={{ marginRight: 4 }} />
      <Text style={[styles.statusBadgeText, { color, fontSize }]}>{label}</Text>
    </BlurView>
  );
}

// NotificationToast — In-app notification banner
export function NotificationToast({ visible, title, message, type = 'info', onDismiss }: {
  visible: boolean;
  title: string;
  message: string;
  type?: 'success' | 'info' | 'warning' | 'error';
  onDismiss: () => void;
}) {
  const { colors, isDark } = useTheme();
  const { animatedStyle, show, hide } = useSlideFromTop();

  useEffect(() => {
    if (visible) {
      show();
      const timer = setTimeout(() => {
        hide();
        setTimeout(onDismiss, 300);
      }, 3000);
      return () => clearTimeout(timer);
    } else {
      hide();
    }
  }, [visible]);

  const typeConfig = {
    success: { icon: 'check-circle' as const, color: colors.success },
    info: { icon: 'info' as const, color: colors.primary },
    warning: { icon: 'warning' as const, color: colors.warning },
    error: { icon: 'error' as const, color: colors.danger },
  };

  const { icon, color } = typeConfig[type];

  if (!visible) return null;

  return (
    <Animated.View style={[styles.toastContainer, animatedStyle]}>
      <BlurView intensity={isDark ? 40 : 30} tint={isDark ? 'dark' : 'light'} style={[styles.toast, { backgroundColor: colors.glass, borderColor: colors.ghostBorder }]}>
        <MaterialIcons name={icon} size={24} color={color} style={styles.toastIcon} />
        <View style={styles.toastContent}>
          <Text style={[styles.toastTitle, { color: colors.textPrimary }]}>{title}</Text>
          <Text style={[styles.toastMessage, { color: colors.textSecondary }]}>{message}</Text>
        </View>
        <TouchableOpacity onPress={() => { hide(); setTimeout(onDismiss, 300); }} style={styles.toastClose}>
          <MaterialIcons name="close" size={20} color={colors.textMuted} />
        </TouchableOpacity>
      </BlurView>
    </Animated.View>
  );
}

// GlassModal — Enhanced modal with blur backdrop
export function GlassModal({ visible, onClose, title, children }: {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
}) {
  const { colors, isDark } = useTheme();
  const { animatedStyle: backdropStyle, progress: backdropProgress } = useFadeInUp(0);
  const { animatedStyle: contentStyle, progress: contentProgress } = useScaleIn(50);

  useEffect(() => {
    if (visible) {
      backdropProgress.value = withTiming(1, { duration: 200 });
      contentProgress.value = withSpring(1, SPRING_CONFIG);
    } else {
      backdropProgress.value = withTiming(0, { duration: 200 });
      contentProgress.value = withTiming(0, { duration: 200 });
    }
  }, [visible]);

  const backdropAnimatedStyle = useAnimatedStyle(() => ({
    opacity: interpolate(backdropProgress.value, [0, 1], [0, 1]),
  }));

  if (!visible) return null;

  return (
    <Modal transparent visible={visible} animationType="none" onRequestClose={onClose}>
      <Animated.View style={[styles.modalBackdrop, backdropAnimatedStyle]}>
        <BlurView intensity={isDark ? 50 : 40} tint={isDark ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      </Animated.View>
      <View style={styles.modalContainer}>
        <Animated.View style={[styles.modalContent, contentStyle, { backgroundColor: colors.glass, borderColor: colors.ghostBorder }]}>
          {title && (
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>{title}</Text>
              <TouchableOpacity onPress={onClose} style={[styles.modalCloseButton, { backgroundColor: colors.chip, borderColor: colors.ghostBorder }]}>
                <MaterialIcons name="close" size={20} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
          )}
          <View style={styles.modalBody}>
            {children}
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 56,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.lg,
  },
  primaryButton: {
    ...Shadow.glowMd,
  },
  buttonText: {
    fontSize: Typography.base,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  disabled: {
    opacity: 0.5,
  },
  pressed: {
    transform: [{ scale: 0.985 }],
  },
  card: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    overflow: 'hidden',
    padding: Spacing.lg,
  },
  inputContainer: {
    marginBottom: Spacing.md,
  },
  inputLabel: {
    fontSize: Typography.xs,
    fontWeight: '700',
    letterSpacing: 2,
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  inputShell: {
    minHeight: 56,
    borderRadius: Radius.md,
    borderWidth: 1,
    paddingHorizontal: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
  },
  input: {
    flex: 1,
    fontSize: Typography.md,
    minHeight: 54,
  },
  inputAddon: {
    marginHorizontal: 4,
  },
  inputError: {
    marginTop: 6,
    fontSize: Typography.sm,
  },
  avatar: {
    padding: 1,
  },
  avatarInner: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontWeight: '800',
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: Radius.full,
    borderWidth: 1,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.3,
    textTransform: 'uppercase',
  },
  divider: {
    height: 1,
  },
  empty: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.xxxl,
    paddingHorizontal: Spacing.lg,
  },
  emptyIcon: {
    fontSize: 36,
    marginBottom: Spacing.md,
  },
  emptyTitle: {
    fontSize: Typography.lg,
    fontWeight: '800',
  },
  emptySub: {
    marginTop: 8,
    fontSize: Typography.base,
    textAlign: 'center',
  },
  // New component styles
  themeToggle: {
    width: 44,
    height: 44,
    borderRadius: Radius.full,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  themeToggleInner: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  themeIconContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: Radius.full,
    borderWidth: 1,
    overflow: 'hidden',
  },
  statusBadgeText: {
    fontWeight: '800',
    letterSpacing: 1.1,
    textTransform: 'uppercase',
  },
  toastContainer: {
    position: 'absolute',
    top: 60,
    left: Spacing.base,
    right: Spacing.base,
    zIndex: 1000,
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: Radius.lg,
    borderWidth: 1,
    padding: Spacing.md,
    ...Shadow.md,
  },
  toastIcon: {
    marginRight: Spacing.md,
  },
  toastContent: {
    flex: 1,
  },
  toastTitle: {
    fontSize: Typography.base,
    fontWeight: '800',
    marginBottom: 2,
  },
  toastMessage: {
    fontSize: Typography.sm,
  },
  toastClose: {
    padding: 4,
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  modalContainer: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.lg,
  },
  modalContent: {
    width: '100%',
    maxWidth: 400,
    borderRadius: Radius.xl,
    borderWidth: 1,
    overflow: 'hidden',
    ...Shadow.lg,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(128,128,128,0.1)',
  },
  modalTitle: {
    fontSize: Typography.lg,
    fontWeight: '800',
  },
  modalCloseButton: {
    width: 36,
    height: 36,
    borderRadius: Radius.full,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalBody: {
    padding: Spacing.lg,
  },
});
