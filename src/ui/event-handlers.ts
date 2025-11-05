/**
 * イベントハンドラー
 *
 * UI要素のイベントリスナーを登録・管理
 */

import { logger } from '../utils/logger';
import type { DatasetKey } from '../types';
import { open } from '@tauri-apps/plugin-dialog';
import { parseBomFile } from '../services';
import {
  datasetState,
  setDataset
} from '../state/app-state';
import { updateAllDatasetCards } from './dataset-view';
import { setProcessing, logActivity } from '../utils';

/**
 * ファイル選択ダイアログを開く
 *
 * @param dataset - データセットキー
 */
export async function openFileDialog(dataset: DatasetKey): Promise<void> {
  const filePath = await open({
    filters: [
      { name: 'BOM Files', extensions: ['csv', 'xlsx', 'xls', 'eco', 'ccf', 'msf'] }
    ],
    multiple: false
  });

  if (typeof filePath === 'string') {
    await loadBomFile(dataset, filePath);
  }
}

/**
 * BOMファイルを読み込み
 *
 * @param dataset - データセットキー
 * @param filePath - ファイルパス
 */
export async function loadBomFile(dataset: DatasetKey, filePath: string): Promise<void> {
  try {
    setProcessing(true, 'ファイルを読み込み中...');

    const parseResult = await parseBomFile(filePath);
    const fileName = filePath.split('/').pop() || filePath.split('\\').pop() || 'unknown';

    setDataset(dataset, parseResult, fileName, filePath);
    updateAllDatasetCards();
    updateActionAvailability();

    logActivity(`${dataset.toUpperCase()}: ${fileName} を読み込みました (${parseResult.rows.length}行)`);
  } catch (error) {
    logger.error('Failed to load BOM file', error);
    alert(`ファイルの読み込みに失敗しました: ${error}`);
  } finally {
    setProcessing(false);
  }
}


/**
 * ボタンの有効/無効を更新
 */
export function updateActionAvailability(): void {
  const aLoaded = Boolean(datasetState.a.parseResult);
  const bLoaded = Boolean(datasetState.b.parseResult);

  const compareButton = document.getElementById('run-compare') as HTMLButtonElement | null;
  const replaceButton = document.getElementById('run-replace') as HTMLButtonElement | null;
  const saveButton = document.getElementById('manual-session-save-inline') as HTMLButtonElement | null;

  if (compareButton) {
    compareButton.disabled = !(aLoaded && bLoaded);
  }
  if (replaceButton) {
    replaceButton.disabled = !(aLoaded && bLoaded);
  }
  if (saveButton) {
    saveButton.disabled = !(aLoaded || bLoaded);
  }
}

