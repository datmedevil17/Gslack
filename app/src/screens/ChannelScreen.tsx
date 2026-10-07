import React from 'react';
import {
  View, Text, TextInput, TouchableOpacity, FlatList,
  StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../lib/supabase';
import { api } from '../lib/api';
import { wsManager } from '../lib/ws';
import { MessageBubble, Message } from '../components/MessageBubble';
import { EmojiPicker } from '../components/EmojiPicker';
import { colors, spacing, radius } from '../theme/tokens';

interface Props {
  channelId: string;
  channelName: string;
  workspaceId: string;
  onBack: () => void;
  onOpenThread: (msg: Message) => void;
  onOpenSettings: () => void;
}

export function ChannelScreen({
  channelId, channelName, workspaceId, onBack, onOpenThread, onOpenSettings,
}: Props) {
  const [messages, setMessages] = React.useState<Message[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [text, setText] = React.useState('');
  const [sending, setSending] = React.useState(false);
  const [myUserId, setMyUserId] = React.useState('');
  const [token, setToken] = React.useState('');
  const [typingUsers, setTypingUsers] = React.useState<string[]>([]);
  const [emojiTarget, setEmojiTarget] = React.useState<string | null>(null);
  const [editingMsg, setEditingMsg] = React.useState<Message | null>(null);

  const typingTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const listRef = React.useRef<FlatList>(null);

  React.useEffect(() => {
    init();
  }, []);

  async function init() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const tok = session.access_token;
    setToken(tok);

    const meRes = await api.get('/api/v1/users/me', tok) as { data: { id: string } };
    setMyUserId(meRes.data.id);

    wsManager.connect(tok);
    wsManager.joinRoom(`channel:${channelId}`);

    loadMessages(tok);
    setupWs();
  }

  function setupWs() {
    const offNew = wsManager.on('message.new', (payload: Message) => {
      if (payload.channel_id !== channelId && (payload as any).channel_id !== channelId) return;
      setMessages(prev => {
        if (prev.find(m => m.id === payload.id)) return prev;
        return [payload, ...prev];
      });
    });

    const offUpdate = wsManager.on('message.update', (payload: Message) => {
      setMessages(prev => prev.map(m => m.id === payload.id ? { ...m, ...payload } : m));
    });

    const offDelete = wsManager.on('message.delete', (payload: { id: string }) => {
      setMessages(prev => prev.filter(m => m.id !== payload.id));
    });

    const offReactAdd = wsManager.on('reaction.add', (payload: any) => {
      setMessages(prev => prev.map(m => {
        if (m.id !== payload.message_id) return m;
        const reactions = [...(m.reactions ?? []), payload];
        return { ...m, reactions };
      }));
    });

    const offReactRemove = wsManager.on('reaction.remove', (payload: any) => {
      setMessages(prev => prev.map(m => {
        if (m.id !== payload.message_id) return m;
        const reactions = (m.reactions ?? []).filter(
          r => !(r.emoji === payload.emoji && r.user_id === payload.user_id)
        );
        return { ...m, reactions };
      }));
    });

    const offTyping = wsManager.on('typing', (payload: any) => {
      const name = payload.username || payload.user_id;
      setTypingUsers(prev => prev.includes(name) ? prev : [...prev, name]);
      setTimeout(() => setTypingUsers(prev => prev.filter(u => u !== name)), 3000);
    });

    return () => { offNew(); offUpdate(); offDelete(); offReactAdd(); offReactRemove(); offTyping(); };
  }

  async function loadMessages(tok: string, before?: string) {
    setLoading(true);
    try {
      const qs = before ? `?before=${before}&limit=50` : '?limit=50';
      const res = await api.get(`/api/v1/channels/${channelId}/messages${qs}`, tok) as { data: Message[] };
      const msgs = res.data ?? [];
      if (before) {
        setMessages(prev => [...prev, ...msgs]);
      } else {
        setMessages(msgs);
      }
    } catch (e: any) {
      console.error('load messages:', e.message);
    } finally {
      setLoading(false);
    }
  }

  function handleTyping() {
    wsManager.sendTyping(`channel:${channelId}`);
    if (typingTimer.current) clearTimeout(typingTimer.current);
  }

  async function send() {
    const content = text.trim();
    if (!content || sending) return;

    if (editingMsg) {
      try {
        await api.put(`/api/v1/channels/${channelId}/messages/${editingMsg.id}`, { content }, token);
        setMessages(prev => prev.map(m => m.id === editingMsg.id ? { ...m, content, is_edited: true } : m));
        setEditingMsg(null);
        setText('');
      } catch (e: any) {
        Alert.alert('Error', e.message);
      }
      return;
    }

    setSending(true);
    try {
      await api.post(`/api/v1/channels/${channelId}/messages`, {
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

  async function handleDelete(msgId: string) {
    Alert.alert('Delete message', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          try {
            await api.delete(`/api/v1/channels/${channelId}/messages/${msgId}`, token);
            setMessages(prev => prev.filter(m => m.id !== msgId));
          } catch (e: any) {
            Alert.alert('Error', e.message);
          }
        },
      },
    ]);
  }

  function handleLongPress(msg: Message) {
    const isMe = msg.sender_id === myUserId;
    const opts: { text: string; onPress: () => void; style?: 'cancel' | 'destructive' | 'default' }[] = [
      { text: '😀 React', onPress: () => setEmojiTarget(msg.id) },
      { text: '↩️ Thread', onPress: () => onOpenThread(msg) },
    ];
    if (isMe) {
      opts.push({ text: '✏️ Edit', onPress: () => { setEditingMsg(msg); setText(msg.content); } });
      opts.push({ text: '🗑 Delete', style: 'destructive', onPress: () => handleDelete(msg.id) });
    }
    opts.push({ text: 'Cancel', style: 'cancel', onPress: () => {} });
    Alert.alert('Message options', undefined, opts);
  }

  const typingLabel = typingUsers.length > 0
    ? `${typingUsers.join(', ')} ${typingUsers.length === 1 ? 'is' : 'are'} typing…`
    : null;

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.headerBtn} activeOpacity={0.7}>
          <Text style={styles.backIcon}>←</Text>
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerHash}>#</Text>
          <Text style={styles.headerName} numberOfLines={1}>{channelName}</Text>
        </View>
        <TouchableOpacity onPress={onOpenSettings} style={styles.headerBtn} activeOpacity={0.7}>
          <Text style={styles.settingsIcon}>⚙</Text>
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={0}>
        {loading && messages.length === 0 ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.accent} />
          </View>
        ) : (
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={m => m.id}
            renderItem={({ item }) => (
              <MessageBubble
                msg={item}
                myUserId={myUserId}
                onReact={handleReact}
                onRemoveReact={handleRemoveReact}
                onReply={onOpenThread}
                onEdit={m => { setEditingMsg(m); setText(m.content); }}
                onDelete={handleDelete}
                onLongPress={handleLongPress}
                showThread
              />
            )}
            inverted
            contentContainerStyle={styles.listContent}
            onEndReached={() => {
              if (messages.length >= 50) {
                const oldest = messages[messages.length - 1];
                loadMessages(token, oldest.created_at);
              }
            }}
            onEndReachedThreshold={0.3}
          />
        )}

        {typingLabel && (
          <View style={styles.typingBar}>
            <Text style={styles.typingText}>{typingLabel}</Text>
          </View>
        )}

        {/* Edit banner */}
        {editingMsg && (
          <View style={styles.editBanner}>
            <Text style={styles.editLabel}>Editing message</Text>
            <TouchableOpacity onPress={() => { setEditingMsg(null); setText(''); }}>
              <Text style={styles.editCancel}>✕</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Input */}
        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            value={text}
            onChangeText={t => { setText(t); handleTyping(); }}
            placeholder={`Message #${channelName}`}
            placeholderTextColor={colors.textMuted}
            multiline
            returnKeyType="default"
          />
          <TouchableOpacity
            style={[styles.sendBtn, (!text.trim() || sending) && styles.sendBtnDisabled]}
            onPress={send}
            disabled={!text.trim() || sending}
            activeOpacity={0.8}
          >
            {sending
              ? <ActivityIndicator color="#fff" size="small" />
              : <Text style={styles.sendIcon}>{editingMsg ? '✓' : '↑'}</Text>}
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
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: spacing.sm, paddingVertical: spacing.sm,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  headerBtn: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
  backIcon: { fontSize: 22, color: colors.accent },
  settingsIcon: { fontSize: 18, color: colors.textSecondary },
  headerCenter: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 },
  headerHash: { fontSize: 18, color: colors.textMuted },
  headerName: { fontSize: 16, fontWeight: '700', color: colors.textPrimary },

  listContent: { paddingVertical: spacing.sm },

  typingBar: { paddingHorizontal: spacing.md, paddingVertical: 4 },
  typingText: { fontSize: 12, color: colors.textMuted, fontStyle: 'italic' },

  editBanner: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: colors.accentDim, paddingHorizontal: spacing.md, paddingVertical: 6,
    borderTopWidth: 1, borderTopColor: colors.accent + '44',
  },
  editLabel: { fontSize: 13, color: colors.accent, fontWeight: '600' },
  editCancel: { fontSize: 16, color: colors.accent },

  inputRow: {
    flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderTopWidth: 1, borderTopColor: colors.border,
  },
  input: {
    flex: 1, backgroundColor: colors.surface, borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.border,
    color: colors.textPrimary, fontSize: 15,
    paddingHorizontal: spacing.md, paddingVertical: 10,
    maxHeight: 120,
  },
  sendBtn: {
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: colors.accent, justifyContent: 'center', alignItems: 'center',
  },
  sendBtnDisabled: { opacity: 0.4 },
  sendIcon: { fontSize: 18, color: '#fff', fontWeight: '700' },
});
