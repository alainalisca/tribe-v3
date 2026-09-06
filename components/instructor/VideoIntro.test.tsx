import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import VideoIntro from './VideoIntro';

/**
 * VideoIntro renders both shapes of users.storefront_video_url: a full
 * Supabase URL on the three legacy rows, and a bare Cloudflare Stream uid on
 * new ones.
 *
 * The click gate has its own tests below and they are the important ones.
 * Cloudflare bills segment requests, and its docs count client side
 * preloading and buffering as billable delivery, so mounting a player before
 * the viewer asks for one charges money on every storefront view. The gate is
 * a cost control and these tests exist to stop it being optimized away.
 */

const HOST = 'customer-test123.cloudflarestream.com';
const UID = 'b236bde30eb07b9d01318940e5fc3eda';
const LEGACY = 'https://twyplulysepbeypqralz.supabase.co/storage/v1/object/public/media/storefront-videos/a.mp4';
const ORIGINAL = process.env.NEXT_PUBLIC_CLOUDFLARE_STREAM_SUBDOMAIN;

beforeEach(() => {
  process.env.NEXT_PUBLIC_CLOUDFLARE_STREAM_SUBDOMAIN = HOST;
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  if (ORIGINAL === undefined) delete process.env.NEXT_PUBLIC_CLOUDFLARE_STREAM_SUBDOMAIN;
  else process.env.NEXT_PUBLIC_CLOUDFLARE_STREAM_SUBDOMAIN = ORIGINAL;
});

function play() {
  fireEvent.click(screen.getByRole('button', { name: 'Play video' }));
}

describe('click gate, the cost control', () => {
  it('mounts NO video and NO iframe before the click, for a legacy URL', () => {
    const { container } = render(<VideoIntro videoUrl={LEGACY} language="en" />);

    expect(container.querySelector('video')).toBeNull();
    expect(container.querySelector('iframe')).toBeNull();
    // The poster and the play affordance are all that render.
    expect(screen.getByRole('button', { name: 'Play video' })).toBeInTheDocument();
  });

  it('mounts NO video and NO iframe before the click, for a Stream uid', () => {
    const { container } = render(<VideoIntro videoUrl={UID} language="en" />);

    expect(container.querySelector('video')).toBeNull();
    expect(container.querySelector('iframe')).toBeNull();
    expect(screen.getByRole('button', { name: 'Play video' })).toBeInTheDocument();
  });
});

describe('legacy direct URL', () => {
  it('renders a native video element with the stored URL after the click', () => {
    const { container } = render(<VideoIntro videoUrl={LEGACY} language="en" />);

    play();

    const video = container.querySelector('video');
    expect(video).not.toBeNull();
    expect(video?.getAttribute('src')).toBe(LEGACY);
    expect(container.querySelector('iframe')).toBeNull();
  });

  it('keeps autoplay, which is allowed because the viewer already clicked', () => {
    const { container } = render(<VideoIntro videoUrl={LEGACY} language="en" />);

    play();

    expect(container.querySelector('video')?.hasAttribute('autoplay')).toBe(true);
  });

  it('uses the posterUrl prop for its poster, as it does today', () => {
    render(<VideoIntro videoUrl={LEGACY} posterUrl="https://cdn.example/banner.jpg" language="en" />);

    expect(screen.getByRole('button', { name: 'Play video' }).querySelector('img')?.getAttribute('src')).toBe(
      'https://cdn.example/banner.jpg'
    );
  });
});

describe('Cloudflare Stream uid', () => {
  it('renders an iframe with autoplay=true and preload=none after the click', () => {
    const { container } = render(<VideoIntro videoUrl={UID} language="en" />);

    play();

    const iframe = container.querySelector('iframe');
    expect(iframe).not.toBeNull();
    expect(iframe?.getAttribute('src')).toBe(`https://${HOST}/${UID}/iframe?autoplay=true&preload=none`);
    expect(container.querySelector('video')).toBeNull();
  });

  it('sets the permissions the Stream player needs, and allows fullscreen', () => {
    const { container } = render(<VideoIntro videoUrl={UID} language="en" />);

    play();

    const iframe = container.querySelector('iframe');
    expect(iframe?.getAttribute('allow')).toBe('accelerometer; gyroscope; encrypted-media; picture-in-picture;');
    expect(iframe?.hasAttribute('allowfullscreen')).toBe(true);
  });

  it('uses the Stream thumbnail as the poster, which bills as an image', () => {
    render(<VideoIntro videoUrl={UID} posterUrl="https://cdn.example/banner.jpg" language="en" />);

    expect(screen.getByRole('button', { name: 'Play video' }).querySelector('img')?.getAttribute('src')).toBe(
      `https://${HOST}/${UID}/thumbnails/thumbnail.jpg`
    );
  });

  it('falls back to the posterUrl prop when the thumbnail fails to load', () => {
    render(<VideoIntro videoUrl={UID} posterUrl="https://cdn.example/banner.jpg" language="en" />);
    const img = screen.getByRole('button', { name: 'Play video' }).querySelector('img');

    fireEvent.error(img as HTMLImageElement);

    expect(screen.getByRole('button', { name: 'Play video' }).querySelector('img')?.getAttribute('src')).toBe(
      'https://cdn.example/banner.jpg'
    );
  });
});

describe('fail closed when the subdomain is not configured', () => {
  it('renders no iframe and no player at all for a uid', () => {
    delete process.env.NEXT_PUBLIC_CLOUDFLARE_STREAM_SUBDOMAIN;

    const { container } = render(<VideoIntro videoUrl={UID} language="en" />);

    expect(container.querySelector('iframe')).toBeNull();
    expect(container.querySelector('video')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Play video' })).toBeNull();
  });

  it('renders nothing at all for a visitor', () => {
    delete process.env.NEXT_PUBLIC_CLOUDFLARE_STREAM_SUBDOMAIN;

    const { container } = render(<VideoIntro videoUrl={UID} language="en" />);

    expect(container).toBeEmptyDOMElement();
  });

  it('shows the owner the same upload prompt an empty column shows', () => {
    delete process.env.NEXT_PUBLIC_CLOUDFLARE_STREAM_SUBDOMAIN;
    const onRequestUpload = vi.fn();

    render(<VideoIntro videoUrl={UID} isOwnStorefront language="en" onRequestUpload={onRequestUpload} />);

    expect(screen.getByText('Add a video introduction')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Upload Video' }));
    expect(onRequestUpload).toHaveBeenCalled();
  });

  it('still plays a legacy URL, which needs no subdomain', () => {
    delete process.env.NEXT_PUBLIC_CLOUDFLARE_STREAM_SUBDOMAIN;

    const { container } = render(<VideoIntro videoUrl={LEGACY} language="en" />);
    play();

    expect(container.querySelector('video')?.getAttribute('src')).toBe(LEGACY);
  });
});

describe('empty column, unchanged behaviour', () => {
  it('renders nothing for a visitor', () => {
    const { container } = render(<VideoIntro videoUrl={null} language="en" />);

    expect(container).toBeEmptyDOMElement();
  });

  it('renders the upload prompt for the owner', () => {
    render(<VideoIntro videoUrl={null} isOwnStorefront language="en" />);

    expect(screen.getByText('Add a video introduction')).toBeInTheDocument();
  });
});
