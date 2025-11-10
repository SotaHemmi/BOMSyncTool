/**
 * 列設定UI
 *
 * BOMデータの列設定とデフォルト前処理の適用
 */

import type { DatasetKey, ProjectSettings } from '../types';
import { datasetState } from '../state/app-state';
import { setProcessing, logActivity, datasetLabel } from '../utils';
import { updatePreviewCard } from './dataset-view';
import { applyPreprocessing } from '../core/preprocessing';
import { loadProjectSettings } from '../utils/storage';

/**
 * デフォルトプロジェクト設定
 */
export const DEFAULT_PROJECT_SETTINGS: ProjectSettings = {
  autoIntervalMinutes: 15,
  autoMaxEntries: 10,
  defaultPreprocess: {
    expandReference: true,
    splitReferenceRows: false,
    fillBlankCells: true,
    cleanseTextData: true,
    applyFormatRules: false
  }
};

/**
 * デフォルト前処理設定を正規化
 *
 * @param value - プロジェクト設定の前処理設定
 * @returns 正規化された前処理設定
 */
export function normalizeDefaultPreprocessSettings(
  value?: ProjectSettings['defaultPreprocess']
): Required<NonNullable<ProjectSettings['defaultPreprocess']>> {
  const defaults = DEFAULT_PROJECT_SETTINGS.defaultPreprocess!;
  return {
    expandReference: value?.expandReference ?? defaults.expandReference,
    splitReferenceRows: value?.splitReferenceRows ?? defaults.splitReferenceRows,
    fillBlankCells: value?.fillBlankCells ?? defaults.fillBlankCells,
    cleanseTextData: value?.cleanseTextData ?? defaults.cleanseTextData,
    applyFormatRules: value?.applyFormatRules ?? defaults.applyFormatRules
  };
}

/**
 * デフォルト前処理をデータセットに適用
 *
 * @param dataset - データセットキー
 */
async function applyDefaultPreprocess(dataset: DatasetKey): Promise<void> {
  const state = datasetState[dataset];
  if (!state.parseResult) return;

  try {
    setProcessing(true, 'デフォルト前処理を適用中...');

    // 設定からデフォルト前処理の内容を取得
    const projectSettings = loadProjectSettings();
    const preprocess = normalizeDefaultPreprocessSettings(projectSettings?.defaultPreprocess);

    // 前処理オプションを構築
    const options = {
      expandRef: preprocess.expandReference,
      splitRef: preprocess.splitReferenceRows,
      fillBlank: preprocess.fillBlankCells,
      cleanse: preprocess.cleanseTextData,
      formatRules: preprocess.applyFormatRules,
      formatOptions: {
        use_strikethrough: false,
        use_cell_color: true
      }
    };

    // 前処理を適用
    const processed = await applyPreprocessing(state.parseResult, options);

    // 状態を更新
    state.parseResult = processed;

    // UIを更新（React hooks が自動的に再レンダリング）
    updatePreviewCard(dataset);

    logActivity(`${datasetLabel(dataset)}にデフォルト前処理を適用しました。`);
  } catch (error: unknown) {
    alert(`前処理の適用に失敗しました: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    setProcessing(false);
  }
}

/**
 * 列設定ボタンを登録
 */
export function registerColumnSettingsButtons(): void {
  const buttons = document.querySelectorAll<HTMLButtonElement>('.column-default-preprocess');
  buttons.forEach(button => {
    const dataset = button.getAttribute('data-default-preprocess') as DatasetKey;
    if (!dataset) return;

    button.addEventListener('click', () => {
      void applyDefaultPreprocess(dataset);
    });
  });
}
