'use client';

import { useEffect } from 'react';

export default function BackButtonHandler() {
  useEffect(() => {
    import('@/lib/backButton').then(({ initBackButtonHandler }) => {
      initBackButtonHandler();
    });
  }, []);

  return null;
}
