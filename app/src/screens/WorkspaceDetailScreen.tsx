import React from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, FlatList,
  ActivityIndicator, Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../lib/supabase';
import { api } from '../lib/api';
import { colors, spacing, radius } from '../theme/tokens';

interface Channel {
  id: string;
  name: string;
  description: string | null;
  type: string;
  is_archived: boolean;
}

interface PresenceEntry {
  user_id: string;
  status: string;
  status_text: string | null;
  user: { username: string; full_name: string; avatar_url: string | null };
}

interface Props {
  workspaceId: string;
  workspaceName: string;
  myUserId?: string;
  onBack: () => void;
  onOpenSettings: () => void;
  onOpenMembers: () => void;
  onOpenFiles: () => void;
  onOpenChannel?: (channelId: string, channelName: string) => void;
  onOpenDMs?: (myUserId: string) => void;
}

const STATUS_COLOR: Record<string, string> = {
  online: '#32D583', away: '#F79009', dnd: '#F04438', offline: '#4A5568',
};

export function WorkspaceDetailScreen({
  workspaceId, workspaceName, onBack, onOpenSettings, onOpenMembers, onOpenFiles,
  onOpenChannel, onOpenDMs,
}: Props) {
  const fadeAnim = React.useRef(new Animated.Value(0)).current;
  const [tab, setTab]           = React.useState<'channels' | 'presence'>('channels');
  const [channels, setChannels] = React.useState<Channel[]>([]);
  const [presence, setPresence] = React.useState<PresenceEntry[]>([]);
  const [loading, setLoading]   = React.useState(true);
  const [myId, setMyId]         = React.useState('');

  React.useEffect(() => {
    load();
    Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }).start();
  }, []);

  async function load() {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const token = session.access_token;

      const [chRes, prRes] = await Promise.allSettled([
        api.get(`/api/v1/workspaces/${workspaceId}/channels`, token) as Promise<{ data: Channel[] }>,
        api.get(`/api/v1/workspaces/${workspaceId}/presence`, token) as Promise<{ data: PresenceEntry[] }>,
      ]);

      if (chRes.status === 'fulfilled') setChannels(chRes.value.data ?? []);
      if (prRes.status === 'fulfilled') setPresence(prRes.value.data ?? []);

      const meRes = await api.get('/api/v1/users/me', token) as { data: { id: string } };
      setMyId(meRes.data.id);
    } catch (e: any) {
      console.error('WorkspaceDetail load:', e.message);
    } finally {
      setLoading(false);
    }
  }

  function renderChannel({ item }: { item: Channel }) {
    return (
      <TouchableOpacity style={styles.row} activeOpacity={0.7} onPress={() => onOpenChannel?.(item.id, item.name)}>
        <Text style={styles.channelHash}>#</Text>
        <View style={styles.rowBody}>
          <Text style={styles.rowTitle}>{item.name}</Text>
          {item.description ? (
            <Text style={styles.rowSub} numberOfLines={1}>{item.description}</Text>
          ) : null}
        </View>
        {item.is_archived && <Text style={styles.archivedBadge}>Archived</Text>}
      </TouchableOpacity>
    );
  }

  function renderPresence({ item }: { item: PresenceEntry }) {
    const name = item.user?.full_name || item.user?.username || '?';
    const initials = name.slice(0, 2).toUpperCase();
    return (
      <View style={styles.row}>
        <View style={styles.presenceAvatar}>
          <Text style={styles.presenceInitials}>{initials}</Text>
          <View style={[styles.presenceDot, { backgroundColor: STATUS_COLOR[item.status] ?? STATUS_COLOR.offline }]} />
        </View>
        <View style={styles.rowBody}>
          <Text style={styles.rowTitle}>{name}</Text>
          <Text style={styles.rowSub}>{item.status_text || item.status}</Text>
        </View>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.headerBtn} activeOpacity={0.7}>
          <Text style={styles.backIcon}>←</Text>
        </TouchableOpacity>
        <Text style={styles.title} numberOfLines={1}>{workspaceName}</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity onPress={() => onOpenDMs?.(myId)} style={styles.headerBtn} activeOpacity={0.7}>
            <Text style={styles.headerActionIcon}>💬</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={onOpenFiles} style={styles.headerBtn} activeOpacity={0.7}>
            <Text style={styles.headerActionIcon}>📎</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={onOpenMembers} style={styles.headerBtn} activeOpacity={0.7}>
            <Text style={styles.headerActionIcon}>👥</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={onOpenSettings} style={styles.headerBtn} activeOpacity={0.7}>
            <Text style={styles.headerActionIcon}>⚙</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Tabs */}
      <View style={styles.tabs}>
        {(['channels', 'presence'] as const).map(t => (
          <TouchableOpacity
            key={t}
            style={[styles.tab, tab === t && styles.tabActive]}
            onPress={() => setTab(t)}
          >
            <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>
              {t === 'channels' ? 'Channels' : 'Members'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <Animated.View style={{ flex: 1, opacity: fadeAnim }}>
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.accent} />
          </View>
        ) : tab === 'channels' ? (
          <FlatList
            data={channels.filter(c => !c.is_archived)}
            keyExtractor={c => c.id}
            renderItem={renderChannel}
            ListEmptyComponent={<Text style={styles.empty}>No channels yet</Text>}
            contentContainerStyle={styles.listContent}
          />
        ) : (
          <FlatList
            data={presence}
            keyExtractor={p => p.user_id}
            renderItem={renderPresence}
            ListEmptyComponent={<Text style={styles.empty}>No members online</Text>}
            contentContainerStyle={styles.listContent}
          />
        )}
      </Animated.View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  headerBtn: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  backIcon: { fontSize: 22, color: colors.accent },
  title: { flex: 1, fontSize: 17, fontWeight: '700', color: colors.textPrimary, textAlign: 'center' },
  headerActions: { flexDirection: 'row' },
  headerActionIcon: { fontSize: 18 },

  tabs: {
    flexDirection: 'row', marginHorizontal: spacing.lg, marginVertical: spacing.sm,
    backgroundColor: colors.surface, borderRadius: radius.md, padding: 4,
    borderWidth: 1, borderColor: colors.border,
  },
  tab: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: radius.sm - 2 },
  tabActive: { backgroundColor: colors.accent },
  tabText: { fontSize: 14, fontWeight: '600', color: colors.textMuted },
  tabTextActive: { color: '#fff' },

  listContent: { paddingHorizontal: spacing.lg, paddingBottom: 40 },

  row: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 13, gap: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  channelHash: { fontSize: 20, color: colors.textMuted, width: 24, textAlign: 'center' },
  rowBody: { flex: 1 },
  rowTitle: { fontSize: 15, fontWeight: '600', color: colors.textPrimary },
  rowSub: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  archivedBadge: { fontSize: 11, color: colors.textMuted, backgroundColor: colors.surface, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },

  presenceAvatar: { position: 'relative', width: 40, height: 40 },
  presenceInitials: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: colors.accentDim, textAlign: 'center', lineHeight: 40,
    fontSize: 14, fontWeight: '700', color: colors.accent,
  },
  presenceDot: {
    position: 'absolute', bottom: 0, right: 0,
    width: 11, height: 11, borderRadius: 6,
    borderWidth: 2, borderColor: colors.bg,
  },

  empty: { textAlign: 'center', color: colors.textMuted, marginTop: spacing.xl, fontSize: 14 },
});
