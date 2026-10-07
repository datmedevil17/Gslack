import React from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert, Animated,
} from 'react-native';
import { InAppBrowser } from 'react-native-inappbrowser-reborn';
import { supabase } from '../lib/supabase';
import { colors, radius, spacing } from '../theme/tokens';
import type { Provider } from '@supabase/supabase-js';

const REDIRECT_URL = 'slack://auth-callback';

async function signInWithProvider(provider: Provider) {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo: REDIRECT_URL, skipBrowserRedirect: true },
  });
  if (error) throw error;
  if (!data.url) throw new Error('No OAuth URL returned');

  if (await InAppBrowser.isAvailable()) {
    const result = await InAppBrowser.openAuth(data.url, REDIRECT_URL, {
      dismissButtonStyle: 'cancel',
      preferredBarTintColor: colors.surface,
      preferredControlTintColor: colors.textPrimary,
      animated: true,
      modalEnabled: true,
    });
    if (result.type === 'success' && result.url) {
      const params = new URLSearchParams(new URL(result.url).hash.replace('#', ''));
      const access = params.get('access_token');
      const refresh = params.get('refresh_token');
      if (access && refresh) {
        await supabase.auth.setSession({ access_token: access, refresh_token: refresh });
      }
    }
  } else {
    const { Linking } = require('react-native');
    await Linking.openURL(data.url);
  }
}

export function LoginScreen() {
  const [loading, setLoading] = React.useState<Provider | null>(null);
  const scaleAnim = React.useRef(new Animated.Value(0.95)).current;
  const opacityAnim = React.useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    Animated.parallel([
      Animated.spring(scaleAnim, { toValue: 1, tension: 60, friction: 8, useNativeDriver: true }),
      Animated.timing(opacityAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
    ]).start();
  }, []);

  async function handleSignIn(provider: Provider) {
    try {
      setLoading(provider);
      await signInWithProvider(provider);
    } catch (e: any) {
      Alert.alert('Login failed', e.message);
    } finally {
      setLoading(null);
    }
  }

  return (
    <View style={styles.container}>
      {/* Ambient glow orbs */}
      <View style={[styles.orb, styles.orbTopLeft]} />
      <View style={[styles.orb, styles.orbBottomRight]} />

      <Animated.View style={[styles.content, { opacity: opacityAnim, transform: [{ scale: scaleAnim }] }]}>
        {/* Logo mark */}
        <View style={styles.logoWrap}>
          <View style={styles.logoMark}>
            <Text style={styles.logoChar}>⌘</Text>
          </View>
          <Text style={styles.appName}>Workspace</Text>
          <Text style={styles.tagline}>Ambient collaboration, redefined</Text>
        </View>

        {/* Card */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Welcome back</Text>
          <Text style={styles.cardSub}>Sign in to continue to your workspace</Text>

          {/* GitHub */}
          <TouchableOpacity
            style={[styles.btn, styles.btnGithub]}
            onPress={() => handleSignIn('github')}
            disabled={loading !== null}
            activeOpacity={0.8}
          >
            {loading === 'github' ? (
              <ActivityIndicator color={colors.textPrimary} size="small" />
            ) : (
              <>
                <View style={styles.providerIcon}>
                  <Text style={styles.githubIconText}>⌘</Text>
                </View>
                <Text style={styles.btnText}>Continue with GitHub</Text>
              </>
            )}
          </TouchableOpacity>

          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerOr}>or</Text>
            <View style={styles.dividerLine} />
          </View>

          {/* Google */}
          <TouchableOpacity
            style={[styles.btn, styles.btnGoogle]}
            onPress={() => handleSignIn('google')}
            disabled={loading !== null}
            activeOpacity={0.8}
          >
            {loading === 'google' ? (
              <ActivityIndicator color="#1A1A2E" size="small" />
            ) : (
              <>
                <View style={[styles.providerIcon, styles.googleIconBg]}>
                  <Text style={styles.googleIconText}>G</Text>
                </View>
                <Text style={styles.btnTextDark}>Continue with Google</Text>
              </>
            )}
          </TouchableOpacity>

          <Text style={styles.legal}>
            By continuing you agree to our{' '}
            <Text style={styles.legalLink}>Terms</Text> &{' '}
            <Text style={styles.legalLink}>Privacy Policy</Text>
          </Text>
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, justifyContent: 'center', alignItems: 'center' },
  orb: { position: 'absolute', borderRadius: 999, opacity: 0.25 },
  orbTopLeft: { width: 320, height: 320, backgroundColor: colors.accent, top: -80, left: -80 },
  orbBottomRight: { width: 240, height: 240, backgroundColor: '#1A3A6E', bottom: -60, right: -60 },
  content: { width: '100%', paddingHorizontal: spacing.lg, alignItems: 'center' },

  // Logo
  logoWrap: { alignItems: 'center', marginBottom: spacing.xl },
  logoMark: {
    width: 72, height: 72, borderRadius: radius.lg,
    backgroundColor: colors.accent, justifyContent: 'center', alignItems: 'center',
    marginBottom: spacing.md,
    shadowColor: colors.accent, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.7, shadowRadius: 24, elevation: 12,
  },
  logoChar: { fontSize: 32, color: colors.textOnAccent, fontWeight: '700' },
  appName: { fontSize: 26, fontWeight: '700', color: colors.textPrimary, letterSpacing: -0.5 },
  tagline: { fontSize: 13, color: colors.textSecondary, marginTop: 4 },

  // Card
  card: {
    width: '100%', backgroundColor: colors.surface,
    borderRadius: radius.xl, padding: spacing.lg + 4,
    borderWidth: 1, borderColor: colors.border,
    shadowColor: '#000', shadowOffset: { width: 0, height: 20 }, shadowOpacity: 0.5, shadowRadius: 40, elevation: 20,
  },
  cardTitle: { fontSize: 20, fontWeight: '700', color: colors.textPrimary, textAlign: 'center', letterSpacing: -0.4 },
  cardSub: { fontSize: 13, color: colors.textSecondary, textAlign: 'center', marginTop: 6, marginBottom: spacing.lg },

  // Buttons
  btn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    borderRadius: radius.md, paddingVertical: 15, gap: 10, borderWidth: 1,
  },
  btnGithub: { backgroundColor: '#161B22', borderColor: '#30363D' },
  btnGoogle: { backgroundColor: '#F8F9FA', borderColor: '#E1E4E8' },
  btnText: { fontSize: 15, fontWeight: '600', color: colors.textPrimary },
  btnTextDark: { fontSize: 15, fontWeight: '600', color: '#1A1A2E' },

  // Provider icons
  providerIcon: { width: 24, height: 24, borderRadius: 6, backgroundColor: 'rgba(255,255,255,0.08)', justifyContent: 'center', alignItems: 'center' },
  githubIconText: { fontSize: 14, color: colors.textPrimary },
  googleIconBg: { backgroundColor: 'transparent' },
  googleIconText: { fontSize: 16, fontWeight: '800', color: '#4285F4' },

  // Divider
  divider: { flexDirection: 'row', alignItems: 'center', marginVertical: spacing.md, gap: 8 },
  dividerLine: { flex: 1, height: 1, backgroundColor: colors.border },
  dividerOr: { fontSize: 12, color: colors.textMuted },

  // Legal
  legal: { fontSize: 11, color: colors.textMuted, textAlign: 'center', marginTop: spacing.md },
  legalLink: { color: colors.accent },
});
