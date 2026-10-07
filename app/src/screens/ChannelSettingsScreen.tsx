import React from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, Alert, ActivityIndicator, Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../lib/supabase';
import { api } from '../lib/api';
import { colors, spacing, radius } from '../theme/tokens';

interface ChannelMember {
  user_id: string;
  role: string;
  user: { id: string; username: string; full_name: string };
}

interface PinnedMsg {
  message_id: string;
  pinned_at: string;
  message?: { id: string; content: string; sender?: { username: string; full_name: string } };
}

interface Props {
  channelId: string;
  channelName: string;
  channelDescription?: string | null;
  workspaceId: string;
  onBack: () => void;
  onDeleted: () => void;
}

export function ChannelSettingsScreen({
  channelId, channelName, channelDescription, workspaceId, onBack, onDeleted,
}: Props) {
  const [name, setName] = React.useState(channelName);
  const [desc, setDesc] = React.useState(channelDescription ?? '');
  const [saving, setSaving] = React.useState(false);
  const [members, setMembers] = React.useState<ChannelMember[]>([]);
  const [pins, setPins] = React.useState<PinnedMsg[]>([]);
  const [token, setToken] = React.useState('');
  const [myUserId, setMyUserId] = React.useState('');

  React.useEffect(() => { init(); }, []);

  async function init() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const tok = session.access_token;
    setToken(tok);
    const meRes = await api.get('/api/v1/users/me', tok) as { data: { id: string } };
    setMyUserId(meRes.data.id);
    loadMembers(tok);
    loadPins(tok);
  }

  async function loadMembers(tok: string) {
    try {
      const res = await api.get(`/api/v1/workspaces/${workspaceId}/channels/${channelId}/members`, tok) as { data: ChannelMember[] };
      setMembers(res.data ?? []);
    } catch {}
  }

  async function loadPins(tok: string) {
    try {
      const res = await api.get(`/api/v1/workspaces/${workspaceId}/channels/${channelId}/pins`, tok) as { data: PinnedMsg[] };
      setPins(res.data ?? []);
    } catch {}
  }

  async function handleUnpin(messageId: string) {
    try {
      await api.delete(`/api/v1/channels/${channelId}/messages/${messageId}/pin`, token);
      setPins(prev => prev.filter(p => p.message_id !== messageId));
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  }

  async function save() {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await api.put(`/api/v1/workspaces/${workspaceId}/channels/${channelId}`, {
        name: name.trim(),
        description: desc.trim() || null,
      }, token);
      Alert.alert('Saved', 'Channel updated.');
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setSaving(false);
    }
  }

  async function archive() {
    Alert.alert('Archive channel', 'This will hide the channel for all members.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Archive', style: 'destructive',
        onPress: async () => {
          try {
            await api.post(`/api/v1/workspaces/${workspaceId}/channels/${channelId}/archive`, {}, token);
            onDeleted();
          } catch (e: any) {
            Alert.alert('Error', e.message);
          }
        },
      },
    ]);
  }

  async function leave() {
    Alert.alert('Leave channel', 'You will no longer receive messages from this channel.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Leave', style: 'destructive',
        onPress: async () => {
          try {
            await api.post(`/api/v1/workspaces/${workspaceId}/channels/${channelId}/leave`, {}, token);
            onDeleted();
          } catch (e: any) {
            Alert.alert('Error', e.message);
          }
        },
      },
    ]);
  }

  async function removeMember(userId: string) {
    try {
      await api.delete(`/api/v1/workspaces/${workspaceId}/channels/${channelId}/members/${userId}`, token);
      setMembers(prev => prev.filter(m => m.user_id !== userId));
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.headerBtn} activeOpacity={0.7}>
          <Text style={styles.backIcon}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Channel Settings</Text>
        <View style={styles.headerBtn} />
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        {/* Info section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Channel Info</Text>

          <Text style={styles.label}>Name</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="channel-name"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
          />

          <Text style={styles.label}>Description</Text>
          <TextInput
            style={[styles.input, styles.inputMulti]}
            value={desc}
            onChangeText={setDesc}
            placeholder="What is this channel for?"
            placeholderTextColor={colors.textMuted}
            multiline
            numberOfLines={3}
          />

          <TouchableOpacity
            style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
            onPress={save}
            disabled={saving}
            activeOpacity={0.85}
          >
            {saving
              ? <ActivityIndicator color="#fff" size="small" />
              : <Text style={styles.saveBtnText}>Save changes</Text>}
          </TouchableOpacity>
        </View>

        {/* Members section */}
        {members.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Members ({members.length})</Text>
            {members.map(m => (
              <View key={m.user_id} style={styles.memberRow}>
                <View style={styles.memberAvatar}>
                  <Text style={styles.memberInitials}>
                    {(m.user?.full_name || m.user?.username || '?').slice(0, 2).toUpperCase()}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.memberName}>{m.user?.full_name || m.user?.username}</Text>
                  <Text style={styles.memberRole}>{m.role}</Text>
                </View>
                {m.user_id !== myUserId && (
                  <TouchableOpacity onPress={() => removeMember(m.user_id)} activeOpacity={0.7}>
                    <Text style={styles.removeBtn}>Remove</Text>
                  </TouchableOpacity>
                )}
              </View>
            ))}
          </View>
        )}

        {/* Pinned messages */}
        {pins.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>📌 Pinned Messages ({pins.length})</Text>
            {pins.map(p => {
              const content = p.message?.content ?? '(message unavailable)';
              const sender = p.message?.sender?.full_name || p.message?.sender?.username || 'Unknown';
              return (
                <View key={p.message_id} style={styles.pinRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.pinSender}>{sender}</Text>
                    <Text style={styles.pinContent} numberOfLines={2}>{content}</Text>
                  </View>
                  <TouchableOpacity onPress={() => handleUnpin(p.message_id)} activeOpacity={0.7}>
                    <Text style={styles.unpinBtn}>Unpin</Text>
                  </TouchableOpacity>
                </View>
              );
            })}
          </View>
        )}

        {/* Danger zone */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Danger Zone</Text>
          <TouchableOpacity style={styles.dangerBtn} onPress={archive} activeOpacity={0.8}>
            <Text style={styles.dangerBtnText}>Archive Channel</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.dangerBtn, { marginTop: 10 }]} onPress={leave} activeOpacity={0.8}>
            <Text style={styles.dangerBtnText}>Leave Channel</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  headerBtn: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: 16, fontWeight: '700', color: colors.textPrimary },
  backIcon: { fontSize: 22, color: colors.accent },

  scroll: { padding: spacing.lg, gap: spacing.lg, paddingBottom: 60 },
  section: {
    backgroundColor: colors.surface, borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.border,
    padding: spacing.md,
  },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: spacing.md },

  label: { fontSize: 11, fontWeight: '600', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 },
  input: {
    backgroundColor: colors.bg, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border,
    color: colors.textPrimary, fontSize: 15, paddingHorizontal: spacing.md, paddingVertical: 11,
    marginBottom: spacing.md,
  },
  inputMulti: { height: 72, textAlignVertical: 'top', paddingTop: 11 },

  saveBtn: {
    backgroundColor: colors.accent, borderRadius: radius.md, paddingVertical: 13, alignItems: 'center',
  },
  saveBtnDisabled: { opacity: 0.5 },
  saveBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },

  memberRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.border },
  memberAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.accentDim, justifyContent: 'center', alignItems: 'center' },
  memberInitials: { fontSize: 13, fontWeight: '700', color: colors.accent },
  memberName: { fontSize: 14, fontWeight: '600', color: colors.textPrimary },
  memberRole: { fontSize: 12, color: colors.textMuted, textTransform: 'capitalize' },
  removeBtn: { fontSize: 13, color: colors.danger, fontWeight: '600' },

  dangerBtn: {
    borderWidth: 1, borderColor: colors.danger + '66',
    borderRadius: radius.md, paddingVertical: 12, alignItems: 'center',
    backgroundColor: colors.danger + '11',
  },
  dangerBtnText: { fontSize: 14, fontWeight: '700', color: colors.danger },

  pinRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md,
    paddingVertical: 10, borderTopWidth: 1, borderTopColor: colors.border,
  },
  pinSender: { fontSize: 13, fontWeight: '700', color: colors.textPrimary, marginBottom: 2 },
  pinContent: { fontSize: 13, color: colors.textSecondary, lineHeight: 18 },
  unpinBtn: { fontSize: 13, color: colors.danger, fontWeight: '600', paddingTop: 2 },
});
