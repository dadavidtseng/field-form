import { UM_PER_INCH, bounds, type Layout, type Pt } from '@field-form/shared';
import {
  Canvas,
  DashPathEffect,
  Group,
  Line,
  Rect,
  Skia,
  Text,
  matchFont,
  type SkFont,
} from '@shopify/react-native-skia';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Platform, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import {
  GestureDetector,
  useExclusiveGestures,
  usePanGesture,
  usePinchGesture,
  useSimultaneousGestures,
  useTapGesture,
} from 'react-native-gesture-handler';
import { useDerivedValue, useSharedValue, type SharedValue } from 'react-native-reanimated';
import { color } from '../ui/theme';
import { buildScene, type FeatureMark, type Label } from './scene';

const font = matchFont({
  fontFamily: Platform.select({ ios: 'Helvetica', default: 'sans-serif' }),
  fontSize: 18,
  fontWeight: 'bold',
});

const FIT_PADDING_PX = 56;
const MIN_SCALE = 0.05; // px per inch
const MAX_SCALE = 40;
const WALL_PX = 4;

interface Props {
  layout: Layout | null;
  /** Id of the wall or feature to highlight. */
  selectedId?: string | null;
  /** Single tap, in world µm (y up), with the current µm per screen pixel for hit radii. */
  onTap?: (world: Pt, umPerPx: number) => void;
}

/**
 * The one renderer both screens share. World geometry is drawn in a transformed group
 * (pan/zoom run on the UI thread, no React re-render per frame); line widths and labels
 * stay a constant size on screen so they read at any zoom.
 */
export function LayoutCanvas({ layout, selectedId, onTap }: Props) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  const scale = useSharedValue(1);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  // Shared value, not a ref: it is written from the UI-thread pan worklet.
  const userMoved = useSharedValue(false);

  const scene = useMemo(() => (layout ? buildScene(layout) : null), [layout]);
  const box = useMemo(() => (layout ? bounds(layout) : null), [layout]);

  const fit = useCallback(() => {
    if (!box || !size.width) return;
    const w = Math.max((box.maxX - box.minX) / UM_PER_INCH, 12);
    const h = Math.max((box.maxY - box.minY) / UM_PER_INCH, 12);
    const s = Math.min((size.width - 2 * FIT_PADDING_PX) / w, (size.height - 2 * FIT_PADDING_PX) / h);
    const cx = (box.minX + box.maxX) / 2 / UM_PER_INCH;
    const cy = (box.minY + box.maxY) / 2 / UM_PER_INCH;
    scale.set(Math.min(MAX_SCALE, Math.max(MIN_SCALE, s)));
    tx.set(size.width / 2 - cx * scale.get());
    ty.set(size.height / 2 + cy * scale.get());
  }, [box, size, scale, tx, ty]);

  // Keep the whole layout in view as it grows, until the user pans or zooms themselves.
  useEffect(() => {
    if (!userMoved.get()) fit();
  }, [fit, userMoved]);

  const pan = usePanGesture({
    onActivate: () => {
      userMoved.set(true);
    },
    onUpdate: (e) => {
      tx.set(tx.get() + e.changeX);
      ty.set(ty.get() + e.changeY);
    },
  });
  const pinch = usePinchGesture({
    onActivate: () => {
      userMoved.set(true);
    },
    onUpdate: (e) => {
      const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale.get() * e.scaleChange));
      const k = next / scale.get();
      // Zoom about the fingers, not the corner of the screen.
      tx.set(e.focalX - (e.focalX - tx.get()) * k);
      ty.set(e.focalY - (e.focalY - ty.get()) * k);
      scale.set(next);
    },
  });
  const doubleTap = useTapGesture({
    numberOfTaps: 2,
    runOnJS: true,
    onActivate: () => {
      userMoved.set(false);
      fit();
    },
  });
  const singleTap = useTapGesture({
    runOnJS: true,
    onActivate: (e) => {
      // Screen → world: undo the translate, the scale and the y flip, then inches → µm.
      const x = ((e.x - tx.get()) / scale.get()) * UM_PER_INCH;
      const y = ((ty.get() - e.y) / scale.get()) * UM_PER_INCH;
      onTap?.({ x, y }, UM_PER_INCH / scale.get());
    },
  });
  const gesture = useSimultaneousGestures(pan, pinch, useExclusiveGestures(doubleTap, singleTap));

  const transform = useDerivedValue(() => [
    { translateX: tx.get() },
    { translateY: ty.get() },
    { scaleX: scale.get() },
    { scaleY: -scale.get() },
  ]);
  const wallWidth = useDerivedValue(() => WALL_PX / scale.get());
  const thinWidth = useDerivedValue(() => 2 / scale.get());
  const gapWidth = useDerivedValue(() => (WALL_PX + 3) / scale.get());
  const highlightWidth = useDerivedValue(() => 16 / scale.get());

  const onLayout = (e: LayoutChangeEvent) =>
    setSize({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height });

  return (
    <View style={styles.root} onLayout={onLayout}>
      <GestureDetector gesture={gesture}>
        <Canvas style={styles.canvas}>
          {scene && (
            <>
              <Group transform={transform}>
                {scene.walls.map((w) => (
                  <Group key={w.id}>
                    {w.id === selectedId && (
                      <Line p1={w.a} p2={w.b} color={color.active} strokeWidth={highlightWidth} strokeCap="round" />
                    )}
                    <Line
                      p1={w.a}
                      p2={w.b}
                      color={w.measured ? color.ink : color.muted}
                      strokeWidth={wallWidth}
                      strokeCap="round"
                    >
                      {!w.measured && <DashPathEffect intervals={[8, 6]} />}
                    </Line>
                  </Group>
                ))}
                {scene.features.map((f) => (
                  <FeatureShape
                    key={f.id}
                    f={f}
                    selected={f.id === selectedId}
                    widths={{ thin: thinWidth, gap: gapWidth, highlight: highlightWidth }}
                  />
                ))}
              </Group>
              {font &&
                scene.labels.map((l) => <WallLabel key={l.key} label={l} font={font} scale={scale} tx={tx} ty={ty} />)}
            </>
          )}
        </Canvas>
      </GestureDetector>
    </View>
  );
}

