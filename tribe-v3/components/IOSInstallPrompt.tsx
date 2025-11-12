'use client';

import { useState, useEffect } from 'react';
import { X, Share, Plus, Home } from 'lucide-react';

export default function IOSInstallPrompt() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    // Detect if iOS Safari (not in standalone mode)
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    const isInStandaloneMode = ('standalone' in window.navigator) && (window.navigator.standalone);
    const hasPromptedBefore = localStorage.getItem('ios-install-prompted');

    if (isIOS && !isInStandaloneMode && !hasPromptedBefore) {
      setShow(true);
    }
  }, []);

  const handleDismiss = () => {
    setShow(false);
    localStorage.setItem('ios-install-prompted', 'true');
  };

  if (!show) return null;

  return (
    <div className="fixed inset-0 bg-black/80 z-[9999] flex items-end sm:items-center justify-center p-4">
      <div className="bg-white dark:bg-[#2C3137] rounded-2xl max-w-md w-full p-6 relative animate-slide-up">
        <button
          onClick={handleDismiss}
          className="absolute top-4 right-4 p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="text-center mb-6">
          <div className="w-20 h-20 bg-[#272D34] rounded-2xl flex items-center justify-center mx-auto mb-4">
            <span className="text-3xl font-bold text-white">Tribe<span className="text-tribe-green">.</span></span>
          </div>
          <h2 className="text-2xl font-bold mb-2">Install Tribe</h2>
          <p className="text-gray-600 dark:text-gray-400">
            Add Tribe to your home screen for the best experience!
          </p>
        </div>

        <div className="space-y-4 mb-6">
          <div className="flex items-start gap-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
            <div className="flex-shrink-0 w-8 h-8 bg-blue-500 text-white rounded-full flex items-center justify-center font-bold">
              1
            </div>
            <div className="flex-1">
              <p className="font-semibold mb-1">Tap the Share button</p>
              <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                <Share className="w-4 h-4" />
                <span>At the bottom of your screen</span>
              </div>
            </div>
          </div>

          <div className="flex items-start gap-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
            <div className="flex-shrink-0 w-8 h-8 bg-blue-500 text-white rounded-full flex items-center justify-center font-bold">
              2
            </div>
            <div className="flex-1">
              <p className="font-semibold mb-1">Tap "Add to Home Screen"</p>
              <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                <Plus className="w-4 h-4" />
                <span>Scroll down if needed</span>
              </div>
            </div>
          </div>

          <div className="flex items-start gap-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
            <div className="flex-shrink-0 w-8 h-8 bg-blue-500 text-white rounded-full flex items-center justify-center font-bold">
              3
            </div>
            <div className="flex-1">
              <p className="font-semibold mb-1">Tap "Add"</p>
              <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                <Home className="w-4 h-4" />
                <span>Tribe will appear on your home screen!</span>
              </div>
            </div>
          </div>
        </div>

        <button
          onClick={handleDismiss}
          className="w-full bg-tribe-green text-slate-900 font-bold py-3 rounded-lg hover:bg-[#b0d853] transition"
        >
          Got it!
        </button>
      </div>
    </div>
  );
}
