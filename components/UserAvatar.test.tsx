import { describe, it, expect } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import UserAvatar from './UserAvatar';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';

/** T-JOIN1 Part C: never a broken image, never a stock photo. */
describe('UserAvatar', () => {
  it('shows the photo when the URL is usable', () => {
    const { container } = render(
      <UserAvatar src="https://x.supabase.co/a.jpg" name="Ana Gómez" className="h-10 w-10" />
    );
    expect(container.querySelector('img')).toHaveAttribute('src', 'https://x.supabase.co/a.jpg');
  });

  it('shows the initials for an Unsplash stock photo', () => {
    const { container } = render(<UserAvatar src="https://images.unsplash.com/photo-1" name="Ana Gómez" />);
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByText('AG')).toBeInTheDocument();
  });

  it('falls back to the initials when the image fails to load', () => {
    const { container } = render(<UserAvatar src="https://x.supabase.co/gone.jpg" name="Neera Yoga" />);
    fireEvent.error(container.querySelector('img')!);
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByText('NY')).toBeInTheDocument();
  });

  it("uses the caller's fallback when given one", () => {
    render(<UserAvatar src={null} name="X" fallback={<span>icon</span>} />);
    expect(screen.getByText('icon')).toBeInTheDocument();
  });
});

describe('AvatarImage (Radix)', () => {
  it('does not draw an Unsplash URL, so the fallback shows', () => {
    const { container } = render(
      <Avatar>
        <AvatarImage src="https://images.unsplash.com/photo-1" />
        <AvatarFallback>AG</AvatarFallback>
      </Avatar>
    );
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByText('AG')).toBeInTheDocument();
  });
});
