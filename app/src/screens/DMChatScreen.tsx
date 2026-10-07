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

interface DMParticipant {
  user_id: string;
  user?: { id: string; username: string; full_name: string };
}

interface DMConvo {
  id: string;
  is_group: boolean;
  name?: string | null;
  participants?: DMParticipant[];
}

// Backend DM messages use conversation_id instead of channel_id
interface DMMsg {
  id: string;
  conversation_id: string;
  sender_id: string;
  sender?: { id: string; username: string; full_name: string };
  content: string;
  is_edited?: boolean;
  created_at: string;
  reactions?: any[];
}

function dmMsgToMsg(m: DMMsg): Message {
  return {
    id: m.id,
    content: m.content,
    sender_id: m.sender_id,
    sender: m.sender ? {
      id: m.sender.id,
      username: m.sender.username,
      full_name: m.sender.full_name,
    } : undefined,
    created_at: m.created_at,
    is_edited: m.is_edited,
    reactions: m.reactions ?? [],
  };
}

interface Props {
  convo: DMConvo;
  myUserId: string;
  onBack: () => void;
}

export function DMChatScreen({ convo, myUserId, onBack }: Props) {
  const isGroup = convo.is_group;
  const [messages, setMessages] = React.useState<Message[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [text, setText] = React.useState('');
  const [sending, setSending] = React.useState(false);
  const [token, setToken] = React.useState('');
  const [emojiTarget, setEmojiTarget] = React.useState<string | null>(null);
  const [editingMsg, setEditingMsg] = React.useState<Message | null>(null);

  const wsCleanup = React.useRef<(() => void) | null>(null);

  React.useEffect(() => {
    init();
    return () => {
      wsManager.leaveRoom(`dm:${convo.id}`);
      wsCleanup.current?.();
    };
  }, []);

  async function init() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const tok = session.access_token;
    setToken(tok);
    wsManager.connect(tok);
    wsManager.joinRoom(`dm:${convo.id}`);
    loadMessages(tok);
    wsCleanup.current = setupWs();
  }

  function setupWs(): () => void {
    const offNew = wsManager.on('message.new', (payload: DMMsg) => {
      if (payload.conversation_id !== convo.id) return;
      const msg = dmMsgToMsg(payload);
      setMessages(prev => prev.find(m => m.id === msg.id) ? prev : [msg, ...prev]);
    });
    const offUpdate = wsManager.on('message.update', (payload: DMMsg) => {
      const msg = dmMsgToMsg(payload);
      setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, ...msg } : m));
    });
    const offDelete = wsManager.on('message.delete', (payload: { id: string }) => {
      setMessages(prev => prev.filter(m => m.id !== payload.id));
    });
    const offReactAdd = wsManager.on('reaction.add', (payload: any) => {
      setMessages(prev => prev.map(m => {
        if (m.id !== payload.message_id) return m;
        const already = (m.reactions ?? []).some(r => r.emoji === payload.emoji && r.user_id === payload.user_id);
        if (already) return m;
        return { ...m, reactions: [...(m.reactions ?? []), payload] };
      }));
    });
    const offReactRemove = wsManager.on('reaction.remove', (payload: any) => {
      setMessages(prev => prev.map(m => {
        if (m.id !== payload.message_id) return m;
        return { ...m, reactions: (m.reactions ?? []).filter(r => !(r.emoji === payload.emoji && r.user_id === payload.user_id)) };
      }));
    });
    return () => { offNew(); offUpdate(); offDelete(); offReactAdd(); offReactRemove(); };
  }

  async function loadMessages(tok: string) {
    setLoading(true);
    try {
      const base = isGroup ? `/api/v1/group-dm/${convo.id}/messages` : `/api/v1/dm/${convo.id}/messages`;
      const res = await api.get(base, tok) as { data: DMMsg[] };
      const msgs = (res.data ?? []).map(dmMsgToMsg).reverse();
      setMessages(msgs);
    } catch (e: any) {
      console.error('DM load messages:', e.message);
    } finally {
      setLoading(false);
    }
  }

  async function send() {
    const content = text.trim();
    if (!content || sending) return;

    if (editingMsg) {
      const base = isGroup
        ? `/api/v1/group-dm/${convo.id}/messages/${editingMsg.id}`
        : `/api/v1/dm/${convo.id}/messages/${editingMsg.id}`;
      try {
        await api.put(base, { content }, token);
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
      const base = isGroup ? `/api/v1/group-dm/${convo.id}/messages` : `/api/v1/dm/${convo.id}/messages`;
      await api.post(base, { content }, token);
      setText('');
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setSending(false);
    }
  }

  async function handleDelete(msgId: string) {
    Alert.alert('Delete message', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          const base = isGroup
            ? `/api/v1/group-dm/${convo.id}/messages/${msgId}`
            : `/api/v1/dm/${convo.id}/messages/${msgId}`;
          try {
            await api.delete(base, token);
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
    ];
    if (isMe) {
      opts.push({ text: '✏️ Edit', onPress: () => { setEditingMsg(msg); setText(msg.content); } });
      opts.push({ text: '🗑 Delete', style: 'destructive', onPress: () => handleDelete(msg.id) });
    }
    opts.push({ text: 'Cancel', style: 'cancel', onPress: () => {} });
    Alert.alert('Message options', undefined, opts);
  }

  async function handleReact(msgId: string, emoji: string) {
    const optimistic = { emoji, user_id: myUserId, message_id: msgId, created_at: new Date().toISOString() };
    setMessages(prev => prev.map(m => {
      if (m.id !== msgId) return m;
      const already = (m.reactions ?? []).some(r => r.emoji === emoji && r.user_id === myUserId);
      if (already) return m;
      return { ...m, reactions: [...(m.reactions ?? []), optimistic] };
    }));
    const base = isGroup
      ? `/api/v1/group-dm/${convo.id}/messages/${msgId}/reactions`
      : `/api/v1/dm/${convo.id}/messages/${msgId}/reactions`;
    try {
      await api.post(base, { emoji }, token);
    } catch {
      setMessages(prev => prev.map(m => {
        if (m.id !== msgId) return m;
        return { ...m, reactions: (m.reactions ?? []).filter(r => !(r.emoji === emoji && r.user_id === myUserId)) };
      }));
    }
  }

  async function handleRemoveReact(msgId: string, emoji: string) {
    setMessages(prev => prev.map(m => {
      if (m.id !== msgId) return m;
      return { ...m, reactions: (m.reactions ?? []).filter(r => !(r.emoji === emoji && r.user_id === myUserId)) };
    }));
    const base = isGroup
      ? `/api/v1/group-dm/${convo.id}/messages/${msgId}/reactions/${encodeURIComponent(emoji)}`
      : `/api/v1/dm/${convo.id}/messages/${msgId}/reactions/${encodeURIComponent(emoji)}`;
    try {
      await api.delete(base, token);
    } catch {
      const reverted = { emoji, user_id: myUserId, message_id: msgId, created_at: new Date().toISOString() };
      setMessages(prev => prev.map(m => {
        if (m.id !== msgId) return m;
        return { ...m, reactions: [...(m.reactions ?? []), reverted] };
      }));
    }
  }

  function chatTitle() {
    if (isGroup) {
      if (convo.name) return convo.name;
      const others = (convo.participants ?? [])
        .filter(p => p.user_id !== myUserId)
        .map(p => p.user?.full_name || p.user?.username || '?');
      return others.join(', ') || 'Group DM';
    }
    const other = convo.participants?.find(p => p.user_id !== myUserId)?.user;
    return other?.full_name || other?.username || 'DM';
  }

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.headerBtn} activeOpacity={0.7}>
          <Text style={styles.backIcon}>←</Text>
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerIcon}>{isGroup ? '👥' : '💬'}</Text>
          <Text style={styles.headerName} numberOfLines={1}>{chatTitle()}</Text>
        </View>
        <View style={styles.headerBtn} />
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        {loading && messages.length === 0 ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.accent} />
          </View>
        ) : (
          <FlatList
            data={messages}
            keyExtractor={m => m.id}
            renderItem={({ item }) => (
              <MessageBubble
                msg={item}
                myUserId={myUserId}
                onReact={handleReact}
                onRemoveReact={handleRemoveReact}
                onLongPress={handleLongPress}
              />
            )}
            inverted
            contentContainerStyle={styles.listContent}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyText}>No messages yet. Say hello!</Text>
              </View>
            }
          />
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
            onChangeText={setText}
            placeholder="Message…"
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
  headerCenter: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  headerIcon: { fontSize: 16 },
  headerName: { fontSize: 16, fontWeight: '700', color: colors.textPrimary },

  listContent: { paddingVertical: spacing.sm },
  emptyContainer: { flex: 1, alignItems: 'center', paddingTop: 60 },
  emptyText: { fontSize: 14, color: colors.textMuted },

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
    paddingHorizontal: spacing.md, paddingVertical: 10, maxHeight: 120,
  },
  sendBtn: {
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: colors.accent, justifyContent: 'center', alignItems: 'center',
  },
  sendBtnDisabled: { opacity: 0.4 },
  sendIcon: { fontSize: 18, color: '#fff', fontWeight: '700' },
});
