/**
 * 設定管理
 *
 * アプリケーション設定とテーマ管理
 */

import { projectSettings, readProjectSettingsFromForm, applyProjectSettingsToForm } from './project-manager';
import { loadDictionaryIntoEditor, importDictionaryFromFile, exportDictionaryToFile, saveDictionaryFromEditor } from './dictionary-manager';
import { loadThemeSettings, saveThemeSettings, removeThemeSettings, setProcessing, logActivity } from '../utils';
import { saveProjectSettings as saveProjectSettingsToStorage } from '../utils/storage';

/**
 * テーマカラー入力要素を取得
 */
export function getThemeColorInputs(): {
  primary: HTMLInputElement | null;
  secondary: HTMLInputElement | null;
  danger: HTMLInputElement | null;
} {
  return {
    primary: document.getElementById('theme-primary') as HTMLInputElement | null,
    secondary: document.getElementById('theme-secondary') as HTMLInputElement | null,
    danger: document.getElementById('theme-danger') as HTMLInputElement | null
  };
}

/**
 * アプリケーション設定を保存
 */
export function saveAppSettings(): void {
  try {
    setProcessing(true, '設定を保存中...');

    // プロジェクト設定を読み取り
    const newSettings = readProjectSettingsFromForm();

    // テーマ設定を読み取り
    const inputs = getThemeColorInputs();
    const primary = inputs.primary?.value || '#007bff';
    const secondary = inputs.secondary?.value || '#6c757d';
    const danger = inputs.danger?.value || '#dc3545';

    // プロジェクト設定を保存
    saveProjectSettingsToStorage(newSettings);

    // テーマ設定を保存
    const themeSettings = { primary, secondary, danger };
    saveThemeSettings(themeSettings);

    // テーマを適用
    applyTheme(primary, secondary, danger);

    // フォームに反映
    applyProjectSettingsToForm(newSettings);

    logActivity('設定を保存しました。');
    alert('設定を保存しました。');
  } catch (error) {
    console.error('Save settings failed', error);
    alert(`設定の保存に失敗しました: ${error}`);
  } finally {
    setProcessing(false);
  }
}

/**
 * テーマをデフォルトにリセット
 */
export function resetTheme(): void {
  const defaultPrimary = '#007bff';
  const defaultSecondary = '#6c757d';
  const defaultDanger = '#dc3545';

  const inputs = getThemeColorInputs();
  if (inputs.primary) inputs.primary.value = defaultPrimary;
  if (inputs.secondary) inputs.secondary.value = defaultSecondary;
  if (inputs.danger) inputs.danger.value = defaultDanger;

  applyTheme(defaultPrimary, defaultSecondary, defaultDanger);

  // 保存済みテーマ設定を削除
  removeThemeSettings();
  localStorage.removeItem('theme_settings');

  logActivity('テーマをデフォルトにリセットしました。');
}

/**
 * テーマを適用
 *
 * @param primary - プライマリカラー
 * @param secondary - セカンダリカラー
 * @param danger - デンジャーカラー
 */
export function applyTheme(primary: string, secondary: string, danger: string): void {
  document.documentElement.style.setProperty('--color-primary', primary);
  document.documentElement.style.setProperty('--color-secondary', secondary);
  document.documentElement.style.setProperty('--color-danger', danger);
}

function migrateLegacyThemeSettings(): void {
  const legacy = localStorage.getItem('theme_settings');
  if (!legacy) return;

  try {
    const parsed = JSON.parse(legacy) as Partial<{ primary: string; secondary: string; danger: string }>;
    const colors = {
      primary: typeof parsed.primary === 'string' && parsed.primary ? parsed.primary : '#3f8fc0',
      secondary: typeof parsed.secondary === 'string' && parsed.secondary ? parsed.secondary : '#e6eef7',
      danger: typeof parsed.danger === 'string' && parsed.danger ? parsed.danger : '#d95d5d'
    };
    saveThemeSettings(colors);
  } catch (error) {
    console.error('Failed to migrate legacy theme settings', error);
  } finally {
    localStorage.removeItem('theme_settings');
  }
}

/**
 * テーマ設定を読み込んで適用
 */
export function loadAndApplyThemeSettings(): void {
  migrateLegacyThemeSettings();
  const theme = loadThemeSettings();
  if (theme) {
    applyTheme(theme.primary, theme.secondary, theme.danger);

    const inputs = getThemeColorInputs();
    if (inputs.primary) inputs.primary.value = theme.primary;
    if (inputs.secondary) inputs.secondary.value = theme.secondary;
    if (inputs.danger) inputs.danger.value = theme.danger;
  }
}

/**
 * 設定モーダルを開く
 */
export async function openSettings(): Promise<void> {
  const settingsModal = document.getElementById('settings-modal') as HTMLDialogElement | null;
  if (!settingsModal) return;

  applyProjectSettingsToForm(projectSettings);
  loadAndApplyThemeSettings();

  await loadDictionaryIntoEditor().catch(error => {
    console.error('Failed to load dictionary on settings open', error);
  });

  if (!settingsModal.open) {
    settingsModal.showModal();
  }
}

/**
 * 設定ボタンのイベントハンドラを登録
 */
export function registerSettingsButtons(): void {
  // 設定保存ボタン
  const saveBtn = document.getElementById('save-settings');
  saveBtn?.addEventListener('click', event => {
    event.preventDefault();
    saveAppSettings();
  });

  // テーマリセットボタン
  const resetBtn = document.getElementById('reset-theme-button') ?? document.getElementById('reset-theme');
  resetBtn?.addEventListener('click', () => {
    if (confirm('テーマをデフォルトに戻しますか？')) {
      resetTheme();
    }
  });

  // 設定モーダルを開くボタン
  const openSettingsBtn = document.getElementById('open-settings');
  openSettingsBtn?.addEventListener('click', () => {
    void openSettings();
  });

  // 辞書関連ボタン
  document.getElementById('load-dictionary')?.addEventListener('click', () => {
    void loadDictionaryIntoEditor();
  });
  document.getElementById('import-dictionary')?.addEventListener('click', () => {
    void importDictionaryFromFile();
  });
  document.getElementById('export-dictionary')?.addEventListener('click', () => {
    void exportDictionaryToFile();
  });
  document.getElementById('save-dictionary')?.addEventListener('click', () => {
    void saveDictionaryFromEditor();
  });
}
