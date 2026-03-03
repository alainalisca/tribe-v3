/**
 * Client-side ICS calendar file generation.
 * Replaces the /api/generate-calendar route which doesn't work with static export.
 */

interface CalendarEvent {
  sport: string;
  date: string; // YYYY-MM-DD
  start_time: string; // HH:MM
  duration?: number; // minutes
  location: string;
  description?: string;
  creatorName?: string;
  sessionId: string;
}

function pad(n: number): string {
  return n.toString().padStart(2, '0');
}

function formatICSDate(date: Date): string {
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}T${pad(date.getHours())}${pad(date.getMinutes())}00`;
}

function escapeICS(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

export function downloadICS(event: CalendarEvent): void {
  const sessionDate = new Date(event.date + 'T00:00:00');
  const [hours, minutes] = event.start_time.split(':').map(Number);

  const start = new Date(sessionDate);
  start.setHours(hours, minutes, 0);

  const end = new Date(start);
  end.setMinutes(end.getMinutes() + (event.duration || 60));

  const siteUrl = typeof window !== 'undefined' ? window.location.origin : 'https://tribe-v3.vercel.app';
  const description = [
    event.description || '',
    '',
    `Hosted by: ${event.creatorName || 'Tribe Community'}`,
    '',
    'Never Train Alone!',
    '',
    `${siteUrl}/session/${event.sessionId}`,
  ].join('\\n');

  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Tribe//Session//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `DTSTART:${formatICSDate(start)}`,
    `DTEND:${formatICSDate(end)}`,
    `SUMMARY:${escapeICS(event.sport)} - Tribe`,
    `DESCRIPTION:${description}`,
    `LOCATION:${escapeICS(event.location)}`,
    `URL:${siteUrl}/session/${event.sessionId}`,
    'STATUS:CONFIRMED',
    `UID:tribe-${event.sessionId}@tribe-app`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');

  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `tribe-${event.sport.toLowerCase()}-${event.date}.ics`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
