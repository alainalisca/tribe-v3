---
name: component-scaffolder
description: "Scaffolds React components and pages with the correct structure, types, and patterns. Triggers whenever Claude creates a new component file, a new page in the app/ directory, or when the user asks to 'create a component', 'add a page', 'build a new screen', or similar. Ensures every component starts with typed props, proper structure, and follows project conventions like header spacing patterns. Use this skill any time a new .tsx file is being created for UI."
---

# Component Scaffolder

Every new React component and page follows a standard structure. This prevents inconsistencies, header clipping bugs, and untyped props.

## Component Template

For components in `components/`:

```tsx
'use client';

import { useState } from 'react';

interface ComponentNameProps {
  // Define every prop with its type — never use `any`
  title: string;
  items: Item[];
  onAction: (id: string) => void;
  language: 'en' | 'es';
  isLoading?: boolean;  // Optional props use ?
}

export default function ComponentName({
  title,
  items,
  onAction,
  language,
  isLoading = false,
}: ComponentNameProps) {
  // Local state only — state shared with parent stays in parent
  const [localState, setLocalState] = useState(false);

  return (
    <div>
      {/* Component JSX */}
    </div>
  );
}
```

## Page Template — Simple Header

For pages with a single fixed title bar (like Requests, Messages, Matches):

```tsx
'use client';

import { useState, useEffect } from 'react';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { useLanguage } from '@/lib/LanguageContext';
import BottomNav from '@/components/BottomNav';

export default function PageName() {
  const { t, language } = useLanguage();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      setLoading(true);
      // fetch data
    } catch (error) {
      console.error('loadData failed:', error);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-stone-50 dark:bg-[#52575D] pb-32">
      {/* Fixed header — ALWAYS include border-b */}
      <div className="fixed top-0 left-0 right-0 z-40 safe-area-top bg-stone-200 dark:bg-[#272D34] border-b border-stone-300 dark:border-black">
        <div className="max-w-2xl mx-auto h-14 flex items-center px-4">
          <Link href="/">
            <button className="p-2 hover:bg-stone-300 dark:hover:bg-[#52575D] rounded-lg transition">
              <ArrowLeft className="w-6 h-6 text-stone-900 dark:text-white" />
            </button>
          </Link>
          <h1 className="flex-1 text-xl font-bold text-stone-900 dark:text-white">
            Page Title
          </h1>
        </div>
      </div>

      {/* Content — pt-header clears the fixed header, p-4 adds standard 16px gap */}
      <div className="pt-header max-w-2xl mx-auto p-4">
        {/* Page content */}
      </div>

      <BottomNav />
    </div>
  );
}
```

## Page Template — Multi-Part Header

For pages with title + tabs, title + filters, or variable-height headers (like Home, Sessions):

```tsx
'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import BottomNav from '@/components/BottomNav';

export default function PageName() {
  const fixedAreaRef = useRef<HTMLDivElement>(null);
  const [fixedHeight, setFixedHeight] = useState(0);

  const measureFixed = useCallback(() => {
    if (fixedAreaRef.current) {
      setFixedHeight(fixedAreaRef.current.offsetHeight);
    }
  }, []);

  useEffect(() => {
    measureFixed();
    window.addEventListener('resize', measureFixed);
    return () => window.removeEventListener('resize', measureFixed);
  }, [measureFixed]);

  useEffect(() => {
    measureFixed();
    requestAnimationFrame(() => measureFixed());
  }, [/* deps that change header height */, measureFixed]);

  return (
    <div className="min-h-screen bg-stone-50 dark:bg-[#52575D] pb-32">
      <div ref={fixedAreaRef} className="fixed top-0 left-0 right-0 z-40 safe-area-top bg-stone-200 dark:bg-[#272D34] border-b border-stone-300 dark:border-black">
        {/* Header content — title bar, tabs, filters, etc. */}
      </div>

      <div style={{ paddingTop: fixedHeight || undefined }} className={fixedHeight ? '' : 'pt-[200px]'}>
        <div className="max-w-2xl mx-auto p-4">
          {/* Page content */}
        </div>
      </div>

      <BottomNav />
    </div>
  );
}
```

## Rules

1. **Typed props always** — define an interface, never use `any`
2. **Default export** — every component is a default export matching its filename
3. **One component per file** — no multi-component files
4. **Under 300 lines** — if approaching, extract sub-components
5. **`'use client'` directive** — required for all components using hooks, event handlers, or browser APIs
6. **Fixed headers always have `border-b`** — `border-b border-stone-300 dark:border-black`
7. **Content always has top padding** — `p-4` for the content container (16px gap between header and content)
8. **Never use hardcoded spacer divs** — use `pt-header` or dynamic measurement
9. **Components don't fetch data** — data comes via props. Only page-level files (`page.tsx`) fetch data
10. **File naming** — PascalCase for components (`SessionCard.tsx`), kebab-case for directories (`session-detail/`)
