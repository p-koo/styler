'use client';

import { useEffect, useLayoutEffect } from 'react';

const THEME_STORAGE_KEY = 'styler-theme';

// Use useLayoutEffect to apply theme before paint (avoids flash)
const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

export default function ThemeInitializer() {
  useIsomorphicLayoutEffect(() => {
    const applyTheme = () => {
      try {
        const theme = localStorage.getItem(THEME_STORAGE_KEY);
        const root = document.documentElement;
        root.classList.remove('light', 'dark');
        if (theme === 'dark') {
          root.classList.add('dark');
        } else if (theme === 'light') {
          root.classList.add('light');
        }
      } catch (e) {
        console.error('Failed to apply theme:', e);
      }
    };

    // Apply theme immediately
    applyTheme();

    // Listen for storage changes (for cross-tab sync)
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === THEME_STORAGE_KEY) {
        applyTheme();
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  return null;
}
