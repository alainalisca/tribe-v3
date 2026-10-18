// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';

vi.mock('sharp', () => ({
  default: () => ({
    jpeg: () => ({
      toBuffer: async () => {
        throw new Error('sharp is not installed for this platform');
      },
    }),
  }),
}));
vi.mock('@/lib/logger', () => ({ logError: vi.fn() }));

import { cardResponse } from '@/lib/og/card';

/** T-SHARE1 Part B: a card whose JPEG encode fails still goes out, as the PNG. */
describe('cardResponse without sharp', () => {
  it('sends the PNG instead of failing', async () => {
    const res = await cardResponse({ line: ['Preguntas', 'frecuentes'], sub: [], tag: 'Preguntas', lang: 'es' });
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('image/png');
    const head = new Uint8Array(await res.arrayBuffer()).slice(0, 4);
    expect([...head]).toEqual([0x89, 0x50, 0x4e, 0x47]);
  });
});
