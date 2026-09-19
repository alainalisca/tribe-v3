import type { Metadata } from 'next';

/**
 * Metadata for the data policy, and the removal of its noindex.
 *
 * The page was noindex while it was a placeholder, because a stub indexed as
 * Tribe's data policy is worse than no page at all. The approved text is now
 * published, and Ley 1581 expects the policy to be findable, so it indexes
 * like every other legal page.
 *
 * SPANISH ONLY, DELIBERATELY. The page picks its language at runtime from the
 * user's preference, but metadata is emitted once at build time and a crawler
 * sends no preference, so there is exactly one string to choose. Spanish is
 * the governing text and the audience is Colombian, so the tag follows the
 * governing version rather than the courtesy one.
 * The English equivalents, parked here for whoever adds hreflang or a
 * localised route: title "Personal Data Processing Policy | Tribe",
 * description "The controller of the personal data collected through the Tribe
 * app and website ("Tribe") is A Plus Fitness LLC, a company organized under
 * the laws of the State of New York, United States of America, which operates
 * Tribe ("we")."
 *
 * The page is a client component and cannot export metadata itself, which is
 * why this layout exists at all.
 */
export const metadata: Metadata = {
  title: 'Política de Tratamiento de Datos Personales | Tribe',
  description:
    'El responsable del tratamiento de los datos personales recogidos a través de la aplicación y el sitio web Tribe (en adelante, "Tribe") es A Plus Fitness LLC, sociedad constituida en el estado de Nueva York, Estados Unidos de América, que opera Tribe (en adelante, "nosotros").',
  robots: { index: true, follow: true },
};

export default function TratamientoDeDatosLayout({ children }: { children: React.ReactNode }) {
  return children;
}
