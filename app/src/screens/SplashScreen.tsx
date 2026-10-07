import React from 'react';
import { View, Text, Image, Animated, StyleSheet } from 'react-native';
import { colors } from '../theme/tokens';

const logo = require('../../logo.png');

interface Props {
  onDone: () => void;
}

export function SplashScreen({ onDone }: Props) {
  const breathe  = React.useRef(new Animated.Value(1)).current;
  const fadeIn   = React.useRef(new Animated.Value(0)).current;
  const tagFade  = React.useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    // Breathing glow loop
    Animated.loop(
      Animated.sequence([
        Animated.timing(breathe, { toValue: 1.18, duration: 1800, useNativeDriver: true }),
        Animated.timing(breathe, { toValue: 1,    duration: 1800, useNativeDriver: true }),
      ])
    ).start();

    // Logo + tagline fade in, then navigate
    Animated.sequence([
      Animated.timing(fadeIn,  { toValue: 1, duration: 700, useNativeDriver: true }),
      Animated.delay(400),
      Animated.timing(tagFade, { toValue: 1, duration: 600, useNativeDriver: true }),
      Animated.delay(900),
    ]).start(onDone);
  }, []);

  return (
    <View style={styles.container}>
      {/* Ambient bg orbs */}
      <View style={styles.orbTL} />
      <View style={styles.orbBR} />

      {/* Breathing glow ring */}
      <Animated.View style={[styles.glowRing, { transform: [{ scale: breathe }] }]} />

      {/* Logo */}
      <Animated.Image
        source={logo}
        style={[styles.logoImg, { opacity: fadeIn }]}
        resizeMode="contain"
      />

      {/* App name */}
      <Animated.Text style={[styles.appName, { opacity: fadeIn }]}>
        Gslack
      </Animated.Text>

      {/* Tagline */}
      <Animated.Text style={[styles.tagline, { opacity: tagFade }]}>
        Ambient collaboration for modern teams
      </Animated.Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },

  orbTL: {
    position: 'absolute', top: -120, left: -100,
    width: 380, height: 380, borderRadius: 999,
    backgroundColor: colors.accent, opacity: 0.08,
  },
  orbBR: {
    position: 'absolute', bottom: -80, right: -80,
    width: 260, height: 260, borderRadius: 999,
    backgroundColor: colors.accentSec, opacity: 0.06,
  },

  glowRing: {
    position: 'absolute',
    width: 200, height: 200, borderRadius: 100,
    backgroundColor: colors.accent, opacity: 0.15,
  },

  logoImg: {
    width: 120, height: 120,
    shadowColor: colors.accent,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6, shadowRadius: 28, elevation: 16,
  },

  appName: {
    fontSize: 28, fontWeight: '800', color: colors.textPrimary,
    letterSpacing: -0.6, marginTop: 20,
  },
  tagline: {
    fontSize: 14, color: colors.textSecondary,
    marginTop: 10, textAlign: 'center',
    paddingHorizontal: 40,
  },
});
