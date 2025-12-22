import toast from 'react-hot-toast';

export const showSuccess = (message: string) => {
  toast.success(message, {
    duration: 3000,
    position: 'top-center',
    style: {
      background: '#9EE551',
      color: '#1e293b',
      fontWeight: '600',
      padding: '16px',
      borderRadius: '12px',
    },
  });
};

export const showError = (message: string) => {
  toast.error(message, {
    duration: 4000,
    position: 'top-center',
    style: {
      background: '#ef4444',
      color: '#fff',
      fontWeight: '600',
      padding: '16px',
      borderRadius: '12px',
    },
  });
};

export const showInfo = (message: string) => {
  toast(message, {
    duration: 3000,
    position: 'top-center',
    icon: 'ℹ️',
    style: {
      background: '#3b82f6',
      color: '#fff',
      fontWeight: '600',
      padding: '16px',
      borderRadius: '12px',
    },
  });
};
