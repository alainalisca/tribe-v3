'use client';

/**
 * ReachOutToTeamModal — bulk-message affordance for /os/teams/[id].
 *
 * Coach has a check-in to do for an entire team (e.g. "everyone in
 * Sunday morning CrossFit, here's the workout for tomorrow"). Going
 * member-by-member through the roster row buttons works but is slow
 * and easy to drop someone. This modal centralizes:
 *
 *   1. A single editable message template with a {first_name} token
 *      so each chat opens with the recipient's name already merged
 *      in.
 *   2. A live preview rendered against the first member with a phone
 *      so the coach can see what the message will actually look like.
 *   3. A pre-flight list showing exactly who will get the message
 *      and who'll be skipped (no phone). Coaches can scan it before
 *      clicking through.
 *   4. Per-member "Open chat" buttons that deep-link into WhatsApp
 *      with the rendered message pre-filled. Cmd/Ctrl-click each to
 *      batch-open in tabs.
 *
 * Why not auto-blast? WhatsApp Web/native has no bulk-send API for
 * unverified business accounts; the realistic primitive is one chat
 * at a time. We optimize the human side of that loop instead of
 * pretending we have an API we don't.
 *
 * Not gated by role — any coach who can see the team can use this.
 * If we later want owner-only outreach we can flip a flag, but for
 * now the gym_coaches RLS already enforces who sees the team page.
 */

import { useMemo, useState } from 'react';
import { MessageCircle, X as XIcon, AlertCircle, Copy, Check } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Avatar, Button } from '@/components/tribe-os/ui';
import { useLanguage } from '@/lib/LanguageContext';
import { buildWhatsAppUrl } from '@/lib/phone';
import { trackEvent } from '@/lib/analytics';
import type { GymTeamWithMembers } from '@/lib/dal/gymTeams';

type TeamMember = GymTeamWithMembers['members'][number];

// ES PENDING VERONICA REVIEW
const copy = {
  en: {
    titleFor: (teamName: string) => `Reach out to ${teamName}`,
    hint: 'Pre-fill a WhatsApp message and open each member’s chat. Use {first_name} anywhere in the message to personalize it.',
    messageLabel: 'Message',
    placeholder: 'Hey {first_name}! Quick reminder about tomorrow’s session…',
    tokenHint: 'Use {first_name} for personalization.',
    previewLabel: (name: string) => `Preview (as ${name} sees it):`,
    rosterTitle: (n: number) => (n === 1 ? '1 recipient' : `${n} recipients`),
    skippedTitle: (n: number) => (n === 1 ? '1 skipped (no phone)' : `${n} skipped (no phone)`),
    openChat: 'Open chat',
    copyMessage: 'Copy message',
    copied: 'Copied',
    close: 'Done',
    emptyTitle: 'No members to message',
    emptyHint: 'Add members to this team before sending a check-in.',
    initialsFallback: '?',
  },
  es: {
    titleFor: (teamName: string) => `Contactar al equipo ${teamName}`,
    hint: 'Prepara un mensaje y abre el chat de WhatsApp de cada miembro. Usa {first_name} en cualquier parte del mensaje para personalizarlo.',
    messageLabel: 'Mensaje',
    placeholder: '¡Hola {first_name}! Un recordatorio rápido sobre la sesión de mañana…',
    tokenHint: 'Usa {first_name} para personalizar.',
    previewLabel: (name: string) => `Vista previa (como lo verá ${name}):`,
    rosterTitle: (n: number) => (n === 1 ? '1 destinatario' : `${n} destinatarios`),
    skippedTitle: (n: number) => (n === 1 ? '1 omitido (sin teléfono)' : `${n} omitidos (sin teléfono)`),
    openChat: 'Abrir chat',
    copyMessage: 'Copiar mensaje',
    copied: 'Copiado',
    close: 'Listo',
    emptyTitle: 'No hay miembros a quienes enviar',
    emptyHint: 'Agrega miembros al equipo antes de hacer un check-in.',
    initialsFallback: '?',
  },
} as const;

