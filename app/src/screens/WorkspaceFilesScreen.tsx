import React from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, FlatList,
  ActivityIndicator, Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../lib/supabase';
import { api } from '../lib/api';
import { colors, spacing, radius } from '../theme/tokens';

interface FileRecord {
  id: string;
  file_name: string;
  file_size: number;
  mime_type: string;
  public_url: string;
  created_at: string;
  uploader_id: string;
}

interface Props {
  workspaceId: string;
  workspaceName: string;
  onBack: () => void;
}

function mimeIcon(mime: string): string {
  if (mime.startsWith('image/')) return '🖼';
  if (mime.startsWith('video/')) return '🎬';
  if (mime.startsWith('audio/')) return '🎵';
  if (mime.includes('pdf')) return '📄';
  if (mime.includes('zip') || mime.includes('rar')) return '🗜';
  if (mime.includes('text')) return '📝';
  return '📎';
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export function WorkspaceFilesScreen({ workspaceId, workspaceName, onBack }: Props) {
  const [files, setFiles]   = React.useState<FileRecord[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const res = await api.get(`/api/v1/workspaces/${workspaceId}/files`, session.access_token) as { data: FileRecord[] };
      setFiles(res.data ?? []);
    } catch (e: any) {
      console.error('files load:', e.message);
    } finally {
      setLoading(false);
    }
  }

  function openFile(url: string) {
    Linking.openURL(url).catch(() => {});
  }

  function renderFile({ item }: { item: FileRecord }) {
    return (
      <TouchableOpacity style={styles.row} onPress={() => openFile(item.public_url)} activeOpacity={0.75}>
        <View style={styles.iconBox}>
          <Text style={styles.icon}>{mimeIcon(item.mime_type)}</Text>
        </View>
        <View style={styles.rowBody}>
          <Text style={styles.fileName} numberOfLines={1}>{item.file_name}</Text>
          <Text style={styles.fileMeta}>{formatBytes(item.file_size)} · {formatDate(item.created_at)}</Text>
        </View>
        <Text style={styles.openIcon}>↗</Text>
      </TouchableOpacity>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn} activeOpacity={0.7}>
          <Text style={styles.backIcon}>←</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Files</Text>
        <View style={styles.backBtn} />
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.accent} size="large" /></View>
      ) : files.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyIcon}>📂</Text>
          <Text style={styles.emptyTitle}>No files yet</Text>
          <Text style={styles.emptySub}>Files shared in channels appear here</Text>
        </View>
      ) : (
        <FlatList
          data={files}
          keyExtractor={f => f.id}
          renderItem={renderFile}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 8 },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  backBtn: { width: 40, height: 40, justifyContent: 'center' },
  backIcon: { fontSize: 22, color: colors.accent },
  title: { fontSize: 17, fontWeight: '700', color: colors.textPrimary },

  list: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md, gap: 4 },

  row: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  iconBox: {
    width: 44, height: 44, borderRadius: radius.md,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    justifyContent: 'center', alignItems: 'center',
  },
  icon: { fontSize: 22 },
  rowBody: { flex: 1 },
  fileName: { fontSize: 14, fontWeight: '600', color: colors.textPrimary },
  fileMeta: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  openIcon: { fontSize: 16, color: colors.textMuted },

  emptyIcon: { fontSize: 40, marginBottom: 4 },
  emptyTitle: { fontSize: 16, fontWeight: '600', color: colors.textPrimary },
  emptySub: { fontSize: 13, color: colors.textSecondary },
});
