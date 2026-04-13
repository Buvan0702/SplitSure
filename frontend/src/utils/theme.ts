import { Dimensions } from 'react-native';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

export { SCREEN_WIDTH, SCREEN_HEIGHT };

export const Colors = {
  background: '#0B0E17',
  surface: '#10131D',
  surfaceHigh: '#161924',
  surfaceHighest: '#212533',
  surfaceLowest: '#05070D',
  surfaceAlt: '#161924',
  glass: 'rgba(33, 37, 51, 0.78)',
  glassSoft: 'rgba(16, 19, 29, 0.72)',
  ghostBorder: 'rgba(255,255,255,0.08)',
  ghostBorderStrong: 'rgba(163,166,255,0.28)',
  border: 'rgba(255,255,255,0.08)',
  primary: '#A3A6FF',
  primaryDim: '#6063EE',
  primaryContainer: '#9396FF',
  primaryLight: 'rgba(163,166,255,0.12)',
  primaryInk: '#0A0081',
  secondary: '#1DFBA5',
  secondaryDim: '#00EC9A',
  tertiary: '#9BDDFF',
  success: '#1DFBA5',
  successLight: 'rgba(29,251,165,0.12)',
  warning: '#F59E0B',
  warningLight: 'rgba(245,158,11,0.12)',
  danger: '#FF6E84',
  dangerLight: 'rgba(255,110,132,0.12)',
  textPrimary: '#E9EAF8',
  textSecondary: '#A8AAB7',
  textMuted: '#727581',
  textTertiary: '#727581',
  textInverse: '#000000',
  overlay: 'rgba(6, 8, 14, 0.76)',
  chip: 'rgba(255,255,255,0.05)',
} as const;

export const Typography = {
  display: 'Space Grotesk',
  body: 'Inter',
  mono: 'JetBrains Mono',
  xs: 10,
  sm: 12,
  base: 14,
  md: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
  xxxl: 52,
} as const;

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  base: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
  xxxl: 48,
  mega: 64,
} as const;

export const Radius = {
  sm: 10,
  md: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
  full: 999,
} as const;

export const Shadow = {
  sm: {
    shadowColor: Colors.primaryDim,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 20,
    elevation: 6,
  },
  md: {
    shadowColor: Colors.primaryDim,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.24,
    shadowRadius: 32,
    elevation: 10,
  },
  lg: {
    shadowColor: Colors.secondary,
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.18,
    shadowRadius: 40,
    elevation: 12,
  },
  glowSm: {
    shadowColor: Colors.primaryDim,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 20,
    elevation: 6,
  },
  glowMd: {
    shadowColor: Colors.primaryDim,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.24,
    shadowRadius: 32,
    elevation: 10,
  },
  glowLg: {
    shadowColor: Colors.secondary,
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.18,
    shadowRadius: 40,
    elevation: 12,
  },
} as const;
