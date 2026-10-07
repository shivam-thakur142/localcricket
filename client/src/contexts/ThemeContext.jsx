// ====================================================================
// THEME CONTEXT: DEFAULT, OUTDOOR SUNLIGHT & OLED BATTERY SAVER
// ====================================================================

import React, { createContext, useContext, useState, useEffect } from 'react';
import { offlineStorage } from '../services/offlineStorage.js';
import { THEMES } from '../constants/themes.js';

export { THEMES };

const ThemeContext = createContext({
  theme: THEMES.DEFAULT,
  setTheme: () => {},
  isSunlight: false,
  isBatterySaver: false,
});

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(() => {
    if (typeof localStorage !== 'undefined') {
      const saved = localStorage.getItem('localcricket_theme');
      if (saved && Object.values(THEMES).includes(saved)) {
        return saved;
      }
    }
    return THEMES.DEFAULT;
  });

  useEffect(() => {
    // Load from offlineStorage asynchronously
    offlineStorage.getSetting('theme', theme).then((storedTheme) => {
      if (storedTheme && storedTheme !== theme && Object.values(THEMES).includes(storedTheme)) {
        setThemeState(storedTheme);
      }
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('data-theme', theme);
      if (theme === THEMES.SUNLIGHT) {
        document.documentElement.classList.add('theme-sunlight');
        document.documentElement.classList.remove('theme-battery-saver');
      } else if (theme === THEMES.BATTERY_SAVER) {
        document.documentElement.classList.add('theme-battery-saver');
        document.documentElement.classList.remove('theme-sunlight');
      } else {
        document.documentElement.classList.remove('theme-sunlight', 'theme-battery-saver');
      }
    }

    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('localcricket_theme', theme);
    }
    offlineStorage.setSetting('theme', theme).catch(() => {});
  }, [theme]);

  const setTheme = (newTheme) => {
    if (Object.values(THEMES).includes(newTheme)) {
      setThemeState(newTheme);
    }
  };

  return (
    <ThemeContext.Provider
      value={{
        theme,
        setTheme,
        isSunlight: theme === THEMES.SUNLIGHT,
        isBatterySaver: theme === THEMES.BATTERY_SAVER,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
