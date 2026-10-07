import React from 'react';
import {
  View, Text, TextInput, TouchableOpacity, FlatList,
  StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../lib/supabase';
import { api } from '../lib/api';
import { wsManager } from '../lib/ws';
import { MessageBubble, Message } from '../components/MessageBubble';
import { EmojiPicker } from '../components/EmojiPicker';
import { colors, spacing, radius } from '../theme/tokens';

interface Props {
  parent: Message;
  channelId: string;
  workspaceId: string;
  onClose: () => void;
}

export function ThreadScreen({ parent, channelId, workspaceId, onClose }: Props) {
  const [replies, setReplies] = React.useState<Message[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [text, setText] = React.useState('');
  const [sending, setSending] = React.useState(false);
  const [myUserId, setMyUserId] = React.useState('');
  const [token, setToken] = React.useState('');
  const [emojiTarget, setEmojiTarget] = React.useState<string | null>(null);

  React.useEffect(() => {
    init();
    return () => {};
  }, []);

  async function init() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const tok = session.access_token;
    setToken(tok);
    const meRes = await api.get('/api/v1/users/me', tok) as { data: { id: string } };
    setMyUserId(meRes.data.id);
    loadReplies(tok);

    wsManager.on('message.new', (payload: Message) => {
      if (payload.parent_id !== parent.id) return;
      setReplies(prev => prev.find(m => m.id === payload.id) ? prev : [...prev, payload]);
    });
  }

  async function loadReplies(tok: string) {
    setLoading(true);
    try {
      const res = await api.get(`/api/v1/channels/${channelId}/messages/${parent.id}/thread`, tok) as { data: Message[] };
      setReplies((res.data ?? []).slice().reverse());
    } catch (e: any) {
      console.error('load replies:', e.message);
    } finally {
      setLoading(false);
    }
  }

  async function send() {
    const content = text.trim();
    if (!content || sending) return;
    setSending(true);
    try {
      await api.post(`/api/v1/channels/${channelId}/messages/${parent.id}/thread`, {
        content,
        workspace_id: workspaceId,
      }, token);
      setText('');
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setSending(false);
    }
  }

  async function handleReact(msgId: string, emoji: string) {
    try {
      await api.post(`/api/v1/channels/${channelId}/messages/${msgId}/reactions`, { emoji }, token);
    } catch {}
  }

  async function handleRemoveReact(msgId: string, emoji: string) {
    try {
      await api.delete(`/api/v1/channels/${channelId}/messages/${msgId}/reactions/${encodeURIComponent(emoji)}`, token);
    } catch {}
  }

  const senderName = parent.sender?.full_name || parent.sender?.username || 'Unknown';

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onClose} style={styles.headerBtn} activeOpacity={0.7}>
          <Text style={styles.closeIcon}>✕</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Thread</Text>
        <View style={styles.headerBtn} />
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        {/* Parent message */}
        <View style={styles.parentContainer}>
          <Text style={styles.parentLabel}>Original message</Text>
          <MessageBubble
            msg={parent}
            myUserId={myUserId}
            onReact={handleReact}
            onRemoveReact={handleRemoveReact}
          />
          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>
              {replies.length} {replies.length === 1 ? 'reply' : 'replies'}
            </Text>
            <View style={styles.dividerLine} />
          </View>
        </View>

        {/* Replies */}
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.accent} />
          </View>
        ) : (
          <FlatList
            data={replies}
            keyExtractor={m => m.id}
            renderItem={({ item }) => (
              <MessageBubble
                msg={item}
                myUserId={myUserId}
                onReact={handleReact}
                onRemoveReact={handleRemoveReact}
                onLongPress={m => setEmojiTarget(m.id)}
              />
            )}
            contentContainerStyle={styles.listContent}
            ListEmptyComponent={
              <Text style={styles.empty}>No replies yet. Be the first!</Text>
            }
          />
        )}

        {/* Input */}
        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            value={text}
            onChangeText={setText}
            placeholder={`Reply to ${senderName}…`}
            placeholderTextColor={colors.textMuted}
            multiline
          />
          <TouchableOpacity
            style={[styles.sendBtn, (!text.trim() || sending) && styles.sendBtnDisabled]}
            onPress={send}
            disabled={!text.trim() || sending}
            activeOpacity={0.8}
          >
            {sending
              ? <ActivityIndicator color="#fff" size="small" />
              : <Text style={styles.sendIcon}>↑</Text>}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      <EmojiPicker
        visible={emojiTarget !== null}
        onSelect={emoji => { if (emojiTarget) handleReact(emojiTarget, emoji); setEmojiTarget(null); }}
        onClose={() => setEmojiTarget(null)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  headerBtn: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: 16, fontWeight: '700', color: colors.textPrimary },
  closeIcon: { fontSize: 16, color: colors.textSecondary },

  parentContainer: { borderBottomWidth: 1, borderBottomColor: colors.border, paddingTop: spacing.sm },
  parentLabel: { fontSize: 11, fontWeight: '600', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, paddingHorizontal: spacing.md, marginBottom: 4 },

  divider: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.md, paddingVertical: spacing.sm, gap: 8 },
  dividerLine: { flex: 1, height: 1, backgroundColor: colors.border },
  dividerText: { fontSize: 12, color: colors.textMuted, fontWeight: '600' },

  listContent: { paddingVertical: spacing.sm, paddingBottom: spacing.lg },
  empty: { textAlign: 'center', color: colors.textMuted, marginTop: spacing.xl, fontSize: 14 },

  inputRow: {
    flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderTopWidth: 1, borderTopColor: colors.border,
  },
  input: {
    flex: 1, backgroundColor: colors.surface, borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.border,
    color: colors.textPrimary, fontSize: 15,
    paddingHorizontal: spacing.md, paddingVertical: 10, maxHeight: 100,
  },
  sendBtn: {
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: colors.accent, justifyContent: 'center', alignItems: 'center',
  },
  sendBtnDisabled: { opacity: 0.4 },
  sendIcon: { fontSize: 18, color: '#fff', fontWeight: '700' },
});
