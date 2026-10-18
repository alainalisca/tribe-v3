import '@testing-library/jest-dom';

// next/font only works inside a Next build. In tests a face is just the CSS
// variable class it would put on the page, so any component that loads the
// site's fonts (lib/site/fonts.ts, used by the T-JOIN1 bridge) renders.
import { vi } from 'vitest';
vi.mock('next/font/google', () => {
  const face = (name: string) => () => ({ className: `font-${name}`, variable: `font-var-${name}`, style: {} });
  return {
    Big_Shoulders: face('big-shoulders'),
    Instrument_Sans: face('instrument-sans'),
    JetBrains_Mono: face('jetbrains-mono'),
    Plus_Jakarta_Sans: face('plus-jakarta-sans'),
  };
});
