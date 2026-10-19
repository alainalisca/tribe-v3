'use client';

import { useMemo } from 'react';
import MyMomentos from '@/components/moments/MyMomentos';
import { httpMyMomentsApi } from '@/lib/moments/myApi';
import type { MyMomentsBatch } from '@/lib/moments/types';

/** Momentos with the real API (the server page cannot hand functions to the client). */
export default function MyMomentosClient(props: { initial: MyMomentsBatch[]; openSessionId: string | null }) {
  const api = useMemo(() => httpMyMomentsApi(), []);
  return <MyMomentos {...props} api={api} />;
}
