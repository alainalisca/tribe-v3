'use client';

import { X } from 'lucide-react';
import { showSuccess } from '@/lib/toast';

interface InviteModalProps {
  language: 'en' | 'es';
  inviteLink: string;
  session: { sport: string; location: string };
  onClose: () => void;
}

export default function InviteModal({ language, inviteLink, session, onClose }: InviteModalProps) {
  function copyInviteLink() {
    navigator.clipboard.writeText(inviteLink);
    showSuccess(language === 'es' ? '¡Enlace copiado!' : 'Link copied!');
  }

  function shareInviteLink() {
    if (navigator.share) {
      navigator
        .share({
          title: language === 'es' ? `Únete a mi sesión de ${session.sport}` : `Join me for ${session.sport}`,
          text:
            language === 'es'
              ? `Voy a entrenar ${session.sport} en ${session.location}. ¡Únete!`
              : `I'm training ${session.sport} at ${session.location}. Join me!`,
          url: inviteLink,
        })
        .catch(() => {});
    } else copyInviteLink();
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-[#6B7178] rounded-xl max-w-md w-full p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-theme-primary">
            {language === 'es' ? 'Invitar Amigo' : 'Invite Friend'}
          </h3>
          <button onClick={onClose} className="p-2 hover:bg-stone-100 dark:hover:bg-[#52575D] rounded">
            <X className="w-5 h-5 text-theme-primary" />
          </button>
        </div>
        <p className="text-sm text-stone-600 dark:text-gray-300 mb-4">
          {language === 'es'
            ? 'Comparte este enlace con amigos para que se unan sin necesidad de crear cuenta'
            : 'Share this link with friends so they can join without creating an account'}
        </p>
        <div className="bg-stone-50 dark:bg-[#52575D] p-3 rounded-lg mb-4 break-all text-sm">{inviteLink}</div>
        <div className="flex gap-3">
          <button
            onClick={copyInviteLink}
            className="flex-1 py-3 bg-stone-200 dark:bg-[#52575D] text-theme-primary font-medium rounded-lg hover:bg-stone-300 dark:hover:bg-[#6B7178]"
          >
            {language === 'es' ? 'Copiar' : 'Copy'}
          </button>
          <button
            onClick={shareInviteLink}
            className="flex-1 py-3 bg-tribe-green text-slate-900 font-medium rounded-lg hover:bg-lime-500"
          >
            {language === 'es' ? 'Compartir' : 'Share'}
          </button>
        </div>
      </div>
    </div>
  );
}
