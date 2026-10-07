import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Image,
  Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../lib/supabase';
import { api } from '../lib/api';
import { colors, spacing, radius } from '../theme/tokens';

interface UserProfile {
  id: string;
  username: string;
  full_name: string;
  avatar_url: string | null;
}

interface Props {
  onOpenProfile: () => void;
  onOpenWorkspaces: () => void;
}

export function HomeScreen({ onOpenProfile, onOpenWorkspaces }: Props) {
  const fadeAnim = React.useRef(new Animated.Value(0)).current;
  const [profile, setProfile] = React.useState<UserProfile | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    loadProfile();
    Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: true }).start();
  }, []);

  async function loadProfile() {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const res = await api.get('/api/v1/users/me', session.access_token) as { data: UserProfile };
      setProfile(res.data);
    } catch (e: any) {
      console.error('HomeScreen load:', e.message);
    } finally {
      setLoading(false);
    }
  }

  const displayName = profile?.username || profile?.full_name || '…';
  const initials = displayName.slice(0, 2).toUpperCase();

  return (
    <SafeAreaView style={styles.safe}>
      {/* Ambient orb */}
      <View style={styles.orb} />

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.appName}>Workspace</Text>

        <TouchableOpacity onPress={onOpenProfile} activeOpacity={0.8} style={styles.avatarBtn}>
          {profile?.avatar_url ? (
            <Image source={{ uri: profile.avatar_url }} style={styles.avatarImg} />
          ) : (
            <View style={styles.avatarFallback}>
              <Text style={styles.avatarInitials}>{initials}</Text>
            </View>
          )}
          <View style={styles.onlineDot} />
        </TouchableOpacity>
      </View>

      {/* Body */}
      <Animated.View style={[styles.body, { opacity: fadeAnim }]}>
        {loading ? (
          <ActivityIndicator color={colors.accent} size="large" />
        ) : (
          <>
            <Text style={styles.greeting}>Good to see you,</Text>
            <Text style={styles.username}>@{displayName}</Text>
            <View style={styles.pill}>
              <View style={styles.pillDot} />
              <Text style={styles.pillText}>Active now</Text>
            </View>

            <TouchableOpacity style={styles.wsBtn} onPress={onOpenWorkspaces} activeOpacity={0.85}>
              <Text style={styles.wsBtnText}>Open Workspaces →</Text>
            </TouchableOpacity>
          </>
        )}
      </Animated.View>
    </SafeAreaView>
  );
}

const AVATAR_SIZE = 42;

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },

  orb: {
    position: 'absolute',
    width: 400, height: 400, borderRadius: 200,
    backgroundColor: colors.accent, opacity: 0.06,
    top: -160, alignSelf: 'center',
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.md,
  },
  appName: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.textPrimary,
    letterSpacing: -0.4,
  },

  avatarBtn: {
    position: 'relative',
  },
  avatarImg: {
    width: AVATAR_SIZE, height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    borderWidth: 2, borderColor: colors.accent + '66',
  },
  avatarFallback: {
    width: AVATAR_SIZE, height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    backgroundColor: colors.accentDim,
    borderWidth: 2, borderColor: colors.accent + '66',
    justifyContent: 'center', alignItems: 'center',
  },
  avatarInitials: {
    fontSize: 16, fontWeight: '700', color: colors.accent,
  },
  onlineDot: {
    position: 'absolute', bottom: 1, right: 1,
    width: 11, height: 11, borderRadius: 6,
    backgroundColor: colors.success,
    borderWidth: 2, borderColor: colors.bg,
  },

  body: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
  },
  greeting: {
    fontSize: 16,
    color: colors.textSecondary,
    marginBottom: 6,
  },
  username: {
    fontSize: 36,
    fontWeight: '800',
    color: colors.textPrimary,
    letterSpacing: -1,
    marginBottom: spacing.lg,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.surface,
    borderRadius: radius.full,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pillDot: {
    width: 7, height: 7, borderRadius: 4,
    backgroundColor: colors.success,
  },
  pillText: {
    fontSize: 13,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  wsBtn: {
    marginTop: spacing.xl,
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    paddingVertical: 14,
    paddingHorizontal: 32,
    shadowColor: colors.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 6,
  },
  wsBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
  },
});
