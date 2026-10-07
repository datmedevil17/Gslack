import React from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet,
  Animated, ActivityIndicator, Alert, TextInput, Modal,
  KeyboardAvoidingView, Platform, FlatList,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../lib/supabase';
import { api } from '../lib/api';
import { colors, spacing, radius, shadows } from '../theme/tokens';

interface Workspace {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  logo_url: string | null;
  is_public: boolean;
  plan: string;
  invite_code: string;
}

interface UserProfile {
  id: string;
  username: string;
  full_name: string;
  avatar_url: string | null;
}

interface Props {
  onOpenWorkspace: (id: string, name: string) => void;
  onOpenProfile: () => void;
}

const CARD_COLORS = [
  ['#7C5CFF', '#00C2FF'],
  ['#FF5CAA', '#7C5CFF'],
  ['#00C2FF', '#32D583'],
  ['#F79009', '#F04438'],
  ['#32D583', '#00C2FF'],
];

export function WorkspaceHubScreen({ onOpenWorkspace, onOpenProfile }: Props) {
  const fadeAnim = React.useRef(new Animated.Value(0)).current;
  const slideAnim = React.useRef(new Animated.Value(30)).current;

  const [workspaces, setWorkspaces] = React.useState<Workspace[]>([]);
  const [profile, setProfile]       = React.useState<UserProfile | null>(null);
  const [loading, setLoading]       = React.useState(true);
  const [token, setToken]           = React.useState('');

  const [showCreate, setShowCreate] = React.useState(false);
  const [showJoin, setShowJoin]     = React.useState(false);
  const [createName, setCreateName] = React.useState('');
  const [createDesc, setCreateDesc] = React.useState('');
  const [creating, setCreating]     = React.useState(false);
  const [joinCode, setJoinCode]     = React.useState('');
  const [joining, setJoining]       = React.useState(false);

  React.useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim,  { toValue: 1, duration: 500, useNativeDriver: true }),
      Animated.spring(slideAnim, { toValue: 0, tension: 60, friction: 10, useNativeDriver: true }),
    ]).start();
    load();
  }, []);

  async function load() {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const tok = session.access_token;
      setToken(tok);
      const [wsRes, meRes] = await Promise.allSettled([
        api.get('/api/v1/workspaces', tok) as Promise<{ data: Workspace[] }>,
        api.get('/api/v1/users/me', tok) as Promise<{ data: UserProfile }>,
      ]);
      if (wsRes.status === 'fulfilled') setWorkspaces(wsRes.value.data ?? []);
      if (meRes.status === 'fulfilled') setProfile(meRes.value.data);
    } catch (e: any) {
      console.error('hub load:', e.message);
    } finally {
      setLoading(false);
    }
  }

  async function createWorkspace() {
    if (!createName.trim()) return;
    setCreating(true);
    try {
      const res = await api.post('/api/v1/workspaces', {
        name: createName.trim(),
        description: createDesc.trim() || undefined,
      }, token) as { data: Workspace };
      setWorkspaces(prev => [res.data, ...prev]);
      setShowCreate(false);
      setCreateName('');
      setCreateDesc('');
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setCreating(false);
    }
  }

  async function joinWorkspace() {
    if (!joinCode.trim()) return;
    setJoining(true);
    try {
      const res = await api.post(`/api/v1/workspaces/join/${joinCode.trim()}`, {}, token) as { data: Workspace };
      setWorkspaces(prev => prev.find(w => w.id === res.data.id) ? prev : [res.data, ...prev]);
      setShowJoin(false);
      setJoinCode('');
    } catch (e: any) {
      Alert.alert('Invalid code', e.message);
    } finally {
      setJoining(false);
    }
  }

  const displayName = profile?.full_name || profile?.username || '';
  const initials    = displayName.slice(0, 2).toUpperCase() || '?';
  const hour        = new Date().getHours();
  const greeting    = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  return (
    <SafeAreaView style={styles.safe}>
      {/* Ambient orbs */}
      <View style={styles.orbTL} />
      <View style={styles.orbBR} />

      <Animated.View style={[{ flex: 1 }, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Text style={styles.greeting}>{greeting}</Text>
            <Text style={styles.username} numberOfLines={1}>
              {displayName ? `@${profile?.username || displayName}` : '…'}
            </Text>
          </View>
          <TouchableOpacity onPress={onOpenProfile} style={styles.avatarBtn} activeOpacity={0.8}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{initials}</Text>
            </View>
            <View style={styles.onlineDot} />
          </TouchableOpacity>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
          {/* Section label */}
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionLabel}>Your Workspaces</Text>
            <TouchableOpacity onPress={load} activeOpacity={0.7}>
              <Text style={styles.refreshBtn}>↻</Text>
            </TouchableOpacity>
          </View>

          {loading ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator color={colors.accent} />
            </View>
          ) : workspaces.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyEmoji}>🚀</Text>
              <Text style={styles.emptyTitle}>No workspaces yet</Text>
              <Text style={styles.emptySub}>Create one or join with an invite code</Text>
            </View>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.cardsRow}>
              {workspaces.map((ws, i) => {
                const [c1, c2] = CARD_COLORS[i % CARD_COLORS.length];
                const letter   = ws.name[0]?.toUpperCase() ?? '?';
                return (
                  <TouchableOpacity
                    key={ws.id}
                    style={styles.wsCard}
                    onPress={() => onOpenWorkspace(ws.id, ws.name)}
                    activeOpacity={0.85}
                  >
                    {/* Gradient strip */}
                    <View style={[styles.cardGradient, { backgroundColor: c1 }]}>
                      <View style={[styles.cardGradientOverlay, { backgroundColor: c2 }]} />
                      <Text style={styles.cardLetter}>{letter}</Text>
                    </View>
                    <View style={styles.cardBody}>
                      <Text style={styles.cardName} numberOfLines={1}>{ws.name}</Text>
                      {ws.description ? (
                        <Text style={styles.cardDesc} numberOfLines={1}>{ws.description}</Text>
                      ) : (
                        <Text style={styles.cardDescMuted}>{ws.plan}</Text>
                      )}
                      <View style={styles.cardFooter}>
                        {ws.is_public && (
                          <View style={styles.publicBadge}>
                            <Text style={styles.publicBadgeText}>Public</Text>
                          </View>
                        )}
                        <View style={styles.presenceDots}>
                          <View style={[styles.presenceDot, { backgroundColor: colors.online }]} />
                          <View style={[styles.presenceDot, { backgroundColor: colors.online, opacity: 0.6 }]} />
                          <View style={[styles.presenceDot, { backgroundColor: colors.online, opacity: 0.3 }]} />
                        </View>
                      </View>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          )}

          {/* Action cards */}
          <Text style={[styles.sectionLabel, { marginTop: spacing.lg }]}>Quick Actions</Text>
          <View style={styles.actionGrid}>
            <TouchableOpacity style={styles.actionCard} onPress={() => setShowCreate(true)} activeOpacity={0.8}>
              <View style={[styles.actionIcon, { backgroundColor: colors.accentDim }]}>
                <Text style={styles.actionEmoji}>✦</Text>
              </View>
              <Text style={styles.actionTitle}>Create Workspace</Text>
              <Text style={styles.actionSub}>Start fresh with your team</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionCard} onPress={() => setShowJoin(true)} activeOpacity={0.8}>
              <View style={[styles.actionIcon, { backgroundColor: colors.accentSecDim }]}>
                <Text style={styles.actionEmoji}>🔗</Text>
              </View>
              <Text style={styles.actionTitle}>Join Workspace</Text>
              <Text style={styles.actionSub}>Enter an invite code</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </Animated.View>

      {/* Create Modal */}
      <Modal visible={showCreate} transparent animationType="slide" onRequestClose={() => setShowCreate(false)}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={() => setShowCreate(false)} />
          <View style={styles.sheet}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>New Workspace</Text>
            <Text style={styles.inputLabel}>Name</Text>
            <TextInput
              style={styles.input}
              value={createName}
              onChangeText={setCreateName}
              placeholder="e.g. Acme Corp"
              placeholderTextColor={colors.textMuted}
              autoFocus
            />
            <Text style={styles.inputLabel}>Description (optional)</Text>
            <TextInput
              style={styles.input}
              value={createDesc}
              onChangeText={setCreateDesc}
              placeholder="What is this workspace for?"
              placeholderTextColor={colors.textMuted}
              returnKeyType="done"
              onSubmitEditing={createWorkspace}
            />
            <TouchableOpacity
              style={[styles.sheetBtn, (!createName.trim() || creating) && styles.sheetBtnOff]}
              onPress={createWorkspace}
              disabled={!createName.trim() || creating}
              activeOpacity={0.85}
            >
              {creating ? <ActivityIndicator color="#fff" /> : <Text style={styles.sheetBtnText}>Create workspace</Text>}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Join Modal */}
      <Modal visible={showJoin} transparent animationType="slide" onRequestClose={() => setShowJoin(false)}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={() => setShowJoin(false)} />
          <View style={styles.sheet}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Join Workspace</Text>
            <Text style={styles.inputLabel}>Invite code</Text>
            <TextInput
              style={styles.input}
              value={joinCode}
              onChangeText={setJoinCode}
              placeholder="Paste invite code here"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="none"
              autoFocus
              returnKeyType="done"
              onSubmitEditing={joinWorkspace}
            />
            <TouchableOpacity
              style={[styles.sheetBtn, (!joinCode.trim() || joining) && styles.sheetBtnOff]}
              onPress={joinWorkspace}
              disabled={!joinCode.trim() || joining}
              activeOpacity={0.85}
            >
              {joining ? <ActivityIndicator color="#fff" /> : <Text style={styles.sheetBtnText}>Join workspace</Text>}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  orbTL: { position: 'absolute', top: -100, left: -80, width: 340, height: 340, borderRadius: 999, backgroundColor: colors.accent, opacity: 0.07 },
  orbBR: { position: 'absolute', bottom: -60, right: -60, width: 240, height: 240, borderRadius: 999, backgroundColor: colors.accentSec, opacity: 0.05 },
  scroll: { paddingHorizontal: spacing.lg, paddingBottom: 60 },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.lg,
  },
  headerLeft: { flex: 1 },
  greeting: { fontSize: 13, color: colors.textSecondary, marginBottom: 2 },
  username: { fontSize: 22, fontWeight: '800', color: colors.textPrimary, letterSpacing: -0.5 },
  avatarBtn: { position: 'relative' },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.accentDim, borderWidth: 2, borderColor: colors.accent + '55', justifyContent: 'center', alignItems: 'center' },
  avatarText: { fontSize: 16, fontWeight: '700', color: colors.accent },
  onlineDot: { position: 'absolute', bottom: 1, right: 1, width: 12, height: 12, borderRadius: 6, backgroundColor: colors.online, borderWidth: 2, borderColor: colors.bg },

  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md },
  sectionLabel: { fontSize: 11, fontWeight: '700', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 1 },
  refreshBtn: { fontSize: 18, color: colors.textMuted },

  loadingRow: { alignItems: 'center', paddingVertical: spacing.xl },

  emptyCard: {
    alignItems: 'center', backgroundColor: colors.surface,
    borderRadius: radius.card, borderWidth: 1, borderColor: colors.border,
    padding: spacing.xl, marginBottom: spacing.lg,
  },
  emptyEmoji: { fontSize: 40, marginBottom: spacing.md },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: colors.textPrimary, marginBottom: 6 },
  emptySub:   { fontSize: 13, color: colors.textSecondary, textAlign: 'center' },

  cardsRow: { paddingRight: spacing.lg, paddingBottom: spacing.sm, gap: 14 },
  wsCard: {
    width: 200, backgroundColor: colors.surface,
    borderRadius: radius.card, borderWidth: 1, borderColor: colors.border,
    overflow: 'hidden',
    ...shadows.card,
  },
  cardGradient: { height: 90, justifyContent: 'flex-end', padding: 12 },
  cardGradientOverlay: { ...StyleSheet.absoluteFill, opacity: 0.5, borderTopLeftRadius: radius.card, borderTopRightRadius: radius.card },
  cardLetter: { fontSize: 32, fontWeight: '800', color: 'rgba(255,255,255,0.9)' },
  cardBody: { padding: 12 },
  cardName: { fontSize: 15, fontWeight: '700', color: colors.textPrimary, marginBottom: 2 },
  cardDesc: { fontSize: 12, color: colors.textSecondary },
  cardDescMuted: { fontSize: 12, color: colors.textMuted, textTransform: 'capitalize' },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 },
  publicBadge: { backgroundColor: colors.success + '22', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  publicBadgeText: { fontSize: 10, fontWeight: '700', color: colors.success },
  presenceDots: { flexDirection: 'row', gap: 3 },
  presenceDot: { width: 6, height: 6, borderRadius: 3 },

  actionGrid: { flexDirection: 'row', gap: 12, marginTop: spacing.sm },
  actionCard: {
    flex: 1, backgroundColor: colors.surface, borderRadius: radius.card,
    borderWidth: 1, borderColor: colors.border,
    padding: spacing.md, gap: 8,
  },
  actionIcon: { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  actionEmoji: { fontSize: 18 },
  actionTitle: { fontSize: 14, fontWeight: '700', color: colors.textPrimary },
  actionSub:   { fontSize: 11, color: colors.textSecondary },

  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' },
  sheet: {
    backgroundColor: colors.surface, borderTopLeftRadius: radius.xxl, borderTopRightRadius: radius.xxl,
    padding: spacing.lg, paddingBottom: 44, borderWidth: 1, borderColor: colors.border,
  },
  sheetHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center', marginBottom: spacing.md },
  sheetTitle: { fontSize: 20, fontWeight: '800', color: colors.textPrimary, marginBottom: spacing.lg, letterSpacing: -0.3 },
  inputLabel: { fontSize: 11, fontWeight: '700', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6 },
  input: {
    backgroundColor: colors.bg, borderRadius: radius.input, borderWidth: 1, borderColor: colors.border,
    color: colors.textPrimary, fontSize: 15, paddingHorizontal: spacing.md, paddingVertical: 13,
    marginBottom: spacing.md,
  },
  sheetBtn: { backgroundColor: colors.accent, borderRadius: radius.input, paddingVertical: 15, alignItems: 'center', ...shadows.accent },
  sheetBtnOff: { opacity: 0.4 },
  sheetBtnText: { fontSize: 16, fontWeight: '700', color: '#fff' },
});
