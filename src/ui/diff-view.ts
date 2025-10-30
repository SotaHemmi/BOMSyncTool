/**
 * 差分表示UI
 *
 * BOM比較結果の差分テーブル表示とフィルタリング
 */

import type { DiffRow } from '../types';
import { datasetState, currentDiffs } from '../state/app-state';
import { getPartNo } from '../utils';

/**
 * フィルタータイプ
 */
export type FilterType = 'all' | 'diff' | 'added' | 'removed' | 'changed';

/**
 * 現在のフィルター状態
 */
let currentFilter: FilterType = 'diff';

/**
 * 差分テーブルをレンダリング
 *
 * @param diffs - 差分データ
 */
export function renderDiffTable(diffs: DiffRow[]): void {
  const diffResultContainer = document.getElementById('diff-result');
  const resultsPanel = document.getElementById('results-panel');
  const resultsActions = document.getElementById('results-actions');
  const filterControls = document.getElementById('results-filter-controls');

  if (!diffResultContainer) return;

  if (resultsPanel) {
    resultsPanel.hidden = false;
  }

  diffResultContainer.innerHTML = '';

  if (diffs.length === 0) {
    diffResultContainer.innerHTML = '<p style="padding: 16px; text-align: center; color: #61748f;">差分は検出されませんでした。</p>';
    diffResultContainer.hidden = false;
    if (resultsActions) resultsActions.hidden = true;
    if (filterControls) filterControls.hidden = true;
    return;
  }

  // カウントを更新
  const added = diffs.filter(diff => diff.status === '追加').length;
  const removed = diffs.filter(diff => diff.status === '削除').length;
  const changed = diffs.filter(diff => diff.status === '変更').length;
  const total = added + removed + changed;

  updateFilterCounts(total, added, removed, changed);

  // フィルターを適用
  const filteredDiffs = applyFilter(diffs, currentFilter);

  if (filteredDiffs.length === 0) {
    diffResultContainer.innerHTML = '<p style="padding: 16px; text-align: center; color: #61748f;">フィルター条件に一致する項目がありません。</p>';
    diffResultContainer.hidden = false;
    if (resultsActions) resultsActions.hidden = false;
    if (filterControls) filterControls.hidden = false;
    return;
  }

  // テーブルを作成
  const table = document.createElement('table');
  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');
  ['ステータス', 'Ref', 'A: 部品型番', 'B: 部品型番', '変更詳細'].forEach(title => {
    const th = document.createElement('th');
    th.textContent = title;
    headerRow.appendChild(th);
  });
  thead.appendChild(headerRow);

  const tbody = document.createElement('tbody');
  const parseA = datasetState.a.parseResult;
  const parseB = datasetState.b.parseResult;

  filteredDiffs.forEach(diff => {
    const tr = document.createElement('tr');

    // ステータス列
    const statusCell = document.createElement('td');
    statusCell.textContent = diff.status;
    if (diff.status === '追加') {
      statusCell.style.color = '#166534';
    } else if (diff.status === '削除') {
      statusCell.style.color = '#b91c1c';
    } else if (diff.status === '変更') {
      statusCell.style.color = '#b45309';
    }
    tr.appendChild(statusCell);

    // Ref列
    const refCell = document.createElement('td');
    refCell.textContent = diff.ref_value || '-';
    tr.appendChild(refCell);

    // A: 部品型番列
    const partACell = document.createElement('td');
    if (diff.a_index !== null && parseA) {
      partACell.textContent = getPartNo(parseA, diff.a_index);
    } else {
      partACell.textContent = '-';
    }
    tr.appendChild(partACell);

    // B: 部品型番列
    const partBCell = document.createElement('td');
    if (diff.b_index !== null && parseB) {
      partBCell.textContent = getPartNo(parseB, diff.b_index);
    } else {
      partBCell.textContent = '-';
    }
    tr.appendChild(partBCell);

    // 変更詳細列
    const detailCell = document.createElement('td');
    if (diff.changed_columns && diff.changed_columns.length > 0) {
      detailCell.textContent = diff.changed_columns.join(', ');
      detailCell.style.fontSize = '0.9em';
      detailCell.style.color = '#666';
    } else {
      detailCell.textContent = '-';
    }
    tr.appendChild(detailCell);

    tbody.appendChild(tr);
  });

  table.appendChild(thead);
  table.appendChild(tbody);
  diffResultContainer.appendChild(table);
  diffResultContainer.hidden = false;

  // 出力ボタンを表示
  if (resultsActions) resultsActions.hidden = false;

  // フィルターコントロールを表示
  if (filterControls) filterControls.hidden = false;
}

/**
 * フィルターを適用
 *
 * @param diffs - 差分データ
 * @param filter - フィルタータイプ
 * @returns フィルタリングされた差分データ
 */
function applyFilter(diffs: DiffRow[], filter: FilterType): DiffRow[] {
  if (filter === 'all') {
    // 全件表示（同一も含む）
    return diffs;
  }

  if (filter === 'diff') {
    // 全ての差分（追加+削除+変更）
    return diffs.filter(diff => diff.status !== '同一');
  }

  // 特定のステータスのみ
  const statusMap: Record<string, string> = {
    added: '追加',
    removed: '削除',
    changed: '変更'
  };

  return diffs.filter(diff => diff.status === statusMap[filter]);
}

/**
 * フィルターカウントを更新
 *
 * @param total - 全差分数
 * @param added - 追加数
 * @param removed - 削除数
 * @param changed - 変更数
 */
function updateFilterCounts(total: number, added: number, removed: number, changed: number): void {
  const countTotal = document.getElementById('count-total');
  const countAdded = document.getElementById('count-added');
  const countRemoved = document.getElementById('count-removed');
  const countChanged = document.getElementById('count-changed');

  if (countTotal) countTotal.textContent = String(total);
  if (countAdded) countAdded.textContent = String(added);
  if (countRemoved) countRemoved.textContent = String(removed);
  if (countChanged) countChanged.textContent = String(changed);
}

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
 * 差分結果をクリア
 */
export function clearDiffResults(): void {
  const diffResultContainer = document.getElementById('diff-result');
  const resultsPanel = document.getElementById('results-panel');
  const resultsSummary = document.getElementById('results-summary');
  const resultsActions = document.getElementById('results-actions');

  if (diffResultContainer) {
    diffResultContainer.innerHTML = '';
    diffResultContainer.hidden = true;
  }

  if (resultsPanel) {
    resultsPanel.hidden = true;
  }

  if (resultsSummary) {
    resultsSummary.textContent = '結果がまだありません。比較または置き換えを実行してください。';
  }

  if (resultsActions) {
    resultsActions.hidden = true;
  }
}

/**
 * 結果サマリーを更新
 *
 * @param message - サマリーメッセージ
 */
export function updateResultsSummary(message: string): void {
  const resultsSummary = document.getElementById('results-summary');
  if (resultsSummary) {
    resultsSummary.textContent = message;
  }
}
