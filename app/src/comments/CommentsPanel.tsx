import type { Comment, CommentTag } from '@field-form/shared';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { BigButton } from '../ui/BigButton';
import { color } from '../ui/theme';

export const TAG_LABEL: Record<CommentTag, string> = {
  verify: 'Verify',
  obstruction: 'Obstruction',
  out_of_square: 'Out of square',
  damage: 'Damage',
};

const time = (ts: number) => new Date(ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

/**
 * Two-way notes pinned to one wall, feature or the whole space. A tag is one tap (gloves);
 * text is optional. Either side can resolve or reopen, and comments never change geometry.
 */
export function CommentsPanel({
  title,
  comments,
  onAdd,
  onToggle,
}: {
  title: string;
  comments: Comment[];
  onAdd: (tag: CommentTag | undefined, text: string | undefined) => void;
  onToggle: (id: string, resolved: boolean) => void;
}) {
  const [tag, setTag] = useState<CommentTag | undefined>();
  const [text, setText] = useState('');
  const trimmed = text.trim();

  const send = () => {
    if (!tag && !trimmed) return;
    onAdd(tag, trimmed || undefined);
    setTag(undefined);
    setText('');
  };

  return (
    <View style={styles.panel}>
      <Text style={styles.title}>{title}</Text>
      {comments.length === 0 && <Text style={styles.empty}>No comments yet.</Text>}
      {comments.map((c) => (
        <View key={c.id} style={[styles.comment, c.resolved && styles.resolved]}>
          <View style={styles.commentMain}>
            <Text style={styles.commentText}>
              {c.tag ? <Text style={styles.tag}>{TAG_LABEL[c.tag]}</Text> : null}
              {c.tag && c.text ? ' · ' : ''}
              {c.text}
            </Text>
            <Text style={styles.meta}>
              {c.by === 'field' ? 'Field' : 'Office'} · {time(c.at)}
              {c.resolved ? ' · resolved' : ''}
            </Text>
          </View>
          <Pressable accessibilityRole="button" onPress={() => onToggle(c.id, !c.resolved)} style={styles.toggle}>
            <Text style={styles.toggleText}>{c.resolved ? 'Reopen' : 'Resolve'}</Text>
          </Pressable>
        </View>
      ))}
      <View style={styles.tags}>
        {(Object.keys(TAG_LABEL) as CommentTag[]).map((t) => (
          <Pressable
            key={t}
            accessibilityRole="button"
            accessibilityState={{ selected: tag === t }}
            onPress={() => setTag(tag === t ? undefined : t)}
            style={[styles.tagChip, tag === t && styles.tagChipActive]}
          >
            <Text style={styles.tagChipText}>{TAG_LABEL[t]}</Text>
          </Pressable>
        ))}
      </View>
      <TextInput
        value={text}
        onChangeText={setText}
        placeholder="Add a note (optional)"
        placeholderTextColor={color.muted}
        style={styles.input}
        maxLength={500}
        returnKeyType="send"
        onSubmitEditing={send}
      />
      <BigButton label="Send comment" onPress={send} />
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { gap: 8 },
  title: { fontSize: 20, fontWeight: '800', color: color.ink },
  empty: { fontSize: 16, color: color.muted },
  comment: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 10,
    borderWidth: 2,
    borderColor: color.warn,
    borderRadius: 10,
  },
  resolved: { borderColor: color.line, opacity: 0.6 },
  commentMain: { flex: 1 },
  commentText: { fontSize: 17, color: color.ink },
  tag: { fontWeight: '800' },
  meta: { fontSize: 13, color: color.muted, marginTop: 2 },
  toggle: { minHeight: 44, paddingHorizontal: 12, justifyContent: 'center', borderWidth: 2, borderRadius: 10 },
  toggleText: { fontSize: 15, fontWeight: '800', color: color.ink },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tagChip: {
    minHeight: 48,
    paddingHorizontal: 14,
    borderRadius: 24,
    borderWidth: 2,
    borderColor: color.ink,
    justifyContent: 'center',
  },
  tagChipActive: { backgroundColor: color.active, borderWidth: 3 },
  tagChipText: { fontSize: 16, fontWeight: '800', color: color.ink },
  input: {
    minHeight: 48,
    borderWidth: 2,
    borderColor: color.ink,
    borderRadius: 10,
    paddingHorizontal: 12,
    fontSize: 17,
    color: color.ink,
  },
});
