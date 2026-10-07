import React from 'react';
import {
  View, Text, TouchableOpacity, FlatList, StyleSheet,
  ActivityIndicator, TextInput, ScrollView, SectionList, Animated,
  Modal, KeyboardAvoidingView, Platform, Alert,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../lib/supabase';
import { api } from '../lib/api';
import { wsManager } from '../lib/ws';
import { colors, spacing, radius, shadows } from '../theme/tokens';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Channel {
  id: string;
  name: string;
  description: string | null;
  type: string;
  is_archived: boolean;
  last_message_at: string | null;
}

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

interface Notification {
  id: string;
  type: string;
  content: string;
  is_read: boolean;
  created_at: string;
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  workspaceId: string;
  workspaceName: string;
  initialTab?: string;
  onBack: () => void;
  onOpenChannel: (id: string, name: string, desc?: string | null) => void;
  onOpenDMChat: (convo: DMConvo, myUserId: string) => void;
  onOpenSettings: () => void;
  onOpenProfile: () => void;
  onOpenMembers: () => void;
  onOpenFiles: () => void;
}

// ─── Tab constants ────────────────────────────────────────────────────────────

const TABS = [
  { key: 'channels', label: 'Channels', icon: '#' },
  { key: 'dms',      label: 'DMs',      icon: '💬' },
  { key: 'search',   label: 'Search',   icon: '⌕' },
  { key: 'notifs',   label: 'Activity', icon: '🔔' },
  { key: 'ai',       label: 'AI',       icon: '⚡' },
] as const;

type TabKey = typeof TABS[number]['key'];

// ─── AITabPanel (module-level so React never remounts it on parent re-render) ──

interface AITabPanelProps {
  aiMessages: { role: 'user' | 'assistant'; content: string }[];
  aiInput: string;
  aiLoading: boolean;
  setAiInput: (v: string) => void;
  sendAI: () => void;
}

function AITabPanel({ aiMessages, aiInput, aiLoading, setAiInput, sendAI }: AITabPanelProps) {
  const listRef = React.useRef<FlatList>(null);
  return (
    <View style={{ flex: 1 }}>
      {aiMessages.length === 0 && (
        <View style={styles.aiWelcome}>
          <View style={styles.aiOrb}>
            <Text style={styles.aiOrbText}>⚡</Text>
          </View>
          <Text style={styles.aiWelcomeTitle}>AI Assistant</Text>
          <Text style={styles.aiWelcomeSub}>Ask anything about your workspace</Text>
          <View style={styles.aiChips}>
            {['Summarize recent activity', 'Draft a message', 'Find something'].map(chip => (
              <TouchableOpacity key={chip} style={styles.aiChip} onPress={() => setAiInput(chip)} activeOpacity={0.7}>
                <Text style={styles.aiChipText}>{chip}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}
      {aiMessages.length > 0 && (
        <FlatList
          ref={listRef}
          data={aiMessages}
          keyExtractor={(_, i) => String(i)}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
          renderItem={({ item }) => (
            <View style={[styles.aiMsg, item.role === 'user' ? styles.aiMsgUser : styles.aiMsgAssistant]}>
              {item.role === 'assistant' && (
                <View style={styles.aiMsgIcon}><Text>⚡</Text></View>
              )}
              <View style={[styles.aiMsgBubble, item.role === 'user' ? styles.aiMsgBubbleUser : styles.aiMsgBubbleAssistant]}>
                <Text style={styles.aiMsgText}>{item.content}</Text>
              </View>
            </View>
          )}
          contentContainerStyle={[styles.tabContent, { paddingBottom: 80 }]}
        />
      )}
      <View style={styles.aiInputRow}>
        <TextInput
          style={styles.aiInput}
          value={aiInput}
          onChangeText={setAiInput}
          placeholder="Ask AI anything…"
          placeholderTextColor={colors.textMuted}
          onSubmitEditing={sendAI}
          returnKeyType="send"
          blurOnSubmit={false}
        />
        <TouchableOpacity
          style={[styles.aiSendBtn, (!aiInput.trim() || aiLoading) && styles.aiSendBtnOff]}
          onPress={sendAI}
          disabled={!aiInput.trim() || aiLoading}
          activeOpacity={0.8}
        >
          {aiLoading
            ? <ActivityIndicator color="#fff" size="small" />
            : <Text style={styles.aiSendIcon}>↑</Text>}
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── WorkspaceScreen ──────────────────────────────────────────────────────────

export function WorkspaceScreen({
  workspaceId, workspaceName, initialTab, onBack, onOpenChannel, onOpenDMChat,
  onOpenSettings, onOpenProfile, onOpenMembers, onOpenFiles,
}: Props) {
  const insets = useSafeAreaInsets();
  const [tab, setTab] = React.useState<TabKey>((initialTab as TabKey) ?? 'channels');
  const [myUserId, setMyUserId] = React.useState('');
  const [token, setToken]       = React.useState('');

  // Channels
  const [channels, setChannels] = React.useState<Channel[]>([]);
  const [chLoading, setChLoading] = React.useState(true);

  // DMs
  const [dms, setDms]       = React.useState<DMConvo[]>([]);
  const [groups, setGroups] = React.useState<DMConvo[]>([]);
  const [dmLoading, setDmLoading] = React.useState(true);

  // Search
  const [query, setQuery]   = React.useState('');
  const [srResults, setSrResults] = React.useState<{ messages: any[]; channels: any[]; users: any[] } | null>(null);
  const [srLoading, setSrLoading] = React.useState(false);

  // Notifications
  const [notifs, setNotifs]     = React.useState<Notification[]>([]);
  const [nLoading, setNLoading] = React.useState(true);
  const [unread, setUnread]     = React.useState(0);

  // AI
  const [aiMessages, setAiMessages] = React.useState<{ role: 'user' | 'assistant'; content: string }[]>([]);
  const [aiInput, setAiInput]       = React.useState('');
  const [aiLoading, setAiLoading]   = React.useState(false);

  // Create channel modal
  const [showCreateChannel, setShowCreateChannel] = React.useState(false);
  const [newChName, setNewChName]         = React.useState('');
  const [newChDesc, setNewChDesc]         = React.useState('');
  const [newChType, setNewChType]         = React.useState<'public' | 'private'>('public');
  const [creatingCh, setCreatingCh]       = React.useState(false);

  // Create DM modal
  const [showCreateDM, setShowCreateDM]   = React.useState(false);
  const [dmSearchQ, setDmSearchQ]         = React.useState('');
  const [dmSearchResults, setDmSearchResults] = React.useState<{ id: string; username: string; full_name: string }[]>([]);
  const [dmSearchLoading, setDmSearchLoading] = React.useState(false);
  const [creatingDM, setCreatingDM]       = React.useState(false);
  const dmSearchTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  // Group DM
  const [dmMode, setDmMode]               = React.useState<'direct' | 'group'>('direct');
  const [dmGroupName, setDmGroupName]     = React.useState('');
  const [selectedUsers, setSelectedUsers] = React.useState<{ id: string; username: string; full_name: string }[]>([]);
  const [creatingGroup, setCreatingGroup] = React.useState(false);

  React.useEffect(() => { init(); }, []);

  async function init() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const tok = session.access_token;
    setToken(tok);
    wsManager.connect(tok);
    const meRes = await api.get('/api/v1/users/me', tok) as { data: { id: string } };
    setMyUserId(meRes.data.id);
    loadChannels(tok);
    loadDMs(tok);
    loadNotifs(tok);
  }

  // Channels
  async function loadChannels(tok: string) {
    setChLoading(true);
    try {
      const res = await api.get(`/api/v1/workspaces/${workspaceId}/channels`, tok) as { data: Channel[] };
      setChannels(res.data ?? []);
    } catch {}
    finally { setChLoading(false); }
  }

  async function joinChannel(channelId: string, tok: string) {
    try {
      await api.post(`/api/v1/workspaces/${workspaceId}/channels/${channelId}/join`, {}, tok);
    } catch {}
  }

  // DMs
  async function loadDMs(tok: string) {
    setDmLoading(true);
    try {
      const [dmRes, grpRes] = await Promise.allSettled([
        api.get('/api/v1/dm', tok) as Promise<{ data: DMConvo[] }>,
        api.get('/api/v1/group-dm', tok) as Promise<{ data: DMConvo[] }>,
      ]);
      if (dmRes.status === 'fulfilled')  setDms(dmRes.value.data ?? []);
      if (grpRes.status === 'fulfilled') setGroups(grpRes.value.data ?? []);
    } catch {}
    finally { setDmLoading(false); }
  }

  // Notifications
  async function loadNotifs(tok: string) {
    setNLoading(true);
    try {
      const [nRes, ucRes] = await Promise.allSettled([
        api.get('/api/v1/notifications', tok) as Promise<{ data: Notification[] }>,
        api.get('/api/v1/notifications/unread-count', tok) as Promise<{ data: { count: number } }>,
      ]);
      if (nRes.status === 'fulfilled')  setNotifs(nRes.value.data ?? []);
      if (ucRes.status === 'fulfilled') setUnread(ucRes.value.data?.count ?? 0);
    } catch {}
    finally { setNLoading(false); }
  }

  async function markAllRead() {
    try {
      await api.put('/api/v1/notifications/read-all', {}, token);
      setNotifs(prev => prev.map(n => ({ ...n, is_read: true })));
      setUnread(0);
    } catch {}
  }

  // Search
  const searchTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  function handleSearch(q: string) {
    setQuery(q);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (!q.trim()) { setSrResults(null); return; }
    searchTimer.current = setTimeout(async () => {
      setSrLoading(true);
      try {
        const res = await api.get(`/api/v1/search?q=${encodeURIComponent(q)}`, token) as { data: { messages: any[]; channels: any[]; users: any[] } };
        setSrResults(res.data ?? { messages: [], channels: [], users: [] });
      } catch {} finally { setSrLoading(false); }
    }, 300);
  }

  // Create channel
  async function createChannel() {
    if (!newChName.trim()) return;
    setCreatingCh(true);
    try {
      const res = await api.post(`/api/v1/workspaces/${workspaceId}/channels`, {
        name: newChName.trim().toLowerCase().replace(/\s+/g, '-'),
        description: newChDesc.trim() || null,
        type: newChType,
      }, token) as { data: Channel };
      setChannels(prev => [...prev, res.data]);
      setShowCreateChannel(false);
      setNewChName(''); setNewChDesc(''); setNewChType('public');
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally { setCreatingCh(false); }
  }

  // DM user search
  function handleDMSearch(q: string) {
    setDmSearchQ(q);
    if (dmSearchTimer.current) clearTimeout(dmSearchTimer.current);
    if (!q.trim()) { setDmSearchResults([]); return; }
    dmSearchTimer.current = setTimeout(async () => {
      setDmSearchLoading(true);
      try {
        const res = await api.get(`/api/v1/users/search?q=${encodeURIComponent(q)}`, token) as { data: { id: string; username: string; full_name: string }[] };
        setDmSearchResults(res.data ?? []);
      } catch {} finally { setDmSearchLoading(false); }
    }, 300);
  }

  async function startDM(recipientId: string) {
    setCreatingDM(true);
    try {
      const res = await api.post('/api/v1/dm', { recipient_id: recipientId, workspace_id: workspaceId }, token) as { data: DMConvo };
      setShowCreateDM(false);
      setDmSearchQ(''); setDmSearchResults([]);
      onOpenDMChat(res.data, myUserId);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally { setCreatingDM(false); }
  }

  function toggleUserSelection(u: { id: string; username: string; full_name: string }) {
    setSelectedUsers(prev =>
      prev.find(x => x.id === u.id) ? prev.filter(x => x.id !== u.id) : [...prev, u]
    );
  }

  async function createGroupDM() {
    if (selectedUsers.length < 1) return;
    setCreatingGroup(true);
    try {
      const res = await api.post('/api/v1/group-dm', {
        name: dmGroupName.trim() || null,
        member_ids: selectedUsers.map(u => u.id),
        workspace_id: workspaceId,
      }, token) as { data: DMConvo };
      setShowCreateDM(false);
      setDmSearchQ(''); setDmSearchResults([]);
      setSelectedUsers([]); setDmGroupName(''); setDmMode('direct');
      onOpenDMChat(res.data, myUserId);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally { setCreatingGroup(false); }
  }

  // AI
  async function sendAI() {
    const content = aiInput.trim();
    if (!content || aiLoading) return;
    const userMsg = { role: 'user' as const, content };
    setAiMessages(prev => [...prev, userMsg]);
    setAiInput('');
    setAiLoading(true);
    try {
      const res = await api.post('/api/v1/ai/chat', { message: content, workspace_id: workspaceId }, token) as { reply: string };
      setAiMessages(prev => [...prev, { role: 'assistant', content: res.reply }]);
    } catch (e: any) {
      setAiMessages(prev => [...prev, { role: 'assistant', content: `Error: ${e.message}` }]);
    } finally { setAiLoading(false); }
  }

  const publicChannels  = channels.filter(c => !c.is_archived && c.type === 'public');
  const privateChannels = channels.filter(c => !c.is_archived && c.type === 'private');
  const aiChannels      = channels.filter(c => !c.is_archived && c.name.startsWith('ai-'));

  function renderChannel(item: Channel) {
    return (
      <TouchableOpacity
        key={item.id}
        style={styles.row}
        onPress={() => { joinChannel(item.id, token); onOpenChannel(item.id, item.name, item.description); }}
        activeOpacity={0.7}
      >
        <View style={styles.channelIconWrap}>
          <Text style={styles.channelHash}>#</Text>
        </View>
        <View style={styles.rowBody}>
          <Text style={styles.rowTitle}>{item.name}</Text>
          {item.description ? <Text style={styles.rowSub} numberOfLines={1}>{item.description}</Text> : null}
        </View>
        <Text style={styles.chevron}>›</Text>
      </TouchableOpacity>
    );
  }

  function dmLabel(convo: DMConvo) {
    if (convo.is_group) {
      if (convo.name) return convo.name;
      return (convo.participants ?? []).filter(p => p.user_id !== myUserId).map(p => p.user?.full_name || p.user?.username || '?').join(', ') || 'Group';
    }
    const other = convo.participants?.find(p => p.user_id !== myUserId);
    return other?.user?.full_name || other?.user?.username || 'DM';
  }

  function renderDM(convo: DMConvo) {
    const label    = dmLabel(convo);
    const initials = label.slice(0, 2).toUpperCase();
    return (
      <TouchableOpacity key={convo.id} style={styles.row} onPress={() => onOpenDMChat(convo, myUserId)} activeOpacity={0.7}>
        <View style={[styles.dmAvatar, convo.is_group && styles.dmAvatarGroup]}>
          <Text style={styles.dmAvatarText}>{initials}</Text>
        </View>
        <View style={styles.rowBody}>
          <Text style={styles.rowTitle}>{label}</Text>
          <Text style={styles.rowSub}>{convo.is_group ? `${(convo.participants ?? []).length} members` : 'Direct message'}</Text>
        </View>
        <Text style={styles.chevron}>›</Text>
      </TouchableOpacity>
    );
  }

  // ─── Tab contents ─────────────────────────────────────────────────────────

  function ChannelsTab() {
    if (chLoading) return <View style={styles.center}><ActivityIndicator color={colors.accent} /></View>;
    return (
      <>
      <View style={styles.tabHeader}>
        <Text style={styles.tabHeaderTitle}>Channels</Text>
        <TouchableOpacity style={styles.plusBtn} onPress={() => setShowCreateChannel(true)} activeOpacity={0.7}>
          <Text style={styles.plusIcon}>+</Text>
        </TouchableOpacity>
      </View>
      <ScrollView contentContainerStyle={styles.tabContent} showsVerticalScrollIndicator={false}>
        {publicChannels.length > 0 && (
          <>
            <Text style={styles.sectionLabel}>Channels</Text>
            {publicChannels.map(renderChannel)}
          </>
        )}
        {aiChannels.length > 0 && (
          <>
            <Text style={[styles.sectionLabel, { marginTop: spacing.lg }]}>
              <Text style={{ color: colors.accent }}>⚡</Text> AI Rooms
            </Text>
            {aiChannels.map(renderChannel)}
          </>
        )}
        {privateChannels.length > 0 && (
          <>
            <Text style={[styles.sectionLabel, { marginTop: spacing.lg }]}>Private</Text>
            {privateChannels.map(renderChannel)}
          </>
        )}
        {channels.length === 0 && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyEmoji}>💬</Text>
            <Text style={styles.emptyTitle}>No channels yet</Text>
            <TouchableOpacity style={styles.emptyAction} onPress={() => setShowCreateChannel(true)} activeOpacity={0.7}>
              <Text style={styles.emptyActionText}>Create a channel</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
      </>
    );
  }

  function DMsTab() {
    if (dmLoading) return <View style={styles.center}><ActivityIndicator color={colors.accent} /></View>;
    const all = [...dms, ...groups];
    return (
      <>
      <View style={styles.tabHeader}>
        <Text style={styles.tabHeaderTitle}>Messages</Text>
        <TouchableOpacity style={styles.plusBtn} onPress={() => setShowCreateDM(true)} activeOpacity={0.7}>
          <Text style={styles.plusIcon}>+</Text>
        </TouchableOpacity>
      </View>
      <ScrollView contentContainerStyle={styles.tabContent} showsVerticalScrollIndicator={false}>
        {dms.length > 0 && (
          <>
            <Text style={styles.sectionLabel}>Direct Messages</Text>
            {dms.map(renderDM)}
          </>
        )}
        {groups.length > 0 && (
          <>
            <Text style={[styles.sectionLabel, { marginTop: spacing.lg }]}>Group DMs</Text>
            {groups.map(renderDM)}
          </>
        )}
        {all.length === 0 && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyEmoji}>👋</Text>
            <Text style={styles.emptyTitle}>No conversations yet</Text>
            <TouchableOpacity style={styles.emptyAction} onPress={() => setShowCreateDM(true)} activeOpacity={0.7}>
              <Text style={styles.emptyActionText}>Start a direct message</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
      </>
    );
  }

  function SearchTab() {
    const totalCount = srResults
      ? srResults.messages.length + srResults.channels.length + srResults.users.length
      : 0;

    return (
      <View style={{ flex: 1 }}>
        <View style={styles.searchBar}>
          <Text style={styles.searchIcon}>⌕</Text>
          <TextInput
            style={styles.searchInput}
            value={query}
            onChangeText={handleSearch}
            placeholder="Search messages, channels, people…"
            placeholderTextColor={colors.textMuted}
            autoFocus={false}
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => { setQuery(''); setSrResults(null); }}>
              <Text style={styles.clearBtn}>✕</Text>
            </TouchableOpacity>
          )}
        </View>

        {srLoading ? (
          <View style={styles.center}><ActivityIndicator color={colors.accent} /></View>
        ) : srResults === null ? (
          <View style={styles.center}>
            <Text style={styles.emptyEmoji}>🔍</Text>
            <Text style={styles.emptyTitle}>Search across everything</Text>
            <Text style={styles.emptySub}>Messages, files, people, channels</Text>
          </View>
        ) : totalCount === 0 ? (
          <View style={styles.center}><Text style={styles.emptyTitle}>No results for "{query}"</Text></View>
        ) : (
          <ScrollView contentContainerStyle={styles.tabContent} showsVerticalScrollIndicator={false}>
            {srResults.users.length > 0 && (
              <>
                <Text style={styles.sectionLabel}>People</Text>
                {srResults.users.map((u, i) => (
                  <View key={u.id ?? i} style={styles.row}>
                    <View style={styles.dmAvatar}>
                      <Text style={styles.dmAvatarText}>{(u.full_name || u.username || '?').slice(0, 2).toUpperCase()}</Text>
                    </View>
                    <View style={styles.rowBody}>
                      <Text style={styles.rowTitle}>{u.full_name || u.username}</Text>
                      <Text style={styles.rowSub}>@{u.username}</Text>
                    </View>
                  </View>
                ))}
              </>
            )}
            {srResults.channels.length > 0 && (
              <>
                <Text style={[styles.sectionLabel, srResults.users.length > 0 && { marginTop: spacing.lg }]}>Channels</Text>
                {srResults.channels.map((ch, i) => (
                  <TouchableOpacity
                    key={ch.id ?? i}
                    style={styles.row}
                    onPress={() => { joinChannel(ch.id, token); onOpenChannel(ch.id, ch.name, ch.description); }}
                    activeOpacity={0.7}
                  >
                    <View style={styles.channelIconWrap}><Text style={styles.channelHash}>#</Text></View>
                    <View style={styles.rowBody}>
                      <Text style={styles.rowTitle}>{ch.name}</Text>
                      {ch.description && <Text style={styles.rowSub} numberOfLines={1}>{ch.description}</Text>}
                    </View>
                    <Text style={styles.chevron}>›</Text>
                  </TouchableOpacity>
                ))}
              </>
            )}
            {srResults.messages.length > 0 && (
              <>
                <Text style={[styles.sectionLabel, (srResults.users.length > 0 || srResults.channels.length > 0) && { marginTop: spacing.lg }]}>Messages</Text>
                {srResults.messages.map((m, i) => (
                  <View key={m.id ?? i} style={styles.row}>
                    <View style={styles.rowBody}>
                      <Text style={styles.rowTitle} numberOfLines={2}>{m.content}</Text>
                      {m.created_at && <Text style={styles.rowSub}>{new Date(m.created_at).toLocaleDateString()}</Text>}
                    </View>
                  </View>
                ))}
              </>
            )}
          </ScrollView>
        )}
      </View>
    );
  }

  function NotifsTab() {
    if (nLoading) return <View style={styles.center}><ActivityIndicator color={colors.accent} /></View>;
    const ICONS: Record<string, string> = { mention: '@', reply: '↩️', dm: '💬', reaction: '😊', system: 'ℹ️' };
    return (
      <View style={{ flex: 1 }}>
        {unread > 0 && (
          <TouchableOpacity style={styles.markAllRow} onPress={markAllRead} activeOpacity={0.7}>
            <Text style={styles.markAllText}>Mark all as read ({unread})</Text>
          </TouchableOpacity>
        )}
        {notifs.length === 0 ? (
          <View style={styles.center}>
            <Text style={styles.emptyEmoji}>🔕</Text>
            <Text style={styles.emptyTitle}>All caught up!</Text>
          </View>
        ) : (
          <FlatList
            data={notifs}
            keyExtractor={n => n.id}
            renderItem={({ item }) => (
              <View style={[styles.notifRow, !item.is_read && styles.notifUnread]}>
                <View style={styles.notifIcon}>
                  <Text style={styles.notifIconText}>{ICONS[item.type] ?? '•'}</Text>
                </View>
                <View style={styles.rowBody}>
                  <Text style={styles.rowTitle}>{item.content}</Text>
                  <Text style={styles.rowSub}>{new Date(item.created_at).toLocaleDateString()}</Text>
                </View>
                {!item.is_read && <View style={styles.unreadDot} />}
              </View>
            )}
            contentContainerStyle={styles.tabContent}
          />
        )}
      </View>
    );
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.headerBtn} activeOpacity={0.7}>
          <Text style={styles.backIcon}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>{workspaceName}</Text>
        <View style={styles.headerRight}>
          <TouchableOpacity onPress={onOpenFiles} style={styles.headerBtn} activeOpacity={0.7}>
            <Text style={styles.headerIcon}>📁</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={onOpenMembers} style={styles.headerBtn} activeOpacity={0.7}>
            <Text style={styles.headerIcon}>👥</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={onOpenSettings} style={styles.headerBtn} activeOpacity={0.7}>
            <Text style={styles.headerIcon}>⚙</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Content */}
      <View style={{ flex: 1 }}>
        {tab === 'channels' && <ChannelsTab />}
        {tab === 'dms'      && <DMsTab />}
        {tab === 'search'   && <SearchTab />}
        {tab === 'notifs'   && <NotifsTab />}
        {tab === 'ai'       && <AITabPanel aiMessages={aiMessages} aiInput={aiInput} aiLoading={aiLoading} setAiInput={setAiInput} sendAI={sendAI} />}
      </View>

      {/* Create Channel Modal */}
      <Modal visible={showCreateChannel} animationType="slide" transparent onRequestClose={() => setShowCreateChannel(false)}>
        <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={() => setShowCreateChannel(false)} />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.sheetWrap}>
          <View style={styles.sheet}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>New Channel</Text>

            <Text style={styles.sheetLabel}>Name</Text>
            <TextInput
              style={styles.sheetInput}
              value={newChName}
              onChangeText={setNewChName}
              placeholder="e.g. announcements"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="none"
              autoFocus
            />

            <Text style={styles.sheetLabel}>Description (optional)</Text>
            <TextInput
              style={[styles.sheetInput, styles.sheetInputMulti]}
              value={newChDesc}
              onChangeText={setNewChDesc}
              placeholder="What's this channel about?"
              placeholderTextColor={colors.textMuted}
              multiline
              numberOfLines={2}
            />

            <Text style={styles.sheetLabel}>Type</Text>
            <View style={styles.typeRow}>
              {(['public', 'private'] as const).map(t => (
                <TouchableOpacity
                  key={t}
                  style={[styles.typeBtn, newChType === t && styles.typeBtnActive]}
                  onPress={() => setNewChType(t)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.typeBtnText, newChType === t && styles.typeBtnTextActive]}>
                    {t === 'public' ? '🌐 Public' : '🔒 Private'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity
              style={[styles.sheetAction, (!newChName.trim() || creatingCh) && styles.sheetActionOff]}
              onPress={createChannel}
              disabled={!newChName.trim() || creatingCh}
              activeOpacity={0.85}
            >
              {creatingCh
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={styles.sheetActionText}>Create Channel</Text>}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Create DM Modal */}
      <Modal visible={showCreateDM} animationType="slide" transparent onRequestClose={() => {
        setShowCreateDM(false);
        setDmMode('direct'); setSelectedUsers([]); setDmGroupName(''); setDmSearchQ(''); setDmSearchResults([]);
      }}>
        <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={() => {
          setShowCreateDM(false);
          setDmMode('direct'); setSelectedUsers([]); setDmGroupName(''); setDmSearchQ(''); setDmSearchResults([]);
        }} />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.sheetWrap}>
          <View style={[styles.sheet, { maxHeight: '80%' }]}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>New Message</Text>

            {/* Mode toggle */}
            <View style={styles.typeRow}>
              {(['direct', 'group'] as const).map(m => (
                <TouchableOpacity
                  key={m}
                  style={[styles.typeBtn, dmMode === m && styles.typeBtnActive]}
                  onPress={() => { setDmMode(m); setSelectedUsers([]); }}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.typeBtnText, dmMode === m && styles.typeBtnTextActive]}>
                    {m === 'direct' ? '👤 Direct' : '👥 Group'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Group name input (group mode only) */}
            {dmMode === 'group' && (
              <TextInput
                style={[styles.sheetInput, { marginBottom: spacing.sm }]}
                value={dmGroupName}
                onChangeText={setDmGroupName}
                placeholder="Group name (optional)"
                placeholderTextColor={colors.textMuted}
              />
            )}

            {/* Selected users chips (group mode) */}
            {dmMode === 'group' && selectedUsers.length > 0 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsRow}>
                {selectedUsers.map(u => (
                  <TouchableOpacity
                    key={u.id}
                    style={styles.chip}
                    onPress={() => toggleUserSelection(u)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.chipText}>{u.full_name || u.username}</Text>
                    <Text style={styles.chipRemove}>✕</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}

            {/* User search */}
            <View style={styles.dmSearchBar}>
              <Text style={styles.searchIcon}>⌕</Text>
              <TextInput
                style={styles.dmSearchInput}
                value={dmSearchQ}
                onChangeText={handleDMSearch}
                placeholder="Search by name or username…"
                placeholderTextColor={colors.textMuted}
                autoFocus
                autoCapitalize="none"
              />
              {dmSearchLoading && <ActivityIndicator color={colors.accent} size="small" />}
            </View>

            {dmSearchResults.length > 0 ? (
              <FlatList
                data={dmSearchResults}
                keyExtractor={u => u.id}
                style={{ marginTop: spacing.sm }}
                renderItem={({ item }) => {
                  const isSelected = selectedUsers.some(u => u.id === item.id);
                  return (
                    <TouchableOpacity
                      style={[styles.userRow, isSelected && { backgroundColor: colors.accentDim }]}
                      onPress={() => dmMode === 'direct' ? startDM(item.id) : toggleUserSelection(item)}
                      disabled={creatingDM}
                      activeOpacity={0.7}
                    >
                      <View style={styles.dmAvatar}>
                        <Text style={styles.dmAvatarText}>{(item.full_name || item.username || '?').slice(0, 2).toUpperCase()}</Text>
                      </View>
                      <View style={styles.rowBody}>
                        <Text style={styles.rowTitle}>{item.full_name || item.username}</Text>
                        {item.full_name && <Text style={styles.rowSub}>@{item.username}</Text>}
                      </View>
                      {dmMode === 'direct'
                        ? (creatingDM ? <ActivityIndicator color={colors.accent} size="small" /> : <Text style={styles.chevron}>›</Text>)
                        : <Text style={{ fontSize: 18, color: isSelected ? colors.accent : colors.textMuted }}>{isSelected ? '✓' : '+'}</Text>}
                    </TouchableOpacity>
                  );
                }}
              />
            ) : dmSearchQ.length > 0 && !dmSearchLoading ? (
              <View style={[styles.center, { marginTop: spacing.md }]}>
                <Text style={styles.emptyTitle}>No users found</Text>
              </View>
            ) : dmSearchQ.length === 0 ? (
              <View style={[styles.center, { marginTop: spacing.lg }]}>
                <Text style={styles.emptySub}>Type a name to find teammates</Text>
              </View>
            ) : null}

            {/* Create Group button */}
            {dmMode === 'group' && selectedUsers.length > 0 && (
              <TouchableOpacity
                style={[styles.sheetAction, creatingGroup && styles.sheetActionOff]}
                onPress={createGroupDM}
                disabled={creatingGroup}
                activeOpacity={0.85}
              >
                {creatingGroup
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={styles.sheetActionText}>Create Group ({selectedUsers.length + 1})</Text>}
              </TouchableOpacity>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Bottom tab bar */}
      <View style={[styles.tabBar, { paddingBottom: insets.bottom || spacing.sm }]}>
        {TABS.map(t => {
          const active = tab === t.key;
          const showBadge = t.key === 'notifs' && unread > 0;
          return (
            <TouchableOpacity
              key={t.key}
              style={styles.tabItem}
              onPress={() => setTab(t.key)}
              activeOpacity={0.7}
            >
              <View style={styles.tabIconWrap}>
                <Text style={[styles.tabIcon, active && styles.tabIconActive]}>{t.icon}</Text>
                {showBadge && (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{unread > 9 ? '9+' : unread}</Text>
                  </View>
                )}
              </View>
              <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>{t.label}</Text>
              {active && <View style={styles.tabIndicator} />}
            </TouchableOpacity>
          );
        })}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 8, padding: spacing.xl },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.sm, paddingVertical: spacing.xs,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  headerBtn:   { width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
  backIcon:    { fontSize: 22, color: colors.accent },
  headerTitle: { flex: 1, fontSize: 17, fontWeight: '800', color: colors.textPrimary, textAlign: 'center', letterSpacing: -0.3 },
  headerRight: { flexDirection: 'row' },
  headerIcon:  { fontSize: 18 },

  tabContent: { paddingHorizontal: spacing.lg, paddingBottom: 40, paddingTop: spacing.sm },

  // Channel / DM rows
  sectionLabel: { fontSize: 11, fontWeight: '700', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4, marginTop: spacing.xs },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  channelIconWrap: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: colors.accentDim, justifyContent: 'center', alignItems: 'center',
  },
  channelHash: { fontSize: 18, fontWeight: '700', color: colors.accent },
  rowBody: { flex: 1 },
  rowTitle: { fontSize: 15, fontWeight: '600', color: colors.textPrimary },
  rowSub:   { fontSize: 12, color: colors.textSecondary, marginTop: 1 },
  chevron:  { fontSize: 20, color: colors.textMuted },

  dmAvatar: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: colors.accentDim, justifyContent: 'center', alignItems: 'center',
  },
  dmAvatarGroup: { backgroundColor: colors.surfaceHigh, borderRadius: 12 },
  dmAvatarText: { fontSize: 14, fontWeight: '700', color: colors.accent },

  // Empty states
  emptyState: { alignItems: 'center', paddingTop: spacing.xxl, gap: 8 },
  emptyEmoji: { fontSize: 48, marginBottom: spacing.sm },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: colors.textPrimary },
  emptySub:   { fontSize: 13, color: colors.textSecondary, textAlign: 'center' },

  // Search
  searchBar: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.surfaceHigh, borderRadius: radius.input,
    borderWidth: 1, borderColor: colors.border,
    marginHorizontal: spacing.lg, marginTop: spacing.md, marginBottom: spacing.sm,
    paddingHorizontal: spacing.md, paddingVertical: 10,
  },
  searchIcon:  { fontSize: 18, color: colors.textMuted },
  searchInput: { flex: 1, fontSize: 15, color: colors.textPrimary },
  clearBtn:    { fontSize: 14, color: colors.textMuted },

  // Notifications
  markAllRow: {
    backgroundColor: colors.accentDim, paddingHorizontal: spacing.lg, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  markAllText: { fontSize: 13, color: colors.accent, fontWeight: '600', textAlign: 'center' },
  notifRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  notifUnread: { backgroundColor: colors.accentDim + '44' },
  notifIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.surfaceHigh, justifyContent: 'center', alignItems: 'center' },
  notifIconText: { fontSize: 16 },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.accent },

  // AI
  aiWelcome: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.xl, gap: spacing.md },
  aiOrb: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: colors.accentDim, borderWidth: 1, borderColor: colors.accent + '55',
    justifyContent: 'center', alignItems: 'center', marginBottom: spacing.sm,
    shadowColor: colors.accent, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.4, shadowRadius: 20, elevation: 8,
  },
  aiOrbText:      { fontSize: 32 },
  aiWelcomeTitle: { fontSize: 22, fontWeight: '800', color: colors.textPrimary, letterSpacing: -0.3 },
  aiWelcomeSub:   { fontSize: 14, color: colors.textSecondary, textAlign: 'center' },
  aiChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginTop: spacing.sm },
  aiChip: {
    backgroundColor: colors.surfaceHigh, borderRadius: radius.full,
    paddingHorizontal: 14, paddingVertical: 8,
    borderWidth: 1, borderColor: colors.border,
  },
  aiChipText: { fontSize: 13, color: colors.textSecondary, fontWeight: '500' },
  aiMsg: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginBottom: 8 },
  aiMsgUser: { justifyContent: 'flex-end' },
  aiMsgAssistant: { justifyContent: 'flex-start' },
  aiMsgIcon: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.accentDim, justifyContent: 'center', alignItems: 'center' },
  aiMsgBubble: { maxWidth: '80%', borderRadius: radius.lg, paddingHorizontal: 14, paddingVertical: 10 },
  aiMsgBubbleUser: { backgroundColor: colors.accent },
  aiMsgBubbleAssistant: { backgroundColor: colors.surfaceHigh, borderWidth: 1, borderColor: colors.border },
  aiMsgText: { fontSize: 15, color: colors.textPrimary, lineHeight: 21 },
  aiInputRow: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    backgroundColor: colors.bg, borderTopWidth: 1, borderTopColor: colors.border,
  },
  aiInput: {
    flex: 1, backgroundColor: colors.surfaceHigh, borderRadius: radius.input,
    borderWidth: 1, borderColor: colors.border,
    color: colors.textPrimary, fontSize: 15, paddingHorizontal: spacing.md, paddingVertical: 10,
  },
  aiSendBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.accent, justifyContent: 'center', alignItems: 'center' },
  aiSendBtnOff: { opacity: 0.4 },
  aiSendIcon: { fontSize: 18, color: '#fff', fontWeight: '700' },

  // Tab bar
  tabBar: {
    flexDirection: 'row', backgroundColor: colors.tabBar,
    borderTopWidth: 1, borderTopColor: colors.border,
    paddingTop: spacing.xs,
  },
  tabItem:      { flex: 1, alignItems: 'center', gap: 2 },
  tabIconWrap:  { position: 'relative' },
  tabIcon:      { fontSize: 20, color: colors.textMuted },
  tabIconActive:{ color: colors.accent },
  tabLabel:     { fontSize: 10, fontWeight: '600', color: colors.textMuted },
  tabLabelActive:{ color: colors.accent },
  tabIndicator: { position: 'absolute', top: -4, left: 0, right: 0, height: 2, backgroundColor: colors.accent, borderRadius: 1 },
  badge: {
    position: 'absolute', top: -4, right: -6,
    minWidth: 16, height: 16, borderRadius: 8,
    backgroundColor: colors.danger, justifyContent: 'center', alignItems: 'center',
    paddingHorizontal: 3,
  },
  badgeText: { fontSize: 9, fontWeight: '800', color: '#fff' },

  // Tab sub-headers with "+" button
  tabHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.lg, paddingVertical: spacing.sm,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  tabHeaderTitle: { fontSize: 13, fontWeight: '700', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.8 },
  plusBtn: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: colors.accentDim, justifyContent: 'center', alignItems: 'center',
  },
  plusIcon: { fontSize: 20, color: colors.accent, fontWeight: '300', lineHeight: 22 },

  // Empty state action button
  emptyAction: {
    marginTop: spacing.sm, backgroundColor: colors.accent, borderRadius: radius.md,
    paddingHorizontal: spacing.lg, paddingVertical: 10,
  },
  emptyActionText: { fontSize: 14, fontWeight: '700', color: '#fff' },

  // Modal / Bottom Sheet
  modalBackdrop: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  sheetWrap: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.surface, borderTopLeftRadius: radius.xxl, borderTopRightRadius: radius.xxl,
    borderTopWidth: 1, borderColor: colors.border,
    paddingHorizontal: spacing.lg, paddingBottom: spacing.xl, paddingTop: spacing.md,
  },
  sheetHandle: {
    alignSelf: 'center', width: 36, height: 4, borderRadius: 2,
    backgroundColor: colors.border, marginBottom: spacing.md,
  },
  sheetTitle: { fontSize: 18, fontWeight: '800', color: colors.textPrimary, marginBottom: spacing.lg, letterSpacing: -0.3 },
  sheetLabel: { fontSize: 11, fontWeight: '700', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 6, marginTop: spacing.sm },
  sheetInput: {
    backgroundColor: colors.bg, borderRadius: radius.input, borderWidth: 1, borderColor: colors.border,
    color: colors.textPrimary, fontSize: 15, paddingHorizontal: spacing.md, paddingVertical: 12,
    marginBottom: spacing.xs,
  },
  sheetInputMulti: { height: 64, textAlignVertical: 'top', paddingTop: 12 },
  sheetAction: {
    backgroundColor: colors.accent, borderRadius: radius.md, paddingVertical: 14,
    alignItems: 'center', marginTop: spacing.lg,
  },
  sheetActionOff: { opacity: 0.45 },
  sheetActionText: { fontSize: 15, fontWeight: '700', color: '#fff' },

  typeRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm },
  typeBtn: {
    flex: 1, paddingVertical: 10, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border, alignItems: 'center',
    backgroundColor: colors.bg,
  },
  typeBtnActive: { borderColor: colors.accent, backgroundColor: colors.accentDim },
  typeBtnText: { fontSize: 14, fontWeight: '600', color: colors.textSecondary },
  typeBtnTextActive: { color: colors.accent },

  // DM search
  dmSearchBar: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.bg, borderRadius: radius.input,
    borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: spacing.md, paddingVertical: 10,
    marginBottom: spacing.xs,
  },
  dmSearchInput: { flex: 1, fontSize: 15, color: colors.textPrimary },
  userRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border,
  },

  chipsRow: { flexDirection: 'row', marginBottom: spacing.sm, maxHeight: 44 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: colors.accentDim, borderRadius: radius.full,
    borderWidth: 1, borderColor: colors.accent + '55',
    paddingHorizontal: 12, paddingVertical: 6, marginRight: 6,
  },
  chipText:   { fontSize: 13, fontWeight: '600', color: colors.accent },
  chipRemove: { fontSize: 11, color: colors.accent },
});
