'use client';

import { useEffect, useState } from 'react';
import { X, Users } from 'lucide-react';

interface Toast {
  id: string;
  message: string;
  type: 'success' | 'info' | 'warning' | 'error';
}

interface ToastNotificationProps {
  toasts: Toast[];
  onRemove: (id: string) => void;
}

export default function ToastNotification({ toasts, onRemove }: ToastNotificationProps) {
  return (
    <div
      className="fixed right-4 z-50 space-y-2"
      style={{ top: 'max(5rem, calc(env(safe-area-inset-top, 0px) + 4rem))' }}
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className="bg-tribe-dark border-l-4 border-tribe-green rounded-lg shadow-lg p-4 min-w-[300px] animate-slide-in"
        >
          <div className="flex items-start justify-between">
            <div className="flex items-start">
              <Users className="w-5 h-5 text-tribe-green mt-0.5 mr-3" />
              <div>
                <p className="text-white font-medium">{toast.message}</p>
              </div>
            </div>
            <button
              onClick={() => onRemove(toast.id)}
              className="text-gray-400 hover:text-white transition min-w-[44px] min-h-[44px] flex items-center justify-center -mr-2 -mt-2"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
