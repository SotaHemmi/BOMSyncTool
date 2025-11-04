/**
 * localStorage操作関連のユーティリティ関数
 */

import type {
  ProjectRecord,
  ProjectSettings,
  RegistrationEntry,
  ExceptionEntry,
  PreprocessBlock
} from '../types';

// Storage keys
const PROJECT_STORAGE_KEY = 'bomsync_projects';
const ACTIVE_PROJECT_KEY = 'bomsync_active_project';
const FAVORITE_PROJECTS_KEY = 'bomsync_favorite_projects';
export const FAVORITE_PROJECTS_ARCHIVE_KEY = 'bomsync_favorite_archive';
const OPEN_TABS_KEY = 'bomsync_open_tabs';
const PROJECT_SETTINGS_KEY = 'bomsync_project_settings';
const DICTIONARY_REGISTRATIONS_KEY = 'dictionary_registrations';
const DICTIONARY_EXCEPTIONS_KEY = 'dictionary_exceptions';
const PREPROCESS_BLOCKS_KEY = 'preprocess_blocks';
const THEME_PRIMARY_KEY = 'theme-primary';
const THEME_SECONDARY_KEY = 'theme-secondary';
const THEME_DANGER_KEY = 'theme-danger';

/**
 * プロジェクト関連
 */
export function getStoredProjects(): ProjectRecord[] {
  const stored = localStorage.getItem(PROJECT_STORAGE_KEY);
  if (!stored) return [];
  try {
    return JSON.parse(stored) as ProjectRecord[];
  } catch {
    return [];
  }
}

export function saveStoredProjects(projects: ProjectRecord[]): boolean {
  try {
    localStorage.setItem(PROJECT_STORAGE_KEY, JSON.stringify(projects));
    return true;
  } catch (error) {
    console.error('Failed to persist projects to localStorage', error);
    alert('プロジェクトの保存に失敗しました。不要なプロジェクトを削除して空き領域を確保してください。');
    return false;
  }
}

export function loadActiveProjectId(): string | null {
  const stored = localStorage.getItem(ACTIVE_PROJECT_KEY);
  return stored ?? null;
}

export function saveActiveProjectId(projectId: string | null) {
  if (projectId) {
    localStorage.setItem(ACTIVE_PROJECT_KEY, projectId);
  } else {
    localStorage.removeItem(ACTIVE_PROJECT_KEY);
  }
}

export function removeActiveProjectId() {
  localStorage.removeItem(ACTIVE_PROJECT_KEY);
}

export function getFavoriteProjects(): Set<string> {
  const stored = localStorage.getItem(FAVORITE_PROJECTS_KEY);
  if (!stored) return new Set();
  try {
    return new Set(JSON.parse(stored) as string[]);
  } catch {
    return new Set();
  }
}

export function saveFavoriteProjects(favorites: Set<string>) {
  localStorage.setItem(FAVORITE_PROJECTS_KEY, JSON.stringify(Array.from(favorites)));
}

export type FavoriteProjectArchive = Record<string, ProjectRecord>;

export function loadFavoriteProjectArchive(): FavoriteProjectArchive {
  const stored = localStorage.getItem(FAVORITE_PROJECTS_ARCHIVE_KEY);
  if (!stored) return {};
  try {
    return JSON.parse(stored) as FavoriteProjectArchive;
  } catch (error) {
    console.error('Failed to parse favorite project archive', error);
    return {};
  }
}

export function saveFavoriteProjectArchive(archive: FavoriteProjectArchive): boolean {
  try {
    localStorage.setItem(FAVORITE_PROJECTS_ARCHIVE_KEY, JSON.stringify(archive));
    return true;
  } catch (error) {
    console.error('Failed to persist favorite archive to localStorage', error);
    alert('お気に入りの保存に失敗しました。不要なプロジェクトを削除して空き領域を確保してください。');
    return false;
  }
}

export function getFavoriteProjectSnapshot(projectId: string): ProjectRecord | null {
  const archive = loadFavoriteProjectArchive();
  return archive[projectId] ?? null;
}

