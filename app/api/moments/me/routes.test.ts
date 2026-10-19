import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * T-MOM1 Part C: a person's own Momentos routes. Signed out 401, flag off 404,
 * and every read and action goes through the signed-in user's own id: there is
 * no parameter that names another person.
 */
const h = vi.hoisted(() => ({
  enabled: true,
  user: null as { id: string } | null,
  loadedFor: [] as string[],
  tagFor: [] as string[],
  rendered: 0,
}));
vi.mock('@/lib/features/moments', () => ({ isMomentsEnabled: () => h.enabled }));
vi.mock('@/lib/supabase/admin', () => ({ getServiceRoleClient: () => ({}) }));
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: h.user } }) } }),
}));
vi.mock('@/lib/moments/mine', () => ({
  loadMyMoments: async (_s: unknown, userId: string) => (h.loadedFor.push(userId), []),
}));
vi.mock('@/lib/moments/myActions', () => ({
  loadMyTag: async (_s: unknown, userId: string) => (h.tagFor.push(userId), null),
  downloadUrl: async () => 'x',
  thankForPhoto: async () => ({}),
  removeMeFromPhoto: async () => ({}),
  storyInputs: async () => (h.rendered++, null),
  setShowOnCoachPage: async () => (h.rendered++, undefined),
}));
vi.mock('@/lib/moments/story', () => ({ renderStory: async () => (h.rendered++, Buffer.from('x')) }));

import * as list from './route';
import * as download from './[mediaId]/download/route';
import * as thanks from './[mediaId]/thanks/route';
import * as remove from './[mediaId]/remove/route';
import * as story from './[mediaId]/story/route';
import * as coachPage from './[mediaId]/coach-page/route';

const MEDIA = 'cfcafad0-80ec-43ea-a018-eafcf99c8648';
const params = { params: Promise.resolve({ mediaId: MEDIA }) };
const post = () => new Request('https://x/', { method: 'POST', body: '{}' });

beforeEach(() => {
  h.enabled = true;
  h.user = null;
  h.loadedFor = [];
  h.tagFor = [];
  h.rendered = 0;
});

describe('Momentos routes (T-MOM1 Part C)', () => {
  it('signed out: 401 everywhere, nothing read', async () => {
    expect((await list.GET()).status).toBe(401);
    expect((await download.GET(post(), params)).status).toBe(401);
    expect((await thanks.POST(post(), params)).status).toBe(401);
    expect((await remove.POST(post(), params)).status).toBe(401);
    expect(h.loadedFor).toEqual([]);
    expect(h.tagFor).toEqual([]);
  });

  it('flag off: 404', async () => {
    h.enabled = false;
    h.user = { id: 'ana' };
    expect((await list.GET()).status).toBe(404);
  });

  it("reads the signed-in person's own Momentos, and acts only through their own tag (404 when none)", async () => {
    h.user = { id: 'ana' };
    expect((await list.GET()).status).toBe(200);
    expect(h.loadedFor).toEqual(['ana']);
    expect((await thanks.POST(post(), params)).status).toBe(404);
    expect((await download.GET(post(), params)).status).toBe(404);
    expect((await remove.POST(post(), params)).status).toBe(404);
    expect(h.tagFor).toEqual(['ana', 'ana', 'ana']);
  });

  it('a media id that is not a UUID is a 404 before anything is read', async () => {
    h.user = { id: 'ana' };
    const bad = { params: Promise.resolve({ mediaId: '../x' }) };
    expect((await thanks.POST(post(), bad)).status).toBe(404);
    expect(h.tagFor).toEqual([]);
  });

  it('Part D: the story and the coach-page switch only work on a photo the requester is tagged in', async () => {
    h.user = { id: 'ana' };
    expect((await story.GET(post(), params)).status).toBe(404);
    const body = () => new Request('https://x/', { method: 'POST', body: JSON.stringify({ show: true }) });
    expect((await coachPage.POST(body(), params)).status).toBe(404);
    expect(h.tagFor).toEqual(['ana', 'ana']);
    expect(h.rendered).toBe(0);
  });

  it('Part D: signed out, no story', async () => {
    expect((await story.GET(post(), params)).status).toBe(401);
    expect(h.rendered).toBe(0);
  });
});
