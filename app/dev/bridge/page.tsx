import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import {
  DayHeader,
  FactsLedger,
  FixtureRow,
  PosterHeader,
  type Fixture,
  type FixtureLabels,
} from '@/components/bridge';

/**
 * /dev/bridge (T-JOIN1 Part A): the four bridge components with sample data,
 * on the paper background (#F4F3EE) and on the app's light background, for
 * review. Storybook is not in the repo. A 404 in production.
 */
export const metadata: Metadata = { title: 'Bridge · Tribe dev', robots: { index: false, follow: false } };

const LONG =
  'Entrenamiento funcional al aire libre con trabajo de fuerza, movilidad y resistencia para todos los niveles en Laureles.';
const PHOTO = '/og/og_boxeo.jpg';
const labels: FixtureLabels = { free: 'Gratis', spots: '{n} cupos', spotsOne: '1 cupo', action: 'Pedir cupo' };
const rows: Fixture[] = [
  {
    id: 'a',
    href: '/dev/bridge/',
    days: 'Lun a vie',
    time: '06:00',
    sport: 'Boxeo',
    title: 'Boxeo con Salomon',
    detail: null,
    place: 'El Poblado',
    coach: 'Salomon T.',
    price: 'free',
    spots: 4,
  },
  {
    id: 'b',
    href: '/dev/bridge/',
    days: 'Sáb',
    time: '08:00',
    sport: 'CrossFit',
    title: 'CrossFit con Andrés',
    detail: null,
    place: 'CrossFit BullBox',
    coach: 'Andrés V.',
    price: '25.000',
    spots: 1,
  },
  {
    id: 'c',
    href: '/dev/bridge/',
    days: '4 nov',
    time: '18:30',
    sport: null,
    title: LONG,
    detail: null,
    place: 'Laureles',
    coach: 'Coach',
    price: 'free',
    spots: null,
  },
];

function Board({ background, name }: { background: string; name: string }) {
  return (
    <section style={{ background, padding: '24px 16px 40px' }}>
      <p style={{ fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 12, margin: '0 0 16px' }}>{name}</p>
      <div style={{ maxWidth: 480, display: 'grid', gap: 28 }}>
        <PosterHeader
          title="Boxeo con Salomon"
          sport="Boxeo"
          photoUrl={PHOTO}
          caption="Zona de Combate"
          tag="Gratis"
          headingLevel={2}
        />
        <PosterHeader title="Yoga con Neera" sport="Yoga" photoUrl={null} tag="Gratis" headingLevel={2} />
        <PosterHeader title={LONG} sport="Funcional" photoUrl={null} headingLevel={2} />
        <div>
          <DayHeader label="Sáb 25" count="3 sesiones" headingLevel={3} />
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {rows.map((f) => (
              <FixtureRow key={f.id} fixture={f} labels={labels} tone="app" />
            ))}
          </ul>
        </div>
        <FactsLedger
          facts={[
            { label: 'Cuándo', value: 'Lunes 20 de octubre, 06:00', sub: '60 min · se repite cada lunes' },
            { label: 'Dónde', value: 'Zona de Combate', sub: 'El Poblado · Cómo llegar' },
            { label: 'Cuánto', value: 'Gratis', sub: 'Directo a Salomon. Tribe no cobra comisión.' },
            { label: 'Quién', value: 'Van 6', sub: '4 cupos' },
          ]}
        />
      </div>
    </section>
  );
}

export default function BridgeDevPage() {
  if (process.env.NODE_ENV === 'production') notFound();
  return (
    <main>
      <h1 style={{ fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 14, padding: '16px 16px 0', margin: 0 }}>
        T-JOIN1 bridge components
      </h1>
      <Board background="#F4F3EE" name="paper #F4F3EE" />
      <Board background="#FFFFFF" name="app light background" />
    </main>
  );
}
