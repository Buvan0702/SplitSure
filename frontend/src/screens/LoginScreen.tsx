import React, { useState, useRef } from 'react';
import {
  View, Text, StyleSheet, KeyboardAvoidingView, Platform,
  ScrollView, TextInput, TouchableOpacity, Animated,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Colors, Typography, Spacing, Radius, Shadow } from '../utils/theme';
import { Button, Input } from '../components/ui';
import { useAuthStore } from '../store/authStore';

type Step = 'phone' | 'otp';

export default function LoginScreen() {
  const router = useRouter();
  const { sendOTP, verifyOTP } = useAuthStore();

  const [step, setStep] = useState<Step>('phone');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [phoneError, setPhoneError] = useState('');

  const otpRefs = useRef<Array<TextInput | null>>([]);
  const slideAnim = useRef(new Animated.Value(0)).current;

  const handleSendOTP = async () => {
    setPhoneError('');
    const cleaned = phone.replace(/\D/g, '');
    if (cleaned.length < 10) {
      setPhoneError('Please enter a valid 10-digit mobile number');
      return;
    }

    setLoading(true);
    try {
      const res = await sendOTP(phone.startsWith('+') ? phone : `+91${cleaned}`);
      setStep('otp');
      Animated.spring(slideAnim, {
        toValue: 1, useNativeDriver: true, tension: 80, friction: 10,
      }).start();

      // ── DEV MODE: auto-fill OTP returned from API ─────────────────
      if (res?.dev_otp) {
        const digits = String(res.dev_otp).split('');
        setOtp(digits);
      }
    } catch (e: any) {
      setPhoneError(e?.response?.data?.detail || 'Failed to send OTP');
    } finally {
      setLoading(false);
    }
  };

  const handleOTPChange = (value: string, index: number) => {
    const newOtp = [...otp];
    newOtp[index] = value;
    setOtp(newOtp);
    setError('');

    if (value && index < 5) {
      otpRefs.current[index + 1]?.focus();
    }
    if (!value && index > 0) {
      otpRefs.current[index - 1]?.focus();
    }

    if (newOtp.every(d => d)) {
      handleVerifyOTP(newOtp.join(''));
    }
  };

  const handleVerifyOTP = async (code?: string) => {
    const otpCode = code || otp.join('');
    if (otpCode.length !== 6) {
      setError('Please enter the complete 6-digit OTP');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const cleanedPhone = phone.replace(/\D/g, '');
      await verifyOTP(`+91${cleanedPhone}`, otpCode);
      router.replace('/(tabs)/');
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Invalid OTP. Please try again.');
      setOtp(['', '', '', '', '', '']);
      otpRefs.current[0]?.focus();
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.logoContainer}>
            <Text style={styles.logoIcon}>🔐</Text>
          </View>
          <Text style={styles.logoText}>SplitSure</Text>
          <Text style={styles.tagline}>Smart Expense Split with Proof & Accountability</Text>
        </View>

        {/* Card */}
        <View style={[styles.card, Shadow.lg]}>
          {step === 'phone' ? (
            <>
              <Text style={styles.cardTitle}>Welcome!</Text>
              <Text style={styles.cardSub}>Enter your mobile number to get started</Text>

              <Input
                label="Mobile Number"
                value={phone}
                onChangeText={setPhone}
                keyboardType="phone-pad"
                placeholder="98765 43210"
                maxLength={10}
                error={phoneError}
                leftIcon={<Text style={styles.countryCode}>🇮🇳 +91</Text>}
                style={{ letterSpacing: 2, fontSize: Typography.md }}
              />

              <Button
                title="Send OTP"
                onPress={handleSendOTP}
                loading={loading}
                size="lg"
                style={{ marginTop: Spacing.sm }}
              />

              <Text style={styles.terms}>
                By continuing, you agree to our{' '}
                <Text style={styles.link}>Terms of Service</Text> and{' '}
                <Text style={styles.link}>Privacy Policy</Text>
              </Text>
            </>
          ) : (
            <>
              <TouchableOpacity onPress={() => setStep('phone')} style={styles.backBtn}>
                <Text style={styles.backText}>← Change number</Text>
              </TouchableOpacity>

              <Text style={styles.cardTitle}>Verify OTP</Text>
              <Text style={styles.cardSub}>
                Enter the 6-digit code sent to{'\n'}
                <Text style={styles.phoneBold}>+91 {phone.replace(/\D/g, '')}</Text>
              </Text>

              {/* OTP Boxes */}
              <View style={styles.otpRow}>
                {otp.map((digit, i) => (
                  <TextInput
                    key={i}
                    ref={el => (otpRefs.current[i] = el)}
                    value={digit}
                    onChangeText={val => handleOTPChange(val.slice(-1), i)}
                    keyboardType="numeric"
                    maxLength={1}
                    style={[
                      styles.otpBox,
                      digit && styles.otpBoxFilled,
                      error && styles.otpBoxError,
                    ]}
                    selectTextOnFocus
                  />
                ))}
              </View>

              {error ? <Text style={styles.errorText}>{error}</Text> : null}

              {/* DEV MODE notice */}
              {otp.every(d => d) && (
                <View style={styles.devBanner}>
                  <Text style={styles.devBannerText}>
                    🛠️ Dev mode — OTP auto-filled from API response
                  </Text>
                </View>
              )}

              <Button
                title={loading ? 'Verifying...' : 'Verify & Continue'}
                onPress={() => handleVerifyOTP()}
                loading={loading}
                size="lg"
                style={{ marginTop: Spacing.lg }}
              />

              <TouchableOpacity onPress={handleSendOTP} style={styles.resendBtn}>
                <Text style={styles.resendText}>Didn't receive the OTP? <Text style={styles.link}>Resend</Text></Text>
              </TouchableOpacity>
            </>
          )}
        </View>

        {/* Trust badges */}
        <View style={styles.trustRow}>
          {['🔒 Secure', '📋 Proof-backed', '✅ Mutual confirm'].map(badge => (
            <View key={badge} style={styles.trustBadge}>
              <Text style={styles.trustText}>{badge}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  scroll: { flexGrow: 1, paddingHorizontal: Spacing.base, paddingTop: 60, paddingBottom: Spacing.xxxl },

  header: { alignItems: 'center', marginBottom: Spacing.xl },
  logoContainer: {
    width: 80, height: 80, borderRadius: Radius.xl,
    backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center',
    marginBottom: Spacing.md, ...Shadow.md,
  },
  logoIcon: { fontSize: 36 },
  logoText: { fontSize: Typography.xxxl, fontWeight: '800', color: Colors.textPrimary, letterSpacing: -1 },
  tagline: { fontSize: Typography.sm, color: Colors.textTertiary, textAlign: 'center', marginTop: 4, maxWidth: 260 },

  card: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.xl,
    padding: Spacing.xl,
    marginBottom: Spacing.xl,
  },
  cardTitle: { fontSize: Typography.xl, fontWeight: '800', color: Colors.textPrimary, marginBottom: 6 },
  cardSub: { fontSize: Typography.sm, color: Colors.textSecondary, marginBottom: Spacing.lg, lineHeight: 20 },

  countryCode: { fontSize: Typography.base, color: Colors.textSecondary, marginRight: 4 },

  otpRow: { flexDirection: 'row', justifyContent: 'space-between', marginVertical: Spacing.md },
  otpBox: {
    width: 46, height: 56, borderRadius: Radius.md,
    borderWidth: 2, borderColor: Colors.border,
    backgroundColor: Colors.surfaceAlt,
    textAlign: 'center', fontSize: Typography.xl,
    fontWeight: '700', color: Colors.textPrimary,
  },
  otpBoxFilled: { borderColor: Colors.primary, backgroundColor: Colors.primaryLight },
  otpBoxError: { borderColor: Colors.danger },
  errorText: { color: Colors.danger, fontSize: Typography.sm, textAlign: 'center' },

  backBtn: { marginBottom: Spacing.md },
  backText: { color: Colors.primary, fontSize: Typography.sm, fontWeight: '600' },
  phoneBold: { fontWeight: '700', color: Colors.textPrimary },

  terms: { fontSize: Typography.xs, color: Colors.textTertiary, textAlign: 'center', marginTop: Spacing.md, lineHeight: 18 },
  link: { color: Colors.primary, fontWeight: '600' },

  resendBtn: { alignItems: 'center', marginTop: Spacing.md },
  resendText: { fontSize: Typography.sm, color: Colors.textTertiary },

  devBanner: {
    backgroundColor: '#FFF3CD', borderRadius: Radius.sm, padding: Spacing.sm,
    borderLeftWidth: 3, borderLeftColor: '#FFD93D', marginTop: Spacing.sm,
  },
  devBannerText: { fontSize: Typography.xs, color: '#856404', fontWeight: '600' },

  trustRow: { flexDirection: 'row', justifyContent: 'center', gap: Spacing.sm, flexWrap: 'wrap' },
  trustBadge: {
    backgroundColor: Colors.surface, paddingHorizontal: Spacing.md, paddingVertical: Spacing.xs,
    borderRadius: Radius.full, borderWidth: 1, borderColor: Colors.border,
  },
  trustText: { fontSize: Typography.xs, color: Colors.textSecondary, fontWeight: '600' },
});