interface Widths {
  thin: SharedValue<number>;
  gap: SharedValue<number>;
  highlight: SharedValue<number>;
}

/** Plan symbols: a gap in the wall, plus a door leaf, a window pane line, or step treads. */
function FeatureShape({ f, selected, widths }: { f: FeatureMark; selected: boolean; widths: Widths }) {
  if (f.kind === 'post') {
    const half = f.size / 2;
    return (
      <Group>
        {selected && (
          <Rect x={f.a.x - half - 3} y={f.a.y - half - 3} width={f.size + 6} height={f.size + 6} color={color.active} />
        )}
        <Rect x={f.a.x - half} y={f.a.y - half} width={f.size} height={f.size} color={color.ink} />
      </Group>
    );
  }
  const len = Math.hypot(f.b.x - f.a.x, f.b.y - f.a.y);
  const along = { x: (f.b.x - f.a.x) / (len || 1), y: (f.b.y - f.a.y) / (len || 1) };
  return (
    <Group>
      {selected && <Line p1={f.a} p2={f.b} color={color.active} strokeWidth={widths.highlight} strokeCap="round" />}
      <Line p1={f.a} p2={f.b} color={color.paper} strokeWidth={widths.gap} />
      {f.kind === 'door' && (
        <Line
          p1={f.a}
          p2={{ x: f.a.x + f.inward.x * len, y: f.a.y + f.inward.y * len }}
          color={color.ink}
          strokeWidth={widths.thin}
        />
      )}
      {f.kind === 'window' && <Line p1={f.a} p2={f.b} color={color.ink} strokeWidth={widths.thin} />}
      {f.kind === 'step' &&
        [0.25, 0.5, 0.75].map((t) => {
          const base = { x: f.a.x + along.x * len * t, y: f.a.y + along.y * len * t };
          return (
            <Line
              key={t}
              p1={base}
              p2={{ x: base.x - f.inward.x * 10, y: base.y - f.inward.y * 10 }}
              color={color.ink}
              strokeWidth={widths.thin}
            />
          );
        })}
    </Group>
  );
}

const LABEL_GAP_PX = 10;
const LABEL_HEIGHT_PX = 20;
/** Moves the text baseline so the glyphs are vertically centred on the anchor point. */
const LABEL_BASELINE_PX = 6;

/** A length label that stays the same size on screen and sits just outside its wall. */
function WallLabel({
  label,
  font,
  scale,
  tx,
  ty,
}: {
  label: Label;
  font: SkFont;
  scale: SharedValue<number>;
  tx: SharedValue<number>;
  ty: SharedValue<number>;
}) {
  const width = useMemo(() => font.measureText(label.text).width, [font, label.text]);
  // Push the label's centre far enough that its whole box clears the wall, whatever the wall's
  // angle: half its width counts on vertical walls, half its height on horizontal ones.
  const push = LABEL_GAP_PX + Math.abs(label.offset.x) * (width / 2) + Math.abs(label.offset.y) * (LABEL_HEIGHT_PX / 2);
  const transform = useDerivedValue(() => [
    { translateX: label.at.x * scale.get() + tx.get() + label.offset.x * push - width / 2 },
    { translateY: -label.at.y * scale.get() + ty.get() - label.offset.y * push + LABEL_BASELINE_PX },
  ]);
  const backdrop = useMemo(() => Skia.XYWHRect(-4, -18, width + 8, 24), [width]);
  return (
    <Group transform={transform}>
      <Rect rect={backdrop} color={color.paper} opacity={0.85} />
      <Text x={0} y={0} text={label.text} font={font} color={color.ink} />
    </Group>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.paper },
  canvas: { flex: 1 },
});
