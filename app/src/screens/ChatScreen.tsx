import React from 'react';
import {
  View, Text, TextInput, TouchableOpacity, FlatList,
  StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator,
  Alert, Modal, Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../lib/supabase';
import { api, API_BASE_URL } from '../lib/api';
import { pickImage } from '../lib/imagePicker';
import { wsManager } from '../lib/ws';
import { MessageBubble, Message } from '../components/MessageBubble';
import { EmojiPicker } from '../components/EmojiPicker';
import { colors, spacing, radius, shadows } from '../theme/tokens';

const SLASH_COMMANDS = [
  { cmd: '/summarize', desc: 'Summarize this channel with AI' },
  { cmd: '/ai',        desc: 'Ask the AI assistant anything' },
  { cmd: '/remind',    desc: 'Set a reminder' },
  { cmd: '/poll',      desc: 'Create a poll' },
];

interface Props {
  channelId: string;
  channelName: string;
  channelDesc?: string | null;
  workspaceId: string;
  onBack: () => void;
  onOpenThread: (msg: Message) => void;
  onOpenSettings: () => void;
}

export function ChatScreen({
  channelId, channelName, channelDesc, workspaceId, onBack, onOpenThread, onOpenSettings,
}: Props) {
  const [messages, setMessages] = React.useState<Message[]>([]);
  const [loading, setLoading]   = React.useState(true);
  const [text, setText]         = React.useState('');
  const [sending, setSending]   = React.useState(false);
  const [myUserId, setMyUserId] = React.useState('');
  const [token, setToken]       = React.useState('');
  const [typingUsers, setTypingUsers] = React.useState<string[]>([]);
  const [emojiTarget, setEmojiTarget] = React.useState<string | null>(null);
  const [editingMsg, setEditingMsg]   = React.useState<Message | null>(null);

  // Action sheet
  const [actionMsg, setActionMsg] = React.useState<Message | null>(null);
  const actionAnim = React.useRef(new Animated.Value(0)).current;

  // Slash commands
  const showSlash = text.startsWith('/') && !text.includes(' ');
  const filteredCmds = SLASH_COMMANDS.filter(c => c.cmd.startsWith(text));

  // AI summary
  const [summarizing, setSummarizing] = React.useState(false);
  const [attaching, setAttaching]     = React.useState(false);

  const typingTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const wsCleanup = React.useRef<(() => void) | null>(null);

  React.useEffect(() => {
    init();
    return () => {
      wsManager.leaveRoom(`channel:${channelId}`);
      wsCleanup.current?.();
    };
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
    wsCleanup.current = setupWs();
  }

  function setupWs(): () => void {
    const offNew = wsManager.on('message.new', (payload: any) => {
      if (payload.channel_id !== channelId) return;
      if (payload.parent_id) {
        // Thread reply — increment parent's reply count instead of adding to list
        setMessages(prev => prev.map(m =>
          m.id === payload.parent_id ? { ...m, reply_count: (m.reply_count ?? 0) + 1 } : m
        ));
        return;
      }
      setMessages(prev => prev.find(m => m.id === payload.id) ? prev : [payload, ...prev]);
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
    const offTyping = wsManager.on('typing', (payload: any) => {
      const name = payload.username || payload.user_id?.slice(0, 6);
      setTypingUsers(prev => prev.includes(name) ? prev : [...prev, name]);
      setTimeout(() => setTypingUsers(prev => prev.filter(u => u !== name)), 3000);
    });
    return () => { offNew(); offUpdate(); offDelete(); offReactAdd(); offReactRemove(); offTyping(); };
  }

  async function loadMessages(tok: string, before?: string) {
    setLoading(true);
    try {
      const qs  = before ? `?before=${before}&limit=50` : '?limit=50';
      const res = await api.get(`/api/v1/channels/${channelId}/messages${qs}`, tok) as { data: Message[] };
      if (before) setMessages(prev => [...prev, ...(res.data ?? [])]);
      else        setMessages(res.data ?? []);
    } catch (e: any) { console.error('load msgs:', e.message); }
    finally { setLoading(false); }
  }

  async function send() {
    const content = text.trim();
    if (!content || sending) return;

    // AI slash commands
    if (content === '/summarize' || content.startsWith('/summarize ')) {
      setText('');
      setSummarizing(true);
      try {
        const res = await api.post(`/api/v1/ai/summarize/${channelId}`, {}, token) as { summary: string };
        Alert.alert('Channel Summary', res.summary);
      } catch (e: any) { Alert.alert('Error', e.message); }
      finally { setSummarizing(false); }
      return;
    }
    if (content.startsWith('/ai ')) {
      const question = content.slice(4).trim();
      setText('');
      if (!question) return;
      try {
        const res = await api.post('/api/v1/ai/chat', { message: question }, token) as { reply: string };
        Alert.alert('AI', res.reply);
      } catch (e: any) { Alert.alert('Error', e.message); }
      return;
    }

    if (editingMsg) {
      try {
        await api.put(`/api/v1/channels/${channelId}/messages/${editingMsg.id}`, { content }, token);
        setMessages(prev => prev.map(m => m.id === editingMsg.id ? { ...m, content, is_edited: true } : m));
        setEditingMsg(null); setText('');
      } catch (e: any) { Alert.alert('Error', e.message); }
      return;
    }

    setSending(true);
    try {
      await api.post(`/api/v1/channels/${channelId}/messages`, { content, workspace_id: workspaceId }, token);
      setText('');
    } catch (e: any) { Alert.alert('Error', e.message); }
    finally { setSending(false); }
  }

  function attachFile() {
    pickImage(async asset => {
      setAttaching(true);
      try {
        const form = new FormData();
        form.append('file', { uri: asset.uri, name: asset.fileName ?? 'image.jpg', type: asset.type ?? 'image/jpeg' } as any);
        const res = await fetch(`${API_BASE_URL}/api/v1/files/upload?workspace_id=${workspaceId}`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: form,
        });
        const json = await res.json() as { data?: { public_url: string; file_name: string }; error?: string };
        if (!json.data) throw new Error(json.error ?? 'Upload failed');
        const { public_url, file_name } = json.data;
        await api.post(`/api/v1/channels/${channelId}/messages`, {
          content: `📎 [${file_name}](${public_url})`,
          workspace_id: workspaceId,
        }, token);
      } catch (e: any) {
        Alert.alert('Upload failed', e.message);
      } finally {
        setAttaching(false);
      }
    });
  }

  function handleTyping() {
    wsManager.sendTyping(`channel:${channelId}`);
    if (typingTimer.current) clearTimeout(typingTimer.current);
  }

  function openActionSheet(msg: Message) {
    setActionMsg(msg);
    Animated.spring(actionAnim, { toValue: 1, tension: 80, friction: 12, useNativeDriver: true }).start();
  }
  function closeActionSheet() {
    Animated.timing(actionAnim, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => setActionMsg(null));
  }

  async function handleReact(msgId: string, emoji: string) {
    const optimistic = { emoji, user_id: myUserId, message_id: msgId, created_at: new Date().toISOString() };
    setMessages(prev => prev.map(m => {
      if (m.id !== msgId) return m;
      const already = (m.reactions ?? []).some(r => r.emoji === emoji && r.user_id === myUserId);
      if (already) return m;
      return { ...m, reactions: [...(m.reactions ?? []), optimistic] };
    }));
    try {
      await api.post(`/api/v1/channels/${channelId}/messages/${msgId}/reactions`, { emoji }, token);
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
    try {
      await api.delete(`/api/v1/channels/${channelId}/messages/${msgId}/reactions/${encodeURIComponent(emoji)}`, token);
    } catch {
      const reverted = { emoji, user_id: myUserId, message_id: msgId, created_at: new Date().toISOString() };
      setMessages(prev => prev.map(m => {
        if (m.id !== msgId) return m;
        return { ...m, reactions: [...(m.reactions ?? []), reverted] };
      }));
    }
  }
  async function handleDelete(msgId: string) {
    Alert.alert('Delete', 'Delete this message?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try {
          await api.delete(`/api/v1/channels/${channelId}/messages/${msgId}`, token);
          setMessages(prev => prev.filter(m => m.id !== msgId));
        } catch (e: any) { Alert.alert('Error', e.message); }
      }},
    ]);
  }
  async function handlePin(msgId: string) {
    try {
      await api.post(`/api/v1/channels/${channelId}/messages/${msgId}/pin`, {}, token);
      Alert.alert('Pinned', 'Message pinned to channel.');
    } catch (e: any) { Alert.alert('Error', e.message); }
  }

  async function handleForward(msgId: string) {
    try {
      const res = await api.get(`/api/v1/workspaces/${workspaceId}/channels`, token) as { data: { id: string; name: string }[] };
      const channels = (res.data ?? []).filter(ch => ch.id !== channelId);
      if (channels.length === 0) { Alert.alert('No other channels', 'There are no other channels to forward to.'); return; }
      Alert.alert(
        'Forward to channel',
        'Select a channel:',
        [
          ...channels.slice(0, 6).map(ch => ({
            text: `#${ch.name}`,
            onPress: async () => {
              try {
                await api.post(`/api/v1/channels/${channelId}/messages/${msgId}/forward`, {
                  target_channel_id: ch.id,
                  workspace_id: workspaceId,
                }, token);
                Alert.alert('Forwarded', `Message forwarded to #${ch.name}`);
              } catch (e: any) { Alert.alert('Error', e.message); }
            },
          })),
          { text: 'Cancel', style: 'cancel' as const },
        ]
      );
    } catch (e: any) { Alert.alert('Error', e.message); }
  }

  const typingLabel = typingUsers.length > 0
    ? `${typingUsers.join(', ')} ${typingUsers.length === 1 ? 'is' : 'are'} typing…`
    : null;

  const slideStyle = {
    transform: [{ translateY: actionAnim.interpolate({ inputRange: [0, 1], outputRange: [300, 0] }) }],
  };

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.headerBtn} activeOpacity={0.7}>
          <Text style={styles.backIcon}>←</Text>
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <View style={styles.headerHashWrap}>
            <Text style={styles.headerHash}>#</Text>
          </View>
          <View>
            <Text style={styles.headerName} numberOfLines={1}>{channelName}</Text>
            {channelDesc && <Text style={styles.headerDesc} numberOfLines={1}>{channelDesc}</Text>}
          </View>
        </View>
        <View style={styles.headerRight}>
          {summarizing && <ActivityIndicator color={colors.accent} size="small" style={{ marginRight: 8 }} />}
          <TouchableOpacity onPress={onOpenSettings} style={styles.headerBtn} activeOpacity={0.7}>
            <Text style={styles.headerIcon}>⚙</Text>
          </TouchableOpacity>
        </View>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        {loading && messages.length === 0 ? (
          <View style={styles.center}><ActivityIndicator color={colors.accent} size="large" /></View>
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
                onReply={onOpenThread}
                onEdit={m => { setEditingMsg(m); setText(m.content); }}
                onDelete={handleDelete}
                onLongPress={openActionSheet}
                showThread
              />
            )}
            inverted
            contentContainerStyle={styles.list}
            onEndReached={() => {
              if (messages.length >= 50 && token) {
                const oldest = messages[messages.length - 1];
                loadMessages(token, oldest.created_at);
              }
            }}
            onEndReachedThreshold={0.3}
          />
        )}

        {typingLabel && (
          <View style={styles.typingBar}>
            <View style={styles.typingDots}>
              <View style={styles.typingDot} /><View style={styles.typingDot} /><View style={styles.typingDot} />
            </View>
            <Text style={styles.typingText}>{typingLabel}</Text>
          </View>
        )}

        {/* Slash command suggestions */}
        {showSlash && filteredCmds.length > 0 && (
          <View style={styles.slashMenu}>
            {filteredCmds.map(c => (
              <TouchableOpacity key={c.cmd} style={styles.slashRow} onPress={() => setText(c.cmd + ' ')} activeOpacity={0.7}>
                <Text style={styles.slashCmd}>{c.cmd}</Text>
                <Text style={styles.slashDesc}>{c.desc}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Edit banner */}
        {editingMsg && (
          <View style={styles.editBanner}>
            <Text style={styles.editLabel}>✏️ Editing message</Text>
            <TouchableOpacity onPress={() => { setEditingMsg(null); setText(''); }}>
              <Text style={styles.editCancel}>✕</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Composer */}
        <View style={styles.composer}>
          <TouchableOpacity
            style={styles.attachBtn}
            onPress={attachFile}
            disabled={attaching}
            activeOpacity={0.7}
          >
            {attaching
              ? <ActivityIndicator color={colors.accent} size="small" />
              : <Text style={styles.attachIcon}>📎</Text>}
          </TouchableOpacity>
          <TextInput
            style={styles.composerInput}
            value={text}
            onChangeText={t => { setText(t); handleTyping(); }}
            placeholder={`Message #${channelName}`}
            placeholderTextColor={colors.textMuted}
            multiline
          />
          <TouchableOpacity
            style={[styles.sendBtn, (!text.trim() || sending) && styles.sendBtnOff]}
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

      {/* Emoji picker */}
      <EmojiPicker
        visible={emojiTarget !== null}
        onSelect={emoji => { if (emojiTarget) handleReact(emojiTarget, emoji); setEmojiTarget(null); }}
        onClose={() => setEmojiTarget(null)}
      />

      {/* Action sheet */}
      {actionMsg && (
        <Modal visible transparent animationType="none" onRequestClose={closeActionSheet}>
          <TouchableOpacity style={styles.actionOverlay} activeOpacity={1} onPress={closeActionSheet} />
          <Animated.View style={[styles.actionSheet, slideStyle]}>
            <View style={styles.sheetHandle} />
            <View style={styles.actionGrid}>
              {[
                { icon: '😀', label: 'React',   onPress: () => { setEmojiTarget(actionMsg.id); closeActionSheet(); } },
                { icon: '↩️', label: 'Thread',  onPress: () => { onOpenThread(actionMsg); closeActionSheet(); } },
                { icon: '📌', label: 'Pin',     onPress: () => { handlePin(actionMsg.id); closeActionSheet(); } },
                { icon: '➡️', label: 'Forward', onPress: () => { handleForward(actionMsg.id); closeActionSheet(); } },
                ...(actionMsg.sender_id === myUserId ? [
                  { icon: '✏️', label: 'Edit',   onPress: () => { setEditingMsg(actionMsg); setText(actionMsg.content); closeActionSheet(); } },
                  { icon: '🗑', label: 'Delete', onPress: () => { handleDelete(actionMsg.id); closeActionSheet(); } },
                ] : []),
              ].map(a => (
                <TouchableOpacity key={a.label} style={styles.actionBtn} onPress={a.onPress} activeOpacity={0.7}>
                  <Text style={styles.actionIcon}>{a.icon}</Text>
                  <Text style={styles.actionLabel}>{a.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </Animated.View>
        </Modal>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: spacing.xs, paddingVertical: spacing.xs,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  headerBtn:    { width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
  backIcon:     { fontSize: 22, color: colors.accent },
  headerCenter: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  headerHashWrap: {
    width: 34, height: 34, borderRadius: 10, backgroundColor: colors.accentDim,
    justifyContent: 'center', alignItems: 'center',
  },
  headerHash:   { fontSize: 18, fontWeight: '800', color: colors.accent },
  headerName:   { fontSize: 15, fontWeight: '700', color: colors.textPrimary },
  headerDesc:   { fontSize: 11, color: colors.textMuted },
  headerRight:  { flexDirection: 'row', alignItems: 'center' },
  headerIcon:   { fontSize: 18, color: colors.textSecondary },

  list: { paddingVertical: spacing.sm },

  typingBar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: spacing.md, paddingVertical: 4 },
  typingDots: { flexDirection: 'row', gap: 3 },
  typingDot:  { width: 4, height: 4, borderRadius: 2, backgroundColor: colors.textMuted },
  typingText: { fontSize: 12, color: colors.textMuted, fontStyle: 'italic' },

  slashMenu: {
    backgroundColor: colors.surfaceHigh, borderTopWidth: 1, borderTopColor: colors.border,
    maxHeight: 160,
  },
  slashRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.md, paddingVertical: 10, gap: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
  slashCmd:  { fontSize: 14, fontWeight: '700', color: colors.accent },
  slashDesc: { fontSize: 13, color: colors.textSecondary },

  editBanner: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: colors.accentDim, paddingHorizontal: spacing.md, paddingVertical: 8,
    borderTopWidth: 1, borderTopColor: colors.accent + '33',
  },
  editLabel:  { fontSize: 13, color: colors.accent, fontWeight: '600' },
  editCancel: { fontSize: 16, color: colors.accent },

  composer: {
    flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderTopWidth: 1, borderTopColor: colors.border,
  },
  attachBtn:  { width: 36, height: 36, justifyContent: 'center', alignItems: 'center' },
  attachIcon: { fontSize: 20 },
  composerInput: {
    flex: 1, backgroundColor: colors.surfaceHigh, borderRadius: radius.input,
    borderWidth: 1, borderColor: colors.border,
    color: colors.textPrimary, fontSize: 15,
    paddingHorizontal: spacing.md, paddingVertical: 11, maxHeight: 120,
  },
  sendBtn:    { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.accent, justifyContent: 'center', alignItems: 'center', ...shadows.accent },
  sendBtnOff: { opacity: 0.35 },
  sendIcon:   { fontSize: 18, color: '#fff', fontWeight: '700' },

  actionOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' },
  actionSheet: {
    backgroundColor: colors.surfaceHigh, borderTopLeftRadius: radius.xxl, borderTopRightRadius: radius.xxl,
    paddingTop: spacing.sm, paddingBottom: 40, paddingHorizontal: spacing.lg,
    borderWidth: 1, borderColor: colors.border,
  },
  sheetHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center', marginBottom: spacing.md },
  actionGrid:  { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, justifyContent: 'center' },
  actionBtn:   { alignItems: 'center', gap: 6, width: 64 },
  actionIcon:  { fontSize: 28 },
  actionLabel: { fontSize: 12, fontWeight: '600', color: colors.textSecondary },
});
