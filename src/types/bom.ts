/**
 * BOM（部品表）関連の型定義
 */

/**
 * 列メタデータ
 */
export interface ColumnMeta {
  id: string;
  name: string;
}

/**
 * パースエラー情報
 */
export interface ParseError {
  message: string;
  row?: number;
  column?: number;
  severity: 'error' | 'warning' | 'info';
}

/**
 * パース結果
 *
 * 重要な変更点：
 * - BomRow型は完全に削除されました
 * - データは rows（生データ）+ column_roles（列役割マッピング）のみで管理
 * - 複数列が同じ役割を持つことが可能（例：Ref1, Ref2 → 両方"ref"役割）
 * - column_orderで表示順序を制御
 */
export interface ParseResult {
  /** 生データ（CSV/Excelの行データそのまま） */
  rows: string[][];

  /** 列役割マッピング: role名 → column ID配列（複数列対応） */
  column_roles: Record<string, string[]>;

  /** 列の表示順序（column IDのリスト） */
  column_order: string[];

  /** @deprecated 後方互換用 - column_rolesを使用してください */
  guessed_columns?: Record<string, number>;

  /** @deprecated 後方互換用 - column_rolesを使用してください */
  guessed_roles?: Record<string, string>;

  /** エラーメッセージリスト */
  errors: string[];

  /** ヘッダー行 */
  headers: string[];

  /** 列メタデータ */
  columns: ColumnMeta[];

  /** 行番号リスト */
  row_numbers: number[];

  /** 構造化エラー情報 */
  structured_errors?: ParseError[];
}

/**
 * 列役割の種類（4種類に統一）
 */
export type ColumnRole = 'ref' | 'part_no' | 'manufacturer' | 'ignore';
