import React from 'react';
import {
  View, Text, TouchableOpacity, TouchableHighlight,
  StyleSheet, Alert,
} from 'react-native';
import { colors, spacing, radius } from '../theme/tokens';

export interface Reaction {
  emoji: string;
  user_id: string;
  message_id: string;
}

export interface MsgSender {
  id: string;
  username: string;
  full_name: string;
  avatar_url?: string | null;
}

export interface Message {
  id: string;
  content: string;
  sender_id: string;
  sender?: MsgSender;
  created_at: string;
  is_edited?: boolean;
  reply_count?: number;
  reactions?: Reaction[];
  parent_id?: string | null;
}

interface Props {
  msg: Message;
  myUserId: string;
  onReact: (msgId: string, emoji: string) => void;
  onRemoveReact: (msgId: string, emoji: string) => void;
  onReply?: (msg: Message) => void;
  onEdit?: (msg: Message) => void;
  onDelete?: (msgId: string) => void;
  onLongPress?: (msg: Message) => void;
  showThread?: boolean;
}

function groupReactions(reactions: Reaction[], myUserId: string): { emoji: string; count: number; mine: boolean }[] {
  const map = new Map<string, { count: number; mine: boolean }>();
  for (const r of reactions) {
    const existing = map.get(r.emoji);
    if (existing) {
      existing.count++;
      if (r.user_id === myUserId) existing.mine = true;
    } else {
      map.set(r.emoji, { count: 1, mine: r.user_id === myUserId });
    }
  }
  return Array.from(map.entries()).map(([emoji, v]) => ({ emoji, ...v }));
}

function formatTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
}

export function MessageBubble({
  msg, myUserId, onReact, onRemoveReact, onReply, onEdit, onDelete, onLongPress, showThread,
}: Props) {
  const isMe = msg.sender_id === myUserId;
  const sender = msg.sender;
  const name = sender?.full_name || sender?.username || 'Unknown';
  const initials = name.slice(0, 2).toUpperCase();
  const grouped = groupReactions(msg.reactions ?? [], myUserId);

  function handleLongPress() {
    if (onLongPress) { onLongPress(msg); return; }
    const options: { text: string; onPress: () => void }[] = [
      { text: '✏️ Edit', onPress: () => onEdit?.(msg) },
      { text: '🗑 Delete', onPress: () => onDelete?.(msg.id) },
      { text: '↩️ Reply in thread', onPress: () => onReply?.(msg) },
      { text: 'Cancel', onPress: () => {} },
    ];
    const filtered = isMe ? options : options.filter(o => !o.text.includes('Edit') && !o.text.includes('Delete'));
    Alert.alert(
      'Message',
      undefined,
      filtered.map(o => ({ text: o.text, onPress: o.onPress, style: o.text === 'Cancel' ? 'cancel' : 'default' })),
    );
  }

  return (
    <TouchableHighlight
      underlayColor={colors.surfaceHigh}
      onLongPress={handleLongPress}
      style={styles.wrapper}
    >
      <View style={styles.row}>
        {/* Avatar */}
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initials}</Text>
        </View>

        {/* Bubble content */}
        <View style={styles.content}>
          <View style={styles.nameRow}>
            <Text style={[styles.name, isMe && styles.nameMe]}>{isMe ? 'You' : name}</Text>
            <Text style={styles.time}>{formatTime(msg.created_at)}</Text>
            {msg.is_edited && <Text style={styles.edited}> (edited)</Text>}
          </View>

          <View style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleThem]}>
            <Text style={[styles.text, isMe && styles.textMe]}>{msg.content}</Text>
          </View>

          {/* Reactions */}
          {grouped.length > 0 && (
            <View style={styles.reactions}>
              {grouped.map(r => (
                <TouchableOpacity
                  key={r.emoji}
                  style={[styles.reactionChip, r.mine && styles.reactionMine]}
                  onPress={() => r.mine ? onRemoveReact(msg.id, r.emoji) : onReact(msg.id, r.emoji)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.reactionEmoji}>{r.emoji}</Text>
                  {r.count > 1 && <Text style={styles.reactionCount}>{r.count}</Text>}
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* Thread reply count */}
          {showThread && (msg.reply_count ?? 0) > 0 && (
            <TouchableOpacity onPress={() => onReply?.(msg)} activeOpacity={0.7} style={styles.threadRow}>
              <Text style={styles.threadText}>
                {msg.reply_count} {msg.reply_count === 1 ? 'reply' : 'replies'}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </TouchableHighlight>
  );
}

const styles = StyleSheet.create({
  wrapper: { paddingHorizontal: spacing.md, paddingVertical: 3 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  avatar: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: colors.accentDim, justifyContent: 'center', alignItems: 'center', marginTop: 2,
    flexShrink: 0,
  },
  avatarText: { fontSize: 12, fontWeight: '700', color: colors.accent },
  content: { flex: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 3 },
  name: { fontSize: 13, fontWeight: '700', color: colors.textSecondary },
  nameMe: { color: colors.accent },
  time: { fontSize: 11, color: colors.textMuted },
  edited: { fontSize: 11, color: colors.textMuted, fontStyle: 'italic' },
  bubble: {
    borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 8,
    alignSelf: 'flex-start', maxWidth: '90%',
  },
  bubbleThem: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  bubbleMe: { backgroundColor: colors.accentDim, borderWidth: 1, borderColor: colors.accent + '33' },
  text: { fontSize: 15, color: colors.textPrimary, lineHeight: 21 },
  textMe: { color: colors.textPrimary },
  reactions: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 4 },
  reactionChip: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: colors.surface, borderRadius: 12,
    paddingHorizontal: 8, paddingVertical: 3,
    borderWidth: 1, borderColor: colors.border,
  },
  reactionMine: { borderColor: colors.accent, backgroundColor: colors.accentDim },
  reactionEmoji: { fontSize: 14 },
  reactionCount: { fontSize: 12, color: colors.textSecondary, fontWeight: '600' },
  threadRow: { marginTop: 4 },
  threadText: { fontSize: 12, color: colors.accent, fontWeight: '600' },
});
