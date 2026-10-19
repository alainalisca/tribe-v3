'use client';

import type { DeliveryResult } from './deliver';
import type { MomentItem, SessionMomentsState, TaggablePerson, TagTarget } from './types';

/**
 * T-MOM1: what the upload and tagging screen asks of the server. An interface,
 * so /dev/moments can drive the same screen with an in-memory stand-in and no
 * writes anywhere.
 */
export type MomentsApi = {
  upload(file: Blob, takenAt: string | null, onProgress: (fraction: number) => void): Promise<MomentItem>;
  tag(mediaIds: string[], targets: TagTarget[], mode: 'add' | 'remove'): Promise<SessionMomentsState>;
  createInvite(name: string, phone: string | null): Promise<TaggablePerson>;
  deliver(): Promise<
    Omit<DeliveryResult, 'invites'> & { invites: Array<DeliveryResult['invites'][number] & { whatsappUrl: string | null }> }
  >;
  remove(mediaId: string): Promise<void>;
};

export class MomentsApiError extends Error {
  constructor(
    public status: number,
    public code: string
  ) {
    super(code);
  }
}

async function json<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new MomentsApiError(res.status, (body as { error?: string }).error ?? 'request_failed');
  return body as T;
}

export function httpMomentsApi(sessionId: string): MomentsApi {
  const base = `/api/moments/${sessionId}`;
  const post = (path: string, body?: unknown) =>
    fetch(`${base}/${path}/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  return {
    upload: (file, takenAt, onProgress) =>
      new Promise((resolve, reject) => {
        const form = new FormData();
        form.append('file', file, 'photo.jpg');
        if (takenAt) form.append('takenAt', takenAt);
        const xhr = new XMLHttpRequest();
        xhr.open('POST', `${base}/upload/`);
        xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
        xhr.onload = () => {
          let body: unknown = {};
          try {
            body = JSON.parse(xhr.responseText);
          } catch {
            /* not JSON */
          }
          if (xhr.status >= 200 && xhr.status < 300) resolve(body as MomentItem);
          else reject(new MomentsApiError(xhr.status, (body as { error?: string }).error ?? 'upload_failed'));
        };
        xhr.onerror = () => reject(new MomentsApiError(0, 'network'));
        xhr.send(form);
      }),
    tag: async (mediaIds, targets, mode) => json(await post('tags', { mediaIds, targets, mode })),
    createInvite: async (name, phone) => json(await post('invites', { name, phone })),
    deliver: async () => json(await post('deliver')),
    remove: async (mediaId) => {
      await json(await fetch(`${base}/media/${mediaId}/`, { method: 'DELETE' }));
    },
  };
}
