import type { LayoutKind, LayoutSummary, Role } from '@field-form/shared';
import { randomUUID } from 'expo-crypto';
import { router, useLocalSearchParams } from 'expo-router';
import { FlatList, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFollowDana, useFollowStore } from '../state/follow';
import { useLayoutIndex } from '../sync/useLayoutIndex';
import { ScreenHeader } from '../ui/ScreenHeader';
import { TOUCH, color } from '../ui/theme';

const KINDS: { kind: LayoutKind; label: string }[] = [
  { kind: 'room', label: 'Room' },
  { kind: 'deck', label: 'Deck' },
  { kind: 'patio', label: 'Patio' },
  { kind: 'fence', label: 'Fence' },
];

function ago(ts: number): string {
  const min = Math.round((Date.now() - ts) / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  return new Date(ts).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

/** Both roles start here: every layout, newest first, with the one Dana has open marked live. */
export default function LayoutList() {
  const { role } = useLocalSearchParams<{ role: Role }>();
  const { layouts } = useLayoutIndex(role);
  const follow = useFollowStore((s) => s.follow);
  const setFollow = useFollowStore((s) => s.setFollow);
  useFollowDana(role === 'office' ? layouts : [], null);

  const open = (id: string) =>
    router.push({ pathname: role === 'field' ? '/field/[id]' : '/office/[id]', params: { id } });

  // One tap creates the layout; the field screen sends `layout.create`, so this works offline too.
  const create = (kind: LayoutKind) =>
    router.push({ pathname: '/field/[id]', params: { id: randomUUID(), create: kind } });

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <ScreenHeader
        title={role === 'field' ? 'Field · Layouts' : 'Office · Layouts'}
        onBack={() => router.back()}
        right={
          role === 'office' && (
            <View style={styles.follow}>
              <Text style={styles.followText}>Follow Dana</Text>
              <Switch value={follow} onValueChange={setFollow} />
            </View>
          )
        }
      />
      {role === 'field' && (
        <View style={styles.newRow}>
          {KINDS.map((k) => (
            <Pressable
              key={k.kind}
              accessibilityRole="button"
              onPress={() => create(k.kind)}
              style={({ pressed }) => [styles.newButton, pressed && styles.pressed]}
            >
              <Text style={styles.newText}>+ {k.label}</Text>
            </Pressable>
          ))}
        </View>
      )}
      <FlatList
        data={layouts}
        keyExtractor={(l) => l.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <Text style={styles.empty}>
            {role === 'field' ? 'No layouts yet. Tap + to start one.' : 'No layouts yet. They appear here live.'}
          </Text>
        }
        renderItem={({ item }) => <Row item={item} onPress={() => open(item.id)} />}
      />
    </SafeAreaView>
  );
}

function Row({ item, onPress }: { item: LayoutSummary; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <View style={styles.rowMain}>
        <Text style={styles.rowName} numberOfLines={1}>
          {item.name}
        </Text>
        <Text style={styles.rowMeta}>
          {item.kind} · {item.walls} wall{item.walls === 1 ? '' : 's'} · {ago(item.updatedAt)}
        </Text>
      </View>
      {item.live && <Text style={styles.live}>● live</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.paper },
  follow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  followText: { fontSize: 18, fontWeight: '700', color: color.ink },
  newRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, padding: 16 },
  newButton: {
    minHeight: TOUCH,
    minWidth: 120,
    flexGrow: 1,
    borderRadius: 12,
    backgroundColor: color.ink,
    justifyContent: 'center',
    alignItems: 'center',
  },
  newText: { color: color.paper, fontSize: 22, fontWeight: '800' },
  pressed: { opacity: 0.7 },
  list: { padding: 16, gap: 12 },
  empty: { fontSize: 20, color: color.muted, textAlign: 'center', marginTop: 40 },
  row: {
    minHeight: TOUCH + 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    borderWidth: 2,
    borderColor: color.line,
    borderRadius: 12,
  },
  rowMain: { flex: 1 },
  rowName: { fontSize: 22, fontWeight: '800', color: color.ink },
  rowMeta: { fontSize: 16, color: color.muted, marginTop: 4 },
  live: { fontSize: 18, fontWeight: '800', color: color.ok },
});
