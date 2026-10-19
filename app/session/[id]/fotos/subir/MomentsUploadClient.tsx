'use client';

import { useMemo } from 'react';
import MomentsUploader from '@/components/moments/MomentsUploader';
import { httpMomentsApi } from '@/lib/moments/api';
import type { SessionMomentsState } from '@/lib/moments/types';

/** The upload screen with the real API (the server page cannot hand functions to the client). */
export default function MomentsUploadClient(props: {
  sessionId: string;
  sessionTitle: string;
  initial: SessionMomentsState;
}) {
  const api = useMemo(() => httpMomentsApi(props.sessionId), [props.sessionId]);
  return <MomentsUploader {...props} api={api} />;
}
