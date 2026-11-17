import React, { createContext, useContext, useEffect, useState, useMemo } from 'react';
import type { Theme, ColorPalette } from '../types';

interface ThemeContextValue {
  theme: Theme;
  palette: ColorPalette;
  toggleTheme: () => void;
  setTheme: (t: Theme) => void;
  togglePalette: () => void;
  setPalette: (p: ColorPalette) => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setTheme] = useState<Theme>(() => {
    const saved = localStorage.getItem('ibm_v2_theme') as Theme | null;
    return saved === 'dark' || saved === 'light' ? saved : 'light';
  });

  const [palette, setPalette] = useState<ColorPalette>(() => {
    const saved = localStorage.getItem('ibm_v2_palette') as ColorPalette | null;
    return saved === 'blue' ? 'blue' : 'amber'; // Amber-Gold default
  });

  useEffect(() => {
    localStorage.setItem('ibm_v2_theme', theme);
    document.documentElement.setAttribute('data-theme', theme);
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  useEffect(() => {
    localStorage.setItem('ibm_v2_palette', palette);
    document.documentElement.setAttribute('data-palette', palette);
  }, [palette]);

  const toggleTheme = () => {
    setTheme(prev => (prev === 'light' ? 'dark' : 'light'));
  };

  const togglePalette = () => {
    setPalette(prev => (prev === 'amber' ? 'blue' : 'amber'));
  };

  const value = useMemo(
    () => ({ theme, palette, toggleTheme, setTheme, togglePalette, setPalette }),
    [theme, palette]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

export const useTheme = (): ThemeContextValue => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};
