'use client';

import { Trash2 } from 'lucide-react';

interface DeleteConfirmModalProps {
  language: string;
  deleting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export default function DeleteConfirmModal({ language, deleting, onCancel, onConfirm }: DeleteConfirmModalProps) {
  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/60">
      <div className="bg-white dark:bg-[#2C3137] rounded-2xl p-6 mx-6 max-w-sm w-full">
        <p className="text-lg font-bold text-theme-primary text-center mb-4">
          {language === 'es' ? '¿Eliminar esta historia?' : 'Delete this story?'}
        </p>
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            disabled={deleting}
            className="flex-1 py-3 bg-stone-200 dark:bg-[#3D4349] text-theme-primary font-semibold rounded-xl hover:bg-stone-300 dark:hover:bg-[#52575D] transition"
          >
            {language === 'es' ? 'Cancelar' : 'Cancel'}
          </button>
          <button
            onClick={onConfirm}
            disabled={deleting}
            className="flex-1 py-3 bg-red-500 text-white font-semibold rounded-xl hover:bg-red-600 transition disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {deleting ? (
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white" />
            ) : (
              <>
                <Trash2 className="w-4 h-4" />
                {language === 'es' ? 'Eliminar' : 'Delete'}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
