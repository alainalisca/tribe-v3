'use client';

/**
 * Global error boundary — fires when the root layout itself crashes or
 * when app/error.tsx throws. Renders its own <html>/<body> because the
 * layout tree is broken at this point.
 *
 * LR-01 (PostHog, revised): forwards the error to PostHog via posthog-js
 * since React render errors bypass the `capture_exceptions: true`
 * window.onerror hook. Wrapped in useEffect + try/catch so a fault in
 * captureException can't re-enter the error boundary.
 */

import { useEffect } from 'react';
import { logError } from '@/lib/logger';
import { getPostHog } from '@/lib/posthog';

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    logError(error, { action: 'error_boundary', route: 'app/global-error', digest: error.digest });
    try {
      const ph = getPostHog();
      ph?.captureException(error, {
        error_digest: error.digest,
        source: 'react_global_error_boundary',
        route: 'app/global-error',
      });
    } catch {
      // Never throw from an error boundary.
    }
  }, [error]);

  return (
    <html>
      <body>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '100vh',
            padding: '1rem',
            backgroundColor: '#f5f5f4',
          }}
        >
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>😵</div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 'bold', marginBottom: '0.25rem' }}>Something went wrong</h2>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 'bold', marginBottom: '0.5rem', color: '#78716c' }}>
              Algo salio mal
            </h2>
            <p style={{ color: '#78716c', marginBottom: '1.5rem', fontSize: '0.875rem', lineHeight: '1.5' }}>
              Don&apos;t worry, your data is safe.
              <br />
              No te preocupes, tus datos estan a salvo.
            </p>
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
              <button
                onClick={reset}
                style={{
                  padding: '0.75rem 1.5rem',
                  background: '#9EE551',
                  borderRadius: '0.75rem',
                  border: 'none',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Try Again / Intentar de Nuevo
              </button>
              {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- error boundary renders outside router context */}
              <a
                href="/"
                style={{
                  padding: '0.75rem 1.5rem',
                  background: '#e7e5e4',
                  borderRadius: '0.75rem',
                  border: 'none',
                  fontWeight: 600,
                  cursor: 'pointer',
                  textDecoration: 'none',
                  color: '#1c1917',
                  display: 'inline-flex',
                  alignItems: 'center',
                }}
              >
                Go Home / Ir al inicio
              </a>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}
