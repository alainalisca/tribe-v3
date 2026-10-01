/**
 * T-AV24: the athlete home renders the view it is given, in Spanish.
 * The numbers come from the view, which comes from the ledger; the live
 * numbers per seeded athlete are proven by t-av24-proof.LOCAL.sh.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/lib/LanguageContext', () => ({ useLanguage: () => ({ language: 'es' }) }));
vi.mock('@/components/BottomNav', () => ({ default: () => null }));
vi.mock('@/lib/toast', () => ({ showSuccess: vi.fn() }));
vi.mock('@/lib/logger', () => ({ logError: vi.fn() }));
vi.mock('server-only', () => ({}));

import AthleteHome from './AthleteHome';
import { toAthleteHomeView } from '@/lib/atletas/athleteHomeView';
import { summaryProgram } from '@/lib/atletas/fixtures';
import { renderQrSvg } from '@/lib/qr/renderQrSvg';

const LINK = 'http://localhost:3001/pase/bullbox-prueba/?src=atleta&code=ANA-7KQ';
const view = (o: Parameters<typeof summaryProgram>[0] = {}, qr = renderQrSvg(LINK, LINK)) =>
  toAthleteHomeView(summaryProgram(o), { link: LINK, qrSvg: qr, firstName: 'Ana', avatarUrl: null });
const metric = (c: HTMLElement, k: string) => c.querySelector(`[data-metric="${k}"]`)?.textContent;

describe('AthleteHome', () => {
  it('not in a program: the Spanish not-in-program copy and the emotional line', () => {
    render(<AthleteHome view={{ state: 'none' }} />);
    expect(screen.getByText('Todavía no eres Atleta Tribe')).toBeTruthy();
    expect(screen.getByText('Si alguna vez quisiste ser atleta profesional, todavía estás a tiempo.')).toBeTruthy();
  });

  it('Ana, captain at 9 of 10: numbers, progress, not ready, no bonus, the link and its QR', () => {
    const { container } = render(<AthleteHome view={view()} />);
    expect([
      metric(container, 'invited'),
      metric(container, 'showedUp'),
      metric(container, 'joined'),
      metric(container, 'stayed'),
    ]).toEqual(['9', '9', '0', '0']);
    expect(screen.getByText('9 de 10 llegadas')).toBeTruthy();
    expect(screen.queryByText('Listo: tu gimnasio confirma el siguiente paso')).toBeNull();
    expect(container.querySelector('[data-bonus]')).toBeNull();
    expect((container.querySelector('[data-athlete-link]') as HTMLInputElement).value).toBe(LINK);
    expect(container.querySelector('[data-link-qr] svg')?.getAttribute('aria-label')).toBe(LINK);
    const wa = container.querySelector('[data-share="whatsapp"]')?.getAttribute('href') ?? '';
    expect(new URL(wa).searchParams.get('text')).toBe(
      `Ven a entrenar conmigo en BullBox (Prueba). Tu primera clase es gratis: ${LINK}`
    );
  });

  it('a captain at the threshold sees "Listo"', () => {
    render(<AthleteHome view={view({ progress: { showups: 10, promote_at: 10 }, ready_to_promote: true })} />);
    expect(screen.getByText('Listo: tu gimnasio confirma el siguiente paso')).toBeTruthy();
  });

  it('athlete level: the bonus amount shows and the progress bar does not', () => {
    const { container } = render(<AthleteHome view={view({ level: 'athlete' })} />);
    expect(container.querySelector('[data-bonus]')?.textContent).toContain('50.000');
    expect(container.querySelector('[data-progress]')).toBeNull();
  });

  it('paused: the link is replaced by the not-active line, and the numbers stay', () => {
    const { container } = render(<AthleteHome view={view({ status: 'paused' })} />);
    expect(screen.getByText('Tu link no está activo ahora. Habla con tu gimnasio.')).toBeTruthy();
    expect(container.querySelector('[data-athlete-link]')).toBeNull();
    expect(container.querySelector('[data-link-qr]')).toBeNull();
    expect(metric(container, 'invited')).toBe('9');
  });

  it('a guest who does not count shows "No cuenta" and the reason', () => {
    render(<AthleteHome view={view()} />);
    expect(screen.getByText('No cuenta')).toBeTruthy();
    expect(screen.getByText('Tu propio link no cuenta')).toBeTruthy();
    expect(screen.getByText('Llegó')).toBeTruthy();
  });

  it("never injects a QR string that is not exactly the renderer's shape", () => {
    const { container } = render(<AthleteHome view={view({}, '<svg onload="alert(1)"></svg>')} />);
    expect(container.querySelector('[data-link-qr]')).toBeNull();
  });
});
