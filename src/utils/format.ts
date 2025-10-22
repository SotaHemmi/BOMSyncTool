/**
 * フォーマット関連のユーティリティ関数
 */

import type { DatasetKey, ColumnRole } from '../types';

/**
 * 日付をラベル形式にフォーマット
 */
export function formatDateLabel(dateIso: string | null): string {
  if (!dateIso) {
    return '未更新';
  }
  const date = new Date(dateIso);
  return `${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;
}

/**
 * Dataset キーをラベルに変換
 */
export function datasetLabel(dataset: DatasetKey): string {
  return dataset === 'a' ? 'BOM A' : 'BOM B';
}

/**
 * トークンを正規化（空白削除、小文字化）
 */
export function normalizeToken(value: string): string {
  return value.replace(/\s+/g, '').toLowerCase();
}

/**
 * 列名から役割を推測
 */
export function guessRoleFromColumnName(column: string): ColumnRole {
  const token = normalizeToken(column);
  if (column === 'ref' || token.includes('ref') || token.includes('部品番号')) {
    return 'ref';
  }
  if (column === 'part_no' || token.includes('partno') || token.includes('品番') || token.includes('型番')) {
    return 'part_no';
  }
  if (
    token.includes('manufacturer') ||
    token.includes('maker') ||
    token.includes('vendor') ||
    token.includes('supplier') ||
    token.includes('メーカー')
  ) {
    return 'manufacturer';
  }
  return 'ignore';
}

/**
 * 列名の表示名を取得
 */
export function displayNameForColumn(column: string): string {
  switch (column) {
    case 'ref':
      return 'Ref（部品番号）';
    case 'part_no':
      return 'Part No（部品型番）';
    case 'value':
      return 'Value';
    case 'comment':
      return 'コメント';
    case 'manufacturer':
      return 'メーカー名';
    default:
      return column;
  }
}

/**
 * JSONを整形してstringifyする
 */
export function stringifyJSON(content: string): string {
  try {
    return JSON.stringify(JSON.parse(content), null, 2);
  } catch {
    return content;
  }
}
