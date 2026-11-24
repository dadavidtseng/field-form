import { featureNames, hitTest, measureGuide, measureSlots, type Hit, type Pt } from '@field-form/shared';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, Switch, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LayoutCanvas } from '../../canvas/LayoutCanvas';
import { InspectPanel, type Selection } from '../../office/InspectPanel';
import { useChangeFlash } from '../../office/useChangeFlash';
import { useFollowDana, useFollowStore } from '../../state/follow';
import { useLayoutIndex } from '../../sync/useLayoutIndex';
import { useLayoutSync } from '../../sync/useLayoutSync';
import { ScreenHeader } from '../../ui/ScreenHeader';
import { StatusBadge } from '../../ui/StatusBadge';
import { color } from '../../ui/theme';

const TAP_RADIUS_PX = 24;
/** iPad-class widths get a side panel; phones get it below the canvas. */
const SIDE_PANEL_MIN_WIDTH = 700;

/** Marcus's read-only view of one layout, live from the field. */
export default function OfficeLayout() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const sync = useLayoutSync(id, 'office');
  const layout = sync.view;
  const { layouts } = useLayoutIndex('office');
  const follow = useFollowStore((s) => s.follow);
  const setFollow = useFollowStore((s) => s.setFollow);
  const [hit, setHit] = useState<Hit | null>(null);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const flashIds = useChangeFlash(layout);
  const wide = useWindowDimensions().width >= SIDE_PANEL_MIN_WIDTH;
  useFollowDana(layouts, id);

  const live = layouts.find((l) => l.id === id)?.live ?? false;
  const slots = useMemo(() => (layout ? measureSlots(layout) : []), [layout]);

  // What the tapped element's panel shows. Rebuilt on every change, so values update live.
  const selection: Selection | null = useMemo(() => {
    if (!layout || !hit) return null;
    if (hit.kind === 'feature') {
      const own = slots.filter((s) => s.target.kind === 'feature' && s.target.featureId === hit.id);
      return own.length ? { title: featureNames(layout)[hit.id] ?? 'Feature', slots: own } : null;
    }
    const closing = hit.id === layout.outline.closingWallId;
    const own = slots.filter((s) => (closing ? s.target.kind === 'closing' : s.key === `wall:${hit.id}`));
    return own[0] ? { title: own[0].label, slots: own } : null;
  }, [layout, hit, slots]);

  const active = selection?.slots.find((s) => s.key === activeKey) ?? selection?.slots[0] ?? null;

  const onTap = (p: Pt, umPerPx: number) => {
    if (!layout) return;
    setHit(hitTest(layout, p, TAP_RADIUS_PX * umPerPx));
    setActiveKey(null);
  };

  const canvas = (
    <LayoutCanvas
      layout={layout}
      selectedId={selection ? (hit?.id ?? null) : null}
      flashIds={flashIds}
      onTap={onTap}
      guide={layout && active ? measureGuide(layout, active.target) : null}
    />
  );

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <ScreenHeader
        title={layout?.name ?? 'Loading…'}
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
      {layout?.archived ? (
        <>
          {canvas}
          <Text style={styles.deleted}>Deleted in the field</Text>
        </>
      ) : (
        <View style={[styles.body, wide && styles.bodyWide]}>
          <View style={styles.canvasArea}>
            {canvas}
            {layout && layout.outline.walls.length === 0 && (
              <Text style={styles.hint}>Waiting for Dana to draw this space…</Text>
            )}
          </View>
          {layout && layout.outline.walls.length > 0 && (
            <View style={wide ? styles.sidePanel : styles.bottomPanel}>
              <InspectPanel
                layout={layout}
                selection={selection}
                activeKey={active?.key ?? null}
                onPick={setActiveKey}
                onClear={() => setHit(null)}
              />
            </View>
          )}
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.paper },
  body: { flex: 1 },
  bodyWide: { flexDirection: 'row' },
  canvasArea: { flex: 1 },
  sidePanel: { width: 360, borderLeftWidth: 2, borderLeftColor: color.line },
  bottomPanel: { maxHeight: '45%', borderTopWidth: 2, borderTopColor: color.line },
  live: { fontSize: 18, fontWeight: '800', color: color.ok },
  follow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  followText: { fontSize: 18, fontWeight: '700', color: color.ink },
  deleted: {
    padding: 16,
    fontSize: 22,
    fontWeight: '800',
    color: color.bad,
    textAlign: 'center',
    borderTopWidth: 3,
    borderTopColor: color.bad,
  },
  hint: { position: 'absolute', bottom: 48, alignSelf: 'center', fontSize: 20, color: color.muted },
});
