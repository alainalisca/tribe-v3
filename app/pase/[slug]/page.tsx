import { cache } from 'react';
import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { getServiceRoleClient } from '@/lib/supabase/admin';
import { fetchPassConfig, isOrganizationPartner, type PassConfig } from '@/lib/dal/passLeads';
import { consentTextFor, CONSENT_POLICY_PATH } from '@/lib/pase/consent';
import PaseForm from './PaseForm';

/**
 * /pase/[slug] -- the digital pass.
 *
 * Server component, read with the SERVICE-ROLE client and through the SAME
 * fetchPassConfig that /api/pase uses. That is the point: if the page and the
 * route each decided for themselves what "servable" means, the obvious failure
 * is a form that renders and then refuses every submission, which looks like a
 * broken product to the one person we most need not to lose.
 *
 * partner_lead_routing is unreachable by anon and authenticated (172), so this
 * read cannot be done from the client at all.
 *
 * NOT 404 WHEN UNSERVABLE. A 404 on a URL printed on a paper voucher reads as
 * "Tribe is broken" to someone standing in a gym holding the voucher. They get
 * a real page instead, and it never says WHICH of the three conditions failed:
 * no such partner, pass switched off, and no routing row are one answer.
 */

const getConfig = cache(async (slug: string): Promise<PassConfig | null> => {
  // A slug is a URL segment from 163's slugify: lowercase, digits, hyphens.
  // Anything else cannot match a row, so it is rejected before a query runs.
  if (!/^[a-z0-9-]{1,80}$/.test(slug)) return null;
  return fetchPassConfig(getServiceRoleClient(), slug);
});

interface PageProps {
  params: Promise<{ slug: string }>;
}

/**
 * Deliberately thin, and noindex on every pass.
 *
 * This URL is handed out on paper and in DMs, not found in search. Indexing it
 * would put a lead-capture form with someone else's brand on it into results
 * Tribe does not control the wording of.
 */
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const config = await getConfig(slug);
  return {
    title: config ? `${config.headline ?? 'Tu pase'} | Tribe` : 'Pase | Tribe',
    robots: { index: false, follow: false },
  };
}

/**
 * The partner hero: whose offer this is, said once and said clearly.
 *
 * It was a 48px rounded square in the header beside the Tribe wordmark, where
 * it read as an avatar. The page is reached by scanning a QR on a paper
 * voucher inside a gym, so the visitor arrives already holding that gym's
 * branding, and the page has to match what is in their hand before it asks
 * them for a phone number.
 *
 * SHAPE. T-GYM1: organizations are squares, people are circles. #169 shipped a
 * square for every partner because business_type was not in the select that
 * builds PassConfig; T-LEAD2 added it, so the shape is now decided by what the
 * partner actually is, via isOrganizationPartner().
 *
 * NO VISIBLE CHANGE SHIPS WITH THAT FIX. BullBox is the only row with
 * pass_active, it is a 'gym', and it keeps the square it already had. The
 * circle first appears the day an independent instructor gets a pass, which is
 * the case this exists for and the case that cannot be demonstrated today
 * without inventing a partner row to demonstrate it with.
 */
/**
 * THE ONE PLACE THE PASS HERO'S SIZE IS SET.
 *
 * 128px is not the size this wants to be. It is the largest size BullBox's
 * current logo survives: the file is 385x385, and a 3x phone needs 384 real
 * pixels for a 128px box. At 160 it is soft on a 3x screen; at 200 it is soft
 * on a 2x one.
 *
 * So this is pinned to the ASSET, not to the design. When a logo of 720px or
 * more arrives, raise this number and nothing else -- the height, the wide-
 * logo cap and the fallback tile all derive from it. That is the whole reason
 * it is a constant instead of an h-32 somewhere in a class list.
 */
const HERO_PX = 128;

/**
 * The white card's inset around the mark, on all four sides.
 *
 * BullBox's file is an opaque JPEG with a white background baked in, so on a
 * dark page it lands as a stray white tile the size of the image. A card with
 * even padding makes that white DELIBERATE: the mark then sits on a surface
 * instead of ending at an edge nobody chose.
 *
 * It is the right treatment for a transparent PNG too, which is why this is
 * not a workaround waiting to be removed -- a logo on its own white card is
 * how a partner mark is usually presented on a dark ground.
 *
 * THE CARD IS PURE WHITE ON PURPOSE, AND THERE IS A FAINT SEAM. BullBox's
 * baked-in background is NOT white: sampled from the file on 2026-09-22 its
 * four corners read #EFF3F2, #FAF4F6, #F6F1EE and #F8F3F0 -- up to 17/255, or
 * about 7%, off white. Against a #FFFFFF card that shows as a very faint inner
 * rectangle.
 *
 * Do not fix that by tinting the card to match. It would suit exactly one
 * partner's one file, and be wrong for the next partner and wrong for the
 * better asset this one is waiting on. The seam is a property of the JPEG and
 * disappears the moment a transparent PNG replaces it.
 */
const HERO_CARD_PAD_PX = 14;

/**
 * How much wider than tall a logo may render before the container width takes
 * over. A wordmark is commonly 3:1 or 4:1; 2.5 keeps a wide mark large without
 * letting it run the full width of a 430px column and swamp the headline.
 */
const HERO_MAX_ASPECT = 2.5;

