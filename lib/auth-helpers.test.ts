import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { User } from '@supabase/supabase-js';

/**
 * T-AUTH3. The sign-in profile sync must never send `users.email` through an
 * upsert's UPDATE path (it reads EXCLUDED.email, which migration 118 revoked,
 * and the whole statement fails with 42501). These tests pin the two shapes
 * that replaced it: INSERT for a missing row, UPDATE of name/avatar_url only
 * for an existing one. `mockUpsert` exists so that a regression to `.upsert()`
 * is recorded and asserted against, not merely crashed into.
 */
const mockMaybeSingle = vi.fn();
const mockUpsert = vi.fn();
const mockInsert = vi.fn((_row: Record<string, unknown>) => Promise.resolve({ error: null as unknown }));
const mockUpdateSelect = vi.fn();
const mockUpdateEq = vi.fn(() => ({ select: mockUpdateSelect }));
const mockUpdate = vi.fn((_fields: Record<string, unknown>) => ({ eq: mockUpdateEq }));
const mockEq = vi.fn(() => ({ maybeSingle: mockMaybeSingle }));
const mockSelect = vi.fn(() => ({ eq: mockEq }));
const mockFrom = vi.fn((table: string) => {
  if (table === 'users') {
    return { select: mockSelect, upsert: mockUpsert, insert: mockInsert, update: mockUpdate };
  }
  return {};
});

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ from: mockFrom }),
}));

const mockLogError = vi.fn();
vi.mock('@/lib/logger', () => ({
  log: vi.fn(),
  logError: (...args: unknown[]) => mockLogError(...args),
}));

vi.mock('@/lib/signupAttributionClient', () => ({ sendSignupAttribution: vi.fn() }));

import { upsertUserProfile } from './auth-helpers';
import { sendSignupAttribution } from '@/lib/signupAttributionClient';

function createMockUser(overrides: Partial<User> = {}): User {
  return {
    id: 'user-123',
    email: 'test@example.com',
    created_at: new Date(Date.now() - 120_000).toISOString(), // 2 min ago (existing)
    app_metadata: {},
    user_metadata: {
      full_name: 'Test User',
      avatar_url: 'https://example.com/avatar.jpg',
    },
    aud: 'authenticated',
    ...overrides,
  } as User;
}

interface ExistingRow {
  name: string | null;
  avatar_url: string | null;
}

function existingProfile(row: ExistingRow) {
  mockMaybeSingle.mockResolvedValue({
    data: { id: 'user-123', created_at: '2025-01-01', ...row },
    error: null,
  });
}

function noProfile() {
  mockMaybeSingle.mockResolvedValue({ data: null, error: null });
}

const recent = () => new Date(Date.now() - 5_000).toISOString();
const updatePayload = () => mockUpdate.mock.calls[0][0];
const insertPayload = () => mockInsert.mock.calls[0][0];
const loggedActions = () => mockLogError.mock.calls.map((c) => (c[1] as { action: string }).action);

