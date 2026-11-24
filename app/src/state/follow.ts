import { router } from 'expo-router';
import { useEffect } from 'react';
import { create } from 'zustand';
import type { LayoutSummary } from '@field-form/shared';

interface FollowState {
  /** Office opens whatever layout the field is working on. On by default. */
  follow: boolean;
  /** The last live layout we jumped to, so going back to the list doesn't bounce straight in again. */
  lastFollowedId: string | null;
  /** The space an office screen is showing right now, if any. */
  viewingId: string | null;
  setFollow(follow: boolean): void;
}

export const useFollowStore = create<FollowState>((set) => ({
  follow: true,
  lastFollowedId: null,
  viewingId: null,
  setFollow: (follow) => set({ follow }),
}));

/**
 * "Follow field": when a field device opens a different layout, take the office there.
 * Only reacts to a *new* live layout, so Marcus can leave one without being pulled back in.
 */
export function useFollowField(layouts: LayoutSummary[], currentId: string | null) {
  const follow = useFollowStore((s) => s.follow);
  const lastFollowedId = useFollowStore((s) => s.lastFollowedId);
  const viewingId = useFollowStore((s) => s.viewingId);
  const liveId = layouts.find((l) => l.live)?.id ?? null;

  // An open space screen registers itself, so the list underneath it in the stack stays still.
  useEffect(() => {
    if (!currentId) return;
    useFollowStore.setState({ viewingId: currentId });
    return () => {
      if (useFollowStore.getState().viewingId === currentId) useFollowStore.setState({ viewingId: null });
    };
  }, [currentId]);

  useEffect(() => {
    // Only the screen on top follows: the list does nothing while a space screen is open.
    if (currentId === null && viewingId !== null) return;
    if (!follow || !liveId || liveId === currentId || liveId === lastFollowedId) return;
    useFollowStore.setState({ lastFollowedId: liveId });
    const target = { pathname: '/office/[id]', params: { id: liveId } } as const;
    if (currentId) router.replace(target);
    else router.push(target);
  }, [follow, liveId, currentId, lastFollowedId, viewingId]);
}
