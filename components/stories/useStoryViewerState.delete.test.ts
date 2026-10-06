/**
 * Since migration 199 the story viewer holds SIGNED URLs, so deleting a story
 * must find its file from /object/sign/... too. Before this change the hook
 * parsed only /object/public/ and would have deleted the row while leaving the
 * private file behind, silently.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { StoryGroup } from './storyTypes';

const remove = vi.fn(async () => ({ data: [], error: null }));
const storageFrom = vi.fn(() => ({ remove }));
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({ storage: { from: storageFrom } }) }));
vi.mock('@/lib/dal', () => ({ deleteSessionStory: vi.fn(async () => ({ success: true })) }));
vi.mock('@/lib/toast', () => ({ showSuccess: vi.fn(), showError: vi.fn() }));
vi.mock('@/lib/logger', () => ({ logError: vi.fn() }));
vi.mock('@/lib/LanguageContext', () => ({ useLanguage: () => ({ language: 'en' }) }));

import { useStoryViewerState } from './useStoryViewerState';

const S = '11111111-1111-1111-1111-111111111111';
const U = '22222222-2222-2222-2222-222222222222';
const SIGN = 'https://abc.supabase.co/storage/v1/object/sign/session-stories';

function groupWith(media_url: string, thumbnail_url: string | null): StoryGroup[] {
  return [
    {
      sessionId: S,
      sport: 'Running',
      stories: [
        {
          id: 'st1',
          media_url,
          media_type: 'video',
          thumbnail_url,
          caption: null,
          created_at: '2026-10-04T00:00:00Z',
          user_id: U,
          user_name: 'Ana',
          user_avatar: null,
        },
      ],
    },
  ];
}

beforeEach(() => {
  remove.mockClear();
  storageFrom.mockClear();
});

describe('useStoryViewerState delete', () => {
  it('removes the media and thumbnail files when the viewer holds signed URLs', async () => {
    const { result } = renderHook(() =>
      useStoryViewerState({
        initialGroups: groupWith(`${SIGN}/${S}/${U}/v.mp4?token=a.b.c`, `${SIGN}/${S}/${U}/v_thumb.jpg?token=d.e.f`),
        startGroupIndex: 0,
        currentUserId: U,
        onClose: vi.fn(),
        onStorySeen: vi.fn(),
      })
    );
    await act(async () => {
      await result.current.handleDeleteStory();
    });
    expect(storageFrom).toHaveBeenCalledWith('session-stories');
    expect(remove).toHaveBeenNthCalledWith(1, [`${S}/${U}/v.mp4`]);
    expect(remove).toHaveBeenNthCalledWith(2, [`${S}/${U}/v_thumb.jpg`]);
  });
});
