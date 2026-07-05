import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import BlockReportControls from './BlockReportControls';

// DAL + toast mocks (hoisted so the vi.mock factories can reference them).
const { blockUser, unblockUser, reportUser, fetchBlockedStatus } = vi.hoisted(() => ({
  blockUser: vi.fn(),
  unblockUser: vi.fn(),
  reportUser: vi.fn(),
  fetchBlockedStatus: vi.fn(),
}));
const { showSuccess, showError, showInfo } = vi.hoisted(() => ({
  showSuccess: vi.fn(),
  showError: vi.fn(),
  showInfo: vi.fn(),
}));

vi.mock('@/lib/dal', () => ({ blockUser, unblockUser, reportUser, fetchBlockedStatus }));
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({}) }));
vi.mock('@/lib/LanguageContext', () => ({ useLanguage: () => ({ language: 'en' }) }));
vi.mock('@/lib/toast', () => ({ showSuccess, showError, showInfo }));
vi.mock('@/lib/errorMessages', () => ({ getErrorMessage: () => 'error' }));
vi.mock('@/lib/logger', () => ({ logError: vi.fn() }));

// Stub the child modals so the test can drive block confirmation + report submit
// without depending on Radix dialog internals.
vi.mock('@/components/ReportUserModal', () => ({
  default: ({ onReasonChange, onSubmit }: { onReasonChange: (v: string) => void; onSubmit: () => void }) => (
    <div data-testid="report-modal">
      <button onClick={() => onReasonChange('spam')}>set-reason</button>
      <button onClick={onSubmit}>submit-report</button>
    </div>
  ),
}));
vi.mock('@/components/ConfirmDialog', () => ({
  default: ({ open, onConfirm }: { open: boolean; onConfirm: () => void }) =>
    open ? <button onClick={onConfirm}>confirm</button> : null,
}));

const TARGET = 'instructor-1';
const VIEWER = 'athlete-2';

describe('BlockReportControls', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchBlockedStatus.mockResolvedValue({ success: true, data: false });
    blockUser.mockResolvedValue({ success: true });
    unblockUser.mockResolvedValue({ success: true });
    reportUser.mockResolvedValue({ success: true });
  });

  it('renders nothing for a logged-out viewer', () => {
    const { container } = render(<BlockReportControls targetUserId={TARGET} viewerId={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when viewing your own profile', () => {
    const { container } = render(<BlockReportControls targetUserId={TARGET} viewerId={TARGET} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('blocks the target through the DAL after confirmation', async () => {
    render(<BlockReportControls targetUserId={TARGET} viewerId={VIEWER} />);
    // Two controls render initially: [block, report].
    const [blockBtn] = screen.getAllByRole('button');
    fireEvent.click(blockBtn);
    fireEvent.click(await screen.findByText('confirm'));
    await waitFor(() =>
      expect(blockUser).toHaveBeenCalledWith(expect.anything(), { user_id: VIEWER, blocked_user_id: TARGET })
    );
  });

  it('reports the target through the DAL with reporter/reported ids', async () => {
    render(<BlockReportControls targetUserId={TARGET} viewerId={VIEWER} />);
    const buttons = screen.getAllByRole('button');
    fireEvent.click(buttons[1]); // report opens the (stubbed) modal
    fireEvent.click(screen.getByText('set-reason'));
    fireEvent.click(screen.getByText('submit-report'));
    await waitFor(() =>
      expect(reportUser).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ reporter_id: VIEWER, reported_user_id: TARGET, reason: 'spam' })
      )
    );
  });
});
