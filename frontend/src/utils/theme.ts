import { Dimensions } from 'react-native';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

export { SCREEN_WIDTH, SCREEN_HEIGHT };

export const Colors = {
  // Brand
  primary: '#6C63FF',
  primaryLight: '#EEF0FF',
  primaryDark: '#4A42CC',

  // Semantic
  success: '#00C897',
  successLight: '#E6FBF5',
  danger: '#FF6B6B',
  dangerLight: '#FFF0F0',
  warning: '#FFD93D',
  warningLight: '#FFFAE6',

  // Neutral
  background: '#F8F9FF',
  surface: '#FFFFFF',
  surfaceAlt: '#F2F3FA',
  border: '#E8E9F5',
  borderStrong: '#C8CADF',

  // Text
  textPrimary: '#1A1A2E',
  textSecondary: '#5A5B75',
  textTertiary: '#9899B3',
  textInverse: '#FFFFFF',

  // Overlay
  overlay: 'rgba(26, 26, 46, 0.5)',
} as const;

export const Typography = {
  // Font families (use system fonts; swap with custom in production)
  fontBold: 'System',
  fontSemiBold: 'System',
  fontMedium: 'System',
  fontRegular: 'System',

  // Scale
  xs: 11,
  sm: 13,
  base: 15,
  md: 17,
  lg: 20,
  xl: 24,
  xxl: 30,
  xxxl: 38,
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
} as const;

export const Radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  full: 999,
} as const;

export const Shadow = {
  sm: {
    shadowColor: '#6C63FF',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 2,
  },
  md: {
    shadowColor: '#6C63FF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 4,
  },
  lg: {
    shadowColor: '#1A1A2E',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.16,
    shadowRadius: 24,
    elevation: 8,
  },
} as const;
