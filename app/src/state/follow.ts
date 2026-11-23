import { router } from 'expo-router';
import { useEffect } from 'react';
import { create } from 'zustand';
import type { LayoutSummary } from '@field-form/shared';

interface FollowState {
  /** Office opens whatever layout the field is working on. On by default. */
  follow: boolean;
  /** The last live layout we jumped to, so going back to the list doesn't bounce straight in again. */
  lastFollowedId: string | null;
  setFollow(follow: boolean): void;
}

export const useFollowStore = create<FollowState>((set) => ({
  follow: true,
  lastFollowedId: null,
  setFollow: (follow) => set({ follow }),
}));

/**
 * "Follow Dana": when a field device opens a different layout, take the office there.
 * Only reacts to a *new* live layout, so Marcus can leave one without being pulled back in.
 */
export function useFollowDana(layouts: LayoutSummary[], currentId: string | null) {
  const follow = useFollowStore((s) => s.follow);
  const lastFollowedId = useFollowStore((s) => s.lastFollowedId);
  const liveId = layouts.find((l) => l.live)?.id ?? null;

  useEffect(() => {
    if (!follow || !liveId || liveId === currentId || liveId === lastFollowedId) return;
    useFollowStore.setState({ lastFollowedId: liveId });
    const target = { pathname: '/office/[id]', params: { id: liveId } } as const;
    if (currentId) router.replace(target);
    else router.push(target);
  }, [follow, liveId, currentId, lastFollowedId]);
}
