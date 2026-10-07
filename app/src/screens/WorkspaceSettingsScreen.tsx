import React from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  ActivityIndicator, Alert, TextInput, Switch, Image, Clipboard,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../lib/supabase';
import { api, API_BASE_URL } from '../lib/api';
import { pickImage } from '../lib/imagePicker';
import { colors, spacing, radius } from '../theme/tokens';

interface Workspace {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  logo_url: string | null;
  is_public: boolean;
}

interface WsSettings {
  allow_guest_access: boolean;
  allow_public_channels: boolean;
  allow_direct_messages: boolean;
}

interface Props {
  workspaceId: string;
  workspaceName: string;
  onBack: () => void;
  onDeleted: () => void;
}

export function WorkspaceSettingsScreen({ workspaceId, workspaceName: initialName, onBack, onDeleted }: Props) {
  const [workspace, setWorkspace]   = React.useState<Workspace | null>(null);
  const [settings, setSettings]     = React.useState<WsSettings | null>(null);
  const [inviteCode, setInviteCode] = React.useState('');
  const [loading, setLoading]       = React.useState(true);
  const [saving, setSaving]         = React.useState(false);
  const [uploading, setUploading]   = React.useState(false);

  const [editName, setEditName]   = React.useState('');
  const [editDesc, setEditDesc]   = React.useState('');

  React.useEffect(() => { load(); }, []);

  async function getToken() {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token ?? '';
  }

  async function load() {
    setLoading(true);
    try {
      const token = await getToken();
      const [wsRes, stRes, invRes] = await Promise.all([
        api.get(`/api/v1/workspaces/${workspaceId}`, token) as Promise<{ data: Workspace }>,
        api.get(`/api/v1/workspaces/${workspaceId}/settings`, token) as Promise<{ data: WsSettings }>,
        api.get(`/api/v1/workspaces/${workspaceId}/invite-link`, token) as Promise<{ invite_code: string }>,
      ]);
      setWorkspace(wsRes.data);
      setEditName(wsRes.data.name);
      setEditDesc(wsRes.data.description ?? '');
      setSettings(stRes.data);
      setInviteCode(invRes.invite_code);
    } catch (e: any) {
      console.error('settings load:', e.message);
    } finally {
      setLoading(false);
    }
  }

  async function saveInfo() {
    setSaving(true);
    try {
      const token = await getToken();
      const res = await api.put(`/api/v1/workspaces/${workspaceId}`, {
        name: editName.trim(),
        description: editDesc.trim() || null,
      }, token) as { data: Workspace };
      setWorkspace(res.data);
      Alert.alert('Saved', 'Workspace updated.');
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setSaving(false);
    }
  }

  function uploadLogo() {
    pickImage(async asset => {
      setUploading(true);
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;
        const form = new FormData();
        form.append('file', { uri: asset.uri, name: asset.fileName, type: asset.type } as any);
        const res = await fetch(`${API_BASE_URL}/api/v1/workspaces/${workspaceId}/avatar`, {
          method: 'PUT',
          headers: { Authorization: `Bearer ${session.access_token}` },
          body: form,
        });
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `Upload failed: ${res.status}`);
        const json = await res.json() as { data: Workspace };
        setWorkspace(json.data);
      } catch (e: any) {
        Alert.alert('Upload failed', e.message);
      } finally {
        setUploading(false);
      }
    });
  }

  async function toggleSetting(key: keyof WsSettings, value: boolean) {
    if (!settings) return;
    const next = { ...settings, [key]: value };
    setSettings(next);
    try {
      const token = await getToken();
      await api.put(`/api/v1/workspaces/${workspaceId}/settings`, { [key]: value }, token);
    } catch (e: any) {
      setSettings(settings);
      Alert.alert('Error', e.message);
    }
  }

  async function resetInviteCode() {
    try {
      const token = await getToken();
      const res = await api.post(`/api/v1/workspaces/${workspaceId}/invite-link/reset`, {}, token) as { invite_code: string };
      setInviteCode(res.invite_code);
      Alert.alert('Done', 'Invite link regenerated.');
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  }

  function copyCode() {
    Clipboard.setString(inviteCode);
    Alert.alert('Copied', 'Invite code copied to clipboard.');
  }

  function confirmDelete() {
    Alert.alert(
      'Delete workspace',
      `"${workspace?.name}" and all its channels and messages will be permanently deleted.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: deleteWorkspace },
      ],
    );
  }

  async function deleteWorkspace() {
    try {
      const token = await getToken();
      await api.delete(`/api/v1/workspaces/${workspaceId}`, token);
      onDeleted();
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}><ActivityIndicator color={colors.accent} size="large" /></View>
      </SafeAreaView>
    );
  }

  const logoLetter = (workspace?.name ?? initialName)[0]?.toUpperCase() ?? '?';

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn} activeOpacity={0.7}>
          <Text style={styles.backIcon}>←</Text>
          <Text style={styles.backLabel}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Settings</Text>
        <View style={styles.backBtn} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* ── Logo ── */}
        <View style={styles.logoSection}>
          <TouchableOpacity onPress={uploadLogo} activeOpacity={0.8} style={styles.logoWrap}>
            {uploading ? (
              <View style={styles.logoFallback}><ActivityIndicator color={colors.accent} /></View>
            ) : workspace?.logo_url ? (
              <Image source={{ uri: workspace.logo_url }} style={styles.logo} />
            ) : (
              <View style={styles.logoFallback}>
                <Text style={styles.logoLetter}>{logoLetter}</Text>
              </View>
            )}
            <View style={styles.logoEditBadge}><Text style={styles.logoEditIcon}>✎</Text></View>
          </TouchableOpacity>
          <Text style={styles.logoHint}>Tap to change logo</Text>
        </View>

        {/* ── Info ── */}
        <Section title="Workspace info">
          <FieldRow label="Name">
            <TextInput
              style={styles.input}
              value={editName}
              onChangeText={setEditName}
              placeholderTextColor={colors.textMuted}
            />
          </FieldRow>
          <FieldRow label="Description" last>
            <TextInput
              style={[styles.input, { minHeight: 56, textAlignVertical: 'top' }]}
              value={editDesc}
              onChangeText={setEditDesc}
              placeholder="Optional"
              placeholderTextColor={colors.textMuted}
              multiline
            />
          </FieldRow>
        </Section>

        <TouchableOpacity
          style={[styles.saveBtn, saving && { opacity: 0.6 }]}
          onPress={saveInfo}
          disabled={saving}
          activeOpacity={0.85}
        >
          {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>Save changes</Text>}
        </TouchableOpacity>

        {/* ── Invite link ── */}
        <Section title="Invite link">
          <View style={styles.inviteRow}>
            <Text style={styles.inviteCode} numberOfLines={1}>{inviteCode}</Text>
            <TouchableOpacity onPress={copyCode} style={styles.copyBtn} activeOpacity={0.8}>
              <Text style={styles.copyBtnText}>Copy</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity style={styles.resetBtn} onPress={resetInviteCode} activeOpacity={0.8}>
            <Text style={styles.resetBtnText}>Reset invite link</Text>
          </TouchableOpacity>
        </Section>

        {/* ── Settings ── */}
        {settings && (
          <Section title="Access & features">
            <ToggleRow
              label="Guest access"
              value={settings.allow_guest_access}
              onChange={v => toggleSetting('allow_guest_access', v)}
            />
            <ToggleRow
              label="Public channels"
              value={settings.allow_public_channels}
              onChange={v => toggleSetting('allow_public_channels', v)}
            />
            <ToggleRow
              label="Direct messages"
              value={settings.allow_direct_messages}
              onChange={v => toggleSetting('allow_direct_messages', v)}
              last
            />
          </Section>
        )}

        {/* ── Danger zone ── */}
        <Section title="Danger zone">
          <TouchableOpacity style={styles.deleteRow} onPress={confirmDelete} activeOpacity={0.8}>
            <Text style={styles.deleteText}>Delete workspace</Text>
          </TouchableOpacity>
        </Section>

      </ScrollView>
    </SafeAreaView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.card}>{children}</View>
    </View>
  );
}

function FieldRow({ label, children, last }: { label: string; children: React.ReactNode; last?: boolean }) {
  return (
    <View style={[styles.fieldRow, !last && styles.fieldBorder]}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {children}
    </View>
  );
}

function ToggleRow({ label, value, onChange, last }: { label: string; value: boolean; onChange: (v: boolean) => void; last?: boolean }) {
  return (
    <View style={[styles.toggleRow, !last && styles.fieldBorder]}>
      <Text style={styles.toggleLabel}>{label}</Text>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ false: colors.border, true: colors.accent }}
        thumbColor="#fff"
      />
    </View>
  );
}

const LOGO_SIZE = 88;

const styles = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scroll: { paddingBottom: 60 },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, width: 70 },
  backIcon: { fontSize: 20, color: colors.accent },
  backLabel: { fontSize: 15, color: colors.accent, fontWeight: '500' },
  headerTitle: { fontSize: 16, fontWeight: '700', color: colors.textPrimary },

  logoSection: { alignItems: 'center', paddingVertical: spacing.xl },
  logoWrap: { position: 'relative' },
  logo: { width: LOGO_SIZE, height: LOGO_SIZE, borderRadius: 20 },
  logoFallback: {
    width: LOGO_SIZE, height: LOGO_SIZE, borderRadius: 20,
    backgroundColor: colors.accentDim, justifyContent: 'center', alignItems: 'center',
  },
  logoLetter: { fontSize: 36, fontWeight: '700', color: colors.accent },
  logoEditBadge: {
    position: 'absolute', bottom: -4, right: -4,
    width: 26, height: 26, borderRadius: 13,
    backgroundColor: colors.accent, justifyContent: 'center', alignItems: 'center',
    borderWidth: 2, borderColor: colors.bg,
  },
  logoEditIcon: { fontSize: 12, color: '#fff' },
  logoHint: { marginTop: spacing.sm, fontSize: 12, color: colors.textMuted },

  section: { marginHorizontal: spacing.lg, marginBottom: spacing.md },
  sectionTitle: { fontSize: 11, fontWeight: '700', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8, marginLeft: 4 },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },

  fieldRow: { paddingHorizontal: spacing.md, paddingVertical: 10 },
  fieldBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
  fieldLabel: { fontSize: 11, fontWeight: '600', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
  input: { fontSize: 15, color: colors.textPrimary },

  toggleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.md, paddingVertical: 13 },
  toggleLabel: { fontSize: 15, color: colors.textPrimary },

  saveBtn: {
    marginHorizontal: spacing.lg, marginBottom: spacing.lg,
    backgroundColor: colors.accent, borderRadius: radius.md,
    paddingVertical: 14, alignItems: 'center',
    shadowColor: colors.accent, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 10, elevation: 6,
  },
  saveBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },

  inviteRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.md, paddingVertical: spacing.md, gap: spacing.sm },
  inviteCode: { flex: 1, fontSize: 14, color: colors.textSecondary, fontFamily: 'monospace' },
  copyBtn: { backgroundColor: colors.accentDim, borderRadius: radius.sm, paddingHorizontal: 12, paddingVertical: 6 },
  copyBtnText: { fontSize: 13, fontWeight: '600', color: colors.accent },
  resetBtn: { paddingHorizontal: spacing.md, paddingBottom: spacing.md },
  resetBtnText: { fontSize: 13, color: colors.textMuted },

  deleteRow: { paddingHorizontal: spacing.md, paddingVertical: 15 },
  deleteText: { fontSize: 15, fontWeight: '600', color: colors.danger },
});
