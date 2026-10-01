/**
 * T-AV27b. The door's call after a confirm or a "joined": fire and forget.
 * The notification is a courtesy to the athlete; the door's own write has
 * already landed and must never wait on, or fail because of, this.
 */
export function notifyAthlete(passCode: string, event: 'arrived' | 'joined'): void {
  void fetch('/api/atletas/notify/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ passCode, event }),
  }).catch((error: unknown) => {
    // Deliberately console, not logError: a client-side courtesy call.
    console.error('[notifyAthlete] failed', error);
  });
}
