---
name: error-message-standard
description: "Ensures all error messages, success messages, empty states, and loading states follow a consistent, user-friendly pattern. Triggers when Claude writes error handling that shows messages to users, creates empty state UI, adds toast notifications, or writes any user-facing feedback text. Also triggers when the user mentions 'error message', 'toast', 'notification text', 'empty state', or 'user feedback'. Raw database errors should never reach the user."
---

# Error Message & UX Copy Standard

Users should never see "Error: duplicate key value violates unique constraint." They should see "You're already in this session."

## Error Message Rules

1. **Human language** — No technical jargon, no error codes, no stack traces
2. **Specific** — "Session is full" not "Could not complete action"
3. **Actionable** — Tell the user what to do: "Session is full. Try another session nearby."
4. **Bilingual** — Both English and Spanish (see i18n-enforcer skill)
5. **Appropriate tone** — Friendly but not cutesy. "Something went wrong" not "Oopsie!"

## Error Message Pattern

Use the centralized error message mapping in `lib/errorMessages.ts`:

```typescript
// Map error codes to user-friendly messages
const errorMessages: Record<string, { en: string; es: string }> = {
  session_not_found: {
    en: 'Session not found',
    es: 'Sesión no encontrada',
  },
  already_joined: {
    en: "You're already in this session",
    es: 'Ya estás en esta sesión',
  },
  session_full: {
    en: 'This session is full',
    es: 'Esta sesión está llena',
  },
  // ... more mappings
};
```

In components, map the error code:
```tsx
if (!result.success) {
  const msg = errorMessages[result.error!];
  showError(msg ? msg[language] : (language === 'es' ? 'Algo salió mal' : 'Something went wrong'));
  return;
}
```

## Success Messages

- Confirm what happened: "Joined session!" not just "Success"
- Keep them brief — they appear as toasts
- Include relevant context: "Review submitted — thanks for your feedback!"

## Empty States

Every list/feed needs an empty state. Never show a blank page.

```tsx
{items.length === 0 && (
  <div className="text-center py-12">
    <p className="text-lg font-medium text-stone-600 dark:text-gray-400">
      {language === 'es' ? 'No hay sesiones aún' : 'No sessions yet'}
    </p>
    <p className="text-sm text-stone-500 dark:text-gray-500 mt-1">
      {language === 'es' ? 'Crea una para empezar' : 'Create one to get started'}
    </p>
  </div>
)}
```

## Loading States

- Buttons: `disabled={isLoading}` + text change ("Joining..." / "Uniéndose...")
- Pages: Skeleton loaders (use `<SkeletonCard />`) not blank screens
- Lists: Show skeletons matching the expected layout

## Never Show to Users

- Database error messages (`duplicate key`, `foreign key constraint`, `relation does not exist`)
- Stack traces or line numbers
- Internal IDs or technical identifiers
- Raw JSON error objects
