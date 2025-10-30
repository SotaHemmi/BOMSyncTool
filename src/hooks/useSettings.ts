import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ProjectSettings } from '../types';
import {
  loadProjectSettings,
  saveProjectSettings as persistProjectSettings,
  loadThemeSettings,
  saveThemeSettings,
  removeThemeSettings,
  type ThemeColors
} from '../utils/storage';
import {
  DEFAULT_PROJECT_SETTINGS,
  sanitizeAutoInterval,
  sanitizeAutoCount
} from '../core/project-manager';

const DEFAULT_THEME: ThemeColors = {
  primary: '#3f8fc0',
  secondary: '#e6eef7',
  danger: '#d95d5d'
};

function applyThemeVariables(colors: ThemeColors) {
  if (typeof document === 'undefined') return;
  document.documentElement.style.setProperty('--color-primary', colors.primary);
  document.documentElement.style.setProperty('--color-secondary', colors.secondary);
  document.documentElement.style.setProperty('--color-danger', colors.danger);
}

const DEFAULT_PREPROCESS_TEMPLATE = DEFAULT_PROJECT_SETTINGS.defaultPreprocess ?? {
  expandReference: true,
  splitReferenceRows: false,
  fillBlankCells: true,
  cleanseTextData: true,
  applyFormatRules: false
};

function normalizeDefaultPreprocess(
  value?: ProjectSettings['defaultPreprocess']
): ProjectSettings['defaultPreprocess'] {
  return {
    expandReference: value?.expandReference ?? DEFAULT_PREPROCESS_TEMPLATE.expandReference,
    splitReferenceRows: value?.splitReferenceRows ?? DEFAULT_PREPROCESS_TEMPLATE.splitReferenceRows,
    fillBlankCells: value?.fillBlankCells ?? DEFAULT_PREPROCESS_TEMPLATE.fillBlankCells,
    cleanseTextData: value?.cleanseTextData ?? DEFAULT_PREPROCESS_TEMPLATE.cleanseTextData,
    applyFormatRules: value?.applyFormatRules ?? DEFAULT_PREPROCESS_TEMPLATE.applyFormatRules
  };
}

function mergeProjectSettings(stored: ProjectSettings | null): ProjectSettings {
  if (!stored) {
    return { ...DEFAULT_PROJECT_SETTINGS };
  }
  return {
    autoIntervalMinutes: sanitizeAutoInterval(stored.autoIntervalMinutes),
    autoMaxEntries: sanitizeAutoCount(stored.autoMaxEntries),
    defaultPreprocess: normalizeDefaultPreprocess(stored.defaultPreprocess)
  };
}

function mergeThemeColors(stored: ThemeColors | null | undefined): ThemeColors {
  if (!stored) {
    return { ...DEFAULT_THEME };
  }
  return {
    primary: stored.primary || DEFAULT_THEME.primary,
    secondary: stored.secondary || DEFAULT_THEME.secondary,
    danger: stored.danger || DEFAULT_THEME.danger
  };
}

export interface UseSettingsResult {
  settings: ProjectSettings;
  theme: ThemeColors;
  updateSettings: (partial: Partial<ProjectSettings>) => void;
  updateTheme: (partial: Partial<ThemeColors>) => void;
  resetTheme: () => void;
  applyTheme: () => void;
  setDefaultPreprocess: (updates: ProjectSettings['defaultPreprocess']) => void;
  reload: () => void;
}

export function useSettings(): UseSettingsResult {
  const [settings, setSettings] = useState<ProjectSettings>(() =>
    mergeProjectSettings(loadProjectSettings())
  );
  const [theme, setTheme] = useState<ThemeColors>(() =>
    mergeThemeColors(loadThemeSettings())
  );

  useEffect(() => {
    applyThemeVariables(theme);
  }, [theme]);

  const updateSettings = useCallback(
    (partial: Partial<ProjectSettings>) => {
      setSettings(prev => {
        const next: ProjectSettings = {
          autoIntervalMinutes: sanitizeAutoInterval(
            partial.autoIntervalMinutes ?? prev.autoIntervalMinutes
          ),
          autoMaxEntries: sanitizeAutoCount(
            partial.autoMaxEntries ?? prev.autoMaxEntries
          ),
          defaultPreprocess: normalizeDefaultPreprocess(
            partial.defaultPreprocess ?? prev.defaultPreprocess
          )
        };
        persistProjectSettings(next);
        return next;
      });
    },
    []
  );

  const updateTheme = useCallback((partial: Partial<ThemeColors>) => {
    setTheme(prev => {
      const next: ThemeColors = {
        primary: partial.primary ?? prev.primary,
        secondary: partial.secondary ?? prev.secondary,
        danger: partial.danger ?? prev.danger
      };
      saveThemeSettings(next);
      return next;
    });
  }, []);

  const resetTheme = useCallback(() => {
    removeThemeSettings();
    setTheme({ ...DEFAULT_THEME });
  }, []);

  const applyTheme = useCallback(() => {
    applyThemeVariables(theme);
  }, [theme]);

  const setDefaultPreprocess = useCallback(
    (updates: ProjectSettings['defaultPreprocess']) => {
      setSettings(prev => {
        const next: ProjectSettings = {
          ...prev,
          defaultPreprocess: normalizeDefaultPreprocess(updates)
        };
        persistProjectSettings(next);
        return next;
      });
    },
    []
  );

  const reload = useCallback(() => {
    setSettings(mergeProjectSettings(loadProjectSettings()));
    setTheme(mergeThemeColors(loadThemeSettings()));
  }, []);

  return useMemo(
    () => ({
      settings,
      theme,
      updateSettings,
      updateTheme,
      resetTheme,
      applyTheme,
      setDefaultPreprocess,
      reload
    }),
    [applyTheme, reload, resetTheme, setDefaultPreprocess, settings, theme, updateSettings, updateTheme]
  );
}
