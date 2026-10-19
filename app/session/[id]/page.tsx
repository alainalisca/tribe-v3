import { cookies, headers } from 'next/headers';
import { FixedLanguage } from '@/lib/LanguageContext';
import { LANGUAGE_COOKIE, serverLanguage } from '@/lib/languageCookie';
import { hasAuthCookieName } from '@/lib/site/authCookie';
import { hostHeroFor, loadPublicSession, signedOutProps } from '@/lib/session/publicSession';
import SessionDetailClient from './SessionDetailClient';
import { isMomentsEnabled } from '@/lib/features/moments';
import SignedOutSession from './SignedOutSession';

/**
 * /session/<id>/ (T-SSR1).
 *
 * Signed out (no Supabase session cookie), the page is rendered on the
 * server: poster, coach, facts and the booking button are in the first HTML,
 * from the one public read the layout's metadata also uses. The guest request
 * (modal, toast, the guest's own state) stays a client island inside
 * SignedOutSession. The language is the server's pick in the client's own
 * order (cookie, Accept-Language, Spanish), held for the subtree so nothing
 * flips after hydration.
 *
 * Signed in, or with a stale cookie, it is the app's session page exactly as
 * before (SessionDetailClient): host buttons, Quién llegó, Tribe.OS
 * attendance, the "Sesión de prueba" note. Hidden sessions never get here:
 * middleware answers them a real 404 (lib/site/publicPageGate.ts).
 */
export default async function SessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const cookieStore = await cookies();
  // Signed in: the app's page, with the host's coach-card photo as its hero (T-UI-SD1).
  if (hasAuthCookieName(cookieStore.getAll().map((c) => c.name)))
    return <SessionDetailClient hostHero={await hostHeroFor(id)} momentsEnabled={isMomentsEnabled()} />;

  const loaded = await loadPublicSession(id);
  // Nothing public to render (or a test session): the client page keeps its own handling.
  if (!loaded || loaded.row.is_test) return <SessionDetailClient />;

  const language = serverLanguage(cookieStore.get(LANGUAGE_COOKIE)?.value, (await headers()).get('accept-language'));
  const props = signedOutProps(loaded);
  // The host's coach-card photo as the hero, as on the signed-in page and the
  // WhatsApp card (same cached pick, same 1.5 s cap).
  const photo = await hostHeroFor(id);
  return (
    <FixedLanguage language={language}>
      <SignedOutSession {...props} language={language} photo={photo} />
    </FixedLanguage>
  );
}
