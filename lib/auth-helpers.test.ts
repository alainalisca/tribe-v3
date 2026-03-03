import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { User } from '@supabase/supabase-js';

// Mock supabase client
const mockMaybeSingle = vi.fn();
const mockUpsert = vi.fn();
const mockEq = vi.fn(() => ({ maybeSingle: mockMaybeSingle }));
const mockSelect = vi.fn(() => ({ eq: mockEq }));
const mockFrom = vi.fn((table: string) => {
  if (table === 'users') {
    return {
      select: mockSelect,
      upsert: mockUpsert,
    };
  }
  return {};
});

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ from: mockFrom }),
}));

vi.mock('@/lib/logger', () => ({
  log: vi.fn(),
  logError: vi.fn(),
}));

import { upsertUserProfile } from './auth-helpers';

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

describe('upsertUserProfile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpsert.mockResolvedValue({ error: null });
  });

  it('creates new user when no existing profile', async () => {
    mockMaybeSingle.mockResolvedValue({ data: null, error: null });

    const user = createMockUser({
      created_at: new Date(Date.now() - 10_000).toISOString(), // 10s ago
    });
    const result = await upsertUserProfile(user);

    expect(result.isNewUser).toBe(true);
    expect(mockFrom).toHaveBeenCalledWith('users');
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'user-123',
        name: 'Test User',
        email: 'test@example.com',
      }),
      { onConflict: 'id' }
    );
  });

  it('updates existing user and detects as not new', async () => {
    mockMaybeSingle.mockResolvedValue({
      data: { id: 'user-123', avatar_url: null, created_at: '2025-01-01' },
      error: null,
    });

    const user = createMockUser({
      created_at: new Date(Date.now() - 120_000).toISOString(), // 2 min ago
    });
    const result = await upsertUserProfile(user);

    expect(result.isNewUser).toBe(false);
    expect(mockUpsert).toHaveBeenCalled();
  });

  it('handles missing email (Apple sign-in)', async () => {
    mockMaybeSingle.mockResolvedValue({ data: null, error: null });

    const user = createMockUser({
      email: undefined,
      created_at: new Date(Date.now() - 5_000).toISOString(),
      user_metadata: { full_name: 'Apple User' },
    });
    const result = await upsertUserProfile(user);

    expect(result.isNewUser).toBe(true);
    // Should not include email in upsert payload
    const upsertPayload = mockUpsert.mock.calls[0][0];
    expect(upsertPayload.email).toBeUndefined();
    expect(upsertPayload.name).toBe('Apple User');
  });

  it('handles missing name — falls back to email prefix', async () => {
    mockMaybeSingle.mockResolvedValue({ data: null, error: null });

    const user = createMockUser({
      email: 'john@gmail.com',
      created_at: new Date(Date.now() - 5_000).toISOString(),
      user_metadata: {},
    });
    const result = await upsertUserProfile(user);

    expect(result.isNewUser).toBe(true);
    const upsertPayload = mockUpsert.mock.calls[0][0];
    expect(upsertPayload.name).toBe('john');
  });

  it('uses displayName override when provided', async () => {
    mockMaybeSingle.mockResolvedValue({ data: null, error: null });

    const user = createMockUser({
      created_at: new Date(Date.now() - 5_000).toISOString(),
    });
    await upsertUserProfile(user, 'Custom Name');

    const upsertPayload = mockUpsert.mock.calls[0][0];
    expect(upsertPayload.name).toBe('Custom Name');
  });

  it('detects new user based on created_at within 60s', async () => {
    mockMaybeSingle.mockResolvedValue({
      data: { id: 'user-123', avatar_url: null, created_at: new Date().toISOString() },
      error: null,
    });

    const user = createMockUser({
      created_at: new Date(Date.now() - 30_000).toISOString(), // 30s ago — within 60s
    });
    const result = await upsertUserProfile(user);

    expect(result.isNewUser).toBe(true);
  });

  it('handles upsert error gracefully', async () => {
    mockMaybeSingle.mockResolvedValue({ data: null, error: null });
    mockUpsert.mockResolvedValue({ error: { message: 'DB error' } });

    const user = createMockUser({
      created_at: new Date(Date.now() - 5_000).toISOString(),
    });
    const result = await upsertUserProfile(user);

    // Should still return result even on error
    expect(result).toHaveProperty('isNewUser');
  });
});
