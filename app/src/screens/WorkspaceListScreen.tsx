import React from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, FlatList,
  ActivityIndicator, Alert, TextInput, Modal, Animated, Image,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../lib/supabase';
import { api } from '../lib/api';
import { colors, spacing, radius } from '../theme/tokens';

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

interface Props {
  onBack: () => void;
  onOpenWorkspace: (id: string, name: string) => void;
}

export function WorkspaceListScreen({ onBack, onOpenWorkspace }: Props) {
  const fadeAnim = React.useRef(new Animated.Value(0)).current;

  const [workspaces, setWorkspaces] = React.useState<Workspace[]>([]);
  const [loading, setLoading]       = React.useState(true);
  const [showCreate, setShowCreate] = React.useState(false);
  const [showJoin, setShowJoin]     = React.useState(false);

  // Create form
  const [createName, setCreateName]   = React.useState('');
  const [createDesc, setCreateDesc]   = React.useState('');
  const [creating, setCreating]       = React.useState(false);

  // Join form
  const [joinCode, setJoinCode] = React.useState('');
  const [joining, setJoining]   = React.useState(false);

  React.useEffect(() => {
    load();
    Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }).start();
  }, []);

  async function getToken() {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token ?? '';
  }

  async function load() {
    setLoading(true);
    try {
      const token = await getToken();
      const res = await api.get('/api/v1/workspaces', token) as { data: Workspace[] };
      setWorkspaces(res.data ?? []);
    } catch (e: any) {
      console.error('load workspaces:', e.message);
    } finally {
      setLoading(false);
    }
  }

  async function createWorkspace() {
    if (!createName.trim()) return;
    setCreating(true);
    try {
      const token = await getToken();
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
      const token = await getToken();
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

  function renderItem({ item }: { item: Workspace }) {
    const letter = item.name[0]?.toUpperCase() ?? '?';
    return (
      <TouchableOpacity style={styles.card} onPress={() => onOpenWorkspace(item.id, item.name)} activeOpacity={0.75}>
        {item.logo_url ? (
          <Image source={{ uri: item.logo_url }} style={styles.logo} />
        ) : (
          <View style={[styles.logo, styles.logoFallback]}>
            <Text style={styles.logoLetter}>{letter}</Text>
          </View>
        )}
        <View style={styles.cardBody}>
          <Text style={styles.cardName}>{item.name}</Text>
          {item.description ? (
            <Text style={styles.cardDesc} numberOfLines={1}>{item.description}</Text>
          ) : null}
          <View style={styles.cardMeta}>
            <Text style={styles.metaBadge}>{item.plan}</Text>
            {item.is_public && <Text style={styles.metaPublic}>Public</Text>}
          </View>
        </View>
        <Text style={styles.chevron}>›</Text>
      </TouchableOpacity>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.orb} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn} activeOpacity={0.7}>
          <Text style={styles.backIcon}>←</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Workspaces</Text>
        <TouchableOpacity onPress={() => setShowCreate(true)} style={styles.addBtn} activeOpacity={0.8}>
          <Text style={styles.addIcon}>+</Text>
        </TouchableOpacity>
      </View>

      <Animated.View style={{ flex: 1, opacity: fadeAnim }}>
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.accent} size="large" />
          </View>
        ) : workspaces.length === 0 ? (
          <View style={styles.center}>
            <Text style={styles.emptyTitle}>No workspaces yet</Text>
            <Text style={styles.emptySubtitle}>Create one or join with an invite code</Text>
          </View>
        ) : (
          <FlatList
            data={workspaces}
            keyExtractor={w => w.id}
            renderItem={renderItem}
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
          />
        )}

        {/* Join button */}
        <TouchableOpacity style={styles.joinBtn} onPress={() => setShowJoin(true)} activeOpacity={0.85}>
          <Text style={styles.joinBtnText}>Join via invite code</Text>
        </TouchableOpacity>
      </Animated.View>

      {/* ── Create Modal ─────────────────────────────────────────────── */}
      <Modal visible={showCreate} transparent animationType="slide" onRequestClose={() => setShowCreate(false)}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={() => setShowCreate(false)} />
          <View style={styles.sheet}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>New workspace</Text>

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
              style={[styles.sheetBtn, (!createName.trim() || creating) && styles.sheetBtnDisabled]}
              onPress={createWorkspace}
              disabled={!createName.trim() || creating}
              activeOpacity={0.85}
            >
              {creating ? <ActivityIndicator color="#fff" /> : <Text style={styles.sheetBtnText}>Create workspace</Text>}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Join Modal ───────────────────────────────────────────────── */}
      <Modal visible={showJoin} transparent animationType="slide" onRequestClose={() => setShowJoin(false)}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={() => setShowJoin(false)} />
          <View style={styles.sheet}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Join workspace</Text>

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
              style={[styles.sheetBtn, (!joinCode.trim() || joining) && styles.sheetBtnDisabled]}
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
  safe:  { flex: 1, backgroundColor: colors.bg },
  orb: {
    position: 'absolute', width: 300, height: 300, borderRadius: 150,
    backgroundColor: colors.accent, opacity: 0.06, top: -100, right: -80,
  },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 8 },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  backBtn: { width: 36, height: 36, justifyContent: 'center' },
  backIcon: { fontSize: 22, color: colors.accent },
  title: { fontSize: 17, fontWeight: '700', color: colors.textPrimary },
  addBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: colors.accent, justifyContent: 'center', alignItems: 'center',
  },
  addIcon: { fontSize: 22, color: '#fff', lineHeight: 26 },

  list: { padding: spacing.lg, gap: 12 },

  card: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.surface, borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.border,
    padding: spacing.md, gap: spacing.md,
  },
  logo: { width: 48, height: 48, borderRadius: 12 },
  logoFallback: { backgroundColor: colors.accentDim, justifyContent: 'center', alignItems: 'center' },
  logoLetter: { fontSize: 20, fontWeight: '700', color: colors.accent },
  cardBody: { flex: 1 },
  cardName: { fontSize: 16, fontWeight: '600', color: colors.textPrimary },
  cardDesc: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
  cardMeta: { flexDirection: 'row', gap: 8, marginTop: 6 },
  metaBadge: {
    fontSize: 11, fontWeight: '600', color: colors.accent,
    backgroundColor: colors.accentDim, borderRadius: 4,
    paddingHorizontal: 6, paddingVertical: 2, textTransform: 'uppercase',
  },
  metaPublic: { fontSize: 11, fontWeight: '600', color: colors.success },
  chevron: { fontSize: 20, color: colors.textMuted },

  emptyTitle: { fontSize: 17, fontWeight: '600', color: colors.textPrimary },
  emptySubtitle: { fontSize: 14, color: colors.textSecondary },

  joinBtn: {
    margin: spacing.lg, backgroundColor: colors.surface,
    borderRadius: radius.md, paddingVertical: 14, alignItems: 'center',
    borderWidth: 1, borderColor: colors.border,
  },
  joinBtnText: { fontSize: 15, fontWeight: '600', color: colors.accent },

  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' },
  sheet: {
    backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: spacing.lg, paddingBottom: 40, borderWidth: 1, borderColor: colors.border,
  },
  sheetHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center', marginBottom: spacing.md },
  sheetTitle: { fontSize: 18, fontWeight: '700', color: colors.textPrimary, marginBottom: spacing.md },
  inputLabel: { fontSize: 11, fontWeight: '600', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 },
  input: {
    backgroundColor: colors.bg, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border,
    color: colors.textPrimary, fontSize: 15, paddingHorizontal: spacing.md, paddingVertical: 12,
    marginBottom: spacing.md,
  },
  sheetBtn: {
    backgroundColor: colors.accent, borderRadius: radius.md,
    paddingVertical: 14, alignItems: 'center', marginTop: 4,
  },
  sheetBtnDisabled: { opacity: 0.5 },
  sheetBtnText: { fontSize: 16, fontWeight: '700', color: '#fff' },
});