function PartnerHero({ config }: { config: PassConfig }) {
  const initials = config.partnerName
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');

  // Squares for organizations, circles for people. Read off the row, never off
  // the slug or the name.
  const shape = isOrganizationPartner(config) ? 'rounded-2xl' : 'rounded-full';

  return (
    // CENTRED, and the first thing on the page. This is a BullBox conversion
    // page reached from a voucher in a BullBox gym, so the visitor must see
    // the brand they are holding before they see ours. The Tribe wordmark
    // moved to the footer; it is the host, not the headline.
    <div className="mb-5 flex flex-col items-center gap-4 text-center">
      {config.logoUrl ? (
        // The container HUGS the image rather than boxing it. A fixed square
        // with a wide logo inside produces letterbox bars that read as part of
        // the mark; hugging means a square logo gets a square and a wordmark
        // gets a wordmark-shaped block.
        // ORGANIZATIONS GET THE WHITE CARD; PEOPLE DO NOT.
        //
        // isOrganizationPartner already decides square-vs-circle here (T-GYM1),
        // and the same distinction decides this. A gym's mark belongs on a
        // white surface. An independent instructor's pass shows a HEADSHOT,
        // and a headshot inset inside a padded white circle looks like a
        // mistake -- it wants to fill its circle, which is what it does today.
        //
        // The card hugs the image rather than boxing it, so the padding stays
        // even on all four sides whatever the mark's aspect: a wordmark gets a
        // wordmark-shaped card, a square logo gets a square one.
        <div
          className={
            isOrganizationPartner(config)
              ? `inline-flex items-center justify-center ${shape} bg-white shadow-lg shadow-black/30`
              : `inline-flex items-center justify-center overflow-hidden ${shape} bg-white/5`
          }
          style={isOrganizationPartner(config) ? { padding: HERO_CARD_PAD_PX } : undefined}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- Supabase storage host; next/image would need a loader entry for a URL that varies per partner row */}
          <img
            src={config.logoUrl}
            alt={config.partnerName}
            // object-CONTAIN, never cover. Cropping a logo is worse than
            // letterboxing it: cover on a wide mark cuts the ends off the
            // word, which is the one part of a logo that has to survive.
            //
            // max-height plus w-auto means the element takes the image's own
            // proportions, so distortion is not merely unlikely, it has no
            // way to happen. max-w-full keeps a wide mark inside the column at
            // 320px, where the content box is 288px.
            className="block h-auto w-auto object-contain"
            style={{ maxHeight: HERO_PX, maxWidth: `min(${HERO_PX * HERO_MAX_ASPECT}px, 100%)` }}
          />
        </div>
      ) : (
        <div
          className={`flex shrink-0 items-center justify-center overflow-hidden ${shape} bg-white/10 text-2xl font-bold text-white ring-2 ring-tribe-green`}
          style={{ height: HERO_PX, width: HERO_PX }}
        >
          {initials}
        </div>
      )}
      {/* The name only. pass_sub already renders under the h1 below, and
          repeating it here would say the same line twice on one screen. */}
      <p className="text-xl font-bold leading-tight text-white">{config.partnerName}</p>
    </div>
  );
}

/**
 * `size` exists because this mark plays two roles on two pages. On the
 * inactive pass it is the only branding on screen and stands at full size; on
 * the active pass it is the host credit under the form, where being as loud as
 * the partner is the exact defect being fixed. An opacity class alone would
 * not do it: this is an <img>, so a text-white/50 parent does not dim it.
 */
function Wordmark({ size = 'full' }: { size?: 'full' | 'credit' }) {
  const credit = size === 'credit';
  return (
    <Image
      src="/tribe-wordmark.png"
      alt="Tribe"
      width={96}
      height={28}
      priority={!credit}
      className={credit ? 'h-5 w-auto opacity-70' : 'h-7 w-auto'}
    />
  );
}

/**
 * The inactive state. One page for three different reasons, saying none of
 * them.
 */
function InactivePass() {
  return (
    <main className="min-h-screen bg-tribe-dark px-4 py-8">
      <div className="mx-auto w-full max-w-[430px]">
        <header className="mb-10">
          <Wordmark />
        </header>
        <div className="rounded-2xl bg-white p-6 text-center">
          <h1 className="text-xl font-bold text-tribe-dark">Este pase todavía no está activo</h1>
          <p className="mt-3 text-sm text-stone-600">
            Vuelve a intentarlo más tarde o escríbenos si crees que es un error.
          </p>
          <Link
            href="/"
            className="mt-6 inline-block rounded-xl bg-tribe-dark px-5 py-3 text-sm font-semibold text-white"
          >
            Ir a Tribe
          </Link>
        </div>
      </div>
    </main>
  );
}

export default async function PasePage({ params }: PageProps) {
  const { slug } = await params;
  const config = await getConfig(slug);

  if (!config) return <InactivePass />;

  return (
    <main className="min-h-screen bg-tribe-dark px-4 py-8">
      <div className="mx-auto w-full max-w-[430px]">
        {/* No header. The partner is the first thing on the page; the Tribe
            wordmark is in the footer below, where it reads as the host. */}
        <PartnerHero config={config} />

        <div className="mb-6 text-center">
          <h1 className="text-3xl font-extrabold leading-tight text-white">
            {config.headline ?? 'Tu primera clase gratis'}
          </h1>
          {config.sub ? <p className="mt-2 text-base text-white/70">{config.sub}</p> : null}
          <p className="mt-4 text-sm text-white/60">
            Deja tus datos y {config.partnerName} te escribe para agendar tu clase. Sin costo.
          </p>
        </div>

        <PaseForm
          slug={config.slug}
          partnerName={config.partnerName}
          options={config.options}
          consentText={consentTextFor(config.partnerName)}
          consentPolicyPath={CONSENT_POLICY_PATH}
        />

        {/* Tribe as the host, not the headline. Small, last, and below the
            form so it never competes with the partner above it. */}
        <footer className="mt-8 flex items-center justify-center gap-2 text-white/50">
          <span className="text-sm">en</span>
          <Wordmark size="credit" />
        </footer>
      </div>
    </main>
  );
}
