import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DayHeader, FactsLedger, FixtureRow, PosterHeader, type Fixture, type FixtureLabels } from './index';

/**
 * T-JOIN1 Part A. The four bridge components, snapshot by snapshot, with the
 * cases the spec names: the no-photo poster, and a 120-character title on the
 * row and on the poster (clamped to two lines by CSS, never cut in the text).
 */
const LONG =
  'Entrenamiento funcional al aire libre con trabajo de fuerza, movilidad y resistencia para todos los niveles en Laureles.';
const labels: FixtureLabels = { free: 'Gratis', spots: '{n} cupos', spotsOne: '1 cupo', action: 'Pedir cupo' };
const fixture: Fixture = {
  id: 's1',
  href: '/session/s1/',
  days: 'Lun a vie',
  time: '06:00',
  sport: 'Boxeo',
  title: 'Boxeo con Salomon',
  detail: '60 min',
  place: 'El Poblado',
  coach: 'Salomon T.',
  price: 'free',
  spots: 4,
};
const photo = 'https://x.supabase.co/storage/v1/object/public/session-photos/a.jpg';

describe('PosterHeader', () => {
  it('a photo, anchored top centre, with the title over it and both tags', () => {
    const { container } = render(
      <PosterHeader title="Boxeo con Salomon" sport="Boxeo" photoUrl={photo} caption="Zona de Combate" tag="Gratis" />
    );
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Boxeo con Salomon');
    expect(container.querySelector('img')?.getAttribute('style')).toMatch(/object-position:\s*center top/);
    expect(container.innerHTML).toMatchSnapshot();
  });

  it('no photo: the ink grid, the sport above the title, no image', () => {
    const { container } = render(<PosterHeader title="Yoga con Neera" sport="Yoga" photoUrl={null} />);
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByText('Yoga')).toBeTruthy();
    expect(container.innerHTML).toMatchSnapshot();
  });

  it('a 120-character title is kept whole in the text; CSS clamps it to two lines', () => {
    expect(LONG).toHaveLength(120);
    const { container } = render(<PosterHeader title={LONG} sport="Funcional" photoUrl={photo} anchor="50% 20%" />);
    expect(screen.getByRole('heading').textContent).toBe(LONG);
    expect(container.querySelector('img')?.getAttribute('style')).toMatch(/object-position:\s*50% 20%/);
    expect(container.innerHTML).toMatchSnapshot();
  });

  it('a photo on a host next/image does not serve renders as a plain image, never a broken one', () => {
    const { container } = render(<PosterHeader title="x" sport={null} photoUrl="https://example.com/p.jpg" />);
    expect(container.querySelector('img')?.getAttribute('src')).toBe('https://example.com/p.jpg');
  });
});

describe('FixtureRow, app tone', () => {
  it('one link whose name is its visible text: time and days, sport over title, place and coach, Gratis', () => {
    const { container } = render(
      <ul>
        <FixtureRow fixture={fixture} labels={labels} tone="app" />
      </ul>
    );
    const link = screen.getByRole('link');
    expect(link.getAttribute('aria-label')).toBeNull();
    expect(link.getAttribute('href')?.replace(/\/$/, '')).toBe('/session/s1');
    expect(link.textContent).toBe('06:00Lun a vieBoxeoBoxeo con SalomonEl Poblado · Salomon T.Gratis4 cupos');
    expect(container.innerHTML).toMatchSnapshot();
  });

  it('a paid session shows its price in mono; a 120-character title stays whole', () => {
    const { container } = render(
      <ul>
        <FixtureRow
          fixture={{ ...fixture, title: LONG, price: '25.000', spots: 1, sport: null }}
          labels={labels}
          tone="app"
        />
      </ul>
    );
    expect(screen.getByText(LONG)).toBeTruthy();
    expect(screen.getByText('25.000')).toBeTruthy();
    expect(screen.getByText('1 cupo')).toBeTruthy();
    expect(screen.queryByText('Gratis')).toBeNull();
    expect(container.innerHTML).toMatchSnapshot();
  });
});

describe('DayHeader and FactsLedger', () => {
  it('a day label in display type, its count in mono', () => {
    const { container } = render(<DayHeader label="Sáb 25" count="3 sesiones" />);
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe('Sáb 25');
    expect(container.innerHTML).toMatchSnapshot();
  });

  it('the facts as a definition list, label, value and line under', () => {
    const { container } = render(
      <FactsLedger
        facts={[
          { label: 'Cuándo', value: 'Lunes 20 de octubre, 06:00', sub: '60 min · se repite cada lunes' },
          { label: 'Dónde', value: 'Zona de Combate', sub: 'El Poblado' },
          { label: 'Cuánto', value: 'Gratis' },
        ]}
      />
    );
    expect([...container.querySelectorAll('dt')].map((d) => d.textContent)).toEqual(['Cuándo', 'Dónde', 'Cuánto']);
    expect(container.querySelectorAll('dd')[0].textContent).toBe(
      'Lunes 20 de octubre, 06:0060 min · se repite cada lunes'
    );
    expect(container.innerHTML).toMatchSnapshot();
  });
});

describe('the bridge carries no site copy', () => {
  // The app's client pages render these; site copy (messages/site via
  // lib/site/i18n or messages) must never ride along into the browser bundle.
  it.each([
    'components/bridge/PosterHeader.tsx',
    'components/bridge/DayHeader.tsx',
    'components/bridge/FactsLedger.tsx',
    'components/site/FixtureRow.tsx',
  ])('%s imports neither lib/site/i18n nor lib/site/messages', (file) => {
    // Import statements only: FixtureRow's own comment names messages/site while
    // explaining why it must not import it, and prose is not an import.
    const imports = readFileSync(join(process.cwd(), file), 'utf8').match(/^import[^;]+;/gm) ?? [];
    expect(imports.length).toBeGreaterThan(0);
    expect(imports.filter((i) => /lib\/site\/(i18n|messages)|messages\/site/.test(i))).toEqual([]);
  });
});
