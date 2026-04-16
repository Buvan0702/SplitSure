import React, { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, ZoomIn } from 'react-native-reanimated';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { AxiosError } from 'axios';
import { AppBackdrop } from '../components/chrome';
import { Button, Card, Input } from '../components/ui';
import { Radius, Shadow, Spacing, Typography, useTheme } from '../utils/theme';
import { useAuthStore } from '../store/authStore';
import { usersAPI } from '../services/api';

type Step = 'splash' | 'phone' | 'register' | 'otp';
const OTP_LENGTH = 6;

function getAuthErrorMessage(error: unknown, fallback: string) {
  const axiosError = error as AxiosError<{ detail?: string } | string>;
  const responseData = axiosError.response?.data;
  const detail = typeof responseData === 'string' ? responseData : responseData?.detail;
  if (typeof detail === 'string' && detail.trim()) return detail;
  if (axiosError.response?.status && axiosError.response.status >= 500) {
    return 'Server error during OTP verification. Please try again after backend redeploy.';
  }
  if (axiosError.code === 'ECONNABORTED') {
    return 'Server is waking up. Please wait a moment and try again.';
  }
  if (axiosError.message === 'Network Error') {
    return 'Cannot reach the server. Check your internet connection and backend URL.';
  }
  return fallback;
}

