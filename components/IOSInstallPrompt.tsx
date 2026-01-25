'use client';

import { useState, useEffect } from 'react';
import { Share, Plus, Home, MoreVertical, X } from 'lucide-react';

export default function IOSInstallPrompt() {
  const [show, setShow] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    try {
      const iOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
      const android = /Android/.test(navigator.userAgent);
      const isInStandaloneMode = ('standalone' in window.navigator) && (window.navigator.standalone);

      // Check if running in Capacitor native app
      const isNativePlatform = (window as any).Capacitor?.isNativePlatform?.() === true;

      // Check if already dismissed (session-based, not persistent)
      const sessionDismissed = sessionStorage.getItem('installPromptDismissed');
      const permanentDismiss = localStorage.getItem('installPromptPermanentDismiss');

      setIsIOS(iOS);

      // Only show if: mobile, not installed, not native app, and not dismissed
      if ((iOS || android) && !isInStandaloneMode && !isNativePlatform && !sessionDismissed && !permanentDismiss) {
        // Delay to avoid annoying immediate popup
        const timer = setTimeout(() => setShow(true), 5000);
        return () => clearTimeout(timer);
      }
    } catch (error) {
      console.error('Install prompt error:', error);
    }
  }, []);

  const handleDismiss = (permanent = false) => {
    setShow(false);
    try {
      sessionStorage.setItem('installPromptDismissed', 'true');
      if (permanent) {
        localStorage.setItem('installPromptPermanentDismiss', 'true');
      }
    } catch (error) {
      console.error('Storage error:', error);
    }
  };

  if (!show) return null;

  return (
    <div className="fixed inset-0 bg-black/90 z-[9999] flex items-end sm:items-center justify-center p-4">
      <div className="bg-white dark:bg-[#2C3137] rounded-2xl max-w-md w-full p-6 relative">
        <button
          onClick={() => handleDismiss(true)}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="text-center mb-6">
          <div className="w-20 h-20 bg-[#272D34] rounded-2xl flex items-center justify-center mx-auto mb-4">
            <span className="text-3xl font-bold text-white">Tribe<span className="text-tribe-green">.</span></span>
          </div>
          <h2 className="text-2xl font-bold mb-2 text-stone-900 dark:text-white">Install Tribe</h2>
          <p className="text-gray-600 dark:text-gray-400">
            Get the full app experience
          </p>
        </div>

        {isIOS ? (
          <div className="space-y-4 mb-6">
            <div className="flex items-start gap-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <div className="flex-shrink-0 w-8 h-8 bg-blue-500 text-white rounded-full flex items-center justify-center font-bold">
                1
              </div>
              <div className="flex-1">
                <p className="font-semibold mb-1 text-gray-900 dark:text-white">Tap Share</p>
                <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                  <Share className="w-4 h-4" />
                  <span>at the bottom of Safari</span>
                </div>
              </div>
            </div>

            <div className="flex items-start gap-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <div className="flex-shrink-0 w-8 h-8 bg-blue-500 text-white rounded-full flex items-center justify-center font-bold">
                2
              </div>
              <div className="flex-1">
                <p className="font-semibold mb-1 text-gray-900 dark:text-white">Add to Home Screen</p>
                <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                  <Plus className="w-4 h-4" />
                  <span>from the menu</span>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-4 mb-6">
            <div className="flex items-start gap-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <div className="flex-shrink-0 w-8 h-8 bg-green-500 text-white rounded-full flex items-center justify-center font-bold">
                1
              </div>
              <div className="flex-1">
                <p className="font-semibold mb-1 text-gray-900 dark:text-white">Tap menu</p>
                <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                  <MoreVertical className="w-4 h-4" />
                  <span>in your browser</span>
                </div>
              </div>
            </div>

            <div className="flex items-start gap-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <div className="flex-shrink-0 w-8 h-8 bg-green-500 text-white rounded-full flex items-center justify-center font-bold">
                2
              </div>
              <div className="flex-1">
                <p className="font-semibold mb-1 text-gray-900 dark:text-white">Install app</p>
                <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                  <Home className="w-4 h-4" />
                  <span>or "Add to Home screen"</span>
                </div>
              </div>
            </div>
          </div>
        )}

        <button
          onClick={() => handleDismiss(false)}
          className="w-full py-3 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 font-semibold rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
        >
          Maybe later
        </button>
      </div>
    </div>
  );
}
