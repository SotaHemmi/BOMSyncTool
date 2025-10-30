/**
 * イベントハンドラー
 *
 * UI要素のイベントリスナーを登録・管理
 */

import type { DatasetKey } from '../types';
import { open } from '@tauri-apps/plugin-dialog';
import { parseBomFile } from '../services';
import { compareBoms, updateAndAppendBoms } from '../services';
import {
  datasetState,
  setDataset,
  setCurrentDiffs,
  setMergedBom,
  areBothDatasetsLoaded,
  currentDiffs,
  mergedBom
} from '../state/app-state';
import { updateAllDatasetCards } from './dataset-view';
import { renderDiffTable, updateResultsSummary } from './diff-view';
import { openEditModal } from './edit-modal';
import { populateColumnSettings } from './column-editor';
import { openDictionaryModal } from './dictionary-modal';
import { exportToCSV, exportToECO, exportToCCF, exportToMSF, type ExportSource } from '../core/export-handler';
import { saveProject } from '../core/project-manager';
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
    populateColumnSettings(dataset);
    updateAllDatasetCards();
    updateActionAvailability();

    logActivity(`${dataset.toUpperCase()}: ${fileName} を読み込みました (${parseResult.rows.length}行)`);
  } catch (error) {
    console.error('Failed to load BOM file', error);
    alert(`ファイルの読み込みに失敗しました: ${error}`);
  } finally {
    setProcessing(false);
  }
}

/**
 * BOM比較を実行
 */
export async function runComparison(): Promise<void> {
  if (!areBothDatasetsLoaded()) {
    alert('BOM A と BOM B の両方を読み込んでください。');
    return;
  }

  const parseA = datasetState.a.parseResult!;
  const parseB = datasetState.b.parseResult!;

  try {
    setProcessing(true, '比較中...');

    const diffs = await compareBoms(parseA, parseB);
    setCurrentDiffs(diffs);

    const added = diffs.filter(d => d.status === '追加').length;
    const removed = diffs.filter(d => d.status === '削除').length;
    const changed = diffs.filter(d => d.status === '変更').length;
    const total = added + removed + changed;

    updateResultsSummary(`差分: ${total}件（追加 ${added}、削除 ${removed}、変更 ${changed}）`);
    renderDiffTable(diffs);

    logActivity(`比較完了: 差分 ${total}件`);
  } catch (error) {
    console.error('Comparison failed', error);
    alert(`比較に失敗しました: ${error}`);
  } finally {
    setProcessing(false);
  }
}

/**
 * BOM置き換えを実行
 */
export async function runReplace(): Promise<void> {
  if (!areBothDatasetsLoaded()) {
    alert('BOM A と BOM B の両方を読み込んでください。');
    return;
  }

  const parseA = datasetState.a.parseResult!;
  const parseB = datasetState.b.parseResult!;

  try {
    setProcessing(true, '置き換え中...');

    const merged = await updateAndAppendBoms(parseA, parseB);
    setMergedBom(merged);

    updateResultsSummary(`置き換え完了: ${merged.rows.length}行`);

    logActivity(`置き換え完了: ${merged.rows.length}行`);
    alert(`置き換えが完了しました。\n結果: ${merged.rows.length}行`);
  } catch (error) {
    console.error('Replace failed', error);
    alert(`置き換えに失敗しました: ${error}`);
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

/**
 * エクスポートボタンのイベントを登録
 */
export function registerExportButtons(): void {
  const resolveExportSource = (): ExportSource => {
    if (mergedBom) {
      return 'replacement';
    }
    if (currentDiffs && currentDiffs.length > 0) {
      return 'comparison';
    }
    if (datasetState.b.parseResult) {
      return 'bom_b';
    }
    if (datasetState.a.parseResult) {
      return 'bom_a';
    }
    return 'comparison';
  };

  const handlers: Array<[string, () => Promise<void> | void]> = [
    ['export-csv', () => exportToCSV(resolveExportSource())],
    ['export-csv-main', () => exportToCSV(resolveExportSource())],
    ['export-eco', () => exportToECO(resolveExportSource())],
    ['export-eco-main', () => exportToECO(resolveExportSource())],
    ['export-ccf', () => exportToCCF(resolveExportSource())],
    ['export-ccf-main', () => exportToCCF(resolveExportSource())],
    ['export-msf', () => exportToMSF(resolveExportSource())],
    ['export-msf-main', () => exportToMSF(resolveExportSource())]
  ];

  handlers.forEach(([id, handler]) => {
    const button = document.getElementById(id);
    button?.addEventListener('click', () => {
      void handler();
    });
  });
}

/**
 * 全イベントリスナーを登録
 */
export function registerAllEventHandlers(): void {
  // ファイル選択ボタン
  document.getElementById('select-bom-a')?.addEventListener('click', () => openFileDialog('a'));
  document.getElementById('select-bom-b')?.addEventListener('click', () => openFileDialog('b'));

  // 比較・置き換えボタン
  document.getElementById('run-compare')?.addEventListener('click', () => runComparison());
  document.getElementById('run-replace')?.addEventListener('click', () => runReplace());

  // 編集ボタン
  document.getElementById('edit-bom-a')?.addEventListener('click', () => openEditModal('a'));
  document.getElementById('edit-bom-b')?.addEventListener('click', () => openEditModal('b'));

  // 辞書管理ボタン
  document.getElementById('open-dictionary')?.addEventListener('click', () => openDictionaryModal());

  // エクスポートボタン
  registerExportButtons();

  // プロジェクト保存ボタン
  document.getElementById('manual-session-save-inline')?.addEventListener('click', () => saveProject());

  console.log('All event handlers registered');
}
