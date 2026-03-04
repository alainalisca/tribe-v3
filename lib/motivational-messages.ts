export type MessageCategory = 'morning_motivation' | 'session_nearby' | 'weekly_recap' | 're_engagement';

export interface BilingualMessage {
  en: { title: string; body: string };
  es: { title: string; body: string };
}

export interface MessageBank {
  morning_motivation: BilingualMessage[];
  session_nearby: BilingualMessage[];
  weekly_recap: BilingualMessage[];
  re_engagement: BilingualMessage[];
}

// Import message data from dedicated data file
import {
  morningMotivationMessages,
  sessionNearbyMessages,
  weeklyRecapMessages,
  reEngagementMessages,
} from './motivationalMessageData';

export const messageBank: MessageBank = {
  morning_motivation: morningMotivationMessages,
  session_nearby: sessionNearbyMessages,
  weekly_recap: weeklyRecapMessages,
  re_engagement: reEngagementMessages,
};

// Legacy export for backwards compatibility with existing code
export const motivationalMessages = messageBank.morning_motivation;

/**
 * Get a random message from a specific category
 * @param category - The category of messages to select from
 * @param usedMessageIds - Optional array of message indices already sent to avoid repeats
 * @returns The selected message and its index
 */
export function getRandomMessage(
  category: MessageCategory = 'morning_motivation',
  usedMessageIds: number[] = []
): { message: BilingualMessage; index: number } {
  const messages = messageBank[category];

  // Filter out already used messages
  const availableIndices = messages.map((_, i) => i).filter((i) => !usedMessageIds.includes(i));

  // If all messages have been used, reset and pick from all
  const indicesToChooseFrom = availableIndices.length > 0 ? availableIndices : messages.map((_, i) => i);

  const randomIndex = indicesToChooseFrom[Math.floor(Math.random() * indicesToChooseFrom.length)];

  return {
    message: messages[randomIndex],
    index: randomIndex,
  };
}

/**
 * Get message content in the specified language
 * @param message - The bilingual message
 * @param language - The preferred language ('en' or 'es')
 * @returns The message content in the specified language
 */
export function getMessageContent(
  message: BilingualMessage,
  language: 'en' | 'es' = 'en'
): { title: string; body: string } {
  return message[language] || message.en;
}

/**
 * Replace template variables in message content
 * @param content - The message content with placeholders
 * @param variables - Object containing variable values
 * @returns The message with replaced variables
 */
export function replaceMessageVariables(
  content: { title: string; body: string },
  variables: Record<string, string | number>
): { title: string; body: string } {
  let { title, body } = content;

  for (const [key, value] of Object.entries(variables)) {
    const placeholder = `{{${key}}}`;
    title = title.replace(new RegExp(placeholder, 'g'), String(value));
    body = body.replace(new RegExp(placeholder, 'g'), String(value));
  }

  return { title, body };
}

/**
 * Get all categories available in the message bank
 */
export function getCategories(): MessageCategory[] {
  return Object.keys(messageBank) as MessageCategory[];
}

/**
 * Get the count of messages in a specific category
 */
export function getCategoryMessageCount(category: MessageCategory): number {
  return messageBank[category].length;
}
