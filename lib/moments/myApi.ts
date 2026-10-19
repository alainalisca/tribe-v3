import { MomentsApiError } from './api';
import type { MyMomentsBatch } from './types';

/**
 * T-MOM1 Part C: what a person's own Momentos screen and viewer call. An
 * interface, so /dev/moments can hand the same screens an in-memory stand-in.
 */
export interface MyMomentsApi {
  load(): Promise<MyMomentsBatch[]>;
  download(mediaId: string): Promise<string>;
  thanks(mediaId: string): Promise<void>;
  remove(mediaId: string, requestDelete: boolean): Promise<{ requested: boolean }>;
}

async function json<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new MomentsApiError(res.status, (body as { error?: string }).error ?? 'request_failed');
  return body as T;
}

export function httpMyMomentsApi(): MyMomentsApi {
  const post = (path: string, body?: unknown) =>
    fetch(`/api/moments/me/${path}/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body ?? {}),
    });
  return {
    load: async () => (await json<{ batches: MyMomentsBatch[] }>(await fetch('/api/moments/me/'))).batches,
    download: async (id) => (await json<{ url: string }>(await fetch(`/api/moments/me/${id}/download/`))).url,
    thanks: async (id) => {
      await json(await post(`${id}/thanks`));
    },
    remove: async (id, requestDelete) =>
      json<{ requested: boolean }>(await post(`${id}/remove`, requestDelete ? { requestDelete: true } : {})),
  };
}
