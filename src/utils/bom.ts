/**
 * BOMデータ操作関連のユーティリティ関数
 */

import type { ParseResult, ColumnRole } from '../types';

// ============================================================================
// ParseResult ベースの新しいヘルパー関数
// ============================================================================

/**
 * 指定した役割の列インデックスを取得
 *
 * @param parseResult - パース結果
 * @param role - 役割名（"ref", "part_no", "manufacturer", "value" など）
 * @returns 列インデックスの配列
 */
export function getColumnIndices(parseResult: ParseResult, role: string): number[] {
  const columnIds = parseResult.column_roles[role] || [];
  return columnIds.map(id => {
    const match = id.match(/^col-(\d+)$/);
    return match ? parseInt(match[1], 10) : -1;
  }).filter(idx => idx >= 0);
}

/**
 * 列IDから元データ上の列インデックスを解決
 *
 * @param parseResult - パース結果
 * @param columnId - 列ID（例: "col-0", "status"）
 * @returns 対応する列インデックス（見つからない場合は -1）
 */
export function getColumnIndexById(parseResult: ParseResult, columnId: string): number {
  if (!columnId) {
    return -1;
  }

  const match = columnId.match(/^col-(\d+)$/);
  if (match) {
    const numericIndex = Number(match[1]);
    if (Number.isFinite(numericIndex)) {
      return numericIndex;
    }
  }

  const order = parseResult.column_order ?? [];
  const orderIndex = order.indexOf(columnId);
  if (orderIndex >= 0) {
    return orderIndex;
  }

  const columns = parseResult.columns ?? [];
  const metaIndex = columns.findIndex(column => column.id === columnId);
  if (metaIndex >= 0) {
    return metaIndex;
  }

  return -1;
}

/**
 * 指定した行と役割の値を取得（複数列の場合は最初の非空値）
 *
 * @param parseResult - パース結果
 * @param rowIndex - 行インデックス
 * @param role - 役割名
 * @returns 値（見つからない場合は空文字列）
 */
export function getValues(parseResult: ParseResult, rowIndex: number, role: string): string[] {
  const indices = getColumnIndices(parseResult, role);
  const row = parseResult.rows[rowIndex];
  if (!row) return [];

  return indices.map(idx => row[idx] || '').filter(v => v.trim() !== '');
}

/**
 * Reference値を取得
 *
 * @param parseResult - パース結果
 * @param rowIndex - 行インデックス
 * @returns Reference値（複数列の場合は最初の非空値）
 */
export function getRef(parseResult: ParseResult, rowIndex: number): string {
  const values = getValues(parseResult, rowIndex, 'ref');
  return values[0] || '';
}

/**
 * 部品型番を取得
 *
 * @param parseResult - パース結果
 * @param rowIndex - 行インデックス
 * @returns 部品型番（複数列の場合は最初の非空値）
 */
export function getPartNo(parseResult: ParseResult, rowIndex: number): string {
  const values = getValues(parseResult, rowIndex, 'part_no');
  return values[0] || '';
}

/**
 * メーカー名を取得
 *
 * @param parseResult - パース結果
 * @param rowIndex - 行インデックス
 * @returns メーカー名（複数列の場合は最初の非空値）
 */
export function getManufacturer(parseResult: ParseResult, rowIndex: number): string {
  const values = getValues(parseResult, rowIndex, 'manufacturer');
  return values[0] || '';
}

/**
 * Value値を取得
 *
 * @param parseResult - パース結果
 * @param rowIndex - 行インデックス
 * @returns Value値（複数列の場合は最初の非空値）
 */
export function getValue(parseResult: ParseResult, rowIndex: number): string {
  const values = getValues(parseResult, rowIndex, 'value');
  return values[0] || '';
}

/**
 * 指定した行の指定列の値を取得
 *
 * @param parseResult - パース結果
 * @param rowIndex - 行インデックス
 * @param columnIndex - 列インデックス
 * @returns セルの値
 */
export function getCellValue(parseResult: ParseResult, rowIndex: number, columnIndex: number): string {
  const row = parseResult.rows[rowIndex];
  return row?.[columnIndex] || '';
}

/**
 * 指定した行の指定列に値を設定
 *
 * @param parseResult - パース結果（ミュータブル操作）
 * @param rowIndex - 行インデックス
 * @param columnIndex - 列インデックス
 * @param value - 設定する値
 */
export function setCellValue(
  parseResult: ParseResult,
  rowIndex: number,
  columnIndex: number,
  value: string
): void {
  const row = parseResult.rows[rowIndex];
  if (!row) return;

  // 列が足りない場合は拡張
  while (row.length <= columnIndex) {
    row.push('');
  }

  row[columnIndex] = value.trim();
}

/**
 * 行が空かどうかを判定
 *
 * @param parseResult - パース結果
 * @param rowIndex - 行インデックス
 * @returns 全てのセルが空の場合true
 */
export function isEmptyRow(parseResult: ParseResult, rowIndex: number): boolean {
  const row = parseResult.rows[rowIndex];
  if (!row) return true;

  return row.every(cell => !cell.trim());
}

/**
 * ParseResultから空行を除外した新しいParseResultを返す
 *
 * @param parseResult - パース結果
 * @returns 空行が除外されたParseResult
 */
export function removeEmptyRows(parseResult: ParseResult): ParseResult {
  const nonEmptyIndices: number[] = [];
  parseResult.rows.forEach((_, idx) => {
    if (!isEmptyRow(parseResult, idx)) {
      nonEmptyIndices.push(idx);
    }
  });

  return {
    ...parseResult,
    rows: nonEmptyIndices.map(idx => parseResult.rows[idx]),
    row_numbers: nonEmptyIndices.map((_, newIdx) => newIdx + 1),
  };
}

/**
 * 列名からカラムロールを推測
 * （CSVパース時の列マッピング補助）
 */
export function guessColumnRole(columnName: string): ColumnRole {
  const normalized = normalizeColumnName(columnName);

  // Ref列判定
  if (
    normalized === 'ref' ||
    normalized === 'reference' ||
    normalized === 'refdesignator' ||
    normalized === 'designator' ||
    (normalized.startsWith('ref') && normalized.length <= 5)
  ) {
    return 'ref';
  }

  // Part No列判定
  if (
    normalized === 'partno' ||
    normalized === 'partnumber' ||
    normalized === 'partnr' ||
    normalized === 'part' ||
    normalized === 'mpn'
  ) {
    return 'part_no';
  }

  // Manufacturer列判定
  if (
    normalized === 'manufacturer' ||
    normalized === 'mfr' ||
    normalized === 'mfg' ||
    normalized === 'maker' ||
    normalized === 'vendor'
  ) {
    return 'manufacturer';
  }

  // その他の列は全て無視（value, package, quantity, remarksは廃止）
  return 'ignore';
}

/**
 * 列名の正規化（空白除去、小文字化）
 */
function normalizeColumnName(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, '');
}
