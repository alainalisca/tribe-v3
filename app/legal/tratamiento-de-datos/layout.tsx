import type { Metadata } from 'next';

/**
 * noindex while the page is a stub.
 *
 * The page itself is a client component and cannot export metadata, so the
 * robots directive lives here. REMOVE THIS FILE when the policy text lands -- a
 * data-processing policy that search engines cannot see is not much of a
 * public policy, and Ley 1581 expects it to be findable.
 */
export const metadata: Metadata = {
  title: 'Política de Tratamiento de Datos Personales | Tribe',
  robots: { index: false, follow: false },
};

export default function TratamientoDeDatosLayout({ children }: { children: React.ReactNode }) {
  return children;
}
