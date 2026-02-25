# Tribe v3 — Development Conventions

## Fixed Header + Scrollable Content Pattern

**NEVER use hardcoded padding to clear fixed headers.** This has caused recurring clipping bugs across multiple pages.

### The correct pattern:

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

// Re-measure when content that affects header height changes
useEffect(() => {
  measureFixed();
  requestAnimationFrame(() => measureFixed());
}, [/* deps that affect header content */, measureFixed]);

return (
  <>
    <div ref={fixedAreaRef} className="fixed top-0 left-0 right-0 z-40 safe-area-top ...">
      {/* Header content */}
    </div>
    <div style={{ paddingTop: fixedHeight || undefined }} className={fixedHeight ? '' : 'pt-[200px]'}>
      {/* Scrollable content */}
    </div>
  </>
);
```

### Pages using this pattern:

- `app/page.tsx` (home) — via `FilterBar` component with `onFixedHeightChange` callback
- `app/sessions/page.tsx` — direct ref measurement

### Why not hardcoded values:

- Safe area insets vary by device (iPhone notch vs no notch vs Android)
- Tab bars and filter rows change height based on content/language
- Font scaling affects header height
- Any future header change silently breaks hardcoded values
