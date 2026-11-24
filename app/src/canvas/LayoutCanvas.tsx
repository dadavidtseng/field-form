import { UM_PER_INCH, bounds, feet, type Guide, type Layout, type Pt } from '@field-form/shared';
import {
  Canvas,
  Circle,
  DashPathEffect,
  Group,
  Line,
  Path,
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
import { useUnitSystem } from '../state/units';
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
  /** Walls/features that just changed remotely; highlighted briefly so the change is noticed. */
  flashIds?: ReadonlySet<string>;
  /** Single tap, in world µm (y up), with the current µm per screen pixel for hit radii. */
  onTap?: (world: Pt, umPerPx: number) => void;
  /** Corners tapped so far in a sketch that is not committed yet (world µm). */
  draft?: Pt[];
  /** The distance Dana is about to measure, drawn as a dimension line from the yellow corner. */
  guide?: Guide | null;
  /** Open-comment badges (world µm) so both roles can see where questions are. */
  pins?: { key: string; at: Pt; count: number; inward: Pt }[];
}

const EMPTY_FRAME = { minX: -feet(10), minY: -feet(10), maxX: feet(10), maxY: feet(10) };

/**
 * The one renderer both screens share. World geometry is drawn in a transformed group
 * (pan/zoom run on the UI thread, no React re-render per frame); line widths and labels
 * stay a constant size on screen so they read at any zoom.
 */