export default function LoginScreen() {
  const router = useRouter();
  const { redirect } = useLocalSearchParams<{ redirect?: string }>();
  const { register, sendOTP, verifyOTP } = useAuthStore();
  const { colors, isDark } = useTheme();
  const [step, setStep] = useState<Step>('splash');
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState<string[]>(Array.from({ length: OTP_LENGTH }, () => ''));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const otpRefs = useRef<Array<TextInput | null>>([]);

  useEffect(() => {
    const timer = setTimeout(() => setStep('phone'), 1600);
    return () => clearTimeout(timer);
  }, []);

  const cleanedPhone = phone.replace(/\D/g, '');
  const fullPhone = `+91${cleanedPhone}`;

  useEffect(() => {
    if (step !== 'otp') return;
    const timer = setTimeout(() => otpRefs.current[0]?.focus(), 150);
    return () => clearTimeout(timer);
  }, [step]);

  const submitOtp = async (code = otp.join('')) => {
    const normalizedCode = code.replace(/\D/g, '').slice(0, OTP_LENGTH);
    if (normalizedCode.length !== OTP_LENGTH) {
      setError('Enter the full 6-digit OTP');
      return;
    }

    setLoading(true);
    setError('');
    try {
      await verifyOTP(`+91${cleanedPhone}`, normalizedCode);
      const redirectPath = typeof redirect === 'string' && redirect.startsWith('/')
        ? redirect
        : '/(tabs)';
      router.replace(redirectPath);
    } catch (err) {
      setError(getAuthErrorMessage(err, 'Failed to verify OTP'));
      setOtp(Array.from({ length: OTP_LENGTH }, () => ''));
      otpRefs.current[0]?.focus();
    } finally {
      setLoading(false);
    }
  };

  const fillOtpFromCode = (rawCode: string) => {
    const digits = rawCode.replace(/\D/g, '').slice(0, OTP_LENGTH);
    if (!digits) return;

    const next = Array.from({ length: OTP_LENGTH }, (_, i) => digits[i] ?? '');
    setOtp(next);

    if (digits.length === OTP_LENGTH) {
      void submitOtp(digits);
      return;
    }

    otpRefs.current[Math.min(digits.length, OTP_LENGTH - 1)]?.focus();
  };

  const startOtpLogin = async () => {
    const result = await sendOTP(fullPhone);
    setStep('otp');
    if (result.dev_otp) {
      const devOtpValue = String(result.dev_otp).slice(0, OTP_LENGTH);
      setTimeout(() => fillOtpFromCode(devOtpValue), 150);
    }
  };

  const handlePhoneContinue = async () => {
    if (cleanedPhone.length !== 10) {
      setError('Enter a valid 10-digit mobile number');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const lookup = await usersAPI.checkPhoneRegistration(fullPhone);
      if (!lookup.registered) {
        setStep('register');
        return;
      }

      await startOtpLogin();
    } catch (err) {
      setError(getAuthErrorMessage(err, 'Failed to continue login'));
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async () => {
    if (cleanedPhone.length !== 10) {
      setError('Enter a valid 10-digit mobile number');
      setStep('phone');
      return;
    }

    const normalizedName = name.trim();
    const normalizedEmail = email.trim().toLowerCase();

    if (!normalizedName) {
      setError('Name is required');
      return;
    }

    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(normalizedEmail)) {
      setError('Enter a valid email address');
      return;
    }

    setLoading(true);
    setError('');
    try {
      await register(normalizedName, normalizedEmail, fullPhone);
      await startOtpLogin();
    } catch (err) {
      setError(getAuthErrorMessage(err, 'Registration failed'));
    } finally {
      setLoading(false);
    }
  };

  const setOtpDigit = (value: string, index: number) => {
    const digitsOnly = value.replace(/\D/g, '');

    if (digitsOnly.length > 1) {
      const next = [...otp];
      for (let offset = 0; offset < digitsOnly.length && index + offset < OTP_LENGTH; offset += 1) {
        next[index + offset] = digitsOnly[offset];
      }

      setOtp(next);

      if (next.every(Boolean)) {
        void submitOtp(next.join(''));
        return;
      }

      const nextEmptyIndex = next.findIndex((digit) => !digit);
      if (nextEmptyIndex >= 0) {
        otpRefs.current[nextEmptyIndex]?.focus();
      }
      return;
    }

    const next = [...otp];
    next[index] = digitsOnly.slice(-1);
    setOtp(next);
    if (digitsOnly && index < OTP_LENGTH - 1) otpRefs.current[index + 1]?.focus();
    if (next.every(Boolean)) void submitOtp(next.join(''));
  };

  return (
    <AppBackdrop>
      {step === 'splash' ? (
        <Animated.View style={styles.splash} entering={FadeIn.duration(800)}>
          <View style={[styles.ringLarge, { borderColor: isDark ? 'rgba(163,166,255,0.12)' : 'rgba(96,99,238,0.12)' }]} />
          <View style={[styles.ringMedium, { borderColor: isDark ? 'rgba(163,166,255,0.18)' : 'rgba(96,99,238,0.18)' }]} />
          <View style={[styles.ringSmall, { borderColor: isDark ? 'rgba(163,166,255,0.22)' : 'rgba(96,99,238,0.22)' }]} />
          <Animated.View style={styles.logoDisc} entering={ZoomIn.duration(600).delay(200)}>
            <Text style={[styles.logoGlyph, { color: colors.primary }]}>S</Text>
          </Animated.View>
          <Animated.Text style={[styles.brand, { color: colors.textPrimary }]} entering={FadeInDown.duration(500).delay(300)}>SPLITSURE</Animated.Text>
          <Text style={[styles.brandSub, { color: isDark ? 'rgba(163,166,255,0.8)' : 'rgba(96,99,238,0.7)' }]}>NEURAL_NET_ALPHA_1.0</Text>
          <View style={styles.splashFeatures}>
            {['Greedy-optimized settlements', 'Cryptographic proof vault', 'Immutable audit ledger'].map((feature, i) => (
              <Animated.View key={feature} entering={FadeInDown.duration(400).delay(400 + i * 100)}>
                <Card key={feature} style={styles.splashPill}>
                  <Text style={[styles.splashPillText, { color: colors.textSecondary }]}>{feature}</Text>
                </Card>
              </Animated.View>
            ))}
          </View>
          <View style={styles.progressWrap}>
            <Text style={[styles.progressLabel, { color: isDark ? 'rgba(233,234,248,0.4)' : 'rgba(26,29,46,0.4)' }]}>INITIALIZING SECURE SESSION...</Text>
            <View style={styles.progressTrack}>
              <LinearGradient colors={[colors.primary, colors.secondary]} style={styles.progressFill} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} />
            </View>
          </View>
        </Animated.View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <Animated.View style={styles.hero} entering={FadeInDown.duration(500)}>
            <View style={[styles.logoWrap, { backgroundColor: isDark ? 'rgba(99,102,241,0.16)' : 'rgba(96,99,238,0.12)' }]}>
              <Text style={[styles.heroLogo, { color: colors.primary }]}>S</Text>
            </View>
            <Text style={[styles.title, { color: colors.textPrimary }]}>SPLITSURE</Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>Financial Truth. Cryptographic Proof.</Text>
          </Animated.View>

          <Animated.View style={styles.chipRow} entering={FadeInDown.duration(500).delay(100)}>
            {['Zero-Knowledge', 'Immutable Ledger', 'Bank-grade'].map((label) => (
              <Card key={label} style={styles.trustChip}>
                <Text style={[styles.trustChipText, { color: colors.textSecondary }]}>{label}</Text>
              </Card>
            ))}
          </Animated.View>

          <Card style={styles.formCard}>
            {step === 'phone' ? (
              <>
                <Input
                  label="Identity Verification"
                  value={phone}
                  onChangeText={(value) => {
                    setPhone(value);
                    setError('');
                  }}
                  keyboardType="phone-pad"
                  placeholder="Enter mobile number"
                  leftAddon={<Text style={[styles.phonePrefix, { color: colors.primary }]}>+91</Text>}
                  error={error}
                />
                <Button title="CONTINUE" onPress={handlePhoneContinue} loading={loading} />
              </>
            ) : step === 'register' ? (
              <>
                <Text style={[styles.otpHeading, { color: colors.textPrimary }]}>Create Account</Text>
                <Text style={[styles.otpCopy, { color: colors.textSecondary }]}>This phone number is not registered. Complete signup to continue.</Text>
                <Input
                  label="Phone Number"
                  value={fullPhone}
                  editable={false}
                  selectTextOnFocus={false}
                />
                <Input
                  label="Full Name"
                  value={name}
                  onChangeText={(value) => {
                    setName(value);
                    setError('');
                  }}
                  placeholder="Enter your full name"
                />
                <Input
                  label="Email"
                  value={email}
                  onChangeText={(value) => {
                    setEmail(value);
                    setError('');
                  }}
                  placeholder="Enter your email"
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
                {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}
                <Button title="CREATE ACCOUNT" onPress={handleRegister} loading={loading} />
                <Pressable onPress={() => setStep('phone')} style={{ marginTop: Spacing.base }}>
                  <Text style={[styles.changeNumber, { color: colors.primary }]}>Change number</Text>
                </Pressable>
              </>
            ) : (
              <>
                <Text style={[styles.otpHeading, { color: colors.textPrimary }]}>Verify OTP</Text>
                <Text style={[styles.otpCopy, { color: colors.textSecondary }]}>Confirm the six-digit secure access code for +91 {cleanedPhone}</Text>
                <View style={styles.otpRow}>
                  {otp.map((digit, index) => (
                    <TextInput
                      key={index}
                      ref={(ref) => {
                        otpRefs.current[index] = ref;
                      }}
                      value={digit}
                      onChangeText={(value) => setOtpDigit(value, index)}
                      onKeyPress={({ nativeEvent }) => {
                        if (nativeEvent.key === 'Backspace' && !otp[index] && index > 0) {
                          otpRefs.current[index - 1]?.focus();
                        }
                      }}
                      keyboardType="number-pad"
                      textContentType={index === 0 ? 'oneTimeCode' : undefined}
                      autoComplete={index === 0 ? 'sms-otp' : 'off'}
                      importantForAutofill={index === 0 ? 'yes' : 'no'}
                      maxLength={index === 0 ? OTP_LENGTH : 1}
                      style={[styles.otpBox, { backgroundColor: colors.surfaceLowest, borderColor: colors.ghostBorder, color: colors.textPrimary }]}
                    />
                  ))}
                </View>
                {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}
                <Button title="VERIFY & CONTINUE" onPress={() => submitOtp()} loading={loading} />
                <Pressable onPress={() => setStep('phone')} style={{ marginTop: Spacing.base }}>
                  <Text style={[styles.changeNumber, { color: colors.primary }]}>Change number</Text>
                </Pressable>
              </>
            )}
            <Text style={[styles.terms, { color: colors.textMuted }]}>
              By continuing, you agree to the Sovereign Protocols and Audit Terms.
            </Text>
          </Card>
        </ScrollView>
      )}
    </AppBackdrop>
  );
}

