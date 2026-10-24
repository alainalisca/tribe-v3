import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';

/**
 * T-POLISH1 PR 4b: /create in three steps. The real page, with the network,
 * the map and the router replaced: a small history stack stands in for the
 * browser, so "Atrás" and the phone's back button can be told apart.
 */

const nav = vi.hoisted(() => {
  const listeners = new Set<() => void>();
  const s = {
    stack: ['/create/'],
    i: 0,
    listeners,
    emit: () => listeners.forEach((l) => l()),
    push(url: string) {
      s.stack = s.stack.slice(0, s.i + 1);
      s.stack.push(url);
      s.i += 1;
      s.emit();
    },
    replace(url: string) {
      s.stack[s.i] = url;
      s.emit();
    },
    go(n: number) {
      s.i = Math.max(0, Math.min(s.stack.length - 1, s.i + n));
      s.emit();
    },
    reset(url = '/create/') {
      s.stack = [url];
      s.i = 0;
    },
  };
  return s;
});

const mocks = vi.hoisted(() => ({
  insertSession: vi.fn(),
  isInstructor: false,
  confirm: vi.fn(async () => true),
  trackEvent: vi.fn(),
  showError: vi.fn(),
  // T-PAY2: the instructions of the host's last session that had some.
  latestPaymentInstructions: null as string | null,
}));

vi.mock('next/navigation', async () => {
  const React = await import('react');
  return {
    useRouter: () => ({
      push: (u: string) => nav.push(u),
      replace: (u: string) => nav.replace(u),
      back: () => nav.go(-1),
    }),
    usePathname: () => {
      const url = React.useSyncExternalStore(
        (cb: () => void) => {
          nav.listeners.add(cb);
          return () => nav.listeners.delete(cb);
        },
        () => nav.stack[nav.i]
      );
      return url.split('?')[0];
    },
    useSearchParams: () => {
      const url = React.useSyncExternalStore(
        (cb: () => void) => {
          nav.listeners.add(cb);
          return () => nav.listeners.delete(cb);
        },
        () => nav.stack[nav.i]
      );
      return new URLSearchParams(url.split('?')[1] ?? '');
    },
  };
});
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: 'host-1' } } }) } }),
}));
vi.mock('@/lib/dal', () => ({
  fetchUserProfile: async () => ({ success: true, data: { is_instructor: mocks.isInstructor } }),
  insertSession: (...args: unknown[]) => mocks.insertSession(...args),
  fetchMyLatestPaymentInstructions: async () => ({ success: true, data: mocks.latestPaymentInstructions }),
}));
vi.mock('@/lib/LanguageContext', async () => {
  const { translations } = await import('@/lib/translations');
  return {
    useLanguage: () => ({
      language: 'es',
      t: (key: string) => (translations.es as Record<string, string>)[key] ?? key,
    }),
  };
});
vi.mock('@/components/ConfirmProvider', () => ({ useConfirm: () => mocks.confirm }));
vi.mock('@/lib/analytics', () => ({ trackEvent: (...a: unknown[]) => mocks.trackEvent(...a) }));
vi.mock('@/lib/toast', () => ({
  showSuccess: vi.fn(),
  showError: (...a: unknown[]) => mocks.showError(...a),
  showInfo: vi.fn(),
}));
vi.mock('@/lib/confetti', () => ({ celebrateSessionCreated: vi.fn() }));
vi.mock('@/lib/haptics', () => ({ haptic: vi.fn() }));
vi.mock('@/lib/logger', () => ({ logError: vi.fn(), log: vi.fn() }));
vi.mock('@/components/BottomNav', () => ({ default: () => null }));
vi.mock('@/components/moments/PastSessionLink', () => ({
  default: () => <a href="/fotos/registrar-sesion/">¿Ya pasó?</a>,
}));
vi.mock('@/components/VenuePicker', () => ({ default: () => <div data-testid="venue-picker" /> }));
vi.mock('@/components/LocationPicker', () => ({
  default: ({ value, onChange, error }: { value: string; onChange: (v: string) => void; error?: string }) => (
    <div>
      <input aria-label="lugar" value={value} onChange={(e) => onChange(e.target.value)} />
      {error && <p>{error}</p>}
    </div>
  ),
}));
vi.mock('./PhotoUploadSection', () => ({ default: () => <div data-testid="photos" /> }));
vi.mock('@/components/RecurringSessionToggle', () => ({ default: () => <div data-testid="recurring" /> }));
vi.mock('./TemplateSection', () => ({
  default: ({ show, onLoadTemplate }: { show: string; onLoadTemplate: (t: unknown) => void }) =>
    show === 'use' ? (
      <button
        type="button"
        onClick={() =>
          onLoadTemplate({
            sport: 'Yoga',
            location: 'Parque de la plantilla',
            duration: 90,
            max_participants: 25,
            description: 'Desde la plantilla',
          })
        }
      >
        Usar plantilla
      </button>
    ) : (
      <button type="button">Guardar plantilla</button>
    ),
}));

