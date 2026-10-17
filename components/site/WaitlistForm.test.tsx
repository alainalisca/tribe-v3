import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import WaitlistForm, { type WaitlistLabels } from './WaitlistForm';

/** T-SITE1 Part E: the /tribe-os/ waitlist posts no prices and shows the API's own error. */
const labels: WaitlistLabels = {
  name: 'Nombre',
  namePh: '',
  email: 'Correo',
  emailPh: '',
  role: 'Soy',
  roleCoach: 'Coach independiente',
  roleGym: 'Gimnasio o estudio',
  teach: '¿Qué enseñas?',
  teachPh: '',
  sessions: 'Sesiones',
  submit: 'Únete',
  sending: 'Enviando',
  done: 'Listo.',
  error: 'No pudimos agregarte.',
};

const fetchMock = vi.fn();

function fill() {
  fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Ana' } });
  fireEvent.change(screen.getByLabelText('Correo'), { target: { value: 'ana@example.com' } });
  fireEvent.change(screen.getByLabelText('Soy'), { target: { value: 'Gimnasio o estudio' } });
  fireEvent.change(screen.getByLabelText('¿Qué enseñas?'), { target: { value: 'CrossFit' } });
  fireEvent.change(screen.getByLabelText('Sesiones'), { target: { value: '12' } });
}

describe('WaitlistForm', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  it('posts name, email, what they teach, sessions and role, with no pricing preference', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ success: true }) });
    render(<WaitlistForm lang="es" labels={labels} />);
    fill();
    fireEvent.click(screen.getByRole('button', { name: /Únete/ }));
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Listo.'));
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/tribe-os-waitlist');
    expect(JSON.parse(String(init.body))).toEqual({
      name: 'Ana',
      email: 'ana@example.com',
      whatTheyTeach: 'CrossFit',
      sessionsPerWeek: 12,
      comments: 'Soy: Gimnasio o estudio',
      language: 'es',
    });
  });

  it("shows the API's message on an error, e.g. a duplicate email", async () => {
    fetchMock.mockResolvedValue({ ok: false, json: async () => ({ error: 'Ya estás en la lista de espera.' }) });
    render(<WaitlistForm lang="es" labels={labels} />);
    fill();
    fireEvent.click(screen.getByRole('button', { name: /Únete/ }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('Ya estás en la lista de espera.'));
  });
});
