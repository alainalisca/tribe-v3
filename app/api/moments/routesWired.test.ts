import { describe, it, expect, vi } from 'vitest';
import { NextResponse } from 'next/server';

/** T-MOM1: every manager route answers the guard's refusal before doing anything. */
const touched = vi.hoisted(() => ({ n: 0 }));
vi.mock('@/lib/moments/routeGuard', async (orig) => ({
  ...(await orig<typeof import('@/lib/moments/routeGuard')>()),
  guardMomentsManager: async () => ({ ok: false, res: NextResponse.json({ error: 'forbidden' }, { status: 403 }) }),
}));
vi.mock('@/lib/moments/process', () => ({ processMoment: async () => (touched.n++, {}) }));
vi.mock('@/lib/moments/tagging', () => ({ applyTags: async () => (touched.n++, {}) }));
vi.mock('@/lib/moments/deliver', () => ({ deliverSessionMoments: async () => (touched.n++, {}) }));
vi.mock('@/lib/moments/invites', () => ({
  checkInvite: () => ({ ok: true }),
  createInvite: async () => (touched.n++, {}),
}));

import * as state from './[sessionId]/route';
import * as upload from './[sessionId]/upload/route';
import * as tags from './[sessionId]/tags/route';
import * as invites from './[sessionId]/invites/route';
import * as deliver from './[sessionId]/deliver/route';

const params = { params: Promise.resolve({ sessionId: 'cfcafad0-80ec-43ea-a018-eafcf99c8648' }) };
const req = () => new Request('https://x/', { method: 'POST', body: '{}' });

describe('Moments routes refuse a non-manager (T-MOM1)', () => {
  it.each([
    ['state', () => state.GET(req(), params)],
    ['upload', () => upload.POST(req(), params)],
    ['tags', () => tags.POST(req(), params)],
    ['invites', () => invites.POST(req(), params)],
    ['deliver', () => deliver.POST(req(), params)],
  ])('%s', async (_name, call) => {
    expect((await call()).status).toBe(403);
    expect(touched.n).toBe(0);
  });
});
