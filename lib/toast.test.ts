import { describe, it, expect, vi, beforeEach } from 'vitest';
import toast from 'react-hot-toast';
import { showSuccess, showError, showInfo } from './toast';

vi.mock('react-hot-toast', () => ({
  default: {
    dismiss: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
    __esModule: true,
  },
}));

// Also mock the default export call (for showInfo which uses toast() directly)
const mockToastFn = toast as unknown as ReturnType<typeof vi.fn> & typeof toast;
mockToastFn as unknown as { (): void };
// Re-mock with callable default
vi.mock('react-hot-toast', () => {
  const dismissFn = vi.fn();
  const successFn = vi.fn();
  const errorFn = vi.fn();
  const toastFn = vi.fn() as ReturnType<typeof vi.fn> & {
    dismiss: ReturnType<typeof vi.fn>;
    success: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
  };
  toastFn.dismiss = dismissFn;
  toastFn.success = successFn;
  toastFn.error = errorFn;
  return { default: toastFn };
});

describe('toast helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('showSuccess dismisses previous toasts', () => {
    showSuccess('Done!');
    expect(toast.dismiss).toHaveBeenCalled();
  });

  it('showSuccess calls toast.success with message', () => {
    showSuccess('Session created');
    expect(toast.success).toHaveBeenCalledWith(
      'Session created',
      expect.objectContaining({
        duration: 3000,
        position: 'top-center',
      })
    );
  });

  it('showSuccess uses green background', () => {
    showSuccess('Test');
    const opts = (toast.success as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(opts.style.background).toBe('#9EE551');
  });

  it('showError dismisses previous toasts', () => {
    showError('Failed');
    expect(toast.dismiss).toHaveBeenCalled();
  });

  it('showError calls toast.error with message', () => {
    showError('Something broke');
    expect(toast.error).toHaveBeenCalledWith(
      'Something broke',
      expect.objectContaining({
        duration: 4000,
        position: 'top-center',
      })
    );
  });

  it('showError uses red background', () => {
    showError('Test');
    const opts = (toast.error as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(opts.style.background).toBe('#ef4444');
  });

  it('showInfo dismisses previous toasts', () => {
    showInfo('FYI');
    expect(toast.dismiss).toHaveBeenCalled();
  });

  it('showInfo calls toast with info icon', () => {
    showInfo('Update available');
    expect(toast).toHaveBeenCalledWith(
      'Update available',
      expect.objectContaining({
        duration: 3000,
        icon: 'ℹ️',
      })
    );
  });

  it('showInfo uses blue background', () => {
    showInfo('Test');
    const toastFn = toast as unknown as ReturnType<typeof vi.fn>;
    const opts = toastFn.mock.calls[0][1];
    expect(opts.style.background).toBe('#3b82f6');
  });
});
