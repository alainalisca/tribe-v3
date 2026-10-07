/**
 * T-AV27b. The door's call after a confirm or a "joined": fire and forget.
 * The notification is a courtesy to the athlete; the door's own write has
 * already landed and must never wait on, or fail because of, this.
 *
 * keepalive (T-AV27c): a coach confirms and moves on. Without it, leaving the
 * page in the next instant cancels this request and the athlete is never
 * told; the end-to-end test lost exactly that "arrived" notification by
 * closing the page after "Asistencia confirmada". keepalive lets the browser
 * finish a small request after the page is gone.
 */
export function notifyAthlete(passCode: string, event: 'arrived' | 'joined'): void {
  void fetch('/api/atletas/notify/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ passCode, event }),
    keepalive: true,
  }).catch((error: unknown) => {
    // Deliberately console, not logError: a client-side courtesy call.
    console.error('[notifyAthlete] failed', error);
  });
}
