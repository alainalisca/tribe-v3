import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';

/**
 * The upload order is the point of these tests.
 *
 *   1. remember the current value
 *   2. upload to Cloudflare
 *   3. write the new uid
 *   4. only then delete the old video
 *
 * Deleting before a confirmed write can leave an instructor with no video at
 * all, so the sequence is asserted rather than assumed. A delete that fails
 * after step 3 is our billing leak and not their problem, so it must stay
 * silent.
 */

const {
  mockUpdateStorefrontProfile,
  mockShowError,
  mockShowSuccess,
  mockShowInfo,
  mockValidateSync,
  mockValidateDuration,
} = vi.hoisted(() => ({
  mockUpdateStorefrontProfile: vi.fn(),
  mockShowError: vi.fn(),
  mockShowSuccess: vi.fn(),
  mockShowInfo: vi.fn(),
  mockValidateSync: vi.fn(),
  mockValidateDuration: vi.fn(),
}));

vi.mock('@/lib/dal/instructorDashboard', () => ({ updateStorefrontProfile: mockUpdateStorefrontProfile }));
vi.mock('@/lib/toast', () => ({ showError: mockShowError, showSuccess: mockShowSuccess, showInfo: mockShowInfo }));
vi.mock('@/lib/videoValidation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/videoValidation')>()),
  validateVideoSync: mockValidateSync,
  validateVideoDuration: mockValidateDuration,
}));
const TEMPLATES: Record<string, string> = {
  videoTooLarge: 'That video is {size} MB and the limit is {limit} MB.',
  videoLargeFileWarning: 'This video is {size} MB and may take several minutes.',
};
vi.mock('@/lib/LanguageContext', () => ({
  useLanguage: () => ({ t: (k: string) => TEMPLATES[k] ?? k, language: 'en' }),
}));
vi.mock('@/lib/logger', () => ({ logError: vi.fn() }));

import VideoUploadSection from './VideoUploadSection';

const HOST = 'customer-test123.cloudflarestream.com';
const NEW_UID = 'newuid00000000000000000000000000';
const OLD_UID = 'olduid00000000000000000000000000';
const LEGACY = 'https://x.supabase.co/storage/v1/object/public/media/storefront-videos/u1/intro.mp4';
const ORIGINAL_SUBDOMAIN = process.env.NEXT_PUBLIC_CLOUDFLARE_STREAM_SUBDOMAIN;

const supabase = { storage: { from: () => ({ remove: vi.fn().mockResolvedValue({ error: null }) }) } };
let calls: string[] = [];
let fetchMock: ReturnType<typeof vi.fn>;

