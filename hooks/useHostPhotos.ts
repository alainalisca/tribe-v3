'use client';

import { useEffect, useState } from 'react';

export type HostPhoto = { url: string; x: number; y: number };

/**
 * T-UI-FD1: the host coach-card photos for the hosts on the feed, one request
 * for the whole page (/api/feed/host-photos). photoFor() answers 'loading'
 * until it lands, then the host's photo or null (no usable photo, or the
 * request failed: the card falls back to its sport colours, never to the
 * session's own photos).
 */
export function useHostPhotos(hostIds: string[]) {
  const key = [...new Set(hostIds.filter(Boolean))].sort().join(',');
  const [state, setState] = useState<{ key: string; photos: Record<string, HostPhoto | null> } | null>(null);

  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    fetch(`/api/feed/host-photos/?ids=${key}`)
      .then((res) => (res.ok ? res.json() : { photos: {} }))
      .catch(() => ({ photos: {} }))
      .then((body: { photos?: Record<string, HostPhoto | null> }) => {
        if (!cancelled) setState({ key, photos: body.photos ?? {} });
      });
    return () => {
      cancelled = true;
    };
  }, [key]);

  const ready = !key || state?.key === key;
  return {
    ready,
    photoFor(hostId: string | null | undefined): HostPhoto | null | 'loading' {
      if (!ready) return 'loading';
      return (hostId && state?.photos[hostId]) || null;
    },
  };
}
