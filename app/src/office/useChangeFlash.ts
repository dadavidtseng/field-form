import type { Layout } from '@field-form/shared';
import { useEffect, useState } from 'react';

const FLASH_MS = 1200;
const NONE: ReadonlySet<string> = new Set();

/** Walls and features whose object changed. The reducer keeps unchanged ones as the same objects. */
function changedIds(prev: Layout, next: Layout): Set<string> {
  const changed = new Set<string>();
  const prevWalls = new Map(prev.outline.walls.map((w) => [w.id, w]));
  for (const w of next.outline.walls) if (prevWalls.get(w.id) !== w) changed.add(w.id);
  const closingId = next.outline.closingWallId;
  if (
    closingId &&
    (prev.outline.closingWallId !== closingId || prev.outline.closingLength !== next.outline.closingLength)
  ) {
    changed.add(closingId);
  }
  for (const f of Object.values(next.features)) if (prev.features[f.id] !== f) changed.add(f.id);
  return changed;
}

/** Ids of walls and features that just changed, cleared after a moment. The first load flashes nothing. */
export function useChangeFlash(layout: Layout | null): ReadonlySet<string> {
  const [previous, setPrevious] = useState(layout);
  const [flash, setFlash] = useState<ReadonlySet<string>>(NONE);

  // Adjusting state when a prop changes is done during render (React's documented pattern),
  // not in an effect, so the flash appears in the same frame as the change.
  if (layout !== previous) {
    setPrevious(layout);
    const changed = previous && layout ? changedIds(previous, layout) : NONE;
    if (changed.size) setFlash(changed);
  }

  useEffect(() => {
    if (!flash.size) return;
    const timer = setTimeout(() => setFlash(NONE), FLASH_MS);
    return () => clearTimeout(timer);
  }, [flash]);

  return flash;
}