import CreateSessionPage from './page';
import { draftKey, toDraft } from '@/lib/sessions/createDraft';

const KEY = draftKey('host-1');
const inDays = (n: number) => new Date(Date.now() - 5 * 3600e3 + n * 86400e3).toISOString().slice(0, 10);

/** The step the stepper shows ("Paso N de 3 · …"). */
/**
 * A button by its own text. getByRole with a name costs ~235 ms a call on this
 * page in jsdom (it computes every element's role and accessible name), the
 * text query ~0: "walks 1 → 2 → 3" spent most of its time in four of them and
 * passed 5 s when the suite ran back to back, and findByRole polls the same
 * cost inside a 1 s limit. The selector keeps it to <button> elements.
 */
const button = (name: string) => screen.getByText(name, { selector: 'button' });
const findButton = (name: string) => screen.findByText(name, { selector: 'button' });

function currentStep(): number {
  const label = screen.getByText(/^Paso \d de 3/, { selector: 'span' }).textContent ?? '';
  return Number(/Paso (\d)/.exec(label)?.[1]);
}

async function onStep(n: number) {
  await screen.findByText(new RegExp(`^Paso ${n} de 3`), { selector: 'span' });
}

function backButton() {
  act(() => nav.go(-1));
}

async function renderPage(url = '/create/') {
  nav.reset(url);
  render(<CreateSessionPage />);
  await screen.findByText(/^Paso \d de 3/, { selector: 'span' });
}

async function next() {
  fireEvent.click(button('Siguiente'));
}

async function fillStep1(sport = 'Boxing') {
  fireEvent.change(screen.getByRole('combobox'), { target: { value: sport } });
  await next();
  await onStep(2);
}

async function fillStep2() {
  fireEvent.change(document.querySelector('input[name="date"]') as HTMLInputElement, { target: { value: inDays(5) } });
  fireEvent.change(document.querySelector('input[name="start_time"]') as HTMLInputElement, {
    target: { value: '07:30' },
  });
  fireEvent.change(screen.getByLabelText('lugar'), { target: { value: 'Laureles' } });
  await next();
  await onStep(3);
}

function storedDraft(patch: Record<string, unknown> = {}, step: 1 | 2 | 3 = 2, savedAt = Date.now()) {
  const draft = toDraft(
    {
      form: {
        sport: 'Boxing',
        date: inDays(4),
        start_time: '07:00',
        duration: 60,
        location: 'Laureles',
        latitude: null,
        longitude: null,
        description: 'Del borrador',
        max_participants: 14,
        join_policy: 'open',
        skill_level: 'beginner',
        gender_preference: 'all',
        is_test: false,
        ...patch,
      },
      recurring: { is_recurring: false, recurrence_pattern: '', recurrence_end_date: '' },
      step,
      photos: [],
      venue: null,
    },
    new Date(savedAt)
  );
  window.localStorage.setItem(KEY, JSON.stringify({ ...draft, savedAt }));
}

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.setItem('tribe_photo_nudge_dismissed', '1');
  mocks.insertSession.mockReset();
  mocks.insertSession.mockResolvedValue({ success: true, data: { id: 'new-session' } });
  mocks.isInstructor = false;
  mocks.latestPaymentInstructions = null;
  mocks.trackEvent.mockReset();
  mocks.showError.mockReset();
  vi.spyOn(window.history, 'go').mockImplementation((n?: number) => nav.go(n ?? 0));
  vi.spyOn(window.history, 'pushState').mockImplementation((_d: unknown, _t: string, url?: string | URL | null) =>
    nav.push(String(url))
  );
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
  Element.prototype.scrollIntoView = vi.fn();
});

