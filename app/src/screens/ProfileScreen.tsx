import React from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet,
  TextInput, Alert, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../lib/supabase';
import { api, API_BASE_URL } from '../lib/api';
import { pickImage } from '../lib/imagePicker';
import { colors, spacing, radius } from '../theme/tokens';

interface UserProfile {
  id: string;
  username: string;
  full_name: string;
  bio: string | null;
  avatar_url: string | null;
}

interface Props { onBack: () => void; }

const STATUS_OPTIONS = [
  { value: 'online',  label: 'Online',        emoji: '🟢' },
  { value: 'away',    label: 'Away',           emoji: '🟡' },
  { value: 'dnd',     label: 'Do not disturb', emoji: '🔴' },
  { value: 'offline', label: 'Invisible',      emoji: '⚫' },
];

export function ProfileScreen({ onBack }: Props) {
  const [loading,  setLoading]  = React.useState(true);
  const [saving,   setSaving]   = React.useState(false);
  const [token,    setToken]    = React.useState('');
  const [fullName, setFullName] = React.useState('');
  const [username, setUsername] = React.useState('');
  const [bio,      setBio]      = React.useState('');
  const [status,   setStatus]   = React.useState('online');

  React.useEffect(() => { init(); }, []);

  async function init() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const tok = session.access_token;
    setToken(tok);
    try {
      const res = await api.get('/api/v1/users/me', tok) as { data: UserProfile };
      setFullName(res.data.full_name || '');
      setUsername(res.data.username  || '');
      setBio(res.data.bio            || '');
    } catch {}
    finally { setLoading(false); }
  }

  async function save() {
    setSaving(true);
    try {
      await api.put('/api/v1/users/me', { full_name: fullName.trim(), username: username.trim(), bio: bio.trim() }, token);
      await api.put('/api/v1/presence/me', { status }, token);
      Alert.alert('Saved', 'Profile updated.');
    } catch (e: any) { Alert.alert('Error', e.message); }
    finally { setSaving(false); }
  }

  function uploadAvatar() {
    pickImage(async asset => {
      const form = new FormData();
      form.append('file', { uri: asset.uri, name: asset.fileName, type: asset.type } as any);
      try {
        const res  = await fetch(`${API_BASE_URL}/api/v1/users/me/avatar/upload`, {
          method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form,
        });
        const json = await res.json();
        if (!json.data) throw new Error(json.error || 'Upload failed');
        Alert.alert('Updated', 'Avatar changed!');
      } catch (e: any) { Alert.alert('Upload failed', e.message); }
    });
  }

  async function signOut() {
    Alert.alert('Sign out', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => supabase.auth.signOut() },
    ]);
  }

  const initials = (fullName || username || '?').slice(0, 2).toUpperCase();

  if (loading) {
    return <SafeAreaView style={styles.safe}><View style={styles.center}><ActivityIndicator color={colors.accent} size="large" /></View></SafeAreaView>;
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.orb} />
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.headerBtn} activeOpacity={0.7}>
          <Text style={styles.backIcon}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Profile</Text>
        <TouchableOpacity onPress={save} style={styles.saveBtn} disabled={saving} activeOpacity={0.8}>
          {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.saveBtnText}>Save</Text>}
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.avatarSection}>
          <TouchableOpacity onPress={uploadAvatar} activeOpacity={0.8}>
            <View style={styles.avatarWrap}>
              <View style={styles.avatar}><Text style={styles.avatarText}>{initials}</Text></View>
              <View style={styles.editBadge}><Text style={styles.editBadgeText}>✎</Text></View>
            </View>
          </TouchableOpacity>
          <Text style={styles.avatarHint}>Tap to change photo</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Personal Info</Text>
          <Text style={styles.label}>Full Name</Text>
          <TextInput style={styles.input} value={fullName} onChangeText={setFullName} placeholder="Your name" placeholderTextColor={colors.textMuted} />
          <Text style={styles.label}>Username</Text>
          <TextInput style={styles.input} value={username} onChangeText={setUsername} placeholder="username" placeholderTextColor={colors.textMuted} autoCapitalize="none" />
          <Text style={styles.label}>Bio</Text>
          <TextInput style={[styles.input, styles.inputMulti]} value={bio} onChangeText={setBio} placeholder="Tell your team about yourself" placeholderTextColor={colors.textMuted} multiline numberOfLines={3} />
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Status</Text>
          <View style={styles.statusGrid}>
            {STATUS_OPTIONS.map(s => (
              <TouchableOpacity
                key={s.value}
                style={[styles.statusOpt, status === s.value && styles.statusOptActive]}
                onPress={() => setStatus(s.value)}
                activeOpacity={0.75}
              >
                <Text style={styles.statusEmoji}>{s.emoji}</Text>
                <Text style={[styles.statusLabel, status === s.value && { color: colors.textPrimary }]}>{s.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <TouchableOpacity style={styles.signOutBtn} onPress={signOut} activeOpacity={0.8}>
          <Text style={styles.signOutText}>Sign Out</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  orb:    { position: 'absolute', top: -80, right: -60, width: 260, height: 260, borderRadius: 999, backgroundColor: colors.accent, opacity: 0.07 },
  scroll: { padding: spacing.lg, paddingBottom: 60, gap: spacing.lg },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  headerBtn:   { width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '800', color: colors.textPrimary },
  backIcon:    { fontSize: 22, color: colors.accent },
  saveBtn:     { backgroundColor: colors.accent, borderRadius: radius.md, paddingHorizontal: 16, paddingVertical: 8 },
  saveBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },

  avatarSection: { alignItems: 'center', paddingVertical: spacing.lg },
  avatarWrap:    { position: 'relative' },
  avatar: {
    width: 100, height: 100, borderRadius: 50,
    backgroundColor: colors.accentDim, borderWidth: 3, borderColor: colors.accent + '55',
    justifyContent: 'center', alignItems: 'center',
    shadowColor: colors.accent, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.5, shadowRadius: 20, elevation: 10,
  },
  avatarText:    { fontSize: 38, fontWeight: '800', color: colors.accent },
  editBadge:     { position: 'absolute', bottom: 2, right: 2, width: 28, height: 28, borderRadius: 14, backgroundColor: colors.accent, justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: colors.bg },
  editBadgeText: { fontSize: 12, color: '#fff' },
  avatarHint:    { fontSize: 12, color: colors.textMuted, marginTop: 8 },

  card:      { backgroundColor: colors.surface, borderRadius: radius.card, borderWidth: 1, borderColor: colors.border, padding: spacing.md, marginBottom: spacing.md },
  cardTitle: { fontSize: 11, fontWeight: '700', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: spacing.md },

  label: { fontSize: 11, fontWeight: '700', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 6, marginTop: spacing.sm },
  input: {
    backgroundColor: colors.bg, borderRadius: radius.input, borderWidth: 1, borderColor: colors.border,
    color: colors.textPrimary, fontSize: 15, paddingHorizontal: spacing.md, paddingVertical: 12,
  },
  inputMulti: { height: 80, textAlignVertical: 'top', paddingTop: 12 },

  statusGrid:      { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: spacing.sm },
  statusOpt:       { width: '47%', flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.bg, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12, paddingVertical: 10 },
  statusOptActive: { borderColor: colors.accent, backgroundColor: colors.accentDim },
  statusEmoji:     { fontSize: 16 },
  statusLabel:     { fontSize: 13, fontWeight: '600', color: colors.textSecondary },

  signOutBtn:  { backgroundColor: colors.danger + '18', borderRadius: radius.card, borderWidth: 1, borderColor: colors.danger + '44', paddingVertical: 15, alignItems: 'center' },
  signOutText: { fontSize: 15, fontWeight: '700', color: colors.danger },
});
