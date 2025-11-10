/**
 * データセット表示UI
 *
 * BOMデータセット（A/B）のプレビュー表示とドロップゾーン管理
 */

import type { DatasetKey, ParseResult, ColumnMeta } from '../types';
import { datasetState } from '../state/app-state';

/**
 * プレビューテーブルを作成
 *
 * @param parseResult - BOMデータ
 * @param maxRows - 最大表示行数
 * @returns テーブル要素
 */
export function createPreviewTable(
  parseResult: ParseResult,
  maxRows = 8
): HTMLTableElement {
  const table = document.createElement('table');
  const thead = document.createElement('thead');
  const tbody = document.createElement('tbody');

  // ヘッダー行
  const headerRow = document.createElement('tr');
  parseResult.headers.forEach(header => {
    const th = document.createElement('th');
    th.textContent = header;
    headerRow.appendChild(th);
  });
  thead.appendChild(headerRow);

  // データ行
  const displayRows = parseResult.rows.slice(0, maxRows);
  displayRows.forEach((row, rowIndex) => {
    const tr = document.createElement('tr');
    const actualRowNumber = parseResult.row_numbers?.[rowIndex] ?? rowIndex + 1;

    row.forEach((cellValue, colIndex) => {
      const td = document.createElement('td');
      td.textContent = cellValue || '';

      // エラーハイライト
      if (parseResult.structured_errors) {
        const cellErrors = parseResult.structured_errors.filter(
          err => err.row === actualRowNumber && err.column === colIndex
        );
        if (cellErrors.length > 0) {
          const severity = cellErrors[0].severity;
          td.classList.add('cell-with-error');
          td.classList.add(`cell-${severity}`);
          td.title = cellErrors.map(e => e.message).join('\n');
        }
      }

      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });

  // 省略メッセージ
  if (parseResult.rows.length > maxRows) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = parseResult.headers.length;
    td.textContent = `... 他 ${parseResult.rows.length - maxRows} 行`;
    td.style.textAlign = 'center';
    td.style.fontStyle = 'italic';
    tr.appendChild(td);
    tbody.appendChild(tr);
  }

  table.appendChild(thead);
  table.appendChild(tbody);
  return table;
}

function resolveColumns(parseResult: ParseResult): ColumnMeta[] {
  if (parseResult.columns && parseResult.columns.length > 0) {
    return parseResult.columns;
  }
  const headers = parseResult.headers && parseResult.headers.length > 0
    ? parseResult.headers
    : Array.from({ length: parseResult.rows[0]?.length ?? 0 }, (_, index) => `Column ${index + 1}`);

  const columns = headers.map((name, index) => ({
    id: parseResult.column_order?.[index] ?? `col-${index}`,
    name
  }));

  parseResult.columns = columns;
  if (!parseResult.column_order || parseResult.column_order.length === 0) {
    parseResult.column_order = columns.map(column => column.id);
  }
  if (!parseResult.headers || parseResult.headers.length === 0) {
    parseResult.headers = headers;
  }
  return columns;
}

function getColumnIndex(parseResult: ParseResult, columnId: string): number {
  const order = parseResult.column_order ?? [];
  const idx = order.indexOf(columnId);
  if (idx >= 0) {
    return idx;
  }
  if (parseResult.columns) {
    const index = parseResult.columns.findIndex(column => column.id === columnId);
    if (index >= 0) {
      return index;
    }
  }
  return -1;
}

export function createDatasetPreviewTable(dataset: DatasetKey, maxRows = 6): HTMLTableElement | null {
  const state = datasetState[dataset];
  const parseResult = state.parseResult;
  if (!parseResult || parseResult.rows.length === 0) {
    return null;
  }

  const columns = resolveColumns(parseResult);
  const structuredErrors = parseResult.structured_errors ?? [];
  const rowNumbers = parseResult.row_numbers ?? [];

  const table = document.createElement('table');
  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');
  columns.forEach(column => {
    const th = document.createElement('th');
    th.textContent = column.name;
    headerRow.appendChild(th);
  });
  thead.appendChild(headerRow);

  const tbody = document.createElement('tbody');
  const displayRows = parseResult.rows.slice(0, maxRows);
  displayRows.forEach((row, rowIndex) => {
    const tr = document.createElement('tr');
    const actualRowNumber = rowNumbers[rowIndex] ?? rowIndex + 1;

    columns.forEach(column => {
      const td = document.createElement('td');
      const dataIndex = getColumnIndex(parseResult, column.id);
      const cellValue = dataIndex >= 0 ? row[dataIndex] ?? '' : '';
      td.textContent = cellValue;

      const cellErrors = structuredErrors.filter(
        error => error.row === actualRowNumber && error.column === dataIndex
      );
      if (cellErrors.length > 0) {
        const severity = cellErrors[0].severity;
        td.classList.add('cell-with-error');
        td.classList.add(`cell-${severity}`);
        td.title = cellErrors.map(error => error.message).join('\n');
      }

      tr.appendChild(td);
    });

    tbody.appendChild(tr);
  });

  if (parseResult.rows.length > maxRows) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = columns.length;
    td.textContent = `... 他 ${parseResult.rows.length - maxRows} 行`;
    td.style.textAlign = 'center';
    td.style.fontStyle = 'italic';
    tr.appendChild(td);
    tbody.appendChild(tr);
  }

  table.appendChild(thead);
  table.appendChild(tbody);
  return table;
}

/**
 * データセットプレビューカードを更新
 *
 * @param dataset - データセットキー（'a' または 'b'）
 */
export function updatePreviewCard(dataset: DatasetKey): void {
  const state = datasetState[dataset];
  const card = document.querySelector(`[data-dataset="${dataset}"]`);
  if (!card) return;

  const previewContainer = card.querySelector('.preview-container');
  if (!previewContainer) return;

  // 既存のプレビューをクリア
  previewContainer.innerHTML = '';

  if (state.parseResult) {
    const table = createDatasetPreviewTable(dataset, 6) ?? createPreviewTable(state.parseResult, 6);
    previewContainer.appendChild(table);

    // 統計情報を表示
    const stats = document.createElement('div');
    stats.className = 'preview-stats';
    stats.textContent = `${state.parseResult.rows.length}行 × ${state.parseResult.headers.length}列`;
    previewContainer.appendChild(stats);
  }
}

/**
 * ドロップゾーンの表示を更新
 * 
 * @deprecated React hooks が自動的に再レンダリングするため、この関数は不要です
 * @param dataset - データセットキー
 */
export function updateDropzone(_dataset: DatasetKey): void {
  // React hooks が状態変更を検知して自動更新するため、何もしない
}

/**
 * プレビュー空状態を同期
 */
export function syncPreviewEmptyState(): void {
  const message = document.getElementById('preview-empty-message');
  const grid = document.querySelector<HTMLElement>('.preview-grid');
  if (!message) return;

  const hasData = Boolean(datasetState.a.parseResult) || Boolean(datasetState.b.parseResult);
  message.hidden = hasData;
  if (grid) {
    grid.hidden = !hasData;
  }
}

/**
 * 両方のデータセットカードを更新
 */
export function updateAllDatasetCards(): void {
  updatePreviewCard('a');
  updatePreviewCard('b');
  // updateDropzone は React hooks が自動的に再レンダリングするため不要
  syncPreviewEmptyState();
}

/**
 * データセットラベルを取得
 *
 * @param dataset - データセットキー
 * @returns 表示用ラベル
 */
export function getDatasetLabel(dataset: DatasetKey): string {
  return dataset === 'a' ? 'BOM A' : 'BOM B';
}
