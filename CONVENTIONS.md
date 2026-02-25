# Tribe v3 — Development Conventions

## Fixed Header + Scrollable Content Pattern

**NEVER use hardcoded padding to clear fixed headers.** This has caused recurring clipping bugs across multiple pages.

### Header clearing: two approaches

**Simple headers** (single title bar, fixed height):
Use the `pt-header` CSS class. This works for headers that are always the same height.

```tsx
<div className="fixed top-0 left-0 right-0 z-40 safe-area-top bg-stone-200 dark:bg-[#272D34] border-b border-stone-300 dark:border-black">
  <div className="max-w-2xl mx-auto h-14 flex items-center px-4">
    <h1>Title</h1>
  </div>
</div>

<div className="pt-header max-w-2xl mx-auto p-4">
  {/* Scrollable content */}
</div>
```

Pages using this: `requests`, `messages`, `profile`, `create`, `matches`

**Multi-part headers** (title + tabs, title + filters, variable height):
Use dynamic ref measurement. Required when header height varies by content, device, or state.

```tsx
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
}, [/* deps that affect header content */, measureFixed]);

return (
  <>
    <div ref={fixedAreaRef} className="fixed top-0 left-0 right-0 z-40 safe-area-top ... border-b border-stone-300 dark:border-black">
      {/* Header content */}
    </div>
    <div style={{ paddingTop: fixedHeight || undefined }} className={fixedHeight ? '' : 'pt-[200px]'}>
      <div className="max-w-2xl mx-auto p-4">
        {/* Scrollable content */}
      </div>
    </div>
  </>
);
```

Pages using this: `app/page.tsx` (home via FilterBar), `app/sessions/page.tsx`

### Standard spacing rules

1. **Fixed header div**: Always include `border-b border-stone-300 dark:border-black` for visual separation
2. **Content container**: Always use `p-4` (16px all sides) for the content div inside the clearing wrapper. This creates a consistent 16px gap between header bottom and first content element.
3. **Never** use `px-4 pb-4` or `px-4` alone — always include top padding via `p-4` or `pt-4`
4. **Exception**: Profile page uses no top padding because the banner image is meant to sit flush against the header

### Why not hardcoded values:

- Safe area insets vary by device (iPhone notch vs no notch vs Android)
- Tab bars and filter rows change height based on content/language
- Font scaling affects header height
- Any future header change silently breaks hardcoded values
