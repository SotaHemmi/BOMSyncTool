/**
 * プライマリアクションUI
 *
 * 主要な操作ボタンのイベントハンドラー登録
 */

import type { ParseResult } from '../types';
import { editModalState } from '../state/app-state';
import { setProcessing, logActivity, datasetLabel } from '../utils';
import { renderEditTable } from './edit-modal';
import { applyPreprocessing } from '../core/preprocessing';

/**
 * 比較実行関数（main.tsから提供される）
 */
declare function runCompare(): Promise<void>;

/**
 * 置換実行関数（main.tsから提供される）
 */
declare function runReplace(): Promise<void>;

/**
 * プロジェクト保存関数（main.tsから提供される）
 */
declare function saveProjectAs(name?: string): Promise<void>;

/**
 * 編集変更適用関数（main.tsから提供される）
 */
declare function applyEditChanges(): Promise<void>;

/**
 * 前処理パイプラインを適用
 */
export async function applyPreprocessPipeline(): Promise<void> {
  if (!editModalState) return;

  const expandRef = (document.getElementById('expand-reference') as HTMLInputElement)?.checked;
  const splitRef = (document.getElementById('split-reference-rows') as HTMLInputElement)?.checked;
  const fillBlank = (document.getElementById('fill-blank-cells') as HTMLInputElement)?.checked;
  const cleanse = (document.getElementById('cleanse-text-data') as HTMLInputElement)?.checked;
  const formatRules = (document.getElementById('apply-format-rules') as HTMLInputElement)?.checked;

  if (!expandRef && !splitRef && !fillBlank && !cleanse && !formatRules) {
    alert('前処理を選択してください。');
    return;
  }

  try {
    setProcessing(true, '前処理を適用中...');

    // 現在の作業中データをParseResult形式に変換
    const currentParseResult: ParseResult = {
      headers: editModalState.columns.map(col => col.name),
      rows: editModalState.workingRows,
      columns: editModalState.columns,
      guessed_columns: {},
      guessed_roles: {},
      row_numbers: editModalState.workingRows.map((_, i) => i + 1),
      structured_errors: [],
      column_roles: {},
      column_order: editModalState.columns.map(col => col.id),
      errors: []
    };

    // 前処理オプションを構築
    const options = {
      expandRef,
      splitRef,
      fillBlank,
      cleanse,
      formatRules,
      formatOptions: {
        use_strikethrough: false,
        use_cell_color: true
      }
    };

    // 前処理を実行
    const processed = await applyPreprocessing(currentParseResult, options);

    // 結果を反映
    editModalState.workingRows = processed.rows;
    renderEditTable();
    logActivity(`${datasetLabel(editModalState.dataset)} に前処理を適用しました。`);
  } catch (error: unknown) {
    console.error('Failed to apply preprocess', error);
    const message =
      typeof error === 'object' && error !== null && 'message' in error
        ? String((error as { message?: string }).message)
        : JSON.stringify(error);
    alert(`前処理の実行に失敗しました: ${message}`);
  } finally {
    setProcessing(false);
  }
}

/**
 * 検索置換を適用
 */
export function applyFindReplace(): void {
  if (!editModalState) return;

  const findInput = document.getElementById('find-text') as HTMLInputElement | null;
  const replaceInput = document.getElementById('replace-text') as HTMLInputElement | null;

  if (!findInput || !replaceInput) return;

  const findText = findInput.value;
  const replaceText = replaceInput.value;

  if (!findText) {
    alert('検索する文字列を入力してください。');
    return;
  }

  let replacedCount = 0;

  // エスケープ処理を行った正規表現パターンを作成
  const escapedPattern = findText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(escapedPattern, 'g');

  // 全てのセルの値を置換
  editModalState.workingRows.forEach((row) => {
    row.forEach((cell, colIndex) => {
      if (cell.includes(findText)) {
        row[colIndex] = cell.replace(regex, replaceText);
        replacedCount++;
      }
    });
  });

  if (replacedCount > 0) {
    renderEditTable();
    logActivity(`${replacedCount} 箇所で "${findText}" を "${replaceText}" に置換しました。`);
    alert(`${replacedCount} 箇所を置換しました。`);
  } else {
    alert('置換対象が見つかりませんでした。');
  }
}

/**
 * プライマリアクションボタンを登録
 */
export function registerPrimaryActions(): void {
  const compareButton = document.getElementById('run-compare');
  const replaceButton = document.getElementById('run-replace');
  const inlineSaveButton = document.getElementById('manual-session-save-inline');

  compareButton?.addEventListener('click', () => {
    if (typeof runCompare !== 'undefined') {
      void runCompare();
    }
  });

  replaceButton?.addEventListener('click', () => {
    if (typeof runReplace !== 'undefined') {
      void runReplace();
    }
  });

  inlineSaveButton?.addEventListener('click', () => {
    if (typeof saveProjectAs !== 'undefined') {
      void saveProjectAs();
    }
  });

  document.getElementById('apply-preprocess')?.addEventListener('click', () => {
    void applyPreprocessPipeline();
  });

  document.getElementById('apply-replace')?.addEventListener('click', () => {
    applyFindReplace();
  });

  document.getElementById('apply-edit')?.addEventListener('click', () => {
    if (typeof applyEditChanges !== 'undefined') {
      void applyEditChanges();
    }
  });

  // 前処理チェックボックスは特別なイベントリスナー不要（チェックボックスのstate自体で管理）
}
