---
name: api-route-security
description: "Enforces authentication, input validation, and security best practices on every API route. Triggers whenever Claude creates or modifies a file in app/api/, when creating server-side endpoints, or when the user mentions 'API route', 'endpoint', 'server route', or 'backend'. Every API route must have auth, validation, and error handling — no exceptions. Use this skill before writing any code in the app/api/ directory."
---

# API Route Security Enforcer

Every API route must be secure by default. An unprotected route is a vulnerability, not a shortcut.

## Required Structure for Every API Route

```typescript
import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  // 1. AUTH — verify the user is who they claim to be
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // 2. INPUT VALIDATION — never trust the client
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { sessionId, message } = body;
  if (!sessionId || typeof sessionId !== 'string') {
    return NextResponse.json({ error: 'sessionId is required' }, { status: 400 });
  }

  // 3. AUTHORIZATION — verify the user is allowed to do this action
  // (not just authenticated, but authorized for THIS specific resource)
  const { data: session } = await supabase
    .from('sessions')
    .select('creator_id')
    .eq('id', sessionId)
    .single();

  if (!session || session.creator_id !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // 4. BUSINESS LOGIC — the actual work
  try {
    // ... do the thing
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('API route error:', { route: '/api/example', userId: user.id, error });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
```

## Security Checklist

Before finalizing any API route, verify:

1. **Authentication** — `supabase.auth.getUser()` at the top. Returns 401 if no valid session.
2. **Input validation** — Every field from `request.json()` is checked for existence and type. Never pass raw input to database queries.
3. **Authorization** — The authenticated user is allowed to perform this specific action. Creating a session requires the user exists. Deleting a session requires the user owns it. Admin actions require `is_admin: true`.
4. **Error responses** — Use proper HTTP status codes: 400 (bad input), 401 (not logged in), 403 (not allowed), 404 (not found), 500 (server error). Never expose internal error details.
5. **No sensitive data in responses** — Don't return full user objects, internal IDs, or system info in error messages.
6. **Method restriction** — Only export the HTTP methods you need (POST, GET, etc.). Don't export unused methods.

## Exceptions

- **Cron routes** (`/api/cron/*`) — These are called by Vercel cron, not users. They should verify a cron secret header instead of user auth.
- **Webhook routes** — Verify webhook signatures instead of user auth.
- **Public data routes** — If a route serves truly public data (like generating an .ics calendar file), document why auth is skipped with a comment.

## Common Vulnerabilities to Prevent

- **Mass assignment** — Don't spread `...body` into database inserts. Explicitly pick allowed fields.
- **IDOR** — Always verify the user owns/has access to the resource they're acting on.
- **Rate limiting** — For expensive operations (email sending, push notifications), add a comment noting that rate limiting should be implemented.
- **Privilege escalation** — Never let users set their own `is_admin` or `role` fields through API routes.