export function LayoutCanvas({ layout, selectedId, flashIds, onTap, draft, guide, pins }: Props) {
  const highlighted = (id: string) => id === selectedId || !!flashIds?.has(id);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const scale = useSharedValue(1);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  // Shared value, not a ref: it is written from the UI-thread pan worklet.
  const userMoved = useSharedValue(false);

  const system = useUnitSystem();
  const scene = useMemo(() => (layout ? buildScene(layout, system) : null), [layout, system]);
  // An empty layout frames a 20' square around the origin, so the first sketch taps have room.
  const box = useMemo(() => (layout && bounds(layout)) || EMPTY_FRAME, [layout]);
  const draftIn = useMemo(() => (draft ?? []).map((p) => ({ x: p.x / UM_PER_INCH, y: p.y / UM_PER_INCH })), [draft]);

  const fit = useCallback(() => {
    if (!size.width) return;
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
  const dotRadius = useDerivedValue(() => 9 / scale.get());
  const closeRingRadius = useDerivedValue(() => 22 / scale.get());

  const onLayout = (e: LayoutChangeEvent) =>
    setSize({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height });

  return (
    <View style={styles.root} onLayout={onLayout}>
      <GestureDetector gesture={gesture}>
        <Canvas style={styles.canvas}>
          {draftIn.length > 0 && (
            <Group transform={transform}>
              {draftIn.length >= 3 && (
                // Tapping inside this ring closes the shape.
                <Circle cx={draftIn[0]!.x} cy={draftIn[0]!.y} r={closeRingRadius} color={color.active} opacity={0.5} />
              )}
              {draftIn.slice(1).map((p, i) => (
                <Line
                  key={`l${i}`}
                  p1={draftIn[i]!}
                  p2={p}
                  color={color.ink}
                  strokeWidth={wallWidth}
                  strokeCap="round"
                />
              ))}
              {draftIn.map((p, i) => (
                <Circle key={`c${i}`} cx={p.x} cy={p.y} r={dotRadius} color={i === 0 ? color.active : color.ink} />
              ))}
            </Group>
          )}
          {scene && (
            <>
              <Group transform={transform}>
                {scene.walls.map((w) => (
                  <Group key={w.id}>
                    {highlighted(w.id) && (
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
                    selected={highlighted(f.id)}
                    widths={{ thin: thinWidth, gap: gapWidth, highlight: highlightWidth }}
                  />
                ))}
              </Group>
              {guide && <GuideShape guide={guide} scale={scale} tx={tx} ty={ty} />}
              {font && pins?.map((p) => <PinBadge key={p.key} pin={p} font={font} scale={scale} tx={tx} ty={ty} />)}
              {font &&
                scene.labels
                  // The guide takes the space outside its wall; that wall's length is in the panel.
                  .filter((l) => l.key !== guide?.wallId)
                  .map((l) => <WallLabel key={l.key} label={l} font={font} scale={scale} tx={tx} ty={ty} />)}
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
    // Structural post: a filled square, the standard plan symbol.
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

  const len = Math.hypot(f.b.x - f.a.x, f.b.y - f.a.y) || 1;
  const along = { x: (f.b.x - f.a.x) / len, y: (f.b.y - f.a.y) / len };
  const n = f.inward;
  const at = (p: Pt, d: Pt, k: number): Pt => ({ x: p.x + d.x * k, y: p.y + d.y * k });
  const ink = { color: color.ink, strokeWidth: widths.thin } as const;
  // Jambs: short ticks across the wall at both edges of the opening.
  const jambs = (
    <>
      <Line p1={at(f.a, n, -JAMB_IN)} p2={at(f.a, n, JAMB_IN)} {...ink} />
      <Line p1={at(f.b, n, -JAMB_IN)} p2={at(f.b, n, JAMB_IN)} {...ink} />
    </>
  );

  return (
    <Group>
      {selected && <Line p1={f.a} p2={f.b} color={color.active} strokeWidth={widths.highlight} strokeCap="round" />}
      <Line p1={f.a} p2={f.b} color={color.paper} strokeWidth={widths.gap} />
      {f.kind === 'door' && (
        <>
          {jambs}
          {/* Leaf drawn open at 90° from the hinge, plus its swing back to the other jamb. */}
          <Line p1={f.a} p2={at(f.a, n, len)} {...ink} />
          <Path path={swingArc(f.a, n, along, len)} style="stroke" {...ink} />
        </>
      )}
      {f.kind === 'window' && (
        <>
          {jambs}
          {/* Both wall faces and the glass. */}
          {[-WINDOW_FACE_IN, 0, WINDOW_FACE_IN].map((k) => (
            <Line key={k} p1={at(f.a, n, k)} p2={at(f.b, n, k)} {...ink} />
          ))}
        </>
      )}
      {f.kind === 'opening' && jambs}
      {f.kind === 'step' && (
        <>
          {/* A landing off the wall (outside) with treads parallel to it. */}
          <Path path={stepOutline(f.a, f.b, n)} style="stroke" {...ink} />
          {[1 / 3, 2 / 3].map((k) => (
            <Line key={k} p1={at(f.a, n, -STEP_DEPTH_IN * k)} p2={at(f.b, n, -STEP_DEPTH_IN * k)} {...ink} />
          ))}
        </>
      )}
    </Group>
  );
}

const JAMB_IN = 4;
const WINDOW_FACE_IN = 2.5;
const STEP_DEPTH_IN = 12;

/** Quarter circle from the open leaf's tip to the closing jamb, centred on the hinge. */
function swingArc(hinge: Pt, inward: Pt, along: Pt, radius: number) {
  const b = Skia.PathBuilder.Make();
  for (let i = 0; i <= 16; i++) {
    const t = (i / 16) * (Math.PI / 2);
    const x = hinge.x + (Math.cos(t) * inward.x + Math.sin(t) * along.x) * radius;
    const y = hinge.y + (Math.cos(t) * inward.y + Math.sin(t) * along.y) * radius;
    if (i === 0) b.moveTo(x, y);
    else b.lineTo(x, y);
  }
  return b.build();
}

function stepOutline(a: Pt, b: Pt, inward: Pt) {
  const out = { x: -inward.x * STEP_DEPTH_IN, y: -inward.y * STEP_DEPTH_IN };
  return Skia.PathBuilder.Make()
    .moveTo(a.x, a.y)
    .lineTo(a.x + out.x, a.y + out.y)
    .lineTo(b.x + out.x, b.y + out.y)
    .lineTo(b.x, b.y)
    .build();
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

const GUIDE_OFFSET_PX = 24;
const CORNER_RADIUS_PX = 10;

/**
 * A plan-style dimension line: the yellow corner it is measured from, a blue line with end
 * dots for the distance, drawn just outside the wall so it never hides the wall or the door.
 * Drawn in screen space (from shared values) so its thickness and offset hold at any zoom.
 */
function GuideShape({
  guide,
  scale,
  tx,
  ty,
}: {
  guide: Guide;
  scale: SharedValue<number>;
  tx: SharedValue<number>;
  ty: SharedValue<number>;
}) {
  // World (µm, y up) → screen px. Each derived value reads scale/tx/ty itself: Reanimated only
  // re-runs a derived value for shared values read directly in it, not inside a helper call.
  const ax = guide.a.x / UM_PER_INCH;
  const ay = guide.a.y / UM_PER_INCH;
  const bx = guide.b.x / UM_PER_INCH;
  const by = guide.b.y / UM_PER_INCH;
  const cxIn = guide.corner.x / UM_PER_INCH;
  const cyIn = guide.corner.y / UM_PER_INCH;
  const pushX = guide.normal.x * GUIDE_OFFSET_PX;
  const pushY = -guide.normal.y * GUIDE_OFFSET_PX;

  const a = useDerivedValue(() => ({
    x: ax * scale.get() + tx.get() + pushX,
    y: -ay * scale.get() + ty.get() + pushY,
  }));
  const b = useDerivedValue(() => ({
    x: bx * scale.get() + tx.get() + pushX,
    y: -by * scale.get() + ty.get() + pushY,
  }));
  const aX = useDerivedValue(() => ax * scale.get() + tx.get() + pushX);
  const aY = useDerivedValue(() => -ay * scale.get() + ty.get() + pushY);
  const bX = useDerivedValue(() => bx * scale.get() + tx.get() + pushX);
  const bY = useDerivedValue(() => -by * scale.get() + ty.get() + pushY);
  const cX = useDerivedValue(() => cxIn * scale.get() + tx.get());
  const cY = useDerivedValue(() => -cyIn * scale.get() + ty.get());
  // Extension lines: from the measured points on the wall out to the dimension line, as on a drawing.
  const aOnWall = useDerivedValue(() => ({ x: ax * scale.get() + tx.get(), y: -ay * scale.get() + ty.get() }));
  const bOnWall = useDerivedValue(() => ({ x: bx * scale.get() + tx.get(), y: -by * scale.get() + ty.get() }));
  const hasOffset = guide.normal.x !== 0 || guide.normal.y !== 0;
  return (
    <Group>
      {hasOffset && (
        <>
          <Line p1={aOnWall} p2={a} color={color.guide} strokeWidth={2} />
          <Line p1={bOnWall} p2={b} color={color.guide} strokeWidth={2} />
        </>
      )}
      <Line p1={a} p2={b} color={color.guide} strokeWidth={4} strokeCap="round" />
      <Circle cx={aX} cy={aY} r={6} color={color.guide} />
      <Circle cx={bX} cy={bY} r={6} color={color.guide} />
      {/* The corner the distance is measured from: small, so it never hides a feature's end. */}
      <Circle cx={cX} cy={cY} r={CORNER_RADIUS_PX} color={color.active} />
      <Circle cx={cX} cy={cY} r={CORNER_RADIUS_PX} color={color.ink} style="stroke" strokeWidth={2} />
    </Group>
  );
}

const PIN_RADIUS_PX = 14;
const PIN_OFFSET_PX = 24;

/**
 * An open-comment badge with its count, placed on the inside of its wall or feature: labels and
 * measuring guides are drawn outside, so the two never collide.
 */
function PinBadge({
  pin,
  font,
  scale,
  tx,
  ty,
}: {
  pin: { at: Pt; count: number; inward: Pt };
  font: SkFont;
  scale: SharedValue<number>;
  tx: SharedValue<number>;
  ty: SharedValue<number>;
}) {
  const xIn = pin.at.x / UM_PER_INCH;
  const yIn = pin.at.y / UM_PER_INCH;
  const label = pin.count > 9 ? '9+' : String(pin.count);
  // World y is up, screen y is down.
  const pushX = pin.inward.x * PIN_OFFSET_PX;
  const pushY = -pin.inward.y * PIN_OFFSET_PX;
  const width = useMemo(() => font.measureText(label).width, [font, label]);
  const transform = useDerivedValue(() => [
    { translateX: xIn * scale.get() + tx.get() + pushX },
    { translateY: -yIn * scale.get() + ty.get() + pushY },
  ]);
  return (
    <Group transform={transform}>
      <Circle cx={0} cy={0} r={PIN_RADIUS_PX} color={color.warn} />
      <Circle cx={0} cy={0} r={PIN_RADIUS_PX} color={color.ink} style="stroke" strokeWidth={2} />
      <Text x={-width / 2} y={6} text={label} font={font} color={color.paper} />
    </Group>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.paper },
  canvas: { flex: 1 },
});