function mintOk() {
  return {
    ok: true,
    status: 200,
    json: async () => ({ success: true, data: { uploadURL: 'https://upload.videodelivery.net/tok', uid: NEW_UID } }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  calls = [];
  process.env.NEXT_PUBLIC_CLOUDFLARE_STREAM_SUBDOMAIN = HOST;
  mockValidateSync.mockReturnValue(null);
  mockValidateDuration.mockResolvedValue(null);
  mockUpdateStorefrontProfile.mockImplementation(async () => {
    calls.push('write');
    return { success: true };
  });

  fetchMock = vi.fn(async (url: string) => {
    if (String(url).includes('/api/video/direct-upload/')) {
      calls.push('mint');
      return mintOk();
    }
    if (String(url).includes('upload.videodelivery.net')) {
      calls.push('upload');
      return { ok: true, status: 200, json: async () => ({}) };
    }
    if (String(url).includes('/api/video/delete/')) {
      calls.push('delete');
      return { ok: true, status: 200, json: async () => ({ success: true }) };
    }
    throw new Error(`unexpected fetch ${url}`);
  });
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  if (ORIGINAL_SUBDOMAIN === undefined) delete process.env.NEXT_PUBLIC_CLOUDFLARE_STREAM_SUBDOMAIN;
  else process.env.NEXT_PUBLIC_CLOUDFLARE_STREAM_SUBDOMAIN = ORIGINAL_SUBDOMAIN;
});

function renderSection(initial: string | null) {
  return render(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    <VideoUploadSection supabase={supabase as any} userId="u1" initialVideoUrl={initial} />
  );
}

function selectFile(container: HTMLElement, size = 8) {
  const input = container.querySelector('input[type="file"]') as HTMLInputElement;
  const file = new File([new Uint8Array(8)], 'clip.mov', { type: 'video/quicktime' });
  // Report a size without allocating it. Real 4K clips are hundreds of MB and
  // the component only ever reads file.size.
  Object.defineProperty(file, 'size', { value: size });
  fireEvent.change(input, { target: { files: [file] } });
}

describe('upload flow', () => {
  it('writes the bare uid, never a URL', async () => {
    const { container } = renderSection(null);

    selectFile(container);

    await waitFor(() => expect(mockUpdateStorefrontProfile).toHaveBeenCalled());
    expect(mockUpdateStorefrontProfile).toHaveBeenCalledWith(expect.anything(), 'u1', {
      storefront_video_url: NEW_UID,
    });
  });

  it('sends the bytes straight to Cloudflare as multipart, never through Vercel', async () => {
    const { container } = renderSection(null);

    selectFile(container);

    await waitFor(() => expect(calls).toContain('upload'));
    const uploadCall = fetchMock.mock.calls.find((c) => String(c[0]).includes('upload.videodelivery.net'));
    const init = uploadCall?.[1] as RequestInit;
    expect(init.method).toBe('POST');
    expect(init.body).toBeInstanceOf(FormData);
    expect((init.body as FormData).get('file')).toBeInstanceOf(File);
  });

  it('accepts a .MOV, which the old MP4 only rule rejected', async () => {
    const { container } = renderSection(null);

    selectFile(container);

    await waitFor(() => expect(mockShowSuccess).toHaveBeenCalledWith('videoSaved'));
    expect(mockShowError).not.toHaveBeenCalled();
  });
});

describe('ordering, the load bearing part', () => {
  it('deletes the old Stream video only AFTER the new uid is written', async () => {
    const { container } = renderSection(OLD_UID);

    selectFile(container);

    await waitFor(() => expect(calls).toContain('delete'));
    expect(calls).toEqual(['mint', 'upload', 'write', 'delete']);
    expect(calls.indexOf('write')).toBeLessThan(calls.indexOf('delete'));
  });

  it('sends the OLD uid to the delete route, not the new one', async () => {
    const { container } = renderSection(OLD_UID);

    selectFile(container);

    await waitFor(() => expect(calls).toContain('delete'));
    const deleteCall = fetchMock.mock.calls.find((c) => String(c[0]).includes('/api/video/delete/'));
    expect(JSON.parse(String((deleteCall?.[1] as RequestInit).body))).toEqual({ uid: OLD_UID });
  });

  it('never deletes when the previous value was a legacy Supabase URL', async () => {
    const { container } = renderSection(LEGACY);

    selectFile(container);

    await waitFor(() => expect(mockShowSuccess).toHaveBeenCalled());
    expect(calls).not.toContain('delete');
  });

  it('does not delete anything when there was no previous video', async () => {
    const { container } = renderSection(null);

    selectFile(container);

    await waitFor(() => expect(mockShowSuccess).toHaveBeenCalled());
    expect(calls).not.toContain('delete');
  });

  it('never writes or deletes when the upload to Cloudflare fails', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (String(url).includes('/api/video/direct-upload/')) return mintOk();
      if (String(url).includes('upload.videodelivery.net')) return { ok: false, status: 400, json: async () => ({}) };
      throw new Error('should not reach delete');
    });
    const { container } = renderSection(OLD_UID);

    selectFile(container);

    await waitFor(() => expect(mockShowError).toHaveBeenCalledWith('videoUploadError'));
    expect(mockUpdateStorefrontProfile).not.toHaveBeenCalled();
  });

  it('stays silent when the cleanup delete fails, since the profile is already correct', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (String(url).includes('/api/video/direct-upload/')) return mintOk();
      if (String(url).includes('upload.videodelivery.net')) return { ok: true, status: 200, json: async () => ({}) };
      if (String(url).includes('/api/video/delete/')) return { ok: false, status: 502, json: async () => ({}) };
      throw new Error('unexpected');
    });
    const { container } = renderSection(OLD_UID);

    selectFile(container);

    await waitFor(() => expect(mockShowSuccess).toHaveBeenCalledWith('videoSaved'));
    expect(mockShowError).not.toHaveBeenCalled();
  });
});