describe('step navigation', () => {
  it('walks 1 → 2 → 3 with the step in the URL, and "Atrás" keeps what was typed', async () => {
    await renderPage();
    expect(screen.getByText('Qué')).toBeInTheDocument();
    await fillStep1('Boxing');
    expect(nav.stack[nav.i]).toBe('/create/?paso=2');
    await fillStep2();
    expect(nav.stack[nav.i]).toBe('/create/?paso=3');
    fireEvent.click(button('Atrás'));
    await onStep(2);
    expect((document.querySelector('input[name="start_time"]') as HTMLInputElement).value).toBe('07:30');
    fireEvent.click(button('Atrás'));
    await onStep(1);
    expect(screen.getByRole('combobox')).toHaveValue('Boxing');
    // Back went through history, not over it.
    expect(nav.i).toBe(0);
  });

  it("the phone's back button goes to the previous step", async () => {
    await renderPage();
    await fillStep1();
    backButton();
    await onStep(1);
    expect(screen.getByRole('combobox')).toHaveValue('Boxing');
  });

  it('reports each step viewed and completed', async () => {
    await renderPage();
    await fillStep1();
    expect(mocks.trackEvent).toHaveBeenCalledWith('create_step_completed', { step: 1, step_name: 'what' });
    expect(mocks.trackEvent).toHaveBeenCalledWith('create_step_viewed', { step: 2, step_name: 'when_where' });
  });

  it('a reload on step 2 with nothing saved starts again at step 1', async () => {
    await renderPage('/create/?paso=2');
    await onStep(1);
  });

  it('puts equipment on no step (it is set after publishing, on the edit page)', async () => {
    await renderPage();
    expect(document.querySelector('input[name="equipment"]')).toBeNull();
    await fillStep1();
    expect(document.querySelector('input[name="equipment"]')).toBeNull();
    await fillStep2();
    expect(document.querySelector('input[name="equipment"]')).toBeNull();
  });
});

describe('validation per step', () => {
  it('step 1 needs a sport and does not move without one', async () => {
    await renderPage();
    await next();
    expect(await screen.findByText('El deporte es obligatorio')).toBeInTheDocument();
    expect(currentStep()).toBe(1);
  });

  it("step 2 checks only step 2's fields", async () => {
    await renderPage();
    await fillStep1();
    await next();
    expect(await screen.findByText('La fecha es obligatoria')).toBeInTheDocument();
    expect(screen.getByText('La hora de inicio es obligatoria')).toBeInTheDocument();
    expect(screen.getByText('La ubicación es obligatoria')).toBeInTheDocument();
    expect(screen.queryByText(/atletas\./)).toBeNull();
    expect(currentStep()).toBe(2);
  });

  it('a time today that has passed holds step 2', async () => {
    await renderPage();
    await fillStep1();
    fireEvent.change(document.querySelector('input[name="date"]') as HTMLInputElement, {
      target: { value: inDays(0) },
    });
    fireEvent.change(document.querySelector('input[name="start_time"]') as HTMLInputElement, {
      target: { value: '00:00' },
    });
    fireEvent.change(screen.getByLabelText('lugar'), { target: { value: 'Laureles' } });
    await next();
    expect(await screen.findByText('Elige una hora que aún no haya pasado.')).toBeInTheDocument();
  });
});

