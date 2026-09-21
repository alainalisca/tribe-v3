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
    // Stacks under 360px: the logo plus a two-word business name does not fit
    // beside itself on a 320px phone, and a wrapped name next to a 96px block
    // looks like a mistake rather than a layout.
    <div className="mb-6 flex flex-col items-start gap-4 min-[360px]:flex-row min-[360px]:items-center">
      <div
        className={`h-24 w-24 shrink-0 overflow-hidden ${shape} bg-white/10 shadow-lg shadow-black/30 ring-2 ring-tribe-green`}
      >
        {config.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- Supabase storage host; next/image would need a loader entry for a URL that varies per partner row
          <img
            src={config.logoUrl}
            alt={config.partnerName}
            className="h-full w-full object-cover"
            width={96}
            height={96}
          />
        ) : (
          <span className="flex h-full w-full items-center justify-center text-2xl font-bold text-white">
            {initials}
          </span>
        )}
      </div>
      {/* The name only. pass_sub already renders under the h1 below, and
          repeating it here would say the same line twice on one screen. */}
      <p className="text-xl font-bold leading-tight text-white">{config.partnerName}</p>
    </div>
  );
}

function Wordmark() {
  return <Image src="/tribe-wordmark.png" alt="Tribe" width={96} height={28} priority className="h-7 w-auto" />;
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
        <header className="mb-8">
          <Wordmark />
        </header>

        <PartnerHero config={config} />

        <div className="mb-6">
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
      </div>
    </main>
  );
}
