import type { Config } from 'tailwindcss';
import tailwindcssAnimate from 'tailwindcss-animate';

const config: Config = {
  darkMode: 'class',
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // ── Tribe brand tokens (canonical from the Tribe Design
        //    Guidelines PDF). The hex codes here are the source of
        //    truth — Tribe.OS, the consumer Tribe app, and the
        //    sibling tribe-os codebase all align on these.
        //
        //    Primary green changed from #84cc16 (Tailwind lime-500)
        //    to the canonical #A8DA36 in May 2026 to match the design
        //    guidelines. Adds nested 50/100/dark variants for hover
        //    and pale-highlight states without changing component
        //    call sites that already use the flat `tribe-green` name.
        'tribe-green': '#A8DA36', // Brand green (Green 110 in the PDF)
        'tribe-green-50': '#E0FF98', // pale highlight
        'tribe-green-100': '#C0E863', // light variant
        'tribe-green-dark': '#6FA300', // pressed / hover-on-light
        'tribe-green-light': '#C0E863', // legacy alias for the 100 swatch
        'tribe-green-hover': '#6FA300', // legacy alias for -dark

        // Dark / charcoal scale.
        'tribe-dark': '#272D34', // Darkgrey 100 — primary text on light / page bg on dark
        'tribe-dark-40': '#F2F2F2', // page bg on light layouts
        'tribe-dark-60': '#B1B3B6', // muted text
        'tribe-dark-80': '#52575D', // secondary text
        'tribe-surface': '#3D4349',
        'tribe-surface-hover': '#4A5056',
        'tribe-mid': '#52575D',
        'tribe-card': '#6B7178',

        // Legacy gray aliases — kept so existing call sites still
        // compile. New code should prefer the `tribe-dark-*` names
        // from the canonical scale.
        'tribe-gray-80': '#52575D',
        'tribe-gray-60': '#B1B3B6',
        'tribe-gray-40': '#F2F2F2',

        // Semantic tokens (Tribe Design Guidelines).
        'tribe-success': '#A8DA36',
        'tribe-warning': '#F5A623',
        'tribe-danger': '#E33629',
        'tribe-info': '#4AB8D4',
        'tribe-sky': '#E1F0F4',
        'tribe-peach': '#FFE9CA',

        // Existing red + amber — kept (alias `tribe-danger` for new code).
        'tribe-red': '#E33629',
        'tribe-amber': '#F59E0B',
        'tribe-amber-light': '#FBBF24',
        // shadcn/ui semantic tokens
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground, 0 0% 100%))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
      },
      fontFamily: {
        sans: ['var(--font-jakarta)', 'system-ui', 'sans-serif'],
        display: ['var(--font-jakarta)', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
        // Tribe canonical radius — 10px. Used by the OS UI primitives
        // (Card, Button, Input, etc.). Matches the sibling tribe-os
        // codebase.
        tribe: '10px',
      },
      boxShadow: {
        // Tribe canonical shadows — used by the OS UI primitives so
        // cards/menus/popovers feel consistent across surfaces.
        tribe: '0 2px 12px rgba(0,0,0,0.07)',
        'tribe-lg': '0 8px 32px rgba(0,0,0,0.10)',
        'tribe-green': '0 4px 14px rgba(168,218,54,0.35)',
      },
      spacing: {
        // Fixed shell dimensions matched by the OS layout. Updated
        // from 224px (w-56) to the canonical 220px to match the
        // tribe-os sibling codebase.
        sidebar: '220px',
        topbar: '60px',
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
      },
    },
  },
  plugins: [tailwindcssAnimate],
};

export default config;
