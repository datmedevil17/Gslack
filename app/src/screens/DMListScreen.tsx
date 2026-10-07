import React from 'react';
import {
  View, Text, TouchableOpacity, FlatList, StyleSheet,
  ActivityIndicator, SectionList,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../lib/supabase';
import { api } from '../lib/api';
import { colors, spacing, radius } from '../theme/tokens';

interface DMParticipant {
  user_id: string;
  user?: { id: string; username: string; full_name: string; avatar_url?: string | null };
}

interface DMConvo {
  id: string;
  is_group: boolean;
  name?: string | null;
  participants?: DMParticipant[];
}

interface Props {
  workspaceId: string;
  myUserId: string;
  onBack: () => void;
  onOpenDM: (convo: DMConvo) => void;
}

export function DMListScreen({ workspaceId, myUserId, onBack, onOpenDM }: Props) {
  const [dms, setDms] = React.useState<DMConvo[]>([]);
  const [groups, setGroups] = React.useState<DMConvo[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const tok = session.access_token;
      const [dmRes, grpRes] = await Promise.allSettled([
        api.get('/api/v1/dm', tok) as Promise<{ data: DMConvo[] }>,
        api.get('/api/v1/group-dm', tok) as Promise<{ data: DMConvo[] }>,
      ]);
      if (dmRes.status === 'fulfilled') setDms(dmRes.value.data ?? []);
      if (grpRes.status === 'fulfilled') setGroups(grpRes.value.data ?? []);
    } catch (e: any) {
      console.error('DMList load:', e.message);
    } finally {
      setLoading(false);
    }
  }

  function otherParticipant(convo: DMConvo) {
    return convo.participants?.find(p => p.user_id !== myUserId)?.user;
  }

  function groupLabel(convo: DMConvo) {
    if (convo.name) return convo.name;
    const others = (convo.participants ?? [])
      .filter(p => p.user_id !== myUserId)
      .map(p => p.user?.full_name || p.user?.username || '?');
    return others.join(', ') || 'Group DM';
  }

  function renderDM({ item }: { item: DMConvo }) {
    const other = otherParticipant(item);
    const name = other?.full_name || other?.username || 'Unknown';
    const initials = name.slice(0, 2).toUpperCase();
    return (
      <TouchableOpacity style={styles.row} onPress={() => onOpenDM(item)} activeOpacity={0.7}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initials}</Text>
        </View>
        <View style={styles.rowBody}>
          <Text style={styles.rowName}>{name}</Text>
          {other?.username && <Text style={styles.rowSub}>@{other.username}</Text>}
        </View>
        <Text style={styles.chevron}>›</Text>
      </TouchableOpacity>
    );
  }

  function renderGroup({ item }: { item: DMConvo }) {
    const label = groupLabel(item);
    const count = item.participants?.length ?? 0;
    const initials = label.slice(0, 2).toUpperCase();
    return (
      <TouchableOpacity style={styles.row} onPress={() => onOpenDM(item)} activeOpacity={0.7}>
        <View style={[styles.avatar, styles.groupAvatar]}>
          <Text style={styles.avatarText}>{initials}</Text>
        </View>
        <View style={styles.rowBody}>
          <Text style={styles.rowName}>{label}</Text>
          <Text style={styles.rowSub}>{count} members</Text>
        </View>
        <Text style={styles.chevron}>›</Text>
      </TouchableOpacity>
    );
  }

  const sections = [
    { title: 'Direct Messages', data: dms, renderItem: renderDM, key: 'dms' },
    { title: 'Group DMs', data: groups, renderItem: renderGroup, key: 'groups' },
  ].filter(s => s.data.length > 0);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.headerBtn} activeOpacity={0.7}>
          <Text style={styles.backIcon}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Messages</Text>
        <View style={styles.headerBtn} />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : sections.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyTitle}>No messages yet</Text>
          <Text style={styles.emptySub}>Open a workspace to start a DM</Text>
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={item => item.id}
          renderItem={({ item, section }) => (section as any).renderItem({ item })}
          renderSectionHeader={({ section }) => (
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>{section.title}</Text>
            </View>
          )}
          contentContainerStyle={styles.listContent}
          stickySectionHeadersEnabled={false}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 8 },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  headerBtn: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '700', color: colors.textPrimary },
  backIcon: { fontSize: 22, color: colors.accent },

  listContent: { paddingBottom: 40 },
  sectionHeader: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: 4 },
  sectionTitle: { fontSize: 11, fontWeight: '700', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.8 },

  row: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    paddingHorizontal: spacing.lg, paddingVertical: 13,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  avatar: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: colors.accentDim, justifyContent: 'center', alignItems: 'center',
  },
  groupAvatar: { backgroundColor: colors.surfaceHigh },
  avatarText: { fontSize: 15, fontWeight: '700', color: colors.accent },
  rowBody: { flex: 1 },
  rowName: { fontSize: 15, fontWeight: '600', color: colors.textPrimary },
  rowSub: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  chevron: { fontSize: 20, color: colors.textMuted },

  emptyTitle: { fontSize: 17, fontWeight: '600', color: colors.textPrimary },
  emptySub: { fontSize: 14, color: colors.textSecondary },
});