describe('Publicar', () => {
  it('re-checks every step and lands on the first that fails (the start passed while on step 3)', async () => {
    // A start two minutes ahead in Bogotá: valid when the draft is restored.
    const soon = new Date(Date.now() + 2 * 60e3 - 5 * 3600e3).toISOString();
    storedDraft({ date: soon.slice(0, 10), start_time: soon.slice(11, 16) }, 3);
    await renderPage('/create/?paso=3');
    await onStep(3);
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      vi.setSystemTime(Date.now() + 10 * 60e3);
      fireEvent.click(button('Publicar sesión'));
      await onStep(2);
      expect(screen.getByText('Elige una hora que aún no haya pasado.')).toBeInTheDocument();
      expect(mocks.showError).toHaveBeenCalledWith('Revisa el paso 2: Cuándo y dónde.');
      expect(mocks.insertSession).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('a reload on step 3 whose draft lost its place lands on step 2', async () => {
    storedDraft({ location: '' }, 3);
    await renderPage('/create/?paso=3');
    await onStep(2);
    expect(screen.getByText('La ubicación es obligatoria')).toBeInTheDocument();
  });

  it("routes the paid block's errors to step 3", async () => {
    mocks.isInstructor = true;
    await renderPage();
    await fillStep1();
    await fillStep2();
    fireEvent.click(await screen.findByRole('switch', { name: '' }));
    fireEvent.change(document.querySelector('input[name="price_display"]') as HTMLInputElement, {
      target: { value: '1000' },
    });
    fireEvent.click(button('Publicar sesión'));
    expect(await screen.findByText('El precio mínimo es 20.000 COP')).toBeInTheDocument();
    expect(screen.getByText('Las instrucciones de pago son obligatorias')).toBeInTheDocument();
    expect(currentStep()).toBe(3);
    expect(mocks.insertSession).not.toHaveBeenCalled();
  });

  it('T-PAY2: a paid session starts with the instructions of the last one that had some', async () => {
    mocks.isInstructor = true;
    mocks.latestPaymentInstructions = 'Nequi 300 123 4567 o paga aquí https://bold.co/pago';
    await renderPage();
    await fillStep1();
    await fillStep2();
    fireEvent.click(await screen.findByRole('switch', { name: '' }));
    const field = document.querySelector('textarea[name="payment_instructions"]') as HTMLTextAreaElement;
    await waitFor(() => expect(field.value).toBe('Nequi 300 123 4567 o paga aquí https://bold.co/pago'));
    expect(field.placeholder).toContain('link de pago de Bold, Wompi o Mercado Pago');
  });

  it('publishes a whole number of athletes, no equipment, and clears the draft', async () => {
    await renderPage();
    await fillStep1();
    await fillStep2();
    await waitFor(() => expect(window.localStorage.getItem(KEY)).not.toBeNull(), { timeout: 2000 });
    fireEvent.click(button('Publicar sesión'));
    await waitFor(() => expect(mocks.insertSession).toHaveBeenCalledTimes(1));
    const payload = mocks.insertSession.mock.calls[0][1] as Record<string, unknown>;
    expect(payload).toMatchObject({ sport: 'Boxing', location: 'Laureles', max_participants: 10, start_time: '07:30' });
    expect(payload).not.toHaveProperty('equipment');
    await screen.findByText('¡Sesión creada!');
    expect(window.localStorage.getItem(KEY)).toBeNull();
  });

  it("puts the database's session_start_in_past on the time, on step 2, in Spanish", async () => {
    mocks.insertSession.mockResolvedValue({ success: false, error: 'session_start_in_past' });
    await renderPage();
    await fillStep1();
    await fillStep2();
    fireEvent.click(button('Publicar sesión'));
    await onStep(2);
    expect(screen.getByText('Elige una hora que aún no haya pasado.')).toBeInTheDocument();
  });

  it("puts the database's capacity refusal on max athletes, on step 3", async () => {
    mocks.insertSession.mockResolvedValue({
      success: false,
      error: 'new row for relation "sessions" violates check constraint "sessions_max_participants_range"',
    });
    await renderPage();
    await fillStep1();
    await fillStep2();
    fireEvent.click(button('Publicar sesión'));
    expect(await screen.findByText('Elige entre 2 y 500 atletas.')).toBeInTheDocument();
    expect(currentStep()).toBe(3);
  });

  it('"Agregar foto" on the no-photo question goes back to step 1, where the photos are', async () => {
    window.sessionStorage.removeItem('tribe_photo_nudge_dismissed');
    mocks.confirm.mockResolvedValueOnce(false);
    await renderPage();
    await fillStep1();
    await fillStep2();
    fireEvent.click(button('Publicar sesión'));
    await onStep(1);
    expect(screen.getByTestId('photos')).toBeInTheDocument();
    expect(mocks.insertSession).not.toHaveBeenCalled();
  });
});

describe('the draft', () => {
  it('is saved as the host types, without any payment field', async () => {
    mocks.isInstructor = true;
    await renderPage();
    await fillStep1();
    await fillStep2();
    fireEvent.click(await screen.findByRole('switch', { name: '' }));
    fireEvent.change(document.querySelector('input[name="price_display"]') as HTMLInputElement, {
      target: { value: '45000' },
    });
    fireEvent.change(document.querySelector('textarea[name="payment_instructions"]') as HTMLTextAreaElement, {
      target: { value: 'Nequi 300 000 0000' },
    });
    await waitFor(
      () => {
        const raw = window.localStorage.getItem(KEY) ?? '';
        expect(raw).toContain('"step":3');
      },
      { timeout: 2000 }
    );
    await new Promise((r) => setTimeout(r, 700));
    const raw = window.localStorage.getItem(KEY) as string;
    expect(raw).toContain('Boxing');
    for (const banned of ['is_paid', 'price_display', 'currency', 'payment_instructions', 'Nequi', '45000']) {
      expect(raw).not.toContain(banned);
    }
  });

  it('keeps a change made just before leaving (no waiting out the 500 ms)', async () => {
    nav.reset('/create/');
    const { unmount } = render(<CreateSessionPage />);
    await onStep(1);
    await new Promise((r) => setTimeout(r, 50));
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'Yoga' } });
    unmount();
    expect(window.localStorage.getItem(KEY)).toContain('"sport":"Yoga"');
  });

  it('is offered on step 1, and "Continuar" returns to its step with its values', async () => {
    storedDraft({}, 2);
    await renderPage();
    expect(await screen.findByText('Tienes un borrador sin publicar')).toBeInTheDocument();
    fireEvent.click(button('Continuar'));
    await onStep(2);
    expect((document.querySelector('input[name="date"]') as HTMLInputElement).value).toBe(inDays(4));
    expect(screen.getByLabelText('lugar')).toHaveValue('Laureles');
    expect(mocks.trackEvent).toHaveBeenCalledWith('create_draft_restored', expect.objectContaining({ step: 2 }));
  });

  it('"Empezar de nuevo" removes it', async () => {
    storedDraft({}, 2);
    await renderPage();
    fireEvent.click(await findButton('Empezar de nuevo'));
    expect(screen.queryByText('Tienes un borrador sin publicar')).toBeNull();
    expect(window.localStorage.getItem(KEY)).toBeNull();
    expect(screen.getByRole('combobox')).toHaveValue('');
  });

  it('older than 7 days is dropped, not offered', async () => {
    storedDraft({}, 2, Date.now() - 8 * 24 * 3600e3);
    await renderPage();
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByText('Tienes un borrador sin publicar')).toBeNull();
    expect(window.localStorage.getItem(KEY)).toBeNull();
  });

  it('with a date that has passed comes back without the date or the time', async () => {
    storedDraft({ date: inDays(-2) }, 2);
    await renderPage();
    fireEvent.click(await findButton('Continuar'));
    await onStep(2);
    expect((document.querySelector('input[name="date"]') as HTMLInputElement).value).toBe('');
    expect((document.querySelector('input[name="start_time"]') as HTMLInputElement).value).toBe('');
    expect(screen.getByLabelText('lugar')).toHaveValue('Laureles');
  });

  it('a reload mid-flow carries on with it', async () => {
    storedDraft({}, 3);
    await renderPage('/create/?paso=3');
    await onStep(3);
    expect(screen.getByRole('spinbutton')).toHaveValue(14);
  });
});