const styles = StyleSheet.create({
  splash: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xl,
  },
  ringLarge: {
    position: 'absolute',
    width: 320,
    height: 320,
    borderRadius: 160,
    borderWidth: 1,
    borderStyle: 'dashed',
  },
  ringMedium: {
    position: 'absolute',
    width: 220,
    height: 220,
    borderRadius: 110,
    borderWidth: 1,
    borderStyle: 'dashed',
  },
  ringSmall: {
    position: 'absolute',
    width: 140,
    height: 140,
    borderRadius: 70,
    borderWidth: 1,
    borderStyle: 'dashed',
  },
  logoDisc: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoGlyph: {
    fontSize: 64,
    fontWeight: '800',
    marginTop: -8,
  },
  brand: {
    fontSize: 46,
    fontWeight: '800',
    letterSpacing: 8,
    marginTop: Spacing.xxxl,
  },
  brandSub: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 3,
    marginTop: 8,
  },
  splashFeatures: {
    gap: Spacing.sm,
    marginTop: Spacing.xxxl,
    width: '100%',
  },
  splashPill: {
    borderRadius: Radius.full,
    paddingVertical: 12,
    alignItems: 'center',
  },
  splashPillText: {
    fontSize: Typography.base,
  },
  progressWrap: {
    position: 'absolute',
    bottom: 80,
    left: Spacing.xl,
    right: Spacing.xl,
  },
  progressLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 3,
    textAlign: 'center',
    marginBottom: Spacing.sm,
  },
  progressTrack: {
    height: 2,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    width: '65%',
    height: '100%',
  },
  scroll: {
    paddingHorizontal: Spacing.base,
    paddingTop: 88,
    paddingBottom: 60,
    alignItems: 'center',
  },
  hero: {
    alignItems: 'center',
    marginBottom: Spacing.xl,
  },
  logoWrap: {
    width: 80,
    height: 80,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroLogo: {
    fontSize: 46,
    fontWeight: '800',
  },
  title: {
    fontSize: 42,
    fontWeight: '800',
    letterSpacing: 6,
    marginTop: Spacing.xl,
  },
  subtitle: {
    fontSize: Typography.base,
    marginTop: 8,
  },
  chipRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    flexWrap: 'wrap',
    justifyContent: 'center',
    marginBottom: Spacing.xl,
  },
  trustChip: {
    borderRadius: Radius.full,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  trustChipText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  formCard: {
    width: '100%',
    borderRadius: Radius.xxl,
  },
  phonePrefix: {
    fontSize: Typography.base,
    fontWeight: '700',
  },
  otpHeading: {
    fontSize: Typography.xl,
    fontWeight: '800',
    marginBottom: 8,
  },
  otpCopy: {
    fontSize: Typography.base,
    marginBottom: Spacing.base,
  },
  otpRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: Spacing.sm,
    marginBottom: Spacing.base,
  },
  otpBox: {
    flex: 1,
    height: 56,
    borderRadius: Radius.md,
    borderWidth: 1,
    textAlign: 'center',
    fontSize: Typography.xl,
    fontWeight: '800',
  },
  error: {
    marginBottom: Spacing.base,
  },
  changeNumber: {
    fontSize: Typography.sm,
    fontWeight: '700',
    textAlign: 'center',
  },
  terms: {
    fontSize: 11,
    textAlign: 'center',
    marginTop: Spacing.base,
    lineHeight: 18,
  },
});
