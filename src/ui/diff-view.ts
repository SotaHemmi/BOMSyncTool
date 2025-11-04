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

type NormalizedStatus = 'added' | 'removed' | 'modified' | 'unchanged' | 'other';

const STATUS_LABELS: Record<NormalizedStatus, string> = {
  added: '追加',
  removed: '削除',
  modified: '変更',
  unchanged: '同一',
  other: '不明'
};

const STATUS_COLORS: Record<NormalizedStatus, string> = {
  added: '#166534',
  removed: '#b91c1c',
  modified: '#b45309',
  unchanged: '#64748b',
  other: '#475569'
};

const STATUS_NORMALIZE_MAP: Record<string, NormalizedStatus> = {
  added: 'added',
  '追加': 'added',
  removed: 'removed',
  '削除': 'removed',
  delete: 'removed',
  deleted: 'removed',
  modified: 'modified',
  modify: 'modified',
  change: 'modified',
  changed: 'modified',
  diff: 'modified',
  '変更': 'modified',
  unchanged: 'unchanged',
  same: 'unchanged',
  identical: 'unchanged',
  '同一': 'unchanged'
};

function normalizeStatus(status: string | undefined | null): NormalizedStatus {
  if (!status) return 'other';
  const key = status.toLowerCase();
  return STATUS_NORMALIZE_MAP[key] ?? 'other';
}

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
  let added = 0;
  let removed = 0;
  let modified = 0;

  diffs.forEach(diff => {
    switch (normalizeStatus(diff.status)) {
      case 'added':
        added += 1;
        break;
      case 'removed':
        removed += 1;
        break;
      case 'modified':
        modified += 1;
        break;
      default:
        break;
    }
  });

  const diffTotal = added + removed + modified;

  updateFilterCounts(diffTotal, added, removed, modified);

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
    const normalized = normalizeStatus(diff.status);
    statusCell.textContent = STATUS_LABELS[normalized] ?? diff.status ?? '-';
    const color = STATUS_COLORS[normalized];
    if (color) {
      statusCell.style.color = color;
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
    return diffs.filter(diff => normalizeStatus(diff.status) !== 'unchanged');
  }

  // 特定のステータスのみ
  const shouldInclude = (diff: DiffRow): boolean => {
    const normalized = normalizeStatus(diff.status);
    if (filter === 'added') return normalized === 'added';
    if (filter === 'removed') return normalized === 'removed';
    if (filter === 'changed') return normalized === 'modified';
    return true;
  };

  return diffs.filter(diff => shouldInclude(diff));
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
