---
name: performance-guard
description: "Catches performance anti-patterns during development — not premature optimization, but defects that compound with scale. Triggers when Claude writes database queries, list renders, useEffect hooks, image handling, or any code involving loops, arrays, or repeated operations. Also triggers when the user mentions 'slow', 'performance', 'loading time', 'N+1', 'optimization', or 'bundle size'. Think of this as a performance linter, not an optimizer."
---

# Performance Guard

Catch performance defects during development. These aren't optimizations — they're bugs that get worse with every user.

## Anti-Patterns to Catch

### N+1 Queries
Database calls inside loops or `.map()` are almost always wrong.

```typescript
// BAD — N+1: one query per participant
const results = await Promise.all(
  participants.map(p => 
    supabase.from('users').select('name').eq('id', p.user_id).single()
  )
);

// GOOD — single batch query
const userIds = participants.map(p => p.user_id);
const { data: users } = await supabase
  .from('users')
  .select('id, name')
  .in('id', userIds);
```

**Detection:** Any `supabase.from()` call inside `.map()`, `.forEach()`, `for...of`, or `Promise.all(items.map(...))` is suspect.

### Unbounded Lists
Rendering all items without pagination or virtualization.

```typescript
// BAD — renders ALL sessions, even thousands
{sessions.map(session => <SessionCard key={session.id} ... />)}

// BETTER — paginate
const PAGE_SIZE = 20;
const [page, setPage] = useState(0);
const visibleSessions = sessions.slice(0, (page + 1) * PAGE_SIZE);
```

**When to paginate:** If a list could reasonably exceed 50 items.

### Missing Loading States
Async buttons without disabled/loading state cause double-submits and perceived slowness.

```typescript
// BAD
<button onClick={handleJoin}>Join</button>

// GOOD
<button onClick={handleJoin} disabled={joining} className="disabled:opacity-50">
  {joining ? 'Joining...' : 'Join'}
</button>
```

### Unnecessary Re-renders
State updates that trigger re-renders of unrelated components.

```typescript
// BAD — entire page re-renders when search query changes
const [searchQuery, setSearchQuery] = useState('');
const [sessions, setSessions] = useState([]);
// Both in the same component = search keystroke re-renders session list

// BETTER — extract search into its own component
// SearchBar handles its own state, only passes final query up
```

### Heavy Computation in Render
Expensive operations running on every render instead of being memoized.

```typescript
// BAD — filters all sessions on every render
return sessions.filter(s => calculateDistance(...) < maxDistance);

// BETTER — memoize with useMemo
const filteredSessions = useMemo(
  () => sessions.filter(s => calculateDistance(...) < maxDistance),
  [sessions, maxDistance, userLocation]
);
```

### Image Loading
- Use `loading="lazy"` on images below the fold
- Compress images before upload (client-side, before hitting Supabase storage)
- Set explicit `width` and `height` on images to prevent layout shift

### useEffect Pitfalls
- Missing dependencies cause stale closures (referencing old state)
- Too many dependencies cause infinite re-render loops
- Missing cleanup functions cause memory leaks (intervals, subscriptions, event listeners)

```typescript
// BAD — interval never cleaned up
useEffect(() => {
  setInterval(() => fetchData(), 5000);
}, []);

// GOOD — cleanup on unmount
useEffect(() => {
  const interval = setInterval(() => fetchData(), 5000);
  return () => clearInterval(interval);
}, []);
```

## Checklist

Before finalizing code that involves data or lists:
- [ ] No Supabase calls inside loops or `.map()`
- [ ] Lists over 50 items have pagination or virtualization
- [ ] Async buttons have loading/disabled states
- [ ] Images have `loading="lazy"` if below the fold
- [ ] `useEffect` hooks have correct dependencies and cleanup
- [ ] Expensive computations use `useMemo` when dependencies are known
- [ ] No `select('*')` — fetch only needed columns
