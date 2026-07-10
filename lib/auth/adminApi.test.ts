import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';

// --- mocks -----------------------------------------------------------------
const mockGetUser = vi.fn();
const mockRpc = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
    rpc: mockRpc,
  })),
}));

// Service-role client factory — return a sentinel so we can assert it's only
// constructed (and returned) on the fully-authorized path.
const SERVICE_SENTINEL = { __service: true };
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => SERVICE_SENTINEL),
}));

vi.mock('@/lib/logger', () => ({ logError: vi.fn() }));

import { requireApiAdmin } from './adminApi';

const OLD_ENV = { ...process.env };

describe('requireApiAdmin — fail-closed admin gate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://x.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key';
  });

  async function statusOf(gate: Awaited<ReturnType<typeof requireApiAdmin>>): Promise<number> {
    // On the fail path `response` is a NextResponse; read its status.
    return gate.ok ? 200 : gate.response.status;
  }

  it('403 when there is NO authenticated user (missing auth)', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });
    const gate = await requireApiAdmin();
    expect(gate.ok).toBe(false);
    expect(await statusOf(gate)).toBe(403);
    expect(mockRpc).not.toHaveBeenCalled(); // never even checks admin
  });

  it('403 when getUser errors', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: { message: 'boom' } });
    const gate = await requireApiAdmin();
    expect(gate.ok).toBe(false);
    expect(await statusOf(gate)).toBe(403);
  });

  it('403 when the caller is NOT an admin (is_app_admin = false)', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null });
    mockRpc.mockResolvedValue({ data: false, error: null });
    const gate = await requireApiAdmin();
    expect(gate.ok).toBe(false);
    expect(await statusOf(gate)).toBe(403);
  });

  it('403 when is_app_admin errors', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null });
    mockRpc.mockResolvedValue({ data: null, error: { message: 'rpc failed' } });
    const gate = await requireApiAdmin();
    expect(gate.ok).toBe(false);
    expect(await statusOf(gate)).toBe(403);
  });

  it('403 when is_app_admin returns a non-true value (strict boolean check)', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null });
    // e.g. a truthy-but-not-true value must NOT pass
    mockRpc.mockResolvedValue({ data: 'true', error: null });
    const gate = await requireApiAdmin();
    expect(gate.ok).toBe(false);
    expect(await statusOf(gate)).toBe(403);
  });

  it('403 when the service-role env is missing (never falls through to a read)', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null });
    mockRpc.mockResolvedValue({ data: true, error: null });
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    const gate = await requireApiAdmin();
    expect(gate.ok).toBe(false);
    expect(await statusOf(gate)).toBe(403);
  });

  it('403 when anything throws', async () => {
    mockGetUser.mockRejectedValue(new Error('unexpected'));
    const gate = await requireApiAdmin();
    expect(gate.ok).toBe(false);
    expect(await statusOf(gate)).toBe(403);
  });

  it('ONLY the fully-authorized admin path returns the service-role client', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'admin-1' } }, error: null });
    mockRpc.mockResolvedValue({ data: true, error: null });
    const gate = await requireApiAdmin();
    expect(gate.ok).toBe(true);
    if (gate.ok) {
      expect(gate.userId).toBe('admin-1');
      expect(gate.service).toBe(SERVICE_SENTINEL);
    }
    expect(mockRpc).toHaveBeenCalledWith('is_app_admin');
  });

  afterAll(() => {
    process.env = OLD_ENV;
  });
});
