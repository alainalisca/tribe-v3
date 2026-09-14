/**
 * T-GYM4: the apply page's failure modes.
 *
 * Each test asserts what a user would experience -- a message appears, a row is
 * or is not created, the form is or is not on screen -- rather than checking
 * that some identifier is present.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), back: vi.fn() }) }));

const getUser = vi.fn();
const profileSingle = vi.fn();
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: { getUser },
    from: () => ({ select: () => ({ eq: () => ({ single: profileSingle }) }) }),
  }),
}));

const showError = vi.fn();
const showSuccess = vi.fn();
vi.mock('@/lib/toast', () => ({
  showError: (m: string) => showError(m),
  showSuccess: (m: string) => showSuccess(m),
  showInfo: vi.fn(),
}));
vi.mock('@/lib/logger', () => ({ logError: vi.fn() }));
// useTranslations reads the language context; the real messages/*.json are used
// so the assertions below are against the copy a user actually sees.
vi.mock('@/lib/LanguageContext', () => ({ useLanguage: () => ({ language: 'en' }) }));
vi.mock('@/components/BottomNav', () => ({ default: () => null }));

const applyForPartnership = vi.fn();
const fetchPartnerByUserId = vi.fn();
const selfActivatePartner = vi.fn();
vi.mock('@/lib/dal/featuredPartners', () => ({
  applyForPartnership: (...a: unknown[]) => applyForPartnership(...a),
  fetchPartnerByUserId: (...a: unknown[]) => fetchPartnerByUserId(...a),
  selfActivatePartner: (...a: unknown[]) => selfActivatePartner(...a),
}));
const createNotification = vi.fn();
const fetchAdminUserIds = vi.fn();
vi.mock('@/lib/dal', () => ({
  createNotification: (...a: unknown[]) => createNotification(...a),
  fetchAdminUserIds: (...a: unknown[]) => fetchAdminUserIds(...a),
  enableInstructorAccount: vi.fn().mockResolvedValue({ success: true, data: null }),
}));

import PartnerApplyPage from './page';

const INSTRUCTOR = { data: { is_instructor: true }, error: null };

async function renderReady() {
  render(<PartnerApplyPage />);
  return screen.findByText(/Business Name/);
}

describe('apply page hardening', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    profileSingle.mockResolvedValue(INSTRUCTOR);
    fetchPartnerByUserId.mockResolvedValue({ success: true, data: null });
    applyForPartnership.mockResolvedValue({ success: true, data: { id: 'p1' } });
    selfActivatePartner.mockResolvedValue({ success: true, data: { alreadyActive: false } });
    createNotification.mockResolvedValue({ success: true });
    fetchAdminUserIds.mockResolvedValue({ success: true, data: ['admin-1'] });
  });

  it('an empty required field produces a visible message and no write', async () => {
    await renderReady();
    fireEvent.click(screen.getByText('Submit Application'));

    // The old guard returned silently, so the button looked broken.
    expect(await screen.findByText("Enter your gym's name")).toBeTruthy();
    expect(screen.getByText('Enter an address so athletes can find you')).toBeTruthy();
    expect(applyForPartnership).not.toHaveBeenCalled();
  });

  it('the message clears as soon as the field is edited', async () => {
    await renderReady();
    fireEvent.click(screen.getByText('Submit Application'));
    await screen.findByText("Enter your gym's name");

    const input = screen.getAllByRole('textbox')[0];
    fireEvent.change(input, { target: { value: 'CrossFit BullBox' } });
    await waitFor(() => expect(screen.queryByText("Enter your gym's name")).toBeNull());
  });

  it('a complete form submits', async () => {
    await renderReady();
    fireEvent.change(screen.getAllByRole('textbox')[0], { target: { value: 'CrossFit BullBox' } });
    // address is the 4th textbox (name, desc en, desc es, address)
    fireEvent.change(screen.getAllByRole('textbox')[3], { target: { value: 'Cra 43G #25a-50' } });
    fireEvent.click(screen.getByText('Submit Application'));
    await waitFor(() => expect(applyForPartnership).toHaveBeenCalled());
    expect(applyForPartnership.mock.calls[0][2]).toMatchObject({
      business_name: 'CrossFit BullBox',
      address: 'Cra 43G #25a-50',
    });
  });

  it('a unique violation reads as a sentence, not as Postgres', async () => {
    applyForPartnership.mockResolvedValue({
      success: false,
      error: 'duplicate key value violates unique constraint "featured_partners_user_id_key"',
    });
    await renderReady();
    fireEvent.change(screen.getAllByRole('textbox')[0], { target: { value: 'X' } });
    fireEvent.change(screen.getAllByRole('textbox')[3], { target: { value: 'Y' } });
    fireEvent.click(screen.getByText('Submit Application'));

    await waitFor(() => expect(showError).toHaveBeenCalled());
    const shown = showError.mock.calls[0][0] as string;
    expect(shown).not.toMatch(/duplicate key|constraint/i);
    expect(shown).toMatch(/already have an application/i);
  });

  it('a CHECK violation also reads as a sentence', async () => {
    applyForPartnership.mockResolvedValue({
      success: false,
      error: 'new row violates check constraint "featured_partners_business_type_check"',
    });
    await renderReady();
    fireEvent.change(screen.getAllByRole('textbox')[0], { target: { value: 'X' } });
    fireEvent.change(screen.getAllByRole('textbox')[3], { target: { value: 'Y' } });
    fireEvent.click(screen.getByText('Submit Application'));

    await waitFor(() => expect(showError).toHaveBeenCalled());
    expect(showError.mock.calls[0][0]).not.toMatch(/check constraint/i);
  });

  it('a failed existing-application lookup hides the form instead of risking a duplicate', async () => {
    fetchPartnerByUserId.mockResolvedValue({ success: false, error: 'network' });
    render(<PartnerApplyPage />);
    expect(await screen.findByText("Couldn't load your account")).toBeTruthy();
    expect(screen.queryByText(/Business Name/)).toBeNull();
    expect(screen.queryByText('Submit Application')).toBeNull();
  });

  it('a failed profile lookup does NOT claim the user lacks an account', async () => {
    profileSingle.mockResolvedValue({ data: null, error: { message: 'network' } });
    render(<PartnerApplyPage />);
    expect(await screen.findByText("Couldn't load your account")).toBeTruthy();
    expect(screen.queryByText('Gym account not enabled yet')).toBeNull();
  });

  it('a genuine non-instructor gets a way forward, not a dead end', async () => {
    profileSingle.mockResolvedValue({ data: { is_instructor: false }, error: null });
    render(<PartnerApplyPage />);
    expect(await screen.findByText('Gym account not enabled yet')).toBeTruthy();
    // The old screen had no control at all.
    expect(screen.getByText('Enable gym account')).toBeTruthy();
  });

  it('self-activation notifies an admin, because it bypasses the queue', async () => {
    // The Activate Now button is kept deliberately. The notification is the
    // thing that stops an account going live with nobody told.
    fetchPartnerByUserId.mockResolvedValue({
      success: true,
      data: { id: 'p1', status: 'pending', business_name: 'CrossFit BullBox' },
    });
    render(<PartnerApplyPage />);
    fireEvent.click(await screen.findByText('Get Featured — Free'));

    await waitFor(() => expect(selfActivatePartner).toHaveBeenCalled());
    await waitFor(() => expect(createNotification).toHaveBeenCalled());
    const payload = createNotification.mock.calls[0][1] as Record<string, unknown>;
    expect(payload.recipient_id).toBe('admin-1');
    expect(payload.entity_id).toBe('p1');
    expect(String(payload.message)).toMatch(/CrossFit BullBox/);
  });

  it('a failed admin bell does not break activation', async () => {
    fetchPartnerByUserId.mockResolvedValue({
      success: true,
      data: { id: 'p1', status: 'pending', business_name: 'X' },
    });
    createNotification.mockResolvedValue({ success: false, error: 'boom' });
    render(<PartnerApplyPage />);
    fireEvent.click(await screen.findByText('Get Featured — Free'));
    await waitFor(() => expect(showSuccess).toHaveBeenCalled());
  });

  it('offers gym and studio only', async () => {
    await renderReady();
    const options = screen.getAllByRole('option') as HTMLOptionElement[];
    expect(options.map((o) => o.value).sort()).toEqual(['gym', 'studio']);
  });
});
