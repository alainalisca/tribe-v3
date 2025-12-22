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
    <div className="fixed top-20 right-4 z-50 space-y-2">
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
              className="text-gray-400 hover:text-white transition"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
