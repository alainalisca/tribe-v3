/**
 * Client-side ICS calendar file generation.
 * Supports both raw ICS generation and the `ics` library, plus Google Calendar URLs.
 */

import { createEvent, EventAttributes } from 'ics';

// ── Legacy interface (used by ActionButtons) ──

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

// ── New: ics-library-based download + Google Calendar URL ──

export interface CalendarEventData {
  title: string;
  description: string;
  startDate: Date;
  durationMinutes: number;
  location?: string;
  url?: string;
}

export function downloadCalendarEvent(data: CalendarEventData): void {
  const start = data.startDate;

  const event: EventAttributes = {
    start: [start.getFullYear(), start.getMonth() + 1, start.getDate(), start.getHours(), start.getMinutes()],
    duration: {
      hours: Math.floor(data.durationMinutes / 60),
      minutes: data.durationMinutes % 60,
    },
    title: data.title,
    description: data.description,
    location: data.location,
    url: data.url,
    organizer: { name: 'Tribe', email: 'sessions@tribesocial.co' },
    status: 'CONFIRMED' as const,
    busyStatus: 'BUSY' as const,
    productId: 'tribe/sessions',
  };

  createEvent(event, (error, value) => {
    if (error || !value) return;
    const blob = new Blob([value], { type: 'text/calendar;charset=utf-8' });
    const blobUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = 'tribe-session.ics';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(blobUrl);
  });
}

export function getGoogleCalendarUrl(data: CalendarEventData): string {
  const start = data.startDate;
  const end = new Date(start.getTime() + data.durationMinutes * 60000);

  const formatDate = (d: Date) =>
    d
      .toISOString()
      .replace(/[-:]/g, '')
      .replace(/\.\d{3}/, '');

  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: data.title,
    dates: `${formatDate(start)}/${formatDate(end)}`,
    details: data.description,
    location: data.location || '',
    sf: 'true',
  });

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}
