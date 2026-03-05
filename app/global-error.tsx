'use client';

import { logError } from '@/lib/logger';

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  logError(error, { action: 'error_boundary', route: 'app/global-error' });

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
