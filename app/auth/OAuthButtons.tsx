'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import type { AuthTranslations } from './translations';

interface OAuthButtonsProps {
  t: AuthTranslations;
  appleLoading: boolean;
  googleLoading: boolean;
  loading: boolean;
  onAppleSignIn: () => void;
  onGoogleSignIn: () => void;
}

export default function OAuthButtons({
  t,
  appleLoading,
  googleLoading,
  loading,
  onAppleSignIn,
  onGoogleSignIn,
}: OAuthButtonsProps) {
  const [showApple, setShowApple] = useState(true);
  useEffect(() => {
    import('@capacitor/core')
      .then(({ Capacitor }) => {
        if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android') {
          setShowApple(false);
        }
      })
      .catch(() => {});
  }, []);

  return (
    <>
      {showApple && (
        <Button
          onClick={onAppleSignIn}
          disabled={appleLoading || googleLoading || loading}
          className="w-full py-3 bg-black text-white hover:bg-stone-900 font-semibold"
        >
          <svg className="w-5 h-5" viewBox="0 0 17 20" fill="currentColor">
            <path d="M13.545 10.239c-.022-2.234 1.823-3.306 1.906-3.358-.037-.054-1.494-1.31-1.494-1.31-.997-1.27-2.551-1.443-3.104-1.463-.059-.006-.117-.009-.175-.009-1.17 0-2.285.694-2.882.694-.628 0-1.594-.676-2.619-.658C3.767 4.16 2.485 4.905 1.77 6.104.303 8.544 1.398 12.134 2.807 14.11c.685.966 1.502 2.05 2.576 2.012 1.033-.041 1.423-.669 2.672-.669 1.217 0 1.577.669 2.654.648 1.112-.019 1.812-.984 2.489-1.955.551-.789.952-1.604 1.163-2.052-.025-.011-2.818-1.082-2.816-4.29v-.565zM11.028 2.869C11.612 2.163 12.008 1.19 11.898.2c-.836.034-1.85.558-2.45 1.262-.538.624-.959 1.62-.839 2.576.933.073 1.884-.474 2.419-1.169z" />
          </svg>
          {appleLoading ? t.loading : t.continueWithApple}
        </Button>
      )}

      <Button
        variant="outline"
        onClick={onGoogleSignIn}
        disabled={googleLoading || appleLoading || loading}
        className="w-full py-3 bg-white dark:bg-stone-100 text-stone-700 font-semibold border-stone-300 hover:bg-stone-50 dark:hover:bg-stone-200 mt-3"
      >
        <svg className="w-5 h-5" viewBox="0 0 24 24">
          <path
            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
            fill="#4285F4"
          />
          <path
            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            fill="#34A853"
          />
          <path
            d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18A10.96 10.96 0 0 0 1 12c0 1.77.42 3.45 1.18 4.93l3.66-2.84z"
            fill="#FBBC05"
          />
          <path
            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
            fill="#EA4335"
          />
        </svg>
        {googleLoading ? t.loading : t.continueWithGoogle}
      </Button>

      <div className="flex items-center gap-4 my-3">
        <div className="flex-1 h-px bg-stone-300 dark:bg-stone-500"></div>
        <span className="text-xs text-muted-foreground">{t.or}</span>
        <div className="flex-1 h-px bg-stone-300 dark:bg-stone-500"></div>
      </div>
    </>
  );
}