export function getOpenTabs(): string[] {
  const stored = localStorage.getItem(OPEN_TABS_KEY);
  if (!stored) return [];
  try {
    return JSON.parse(stored) as string[];
  } catch {
    return [];
  }
}

export function saveOpenTabs(tabIds: string[]) {
  localStorage.setItem(OPEN_TABS_KEY, JSON.stringify(tabIds));
}

/**
 * プロジェクト設定関連
 */
export function loadProjectSettings(): ProjectSettings | null {
  const stored = localStorage.getItem(PROJECT_SETTINGS_KEY);
  if (!stored) return null;
  try {
    return JSON.parse(stored) as ProjectSettings;
  } catch {
    return null;
  }
}

export function saveProjectSettings(settings: ProjectSettings) {
  localStorage.setItem(PROJECT_SETTINGS_KEY, JSON.stringify(settings));
}

/**
 * 辞書データ関連
 */
export function loadRegistrationData(): RegistrationEntry[] {
  try {
    const stored = localStorage.getItem(DICTIONARY_REGISTRATIONS_KEY);
    if (stored) {
      const data = JSON.parse(stored) as Array<{ part_no: string; registration_name: string }>;
      return data.map(item => ({
        partNo: item.part_no,
        registrationName: item.registration_name
      }));
    }
  } catch (error) {
    console.error('Failed to load registration data', error);
  }
  return [];
}

export function saveRegistrationData(registrations: RegistrationEntry[]) {
  const data = registrations.map(entry => ({
    part_no: entry.partNo,
    registration_name: entry.registrationName
  }));
  localStorage.setItem(DICTIONARY_REGISTRATIONS_KEY, JSON.stringify(data));
}

export function loadExceptionData(): ExceptionEntry[] {
  try {
    const stored = localStorage.getItem(DICTIONARY_EXCEPTIONS_KEY);
    if (stored) {
      const data = JSON.parse(stored) as Array<{ ref: string; part_no: string; registration_name: string }>;
      return data.map(item => ({
        ref: item.ref,
        partNo: item.part_no,
        registrationName: item.registration_name
      }));
    }
  } catch (error) {
    console.error('Failed to load exception data', error);
  }
  return [];
}

export function saveExceptionData(exceptions: ExceptionEntry[]) {
  const data = exceptions.map(entry => ({
    ref: entry.ref,
    part_no: entry.partNo,
    registration_name: entry.registrationName
  }));
  localStorage.setItem(DICTIONARY_EXCEPTIONS_KEY, JSON.stringify(data));
}

/**
 * 前処理ブロック関連
 */
export function loadPreprocessBlocks(): PreprocessBlock[] {
  const stored = localStorage.getItem(PREPROCESS_BLOCKS_KEY);
  if (!stored) return [];
  try {
    return JSON.parse(stored) as PreprocessBlock[];
  } catch {
    return [];
  }
}

export function savePreprocessBlocks(blocks: PreprocessBlock[]) {
  localStorage.setItem(PREPROCESS_BLOCKS_KEY, JSON.stringify(blocks));
}

/**
 * テーマ設定関連
 */
export interface ThemeColors {
  primary: string;
  secondary: string;
  danger: string;
}

export function loadThemeSettings(): ThemeColors {
  return {
    primary: localStorage.getItem(THEME_PRIMARY_KEY) || '#3f8fc0',
    secondary: localStorage.getItem(THEME_SECONDARY_KEY) || '#e6eef7',
    danger: localStorage.getItem(THEME_DANGER_KEY) || '#d95d5d'
  };
}

export function saveThemeSettings(colors: ThemeColors) {
  localStorage.setItem(THEME_PRIMARY_KEY, colors.primary);
  localStorage.setItem(THEME_SECONDARY_KEY, colors.secondary);
  localStorage.setItem(THEME_DANGER_KEY, colors.danger);
}

export function removeThemeSettings() {
  localStorage.removeItem(THEME_PRIMARY_KEY);
  localStorage.removeItem(THEME_SECONDARY_KEY);
  localStorage.removeItem(THEME_DANGER_KEY);
}