describe('resuming a draft (Continuar)', () => {
  it('resumes on step 2, with ?paso=2 in the address', async () => {
    storedDraft({}, 2);
    await renderPage();
    fireEvent.click(await findButton('Continuar'));
    await onStep(2);
    expect(nav.stack[nav.i]).toBe('/create/?paso=2');
  });

  it('resumes on step 3, with a history entry for each step on the way', async () => {
    storedDraft({}, 3);
    await renderPage();
    fireEvent.click(await findButton('Continuar'));
    await onStep(3);
    expect(nav.stack).toEqual(['/create/', '/create/?paso=2', '/create/?paso=3']);
    expect(screen.getByRole('spinbutton')).toHaveValue(14);
    expect(mocks.trackEvent).toHaveBeenCalledWith('create_draft_restored', expect.objectContaining({ step: 3 }));
  });

  it('a stale date sends the host to step 2, not the saved step 3, with the error showing', async () => {
    storedDraft({ date: inDays(-3) }, 3);
    await renderPage();
    fireEvent.click(await findButton('Continuar'));
    await onStep(2);
    expect(screen.getByText('La fecha es obligatoria')).toBeInTheDocument();
    expect(nav.stack).toEqual(['/create/', '/create/?paso=2']);
  });

  it("the phone's back button walks back from the resumed step, values intact", async () => {
    storedDraft({}, 3);
    await renderPage();
    fireEvent.click(await findButton('Continuar'));
    await onStep(3);
    backButton();
    await onStep(2);
    expect(screen.getByLabelText('lugar')).toHaveValue('Laureles');
    backButton();
    await onStep(1);
    expect(screen.getByRole('combobox')).toHaveValue('Boxing');
  });

  it('"Atrás" after resuming goes back through those entries too', async () => {
    storedDraft({}, 3);
    await renderPage();
    fireEvent.click(await findButton('Continuar'));
    await onStep(3);
    fireEvent.click(button('Atrás'));
    await onStep(2);
    expect(nav.i).toBe(1);
  });

  it('a saved step outside 1..3 resumes on 1 or 3, never outside the flow', async () => {
    const { clampStep } = await import('@/lib/sessions/createSteps');
    expect(clampStep(7)).toBe(3);
    expect(clampStep(0)).toBe(1);
    expect(clampStep('x')).toBe(1);
  });

  it('leaving through an in-app link keeps the step the host was on', async () => {
    await renderPage();
    await fillStep1();
    await fillStep2();
    // The router shows the next page's URL to this page before it unmounts.
    act(() => nav.push('/sessions/'));
    await new Promise((r) => setTimeout(r, 700));
    const raw = window.localStorage.getItem(KEY) as string;
    expect(raw).toContain('"step":3');
  });
});

describe('templates', () => {
  it('"Usar plantilla" on step 1 fills fields on steps 1, 2 and 3', async () => {
    await renderPage();
    fireEvent.click(button('Usar plantilla'));
    expect(screen.getByRole('combobox')).toHaveValue('Yoga');
    await next();
    await onStep(2);
    expect(screen.getByLabelText('lugar')).toHaveValue('Parque de la plantilla');
    expect(button('1h 30m')).toHaveAttribute('aria-pressed', 'true');
    fireEvent.change(document.querySelector('input[name="date"]') as HTMLInputElement, {
      target: { value: inDays(5) },
    });
    fireEvent.change(document.querySelector('input[name="start_time"]') as HTMLInputElement, {
      target: { value: '07:30' },
    });
    await next();
    await onStep(3);
    expect(screen.getByRole('spinbutton')).toHaveValue(25);
    expect(screen.getByDisplayValue('Desde la plantilla')).toBeInTheDocument();
    expect(button('Guardar plantilla')).toBeInTheDocument();
  });
});