function initialsFromName(name: string, fallback: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return fallback;
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function firstNameOf(name: string): string {
  // First whitespace-delimited token, defensively falling back to the
  // raw name when there's only one piece — never return empty.
  const trimmed = name.trim();
  if (!trimmed) return '';
  return trimmed.split(/\s+/)[0] || trimmed;
}

function renderTemplate(template: string, firstName: string): string {
  // Single token for v1. We could grow this to {name}, {team}, etc.
  // but {first_name} covers 95% of check-in language and the
  // explicit token keeps coaches from accidentally producing a
  // hard-to-read mail-merge string.
  return template.replace(/\{first_name\}/g, firstName);
}

export default function ReachOutToTeamModal({ team, onClose }: { team: GymTeamWithMembers; onClose: () => void }) {
  const { language } = useLanguage();
  const s = copy[language];
  const [template, setTemplate] = useState<string>(s.placeholder);
  const [copyState, setCopyState] = useState<'idle' | 'copied'>('idle');

  // Split the roster up front: only members with a usable phone can
  // get a deep-link; the others are surfaced as "skipped" so coaches
  // know who they'll need to reach via another channel.
  const { reachable, skipped } = useMemo(() => {
    const reachable: TeamMember[] = [];
    const skipped: TeamMember[] = [];
    for (const m of team.members) {
      // buildWhatsAppUrl returns null for unusable phone numbers
      // (too short, missing digits, etc.) — defer to it as the
      // single source of truth on dialability.
      const probe = buildWhatsAppUrl(m.phone, { message: 'probe' });
      if (probe) reachable.push(m);
      else skipped.push(m);
    }
    return { reachable, skipped };
  }, [team.members]);

  // Preview uses the first reachable member's first name. Falls back
  // to a generic placeholder when the team has zero phone-having
  // members (in which case the preview row is mostly cosmetic — the
  // empty-state below replaces the action list).
  const previewSubject = reachable[0]?.name ?? '';
  const previewFirstName = previewSubject ? firstNameOf(previewSubject) : '';
  const renderedPreview = previewFirstName
    ? renderTemplate(template, previewFirstName)
    : renderTemplate(template, '___');

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(template);
      setCopyState('copied');
      trackEvent('tribe_os_team_outreach_copied', { team_id: team.id });
      // Revert the label after a beat so the user gets feedback but
      // the button is reusable.
      setTimeout(() => setCopyState('idle'), 1600);
    } catch {
      // Silent — clipboard write can fail in non-secure contexts.
      // The per-member deep-links still work either way.
    }
  }

  function handleOpenChat(member: TeamMember) {
    const url = buildWhatsAppUrl(member.phone, {
      message: renderTemplate(template, firstNameOf(member.name)),
    });
    if (!url) return;
    window.open(url, '_blank', 'noopener,noreferrer');
    trackEvent('tribe_os_team_outreach_opened', {
      team_id: team.id,
      member_id: member.id,
    });
  }

  return (
    <Dialog open={true} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md rounded-tribe p-5 bg-white border border-tribe-dark-40 text-tribe-dark">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="min-w-0">
            <DialogTitle className="text-base font-bold text-tribe-dark truncate">{s.titleFor(team.name)}</DialogTitle>
            <p className="text-xs text-tribe-dark-80 mt-1 leading-relaxed">{s.hint}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={s.close}
            className="p-1 -m-1 text-tribe-dark-80 hover:text-tribe-dark shrink-0"
          >
            <XIcon className="w-4 h-4" />
          </button>
        </div>

        {/* Message template */}
        <label className="block mb-2">
          <span className="block text-xs font-semibold text-tribe-dark mb-1">{s.messageLabel}</span>
          <textarea
            value={template}
            onChange={(e) => setTemplate(e.target.value)}
            maxLength={1000}
            rows={4}
            placeholder={s.placeholder}
            className="w-full px-3 py-2 bg-white border-2 border-tribe-dark-40 rounded-tribe text-sm focus:outline-none focus:border-tribe-green focus:ring-1 focus:ring-tribe-green-50 resize-none"
          />
          <span className="block text-[11px] text-tribe-dark-60 mt-1">{s.tokenHint}</span>
        </label>

        {/* Preview */}
        {previewSubject ? (
          <div className="mb-4 rounded-tribe bg-tribe-green-50/40 border border-tribe-green-50 p-3">
            <p className="text-[11px] uppercase tracking-[0.08em] font-semibold text-tribe-dark-60 mb-1">
              {s.previewLabel(previewFirstName)}
            </p>
            <p className="text-sm text-tribe-dark whitespace-pre-wrap leading-relaxed">{renderedPreview}</p>
          </div>
        ) : null}

        {/* Copy button — useful when WhatsApp deep-link won't open
            (corporate phones, etc.) so coaches can paste the message
            into whatever channel they end up using. */}
        <div className="mb-4">
          <Button variant="secondary" size="sm" onClick={handleCopy} type="button">
            {copyState === 'copied' ? (
              <>
                <Check className="w-4 h-4 mr-1" />
                {s.copied}
              </>
            ) : (
              <>
                <Copy className="w-4 h-4 mr-1" />
                {s.copyMessage}
              </>
            )}
          </Button>
        </div>

        {/* Roster — reachable first, skipped at the bottom */}
        {reachable.length === 0 && skipped.length === 0 ? (
          <div className="py-6 text-center">
            <p className="text-sm font-semibold text-tribe-dark mb-1">{s.emptyTitle}</p>
            <p className="text-xs text-tribe-dark-80">{s.emptyHint}</p>
          </div>
        ) : (
          <>
            {reachable.length > 0 ? (
              <div className="mb-3">
                <p className="text-[11px] uppercase tracking-[0.08em] font-semibold text-tribe-dark-60 mb-1.5">
                  {s.rosterTitle(reachable.length)}
                </p>
                <ul className="max-h-56 overflow-y-auto divide-y divide-tribe-dark-40 -mx-2">
                  {reachable.map((m) => (
                    <li key={m.id} className="flex items-center gap-3 px-2 py-2">
                      <Avatar initials={initialsFromName(m.name, s.initialsFallback)} size="sm" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-tribe-dark truncate">{m.name}</p>
                        {m.phone ? <p className="text-xs text-tribe-dark-80 truncate">{m.phone}</p> : null}
                      </div>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => handleOpenChat(m)}
                        disabled={template.trim().length === 0}
                        type="button"
                      >
                        <MessageCircle className="w-3.5 h-3.5 mr-1" />
                        {s.openChat}
                      </Button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {skipped.length > 0 ? (
              <div className="mb-1">
                <p className="text-[11px] uppercase tracking-[0.08em] font-semibold text-tribe-dark-60 mb-1.5 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" />
                  {s.skippedTitle(skipped.length)}
                </p>
                <ul className="space-y-1 -mx-1">
                  {skipped.map((m) => (
                    <li key={m.id} className="flex items-center gap-2 px-1 py-1 text-xs text-tribe-dark-80">
                      <Avatar initials={initialsFromName(m.name, s.initialsFallback)} size="sm" />
                      <span className="truncate">{m.name}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </>
        )}

        <div className="flex justify-end pt-4">
          <Button variant="secondary" onClick={onClose} type="button">
            {s.close}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
