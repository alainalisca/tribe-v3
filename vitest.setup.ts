import '@testing-library/jest-dom';

// next/font only works inside a Next build. In tests a face is just the CSS
// variable class it would put on the page, so any component that loads the
// fonts (lib/fonts/app.ts, lib/site/fonts.ts, used by the T-JOIN1 bridge)
// renders. Each localFont call is one unicode block of a face, named by its
// variable.
import { vi } from 'vitest';
vi.mock('next/font/local', () => ({
  default: ({ variable }: { variable: string }) => ({
    className: `font${variable}`,
    variable: `font-var${variable}`,
    style: {},
  }),
}));
