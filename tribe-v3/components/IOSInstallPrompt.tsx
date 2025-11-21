'use client';

import { useState, useEffect } from 'react';
import { Share, Plus, Home, MoreVertical } from 'lucide-react';

export default function IOSInstallPrompt() {
  const [show, setShow] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    const iOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    const android = /Android/.test(navigator.userAgent);
    const isInStandaloneMode = ('standalone' in window.navigator) && (window.navigator.standalone);
    const hasSeenPrompt = localStorage.getItem('hasSeenInstallPrompt');
    const hasDismissed = localStorage.getItem('installPromptDismissed');

    setIsIOS(iOS);

    // Only show if:
    // 1. On iOS/Android
    // 2. NOT in standalone mode (not installed)
    // 3. Haven't dismissed it permanently
    if ((iOS || android) && !isInStandaloneMode && !hasDismissed) {
      // Only show once per session unless they've never seen it
      if (!hasSeenPrompt) {
        setShow(true);
        localStorage.setItem('hasSeenInstallPrompt', 'true');
      }
    }
  }, []);

  const handleDismiss = () => {
    setShow(false);
    localStorage.setItem('installPromptDismissed', 'true');
  };

  if (!show) return null;
          <p className="text-gray-600 dark:text-gray-400">
            For the best experience, please install Tribe
          </p>
        </div>

        {isIOS ? (
          <div className="space-y-4 mb-6">
            <div className="flex items-start gap-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <div className="flex-shrink-0 w-8 h-8 bg-blue-500 text-white rounded-full flex items-center justify-center font-bold">
                1
              </div>
              <div className="flex-1">
                <p className="font-semibold mb-1 text-gray-900 dark:text-white">Tap the Share button</p>
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
                <p className="font-semibold mb-1 text-gray-900 dark:text-white">Tap "Add to Home Screen"</p>
                <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                  <Plus className="w-4 h-4" />
                  <span>Scroll down if you don't see it</span>
                </div>
              </div>
            </div>

            <div className="flex items-start gap-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <div className="flex-shrink-0 w-8 h-8 bg-blue-500 text-white rounded-full flex items-center justify-center font-bold">
                3
              </div>
              <div className="flex-1">
                <p className="font-semibold mb-1 text-gray-900 dark:text-white">Tap "Add"</p>
                <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                  <Home className="w-4 h-4" />
                  <span>Tribe will appear on your home screen!</span>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-4 mb-6">
            <div className="flex items-start gap-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <div className="flex-shrink-0 w-8 h-8 bg-blue-500 text-white rounded-full flex items-center justify-center font-bold">
                1
              </div>
              <div className="flex-1">
                <p className="font-semibold mb-1 text-gray-900 dark:text-white">Tap the Menu button</p>
                <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                  <MoreVertical className="w-4 h-4" />
                  <span>Three dots in the top right corner</span>
                </div>
              </div>
            </div>

            <div className="flex items-start gap-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <div className="flex-shrink-0 w-8 h-8 bg-blue-500 text-white rounded-full flex items-center justify-center font-bold">
                2
              </div>
              <div className="flex-1">
                <p className="font-semibold mb-1 text-gray-900 dark:text-white">Tap "Add to Home screen" or "Install app"</p>
                <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                  <Plus className="w-4 h-4" />
                  <span>Look for these options in the menu</span>
                </div>
              </div>
            </div>

            <div className="flex items-start gap-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <div className="flex-shrink-0 w-8 h-8 bg-blue-500 text-white rounded-full flex items-center justify-center font-bold">
                3
              </div>
              <div className="flex-1">
                <p className="font-semibold mb-1 text-gray-900 dark:text-white">Tap "Install" or "Add"</p>
                <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                  <Home className="w-4 h-4" />
                  <span>Tribe will appear on your home screen!</span>
                </div>
              </div>
            </div>
          </div>
        )}

        <button
          onClick={handleDismiss}
          className="w-full mb-4 bg-tribe-green text-slate-900 font-bold py-3 rounded-lg hover:bg-[#b0d853] transition"
        >
          I've Installed It - Continue
        </button>

        <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3 text-sm text-yellow-800 dark:text-yellow-200 text-center">
          ⚠️ After installing, open Tribe from your home screen
        </div>
      </div>
    </div>
  );
}
