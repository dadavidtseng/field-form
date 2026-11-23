import { hitTest, type Pt } from '@field-form/shared';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LayoutCanvas } from '../../canvas/LayoutCanvas';
import { useFollowDana, useFollowStore } from '../../state/follow';
import { useLayoutIndex } from '../../sync/useLayoutIndex';
import { useLayoutSync } from '../../sync/useLayoutSync';
import { ScreenHeader } from '../../ui/ScreenHeader';
import { StatusBadge } from '../../ui/StatusBadge';
import { color } from '../../ui/theme';

const TAP_RADIUS_PX = 24;

/** Marcus's read-only view of one layout, live from the field. */
export default function OfficeLayout() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const sync = useLayoutSync(id, 'office');
  const { layouts } = useLayoutIndex('office');
  const follow = useFollowStore((s) => s.follow);
  const setFollow = useFollowStore((s) => s.setFollow);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  useFollowDana(layouts, id);

  const live = layouts.find((l) => l.id === id)?.live ?? false;

  const onTap = (p: Pt, umPerPx: number) => {
    if (!sync.view) return;
    setSelectedId(hitTest(sync.view, p, TAP_RADIUS_PX * umPerPx)?.id ?? null);
  };

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <ScreenHeader
        title={sync.view?.name ?? 'Loading…'}
        onBack={() => router.back()}
        right={
          <>
            {live && <Text style={styles.live}>● Dana editing</Text>}
            <View style={styles.follow}>
              <Text style={styles.followText}>Follow</Text>
              <Switch value={follow} onValueChange={setFollow} />
            </View>
            <StatusBadge status={sync.status} pending={sync.pendingCount} />
          </>
        }
      />
      <LayoutCanvas layout={sync.view} selectedId={selectedId} onTap={onTap} />
      {sync.view && sync.view.outline.walls.length === 0 && (
        <Text style={styles.hint}>Waiting for Dana to draw this space…</Text>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.paper },
  live: { fontSize: 18, fontWeight: '800', color: color.ok },
  follow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  followText: { fontSize: 18, fontWeight: '700', color: color.ink },
  hint: { position: 'absolute', bottom: 48, alignSelf: 'center', fontSize: 20, color: color.muted },
});
