import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  TouchableOpacity,
  View,
  ViewStyle,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, Radius, Shadow, Spacing, Typography } from '../utils/theme';

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
}: ButtonProps) {
  const minHeight = size === 'sm' ? 44 : size === 'lg' ? 60 : 56;
  const content = (
    <>
      {loading ? (
        <ActivityIndicator color={variant === 'primary' ? Colors.textInverse : Colors.textPrimary} />
      ) : (
        <Text style={[styles.buttonText, variant !== 'primary' && styles.buttonTextMuted, size === 'sm' && { fontSize: Typography.sm }]}>
          {title}
        </Text>
      )}
    </>
  );

  if (variant === 'primary') {
    return (
      <Pressable onPress={onPress} disabled={disabled || loading} style={({ pressed }) => [style, pressed && styles.pressed]}>
        <LinearGradient
          colors={[Colors.primaryDim, Colors.primary, Colors.secondaryDim]}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={[styles.button, styles.primaryButton, { minHeight }, disabled && styles.disabled]}
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
      style={[
        styles.button,
        { minHeight },
        styles.secondaryButton,
        variant === 'danger' && styles.dangerButton,
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
  const body = (
    <BlurView intensity={28} tint="dark" style={[styles.card, style]}>
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
  return (
    <View style={[styles.inputContainer, containerStyle]}>
      {label ? <Text style={styles.inputLabel}>{label}</Text> : null}
      <View style={[styles.inputShell, !!error && styles.inputShellError]}>
        {leftAddon ? <View style={styles.inputAddon}>{leftAddon}</View> : null}
        <TextInput
          placeholderTextColor={Colors.textMuted}
          style={[styles.input, style]}
          {...props}
        />
        {rightAddon ? <View style={styles.inputAddon}>{rightAddon}</View> : null}
      </View>
      {error ? <Text style={styles.inputError}>{error}</Text> : null}
    </View>
  );
}

interface AvatarProps {
  name?: string | null;
  size?: number;
}

export function Avatar({ name, size = 40 }: AvatarProps) {
  const initials = (name || '?')
    .split(' ')
    .map((part) => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <LinearGradient
      colors={[Colors.primaryDim, Colors.primary, Colors.secondary]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[
        styles.avatar,
        { width: size, height: size, borderRadius: size / 2 },
      ]}
    >
      <View style={[styles.avatarInner, { borderRadius: size / 2 - 1 }]}>
        <Text style={[styles.avatarText, { fontSize: Math.max(10, size * 0.28) }]}>{initials}</Text>
      </View>
    </LinearGradient>
  );
}

export function Badge({
  label,
  color = Colors.secondary,
  bgColor = 'rgba(29,251,165,0.1)',
  style,
}: {
  label: string;
  color?: string;
  bgColor?: string;
  style?: ViewStyle;
}) {
  return (
    <View style={[styles.badge, { backgroundColor: bgColor }, style]}>
      <Text style={[styles.badgeText, { color }]}>{label}</Text>
    </View>
  );
}

export function Divider({ style }: { style?: ViewStyle }) {
  return <View style={[styles.divider, style]} />;
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
  return (
    <View style={styles.empty}>
      <Text style={styles.emptyIcon}>{icon}</Text>
      <Text style={styles.emptyTitle}>{title}</Text>
      {subtitle ? <Text style={styles.emptySub}>{subtitle}</Text> : null}
    </View>
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
  secondaryButton: {
    backgroundColor: Colors.chip,
    borderWidth: 1,
    borderColor: Colors.ghostBorder,
  },
  dangerButton: {
    backgroundColor: 'rgba(255,110,132,0.12)',
    borderColor: 'rgba(255,110,132,0.24)',
  },
  buttonText: {
    color: Colors.textInverse,
    fontSize: Typography.base,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  buttonTextMuted: {
    color: Colors.textPrimary,
  },
  disabled: {
    opacity: 0.5,
  },
  pressed: {
    transform: [{ scale: 0.985 }],
  },
  card: {
    backgroundColor: Colors.glass,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.ghostBorder,
    overflow: 'hidden',
    padding: Spacing.lg,
  },
  inputContainer: {
    marginBottom: Spacing.md,
  },
  inputLabel: {
    color: Colors.textSecondary,
    fontSize: Typography.xs,
    fontWeight: '700',
    letterSpacing: 2,
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  inputShell: {
    minHeight: 56,
    borderRadius: Radius.md,
    backgroundColor: Colors.surfaceLowest,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    paddingHorizontal: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
  },
  inputShellError: {
    borderColor: Colors.danger,
  },
  input: {
    flex: 1,
    color: Colors.textPrimary,
    fontSize: Typography.md,
    minHeight: 54,
  },
  inputAddon: {
    marginHorizontal: 4,
  },
  inputError: {
    color: Colors.danger,
    marginTop: 6,
    fontSize: Typography.sm,
  },
  avatar: {
    padding: 1,
  },
  avatarInner: {
    flex: 1,
    backgroundColor: Colors.surfaceHigh,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: Colors.textPrimary,
    fontWeight: '800',
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.ghostBorder,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.3,
    textTransform: 'uppercase',
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.06)',
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
    color: Colors.textPrimary,
    fontSize: Typography.lg,
    fontWeight: '800',
  },
  emptySub: {
    marginTop: 8,
    color: Colors.textSecondary,
    fontSize: Typography.base,
    textAlign: 'center',
  },
});
