import type { Role } from '@field-form/shared';
import { randomUUID } from 'expo-crypto';
import { router, useLocalSearchParams } from 'expo-router';
import { FlatList, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFollowField, useFollowStore } from '../state/follow';
import { useLayoutIndex, type LayoutRow } from '../sync/useLayoutIndex';
import { ScreenHeader } from '../ui/ScreenHeader';
import { UnitToggle } from '../ui/UnitToggle';
import { TOUCH, color } from '../ui/theme';

function ago(ts: number): string {
  const min = Math.round((Date.now() - ts) / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  return new Date(ts).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

/** Both roles start here: every layout, newest first, with the one Dana has open marked live. */
export default function LayoutList() {
  const { role } = useLocalSearchParams<{ role: Role }>();
  const { layouts, rows } = useLayoutIndex(role);
  const follow = useFollowStore((s) => s.follow);
  const setFollow = useFollowStore((s) => s.setFollow);
  useFollowField(role === 'office' ? layouts : [], null);

  const open = (id: string) =>
    router.push({ pathname: role === 'field' ? '/field/[id]' : '/office/[id]', params: { id } });

  // One tap creates the space; whether it is a closed shape or an open line (a fence) is decided
  // by how the sketch is finished. The field screen sends `layout.create`, so this works offline.
  const create = () => router.push({ pathname: '/field/[id]', params: { id: randomUUID(), create: 'other' } });

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <ScreenHeader
        title={role === 'field' ? 'Field · Spaces' : 'Office · Spaces'}
        onBack={() => router.back()}
        right={
          <>
            {role === 'office' && (
              <View style={styles.follow}>
                <Text style={styles.followText}>Follow field</Text>
                <Switch value={follow} onValueChange={setFollow} />
              </View>
            )}
            <UnitToggle />
          </>
        }
      />
      {role === 'field' && (
        <View style={styles.newRow}>
          <Pressable
            accessibilityRole="button"
            onPress={create}
            style={({ pressed }) => [styles.newButton, pressed && styles.pressed]}
          >
            <Text style={styles.newText}>+ New space</Text>
          </Pressable>
        </View>
      )}
      <FlatList
        data={rows}
        keyExtractor={(l) => l.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <Text style={styles.empty}>
            {role === 'field' ? 'No spaces yet. Tap + New space to start.' : 'No spaces yet. They appear here live.'}
          </Text>
        }
        renderItem={({ item }) => <Row item={item} onPress={() => open(item.id)} />}
      />
    </SafeAreaView>
  );
}

function Row({ item, onPress }: { item: LayoutRow; onPress: () => void }) {
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
          {item.walls === 0
            ? 'not drawn yet'
            : `${item.closed ? 'closed shape' : 'open line'} · ${item.walls} wall${item.walls === 1 ? '' : 's'}`}{' '}
          · {ago(item.updatedAt)}
        </Text>
      </View>
      {item.live && <Text style={styles.live}>● live</Text>}
      {item.unsynced && <Text style={styles.unsynced}>◐ not synced yet</Text>}
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
  unsynced: { fontSize: 16, fontWeight: '800', color: color.warn },
});
