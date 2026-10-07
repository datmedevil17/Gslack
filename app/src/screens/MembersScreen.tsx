import React from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, FlatList,
  ActivityIndicator, Alert, TextInput, Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../lib/supabase';
import { api } from '../lib/api';
import { colors, spacing, radius } from '../theme/tokens';

interface Member {
  workspace_id: string;
  user_id: string;
  role: string;
  is_active: boolean;
  user: { id: string; username: string; full_name: string; email: string; avatar_url: string | null };
}

interface Props {
  workspaceId: string;
  workspaceName: string;
  onBack: () => void;
}

const ROLE_ORDER = ['owner', 'admin', 'member', 'guest'];

export function MembersScreen({ workspaceId, workspaceName, onBack }: Props) {
  const [members, setMembers]     = React.useState<Member[]>([]);
  const [loading, setLoading]     = React.useState(true);
  const [selected, setSelected]   = React.useState<Member | null>(null);
  const [inviteEmail, setInviteEmail] = React.useState('');
  const [inviting, setInviting]   = React.useState(false);
  const [myUserID, setMyUserID]   = React.useState('');

  React.useEffect(() => { load(); }, []);

  async function getToken() {
    const { data: { session } } = await supabase.auth.getSession();
    if (session) setMyUserID(session.user.id);
    return session?.access_token ?? '';
  }

  async function load() {
    setLoading(true);
    try {
      const token = await getToken();
      const res = await api.get(`/api/v1/workspaces/${workspaceId}/members`, token) as { data: Member[] };
      const sorted = (res.data ?? []).sort((a, b) =>
        ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role),
      );
      setMembers(sorted);
    } catch (e: any) {
      console.error('members load:', e.message);
    } finally {
      setLoading(false);
    }
  }

  async function changeRole(member: Member, role: string) {
    try {
      const token = await getToken();
      await api.put(`/api/v1/workspaces/${workspaceId}/members/${member.user_id}/role`, { role }, token);
      setMembers(prev => prev.map(m => m.user_id === member.user_id ? { ...m, role } : m));
      setSelected(null);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  }

  async function removeMember(member: Member) {
    Alert.alert(
      'Remove member',
      `Remove ${member.user?.username ?? 'this user'} from the workspace?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove', style: 'destructive', onPress: async () => {
            try {
              const token = await getToken();
              await api.delete(`/api/v1/workspaces/${workspaceId}/members/${member.user_id}`, token);
              setMembers(prev => prev.filter(m => m.user_id !== member.user_id));
              setSelected(null);
            } catch (e: any) {
              Alert.alert('Error', e.message);
            }
          },
        },
      ],
    );
  }

  async function sendInvite() {
    if (!inviteEmail.trim()) return;
    setInviting(true);
    try {
      const token = await getToken();
      await api.post(`/api/v1/workspaces/${workspaceId}/members/invite`, { email: inviteEmail.trim() }, token);
      Alert.alert('Invite sent', `An invite was sent to ${inviteEmail.trim()}`);
      setInviteEmail('');
    } catch (e: any) {
      // Backend is a stub — show invite code hint instead
      Alert.alert('Tip', 'Share the workspace invite code from Settings to invite members.');
    } finally {
      setInviting(false);
    }
  }

  function renderMember({ item }: { item: Member }) {
    const name = item.user?.full_name || item.user?.username || '?';
    const initials = name.slice(0, 2).toUpperCase();
    const isMe = item.user_id === myUserID;
    const isOwner = item.role === 'owner';

    return (
      <TouchableOpacity
        key={item.user_id}
        style={styles.row}
        onPress={() => !isMe && !isOwner && setSelected(item)}
        activeOpacity={isMe || isOwner ? 1 : 0.7}
      >
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initials}</Text>
        </View>
        <View style={styles.rowBody}>
          <Text style={styles.rowName}>{name}{isMe ? ' (you)' : ''}</Text>
          <Text style={styles.rowEmail}>{item.user?.email}</Text>
        </View>
        <View style={[styles.roleBadge, styles[`role_${item.role}` as keyof typeof styles] as any]}>
          <Text style={styles.roleText}>{item.role}</Text>
        </View>
      </TouchableOpacity>
    );
  }

  // Group by role for section headers
  const grouped = ROLE_ORDER.reduce<{ role: string; members: Member[] }[]>((acc, role) => {
    const group = members.filter(m => m.role === role);
    if (group.length > 0) acc.push({ role, members: group });
    return acc;
  }, []);

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn} activeOpacity={0.7}>
          <Text style={styles.backIcon}>←</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Members ({members.length})</Text>
        <View style={styles.backBtn} />
      </View>

      {/* Invite row */}
      <View style={styles.inviteBar}>
        <TextInput
          style={styles.inviteInput}
          value={inviteEmail}
          onChangeText={setInviteEmail}
          placeholder="Email address"
          placeholderTextColor={colors.textMuted}
          keyboardType="email-address"
          autoCapitalize="none"
        />
        <TouchableOpacity
          style={[styles.inviteBtn, (!inviteEmail.trim() || inviting) && styles.inviteBtnDisabled]}
          onPress={sendInvite}
          disabled={!inviteEmail.trim() || inviting}
          activeOpacity={0.8}
        >
          {inviting ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.inviteBtnText}>Invite</Text>}
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.accent} size="large" /></View>
      ) : (
        <FlatList
          data={grouped}
          keyExtractor={g => g.role}
          renderItem={({ item: group }) => (
            <View>
              <Text style={styles.groupHeader}>{group.role.toUpperCase()}</Text>
              {group.members.map(m => renderMember({ item: m }))}
            </View>
          )}
          contentContainerStyle={styles.listContent}
        />
      )}

      {/* ── Action sheet for selected member ── */}
      <Modal visible={!!selected} transparent animationType="slide" onRequestClose={() => setSelected(null)}>
        <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={() => setSelected(null)} />
        {selected && (
          <View style={styles.sheet}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetName}>{selected.user?.full_name || selected.user?.username}</Text>
            <Text style={styles.sheetRole}>Current role: {selected.role}</Text>

            {selected.role !== 'admin' && (
              <TouchableOpacity style={styles.sheetAction} onPress={() => changeRole(selected, 'admin')} activeOpacity={0.8}>
                <Text style={styles.sheetActionText}>Make admin</Text>
              </TouchableOpacity>
            )}
            {selected.role !== 'member' && (
              <TouchableOpacity style={styles.sheetAction} onPress={() => changeRole(selected, 'member')} activeOpacity={0.8}>
                <Text style={styles.sheetActionText}>Make member</Text>
              </TouchableOpacity>
            )}
            <View style={styles.sheetDivider} />
            <TouchableOpacity style={styles.sheetAction} onPress={() => removeMember(selected)} activeOpacity={0.8}>
              <Text style={[styles.sheetActionText, { color: colors.danger }]}>Remove from workspace</Text>
            </TouchableOpacity>
          </View>
        )}
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  backBtn: { width: 40, height: 40, justifyContent: 'center' },
  backIcon: { fontSize: 22, color: colors.accent },
  title: { fontSize: 17, fontWeight: '700', color: colors.textPrimary },

  inviteBar: {
    flexDirection: 'row', gap: spacing.sm,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  inviteInput: {
    flex: 1, backgroundColor: colors.surface, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border, color: colors.textPrimary,
    fontSize: 14, paddingHorizontal: spacing.md, paddingVertical: 10,
  },
  inviteBtn: { backgroundColor: colors.accent, borderRadius: radius.md, paddingHorizontal: 16, justifyContent: 'center' },
  inviteBtnDisabled: { opacity: 0.5 },
  inviteBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },

  listContent: { paddingBottom: 40 },
  groupHeader: {
    fontSize: 11, fontWeight: '700', color: colors.textMuted, textTransform: 'uppercase',
    letterSpacing: 0.8, paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: 8,
  },

  row: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: spacing.lg, paddingVertical: 12, gap: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  avatar: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: colors.accentDim, justifyContent: 'center', alignItems: 'center',
  },
  avatarText: { fontSize: 14, fontWeight: '700', color: colors.accent },
  rowBody: { flex: 1 },
  rowName: { fontSize: 15, fontWeight: '600', color: colors.textPrimary },
  rowEmail: { fontSize: 12, color: colors.textSecondary, marginTop: 1 },

  roleBadge: { borderRadius: 4, paddingHorizontal: 8, paddingVertical: 3 },
  roleText: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase' },
  role_owner: { backgroundColor: 'rgba(124,92,255,0.2)' },
  role_admin: { backgroundColor: 'rgba(54,191,250,0.15)' },
  role_member: { backgroundColor: colors.surface },
  role_guest: { backgroundColor: 'rgba(247,144,9,0.15)' },

  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' },
  sheet: {
    backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: spacing.lg, paddingBottom: 40, borderWidth: 1, borderColor: colors.border,
  },
  sheetHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center', marginBottom: spacing.md },
  sheetName: { fontSize: 17, fontWeight: '700', color: colors.textPrimary },
  sheetRole: { fontSize: 13, color: colors.textSecondary, marginTop: 4, marginBottom: spacing.md },
  sheetDivider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.sm },
  sheetAction: { paddingVertical: 14 },
  sheetActionText: { fontSize: 15, fontWeight: '500', color: colors.textPrimary },
});
