import React, { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { AxiosError } from 'axios';
import { AppBackdrop } from '../components/chrome';
import { Button, Card, Input } from '../components/ui';
import { Colors, Radius, Shadow, Spacing, Typography } from '../utils/theme';
import { useAuthStore } from '../store/authStore';

type Step = 'splash' | 'phone' | 'otp';

function getAuthErrorMessage(error: unknown, fallback: string) {
  const axiosError = error as AxiosError<{ detail?: string }>;
  const detail = axiosError.response?.data?.detail;
  if (typeof detail === 'string' && detail.trim()) return detail;
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
  const { sendOTP, verifyOTP } = useAuthStore();
  const [step, setStep] = useState<Step>('splash');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const otpRefs = useRef<Array<TextInput | null>>([]);

  useEffect(() => {
    const timer = setTimeout(() => setStep('phone'), 1600);
    return () => clearTimeout(timer);
  }, []);

  const cleanedPhone = phone.replace(/\D/g, '');

  const handleSendOtp = async () => {
    if (cleanedPhone.length !== 10) {
      setError('Enter a valid 10-digit mobile number');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const result = await sendOTP(`+91${cleanedPhone}`);
      if (result.dev_otp) {
        setOtp(String(result.dev_otp).split('').slice(0, 6));
      }
      setStep('otp');
    } catch (err) {
      setError(getAuthErrorMessage(err, 'Failed to send OTP'));
    } finally {
      setLoading(false);
    }
  };

  const submitOtp = async (code = otp.join('')) => {
    if (code.length !== 6) {
      setError('Enter the full 6-digit OTP');
      return;
    }

    setLoading(true);
    setError('');
    try {
      await verifyOTP(`+91${cleanedPhone}`, code);
      router.replace('/(tabs)');
    } catch (err) {
      setError(getAuthErrorMessage(err, 'Invalid OTP'));
      setOtp(['', '', '', '', '', '']);
    } finally {
      setLoading(false);
    }
  };

  const setOtpDigit = (value: string, index: number) => {
    const next = [...otp];
    next[index] = value.slice(-1);
    setOtp(next);
    if (value && index < 5) otpRefs.current[index + 1]?.focus();
    if (next.every(Boolean)) submitOtp(next.join(''));
  };

  return (
    <AppBackdrop>
      {step === 'splash' ? (
        <View style={styles.splash}>
          <View style={styles.ringLarge} />
          <View style={styles.ringMedium} />
          <View style={styles.ringSmall} />
          <View style={styles.logoDisc}>
            <Text style={styles.logoGlyph}>S</Text>
          </View>
          <Text style={styles.brand}>SPLITSURE</Text>
          <Text style={styles.brandSub}>NEURAL_NET_ALPHA_1.0</Text>
          <View style={styles.splashFeatures}>
            {['Greedy-optimized settlements', 'Cryptographic proof vault', 'Immutable audit ledger'].map((feature) => (
              <Card key={feature} style={styles.splashPill}>
                <Text style={styles.splashPillText}>{feature}</Text>
              </Card>
            ))}
          </View>
          <View style={styles.progressWrap}>
            <Text style={styles.progressLabel}>INITIALIZING SECURE SESSION...</Text>
            <View style={styles.progressTrack}>
              <LinearGradient colors={[Colors.primary, Colors.secondary]} style={styles.progressFill} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} />
            </View>
          </View>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.hero}>
            <View style={styles.logoWrap}>
              <Text style={styles.heroLogo}>S</Text>
            </View>
            <Text style={styles.title}>SPLITSURE</Text>
            <Text style={styles.subtitle}>Financial Truth. Cryptographic Proof.</Text>
          </View>

          <View style={styles.chipRow}>
            {['Zero-Knowledge', 'Immutable Ledger', 'Bank-grade'].map((label) => (
              <Card key={label} style={styles.trustChip}>
                <Text style={styles.trustChipText}>{label}</Text>
              </Card>
            ))}
          </View>

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
                  leftAddon={<Text style={styles.phonePrefix}>+91</Text>}
                  error={error}
                />
                <Button title="SEND OTP" onPress={handleSendOtp} loading={loading} />
              </>
            ) : (
              <>
                <Text style={styles.otpHeading}>Verify OTP</Text>
                <Text style={styles.otpCopy}>Confirm the six-digit secure access code for +91 {cleanedPhone}</Text>
                <View style={styles.otpRow}>
                  {otp.map((digit, index) => (
                    <TextInput
                      key={index}
                      ref={(ref) => {
                        otpRefs.current[index] = ref;
                      }}
                      value={digit}
                      onChangeText={(value) => setOtpDigit(value, index)}
                      keyboardType="number-pad"
                      maxLength={1}
                      style={styles.otpBox}
                    />
                  ))}
                </View>
                {error ? <Text style={styles.error}>{error}</Text> : null}
                <Button title="VERIFY & CONTINUE" onPress={() => submitOtp()} loading={loading} />
                <Pressable onPress={() => setStep('phone')} style={{ marginTop: Spacing.base }}>
                  <Text style={styles.changeNumber}>Change number</Text>
                </Pressable>
              </>
            )}
            <Text style={styles.terms}>
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
    borderColor: 'rgba(163,166,255,0.12)',
  },
  ringMedium: {
    position: 'absolute',
    width: 220,
    height: 220,
    borderRadius: 110,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: 'rgba(163,166,255,0.18)',
  },
  ringSmall: {
    position: 'absolute',
    width: 140,
    height: 140,
    borderRadius: 70,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: 'rgba(163,166,255,0.22)',
  },
  logoDisc: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: Colors.glass,
    borderWidth: 1,
    borderColor: Colors.ghostBorder,
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadow.glowMd,
  },
  logoGlyph: {
    color: Colors.primary,
    fontSize: 64,
    fontWeight: '800',
    marginTop: -8,
  },
  brand: {
    color: Colors.textPrimary,
    fontSize: 46,
    fontWeight: '800',
    letterSpacing: 8,
    marginTop: Spacing.xxxl,
  },
  brandSub: {
    color: 'rgba(163,166,255,0.8)',
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
    color: Colors.textSecondary,
    fontSize: Typography.base,
  },
  progressWrap: {
    position: 'absolute',
    bottom: 80,
    left: Spacing.xl,
    right: Spacing.xl,
  },
  progressLabel: {
    color: 'rgba(233,234,248,0.4)',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 3,
    textAlign: 'center',
    marginBottom: Spacing.sm,
  },
  progressTrack: {
    height: 2,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.06)',
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
    backgroundColor: 'rgba(99,102,241,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadow.glowMd,
  },
  heroLogo: {
    color: Colors.primary,
    fontSize: 46,
    fontWeight: '800',
  },
  title: {
    color: Colors.textPrimary,
    fontSize: 42,
    fontWeight: '800',
    letterSpacing: 6,
    marginTop: Spacing.xl,
  },
  subtitle: {
    color: Colors.textSecondary,
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
    color: Colors.textSecondary,
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
    color: Colors.primary,
    fontSize: Typography.base,
    fontWeight: '700',
  },
  otpHeading: {
    color: Colors.textPrimary,
    fontSize: Typography.xl,
    fontWeight: '800',
    marginBottom: 8,
  },
  otpCopy: {
    color: Colors.textSecondary,
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
    backgroundColor: Colors.surfaceLowest,
    borderWidth: 1,
    borderColor: Colors.ghostBorder,
    color: Colors.textPrimary,
    textAlign: 'center',
    fontSize: Typography.xl,
    fontWeight: '800',
  },
  error: {
    color: Colors.danger,
    marginBottom: Spacing.base,
  },
  changeNumber: {
    color: Colors.primary,
    fontSize: Typography.sm,
    fontWeight: '700',
    textAlign: 'center',
  },
  terms: {
    color: Colors.textMuted,
    fontSize: 11,
    textAlign: 'center',
    marginTop: Spacing.base,
    lineHeight: 18,
  },
});
