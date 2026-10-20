import { notificationCopy } from '@/lib/notification-i18n';
import { recipientLanguage, type LanguagePreference } from '@/lib/i18n/recipientLanguage';
import { translateSport } from '@/lib/sportTranslationData';

/**
 * The session-chat push title, "<name> en <deporte>", in the RECIPIENT's
 * language (T-LANG1). The body is the sender's own words and is not ours to
 * translate. Used by app/api/webhook/chat-message.
 */
export function chatPushTitle(
  recipient: LanguagePreference | null | undefined,
  senderName: string | null,
  sport: string | null
): string {
  const lang = recipientLanguage(recipient);
  return notificationCopy('chat_message', lang, {
    name: senderName ?? (lang === 'en' ? 'Someone' : 'Alguien'),
    sport: sport ? translateSport(sport, lang) : lang === 'en' ? 'your session' : 'tu sesión',
    message: '',
  }).title;
}
