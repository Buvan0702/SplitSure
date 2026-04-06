import React from 'react';
import {
  TouchableOpacity, Text, View, TextInput, ActivityIndicator,
  StyleSheet, TextInputProps, ViewStyle, TextStyle, Image,
} from 'react-native';
import { Colors, Typography, Spacing, Radius, Shadow } from '../utils/theme';

// ── Button ────────────────────────────────────────────────────────────────────
interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  disabled?: boolean;
  icon?: React.ReactNode;
  style?: ViewStyle;
}

export function Button({
  title, onPress, variant = 'primary', size = 'md',
  loading, disabled, icon, style,
}: ButtonProps) {
  const bg = {
    primary: Colors.primary,
    secondary: Colors.primaryLight,
    danger: Colors.danger,
    ghost: 'transparent',
  }[variant];

  const textColor = {
    primary: Colors.textInverse,
    secondary: Colors.primary,
    danger: Colors.textInverse,
    ghost: Colors.primary,
  }[variant];

  const pad = { sm: Spacing.sm, md: Spacing.md, lg: Spacing.base }[size];
  const fontSize = { sm: Typography.sm, md: Typography.base, lg: Typography.md }[size];

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.8}
      style={[
        styles.btn,
        { backgroundColor: bg, paddingVertical: pad, paddingHorizontal: pad * 2, borderRadius: Radius.md },
        (disabled || loading) && styles.btnDisabled,
        variant === 'ghost' && styles.btnGhost,
        variant === 'secondary' && { borderWidth: 1.5, borderColor: Colors.primary },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={textColor} />
      ) : (
        <View style={styles.btnInner}>
          {icon && <View style={{ marginRight: 6 }}>{icon}</View>}
          <Text style={[styles.btnText, { color: textColor, fontSize }]}>{title}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

// ── Card ──────────────────────────────────────────────────────────────────────
interface CardProps {
  children: React.ReactNode;
  style?: ViewStyle;
  onPress?: () => void;
  shadow?: boolean;
}

export function Card({ children, style, onPress, shadow = true }: CardProps) {
  const cardStyle = [styles.card, shadow && Shadow.sm, style];
  if (onPress) {
    return (
      <TouchableOpacity onPress={onPress} activeOpacity={0.85} style={cardStyle}>
        {children}
      </TouchableOpacity>
    );
  }
  return <View style={cardStyle}>{children}</View>;
}

// ── Input ─────────────────────────────────────────────────────────────────────
interface InputProps extends TextInputProps {
  label?: string;
  error?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  containerStyle?: ViewStyle;
}

export function Input({ label, error, leftIcon, rightIcon, containerStyle, style, ...props }: InputProps) {
  return (
    <View style={[{ marginBottom: Spacing.md }, containerStyle]}>
      {label && <Text style={styles.inputLabel}>{label}</Text>}
      <View style={[styles.inputWrapper, error && styles.inputError]}>
        {leftIcon && <View style={styles.inputIcon}>{leftIcon}</View>}
        <TextInput
          style={[styles.input, leftIcon && { paddingLeft: 0 }, style]}
          placeholderTextColor={Colors.textTertiary}
          {...props}
        />
        {rightIcon && <View style={styles.inputIconRight}>{rightIcon}</View>}
      </View>
      {error && <Text style={styles.inputErrorText}>{error}</Text>}
    </View>
  );
}

// ── Avatar ────────────────────────────────────────────────────────────────────
interface AvatarProps {
  name?: string | null;
  uri?: string | null;
  size?: number;
  style?: ViewStyle;
}

export function Avatar({ name, uri, size = 40, style }: AvatarProps) {
  const initials = name
    ? name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()
    : '?';

  const bgColor = stringToColor(name || '?');

  if (uri) {
    return (
      <Image
        source={{ uri }}
        style={[{ width: size, height: size, borderRadius: size / 2 }, style]}
      />
    );
  }

  return (
    <View style={[
      styles.avatar,
      { width: size, height: size, borderRadius: size / 2, backgroundColor: bgColor },
      style,
    ]}>
      <Text style={[styles.avatarText, { fontSize: size * 0.38 }]}>{initials}</Text>
    </View>
  );
}

function stringToColor(str: string): string {
  const palette = ['#6C63FF', '#FF6B6B', '#00C897', '#FFD93D', '#4ECDC4', '#FF8C00', '#9B59B6'];
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
  return palette[Math.abs(hash) % palette.length];
}

// ── Badge ─────────────────────────────────────────────────────────────────────
interface BadgeProps {
  label: string;
  color?: string;
  bgColor?: string;
  style?: ViewStyle;
}

export function Badge({ label, color = Colors.primary, bgColor = Colors.primaryLight, style }: BadgeProps) {
  return (
    <View style={[styles.badge, { backgroundColor: bgColor }, style]}>
      <Text style={[styles.badgeText, { color }]}>{label}</Text>
    </View>
  );
}

// ── Divider ───────────────────────────────────────────────────────────────────
export function Divider({ style }: { style?: ViewStyle }) {
  return <View style={[styles.divider, style]} />;
}

// ── EmptyState ────────────────────────────────────────────────────────────────
export function EmptyState({ icon, title, subtitle }: { icon: string; title: string; subtitle?: string }) {
  return (
    <View style={styles.empty}>
      <Text style={styles.emptyIcon}>{icon}</Text>
      <Text style={styles.emptyTitle}>{title}</Text>
      {subtitle && <Text style={styles.emptySub}>{subtitle}</Text>}
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  btn: { alignItems: 'center', justifyContent: 'center' },
  btnInner: { flexDirection: 'row', alignItems: 'center' },
  btnText: { fontWeight: '700', letterSpacing: 0.3 },
  btnDisabled: { opacity: 0.5 },
  btnGhost: {},

  card: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: Spacing.base,
    marginBottom: Spacing.sm,
  },

  inputLabel: {
    fontSize: Typography.sm,
    fontWeight: '600',
    color: Colors.textSecondary,
    marginBottom: Spacing.xs,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
  },
  inputError: { borderColor: Colors.danger },
  input: {
    flex: 1,
    height: 50,
    fontSize: Typography.base,
    color: Colors.textPrimary,
  },
  inputIcon: { marginRight: Spacing.sm },
  inputIconRight: { marginLeft: Spacing.sm },
  inputErrorText: { fontSize: Typography.xs, color: Colors.danger, marginTop: 4 },

  avatar: { alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: Colors.textInverse, fontWeight: '700' },

  badge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: Radius.full,
  },
  badgeText: { fontSize: Typography.xs, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },

  divider: { height: 1, backgroundColor: Colors.border, marginVertical: Spacing.sm },

  empty: { alignItems: 'center', paddingVertical: Spacing.xxxl },
  emptyIcon: { fontSize: 52, marginBottom: Spacing.md },
  emptyTitle: { fontSize: Typography.lg, fontWeight: '700', color: Colors.textPrimary, textAlign: 'center' },
  emptySub: { fontSize: Typography.sm, color: Colors.textTertiary, textAlign: 'center', marginTop: Spacing.xs, paddingHorizontal: Spacing.xl },
});
