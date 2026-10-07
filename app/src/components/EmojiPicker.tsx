import React from 'react';
import {
  Modal, View, Text, TouchableOpacity, FlatList, StyleSheet,
} from 'react-native';
import { colors, spacing, radius } from '../theme/tokens';

const EMOJIS = [
  '👍','👎','❤️','😂','😮','😢','🎉','🔥','👏','🙏',
  '😍','🤔','😅','🥰','😎','🤩','😭','🤣','💪','✅',
  '❌','⭐','💯','🚀','👀','🙌','💀','🤯','😤','🤝',
];

interface Props {
  visible: boolean;
  onSelect: (emoji: string) => void;
  onClose: () => void;
}

export function EmojiPicker({ visible, onSelect, onClose }: Props) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose} />
      <View style={styles.sheet}>
        <View style={styles.handle} />
        <Text style={styles.title}>Reactions</Text>
        <FlatList
          data={EMOJIS}
          keyExtractor={e => e}
          numColumns={6}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.emojiBtn}
              onPress={() => { onSelect(item); onClose(); }}
              activeOpacity={0.7}
            >
              <Text style={styles.emoji}>{item}</Text>
            </TouchableOpacity>
          )}
          columnWrapperStyle={styles.row}
          contentContainerStyle={styles.grid}
          scrollEnabled={false}
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: spacing.lg, paddingBottom: 36,
    borderWidth: 1, borderColor: colors.border,
  },
  handle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: colors.border, alignSelf: 'center', marginBottom: spacing.md,
  },
  title: { fontSize: 14, fontWeight: '600', color: colors.textSecondary, marginBottom: spacing.md },
  grid: { gap: 8 },
  row: { justifyContent: 'space-between' },
  emojiBtn: {
    flex: 1, aspectRatio: 1, alignItems: 'center', justifyContent: 'center',
    borderRadius: radius.sm, backgroundColor: colors.bg,
    margin: 3,
  },
  emoji: { fontSize: 26 },
});
