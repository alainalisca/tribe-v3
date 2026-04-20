/**
 * Pure constants for admin authorization — no runtime dependencies on
 * next/headers or Supabase clients, so this module is safe to import from
 * both server and client code (DAL helpers, middleware, etc.).
 *
 * The server-only `isAdmin()` helper still lives in `lib/admin.ts`.
 */

// NOTE (QA-09, @al): the second address (@aplusfitnessllc.com) was added to
// cover the user's working email — originally the list only had @aplusfitness.co.
// If one of these is obsolete, remove it.
export const ADMIN_EMAILS: readonly string[] = ['alainalisca@aplusfitness.co', 'alainalisca@aplusfitnessllc.com'];
