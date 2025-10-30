/**
 * 結果ビューUI
 *
 * 比較結果のフィルター表示とアクション
 */

import { currentDiffs } from '../state/app-state';
import { renderDiffTable } from './diff-view';

/**
 * フィルタータイプ
 */
export type FilterType = 'all' | 'diff' | 'added' | 'removed' | 'changed';

/**
 * 現在のフィルター状態
 */
let currentFilter: FilterType = 'diff';

/**
 * アクティブフィルターを設定
 *
 * @param filter - フィルタータイプ
 */
export function setActiveFilter(filter: FilterType): void {
  currentFilter = filter;

  // ボタンの状態を更新
  const buttons = document.querySelectorAll('.filter-button');
  buttons.forEach(btn => {
    btn.classList.remove('is-active');
  });

  const activeButton = document.getElementById(`filter-${filter}`);
  if (activeButton) {
    activeButton.classList.add('is-active');
  }

  // テーブルを再描画
  renderDiffTable(currentDiffs);
}

/**
 * 現在のフィルターを取得
 *
 * @returns 現在のフィルタータイプ
 */
export function getCurrentFilter(): FilterType {
  return currentFilter;
}

/**
 * 結果ビューボタンを登録
 */
export function registerResultsViewButtons(): void {
  // フィルターボタン
  document.getElementById('filter-all')?.addEventListener('click', () => {
    setActiveFilter('all');
  });

  document.getElementById('filter-diff')?.addEventListener('click', () => {
    setActiveFilter('diff');
  });

  document.getElementById('filter-added')?.addEventListener('click', () => {
    setActiveFilter('added');
  });

  document.getElementById('filter-removed')?.addEventListener('click', () => {
    setActiveFilter('removed');
  });

  document.getElementById('filter-changed')?.addEventListener('click', () => {
    setActiveFilter('changed');
  });

  // 印刷ボタン
  document.getElementById('print-results')?.addEventListener('click', () => {
    // 印刷機能は src-tauri/capabilities/default.json に core:webview:allow-print を付与して利用
    window.print();
  });
}
