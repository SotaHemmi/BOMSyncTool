/**
 * BOMデータ操作関連のユーティリティ関数
 */

import type { BomRow, ColumnRole } from '../types';

/**
 * 基本列セット
 */
const BASE_COLUMNS = new Set(['ref', 'part_no']);

/**
 * BomRow配列のディープコピー
 */
export function cloneRows(rows: BomRow[]): BomRow[] {
  return rows.map(row => ({
    ...row,
    attributes: row.attributes ? { ...row.attributes } : {}
  }));
}

/**
 * BomRowの配列から全ての列名を抽出
 * 基本列 + attributes内の全てのキー
 */
export function buildColumns(rows: BomRow[]): string[] {
  const attributeKeys = new Set<string>();
  rows.forEach(row => {
    Object.keys(row.attributes ?? {}).forEach(key => {
      if (!BASE_COLUMNS.has(key)) {
        attributeKeys.add(key);
      }
    });
  });
  return [...BASE_COLUMNS, ...attributeKeys];
}

/**
 * BomRowから指定された列の値を取得
 */
export function getCellValue(row: BomRow, column: string): string {
  switch (column) {
    case 'ref':
      return row.ref ?? '';
    case 'part_no':
      return row.part_no ?? '';
    default:
      return row.attributes?.[column] ?? '';
  }
}

/**
 * BomRowの指定された列に値を設定
 */
export function setCellValue(row: BomRow, column: string, value: string) {
  const trimmed = value.trim();
  switch (column) {
    case 'ref':
      row.ref = trimmed;
      break;
    case 'part_no':
      row.part_no = trimmed;
      break;
    default:
      if (!row.attributes) {
        row.attributes = {};
      }
      row.attributes[column] = trimmed;
  }
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
    normalized.startsWith('ref') && normalized.length <= 5
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

  // デフォルトは無視
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

/**
 * BomRowが空かどうかを判定
 * （全てのフィールドが空文字列の場合は空とみなす）
 */
export function isEmptyRow(row: BomRow): boolean {
  if (row.ref.trim() || row.part_no.trim()) {
    return false;
  }

  if (row.attributes) {
    for (const value of Object.values(row.attributes)) {
      if (value.trim()) {
        return false;
      }
    }
  }

  return true;
}

/**
 * BomRow配列から空行を除外
 */
export function removeEmptyRows(rows: BomRow[]): BomRow[] {
  return rows.filter(row => !isEmptyRow(row));
}
