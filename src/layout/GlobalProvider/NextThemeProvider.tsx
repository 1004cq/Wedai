'use client';

import { ThemeProvider as NextThemesProvider } from 'next-themes';
import { type ReactNode, useEffect } from 'react';

import { installFormAutocompleteDefaults } from '@/utils/client/installFormAutocompleteDefaults';

import BrandSplash from '@/components/BrandSplash';

interface NextThemeProviderProps {
  children: ReactNode;
  forcedTheme?: 'dark' | 'light';
}

export default function NextThemeProvider({ children, forcedTheme }: NextThemeProviderProps) {
  useEffect(installFormAutocompleteDefaults, []);

  return (
    <NextThemesProvider
      disableTransitionOnChange
      enableSystem
      attribute="data-theme"
      defaultTheme="system"
      forcedTheme={forcedTheme}
    >
      <BrandSplash />
      {children}
    </NextThemesProvider>
  );
}
