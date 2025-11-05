/**
 * データ操作ユーティリティ
 */

/**
 * 行データを深くクローン
 * @param rows クローン対象の2次元配列
 * @returns クローンされた2次元配列
 */
export function cloneRows(rows: string[][]): string[][] {
  return rows.map(row => [...row]);
}

/**
 * 浅いクローン（参照を共有しない最低限のコピー）
 * パフォーマンスが重要な場合に使用
 */
export function shallowCloneRows(rows: string[][]): string[][] {
  return [...rows];
}
