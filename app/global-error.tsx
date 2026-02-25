'use client';

import { logError } from '@/lib/logger';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  logError(error, { action: 'error_boundary', route: 'app/global-error' });

  return (
    <html>
      <body>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', padding: '1rem', backgroundColor: '#f5f5f4' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>😵</div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 'bold', marginBottom: '0.5rem' }}>Something went wrong</h2>
            <p style={{ color: '#78716c', marginBottom: '1.5rem' }}>Don&apos;t worry, your data is safe.</p>
            <button
              onClick={reset}
              style={{ padding: '0.75rem 1.5rem', background: '#9EE551', borderRadius: '0.75rem', border: 'none', fontWeight: 600, cursor: 'pointer' }}
            >
              Try Again
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
