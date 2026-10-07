'use client';

import { useCallback, useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { useLanguage } from '@/lib/LanguageContext';
import { normalizeForWhatsApp } from '@/lib/phone';
import { trackEvent } from '@/lib/analytics';
import { renderDraft, cycleVariant, type DraftContext } from '@/lib/tribe-os/drafts/templates';
import { Copy, ExternalLink, MessageCircle, RefreshCw } from 'lucide-react';

const copy = {
  en: {
    title: 'Draft message',
    otherVersion: 'Another version',
    openWhatsApp: 'Open WhatsApp',
    copyText: 'Copy',
    copied: 'Copied!',
    noPhone: 'No phone number on file',
    close: 'Close',
  },
  es: {
    title: 'Redactar mensaje',
    otherVersion: 'Otra versión',
    openWhatsApp: 'Abrir WhatsApp',
    copyText: 'Copiar',
    copied: 'Copiado!',
    noPhone: 'Sin celular registrado',
    close: 'Cerrar',
  },
} as const;

interface DraftModalProps {
  open: boolean;
  onClose: () => void;
  context: DraftContext;
  onTouchRecorded?: () => void;
}

export default function DraftModal({ open, onClose, context, onTouchRecorded }: DraftModalProps) {
  const { language } = useLanguage();
  const s = copy[language];

  const [variant, setVariant] = useState(() => {
    const d = renderDraft(context);
    return d.variantIndex;
  });
  const [text, setText] = useState('');
  const [copied, setCopied] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (open) {
      const d = renderDraft({ ...context, language }, variant);
      setText(d.text);
      setCopied(false);
    }
  }, [open, context, language, variant]);

  const handleCycle = useCallback(() => {
    const next = cycleVariant(variant);
    setVariant(next);
    const d = renderDraft({ ...context, language }, next);
    setText(d.text);
    setCopied(false);
    trackEvent('tribe_os_draft_cycled');
  }, [variant, context, language]);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      trackEvent('tribe_os_draft_copied');
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  }, [text]);

  const handleWhatsApp = useCallback(async () => {
    const digits = normalizeForWhatsApp(context.phone);
    if (!digits) return;

    setSending(true);
    try {
      const res = await fetch('/api/tribe-os/retention/touches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: context.memberId, channel: 'whatsapp' }),
      });
      const json = await res.json();
      if (json.success) {
        trackEvent('tribe_os_draft_whatsapp_sent');
        onTouchRecorded?.();
      }
    } catch {}

    const url = `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
    setSending(false);
    onClose();
  }, [context.phone, context.memberId, text, onClose, onTouchRecorded]);

  const hasPhone = !!normalizeForWhatsApp(context.phone);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogTitle className="text-lg font-bold text-tribe-dark">{s.title}</DialogTitle>

        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={5}
          className="w-full rounded-tribe border border-gray-200 px-3 py-2 text-sm text-tribe-dark focus:outline-none focus:ring-2 focus:ring-tribe-green/40 resize-none"
        />

        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={handleCycle}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-tribe bg-gray-100 text-tribe-dark hover:bg-gray-200 transition-colors"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            {s.otherVersion}
          </button>

          <button
            type="button"
            onClick={handleCopy}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-tribe bg-gray-100 text-tribe-dark hover:bg-gray-200 transition-colors"
          >
            <Copy className="h-3.5 w-3.5" />
            {copied ? s.copied : s.copyText}
          </button>

          {hasPhone ? (
            <button
              type="button"
              onClick={handleWhatsApp}
              disabled={sending}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-tribe bg-tribe-green text-white hover:bg-tribe-green-dark transition-colors ml-auto"
            >
              <MessageCircle className="h-3.5 w-3.5" />
              {s.openWhatsApp}
              <ExternalLink className="h-3 w-3" />
            </button>
          ) : (
            <span className="text-xs text-tribe-dark-80 ml-auto">{s.noPhone}</span>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