describe('upsertUserProfile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInsert.mockResolvedValue({ error: null });
    mockUpdateSelect.mockResolvedValue({ data: [{ id: 'user-123' }], error: null });
  });

  describe('T-AUTH3: no upsert, no email on an existing row', () => {
    it('never calls upsert on users, for a new or an existing row', async () => {
      noProfile();
      await upsertUserProfile(createMockUser({ created_at: recent() }));
      existingProfile({ name: null, avatar_url: null });
      await upsertUserProfile(createMockUser());
      expect(mockUpsert).not.toHaveBeenCalled();
    });

    it('updates an existing row WITHOUT email, which is what the revoked grant refused', async () => {
      existingProfile({ name: null, avatar_url: null });
      await upsertUserProfile(createMockUser());
      expect(mockUpdate).toHaveBeenCalledTimes(1);
      expect(updatePayload()).not.toHaveProperty('email');
      expect(updatePayload()).not.toHaveProperty('id');
      expect(mockUpdateEq).toHaveBeenCalledWith('id', 'user-123');
    });

    it('inserts a missing row WITH email (NOT NULL), and does not update', async () => {
      noProfile();
      await upsertUserProfile(createMockUser({ created_at: recent() }));
      expect(insertPayload()).toEqual({
        id: 'user-123',
        name: 'Test User',
        email: 'test@example.com',
        avatar_url: 'https://example.com/avatar.jpg',
      });
      expect(mockUpdate).not.toHaveBeenCalled();
    });

    it('writes nothing for a returning user whose name and photo are already set', async () => {
      existingProfile({ name: 'Edited Name', avatar_url: 'https://cdn.tribe/uploaded.jpg' });
      await upsertUserProfile(createMockUser());
      expect(mockUpdate).not.toHaveBeenCalled();
      expect(mockInsert).not.toHaveBeenCalled();
      expect(mockLogError).not.toHaveBeenCalled();
    });
  });

  describe('new users', () => {
    it('reports a new user when there is no profile', async () => {
      noProfile();
      const result = await upsertUserProfile(createMockUser({ created_at: recent() }));
      expect(result.isNewUser).toBe(true);
    });

    it('omits email when Apple withholds it', async () => {
      noProfile();
      await upsertUserProfile(
        createMockUser({ email: undefined, created_at: recent(), user_metadata: { full_name: 'Apple User' } })
      );
      expect(insertPayload()).not.toHaveProperty('email');
      expect(insertPayload().name).toBe('Apple User');
    });

    it('falls back to the email prefix for a name', async () => {
      noProfile();
      await upsertUserProfile(createMockUser({ email: 'john@gmail.com', created_at: recent(), user_metadata: {} }));
      expect(insertPayload().name).toBe('john');
    });

    it('uses an explicit displayName', async () => {
      noProfile();
      await upsertUserProfile(createMockUser({ created_at: recent() }), 'Custom Name');
      expect(insertPayload().name).toBe('Custom Name');
    });

    it('takes user_metadata.picture (Google) when avatar_url is absent', async () => {
      noProfile();
      await upsertUserProfile(
        createMockUser({ created_at: recent(), user_metadata: { full_name: 'G', picture: 'https://google/p.jpg' } })
      );
      expect(insertPayload().avatar_url).toBe('https://google/p.jpg');
    });

    it('on a race with handle_new_user (23505), fills only the photo by UPDATE', async () => {
      noProfile();
      mockInsert.mockResolvedValue({ error: { message: 'duplicate key', code: '23505' } });
      await upsertUserProfile(createMockUser({ created_at: recent() }));
      expect(updatePayload()).toEqual({ avatar_url: 'https://example.com/avatar.jpg' });
      expect(mockLogError).not.toHaveBeenCalled();
    });

    it('logs an insert that fails for any other reason', async () => {
      noProfile();
      mockInsert.mockResolvedValue({ error: { message: 'new row violates row-level security policy', code: '42501' } });
      const result = await upsertUserProfile(createMockUser({ created_at: recent() }));
      expect(result).toHaveProperty('isNewUser');
      expect(loggedActions()).toContain('upsertUserProfile.insert');
      expect(mockUpdate).not.toHaveBeenCalled();
    });
  });

  describe('existing users: name (fix/oauth-name-overwrite, folded in)', () => {
    it('does NOT overwrite an edited name with the provider name on re-login', async () => {
      existingProfile({ name: 'Edited Name', avatar_url: null });
      await upsertUserProfile(
        createMockUser({ user_metadata: { full_name: 'Google Name', avatar_url: 'https://g/a.jpg' } })
      );
      expect(updatePayload()).not.toHaveProperty('name');
    });

    it('fills a blank name from the provider', async () => {
      existingProfile({ name: '   ', avatar_url: 'https://cdn.tribe/x.jpg' });
      await upsertUserProfile(createMockUser());
      expect(updatePayload()).toEqual({ name: 'Test User' });
    });

    it('lets an explicit displayName win over an existing name', async () => {
      existingProfile({ name: 'Old Name', avatar_url: 'https://cdn.tribe/x.jpg' });
      await upsertUserProfile(createMockUser(), 'Real Apple Name');
      expect(updatePayload()).toEqual({ name: 'Real Apple Name' });
    });
  });

  describe('existing users: avatar', () => {
    it('fills an empty avatar from the provider photo', async () => {
      existingProfile({ name: 'Test User', avatar_url: null });
      await upsertUserProfile(
        createMockUser({ user_metadata: { full_name: 'Test User', avatar_url: 'https://google/provider.jpg' } })
      );
      expect(updatePayload()).toEqual({ avatar_url: 'https://google/provider.jpg' });
    });

    it('does NOT overwrite an uploaded avatar with the provider photo', async () => {
      existingProfile({ name: 'Test User', avatar_url: 'https://cdn.tribe/custom-upload.jpg' });
      await upsertUserProfile(
        createMockUser({ user_metadata: { full_name: 'Test User', avatar_url: 'https://google/p.jpg' } })
      );
      expect(mockUpdate).not.toHaveBeenCalled();
    });

    it('does NOT null an avatar when the provider has no photo (Apple)', async () => {
      existingProfile({ name: null, avatar_url: 'https://cdn.tribe/uploaded.jpg' });
      await upsertUserProfile(createMockUser({ email: undefined, user_metadata: { full_name: 'Apple User' } }));
      expect(updatePayload()).not.toHaveProperty('avatar_url');
    });

    it('logs an update that fails', async () => {
      existingProfile({ name: null, avatar_url: null });
      mockUpdateSelect.mockResolvedValue({ data: null, error: { message: 'permission denied for table users' } });
      await upsertUserProfile(createMockUser());
      expect(loggedActions()).toContain('upsertUserProfile.update');
    });
  });

  describe('when the profile read fails', () => {
    it('writes nothing, and says why', async () => {
      mockMaybeSingle.mockResolvedValue({ data: null, error: { message: 'timeout' } });
      await upsertUserProfile(createMockUser());
      expect(mockInsert).not.toHaveBeenCalled();
      expect(mockUpdate).not.toHaveBeenCalled();
      expect(loggedActions()).toContain('upsertUserProfile.read');
    });
  });

  it('detects a new user from created_at within 60s even when the row exists', async () => {
    existingProfile({ name: 'X', avatar_url: 'https://cdn.tribe/x.jpg' });
    const result = await upsertUserProfile(createMockUser({ created_at: new Date(Date.now() - 30_000).toISOString() }));
    expect(result.isNewUser).toBe(true);
  });

  it('reports an existing user as not new', async () => {
    existingProfile({ name: 'X', avatar_url: 'https://cdn.tribe/x.jpg' });
    const result = await upsertUserProfile(createMockUser());
    expect(result.isNewUser).toBe(false);
  });

  /**
   * T-GROW1 part C. The send is NOT gated on isNewUser: that test is a 60
   * second heuristic, and an email signup that types its OTP a minute late
   * reads as an existing user. The server decides; the client always sends.
   */
  it('sends signup attribution even when the 60 second heuristic says "not new"', async () => {
    existingProfile({ name: null, avatar_url: null });
    const result = await upsertUserProfile(createMockUser());
    expect(result.isNewUser).toBe(false);
    expect(sendSignupAttribution).toHaveBeenCalledWith('user-123');
  });
});