describe('size ceiling, checked before any mint is spent', () => {
  it('rejects an oversize file WITHOUT calling the mint route', async () => {
    mockValidateSync.mockReturnValue('too_large');
    const { container } = renderSection(null);

    selectFile(container, 1024);

    await waitFor(() => expect(mockShowError).toHaveBeenCalled());
    // The whole point: no direct upload URL was minted, so no storage was
    // reserved on Cloudflare for a file that can never be sent.
    expect(calls).not.toContain('mint');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mockUpdateStorefrontProfile).not.toHaveBeenCalled();
  });

  it('names the actual size and the limit, so the message is actionable', async () => {
    mockValidateSync.mockReturnValue('too_large');
    const { container } = renderSection(null);

    selectFile(container, 200 * 1024 * 1024);

    await waitFor(() => expect(mockShowError).toHaveBeenCalled());
    const message = mockShowError.mock.calls[0][0] as string;
    expect(message).toContain('200');
    expect(message).toContain('180');
    expect(message).not.toContain('{size}');
    expect(message).not.toContain('{limit}');
  });

  it('does not warn about slowness for a file it already rejected', async () => {
    mockValidateSync.mockReturnValue('too_large');
    const { container } = renderSection(null);

    selectFile(container, 200 * 1024 * 1024);

    await waitFor(() => expect(mockShowError).toHaveBeenCalled());
    expect(mockShowInfo).not.toHaveBeenCalled();
  });
});

describe('slow upload warning', () => {
  it('warns and still proceeds for a large but allowed file', async () => {
    const { container } = renderSection(null);

    selectFile(container, 120 * 1024 * 1024);

    await waitFor(() => expect(mockShowSuccess).toHaveBeenCalledWith('videoSaved'));
    expect(mockShowInfo).toHaveBeenCalled();
    expect(mockShowInfo.mock.calls[0][0]).toContain('120');
    expect(calls).toEqual(['mint', 'upload', 'write']);
  });

  it('stays quiet for a small file', async () => {
    const { container } = renderSection(null);

    selectFile(container, 1024);

    await waitFor(() => expect(mockShowSuccess).toHaveBeenCalled());
    expect(mockShowInfo).not.toHaveBeenCalled();
  });
});

describe('fail closed when the mint route is unconfigured', () => {
  it('disables the uploader and never touches Cloudflare after a 503', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (String(url).includes('/api/video/direct-upload/')) {
        return { ok: false, status: 503, json: async () => ({ success: false, error: 'stream_not_configured' }) };
      }
      throw new Error('must not upload when unconfigured');
    });
    const { container } = renderSection(null);

    selectFile(container);

    await waitFor(() => expect(screen.getByText('videoUnavailable')).toBeInTheDocument());
    expect(container.querySelector('input[type="file"]')).toBeNull();
    expect(mockUpdateStorefrontProfile).not.toHaveBeenCalled();
  });
});

describe('preview keeps the click gate', () => {
  it('mounts no iframe for a Stream uid until the instructor asks to watch', () => {
    const { container } = renderSection(OLD_UID);

    expect(container.querySelector('iframe')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'playVideo' }));

    expect(container.querySelector('iframe')?.getAttribute('src')).toBe(
      `https://${HOST}/${OLD_UID}/iframe?autoplay=true&preload=none`
    );
  });

  it('renders a legacy URL in a native video element, as before', () => {
    const { container } = renderSection(LEGACY);

    expect(container.querySelector('video')?.getAttribute('src')).toBe(LEGACY);
    expect(container.querySelector('iframe')).toBeNull();
  });
});
