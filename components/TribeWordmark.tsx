/**
 * TribeWordmark — the branded "Tribe." logo image, theme-aware.
 *
 * Uses /public/tribe-wordmark-dark.png on light backgrounds (dark text + lime
 * dot) and /public/tribe-wordmark.png on dark backgrounds (white text + lime
 * dot). The previous implementation rendered raw "Tribe" text plus a CSS
 * circle — it worked but it wasn't the real brand typography. This component
 * is the single source of truth for the wordmark.
 *
 * Size is controlled via `className` (typically `h-6` / `h-8` / `h-12`).
 * The component renders both variants and uses dark:hidden / dark:block to
 * swap them so we don't have to read the theme context.
 */

interface TribeWordmarkProps {
  /** Tailwind classes — typically a height like `h-6 w-auto`. */
  className?: string;
  /** Accessible label. Defaults to "Tribe". Set to "" for decorative use next to text. */
  alt?: string;
}

export default function TribeWordmark({ className = 'h-6 w-auto', alt = 'Tribe' }: TribeWordmarkProps) {
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/tribe-wordmark-dark.png" alt={alt} className={`${className} block dark:hidden`} />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/tribe-wordmark.png" alt={alt} className={`${className} hidden dark:block`} />
    </>
  );
}
